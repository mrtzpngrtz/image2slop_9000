"""Convert the text detector in a local SAM 3.1 multiplex safetensors file."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import sam3_masks as sm


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    torch, transformers, Model, Processor = sm.runtime()
    from safetensors import safe_open
    from safetensors.torch import save_file
    from transformers import Sam3Config, Sam3ImageProcessor, CLIPTokenizerFast

    converter = sm.ROOT / "tools" / "sam3-conversion" / "convert_sam3_to_hf.py"
    digest = hashlib.sha256(converter.read_bytes()).hexdigest()
    if digest != "d6bf4a6e3703fb677b16e8f6020556ba1d9aff74a6019a67ecc028ea5e3e813e":
        raise RuntimeError("Unexpected upstream conversion utility; review it before importing.")
    spec = importlib.util.spec_from_file_location("sam3_upstream_conversion", converter)
    cv = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cv)

    destination = sm.MODEL_DIR
    if (destination / "model.safetensors").exists():
        raise RuntimeError(f"Model already exists at {destination}; preserving it.")
    tokenizer = CLIPTokenizerFast.from_pretrained(args.tokenizer, local_files_only=True,
                                                  max_length=32, model_max_length=32)
    processor = Processor(image_processor=Sam3ImageProcessor(), tokenizer=tokenizer)
    config = Sam3Config()
    config.architectures = ["Sam3Model"]
    config.dtype = "float16"
    with torch.device("meta"):
        expected = Model(config).state_dict()
    # These branches are not used by text-only image segmentation.
    unused_prefixes = ("backbone.vision_backbone.interactive_convs.",
                       "backbone.vision_backbone.propagation_convs.",
                       "geometry_encoder.points_direct_project.",
                       "geometry_encoder.points_pool_project.",
                       "geometry_encoder.points_pos_enc_project.")
    skipped = []
    print("Reading local detector weights ...", flush=True)
    with safe_open(args.checkpoint, framework="pt", device="cpu") as source:
        state = {}
        for key in source.keys():
            if not key.startswith("detector."):
                skipped.append(key)
                continue
            stripped = key.removeprefix("detector.")
            if stripped.startswith(unused_prefixes):
                skipped.append(key)
                continue
            state[stripped] = source.get_tensor(key)
    mapping = cv.convert_old_keys_to_new_keys(list(state))
    converted = {mapping[key]: value for key, value in state.items()}
    del state
    position = "vision_encoder.backbone.embeddings.position_embeddings"
    converted[position] = converted[position][:, 1:, :].contiguous()
    converted = cv.split_qkv(converted)

    # Transformers computes then discards its fourth FPN level and its pooled
    # CLIP projection. SAM 3.1 omits these unused weights. Zero padding preserves
    # the three trained FPN levels and token features used for text masks.
    unused_missing = {
        "text_encoder.text_projection.weight",
        "vision_encoder.neck.fpn_layers.3.proj1.weight",
        "vision_encoder.neck.fpn_layers.3.proj1.bias",
        "vision_encoder.neck.fpn_layers.3.proj2.weight",
        "vision_encoder.neck.fpn_layers.3.proj2.bias",
    }
    missing = set(expected) - set(converted)
    unexpected = set(converted) - set(expected)
    if missing != unused_missing or unexpected:
        raise RuntimeError(f"Unexpected checkpoint layout: missing={missing}, extra={unexpected}")
    for key in unused_missing:
        converted[key] = torch.zeros(expected[key].shape, dtype=torch.float16)
    for key, value in expected.items():
        if converted[key].shape != value.shape:
            raise RuntimeError(f"Wrong tensor shape: {key}")
    if not all(torch.isfinite(value).all().item() for value in converted.values()):
        raise RuntimeError("The checkpoint contains non-finite values.")
    # Enforce complete loading. No used model parameter may be initialized randomly.
    with torch.device("meta"):
        model = Model(config)
    model.load_state_dict(converted, strict=True, assign=True)
    destination.mkdir(parents=True, exist_ok=True)
    config.save_pretrained(destination)
    processor.save_pretrained(destination)
    print(f"Saving {len(converted)} validated tensors ...", flush=True)
    save_file({k: v.contiguous() for k, v in converted.items()}, destination / "model.safetensors",
              metadata={"format": "pt"})
    print("Recording checkpoint fingerprint ...", flush=True)
    with args.checkpoint.open("rb") as source:
        source_hash = hashlib.file_digest(source, "sha256").hexdigest()
    provenance = {"model": "SAM 3.1 multiplex detector (local FP16 checkpoint)",
                  "source": str(args.checkpoint.resolve()), "source_sha256": source_hash,
                  "converter_url": "https://raw.githubusercontent.com/huggingface/transformers/main/src/transformers/models/sam3/convert_sam3_to_hf.py",
                  "converter_sha256": digest, "transformers": transformers.__version__,
                  "matched_detector_tensors": len(converted) - len(unused_missing),
                  "zero_initialized_unused_tensors": sorted(unused_missing),
                  "omitted_tracker_and_point_prompt_tensors": len(skipped),
                  "scope": "Text-prompt masks for individual frames; multiplex video tracking is not used."}
    sm.save_json(destination / "conversion.json", provenance)
    print(json.dumps(provenance, indent=2))
    sm.doctor(None)


if __name__ == "__main__":
    main()
