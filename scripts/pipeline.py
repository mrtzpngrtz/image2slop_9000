"""Local video -> COLMAP -> Brush workflow. No source files are modified."""
from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "pipeline.json").read_text(encoding="utf-8"))
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}


def stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def tool(name):
    path = Path(CONFIG[name])
    path = path if path.is_absolute() else ROOT / path
    if not path.is_file():
        raise RuntimeError(f"Missing {name}: {path}. Update pipeline.json.")
    return str(path)


def env():
    result = os.environ.copy()
    colmap = Path(tool("colmap"))
    result["PATH"] = str(colmap.parent) + os.pathsep + result.get("PATH", "")
    result["QT_PLUGIN_PATH"] = str(colmap.parent.parent / "plugins")
    return result


def capture(command):
    result = subprocess.run([str(x) for x in command], capture_output=True,
                            text=True, encoding="utf-8", errors="replace", env=env())
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:] or result.stdout[-3000:])
    return result.stdout + result.stderr


def run_command(command, log, label):
    command = [str(x) for x in command]
    print(f"{label} ...\n  Log: {log}", flush=True)
    log.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with log.open("w", encoding="utf-8") as output:
        output.write(subprocess.list2cmdline(command) + "\n\n")
        output.flush()
        process = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT,
                                   cwd=log.parent, env=env())
        try:
            while True:
                try:
                    result = process.wait(timeout=30)
                    break
                except subprocess.TimeoutExpired:
                    print(f"  {label}: still working ({int(time.monotonic() - started)}s)", flush=True)
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            raise
    if result:
        with log.open(encoding="utf-8", errors="replace") as source:
            tail = "".join(deque(source, maxlen=18))
        raise RuntimeError(f"{label} exited with code {result}.\n{tail}\nFull log: {log}")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_fingerprint(folder):
    return {p.name: sha256(p) for p in sorted(folder.glob("*.png"))}


def read_manifest(run):
    path = run / "manifest.json"
    if not path.is_file():
        raise RuntimeError(f"No prepared run at {run}. Run prepare first.")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if image_fingerprint(run / "model" / "frames") != manifest["frame_hashes"]:
        raise RuntimeError("Prepared frames changed. Prepare a new run before reconstructing/training; "
                           "camera poses must match the exact images used for reconstruction.")
    return manifest


def thumbnail(path):
    with Image.open(path) as image:
        return np.asarray(image.convert("L").resize((128, 128)), dtype=np.float32)


def make_contact_sheets(frames, destination):
    destination.mkdir(exist_ok=True)
    for start in range(0, len(frames), 60):
        batch = frames[start:start + 60]
        sheet = Image.new("RGB", (6 * 180, math.ceil(len(batch) / 6) * 164), "#20232b")
        draw = ImageDraw.Draw(sheet)
        for index, path in enumerate(batch):
            x, y = (index % 6) * 180, (index // 6) * 164
            with Image.open(path) as image:
                image = ImageOps.contain(image.convert("RGB"), (172, 136))
                sheet.paste(image, (x + (180 - image.width) // 2, y))
            draw.text((x + 6, y + 140), path.name, fill="white")
        sheet.save(destination / f"contact-{start // 60 + 1:02d}.jpg", quality=88)


def prepare(args):
    video = Path(args.video).expanduser().resolve()
    if not video.is_file():
        raise RuntimeError(f"Video not found: {video}")
    if args.max_frames < 3 or not 0 <= args.duplicate_threshold <= 255:
        raise RuntimeError("Use at least 3 frames and a duplicate threshold between 0 and 255.")
    if min(args.trim_start_degrees, args.trim_end_degrees) < 0 or args.trim_start_degrees + args.trim_end_degrees >= 360:
        raise RuntimeError("Trim angles must be non-negative and sum to less than 360 degrees.")
    probe = json.loads(capture([tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
                                "-show_streams", "-show_format", "-of", "json", video]))
    if not probe.get("streams"):
        raise RuntimeError("The input has no video stream.")
    stream = probe["streams"][0]
    duration = float(stream.get("duration") or probe["format"]["duration"])
    num, den = stream.get("avg_frame_rate", "0/1").split("/")
    source_fps = float(num) / float(den) if float(den) else 0
    if duration <= 0 or not math.isfinite(duration):
        raise RuntimeError("Video duration is invalid.")
    fps = min(args.max_frames / duration, source_fps) if source_fps > 0 else args.max_frames / duration
    run = Path(args.run).resolve() if args.run else ROOT / "runs" / (re.sub(r"[^\w-]+", "-", video.stem) + "-" + stamp())
    if run.exists():
        raise RuntimeError(f"Run folder already exists: {run}. Choose a new folder to preserve previous results.")
    frames = run / "model" / "frames"
    raw = run / "raw_frames"
    frames.mkdir(parents=True)
    raw.mkdir()
    save_json(run / "video-info.json", probe)
    run_command([tool("ffmpeg"), "-hide_banner", "-nostdin", "-n", "-i", video,
                 "-map", "0:v:0", "-vf", f"fps={fps:.12g}:start_time=0:round=near",
                 "-frames:v", args.max_frames, raw / "frame_%04d.png"],
                run / "logs" / "01-extract.log", "Extracting sampled frames")
    # Keep the exact first decoded frame as the anchor, independent of fps sampling.
    anchor = run / "anchor.png"
    run_command([tool("ffmpeg"), "-hide_banner", "-nostdin", "-n", "-i", video,
                 "-map", "0:v:0", "-frames:v", "1", "-update", "1", anchor],
                run / "logs" / "01-anchor.log", "Extracting the original first view")
    reference = Path(args.reference).resolve() if args.reference else None
    if reference:
        with Image.open(anchor) as original, Image.open(reference) as supplied:
            supplied = ImageOps.exif_transpose(supplied).convert("RGB")
            if abs((supplied.width / supplied.height) / (original.width / original.height) - 1) > 0.02:
                raise RuntimeError("Reference and video aspect ratios differ by more than 2%. "
                                   "Use a reference with the same crop, or omit --reference.")
            supplied.save(frames / "frame_0001.png")
    else:
        shutil.copy2(anchor, frames / "frame_0001.png")
    kept = [{"name": "frame_0001.png", "source": str(reference or anchor), "seconds": 0}]
    rejected = []
    previous = thumbnail(anchor)
    start = duration * args.trim_start_degrees / 360
    end = duration * (1 - args.trim_end_degrees / 360)
    for index, path in enumerate(sorted(raw.glob("frame_*.png"))):
        seconds = index / fps
        reason = None
        if index == 0 or seconds < start or seconds >= end:
            reason = "anchor-or-trim"
        else:
            current = thumbnail(path)
            difference = float(np.mean(np.abs(current - previous)))
            if args.duplicate_threshold > 0 and difference <= args.duplicate_threshold:
                reason = "near-duplicate"
        if reason:
            rejected.append({"source": path.name, "seconds": seconds, "reason": reason})
            continue
        name = f"frame_{len(kept) + 1:04d}.png"
        shutil.copy2(path, frames / name)
        kept.append({"name": name, "source": str(path), "seconds": seconds})
        previous = current
    if len(kept) < 3:
        raise RuntimeError("Fewer than three distinct views remain. Check the video, trims and duplicate threshold.")
    manifest = {"video": str(video), "reference": str(reference) if reference else None,
                "duration": duration, "sample_fps": fps, "trim_start_degrees": args.trim_start_degrees,
                "trim_end_degrees": args.trim_end_degrees, "duplicate_threshold": args.duplicate_threshold,
                "frames": kept, "rejected": rejected, "frame_hashes": image_fingerprint(frames)}
    save_json(run / "manifest.json", manifest)
    make_contact_sheets(sorted(frames.glob("*.png")), run / "preview")
    print(f"Prepared {len(kept)} frames; skipped {len(rejected)}.\nRun: {run}\nPreview: {run / 'preview'}", flush=True)
    return run


def gpu_option(help_text, stage):
    modern = f"Feature{stage}.use_gpu"
    old = f"Sift{stage}.use_gpu"
    if modern in help_text:
        return "--" + modern
    if old in help_text:
        return "--" + old
    raise RuntimeError(f"Cannot find COLMAP's {stage} GPU option.")


def binary_count(path):
    with path.open("rb") as source:
        return struct.unpack("<Q", source.read(8))[0]


def reconstruct(args):
    run = Path(args.run).resolve()
    manifest = read_manifest(run)
    model = run / "model"
    if (model / "images.bin").exists():
        raise RuntimeError("This run already contains camera poses. Use train, or prepare a new run.")
    work = run / ("reconstruction-" + stamp())
    sparse = work / "sparse"
    sparse.mkdir(parents=True)
    database = work / "database.db"
    frames = model / "frames"
    extractor_help = capture([tool("colmap"), "feature_extractor", "-h"])
    matcher_help = capture([tool("colmap"), "exhaustive_matcher", "-h"])
    extraction = [tool("colmap"), "feature_extractor", "--database_path", database,
                  "--image_path", frames, "--ImageReader.camera_model", "SIMPLE_PINHOLE",
                  gpu_option(extractor_help, "Extraction"), int(not args.cpu)]
    if args.feature_masks:
        validate_masks(model)
        if not (model / "masks").is_dir():
            raise RuntimeError("Generate/import subject masks before using --feature-masks.")
        feature_masks = work / "feature-masks"
        feature_masks.mkdir()
        for image in sorted(frames.glob("*.png")):
            # COLMAP appends .png to the full image filename; Brush uses the stem.
            shutil.copy2(model / "masks" / image.name, feature_masks / (image.name + ".png"))
        extraction.extend(["--ImageReader.mask_path", feature_masks])
    extraction.extend(["--SiftExtraction.peak_threshold", args.sift_peak_threshold])
    video_list = work / "video-images.txt"
    video_names = [f["name"] for f in manifest["frames"] if not manifest["reference"] or f["name"] != "frame_0001.png"]
    video_list.write_text("\n".join(video_names) + "\n", encoding="utf-8")
    run_command(extraction + ["--ImageReader.single_camera", "1", "--image_list_path", video_list],
                work / "logs" / "02-features.log", "Finding image features")
    if manifest["reference"]:
        reference_list = work / "reference-image.txt"
        reference_list.write_text("frame_0001.png\n", encoding="utf-8")
        run_command(extraction + ["--ImageReader.single_camera", "0", "--image_list_path", reference_list],
                    work / "logs" / "02-reference.log", "Calibrating the reference image separately")
    run_command([tool("colmap"), "exhaustive_matcher", "--database_path", database,
                 gpu_option(matcher_help, "Matching"), int(not args.cpu),
                 "--FeatureMatching.guided_matching", int(args.guided_matching)],
                work / "logs" / "03-matching.log", "Matching all image pairs")
    run_command([tool("colmap"), "mapper", "--database_path", database, "--image_path", frames,
                 "--output_path", sparse, "--Mapper.ba_refine_principal_point", "0",
                 "--Mapper.init_min_tri_angle", args.min_triangulation_angle],
                work / "logs" / "04-reconstruction.log", "Reconstructing camera poses")
    candidates = [p.parent for p in sparse.glob("*/images.bin") if (p.parent / "points3D.bin").is_file()]
    if not candidates:
        raise RuntimeError(f"COLMAP could not reconstruct a scene. Inspect {work / 'logs'} and the frame preview.")
    best = max(candidates, key=lambda p: (binary_count(p / "images.bin"), binary_count(p / "points3D.bin")))
    registered, points = binary_count(best / "images.bin"), binary_count(best / "points3D.bin")
    fraction = registered / len(manifest["frames"])
    quality = {"selected_model": str(best), "registered_images": registered,
               "input_images": len(manifest["frames"]), "registered_fraction": fraction,
               "points3D": points, "model_count": len(candidates), "cpu": args.cpu,
               "feature_masks": args.feature_masks, "guided_matching": args.guided_matching,
               "min_triangulation_angle": args.min_triangulation_angle,
               "sift_peak_threshold": args.sift_peak_threshold}
    save_json(run / "reconstruction.json", quality)
    run_command([tool("colmap"), "model_analyzer", "--path", best],
                work / "logs" / "05-model-analysis.log", "Checking reconstruction")
    if points == 0 or registered < 3:
        raise RuntimeError("No usable 3D reconstruction was produced.")
    for path in best.glob("*.bin"):
        shutil.copy2(path, model / path.name)
    (run / "colmap-project.ini").write_text(
        f"database_path={database.as_posix()}\nimage_path={frames.as_posix()}\n", encoding="utf-8")
    print(f"Registered {registered}/{len(manifest['frames'])} images ({fraction:.0%}); {points} 3D points. "
          f"Selected the largest of {len(candidates)} model(s).", flush=True)
    check_quality(quality, args.allow_partial)
    return run


def check_quality(quality, allow_partial=False):
    if quality["registered_fraction"] < CONFIG["min_registered_fraction"] or quality["registered_images"] < CONFIG["min_registered_images"]:
        message = (f"Only {quality['registered_images']}/{quality['input_images']} views registered. "
                   "Review the frame preview and reconstruction logs before training. "
                   "Use train --allow-partial only if that partial scene is intentional.")
        if not allow_partial:
            raise RuntimeError(message)
        print("WARNING: " + message, flush=True)


def validate_masks(model):
    masks = model / "masks"
    if not masks.exists():
        return
    frames = sorted((model / "frames").glob("*.png"))
    for frame in frames:
        mask = masks / frame.name
        if not mask.is_file():
            raise RuntimeError(f"Missing mask: {mask}")
        with Image.open(frame) as image, Image.open(mask) as matte:
            if image.size != matte.size:
                raise RuntimeError(f"Mask dimensions do not match {frame.name}.")


def train(args):
    run = Path(args.run).resolve()
    read_manifest(run)
    model = run / "model"
    if not (run / "reconstruction.json").is_file():
        raise RuntimeError("Run reconstruct before training.")
    quality = json.loads((run / "reconstruction.json").read_text(encoding="utf-8"))
    check_quality(quality, args.allow_partial)
    for name in ("cameras.bin", "images.bin", "points3D.bin"):
        if not (model / name).is_file():
            raise RuntimeError(f"Missing model file: {name}")
    validate_masks(model)
    if min(args.steps, args.max_resolution, args.max_splats) <= 0:
        raise RuntimeError("Steps, resolution and splat limit must be positive.")
    output = run / "output" / stamp()
    output.mkdir(parents=True)
    command = [tool("brush"), model, "--total-steps", args.steps,
               "--max-resolution", args.max_resolution, "--max-splats", args.max_splats,
               "--export-every", min(5000, args.steps), "--export-path", output,
               "--export-name", "splat_{iter}.ply"]
    # Always export the requested final step, including non-multiples of 5000.
    command[command.index("--export-every") + 1] = 5000 if args.steps % 5000 == 0 else args.steps
    if args.with_viewer:
        command.append("--with-viewer")
    if args.eval_split_every is not None:
        if args.eval_split_every < 2:
            raise RuntimeError("Use --eval-split-every 2 or higher to retain training views.")
        command.extend(["--eval-split-every", args.eval_split_every,
                        "--eval-every", min(1000, args.steps), "--eval-save-to-disk"])
    save_json(output / "settings.json", {"command": [str(x) for x in command], "steps": args.steps,
                                        "max_resolution": args.max_resolution, "max_splats": args.max_splats})
    run_command(command, output / "training.log", "Training the Gaussian splat")
    exported = list(output.glob("*.ply"))
    if not exported:
        raise RuntimeError(f"Brush ended without exporting a PLY. See {output / 'training.log'}")
    final = max(exported, key=lambda p: int(re.search(r"(\d+)\.ply$", p.name).group(1)))
    shutil.copy2(final, output / "final.ply")
    save_json(run / "latest-output.json", {"ply": str(output / "final.ply"), "folder": str(output)})
    print(f"\nFinished: {output / 'final.ply'}\nOpen SuperSplat.url, import final.ply, crop the subject, "
          "then export a cleaned PLY.", flush=True)
    return output


def import_masks(args):
    run = Path(args.run).resolve()
    read_manifest(run)
    frames = run / "model" / "frames"
    target = run / "model" / "masks"
    source = Path(args.source).resolve()
    if target.exists():
        raise RuntimeError("A masks folder already exists; preserve it and use a new prepared run for different masks.")
    pairs = []
    for frame in sorted(frames.glob("*.png")):
        mask = source / frame.name
        if not mask.is_file():
            raise RuntimeError(f"Missing mask: {mask}")
        with Image.open(frame) as image, Image.open(mask) as matte:
            if image.size != matte.size:
                raise RuntimeError(f"Wrong mask dimensions for {frame.name}; expected {image.size}.")
        pairs.append((frame, mask))
    target.mkdir()
    for frame, mask in pairs:
        with Image.open(mask) as image:
            image = image.convert("L")
            if args.invert:
                image = ImageOps.invert(image)
            image.save(target / frame.name)
    print(f"Imported {len(pairs)} masks. White keeps the subject; black ignores the background.")


def sam3_masks(args):
    run = Path(args.run).resolve()
    read_manifest(run)
    command = [tool("sam3_python"), ROOT / "scripts" / "sam3_masks.py", "generate", "--run", run]
    for prompt in args.prompt or ["person"]:
        command.extend(["--prompt", prompt])
    if args.limit is not None:
        command.extend(["--limit", args.limit])
    else:
        command.append("--install")
    run_command(command, run / "logs" / ("sam3-" + stamp() + ".log"), "Generating SAM3 masks")


def doctor(_args):
    print(f"Project: {ROOT}\nPython: {sys.executable}")
    for name, flags in (("ffmpeg", ["-version"]), ("ffprobe", ["-version"]),
                        ("colmap", ["-h"]), ("brush", ["--version"])):
        output = capture([tool(name), *flags])
        print(f"OK {name}: {tool(name)}\n  {output.splitlines()[0]}")
    gpu = shutil.which("nvidia-smi")
    if gpu:
        print(capture([gpu, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"]).strip())
    print("Setup check passed. GPU training is checked by scripts/smoke_test.py.")


def all_stages(args):
    if not args.video:
        videos = [p for p in (ROOT / "input").iterdir() if p.suffix.lower() in VIDEO_EXTENSIONS]
        if len(videos) != 1:
            raise RuntimeError("Put exactly one video in the input folder, then run START.cmd; "
                               "or drag one video onto START.cmd.")
        args.video = str(videos[0])
    if not args.reference:
        references = [p for p in (ROOT / "input").glob("reference.*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
        if len(references) > 1:
            raise RuntimeError("Multiple reference images found. Keep one, or specify --reference.")
        if references:
            args.reference = str(references[0])
    doctor(args)
    args.run = str(prepare(args))
    if args.mask_prompt:
        sam3_masks(argparse.Namespace(run=args.run, prompt=args.mask_prompt, limit=None))
    reconstruct(args)
    train(args)


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="Check installed tools and GPU").set_defaults(func=doctor)
    for name, func in (("prepare", prepare), ("reconstruct", reconstruct), ("train", train), ("all", all_stages)):
        cmd = commands.add_parser(name)
        cmd.set_defaults(func=func)
        cmd.add_argument("--run", required=name in {"reconstruct", "train"}, help="Run directory; prepare requires a NEW directory")
        if name in {"prepare", "all"}:
            cmd.add_argument("video", nargs="?" if name == "all" else None)
            cmd.add_argument("--reference", help="Original image matching the video's first view")
            cmd.add_argument("--max-frames", type=int, default=CONFIG["max_frames"])
            cmd.add_argument("--trim-start-degrees", type=float, default=CONFIG["trim_start_degrees"])
            cmd.add_argument("--trim-end-degrees", type=float, default=CONFIG["trim_end_degrees"])
            cmd.add_argument("--duplicate-threshold", type=float, default=CONFIG["duplicate_threshold"])
        if name == "all":
            cmd.add_argument("--mask-prompt", action="append", help="Generate SAM3 masks; repeat for multiple concepts")
        if name in {"reconstruct", "all"}:
            cmd.add_argument("--cpu", action="store_true", help="Use CPU for COLMAP feature extraction/matching")
            cmd.add_argument("--feature-masks", action="store_true", help="Use installed subject masks in COLMAP too")
            cmd.add_argument("--guided-matching", action="store_true")
            cmd.add_argument("--min-triangulation-angle", type=float, default=16)
            cmd.add_argument("--sift-peak-threshold", type=float, default=0.00667)
        if name in {"reconstruct", "train", "all"}:
            cmd.add_argument("--allow-partial", action="store_true")
        if name in {"train", "all"}:
            cmd.add_argument("--steps", type=int, default=CONFIG["training_steps"])
            cmd.add_argument("--max-resolution", type=int, default=CONFIG["max_resolution"])
            cmd.add_argument("--max-splats", type=int, default=CONFIG["max_splats"])
            cmd.add_argument("--with-viewer", action="store_true")
            cmd.add_argument("--eval-split-every", type=int, help="Reserve every Nth view and save evaluation renders")
    masks = commands.add_parser("masks", help="Import optional masks made by SAM/ComfyUI or another tool")
    masks.add_argument("--run", required=True)
    masks.add_argument("--source", required=True)
    masks.add_argument("--invert", action="store_true")
    masks.set_defaults(func=import_masks)
    sam3 = commands.add_parser("sam3", help="Generate SAM3 subject masks with the isolated GPU environment")
    sam3.add_argument("--run", required=True)
    sam3.add_argument("--prompt", action="append", help="Text concept (default: person); repeat to combine concepts")
    sam3.add_argument("--limit", type=int, help="Preview this many views without installing masks")
    sam3.set_defaults(func=sam3_masks)
    return result


def main():
    args = parser().parse_args()
    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\nStopped. Existing run files and logs have been preserved.", file=sys.stderr)
        return 130
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        run_path = getattr(args, "run", None)
        if run_path and Path(run_path).is_dir():
            save_json(Path(run_path) / "last-error.json", {"command": args.command,
                       "time": datetime.now().isoformat(), "error": str(error)})
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
