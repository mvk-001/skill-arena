#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import html
from pathlib import Path
from textwrap import dedent


PALETTE = {
    "blue": "#007298",
    "orange": "#e77204",
    "red": "#9e1b32",
    "purple": "#652f6c",
    "ink": "#333e48",
    "gray50": "#f7f7f7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray400": "#9c9c9c",
    "surface": "#ffffff",
    "redHighlight": "#ffccd5",
    "orangeHighlight": "#ffe5cc",
    "purpleHighlight": "#f9ccff",
    "blueHighlight": "#cdf3ff",
}


def arc_path(source: dict[str, float], target: dict[str, float], step_index: int, token_y: float) -> str:
    distance = abs(target["index"] - source["index"])
    apex_y = token_y - 48 - distance * 10 - step_index * 7
    return (
        f'M{source["cx"]:.1f},{token_y + 2:.1f}'
        f'C{source["cx"]:.1f},{apex_y:.1f} {target["cx"]:.1f},{apex_y:.1f} '
        f'{target["cx"]:.1f},{token_y + 2:.1f}'
    )


def build_html() -> str:
    width = 560
    height = 420
    token_y = 244
    token_h = 40
    gap = 10
    tokens = [
        {"text": "The", "kind": "prompt", "w": 52},
        {"text": "model", "kind": "prompt", "w": 74},
        {"text": "predicts", "kind": "prompt", "w": 90},
        {"text": "the", "kind": "generated", "w": 54, "step": 0, "color": PALETTE["red"], "fill": PALETTE["redHighlight"]},
        {"text": "next", "kind": "generated", "w": 62, "step": 1, "color": PALETTE["orange"], "fill": PALETTE["orangeHighlight"]},
        {"text": "word", "kind": "generated", "w": 62, "step": 2, "color": PALETTE["purple"], "fill": PALETTE["purpleHighlight"]},
    ]
    total_w = sum(float(token["w"]) for token in tokens) + gap * (len(tokens) - 1)
    cursor = (width - total_w) / 2
    for index, token in enumerate(tokens):
        token["index"] = index
        token["x"] = cursor
        token["y"] = token_y
        token["cx"] = cursor + float(token["w"]) / 2
        token["generated"] = token["kind"] == "generated"
        cursor += float(token["w"]) + gap

    steps = [
        {"step": 1, "target": 3, "begin": 0.18, "color": PALETTE["red"], "weights": [0.18, 0.30, 0.52]},
        {"step": 2, "target": 4, "begin": 0.86, "color": PALETTE["orange"], "weights": [0.10, 0.16, 0.26, 0.48]},
        {"step": 3, "target": 5, "begin": 1.54, "color": PALETTE["purple"], "weights": [0.08, 0.12, 0.18, 0.25, 0.37]},
    ]

    halos: list[str] = []
    arcs: list[str] = []
    cursors: list[str] = []
    for step in steps:
        target = tokens[int(step["target"])]
        for source_index, source in enumerate(tokens[: int(step["target"])]):
            fill = source["fill"] if source["generated"] else PALETTE["blueHighlight"]
            halos.append(
                f'<rect x="{source["x"] - 4:.1f}" y="{source["y"] - 4:.1f}" '
                f'width="{float(source["w"]) + 8:.1f}" height="{token_h + 8}" rx="10" '
                f'fill="{fill}" opacity="0">'
                f'<animate attributeName="opacity" values="0;.28;.08" keyTimes="0;.42;1" '
                f'dur=".48s" begin="{float(step["begin"]) + source_index * .018:.3f}s" fill="freeze" />'
                f'</rect>'
            )
        for source_index, source in enumerate(tokens[: int(step["target"])]):
            weight = float(step["weights"][source_index])
            stroke = source["color"] if source["generated"] else (step["color"] if weight > 0.28 else PALETTE["blue"])
            path_id = f'attention-arc-decoding-step-{step["step"]}-source-{source["index"]}'
            arcs.append(
                f'<path id="{path_id}" class="attention-arc decode-step-{step["step"]}" '
                f'data-decode-step="{step["step"]}" data-source-token="{html.escape(str(source["text"]))}" '
                f'data-target-token="{html.escape(str(target["text"]))}" data-attention-weight="{weight:.2f}" '
                f'd="{arc_path(source, target, int(step["step"]), token_y)}" fill="none" '
                f'stroke="{stroke}" stroke-width="{1.2 + weight * 7.2:.2f}" '
                f'stroke-opacity="{.22 + weight * .95:.2f}" stroke-linecap="round" '
                f'pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">'
                f'<animate attributeName="stroke-dashoffset" from="1" to="0" dur=".42s" '
                f'begin="{float(step["begin"]) + source_index * .014:.3f}s" fill="freeze" />'
                f'</path>'
            )
        cursors.append(
            f'<g class="decode-query-cursor" transform="translate({target["cx"]:.1f},{token_y - 24})" opacity="0">'
            f'<circle r="12" fill="{PALETTE["surface"]}" stroke="{step["color"]}" stroke-width="2.2" />'
            f'<text class="mark-label" x="0" y="4" text-anchor="middle" font-size="11" font-weight="800">Q</text>'
            f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.2;.78;1" dur=".58s" '
            f'begin="{float(step["begin"]) - .04:.3f}s" fill="freeze" />'
            f'</g>'
        )

    token_groups: list[str] = []
    for token in tokens:
        base = (
            f'<g class="attention-arc-token {token["kind"]}" transform="translate({token["x"]:.1f},{token["y"]:.1f})">'
            f'<rect width="{token["w"]}" height="{token_h}" rx="9" fill="{PALETTE["surface"]}" '
            f'stroke="{PALETTE["gray300"] if token["generated"] else PALETTE["gray400"]}" '
            f'stroke-width="{1.4 if token["generated"] else 1.6}" '
            f'{"stroke-dasharray=\"5 5\"" if token["generated"] else ""} />'
        )
        if token["generated"]:
            begin_rect = float(steps[int(token["step"])]["begin"]) + 0.46
            begin_text = float(steps[int(token["step"])]["begin"]) + 0.50
            step_label = int(token["step"]) + 1
            base += (
                f'<rect width="{token["w"]}" height="{token_h}" rx="9" fill="{token["fill"]}" '
                f'stroke="{token["color"]}" stroke-width="2.2" opacity="0">'
                f'<animate attributeName="opacity" from="0" to="1" dur=".22s" begin="{begin_rect:.2f}s" fill="freeze" />'
                f'</rect>'
                f'<text class="mark-label" x="{float(token["w"]) / 2:.1f}" y="25" text-anchor="middle" '
                f'font-weight="820" opacity="0">{html.escape(str(token["text"]))}'
                f'<animate attributeName="opacity" from="0" to="1" dur=".18s" begin="{begin_text:.2f}s" fill="freeze" />'
                f'</text>'
                f'<text class="caption" x="{float(token["w"]) / 2:.1f}" y="58" text-anchor="middle" '
                f'font-size="10" opacity="0">step {step_label}'
                f'<animate attributeName="opacity" from="0" to=".9" dur=".18s" begin="{begin_text + .05:.2f}s" fill="freeze" />'
                f'</text>'
            )
        else:
            base += (
                f'<text class="mark-label" x="{float(token["w"]) / 2:.1f}" y="25" text-anchor="middle" '
                f'font-weight="760">{html.escape(str(token["text"]))}</text>'
            )
        token_groups.append(base + "</g>")

    svg = dedent(
        f"""\
        <svg id="attention-arc-decoding" data-pattern-id="d3-attention-arc-decoding" role="img"
             aria-labelledby="attention-arc-decoding-title attention-arc-decoding-desc" viewBox="0 0 {width} {height}"
             width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
          <title id="attention-arc-decoding-title">Attention arc decoding</title>
          <desc id="attention-arc-decoding-desc">Attention arcs target empty next-token slots before generated tokens join the context.</desc>
          <style>
            text {{ font-family: "Open Sans", Arial, sans-serif; }}
            .caption {{ fill: {PALETTE["gray400"]}; font-size: 12px; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }}
            .mark-label {{ fill: {PALETTE["ink"]}; font-size: 12px; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }}
          </style>
          <rect x="0" y="0" width="{width}" height="{height}" fill="{PALETTE["surface"]}" />
          <g class="attention-arc-decoding-stage">
            <rect x="34" y="82" width="492" height="260" rx="14" fill="{PALETTE["gray50"]}" stroke="{PALETTE["gray200"]}" />
            <path d="M{tokens[0]["x"]:.1f},{token_y + token_h + 22}H{tokens[-1]["x"] + tokens[-1]["w"]:.1f}"
                  stroke="{PALETTE["gray300"]}" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 7" />
            <text class="caption" x="{tokens[0]["x"]:.1f}" y="{token_y + token_h + 48}">context grows left to right</text>
            <g class="attention-arc-context-halos">{''.join(halos)}</g>
            <g class="attention-arc-layer">{''.join(arcs)}</g>
            {''.join(cursors)}
            <g class="attention-arc-token-layer">{''.join(token_groups)}</g>
          </g>
        </svg>
        """
    )

    return dedent(
        f"""\
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Attention Arc Decoding</title>
          <style>
            body {{
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #f7f7f7;
            }}
            svg {{
              display: block;
              width: min(94vw, 760px);
              height: auto;
              background: #fff;
            }}
          </style>
        </head>
        <body>
        {svg}
        </body>
        </html>
        """
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a self-contained attention arc decoding HTML artifact.")
    parser.add_argument("output", type=Path, help="Exact output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
