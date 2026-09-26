"""OneSplatt local studio. Run with the supplied START-WEBAPP.cmd."""
from __future__ import annotations
import atexit
import json
import math
import mimetypes
import os
from pathlib import Path
import struct
import subprocess
import threading
import time

import numpy as np
from fastapi import FastAPI, File, UploadFile, Body, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
import uvicorn

import engine as e

app = FastAPI(title="OneSplatt Studio", docs_url=None, redoc_url=None)
EXPORTS = {}
EXPORT_LOCK = threading.Lock()
ALLOWED = {"image": {".png", ".jpg", ".jpeg", ".webp"}, "video": {".mp4", ".mov", ".webm", ".mkv"},
           "music": {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}, "splat": {".ply", ".splat", ".spz", ".ksplat"}}


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("x-onesplatt") != "studio":
            return JSONResponse({"detail": "Lokale Studio-Anfrage erforderlich"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in ("http://127.0.0.1:8765", "http://localhost:8765", "http://127.0.0.1:5173", "http://localhost:5173"):
            return JSONResponse({"detail": "Unbekannte Herkunft"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(ValueError)
async def value_error(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(RuntimeError)
async def runtime_error(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=409)


def ffmpeg():
    return str(e.ROOT / e.CONFIG["ffmpeg"]) if not Path(e.CONFIG["ffmpeg"]).is_absolute() else e.CONFIG["ffmpeg"]


def audio_analysis(path):
    cache = path.with_suffix(path.suffix + ".analysis.json")
    if cache.exists():
        return json.loads(cache.read_text())
    completed = subprocess.run([ffmpeg(), "-v", "error", "-nostdin", "-i", str(path), "-t", "600", "-vn", "-ac", "1", "-ar", "16000",
                                "-f", "f32le", "pipe:1"], capture_output=True, timeout=120, creationflags=e.CREATION_FLAGS)
    if completed.returncode:
        raise ValueError("Musik konnte nicht gelesen werden: " + completed.stderr.decode(errors="replace")[-500:])
    samples = np.frombuffer(completed.stdout, dtype="<f4")
    if len(samples) < 1600:
        raise ValueError("Die Audiodatei ist leer oder zu kurz")
    rate, fps, size = 16000, 60, 2048
    freqs = np.fft.rfftfreq(size, 1 / rate)
    bands = [(freqs >= lo) & (freqs < hi) for lo, hi in [(25, 200), (200, 2200), (2200, 8000)]]
    pad = np.pad(samples, (size // 2, size))
    window = np.hanning(size)
    values = []
    for i in range(math.ceil(len(samples) / rate * fps)):
        frame = pad[round(i * rate / fps):round(i * rate / fps) + size]
        spectrum = abs(np.fft.rfft(frame * window)) ** 2
        values.append([np.sqrt(np.mean(frame ** 2)), *[np.sqrt(np.mean(spectrum[b])) for b in bands]])
    values = np.asarray(values)
    denom = np.maximum(np.quantile(values, .98, axis=0), 1e-7)
    values = np.clip(values / denom, 0, 1)
    # Fixed-time envelope smoothing makes preview and offline exports agree.
    for i in range(1, len(values)):
        factor = np.where(values[i] > values[i - 1], .65, .16)
        values[i] = values[i - 1] + factor * (values[i] - values[i - 1])
    pulse = np.maximum(0, np.diff(values[:, 1], prepend=0))
    pulse /= max(float(np.quantile(pulse, .95)), 1e-7)
    pulse = np.clip(pulse, 0, 1)
    for i in range(1, len(pulse)):
        pulse[i] = max(pulse[i], pulse[i - 1] * .82)
    waveform = [float(np.sqrt(np.mean(a ** 2))) for a in np.array_split(samples, min(480, len(samples)))]
    peak = max(max(waveform), 1e-7)
    result = {"fps": fps, "duration": len(samples) / rate, "waveform": [round(x / peak, 4) for x in waveform],
              **{name: np.round(values[:, i], 4).tolist() for i, name in enumerate(["energy", "bass", "mid", "high"])},
              "pulse": np.round(pulse, 4).tolist()}
    e.write_json(cache, result)
    return result


@app.get("/api/bootstrap")
def bootstrap():
    config = {k: bool((e.ROOT / str(v)).is_file()) for k, v in e.CONFIG.items() if k in ("ffmpeg", "ffprobe", "colmap", "brush", "sam3_python")}
    config["sam3_model"] = (e.ROOT / "tools/sam3-model/model.safetensors").is_file()
    graph = e.workflow()
    return {"projects": e.projects(), "jobs": list(e.JOBS.values()), "tools": config,
            "workflow": {"name": "360_subject.json", "nodes": len(graph), "prompt": graph["105:104"]["inputs"]["prompt"],
                         "formats": e.workflow_video_formats(graph)}}


@app.post("/api/projects")
def create_project(body: dict = Body(...)):
    return e.create_project(body.get("name"))


@app.get("/api/projects/{project_id}")
def project(project_id: str):
    return e.get_project(project_id)


@app.put("/api/projects/{project_id}")
def save_project(project_id: str, body: dict = Body(...)):
    with e.LOCK:
        p = e.get_project(project_id)
        if "name" in body:
            p["name"] = str(body["name"])[:100]
        if "settings" in body:
            if len(json.dumps(body["settings"])) > 100000:
                raise ValueError("Zu viele Projekteinstellungen")
            p["settings"] = body["settings"]
        e.save_project(p)
        return p


@app.post("/api/projects/{project_id}/upload/{kind}")
def upload(project_id: str, kind: str, file: UploadFile = File(...)):
    p = e.get_project(project_id)
    suffix = Path(file.filename or "").suffix.lower()
    if kind not in ALLOWED or suffix not in ALLOWED[kind]:
        raise ValueError("Dieses Dateiformat wird hier nicht unterstützt")
    folder = e.project_path(project_id).parent / "assets"
    folder.mkdir(exist_ok=True)
    path = folder / (e.ident() + suffix)
    size = 0
    try:
        with path.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > 4 * 1024**3:
                    raise ValueError("Die Datei ist größer als 4 GB")
                out.write(chunk)
        if not size:
            raise ValueError("Die Datei ist leer")
        if kind == "image":
            with Image.open(path) as image:
                image.verify()
        extra = {}
        if kind == "music":
            extra["duration"] = audio_analysis(path)["duration"]
        return e.add_asset(project_id, path, kind, Path(file.filename).name, **extra)
    except Exception:
        # Only this newly-created upload can be removed.
        path.unlink(missing_ok=True)
        raise


@app.get("/api/projects/{project_id}/assets/{asset_id}")
def file_asset(project_id: str, asset_id: str, download: bool = False):
    a = e.asset_by_id(e.get_project(project_id), asset_id)
    return FileResponse(e.asset_path(a), filename=a["name"] if download else None)


@app.get("/api/projects/{project_id}/assets/{asset_id}/preview")
def preview_asset(project_id: str, asset_id: str):
    a = e.asset_by_id(e.get_project(project_id), asset_id)
    if "preview" not in a:
        raise HTTPException(404)
    return FileResponse(e.asset_path({"path": a["preview"]}), headers={"Cache-Control": "no-cache"})


@app.get("/api/projects/{project_id}/assets/{asset_id}/analysis")
def analyze(project_id: str, asset_id: str):
    a = e.asset_by_id(e.get_project(project_id), asset_id, "music")
    return audio_analysis(e.asset_path(a))


@app.get("/api/comfy/status")
def comfy_status(url: str = "http://127.0.0.1:8188"):
    return e.comfy_status(url)


@app.post("/api/projects/{project_id}/jobs/{kind}")
def job_start(project_id: str, kind: str, body: dict = Body(...)):
    if kind not in ("generate", "reconstruct"):
        raise ValueError("Unbekannter Arbeitsschritt")
    if not 24 <= int(body.get("maxFrames", 180)) <= 720 or not 100 <= int(body.get("steps", 30000)) <= 100000:
        raise ValueError("Frames: 24–720; Trainingsschritte: 100–100000")
    return e.start_job(project_id, kind, body)


@app.get("/api/jobs")
def jobs():
    with e.LOCK:
        return list(e.JOBS.values())


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    if job_id not in e.CANCEL:
        raise ValueError("Kein laufender Auftrag")
    e.CANCEL[job_id].set()
    return {"ok": True}


@app.get("/api/jobs/{job_id}/log")
def job_log(job_id: str):
    if job_id not in e.JOBS:
        raise HTTPException(404)
    path = e.ROOT / e.JOBS[job_id]["log"]
    text = path.read_text(encoding="utf-8", errors="replace")[-18000:] if path.exists() else ""
    return {"text": text}


@app.get("/api/jobs/{job_id}/previews")
def job_previews(job_id: str):
    job = e.JOBS.get(job_id, {})
    if not job.get("run"):
        return []
    run = e.ROOT / job["run"]
    images = [("Frames", p) for p in sorted((run / "preview").glob("*.jpg"))]
    images += [("SAM3-Masken", p) for p in sorted(run.glob("sam3-*/contact-sheets/*.jpg"))]
    return [{"name": name, "url": f"/api/jobs/{job_id}/previews/{i}"} for i, (name, p) in enumerate(images)]


@app.get("/api/jobs/{job_id}/previews/{index}")
def job_preview_image(job_id: str, index: int):
    job = e.JOBS.get(job_id, {})
    if not job.get("run"):
        raise HTTPException(404)
    run = e.ROOT / job["run"]
    images = sorted((run / "preview").glob("*.jpg")) + sorted(run.glob("sam3-*/contact-sheets/*.jpg"))
    if not 0 <= index < len(images):
        raise HTTPException(404)
    return FileResponse(images[index])


@app.post("/api/projects/{project_id}/exports")
def begin_export(project_id: str, body: dict = Body(...)):
    p = e.get_project(project_id)
    width, height, fps = int(body["width"]), int(body["height"]), int(body["fps"])
    duration = float(body["duration"])
    if not math.isfinite(duration) or not 0.5 <= duration <= 180:
        raise ValueError("Exportdauer muss zwischen 0,5 und 180 Sekunden liegen")
    if width % 2 or height % 2 or not 240 <= width <= 3840 or not 240 <= height <= 3840 or width * height > 3840 * 2160 or fps not in (24, 30, 60):
        raise ValueError("Ungültige Exportauflösung oder Bildrate")
    music = e.asset_by_id(p, body["musicId"], "music") if body.get("musicId") else None
    offset = float(body.get("audioOffset", 0))
    volume = float(body.get("volume", 1))
    if not math.isfinite(offset) or not 0 <= offset <= 600 or not math.isfinite(volume) or not 0 <= volume <= 1:
        raise ValueError("Ungültige Audioeinstellungen")
    with EXPORT_LOCK:
        if any(x["status"] in ("rendering", "encoding") for x in EXPORTS.values()):
            raise ValueError("Ein Export läuft bereits")
        export_id = e.ident()
        folder = e.project_path(project_id).parent / "exports" / export_id
        folder.mkdir(parents=True)
        log = (folder / "ffmpeg.log").open("wb")
        command = [ffmpeg(), "-v", "warning", "-nostdin", "-n", "-f", "image2pipe", "-framerate", str(fps), "-i", "pipe:0", "-an",
                   "-c:v", "libx264", "-preset", "fast", "-crf", str(int(body.get("crf", 18))), "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(folder / "silent.mp4")]
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=log, stderr=log, creationflags=e.CREATION_FLAGS)
        EXPORTS[export_id] = {"id": export_id, "projectId": project_id, "status": "rendering", "process": proc, "log": log,
            "folder": folder, "next": 0, "frames": round(duration * fps), "fps": fps, "width": width, "height": height,
            "music": music, "offset": offset, "volume": volume, "lock": threading.Lock()}
        e.write_json(folder / "settings.json", body)
    return {"id": export_id, "frames": round(duration * fps)}


def export_state(export_id):
    if export_id not in EXPORTS:
        raise ValueError("Export nicht gefunden")
    return EXPORTS[export_id]


@app.post("/api/exports/{export_id}/frames/{index}")
async def export_frame(export_id: str, index: int, request: Request):
    export = export_state(export_id)
    if export["status"] != "rendering" or index != export["next"] or index >= export["frames"]:
        raise ValueError("Exportframe außerhalb der Reihenfolge")
    data = await request.body()
    if len(data) > 32 * 1024**2 or data[:8] != b"\x89PNG\r\n\x1a\n" or len(data) < 24:
        raise ValueError("Ungültiger PNG-Frame")
    if struct.unpack(">II", data[16:24]) != (export["width"], export["height"]):
        raise ValueError("Die Frame-Auflösung stimmt nicht mit dem Export überein")
    # Pipe writes may block while FFmpeg encodes; keep them off the event loop.
    import asyncio
    def push():
        with export["lock"]:
            if export["status"] != "rendering" or index != export["next"]:
                raise ValueError("Export wurde geändert")
            try:
                export["process"].stdin.write(data)
                export["process"].stdin.flush()
            except (BrokenPipeError, OSError):
                export["status"] = "failed"
                raise RuntimeError("FFmpeg wurde beendet. Exportprotokoll prüfen.")
            export["next"] += 1
    await asyncio.to_thread(push)
    return {"received": export["next"]}


@app.post("/api/exports/{export_id}/finish")
def finish_export(export_id: str):
    x = export_state(export_id)
    with x["lock"]:
        if x["status"] != "rendering" or x["next"] != x["frames"]:
            raise ValueError("Der Export ist noch nicht vollständig")
        x["status"] = "encoding"
        try:
            x["process"].stdin.close()
            if x["process"].wait(timeout=180):
                raise RuntimeError("FFmpeg konnte das Video nicht fertigstellen")
            final = x["folder"] / "OneSplatt-film.mp4"
            if x["music"]:
                args = [ffmpeg(), "-v", "error", "-nostdin", "-n", "-i", str(x["folder"] / "silent.mp4"),
                        "-ss", str(x["offset"]), "-i", str(e.asset_path(x["music"])), "-map", "0:v:0", "-map", "1:a:0",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-af", f"volume={x['volume']},apad",
                        "-t", str(x["frames"] / x["fps"]), "-movflags", "+faststart", str(final)]
                result = subprocess.run(args, capture_output=True, timeout=180, creationflags=e.CREATION_FLAGS)
                if result.returncode:
                    raise RuntimeError(result.stderr.decode(errors="replace")[-1000:])
            else:
                (x["folder"] / "silent.mp4").replace(final)
            a = e.add_asset(x["projectId"], final, "export", "OneSplatt-film.mp4", frames=x["frames"], fps=x["fps"])
            x["status"] = "completed"
            return a
        except Exception:
            x["status"] = "failed"
            e.stop_process(x["process"])
            raise
        finally:
            x["log"].close()


@app.post("/api/exports/{export_id}/cancel")
def cancel_export(export_id: str):
    x = export_state(export_id)
    x["status"] = "cancelled"
    e.stop_process(x["process"])
    x["log"].close()
    return {"ok": True}


def shutdown():
    for event in e.CANCEL.values():
        event.set()
    for proc in list(e.PROCESSES.values()):
        e.stop_process(proc)
    for x in EXPORTS.values():
        e.stop_process(x["process"])


atexit.register(shutdown)
@app.on_event("startup")
def initialize():
    e.restore_jobs()
    e.seed_example()
DIST = e.ROOT / "web/dist"
if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/")
def index():
    if not (DIST / "index.html").exists():
        return JSONResponse({"detail": "Webapp zuerst bauen: cd web && npm run build"}, status_code=503)
    return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-store"})


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
