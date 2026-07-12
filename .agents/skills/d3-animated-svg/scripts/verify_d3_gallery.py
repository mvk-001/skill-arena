#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "playwright>=1.52.0",
# ]
# ///

from __future__ import annotations

import argparse
from datetime import datetime
import math
import re
import sys
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright


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


def noaa_subsolar_tuple(timestamp_text: str) -> tuple[float, float, float]:
    timestamp = datetime.fromisoformat(timestamp_text.replace("Z", "+00:00"))
    day_of_year = timestamp.timetuple().tm_yday
    days_in_year = 366 if timestamp.replace(month=12, day=31).timetuple().tm_yday == 366 else 365
    utc_hour = timestamp.hour + timestamp.minute / 60 + timestamp.second / 3600
    gamma = 2 * math.pi / days_in_year * (day_of_year - 1 + (utc_hour - 12) / 24)
    equation_of_time = 229.18 * (
        0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma)
    )
    declination = (
        0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    ) * 180 / math.pi
    longitude = ((720 - utc_hour * 60 - equation_of_time) / 4 + 540) % 360 - 180
    return equation_of_time, declination, longitude


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the D3 animated SVG examples gallery in a real browser.")
    parser.add_argument("input", help="Gallery HTML file, file URL, or HTTP URL")
    parser.add_argument(
        "--expected",
        type=int,
        default=0,
        help="Expected number of example panels. When omitted, read document.body.dataset.exampleCount.",
    )
    parser.add_argument("--wait-ms", type=int, default=1800, help="Extra time after load before inspection")
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--viewport", type=parse_viewport, default=parse_viewport("1440x1100"))
    parser.add_argument("--screenshot", type=Path, help="Optional full-page screenshot path")
    parser.add_argument("--replay-all", action="store_true", help="Exercise every card replay control instead of three representative cards")
    args = parser.parse_args()

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
            page.goto(url, wait_until="load", timeout=args.timeout_ms)
            page.wait_for_timeout(max(args.wait_ms, 0))

            expected = args.expected
            if expected <= 0:
                raw_expected = page.locator("body").get_attribute("data-example-count")
                if not raw_expected:
                    raise SystemExit("No --expected value and page did not expose body[data-example-count].")
                expected = int(raw_expected)

            examples = page.locator("[data-example]")
            example_count = examples.count()
            svg_count = page.locator("[data-example] svg").count()
            if example_count != expected:
                raise SystemExit(f"Expected {expected} examples, found {example_count}.")
            if svg_count != expected:
                raise SystemExit(f"Expected {expected} SVGs, found {svg_count}.")

            id_report = page.evaluate(
                """() => {
                    const ids = Array.from(document.querySelectorAll("[id]"), node => node.id).filter(Boolean);
                    const seen = new Set();
                    const duplicates = new Set();
                    for (const id of ids) {
                        if (seen.has(id)) duplicates.add(id);
                        seen.add(id);
                    }
                    const mismatches = Array.from(document.querySelectorAll("[data-example]")).flatMap(card => {
                        const exampleId = card.getAttribute("data-example");
                        const svg = card.querySelector("svg");
                        return svg && svg.id === exampleId ? [] : [{ exampleId, svgId: svg ? svg.id : null }];
                    });
                    return { duplicates: Array.from(duplicates), mismatches };
                }"""
            )
            if id_report["duplicates"]:
                raise SystemExit(f"Duplicate DOM IDs found in gallery: {id_report['duplicates']}")
            if id_report["mismatches"]:
                raise SystemExit(f"Card/SVG ID mismatches found in gallery: {id_report['mismatches']}")

            pattern_report = page.evaluate(
                """() => {
                    const cards = Array.from(document.querySelectorAll("[data-example]"));
                    const seen = new Set();
                    const duplicates = new Set();
                    const missing = [];
                    const mismatches = [];
                    const invalid = [];
                    for (const card of cards) {
                        const exampleId = card.getAttribute("data-example");
                        const patternId = card.getAttribute("data-pattern-id");
                        const svgPatternId = card.querySelector("svg")?.getAttribute("data-pattern-id");
                        if (!patternId) {
                            missing.push(exampleId);
                            continue;
                        }
                        if (!/^[a-z0-9][a-z0-9-]*$/.test(patternId)) {
                            invalid.push({ exampleId, patternId });
                        }
                        if (seen.has(patternId)) duplicates.add(patternId);
                        seen.add(patternId);
                        if (card.id !== patternId || svgPatternId !== patternId) {
                            mismatches.push({ exampleId, cardId: card.id, patternId, svgPatternId });
                        }
                    }
                    return {
                        count: seen.size,
                        duplicates: Array.from(duplicates),
                        missing,
                        mismatches,
                        invalid
                    };
                }"""
            )
            if pattern_report["missing"]:
                raise SystemExit(f"Example cards missing data-pattern-id: {pattern_report['missing']}")
            if pattern_report["invalid"]:
                raise SystemExit(f"Invalid pattern IDs found: {pattern_report['invalid']}")
            if pattern_report["duplicates"]:
                raise SystemExit(f"Duplicate pattern IDs found: {pattern_report['duplicates']}")
            if pattern_report["mismatches"]:
                raise SystemExit(f"Pattern ID mismatches found: {pattern_report['mismatches']}")
            if pattern_report["count"] != expected:
                raise SystemExit(f"Expected {expected} unique pattern IDs, found {pattern_report['count']}.")
            pattern_id_count = pattern_report["count"]

            reports = page.locator("[data-example] svg").evaluate_all(
                """svgs => svgs.map(svg => {
                    const box = svg.getBoundingClientRect();
                    return {
                        id: svg.id,
                        width: box.width,
                        height: box.height,
                        elementCount: svg.querySelectorAll("*").length,
                        textLength: (svg.textContent || "").trim().length,
                        animationCount: svg.querySelectorAll("animate, animateMotion, animateTransform").length,
                        hasTitle: Boolean(svg.querySelector(":scope > title")?.textContent?.trim()),
                        hasDesc: Boolean(svg.querySelector(":scope > desc")?.textContent?.trim()),
                        ariaLabelledby: svg.getAttribute("aria-labelledby") || "",
                        titleId: svg.querySelector(":scope > title")?.id || "",
                        descId: svg.querySelector(":scope > desc")?.id || ""
                    };
                })"""
            )

            bad = [
                item for item in reports
                if item["width"] <= 0 or item["height"] <= 0 or item["elementCount"] < 10
            ]
            if bad:
                raise SystemExit(f"SVG panels failed size/content checks: {bad}")
            accessibility_bad = [
                item for item in reports
                if not item["hasTitle"] or not item["hasDesc"] or
                item["titleId"] not in item["ariaLabelledby"].split() or
                item["descId"] not in item["ariaLabelledby"].split()
            ]
            if accessibility_bad:
                raise SystemExit(f"SVG panels failed title/description accessibility checks: {accessibility_bad}")

            solar = page.locator('[data-example="solar-terminator"] svg')
            if solar.count() != 1:
                raise SystemExit(f"Expected one Solar Terminator SVG, found {solar.count()}.")
            solar_contract = solar.evaluate(
                """svg => ({
                    timestamp: svg.dataset.timestamp || "",
                    astronomyModel: svg.dataset.astronomyModel || "",
                    equationOfTime: Number(svg.dataset.equationOfTimeMinutes),
                    longitude: Number(svg.dataset.subsolarLongitude),
                    declination: Number(svg.dataset.subsolarDeclination),
                    visibleText: (svg.textContent || "").replace(/\\s+/g, " ").trim()
                })"""
            )
            try:
                expected_eot, expected_declination, expected_longitude = noaa_subsolar_tuple(solar_contract["timestamp"])
            except (TypeError, ValueError) as error:
                raise SystemExit(f"Solar Terminator has an invalid UTC timestamp contract: {solar_contract}") from error
            solar_deltas = {
                "equationOfTime": abs(solar_contract["equationOfTime"] - expected_eot),
                "declination": abs(solar_contract["declination"] - expected_declination),
                "longitude": abs(solar_contract["longitude"] - expected_longitude),
            }
            if (
                solar_contract["astronomyModel"] != "noaa-fractional-year"
                or not solar_contract["timestamp"].endswith("Z")
                or any(not math.isfinite(value) or value > 0.01 for value in solar_deltas.values())
                or "UTC" not in solar_contract["visibleText"]
                or "declination" not in solar_contract["visibleText"].lower()
            ):
                raise SystemExit(
                    f"Solar Terminator timestamp/astronomy contract is inconsistent: {solar_contract}; deltas={solar_deltas}"
                )

            replay_buttons = page.locator("[data-example] [data-replay]")
            replay_button_count = replay_buttons.count()
            if replay_button_count != expected:
                raise SystemExit(f"Expected {expected} per-card replay buttons, found {replay_button_count}.")

            sample_indexes = list(range(expected)) if args.replay_all else sorted(set([0, expected // 2, expected - 1]))
            repeat_check_indexes = set([0, expected // 2, expected - 1])
            replay_reports = []
            for index in sample_indexes:
                card = examples.nth(index)
                example_id = card.get_attribute("data-example")
                if not example_id:
                    raise SystemExit(f"Example card at index {index} is missing data-example.")
                button = card.locator("[data-replay]")
                if button.count() != 1:
                    raise SystemExit(f"Expected one replay button for {example_id}, found {button.count()}.")
                target_id = button.get_attribute("data-replay")
                if target_id != example_id:
                    raise SystemExit(f"Replay target mismatch for {example_id}: button targets {target_id}.")

                button.wait_for(state="visible", timeout=args.timeout_ms)
                render_pass_before = card.get_attribute("data-render-pass")
                all_render_passes_before = examples.evaluate_all(
                    "cards => cards.map(card => card.getAttribute('data-render-pass'))"
                )
                timeline_start = button.evaluate(
                    """button => {
                        const card = button.closest("[data-example]");
                        button.click();
                        const svg = card?.querySelector("svg");
                        return {
                            currentTime: svg && typeof svg.getCurrentTime === "function" ? svg.getCurrentTime() : null,
                            replayState: card?.getAttribute("data-replay-state") || null,
                            renderPass: card?.getAttribute("data-render-pass") || null
                        };
                    }"""
                )
                render_pass_after = timeline_start["renderPass"]
                if render_pass_before == render_pass_after:
                    raise SystemExit(f"Replay button for {example_id} did not trigger a new render pass.")
                all_render_passes_after = examples.evaluate_all(
                    "cards => cards.map(card => card.getAttribute('data-render-pass'))"
                )
                changed_indexes = [
                    candidate_index
                    for candidate_index, (before, after) in enumerate(zip(all_render_passes_before, all_render_passes_after, strict=True))
                    if before != after
                ]
                if changed_indexes != [index]:
                    raise SystemExit(
                        f"Replay for {example_id} changed cards {changed_indexes}; expected only index {index}."
                    )

                if timeline_start["replayState"] != "running":
                    raise SystemExit(f"Replay button for {example_id} did not expose running replay state.")
                if timeline_start["currentTime"] is not None and timeline_start["currentTime"] > 0.2:
                    raise SystemExit(
                        f"Replay button for {example_id} did not reset SVG timeline: {timeline_start}"
                    )

                page.wait_for_timeout(70 if args.replay_all else 420)
                timeline_after = card.locator("svg").evaluate(
                    """svg => ({
                        currentTime: typeof svg.getCurrentTime === "function" ? svg.getCurrentTime() : null
                    })"""
                )
                if (
                    timeline_start["currentTime"] is not None
                    and timeline_after["currentTime"] is not None
                    and timeline_after["currentTime"] <= timeline_start["currentTime"]
                ):
                    raise SystemExit(
                        f"Replay button for {example_id} reset the timeline but it did not advance: "
                        f"{timeline_start} -> {timeline_after}"
                    )

                replay_report = card.locator("svg").evaluate(
                    """svg => ({
                        id: svg.id,
                        elementCount: svg.querySelectorAll("*").length,
                        animationCount: svg.querySelectorAll("animate, animateMotion, animateTransform").length
                    })"""
                )
                replay_reports.append(replay_report)
                if replay_report["animationCount"] == 0 or replay_report["elementCount"] < 10:
                    raise SystemExit(f"Replay left {example_id} without expected animated SVG content: {replay_report}")
                if index in repeat_check_indexes:
                    button.click()
                    page.wait_for_timeout(35 if args.replay_all else 80)
                    repeated_report = card.locator("svg").evaluate(
                        """svg => ({
                            elementCount: svg.querySelectorAll("*").length,
                            animationCount: svg.querySelectorAll("animate, animateMotion, animateTransform").length
                        })"""
                    )
                    if repeated_report != {
                        "elementCount": replay_report["elementCount"],
                        "animationCount": replay_report["animationCount"],
                    }:
                        raise SystemExit(
                            f"Repeated replay changed SVG structure for {example_id}: "
                            f"{replay_report} -> {repeated_report}"
                        )

            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(args.screenshot.resolve()), full_page=True)

            browser.close()
    except PlaywrightError as error:
        print(f"[ERROR] Playwright failed: {error}", file=sys.stderr)
        return 1

    if console_errors or page_errors:
        print("[ERROR] Browser reported errors while rendering the D3 gallery:", file=sys.stderr)
        for item in console_errors + page_errors:
            print(f"- {item}", file=sys.stderr)
        return 1

    print(f"Verified examples: {example_count}")
    print(f"Verified unique pattern IDs: {pattern_id_count}")
    print(f"Verified per-card replay buttons: {replay_button_count}; exercised {len(replay_reports)}")
    for item in reports:
        print(
            f"- {item['id']}: {item['width']:.0f}x{item['height']:.0f}, "
            f"{item['elementCount']} elements, {item['animationCount']} animation nodes"
        )
    if args.screenshot:
        print(f"Screenshot: {args.screenshot.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
