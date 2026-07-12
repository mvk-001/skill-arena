#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "playwright>=1.52.0",
# ]
# ///

"""Verify a styled D3 gallery version in a real browser."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_SOURCE = (
    REPO_ROOT
    / ".agents"
    / "skills"
    / "d3-animated-svg"
    / "assets"
    / "examples"
    / "d3-animated-svg-cs1"
    / "index.html"
)
DEFAULT_PALETTE = REPO_ROOT / "design" / "colorset1.yml"


def parse_viewport(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+)x(\d+)", value.strip().lower())
    if not match:
        raise argparse.ArgumentTypeError("viewport must use WIDTHxHEIGHT, for example 1440x1100")
    width, height = int(match.group(1)), int(match.group(2))
    if width < 320 or height < 320:
        raise argparse.ArgumentTypeError("viewport dimensions must be at least 320 pixels")
    return width, height


def source_to_url(source: str) -> str:
    if re.match(r"^https?://", source) or source.startswith("file://"):
        return source
    path = Path(source).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Input HTML not found: {path}")
    return path.as_uri()


def load_allowed_colors(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Palette file not found: {path}")
    content = path.read_text(encoding="utf-8")
    colors = sorted({match.lower() for match in re.findall(r'value:\s*["\']?(#[0-9a-fA-F]{6})', content)})
    if not colors:
        raise SystemExit(f"No hex colors found in {path}")
    return colors


VERIFY_JS = r"""
({ expected, allowedColors, styleVersion, colorSet, paletteName, patternIdPrefix, patternIdSuffix }) => {
  const allowed = new Set(allowedColors.map(color => color.toLowerCase()));
  const findings = [];
  const paintAttributes = ["fill", "stroke", "stop-color", "flood-color"];
  const namedColors = new Map([
    ["black", "#000000"],
    ["white", "#ffffff"]
  ]);

  function normalizeColor(value) {
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw || raw === "none" || raw === "transparent" || raw === "currentcolor" || raw.startsWith("url(")) return null;
    if (namedColors.has(raw)) return namedColors.get(raw);
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (hex) {
      const value = hex[1];
      if (value.length === 3) return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
      return `#${value}`;
    }
    const rgb = raw.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
      const parts = rgb[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
      if (parts.length >= 3) {
        const alpha = parts.length > 3 ? Number(parts[3]) : 1;
        if (Number.isFinite(alpha) && alpha <= 0) return null;
        const channel = part => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0");
        return `#${channel(parts[0])}${channel(parts[1])}${channel(parts[2])}`;
      }
    }
    return null;
  }

  function collectStyleColors(styleText) {
    if (!styleText) return [];
    const colors = [];
    const matches = styleText.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]+\)|\b(?:black|white)\b/g) || [];
    for (const match of matches) {
      const normalized = normalizeColor(match);
      if (normalized) colors.push({ raw: match, normalized });
    }
    return colors;
  }

  function expectedPatternId(exampleId) {
    const basePatternId = `d3-${exampleId}`;
    if (patternIdSuffix) return `${basePatternId}-${patternIdSuffix}`;
    return `${patternIdPrefix}${exampleId}`;
  }

  if (document.body.dataset.styleVersion !== styleVersion) {
    findings.push(`Body style version is ${document.body.dataset.styleVersion || "missing"}.`);
  }
  if (document.body.dataset.colorSet !== colorSet) {
    findings.push(`Body color set is ${document.body.dataset.colorSet || "missing"}.`);
  }
  if (document.body.dataset.paletteName !== paletteName) {
    findings.push(`Body palette name is ${document.body.dataset.paletteName || "missing"}.`);
  }

  const cards = Array.from(document.querySelectorAll("[data-example]"));
  if (cards.length !== expected) {
    findings.push(`Expected ${expected} styled cards, found ${cards.length}.`);
  }
  const svgCount = document.querySelectorAll("[data-example] svg").length;
  if (svgCount !== expected) {
    findings.push(`Expected ${expected} styled SVGs, found ${svgCount}.`);
  }

  const badPatternIds = [];
  const badSvgMetadata = [];
  const badCardMetadata = [];
  const badPaints = [];
  const badCardsWithShadows = [];
  const seenPatternIds = new Set();

  for (const card of cards) {
    const exampleId = card.dataset.example;
    const expectedId = expectedPatternId(exampleId);
    const patternId = card.dataset.patternId || "";
    const basePatternId = card.dataset.basePatternId || "";
    const svg = card.querySelector("svg");
    if (patternId !== expectedId) {
      badPatternIds.push({ exampleId, patternId, expectedId });
    }
    if (seenPatternIds.has(patternId)) {
      badPatternIds.push({ exampleId, patternId, duplicate: true });
    }
    seenPatternIds.add(patternId);
    if (basePatternId !== `d3-${exampleId}` || card.dataset.styleVersion !== styleVersion) {
      badCardMetadata.push({ exampleId, basePatternId, styleVersion: card.dataset.styleVersion || null });
    }
    if (
      !svg ||
      svg.dataset.styleVersion !== styleVersion ||
      svg.dataset.colorSet !== colorSet ||
      svg.dataset.paletteName !== paletteName ||
      svg.dataset.basePatternId !== `d3-${exampleId}`
    ) {
      badSvgMetadata.push({
        exampleId,
        styleVersion: svg?.dataset.styleVersion || null,
        colorSet: svg?.dataset.colorSet || null,
        paletteName: svg?.dataset.paletteName || null,
        basePatternId: svg?.dataset.basePatternId || null
      });
      continue;
    }
    const shadow = window.getComputedStyle(card).boxShadow;
    if (shadow && shadow !== "none") {
      badCardsWithShadows.push({ exampleId, shadow });
    }
    const nodes = [svg, ...Array.from(svg.querySelectorAll("*"))];
    for (const node of nodes) {
      for (const attr of paintAttributes) {
        const raw = node.getAttribute(attr);
        const normalized = normalizeColor(raw);
        if (normalized && !allowed.has(normalized)) {
          badPaints.push({ exampleId, tag: node.tagName.toLowerCase(), attr, raw, normalized });
        }
      }
      for (const styleColor of collectStyleColors(node.getAttribute("style"))) {
        if (!allowed.has(styleColor.normalized)) {
          badPaints.push({
            exampleId,
            tag: node.tagName.toLowerCase(),
            attr: "style",
            raw: styleColor.raw,
            normalized: styleColor.normalized
          });
        }
      }
    }
  }

  if (badPatternIds.length) findings.push(`Bad styled pattern IDs: ${JSON.stringify(badPatternIds.slice(0, 8))}`);
  if (badCardMetadata.length) findings.push(`Bad styled card metadata: ${JSON.stringify(badCardMetadata.slice(0, 8))}`);
  if (badSvgMetadata.length) findings.push(`Bad styled SVG metadata: ${JSON.stringify(badSvgMetadata.slice(0, 8))}`);
  if (badCardsWithShadows.length) findings.push(`Styled cards still use shadows: ${JSON.stringify(badCardsWithShadows.slice(0, 8))}`);
  if (badPaints.length) findings.push(`Paint values outside styled palette: ${JSON.stringify(badPaints.slice(0, 16))}`);

  const metadata = window.D3_ANIMATED_SVG_EXAMPLES || [];
  const metadataFailures = metadata.filter(item =>
    item.styleVersion !== styleVersion ||
    item.colorSet !== colorSet ||
    item.patternId !== expectedPatternId(item.id) ||
    item.basePatternId !== `d3-${item.id}`
  );
  if (metadata.length !== expected) {
    findings.push(`Expected ${expected} metadata records, found ${metadata.length}.`);
  }
  if (metadataFailures.length) {
    findings.push(`Styled metadata failures: ${JSON.stringify(metadataFailures.slice(0, 8))}`);
  }

  return {
    clean: findings.length === 0,
    findings,
    cardCount: cards.length,
    svgCount,
    uniquePatternIds: seenPatternIds.size,
    paletteSize: allowed.size,
    badPaintCount: badPaints.length
  };
}
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", default=str(DEFAULT_SOURCE), help="Styled gallery HTML file, file URL, or HTTP URL")
    parser.add_argument("--palette-file", type=Path, default=DEFAULT_PALETTE)
    parser.add_argument("--style-version", default="cs1")
    parser.add_argument("--color-set", default="colorset1")
    parser.add_argument("--palette-name", default="basic-red-neutral-style")
    parser.add_argument("--pattern-id-prefix", default="")
    parser.add_argument("--pattern-id-suffix", default="cs1")
    parser.add_argument("--expected", type=int, default=224)
    parser.add_argument("--wait-ms", type=int, default=1800)
    parser.add_argument("--timeout-ms", type=int, default=60000)
    parser.add_argument("--viewport", type=parse_viewport, default=parse_viewport("1440x1100"))
    parser.add_argument("--screenshot", type=Path, help="Optional full-page screenshot path")
    parser.add_argument("--json-report", type=Path, help="Optional JSON report output path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    allowed_colors = load_allowed_colors(args.palette_file)
    url = source_to_url(args.input)
    width, height = args.viewport
    console_errors: list[str] = []
    page_errors: list[str] = []
    result: dict[str, Any]

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": height})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(url, wait_until="load", timeout=args.timeout_ms)
            page.wait_for_timeout(max(args.wait_ms, 0))
            result = page.evaluate(
                VERIFY_JS,
                {
                    "expected": args.expected,
                    "allowedColors": allowed_colors,
                    "styleVersion": args.style_version,
                    "colorSet": args.color_set,
                    "paletteName": args.palette_name,
                    "patternIdPrefix": args.pattern_id_prefix,
                    "patternIdSuffix": args.pattern_id_suffix,
                },
            )
            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(args.screenshot.resolve()), full_page=True)
            browser.close()
    except PlaywrightError as error:
        print(f"[ERROR] Playwright failed: {error}", file=sys.stderr)
        return 1

    if console_errors or page_errors:
        result.setdefault("findings", []).extend([*console_errors, *page_errors])
        result["clean"] = False

    if args.json_report:
        args.json_report.parent.mkdir(parents=True, exist_ok=True)
        args.json_report.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(json.dumps(result, indent=2))
    return 0 if result.get("clean") else 1


if __name__ == "__main__":
    raise SystemExit(main())
