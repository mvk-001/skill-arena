#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "playwright>=1.52.0",
# ]
# ///

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


def parse_viewport(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+)x(\d+)", value.strip().lower())
    if not match:
        raise argparse.ArgumentTypeError("viewport must use WIDTHxHEIGHT, for example 1280x720")
    width = int(match.group(1))
    height = int(match.group(2))
    if width < 100 or height < 100:
        raise argparse.ArgumentTypeError("viewport dimensions must be at least 100 pixels")
    return width, height


def source_to_url(source: str) -> str:
    if re.match(r"^https?://", source) or source.startswith("file://"):
        return source
    path = Path(source).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Input HTML not found: {path}")
    return path.as_uri()


def ensure_svg_document(markup: str) -> str:
    markup = markup.strip()
    if not markup.startswith("<svg"):
        raise SystemExit("Selected element is not an SVG element.")
    start_tag = markup.split(">", 1)[0]
    if "xmlns=" not in start_tag:
        markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + markup + "\n"


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture a D3-generated SVG from an HTML page after browser rendering.",
    )
    parser.add_argument("input", help="HTML file, file URL, or HTTP URL that generates an SVG with D3")
    parser.add_argument("-o", "--output", type=Path, help="Path for the captured SVG")
    parser.add_argument("--selector", default="svg", help="CSS selector for the SVG to capture")
    parser.add_argument("--wait-ms", type=int, default=1200, help="Extra time to wait after load")
    parser.add_argument("--timeout-ms", type=int, default=30000, help="Browser operation timeout")
    parser.add_argument("--viewport", type=parse_viewport, default=parse_viewport("1280x720"))
    parser.add_argument("--screenshot", type=Path, help="Optional PNG screenshot of the selected SVG")
    parser.add_argument(
        "--wait-until",
        choices=("load", "domcontentloaded", "networkidle"),
        default="load",
        help="Page load state to wait for before the extra wait",
    )
    parser.add_argument(
        "--ignore-console-errors",
        action="store_true",
        help="Capture even when the page reports console or runtime errors",
    )
    args = parser.parse_args()

    output = args.output
    if output is None:
        input_path = Path(args.input)
        output = input_path.with_suffix(".captured.svg") if input_path.suffix else Path("captured.svg")

    url = source_to_url(args.input)
    width, height = args.viewport
    console_errors: list[str] = []
    page_errors: list[str] = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": width, "height": height})
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            page.goto(url, wait_until=args.wait_until, timeout=args.timeout_ms)
            page.wait_for_timeout(max(args.wait_ms, 0))

            locator = page.locator(args.selector).first
            locator.wait_for(state="attached", timeout=args.timeout_ms)
            info = locator.evaluate(
                """svg => {
                    const box = svg.getBoundingClientRect();
                    return {
                        tagName: svg.tagName.toLowerCase(),
                        markup: svg.outerHTML,
                        width: box.width,
                        height: box.height,
                        elementCount: svg.querySelectorAll("*").length,
                        textLength: (svg.textContent || "").trim().length,
                        animationCount: svg.querySelectorAll("animate, animateMotion, animateTransform").length,
                        styleCount: svg.querySelectorAll("style").length
                    };
                }"""
            )

            if info["tagName"] != "svg":
                raise SystemExit(f"Selector did not resolve to an SVG element: {args.selector}")
            if info["width"] <= 0 or info["height"] <= 0:
                raise SystemExit(f"SVG has an empty rendered box: {info['width']}x{info['height']}")
            if info["elementCount"] == 0:
                raise SystemExit("SVG has no child elements.")

            write_text(output.resolve(), ensure_svg_document(info["markup"]))

            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                locator.screenshot(path=str(args.screenshot.resolve()))

            browser.close()
    except PlaywrightError as error:
        print(f"[ERROR] Playwright failed: {error}", file=sys.stderr)
        print("Install a Chromium browser for Playwright if needed, then rerun the command.", file=sys.stderr)
        return 1

    if (console_errors or page_errors) and not args.ignore_console_errors:
        print("[ERROR] Browser reported errors while rendering the D3 page:", file=sys.stderr)
        for item in console_errors + page_errors:
            print(f"- {item}", file=sys.stderr)
        return 1

    print(f"Captured SVG: {output.resolve()}")
    print(f"Rendered box: {info['width']:.0f}x{info['height']:.0f}")
    print(f"SVG elements: {info['elementCount']}")
    print(f"Text characters: {info['textLength']}")
    print(f"Animation/style nodes: {info['animationCount'] + info['styleCount']}")
    if args.screenshot:
        print(f"Screenshot: {args.screenshot.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
