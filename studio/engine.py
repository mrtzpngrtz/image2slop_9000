"""Persistent local projects, ComfyUI bridge and the existing reconstruction pipeline."""
from __future__ import annotations
import copy
import json
import math
import os
from pathlib import Path
import subprocess
import struct
import sys
import threading
import time
import uuid
from urllib.parse import urlparse

import numpy as np
import requests
import psutil
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "studio" / "data"
PROJECTS = DATA / "projects"
PROJECTS.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT / "pipeline.json").read_text())
LOCK = threading.RLock()
GPU_LOCK = threading.Lock()
JOBS = {}
CANCEL = {}
PROCESSES = {}
CREATION_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def ident():
    return uuid.uuid4().hex[:16]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def project_path(project_id):
    if not project_id.isalnum() or len(project_id) > 40:
        raise ValueError("Ungültige Projekt-ID")
    return PROJECTS / project_id / "project.json"


def get_project(project_id):
    with LOCK:
        path = project_path(project_id)
        if not path.is_file():
            raise ValueError("Projekt nicht gefunden")
        return json.loads(path.read_text(encoding="utf-8"))


def save_project(project):
    with LOCK:
        project["updated"] = time.time()
        write_json(project_path(project["id"]), project)


def projects():
    with LOCK:
        return sorted([json.loads(p.read_text(encoding="utf-8")) for p in PROJECTS.glob("*/project.json")],
                      key=lambda p: p["updated"], reverse=True)


def create_project(name):
    p = {"id": ident(), "name": str(name or "Unbenanntes Projekt")[:100], "assets": [],
         "settings": {}, "created": time.time(), "updated": time.time()}
    save_project(p)
    return p


def asset_path(asset):
    path = (ROOT / asset["path"]).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError("Datei nicht gefunden")
    return path


def asset_by_id(project, asset_id, kind=None):
    a = next((a for a in project["assets"] if a["id"] == asset_id), None)
    if a is None or (kind and a["kind"] != kind):
        raise ValueError("Bitte eine passende Datei auswählen")
    asset_path(a)
    return a


def ply_info(path):
    with path.open("rb") as f:
        lines = []
        for _ in range(250):
            line = f.readline().decode("ascii").strip()
            lines.append(line)
            if line == "end_header":
                break
        if lines[:2] != ["ply", "format binary_little_endian 1.0"]:
            return {}
        count = int(next(l for l in lines if l.startswith("element vertex ")).split()[-1])
        props = [l.split()[-1] for l in lines if l.startswith("property float ")]
        if not {"x", "y", "z", "opacity"}.issubset(props) or not 0 < count <= 10_000_000:
            return {}
        values = np.fromfile(f, dtype="<f4", count=count * len(props)).reshape(count, len(props))
    xyz = values[:, [props.index(n) for n in ("x", "y", "z")]]
    opacity = values[:, props.index("opacity")]
    valid = np.isfinite(xyz).all(1) & (opacity > -2)
    xyz = xyz[valid]
    if len(xyz) < 10:
        return {}
    low, high = np.quantile(xyz, [0.01, 0.99], axis=0)
    return {"count": count, "center": ((low + high) / 2).tolist(), "size": (high - low).tolist()}


def add_asset(project_id, path, kind, name=None, **extra):
    path = Path(path).resolve()
    a = {"id": ident(), "name": name or path.name, "kind": kind,
         "path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, **extra}
    if kind == "splat" and path.suffix.lower() == ".ply":
        a["geometry"] = ply_info(path)
        if extra.get("run"):
            a["recommendedView"] = first_camera_view(ROOT / extra["run"] / "model/images.bin", a["geometry"])
    with LOCK:
        p = get_project(project_id)
        p["assets"].append(a)
        save_project(p)
    return a


def first_camera_view(path, geometry):
    views = []
    with path.open("rb") as f:
        count = struct.unpack("<Q", f.read(8))[0]
        for _ in range(count):
            v = struct.unpack("<idddddddi", f.read(64))
            name = bytearray()
            while (b := f.read(1)) != b"\0":
                if not b:
                    raise ValueError("Unvollständige Kameradatei")
                name.extend(b)
            w, x, y, z = v[1:5]
            r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                          [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                          [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
            center = -r.T @ np.array(v[5:8])
            views.append((name.decode(), center))
            points = struct.unpack("<Q", f.read(8))[0]
            f.seek(points * 24, 1)
    _, center = sorted(views, key=lambda v: v[0])[0]
    delta = (center - geometry["center"]) * np.array([-1, -1, 1])
    return {"orientation": [180, 180, 0], "azimuth": round(float(np.degrees(np.arctan2(delta[0], delta[2])))),
            "elevation": round(float(np.degrees(np.arctan2(delta[1], np.linalg.norm(delta[[0, 2]]))))),
            "distance": 3.9}


def seed_example():
    marker = DATA / "example-imported.json"
    latest = ROOT / "latest-result.json"
    if marker.exists() or not latest.exists():
        return
    info = json.loads(latest.read_text())
    p = create_project("O-Ren · Motion Study")
    a = add_asset(p["id"], Path(info["ply"]), "splat", "O-Ren · SAM3", coverage=166,
                  preview=Path(info["preview"]).relative_to(ROOT).as_posix())
    video = ROOT / "input" / "MiniMax_H3_00021_.mp4"
    if video.exists():
        add_asset(p["id"], video, "video")
    p = get_project(p["id"])
    p["settings"] = {"assetId": a["id"], "duration": 12, "orbit": 100, "azimuth": 60, "orientation": [180, 180, 0]}
    save_project(p)
    write_json(marker, {"project": p["id"]})


def comfy_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1") or parsed.username:
        raise ValueError("ComfyUI muss eine lokale HTTP-Adresse sein, z. B. http://127.0.0.1:8188")
    return url.rstrip("/")


def workflow():
    return json.loads((ROOT / "studio/workflows/360_subject.json").read_text(encoding="utf-8"))


def workflow_video_formats(graph):
    """Keep exact aspect ratios within the workflow's pixel budget and size grid."""
    resolution = graph["115"]["inputs"]
    step = int(resolution["multiple"])
    budget = float(resolution["megapixels"]) * 1_000_000
    formats = {}
    for aspect, (w, h) in {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1)}.items():
        scale = math.floor(math.sqrt(budget / (w * h * step * step)))
        if scale < 1:
            raise ValueError("Die Workflow-Auflösung ist zu klein für das gewählte Bildformat")
        formats[aspect] = {"width": w * step * scale, "height": h * step * scale}
    return formats


def workflow_video_size(graph, options):
    aspect = options.get("aspect", "16:9")
    if aspect not in ("16:9", "9:16", "1:1"):
        raise ValueError("Videoformat muss 16:9, 9:16 oder 1:1 sein")
    return workflow_video_formats(graph)[aspect]


def prepare_comfy_image(source, target, size, fit):
    # MiniMax stretches its first frame to the requested canvas. Fit it here so
    # switching aspect ratios preserves the subject's proportions and original.
    if fit not in ("contain", "cover"):
        raise ValueError("Bildanpassung muss Einpassen oder Zuschneiden sein")
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert("RGBA")
        canvas = Image.new("RGBA", image.size, (0, 0, 0, 255))
        canvas.alpha_composite(image)
        image = canvas.convert("RGB")
        dimensions = (size["width"], size["height"])
        if fit == "cover":
            image = ImageOps.fit(image, dimensions, method=Image.Resampling.LANCZOS)
        else:
            image = ImageOps.pad(image, dimensions, method=Image.Resampling.LANCZOS, color="black")
        image.save(target, "PNG")


def prepare_workflow(graph, options, image_name):
    graph = copy.deepcopy(graph)
    # Direct dimensions avoid the template's fixed 3:4 selector and its custom
    # enum labels. The unused selector is pruned with the other unreachable nodes.
    graph["105:104"]["inputs"].update(workflow_video_size(graph, options))
    graph["114"]["inputs"]["image"] = image_name
    graph["105:104"]["inputs"]["prompt"] = str(options.get("prompt") or graph["105:104"]["inputs"]["prompt"])[:8000]
    graph["105:15"]["inputs"]["noise_seed"] = int(options.get("seed", 42)) % (2**53)
    graph["105:111"]["inputs"]["value"] = max(2, min(30, float(options.get("videoDuration", 10))))
    graph["105:126"]["inputs"]["value"] = bool(options.get("turbo", True))
    graph["92"]["inputs"]["filename_prefix"] = "video/OneSplatt"
    # Only the graph reachable from SaveVideo is executable. The supplied workflow
    # also contains a disconnected resize node without an image input.
    reached = set()
    def visit(node):
        if node in reached:
            return
        reached.add(node)
        for value in graph[node]["inputs"].values():
            if isinstance(value, list) and len(value) == 2 and str(value[0]) in graph:
                visit(str(value[0]))
    visit("92")
    return {k: v for k, v in graph.items() if k in reached}


def comfy_status(url):
    url = comfy_url(url)
    session = requests.Session()
    session.trust_env = False
    try:
        stats = session.get(url + "/system_stats", timeout=3)
        stats.raise_for_status()
        nodes = session.get(url + "/object_info", timeout=8).json()
        graph = prepare_workflow(workflow(), {}, "placeholder.png")
        missing = sorted({v["class_type"] for v in graph.values()} - set(nodes))
        model_missing = []
        for node in graph.values():
            fields = nodes.get(node["class_type"], {}).get("input", {}).get("required", {})
            for key, value in node["inputs"].items():
                if key.endswith("_name") and key in fields:
                    choices = fields[key][0]
                    if isinstance(choices, list) and value not in choices:
                        model_missing.append(str(value))
        return {"online": True, "ready": not missing and not model_missing,
                "missingNodes": missing, "missingModels": model_missing, "url": url}
    except requests.RequestException:
        return {"online": False, "ready": False, "missingNodes": [], "missingModels": [], "url": url}


def update_job(job, **fields):
    with LOCK:
        job.update(fields)
        job["updated"] = time.time()
        write_json(DATA / "jobs" / (job["id"] + ".json"), job)


def check_cancel(job):
    if CANCEL[job["id"]].is_set():
        raise InterruptedError("Auftrag abgebrochen")


def command(job, args):
    check_cancel(job)
    env = os.environ.copy()
    env.update(PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
    with (ROOT / job["log"]).open("a", encoding="utf-8") as log:
        log.write("\n" + subprocess.list2cmdline([str(a) for a in args]) + "\n")
        log.flush()
        process = subprocess.Popen([str(a) for a in args], cwd=ROOT, stdout=log, stderr=log,
                                   env=env, creationflags=CREATION_FLAGS)
        PROCESSES[job["id"]] = process
        while process.poll() is None:
            if CANCEL[job["id"]].wait(0.5):
                stop_process(process)
                raise InterruptedError("Auftrag abgebrochen")
        PROCESSES.pop(job["id"], None)
        if process.returncode:
            tail = (ROOT / job["log"]).read_text(encoding="utf-8", errors="replace")[-2500:]
            raise RuntimeError("Verarbeitung fehlgeschlagen. " + tail)


def stop_process(process):
    if process.poll() is not None:
        return
    try:
        children = psutil.Process(process.pid).children(recursive=True)
    except psutil.NoSuchProcess:
        children = []
    for child in reversed(children):
        try:
            child.terminate()
        except psutil.NoSuchProcess:
            pass
    process.terminate()
    _, remaining = psutil.wait_procs(children, timeout=3)
    for child in remaining:
        try:
            child.kill()
        except psutil.NoSuchProcess:
            pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def video_files(value):
    found = []
    if isinstance(value, dict):
        if str(value.get("filename", "")).lower().endswith((".mp4", ".webm", ".mov", ".mkv")):
            found.append(value)
        for child in value.values():
            found.extend(video_files(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(video_files(child))
    return found


def generate_video(job, p, options):
    source_graph = workflow()
    size = workflow_video_size(source_graph, options)
    image_fit = options.get("comfyImageFit", "contain")
    if image_fit not in ("contain", "cover"):
        raise ValueError("Bildanpassung muss Einpassen oder Zuschneiden sein")
    url = comfy_url(options.get("comfyUrl", "http://127.0.0.1:8188"))
    status = comfy_status(url)
    if not status["ready"]:
        raise RuntimeError("ComfyUI nicht bereit: " + (", ".join(status["missingNodes"] + status["missingModels"]) or "Server nicht erreichbar"))
    a = asset_by_id(p, options.get("imageId"), "image")
    prepared_image = ROOT / job["folder"] / "prepared-input.png"
    prepare_comfy_image(asset_path(a), prepared_image, size, image_fit)
    session = requests.Session()
    session.trust_env = False
    update_job(job, stage="Bild an ComfyUI übergeben", progress=0.08)
    with prepared_image.open("rb") as image:
        result = session.post(url + "/upload/image", files={"image": ("onesplatt-" + job["id"] + ".png", image, "image/png")},
                              data={"overwrite": "false"}, timeout=60)
    result.raise_for_status()
    uploaded = result.json()
    filename = "/".join(filter(None, [uploaded.get("subfolder"), uploaded["name"]]))
    graph = prepare_workflow(source_graph, options, filename)
    write_json(ROOT / job["folder"] / "submitted-workflow.json", graph)
    result = session.post(url + "/prompt", json={"prompt": graph, "client_id": "onesplatt-" + job["id"]}, timeout=30)
    if not result.ok:
        raise RuntimeError("ComfyUI lehnt den Workflow ab: " + result.text[:2500])
    prompt_id = result.json()["prompt_id"]
    update_job(job, stage=f"ComfyUI erzeugt {size['width']} × {size['height']} px", promptId=prompt_id, progress=0.2)
    deadline = time.monotonic() + 7200
    try:
        while time.monotonic() < deadline:
            check_cancel(job)
            history = session.get(url + "/history/" + prompt_id, timeout=20)
            history.raise_for_status()
            entry = history.json().get(prompt_id)
            if entry:
                state = entry.get("status", {})
                if state.get("status_str") == "error":
                    raise RuntimeError("ComfyUI: " + json.dumps(state.get("messages", []))[-2000:])
                files = video_files(entry.get("outputs", {}))
                if files:
                    file = files[0]
                    path = ROOT / job["folder"] / ("orbit" + Path(file["filename"]).suffix)
                    with session.get(url + "/view", params={k: file.get(k, "output" if k == "type" else "")
                                                             for k in ("filename", "subfolder", "type")}, stream=True, timeout=60) as response:
                        response.raise_for_status()
                        with path.open("wb") as out:
                            for chunk in response.iter_content(1024 * 1024):
                                check_cancel(job)
                                out.write(chunk)
                    return add_asset(p["id"], path, "video", "Orbit · ComfyUI.mp4")
                if state.get("completed"):
                    raise RuntimeError("ComfyUI ist fertig, liefert aber keine Videodatei. SaveVideo-Ausgabe prüfen.")
            CANCEL[job["id"]].wait(2)
        raise RuntimeError("ComfyUI-Zeitlimit von zwei Stunden erreicht")
    except InterruptedError:
        # Remove only this queued prompt; interrupt only if this prompt owns the GPU.
        queue = session.get(url + "/queue", timeout=5).json()
        session.post(url + "/queue", json={"delete": [prompt_id]}, timeout=5)
        if any(row[1] == prompt_id for row in queue.get("queue_running", [])):
            session.post(url + "/interrupt", json={}, timeout=5)
        raise


def reconstruct(job, p, options):
    a = asset_by_id(p, options.get("videoId"), "video")
    run = ROOT / "runs" / ("studio-" + job["id"])
    script = ROOT / "scripts/pipeline.py"
    update_job(job, stage="Frames auswählen", progress=0.04, run=run.relative_to(ROOT).as_posix())
    args = [sys.executable, script, "prepare", asset_path(a), "--run", run, "--max-frames", str(int(options.get("maxFrames", 180))),
            "--trim-start-degrees", "5", "--trim-end-degrees", "5"]
    if options.get("useReference"):
        reference = asset_by_id(p, options.get("imageId"), "image")
        args.extend(["--reference", asset_path(reference)])
    command(job, args)
    masks = bool(options.get("masks", True))
    if masks:
        # Release MiniMax's resident weights only while ComfyUI is idle.
        session = requests.Session()
        session.trust_env = False
        url = comfy_url(options.get("comfyUrl", "http://127.0.0.1:8188"))
        try:
            queue = session.get(url + "/queue", timeout=2).json()
            if queue.get("queue_running") or queue.get("queue_pending"):
                raise RuntimeError("ComfyUI verarbeitet gerade einen anderen Auftrag. Splat-Berechnung nach dessen Abschluss erneut starten.")
            session.post(url + "/free", json={"unload_models": True, "free_memory": True}, timeout=15).raise_for_status()
        except requests.RequestException:
            pass
        update_job(job, stage="SAM3 trennt das Motiv vom Hintergrund", progress=0.18)
        prompts = [x.strip() for x in str(options.get("maskPrompt", "person, sword")).split(",") if x.strip()]
        if not prompts:
            raise ValueError("Mindestens einen Begriff für SAM3 eingeben")
        command(job, [sys.executable, script, "sam3", "--run", run, *[v for term in prompts for v in ("--prompt", term)]])
    update_job(job, stage="COLMAP rekonstruiert die Kameras", progress=0.4)
    command(job, [sys.executable, script, "reconstruct", "--run", run, "--guided-matching",
                  "--min-triangulation-angle", "8", "--sift-peak-threshold", "0.004", *(["--feature-masks"] if masks else [])])
    quality = json.loads((run / "reconstruction.json").read_text())
    update_job(job, reconstruction=quality)
    if masks:
        update_job(job, stage="Transparente Trainingsbilder vorbereiten", progress=0.62)
        alpha = run.with_name(run.name + "-alpha")
        command(job, [sys.executable, ROOT / "scripts/alpha_dataset.py", "--run", run, "--destination", alpha])
        run = alpha
    update_job(job, stage="Brush trainiert den Splat", progress=0.7)
    steps = int(options.get("steps", 30000))
    command(job, [sys.executable, script, "train", "--run", run, "--steps", str(steps), "--eval-split-every", "10"])
    output = json.loads((run / "latest-output.json").read_text())
    return add_asset(p["id"], Path(output["ply"]), "splat", p["name"] + " · Splat", run=run.relative_to(ROOT).as_posix(),
                     registered=quality["registered_images"])


def start_job(project_id, kind, options):
    p = get_project(project_id)
    with LOCK:
        if any(j["status"] in ("queued", "running") for j in JOBS.values()):
            raise ValueError("Ein GPU-Auftrag läuft bereits. Bitte warten oder abbrechen.")
        job_id = ident()
        folder = DATA / "jobs" / job_id
        folder.mkdir(parents=True)
        job = {"id": job_id, "projectId": p["id"], "kind": kind, "status": "queued", "stage": "Wartet", "progress": 0,
               "created": time.time(), "folder": folder.relative_to(ROOT).as_posix(),
               "log": (folder / "job.log").relative_to(ROOT).as_posix()}
        JOBS[job_id] = job
        CANCEL[job_id] = threading.Event()
        update_job(job)
    def work():
        with GPU_LOCK:
            try:
                update_job(job, status="running")
                result = generate_video(job, p, options) if kind == "generate" else reconstruct(job, p, options)
                check_cancel(job)
                update_job(job, status="completed", stage="Fertig", progress=1, assetId=result["id"])
            except InterruptedError as e:
                update_job(job, status="cancelled", stage="Abgebrochen", error=str(e))
            except Exception as e:
                update_job(job, status="failed", stage="Fehler", error=str(e))
    threading.Thread(target=work, daemon=True).start()
    return job


def restore_jobs():
    for file in (DATA / "jobs").glob("*.json"):
        job = json.loads(file.read_text(encoding="utf-8"))
        if job["status"] in ("queued", "running"):
            job.update(status="failed", stage="Unterbrochen", error="Der Server wurde während dieses Auftrags beendet. Vorhandene Zwischenergebnisse bleiben erhalten.")
            write_json(file, job)
        JOBS[job["id"]] = job
