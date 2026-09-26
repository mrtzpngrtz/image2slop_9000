"""Preserve a prepared run and reconstruct a copy using subject masks."""
import argparse
from pathlib import Path
import shutil

import pipeline as p


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    args = parser.parse_args()
    source = args.run.resolve()
    manifest = p.read_manifest(source)
    p.validate_masks(source / "model")
    if not (source / "model" / "masks").is_dir():
        raise RuntimeError("The source run needs subject masks.")
    run = p.ROOT / "runs" / ("masked-retry-" + p.stamp())
    run.mkdir(parents=True)
    for name in ("frames", "masks"):
        shutil.copytree(source / "model" / name, run / "model" / name)
    manifest["source_run"] = str(source)
    p.save_json(run / "manifest.json", manifest)
    if (source / "video-info.json").is_file():
        shutil.copy2(source / "video-info.json", run / "video-info.json")
    p.make_contact_sheets(sorted((run / "model" / "frames").glob("*.png")), run / "preview")
    p.save_json(p.ROOT / "recovery-run.json", {"source": str(source), "run": str(run)})
    print(f"New run: {run}", flush=True)
    p.reconstruct(p.parser().parse_args(["reconstruct", "--run", str(run), "--feature-masks",
                                        "--guided-matching", "--min-triangulation-angle", "8",
                                        "--sift-peak-threshold", "0.004"]))


if __name__ == "__main__":
    main()
