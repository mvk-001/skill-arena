#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=11.3.0",
#   "playwright>=1.52.0",
# ]
# ///

"""Capture every D3 gallery pattern and report visual-review signals."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


FINAL_FRAME_JS = r"""
() => {
  for (const svg of document.querySelectorAll("[data-example] svg")) {
    if (typeof svg.pauseAnimations === "function") svg.pauseAnimations();
    if (typeof svg.setCurrentTime === "function") {
      try { svg.setCurrentTime(60); } catch (_) {}
    }
  }
}
"""


REVIEW_JS = r"""
() => {
  const rootStyle = getComputedStyle(document.documentElement);
  const cards = Array.from(document.querySelectorAll("[data-example]"));

  function isVisible(node) {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0.01 && (rect.width > 0 || rect.height > 0);
  }

  function intersects(a, b) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 1 || height <= 1) return 0;
    const overlap = width * height;
    const smaller = Math.min(a.width * a.height, b.width * b.height);
    return smaller > 0 ? overlap / smaller : 0;
  }

  return cards.map((card, index) => {
    const svg = card.querySelector("svg");
    const svgRect = svg?.getBoundingClientRect();
    const title = svg?.querySelector(":scope > title");
    const desc = svg?.querySelector(":scope > desc");
    const texts = svg ? Array.from(svg.querySelectorAll("text")).filter(isVisible) : [];
    const groups = svg ? Array.from(svg.querySelectorAll("g")) : [];
    const textRects = texts.map((node, textIndex) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        textIndex,
        text: (node.textContent || "").trim().slice(0, 80),
        className: node.getAttribute("class") || "",
        x: rect.x,
        y: rect.y,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(style.fontSize || "0"),
        fontFamily: style.fontFamily || "",
        semanticGroupIndex: node.parentElement?.tagName.toLowerCase() === "g" ? groups.indexOf(node.parentElement) : -1
      };
    });
    const textOverflows = !svgRect ? [] : textRects.filter(rect =>
      rect.left < svgRect.left - 1 || rect.right > svgRect.right + 1 ||
      rect.top < svgRect.top - 1 || rect.bottom > svgRect.bottom + 1
    );
    const textOverlaps = [];
    for (let i = 0; i < textRects.length; i += 1) {
      for (let j = i + 1; j < textRects.length; j += 1) {
        const ratio = intersects(textRects[i], textRects[j]);
        const first = textRects[i];
        const second = textRects[j];
        const centerXDelta = Math.abs((first.left + first.right) / 2 - (second.left + second.right) / 2);
        const centerYDelta = Math.abs((first.top + first.bottom) / 2 - (second.top + second.bottom) / 2);
        const alignedEdge = Math.abs(first.left - second.left) < 2 || Math.abs(first.right - second.right) < 2 || centerXDelta < 2;
        const stackedLines = alignedEdge && centerYDelta >= Math.min(first.height, second.height) * 0.55 && ratio <= 0.55;
        const sameSemanticGroup = first.semanticGroupIndex >= 0 && first.semanticGroupIndex === second.semanticGroupIndex;
        if (ratio >= 0.18 && !stackedLines && !sameSemanticGroup) {
          textOverlaps.push({
            first: textRects[i].text,
            second: textRects[j].text,
            ratio: Number(ratio.toFixed(3))
          });
        }
      }
    }
    const markNodes = svg ? Array.from(svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,image,use"))
      .filter(node => !node.closest("defs")) : [];
    const visibleMarks = markNodes.filter(isVisible);
    const markOverflows = !svgRect ? [] : visibleMarks.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < svgRect.left - 2 || rect.right > svgRect.right + 2 ||
        rect.top < svgRect.top - 2 || rect.bottom > svgRect.bottom + 2;
    });
    const animationCount = svg ? svg.querySelectorAll("animate,animateMotion,animateTransform").length : 0;
    const ariaLabelledby = svg?.getAttribute("aria-labelledby") || "";
    const titleId = title?.id || "";
    const descId = desc?.id || "";
    const fonts = Array.from(new Set(textRects.map(item => item.fontFamily).filter(Boolean)));
    const physicalTextHeights = textRects.map(item => item.height).filter(value => value > 0);
    const intentionalScrollable = card.classList.contains("example-card--wide") || card.classList.contains("example-card--full");
    const horizontalOverflow = card.scrollWidth > card.clientWidth + 1;
    return {
      index,
      id: card.getAttribute("data-example") || "",
      patternId: card.getAttribute("data-pattern-id") || "",
      title: card.querySelector("h2")?.textContent?.trim() || "",
      cardWidth: Number(card.getBoundingClientRect().width.toFixed(2)),
      svgWidth: svgRect ? Number(svgRect.width.toFixed(2)) : 0,
      svgHeight: svgRect ? Number(svgRect.height.toFixed(2)) : 0,
      markNodeCount: markNodes.length,
      visibleMarkCount: visibleMarks.length,
      markOverflowCount: markOverflows.length,
      markOverflowSamples: markOverflows.slice(0, 6).map(node => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || "",
        className: node.getAttribute("class") || ""
      })),
      animationCount,
      textCount: textRects.length,
      minPhysicalTextHeight: physicalTextHeights.length ? Number(Math.min(...physicalTextHeights).toFixed(2)) : null,
      medianPhysicalTextHeight: physicalTextHeights.length ? Number(physicalTextHeights.sort((a, b) => a - b)[Math.floor(physicalTextHeights.length / 2)].toFixed(2)) : null,
      textOverflowCount: textOverflows.length,
      textOverflowSamples: textOverflows.slice(0, 6).map(item => item.text),
      textOverlapCount: textOverlaps.length,
      textOverlapSamples: textOverlaps.slice(0, 6),
      fontFamilies: fonts,
      hasTitle: Boolean(title?.textContent?.trim()),
      hasDesc: Boolean(desc?.textContent?.trim()),
      ariaReferencesTitleAndDesc: Boolean(titleId && descId && ariaLabelledby.split(/\s+/).includes(titleId) && ariaLabelledby.split(/\s+/).includes(descId)),
      horizontalOverflow,
      intentionalScrollable,
      unexpectedHorizontalOverflow: horizontalOverflow && !intentionalScrollable,
      styleVersion: svg?.dataset.styleVersion || null,
      colorSet: svg?.dataset.colorSet || null
    };
  });
}
"""


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


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    return slug[:96] or "pattern"


def load_font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/Library/Fonts/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def build_contact_sheets(
    rows: list[dict[str, Any]],
    card_paths: list[Path],
    output_dir: Path,
    columns: int,
    rows_per_sheet: int,
    thumb_width: int,
) -> list[str]:
    sheet_dir = output_dir / "contact-sheets"
    sheet_dir.mkdir(parents=True, exist_ok=True)
    cell_padding = 14
    label_height = 48
    thumb_height = round(thumb_width * 420 / 560)
    cell_width = thumb_width + cell_padding * 2
    cell_height = thumb_height + label_height + cell_padding * 2
    batch_size = columns * rows_per_sheet
    font = load_font(15)
    small_font = load_font(12)
    outputs: list[str] = []

    for sheet_index, start in enumerate(range(0, len(rows), batch_size), start=1):
        subset = rows[start : start + batch_size]
        sheet_rows = max(1, math.ceil(len(subset) / columns))
        canvas = Image.new("RGB", (cell_width * columns, cell_height * sheet_rows), "#f7f7f7")
        draw = ImageDraw.Draw(canvas)
        for offset, row in enumerate(subset):
            col = offset % columns
            line = offset // columns
            x = col * cell_width + cell_padding
            y = line * cell_height + cell_padding
            with Image.open(card_paths[start + offset]) as source:
                image = ImageOps.contain(source.convert("RGB"), (thumb_width, thumb_height), Image.Resampling.LANCZOS)
                frame = Image.new("RGB", (thumb_width, thumb_height), "white")
                frame.paste(image, ((thumb_width - image.width) // 2, (thumb_height - image.height) // 2))
            canvas.paste(frame, (x, y))
            draw.rectangle((x, y, x + thumb_width - 1, y + thumb_height - 1), outline="#cfcfcf", width=1)
            draw.text((x, y + thumb_height + 8), f"{row['index'] + 1:03d}  {row['id']}", fill="#333e48", font=font)
            draw.text((x, y + thumb_height + 28), row["title"][:56], fill="#696969", font=small_font)
        path = sheet_dir / f"contact-sheet-{sheet_index:02d}.png"
        canvas.save(path, optimize=True)
        outputs.append(path.as_posix())
    return outputs


def write_markdown_report(path: Path, payload: dict[str, Any]) -> None:
    findings = payload["summary"]
    lines = [
        "# D3 Gallery Visual Review",
        "",
        f"- Source: `{payload['source']}`",
        f"- Viewport: `{payload['viewport']['width']}x{payload['viewport']['height']}`",
        f"- Patterns reviewed: {payload['patternCount']}",
        f"- Contract failures: {findings['contractFailureCount']}",
        f"- Cards with text overflow signals: {findings['textOverflowPatternCount']}",
        f"- Cards with text overlap signals: {findings['textOverlapPatternCount']}",
        f"- Cards with tiny rendered text signals: {findings['tinyTextPatternCount']}",
        f"- Cards with mark overflow signals: {findings['markOverflowPatternCount']}",
        f"- Cards with intentional horizontal scrolling: {findings['intentionalHorizontalOverflowPatternCount']}",
        f"- Cards with unexpected horizontal overflow: {findings['unexpectedHorizontalOverflowPatternCount']}",
        "",
        "Heuristic text findings are review signals, not automatic failures. Inspect the contact sheets before changing data geometry.",
        "",
        "## Pattern Signals",
        "",
        "| Pattern | Min text px | Text overflow | Text overlaps | Mark overflow | Horizontal overflow |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in payload["patterns"]:
        if row["textOverflowCount"] or row["textOverlapCount"] or row["markOverflowCount"] or row["horizontalOverflow"] or (
            row["minPhysicalTextHeight"] is not None and row["minPhysicalTextHeight"] < payload["tinyTextThresholdPx"]
        ):
            min_text = "-" if row["minPhysicalTextHeight"] is None else f"{row['minPhysicalTextHeight']:.2f}"
            lines.append(
                f"| `{row['id']}` | {min_text} | {row['textOverflowCount']} | {row['textOverlapCount']} | {row['markOverflowCount']} | "
                f"{'expected' if row['intentionalScrollable'] and row['horizontalOverflow'] else 'unexpected' if row['unexpectedHorizontalOverflow'] else 'no'} |"
            )
    lines.extend(["", "## Contact Sheets", ""])
    lines.extend(f"- `{item}`" for item in payload["contactSheets"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Gallery HTML file, file URL, or HTTP URL")
    parser.add_argument("--output-dir", type=Path, required=True, help="Artifact directory for card captures and contact sheets")
    parser.add_argument("--json-report", type=Path, required=True)
    parser.add_argument("--markdown-report", type=Path)
    parser.add_argument("--expected", type=int, default=0, help="Expected pattern count; 0 reads body[data-example-count]")
    parser.add_argument("--wait-ms", type=int, default=2200)
    parser.add_argument("--timeout-ms", type=int, default=60000)
    parser.add_argument("--viewport", type=parse_viewport, default=parse_viewport("1440x1100"))
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows-per-sheet", type=int, default=4)
    parser.add_argument("--thumb-width", type=int, default=340)
    parser.add_argument("--tiny-text-threshold-px", type=float, default=8.0)
    parser.add_argument("--expect-clean", action="store_true", help="Fail on contract or browser errors; heuristic visual signals remain advisory")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.columns < 1 or args.rows_per_sheet < 1 or args.thumb_width < 160:
        raise SystemExit("columns and rows-per-sheet must be positive; thumb-width must be at least 160")
    url = source_to_url(args.input)
    width, height = args.viewport
    output_dir = args.output_dir.resolve()
    cards_dir = output_dir / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []
    page_errors: list[str] = []
    rows: list[dict[str, Any]] = []
    card_paths: list[Path] = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": height})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(url, wait_until="load", timeout=args.timeout_ms)
            page.wait_for_timeout(max(args.wait_ms, 0))
            page.evaluate(FINAL_FRAME_JS)
            page.wait_for_timeout(100)
            rows = page.evaluate(REVIEW_JS)
            expected = args.expected
            if expected <= 0:
                raw_expected = page.locator("body").get_attribute("data-example-count")
                expected = int(raw_expected or 0)
            if expected <= 0:
                raise RuntimeError("No expected count and body[data-example-count] is missing.")
            cards = page.locator("[data-example]")
            if len(rows) != expected or cards.count() != expected:
                raise RuntimeError(f"Expected {expected} patterns, found {len(rows)} review rows and {cards.count()} cards.")
            for index, row in enumerate(rows):
                path = cards_dir / f"{index + 1:03d}-{safe_slug(row['id'])}.png"
                cards.nth(index).locator(".viz-frame").screenshot(path=str(path))
                card_paths.append(path)
            browser.close()
    except (PlaywrightError, RuntimeError) as error:
        print(f"[ERROR] Gallery visual review failed: {error}", file=sys.stderr)
        return 1

    contract_failures = [
        row for row in rows
        if not row["hasTitle"] or not row["hasDesc"] or not row["ariaReferencesTitleAndDesc"] or
        (row["markNodeCount"] > 0 and row["visibleMarkCount"] == 0) or row["animationCount"] == 0
    ]
    summary = {
        "contractFailureCount": len(contract_failures),
        "contractFailureIds": [row["id"] for row in contract_failures],
        "textOverflowPatternCount": sum(row["textOverflowCount"] > 0 for row in rows),
        "textOverlapPatternCount": sum(row["textOverlapCount"] > 0 for row in rows),
        "tinyTextPatternCount": sum(
            row["minPhysicalTextHeight"] is not None and row["minPhysicalTextHeight"] < args.tiny_text_threshold_px
            for row in rows
        ),
        "markOverflowPatternCount": sum(row["markOverflowCount"] > 0 for row in rows),
        "horizontalOverflowPatternCount": sum(row["horizontalOverflow"] for row in rows),
        "intentionalHorizontalOverflowPatternCount": sum(row["horizontalOverflow"] and row["intentionalScrollable"] for row in rows),
        "unexpectedHorizontalOverflowPatternCount": sum(row["unexpectedHorizontalOverflow"] for row in rows),
        "consoleErrorCount": len(console_errors),
        "pageErrorCount": len(page_errors),
    }
    contact_sheets = build_contact_sheets(
        rows,
        card_paths,
        output_dir,
        args.columns,
        args.rows_per_sheet,
        args.thumb_width,
    )
    payload = {
        "clean": not contract_failures and not console_errors and not page_errors,
        "source": url,
        "viewport": {"width": width, "height": height},
        "patternCount": len(rows),
        "tinyTextThresholdPx": args.tiny_text_threshold_px,
        "summary": summary,
        "consoleErrors": console_errors,
        "pageErrors": page_errors,
        "contactSheets": contact_sheets,
        "patterns": rows,
    }
    args.json_report.parent.mkdir(parents=True, exist_ok=True)
    args.json_report.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    if args.markdown_report:
        write_markdown_report(args.markdown_report, payload)

    print(json.dumps({"clean": payload["clean"], "patternCount": len(rows), "summary": summary}, indent=2))
    print(f"Contact sheets: {len(contact_sheets)}")
    print(f"JSON report: {args.json_report.resolve()}")
    if args.markdown_report:
        print(f"Markdown report: {args.markdown_report.resolve()}")
    if args.expect_clean and not payload["clean"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
