"""Validate a completed Brush export and package its held-out-view previews."""
import argparse
import json
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import pipeline as p


def inspect_ply(path):
    with path.open("rb") as stream:
        header = []
        while True:
            line = stream.readline()
            if not line or len(header) > 200:
                raise RuntimeError("Incomplete PLY header")
            header.append(line.decode("ascii").strip())
            if line.strip() == b"end_header":
                break
        if header[:2] != ["ply", "format binary_little_endian 1.0"]:
            raise RuntimeError("Expected Brush's binary little-endian PLY")
        count = int(next(line for line in header if line.startswith("element vertex ")).split()[-1])
        properties = [line.split()[-1] for line in header if line.startswith("property float ")]
        if not {"x", "y", "z", "opacity", "f_dc_0", "scale_0", "rot_0"}.issubset(properties):
            raise RuntimeError("Missing Gaussian splat properties")
        data = stream.read()
    if count <= 0 or len(data) != count * len(properties) * 4:
        raise RuntimeError("Incomplete Gaussian splat data")
    values = np.frombuffer(data, dtype="<f4").reshape(count, len(properties))
    if not np.isfinite(values).all():
        raise RuntimeError("Nonfinite Gaussian parameters")
    return {"gaussians": count, "bytes": path.stat().st_size, "sha256": p.sha256(path),
            "finite_parameters": True, "complete_binary_payload": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    run, output = args.run.resolve(), args.output.resolve()
    p.read_manifest(run)
    reconstruction = json.loads((run / "reconstruction.json").read_text())
    settings = json.loads((output / "settings.json").read_text())
    steps = settings["steps"]
    source = output / f"splat_{steps:05d}.ply"
    check = inspect_ply(source)
    renders = sorted((output / f"eval_{steps}").glob("*.png"))
    command = settings["command"]
    split = int(command[command.index("--eval-split-every") + 1])
    registered = reconstruction["registered_images"]
    expected = (registered + split - 1) // split
    if len(renders) != expected or len(renders) < 6:
        raise RuntimeError(f"Expected {expected} final evaluation renders (at least 6), found {len(renders)}")
    destination = p.ROOT / "results" / ("character-" + p.stamp())
    destination.mkdir(parents=True)
    shutil.copy2(source, destination / "character.ply")
    preview_frames = destination / "preview-frames"
    preview_frames.mkdir()
    metrics = []
    for index, render in enumerate(renders, 1):
        with Image.open(render) as image, Image.open(run / "model" / "frames" / render.name) as target:
            prediction = np.asarray(image.convert("RGB"), dtype=np.float64) / 255
            rgba = target.convert("RGBA")
            truth = np.asarray(rgba.convert("RGB"), dtype=np.float64) / 255
            alpha = np.asarray(rgba.getchannel("A")) > 127
            dilated = np.asarray(rgba.getchannel("A").filter(ImageFilter.MaxFilter(7))) > 0
            mse = np.mean((prediction[alpha] - truth[alpha]) ** 2)
            metrics.append({"frame": render.name, "subject_psnr_db": float(-10 * np.log10(max(mse, 1e-12))),
                            "background_mean_brightness_0_to_1": float(np.mean(prediction[~dilated]))})
            image.convert("RGB").save(preview_frames / f"view_{index:02d}.png")
    width, height = 448, 619
    sheet = Image.new("RGB", (width * 3, (height + 38) * 2 + 70), "#101316")
    draw = ImageDraw.Draw(sheet)
    font_path = Path("C:/Windows/Fonts/segoeui.ttf")
    title_font = ImageFont.truetype(str(font_path), 27)
    label_font = ImageFont.truetype(str(font_path), 18)
    draw.text((22, 17), "Splat preview | six reconstructed views", fill="white", font=title_font)
    for position, index in enumerate(np.linspace(0, len(renders) - 1, 6, dtype=int)):
        x, y = (position % 3) * width, 70 + (position // 3) * (height + 38)
        with Image.open(renders[index]) as image:
            sheet.paste(image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 14, y + height + 7), f"View {index + 1:02d} / {len(renders)}", font=label_font, fill="#c6cbd0")
    sheet.save(destination / "preview.jpg", quality=94)
    report = {"run": str(run), "output": str(output), "training_steps": steps,
              "registered_views": registered, "training_views": registered - len(renders), "held_out_views": len(renders),
              "mask_mode": "SAM3 subject transparency", "ply": check,
              "mean_subject_psnr_db": float(np.mean([m["subject_psnr_db"] for m in metrics])),
              "mean_background_brightness_0_to_1": float(np.mean([m["background_mean_brightness_0_to_1"] for m in metrics])),
              "evaluation": metrics,
              "limitations": "Held-out views are near the training orbit. Soft edges and AI-video geometry inconsistencies may remain; arbitrary viewpoints are not validated."}
    p.save_json(destination / "validation.json", report)
    p.save_json(p.ROOT / "latest-result.json", {"folder": str(destination), "ply": str(destination / "character.ply"),
                                               "preview": str(destination / "preview.jpg")})
    print(json.dumps({"folder": str(destination), "validation": check}, indent=2))


if __name__ == "__main__":
    main()
