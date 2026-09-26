"""Exercise real FFmpeg, CUDA COLMAP and Brush using a small rendered cube."""
from pathlib import Path
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

import pipeline as p


def render_fixture(folder):
    rng = np.random.default_rng(24)
    textures = []
    for face in range(6):
        image = Image.new("RGB", (512, 512), tuple(rng.integers(60, 180, 3)))
        draw = ImageDraw.Draw(image)
        for _ in range(700):
            x, y = rng.integers(0, 500, 2)
            width, height = rng.integers(5, 35, 2)
            color = tuple(int(x) for x in rng.integers(0, 255, 3))
            draw.rectangle((int(x), int(y), int(x + width), int(y + height)), fill=color)
        draw.text((190, 240), f"SPLAT TEST FACE {face}", fill="white", stroke_width=2)
        textures.append(np.asarray(image))
    width, height, focal = 512, 384, 470
    yy, xx = np.mgrid[:height, :width]
    camera_rays = np.stack([(xx - width / 2) / focal, (yy - height / 2) / focal, np.ones_like(xx)], axis=-1)
    bounds = np.array([1.1, 0.95, 0.8])
    folder.mkdir(parents=True)
    for view in range(48):
        angle = 2 * math.pi * view / 48
        position = np.array([4.6 * math.sin(angle), 1.6, 4.6 * math.cos(angle)])
        forward = -position / np.linalg.norm(position)
        right = np.cross(forward, [0, 1, 0])
        right /= np.linalg.norm(right)
        down = np.cross(forward, right)
        rays = camera_rays @ np.stack([right, down, forward])
        with np.errstate(divide="ignore", invalid="ignore"):
            near = (-bounds - position) / rays
            far = (bounds - position) / rays
        entry = np.minimum(near, far)
        exit_ = np.maximum(near, far)
        distance = np.max(entry, axis=-1)
        visible = (distance <= np.min(exit_, axis=-1)) & (distance > 0)
        points = position + distance[..., None] * rays
        axis = np.argmax(entry, axis=-1)
        pixels = np.full((height, width, 3), 24, dtype=np.uint8)
        for dimension in range(3):
            uv_axes = [i for i in range(3) if i != dimension]
            u = np.clip(((points[..., uv_axes[0]] / bounds[uv_axes[0]] + 1) * 255.5).astype(int), 0, 511)
            v = np.clip(((points[..., uv_axes[1]] / bounds[uv_axes[1]] + 1) * 255.5).astype(int), 0, 511)
            for side in range(2):
                mask = visible & (axis == dimension) & ((points[..., dimension] > 0) == bool(side))
                pixels[mask] = textures[dimension * 2 + side][v[mask], u[mask]]
        Image.fromarray(pixels).save(folder / f"frame_{view + 1:04d}.png")


def main():
    root = p.ROOT / "runs" / ("setup-validation-" + p.stamp())
    images = root / "fixture"
    render_fixture(images)
    video = root / "orbit.mp4"
    p.run_command([p.tool("ffmpeg"), "-hide_banner", "-nostdin", "-n", "-framerate", "6",
                   "-i", images / "frame_%04d.png", "-c:v", "libx264", "-crf", "12",
                   "-pix_fmt", "yuv420p", video], root / "encode.log", "Making validation video")
    reference = root / "reference.png"
    with Image.open(images / "frame_0001.png") as image:
        image.resize((1024, 768), Image.Resampling.LANCZOS).save(reference)
    parser = p.parser()
    run = p.prepare(parser.parse_args(["prepare", str(video), "--reference", str(reference),
                                      "--max-frames", "48", "--run", str(root / "pipeline")]))
    p.reconstruct(parser.parse_args(["reconstruct", "--run", str(run)]))
    # Exercise mask naming and dimensions, including the larger reference.
    source_masks = root / "source-masks"
    source_masks.mkdir()
    for frame in (run / "model" / "frames").glob("*.png"):
        with Image.open(frame) as image:
            values = np.asarray(image.convert("RGB"))
            mask = (np.max(values, axis=-1) > 40).astype(np.uint8) * 255
        Image.fromarray(mask).save(source_masks / frame.name)
    p.import_masks(parser.parse_args(["masks", "--run", str(run), "--source", str(source_masks)]))
    output = p.train(parser.parse_args(["train", "--run", str(run), "--steps", "20",
                                       "--max-resolution", "512", "--max-splats", "20000"]))
    with (output / "final.ply").open("rb") as source:
        header = source.read(4096)
    if not header.startswith(b"ply") or b"f_dc_0" not in header or b"opacity" not in header:
        raise RuntimeError("Brush output is not a Gaussian splat PLY.")
    # Protect against silently using stale poses after an image is edited.
    frame = run / "model" / "frames" / "frame_0001.png"
    original = frame.read_bytes()
    try:
        frame.write_bytes(original + b"changed")
        try:
            p.read_manifest(run)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Changed frames were not detected")
    finally:
        frame.write_bytes(original)
    report = {"passed": True, "fixture": "synthetic textured cube (not user video)",
              "run": str(run), "output": str(output / "final.ply"),
              "reconstruction": json.loads((run / "reconstruction.json").read_text()),
              "checks": ["frame extraction", "mixed-resolution reference", "GPU feature extraction",
                         "exhaustive matching", "camera reconstruction", "mask import",
                         "20 GPU training steps", "Gaussian PLY export", "changed-frame guard"]}
    p.save_json(p.ROOT / "setup-validation.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
