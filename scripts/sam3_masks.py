"""Generate Brush masks locally with Meta SAM3 through Hugging Face Transformers."""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools" / "sam3-cache"
# Preserve the user's existing Hugging Face login while keeping large files on D:.
os.environ["HF_HUB_CACHE"] = str(CACHE / "huggingface" / "hub")
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TORCH_HOME"] = str(CACHE / "torch")
MODEL_ID = "facebook/sam3"
MODEL_REVISION = "3c879f39826c281e95690f02c7821c4de09afae7"
MODEL_DIR = ROOT / "tools" / "sam3-model"
_WIN_RUNTIME_HANDLES = []


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def model_description(model_dir=MODEL_DIR):
    provenance = model_dir / "conversion.json"
    if provenance.is_file():
        return json.loads(provenance.read_text(encoding="utf-8"))
    return {"model": MODEL_ID, "revision": MODEL_REVISION}


def runtime():
    # Anaconda's older C++ runtime can shadow the current system runtime. Load
    # the installed Microsoft DLLs explicitly before PyTorch initializes.
    if sys.platform == "win32" and not _WIN_RUNTIME_HANDLES:
        import ctypes
        system32 = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32"
        for name in ("msvcp140.dll", "vcruntime140_1.dll"):
            _WIN_RUNTIME_HANDLES.append(ctypes.WinDLL(str(system32 / name)))
    import torch
    import transformers
    from transformers import Sam3Model, Sam3Processor
    if not torch.cuda.is_available():
        raise RuntimeError("SAM3 cannot see a CUDA GPU. Run scripts/install-sam3.ps1 first.")
    return torch, transformers, Sam3Model, Sam3Processor


def doctor(_args):
    torch, transformers, _, _ = runtime()
    # Exercise CUDA allocation and computation, not just package import.
    test = torch.ones((32, 32), device="cuda")
    assert (test @ test).sum().item() == 32768
    state = {"software_ready": True, "python": sys.executable,
             "torch": torch.__version__, "transformers": transformers.__version__,
             "cuda": torch.version.cuda, "gpu": torch.cuda.get_device_name(0),
             "model": model_description(),
             "weights_present": (MODEL_DIR / "model.safetensors").is_file()}
    save_json(ROOT / "sam3-setup.json", state)
    print(json.dumps(state, indent=2))


def download(_args):
    if (MODEL_DIR / "model.safetensors").is_file():
        print(f"A local model is already installed: {MODEL_DIR}")
        doctor(None)
        return
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import GatedRepoError
    try:
        snapshot_download(MODEL_ID, revision=MODEL_REVISION, local_dir=MODEL_DIR,
                          allow_patterns=["*.json", "*.txt", "*.safetensors", "LICENSE", "README.md"],
                          max_workers=2)
    except GatedRepoError:
        raise RuntimeError("Your Hugging Face login does not have access to SAM3 weights. "
                           "Request access at https://huggingface.co/facebook/sam3, then run "
                           "DOWNLOAD-SAM3.cmd again. To change login, run tools\\sam3-env\\Scripts\\hf.exe auth login.") from None
    print(f"Model downloaded: {MODEL_DIR}")
    doctor(None)


def generate(args):
    import numpy as np
    from PIL import Image, ImageOps
    import pipeline

    run = Path(args.run).resolve()
    manifest = pipeline.read_manifest(run)
    model_dir = Path(args.model).resolve() if args.model else MODEL_DIR
    if not (model_dir / "model.safetensors").is_file():
        raise RuntimeError("SAM3 weights are missing. Run DOWNLOAD-SAM3.cmd after your "
                           "Hugging Face model access is granted, or pass --model with a local Transformers model folder.")
    if not 0 < args.threshold < 1:
        raise RuntimeError("Detection threshold must be between 0 and 1.")
    prompts = args.prompt or ["person"]
    frames = sorted((run / "model" / "frames").glob("*.png"))
    if args.limit is not None:
        if args.limit < 1:
            raise RuntimeError("--limit must be positive.")
        if args.limit < len(frames):
            indices = np.linspace(0, len(frames) - 1, args.limit).round().astype(int)
            frames = [frames[i] for i in indices]
    if args.install and len(frames) != len(manifest["frames"]):
        raise RuntimeError("Partial mask previews cannot be installed. Omit --limit to mask every frame.")
    if args.install and (run / "model" / "masks").exists():
        raise RuntimeError("This run already has installed masks. A new run preserves the previous set.")
    output = run / ("sam3-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    masks_dir, preview_dir = output / "masks", output / "preview"
    masks_dir.mkdir(parents=True)
    preview_dir.mkdir()
    torch, transformers, Sam3Model, Sam3Processor = runtime()
    provenance = model_description(model_dir)
    print(f"Loading SAM3 on {torch.cuda.get_device_name(0)}", flush=True)
    processor = Sam3Processor.from_pretrained(model_dir, local_files_only=True)
    model = Sam3Model.from_pretrained(model_dir, local_files_only=True).to("cuda").eval()
    rows = []
    failed = []
    with torch.inference_mode():
        for index, path in enumerate(frames):
            with Image.open(path) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
            combined = np.zeros((image.height, image.width), dtype=bool)
            detections = []
            for prompt in prompts:
                inputs = processor(images=image, text=prompt, return_tensors="pt").to("cuda")
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    outputs = model(**inputs)
                result = processor.post_process_instance_segmentation(
                    outputs, threshold=args.threshold, mask_threshold=0.5,
                    target_sizes=inputs["original_sizes"].tolist())[0]
                if len(result["masks"]):
                    combined |= result["masks"].any(dim=0).cpu().numpy().astype(bool)
                detections.append({"prompt": prompt, "count": len(result["masks"]),
                                   "scores": result["scores"].float().cpu().tolist()})
                del outputs, inputs, result
            coverage = float(combined.mean())
            if coverage == 0 or coverage > 0.95:
                failed.append(path.name)
            Image.fromarray(combined.astype(np.uint8) * 255).save(masks_dir / path.name)
            # The numerical mask is visualized; source frames are never edited.
            rgb = np.asarray(image).copy()
            rgb[~combined] = (rgb[~combined] * 0.18).astype(np.uint8)
            overlay = Image.fromarray(rgb)
            overlay.thumbnail((384, 384))
            overlay.save(preview_dir / (path.stem + ".jpg"), quality=85)
            rows.append({"frame": path.name, "coverage": coverage, "detections": detections})
            print(f"[{index+1}/{len(frames)}] {path.name}: {coverage:.1%} foreground", flush=True)
            save_json(output / "report.json", {"model": provenance,
                       "transformers": transformers.__version__, "prompts": prompts,
                       "threshold": args.threshold, "frames": rows, "suspicious_frames": failed})
    pipeline.make_contact_sheets(sorted(preview_dir.glob("*.jpg")), output / "contact-sheets")
    if failed:
        raise RuntimeError(f"{len(failed)} masks are empty or cover over 95% of the image. "
                           f"Review {output / 'contact-sheets'} and change the prompt/threshold. Masks were not installed.")
    if args.install:
        pipeline.import_masks(argparse.Namespace(run=str(run), source=str(masks_dir), invert=False))
    print(f"Masks: {masks_dir}\nPreview: {output / 'contact-sheets'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor").set_defaults(func=doctor)
    commands.add_parser("download").set_defaults(func=download)
    mask = commands.add_parser("generate")
    mask.add_argument("--run", required=True)
    mask.add_argument("--prompt", action="append", help="Text concept; repeat to combine person and held objects")
    mask.add_argument("--threshold", type=float, default=0.5)
    mask.add_argument("--model", help="Local Transformers SAM3 model directory")
    mask.add_argument("--limit", type=int, help="Preview this many views distributed through the orbit")
    mask.add_argument("--install", action="store_true", help="Install the completed mask set for Brush")
    mask.set_defaults(func=generate)
    args = parser.parse_args()
    try:
        args.func(args)
    except KeyboardInterrupt:
        print("Stopped; generated masks are preserved.", file=sys.stderr)
        return 130
    except (RuntimeError, OSError, ValueError, ImportError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
