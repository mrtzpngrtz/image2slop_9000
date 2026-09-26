# OneSplatt Studio — Swiss interface

The interface follows a restrained Swiss grid: neutral gray surfaces, black typography, hairline dividers, square controls, and red primary actions. The media viewer remains dark so that the artwork has a clear frame.

## Typography

`Helvetica Neue, Helvetica, Arial, sans-serif`. Helvetica is used when installed; this Windows machine currently uses Arial. No external font request or bundled unlicensed font is required.

Use regular weight and small, clear control labels. No oversized workspace titles, uppercase metadata banners, or decorative section numbers. Timing uses tabular figures. The canvas is the visual focus.

## Palette

| Role | Color |
| --- | --- |
| Workspace | `#d0d0ca` |
| Inspector | `#d0d0ca` |
| Input surface | `#ddddd7` |
| Main text | `#272824` |
| Secondary text | `#686a62` |
| Dividers | `#b4b5ad` |
| Primary action / playhead | `#db4c53` |

Use solid surfaces. Selection is indicated with black fill or an underline. Red is reserved for important actions, focus, the timeline playhead, and small state accents. Avoid pill cards, decorative shadows, glowing borders, and colored panels.

## Layout

Three columns: a slim thumbnail rail, a large canvas with timeline, and collapsible controls. The rail uses icons with accessible names and hover titles. File names appear in menus or tooltips, not under every thumbnail. The project folder opens the project selector. Remove persistent FPS, Gaussian counts, file sizes, instructional paragraphs, and repeated status labels.

Camera mode and particle presets use compact icons or visual swatches. Essential controls remain labelled; less common settings live under “Optionen”. Camera, particle and audio sections start open; secondary sections start closed. Workflow connection, prompts, training settings and diagnostics are expandable. Errors and running-job cancellation remain visible. Timeline markers retain dragging, time editing and deletion; effect names are available on hover and to assistive technology.

On narrow screens the rail becomes a compact horizontal row and controls follow the viewer. Use real buttons, native form controls, details/summary disclosure, descriptive aria-labels and focus indicators for icon-only actions.

Base styles live in `web/src/swiss.css`; `web/src/minimal.css` supplies the reduced layout. Changing the interface must not change scene colors, camera settings, music, or exported footage.


## Film graphics

The film overlays use a separate visual language from the app: off-white Akzidenz with small mono annotations, hairline rules, open corner brackets, crosshairs, arrows and square nodes. Vary scale and alignment; reserve empty space around the subject. Console styles are Editorial, Register and Minimal. Glitch marks use several geometric families instead of repeated filled panels. Export typography is drawn at output resolution. Text presets affect presentation only and retain authored content and timing.
