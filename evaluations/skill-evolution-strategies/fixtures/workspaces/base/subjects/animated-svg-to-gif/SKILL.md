---
name: animated-svg-to-gif
description: Convert animated SVG files into high-quality GIFs by rendering browser-accurate frames and encoding them with an optimized ffmpeg palette. Use when Codex needs to turn CSS, SMIL, Mermaid, D3, ECharts, Slidev, or other animated SVG assets into shareable GIF files, batch-convert SVG folders, tune GIF dimensions, frame rate, duration, loop behavior, or verify conversion quality.
---

# Animated SVG to GIF

## Exact Output Contract

When a task names specific files, treat those names as fixed API values. Before writing files or running commands, make a two-value map from the prompt:

```powershell
$SourceSvg = "pulse.animated.svg"
$Gif = "pulse.gif"
$Fps = 12
$Width = 360
$DurationSeconds = 2
$Scale = 1
```

Replace the example values with the exact requested paths and numeric settings. Do not substitute descriptive names such as `sample.animated.svg`, `small_animated.svg`, or `projects/<project-id>/artifacts/gifs/sample.gif`. For a single named GIF, use `-o $Gif`; do not use `--output-dir`. If the task gives fps, width, duration, scale, loop, background, or color settings, pass those exact values to the conversion script. Do not reinterpret or halve a requested width because of SVG viewBox, CSS size, retina assumptions, or aspect ratio math; if the task says width 360, pass `--width 360` and verify that `ffprobe` reports width 360. A requested source SVG path is also a deliverable: create that file in the workspace and pass that path to the converter. Passing `skills/animated-svg-to-gif/assets/templates/pulse.animated.svg` directly to the converter does not satisfy a request to create `pulse.animated.svg`. After conversion, run a literal path check for every requested output and fix the run before responding if any check fails.

For a basic pulse smoke task, copy `assets/templates/pulse.animated.svg` to the exact requested source path instead of rewriting the SVG from memory.

## Core Workflow

1. Capture any user-provided input and output filenames before running commands. Use those paths exactly for the source SVG, GIF, manifest, and validation checks; do not rename them or move them to a default project directory.
2. Use `scripts/convert_animated_svg_to_gif.py` for conversion instead of static SVG rasterizers. Browser capture preserves CSS keyframes, SMIL timing, foreignObject labels, filters, markers, and SVG text rendering.
3. Prefer explicit output settings for deliverables: set `--fps`, `--width` or `--max-width`, `--scale`, and `--duration` when the target channel has size or timing constraints.
4. Let the script infer duration for generated animated SVGs that use `--am-delay` and `--am-duration`; override with `--duration` when animations are JavaScript-driven, looped, or intentionally longer.
5. Keep generated GIFs and manifests under `projects/<project-id>/artifacts/gifs/` only when the user does not name another destination.
6. Verify the exact requested output path with `ffprobe` and a visual preview or contact sheet before delivery.

## Quick Commands

Convert one SVG:

```powershell
$SourceSvg = "pulse.animated.svg"
$Gif = "pulse.gif"
$Fps = 12
$Width = 360
$DurationSeconds = 2
$Scale = 1
Copy-Item skills/animated-svg-to-gif/assets/templates/pulse.animated.svg $SourceSvg
if (!(Test-Path -LiteralPath $SourceSvg)) { throw "Missing requested source SVG path." }
uv run --script skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py $SourceSvg -o $Gif --fps $Fps --width $Width --duration $DurationSeconds --scale $Scale --background "#ffffff"
if (!(Test-Path -LiteralPath $SourceSvg) -or !(Test-Path -LiteralPath $Gif)) { throw "Missing requested GIF output path." }
```

Convert a folder of animated SVGs:

```powershell
uv run --script .agents/skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py .agents/skills/mermaid-animated-svg/assets/examples/mermaid-svg-animated/animated --output-dir projects/<project-id>/artifacts/gifs/mermaid --fps 24 --max-width 1280 --scale 2
```

Force timing and dimensions for a delivery target:

```powershell
uv run --script .agents/skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py chart.animated.svg -o chart.gif --duration 5 --fps 30 --width 960 --scale 2 --background "#ffffff"
```

Install Playwright's Chromium browser if the local cache is missing:

```powershell
uv run --script .agents/skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py diagram.animated.svg --install-browser
```

## Quality Guidance

- Use `--fps 24` for most diagrams and UI animations; use `--fps 30` for fast motion or social/video contexts.
- Use `--scale 2` by default. It multiplies the final GIF pixel dimensions from the CSS capture size; lower it only when file size is more important than crisp edges and text.
- Use `--background "#ffffff"` unless transparency is explicitly required; GIF transparency is one-bit and often causes jagged edges.
- Keep `--colors 256`, `--dither sierra2_4a`, and `--stats-mode full` for polished output. Change these only for file-size experiments.
- Use `--duration` when the source uses infinite loaders, JavaScript timelines, or CSS animations that do not expose useful timing metadata.
- Pass `--include-static` only when the user intentionally wants a GIF wrapper around a static SVG.
- When the task gives target dimensions, run `ffprobe` and confirm the reported GIF width and height match the requested size after scaling. If the width, fps, frame count, or duration differs from the request, rerun the conversion before responding.

## Pattern Promotion

When a source family or conversion preset proves reusable, update this skill before finishing. Capture the source pattern, trigger context, recommended flags, output constraints, verification commands, and pitfalls such as static SVG skipping or duration inference. If the pattern grows beyond this file, create `references/pattern-recipes.md` and link it here.

## Validation

After changing the skill or script, run:

```powershell
uv run --script .agents/skills/animated-svg-to-gif/scripts/convert_animated_svg_to_gif.py --help
uv run --script scripts/validate-skills.py
```

For converted assets, run `ffprobe` on representative GIFs and inspect at least one generated preview frame or contact sheet. Confirm that dimensions, duration, frame rate, background, labels, and final animation state match the source intent.
