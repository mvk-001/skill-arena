#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


STRING = r'"(?:\\.|[^"\\])*"'
EXAMPLE_RE = re.compile(
    r"\{\s*"
    rf"id:\s*(?P<id>{STRING}),\s*"
    rf"kicker:\s*(?P<kicker>{STRING}),\s*"
    rf"title:\s*(?P<title>{STRING}),\s*"
    rf"copy:\s*(?P<copy>{STRING}),\s*"
    r"render:\s*(?P<render>[A-Za-z_$][A-Za-z0-9_$]*)\s*"
    rf"(?:,\s*size:\s*(?P<size>{STRING}))?\s*"
    r"\}",
    re.DOTALL,
)
SPECIAL_SECTIONS = {
    "force-network": """
## Standalone Recipe

Prefer this recipe over the source excerpt when the deliverable is a standalone or offline HTML/SVG artifact. It avoids runtime force simulation and gives label positions that remain readable in screenshot validation.

Use this deterministic data contract:

```js
const nodes = [
  { id: "API", group: "core", x: 280, y: 160, labelDx: 0, labelDy: -26, anchor: "middle" },
  { id: "Auth", group: "core", x: 392, y: 190, labelDx: 26, labelDy: 4, anchor: "start" },
  { id: "Jobs", group: "core", x: 168, y: 190, labelDx: -26, labelDy: 4, anchor: "end" },
  { id: "Search", group: "data", x: 252, y: 88, labelDx: 0, labelDy: -26, anchor: "middle" },
  { id: "Index", group: "data", x: 374, y: 112, labelDx: 24, labelDy: -8, anchor: "start" },
  { id: "Events", group: "data", x: 286, y: 254, labelDx: 0, labelDy: 32, anchor: "middle" },
  { id: "Billing", group: "ops", x: 156, y: 298, labelDx: -22, labelDy: 22, anchor: "end" },
  { id: "Alerts", group: "ops", x: 430, y: 304, labelDx: 24, labelDy: 20, anchor: "start" },
  { id: "Reports", group: "ops", x: 262, y: 346, labelDx: 0, labelDy: 32, anchor: "middle" }
];
const links = [
  ["API", "Auth"], ["API", "Jobs"], ["API", "Search"], ["Auth", "Billing"], ["Jobs", "Events"],
  ["Search", "Index"], ["Events", "Reports"], ["Billing", "Reports"], ["Alerts", "Events"],
  ["Alerts", "Billing"], ["Index", "Reports"]
];
```

Implementation steps:

- Draw the title above the network and keep the network inside `x=120..470`, `y=80..360`.
- Draw links first with final `opacity` around `0.7`; if animated, add SVG `<animate attributeName="opacity" from="0" to="0.7" ... fill="freeze">` while leaving the base opacity visible.
- Draw one group per node at `translate(x,y)`, append a circle with final `r=18`, and optionally animate `r` from `4` to `18`.
- Place labels using each node's `labelDx`, `labelDy`, and `anchor`. Give labels a white stroke halo with `paint-order: stroke`, `stroke: #fff`, `stroke-width: 4`, and `stroke-linejoin: round`.
- Do not run a browser-side force simulation for a standalone deliverable. Use the fixed coordinates above so reduced-motion screenshots and exported SVGs are deterministic.

Validation hooks:

- Root SVG exposes `data-pattern-id="d3-force-network"`.
- Final SVG contains 9 circles, 11 link lines, and 9 readable labels.
- A reduced-motion or static screenshot must still show the links, circles, and labels; no mark may rely on `opacity: 0` plus a disabled animation.

""".strip(),
    "solar-terminator": """
## Astronomical Contract

For standalone or offline HTML, use the bundled deterministic builder instead of reimplementing the astronomy or accessibility shell:

```powershell
uv run --script skills/d3-animated-svg/scripts/build_solar_terminator.py <exact-output-path>.html
uv run --script skills/d3-animated-svg/scripts/check_self_contained_html.py <exact-output-path>.html
```

Run the builder once with the user's exact requested path, then run the checker once. The builder already emits direct SVG `title` and `desc`, stable metadata, responsive overflow behavior, visible final-state marks, replay animation, and reduced-motion fallbacks.

After the checker passes, stop validation. Do not run `rg`, `grep`, `Select-String`, or another negative no-match probe for remote URLs or missing tokens; the checker already covers those contracts, while no-match exit code 1 is a strict-trace tool error.

Derive the timestamp, equation of time, solar declination, and subsolar longitude as one deterministic tuple. Never copy a longitude constant into an artifact that labels a different UTC instant.

Use the NOAA fractional-year approximation shown in the source excerpt. With east-positive longitude and a UTC timestamp:

```text
subsolar_longitude = (720 - utc_minutes - equation_of_time_minutes) / 4
```

Normalize the result to `[-180, 180]`. For the fixed fixture instant `2026-06-21T12:00:00Z`, the approximation should yield an equation of time near `-1.33` minutes, declination near `23.45°N`, and subsolar longitude near `0.33°E`. Treat a result tens of degrees away as a timestamp/longitude consistency failure.

Expose the fixed instant and derived values as `data-timestamp`, `data-astronomy-model`, `data-equation-of-time-minutes`, `data-subsolar-longitude`, and `data-subsolar-declination`. Show the instant, longitude hemisphere, and declination outside hover-only UI.

Source: NOAA Global Monitoring Laboratory, `General Solar Position Calculations` (`https://gml.noaa.gov/grad/solcalc/solareqns.PDF`).
""".strip(),
}


@dataclass(frozen=True)
class Example:
    id: str
    kicker: str
    title: str
    copy: str
    render: str
    source: str
    size: str | None = None

    @property
    def pattern_id(self) -> str:
        return f"d3-{self.id}"


def skill_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def decode_js_string(raw: str) -> str:
    return json.loads(raw)


def find_matching(text: str, start_index: int, open_char: str, close_char: str) -> int:
    depth = 0
    quote: str | None = None
    escape = False
    line_comment = False
    block_comment = False
    i = start_index
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue

        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in {"'", '"', "`"}:
            quote = ch
            i += 1
            continue
        if ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
            if depth == 0:
                return i
        i += 1

    raise ValueError(f"No matching {close_char!r} found")


def extract_examples_array(text: str) -> str:
    start = text.find("const examples = [")
    if start < 0:
        raise ValueError("Could not find `const examples = [`")
    bracket = text.find("[", start)
    end = find_matching(text, bracket, "[", "]")
    return text[bracket : end + 1]


def extract_function(text: str, name: str) -> str:
    match = re.search(rf"\bfunction\s+{re.escape(name)}\s*\(", text)
    if not match:
        raise ValueError(f"Could not find renderer function {name}")
    brace = text.find("{", match.end())
    end = find_matching(text, brace, "{", "}")
    return text[match.start() : end + 1]


def parse_examples(gallery: Path) -> list[Example]:
    text = gallery.read_text(encoding="utf-8")
    array_text = extract_examples_array(text)
    examples: list[Example] = []
    for match in EXAMPLE_RE.finditer(array_text):
        render = match.group("render")
        examples.append(
            Example(
                id=decode_js_string(match.group("id")),
                kicker=decode_js_string(match.group("kicker")),
                title=decode_js_string(match.group("title")),
                copy=decode_js_string(match.group("copy")),
                render=render,
                source=extract_function(text, render),
                size=decode_js_string(match.group("size")) if match.group("size") else None,
            )
        )
    return examples


def write_pattern(example: Example, output_dir: Path) -> None:
    path = output_dir / f"{example.id}.md"
    special_section = SPECIAL_SECTIONS.get(example.id, "")
    special_lines = ["", special_section, ""] if special_section else []
    path.write_text(
        "\n".join(
            [
                f"# {example.title}",
                "",
                f"- **Pattern ID:** `{example.pattern_id}`",
                f"- **Gallery source ID:** `{example.id}`",
                f"- **Family:** {example.kicker}",
                f"- **Use when:** {example.copy}",
                f"- **Renderer:** `{example.render}`",
                "",
                "## Reuse Contract",
                "",
                "- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.",
                "- Keep data deterministic and inline small datasets.",
                "- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.",
                "- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.",
                "- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.",
                "",
                *special_lines,
                "## Source Excerpt",
                "",
                "The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.",
                "",
                "```js",
                example.source,
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )


def extra_index_rows(index_path: Path, gallery_pattern_ids: set[str]) -> list[str]:
    if not index_path.exists():
        return []
    extras: list[str] = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*`(?P<pattern_id>d3-[^`]+)`\s*\|", line)
        if match and match.group("pattern_id") not in gallery_pattern_ids:
            extras.append(line)
    return extras


def write_index(examples: list[Example], index_path: Path, preserved_rows: list[str] | None = None) -> None:
    rows = [
        "# D3 Pattern Index",
        "",
        "Read this file when a user names a `d3-*` ID or asks to adapt a gallery pattern. Then read only the matching file under `references/patterns/`.",
        "",
        "Do not read the gallery source for normal pattern generation. Use the gallery source only when changing or validating the gallery fixture.",
        "",
        "| Pattern ID | Family | Title | Pattern Reference |",
        "| --- | --- | --- | --- |",
    ]
    for example in examples:
        rows.append(
            f"| `{example.pattern_id}` | {example.kicker} | {example.title} | `references/patterns/{example.id}.md` |"
        )
    rows.extend(preserved_rows or [])
    index_path.write_text("\n".join(rows) + "\n", encoding="utf-8")


def main() -> int:
    base = skill_dir()
    parser = argparse.ArgumentParser(description="Extract per-pattern references from the D3 gallery fixture.")
    parser.add_argument(
        "--gallery",
        type=Path,
        default=base / "assets" / "examples" / "d3-animated-svg" / "gallery.js",
        help="Path to gallery.js.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=base / "references" / "patterns",
        help="Directory for generated per-pattern references.",
    )
    parser.add_argument(
        "--index",
        type=Path,
        default=base / "references" / "pattern-index.md",
        help="Generated pattern index path.",
    )
    parser.add_argument("--expected", type=int, default=224, help="Expected gallery record count")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only", action="store_true", help="Validate gallery/reference/index coverage without writing files")
    mode.add_argument("--write-selected", action="store_true", help="Regenerate only the pattern IDs passed with --only")
    mode.add_argument("--replace-all", action="store_true", help="Explicitly regenerate every gallery-backed reference and index row")
    parser.add_argument("--only", action="append", default=[], help="Gallery source ID to regenerate; repeat with --write-selected")
    args = parser.parse_args()

    examples = parse_examples(args.gallery)
    if len(examples) != args.expected:
        print(f"Expected {args.expected} examples, found {len(examples)}", file=sys.stderr)
        return 1
    if len({example.id for example in examples}) != len(examples):
        print("Duplicate example IDs found", file=sys.stderr)
        return 1

    gallery_pattern_ids = {example.pattern_id for example in examples}
    if args.check_only:
        missing_references = [example.id for example in examples if not (args.output_dir / f"{example.id}.md").exists()]
        index_text = args.index.read_text(encoding="utf-8") if args.index.exists() else ""
        missing_index_rows = [
            example.id
            for example in examples
            if f"`{example.pattern_id}`" not in index_text or f"`references/patterns/{example.id}.md`" not in index_text
        ]
        payload = {
            "clean": not missing_references and not missing_index_rows,
            "exampleCount": len(examples),
            "wideCount": sum(example.size == "wide" for example in examples),
            "fullCount": sum(example.size == "full" for example in examples),
            "missingReferences": missing_references,
            "missingIndexRows": missing_index_rows,
        }
        print(json.dumps(payload, indent=2))
        return 0 if payload["clean"] else 1

    if args.write_selected:
        if not args.only:
            print("--write-selected requires at least one --only ID", file=sys.stderr)
            return 1
        by_id = {example.id: example for example in examples}
        missing_ids = sorted(set(args.only) - set(by_id))
        if missing_ids:
            print(f"Unknown gallery source IDs: {missing_ids}", file=sys.stderr)
            return 1
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for example_id in dict.fromkeys(args.only):
            write_pattern(by_id[example_id], args.output_dir)
        print(f"Wrote {len(dict.fromkeys(args.only))} selected pattern references to {args.output_dir}")
        return 0

    args.output_dir.mkdir(parents=True, exist_ok=True)
    preserved_rows = extra_index_rows(args.index, gallery_pattern_ids)
    for example in examples:
        write_pattern(example, args.output_dir)
    write_index(examples, args.index, preserved_rows)
    print(f"Wrote {len(examples)} pattern references to {args.output_dir}")
    print(f"Wrote pattern index to {args.index}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
