# image2slop_9000

image → video → SAM3 → splat → effects.

SAM3 cut. splat come out. music make wiggle. camera fly. export movie.

| image / frame | SAM3 mask | splat |
| :--- | :--- | :--- |
| <img src="docs/media/pipeline-image.png" alt="Input frame from the orbit video" width="240"> | <img src="docs/media/pipeline-sam3.png" alt="Actual SAM3 foreground mask" width="240"> | <img src="docs/media/pipeline-splat.png" alt="Reconstructed Gaussian splat" width="240"> |

effects. click for movie.

[![particle effect](docs/media/pipeline-effects.jpg)](https://github.com/mrtzpngrtz/image2slop_9000/blob/main/docs/media/demo.mp4)

app.

![app](docs/media/app.png)

windows. python 3.11. node 22.12+. ffmpeg.
`SETUP.cmd` → fix tool paths in `pipeline.json` → `START-WEBAPP.cmd`.

own PLY? drop in. want image → splat? bring local ComfyUI + MiniMax, COLMAP, Brush, SAM3 weights.

[more words](STUDIO.md) · [movie](docs/media/demo.mp4)
