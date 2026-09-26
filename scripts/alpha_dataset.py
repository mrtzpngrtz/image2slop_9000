"""Add subject alpha to a copy of the images, preserving RGB pixels and camera poses."""
import argparse
import json
from pathlib import Path
import shutil

from PIL import Image
import pipeline as p


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--destination", type=Path, help="Optional new output directory")
    args = parser.parse_args()
    source = args.run.resolve()
    manifest = p.read_manifest(source)
    p.validate_masks(source / "model")
    if not (source / "model" / "masks").is_dir():
        raise RuntimeError("Subject masks are required.")
    quality = json.loads((source / "reconstruction.json").read_text())
    p.check_quality(quality)
    run = args.destination.resolve() if args.destination else p.ROOT / "runs" / ("alpha-subject-" + p.stamp())
    if run.exists():
        raise RuntimeError("The alpha destination must be a new directory.")
    frames = run / "model" / "frames"
    frames.mkdir(parents=True)
    for path in sorted((source / "model" / "frames").glob("*.png")):
        with Image.open(path) as image, Image.open(source / "model" / "masks" / path.name) as mask:
            rgba = image.convert("RGBA")
            rgba.putalpha(mask.convert("L"))
            rgba.save(frames / path.name)
            with Image.open(frames / path.name) as written:
                if image.convert("RGB").tobytes() != written.convert("RGB").tobytes():
                    raise RuntimeError(f"RGB changed unexpectedly: {path.name}")
    for path in (source / "model").glob("*.bin"):
        shutil.copy2(path, run / "model" / path.name)
    manifest["source_run"] = str(source)
    manifest["training_mask_mode"] = "alpha (RGB pixels and camera intrinsics/poses preserved)"
    manifest["frame_hashes"] = p.image_fingerprint(frames)
    quality["inherited_camera_model"] = str(source / "model")
    p.save_json(run / "manifest.json", manifest)
    p.save_json(run / "reconstruction.json", quality)
    if (source / "video-info.json").is_file():
        shutil.copy2(source / "video-info.json", run / "video-info.json")
    p.save_json(p.ROOT / "alpha-run.json", {"source": str(source), "run": str(run)})
    print(f"Created transparent subject dataset: {run}")


if __name__ == "__main__":
    main()
