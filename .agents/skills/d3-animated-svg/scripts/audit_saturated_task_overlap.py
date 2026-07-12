#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///

"""Audit the saturated task-overlap gallery card in Chromium."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GALLERY = SKILL_ROOT / "assets" / "examples" / "d3-animated-svg" / "index.html"

AUDIT_JS = r"""
() => {
  const root = document.querySelector('svg#task-overlap-dense');
  if (!root) return { error: 'missing saturated svg' };
  const groups = Array.from(root.querySelectorAll('.task-label-group'));
  const boxes = groups.map(group => {
    const rect = group.querySelector('.task-label-bg');
    const text = group.querySelector('text.task-label');
    return {
      id: group.dataset.taskId,
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')),
      h: Number(rect.getAttribute('height')),
      domRect: rect.getBoundingClientRect(),
      textRect: text.getBoundingClientRect()
    };
  });
  const circles = Array.from(root.querySelectorAll('.overlap-circle')).map(circle => ({
    cx: Number(circle.getAttribute('cx')),
    cy: Number(circle.getAttribute('cy')),
    r: Number(circle.getAttribute('r'))
  }));
  const dots = Array.from(root.querySelectorAll('.task-dot')).map(dot => ({
    id: dot.dataset.taskId,
    cx: Number(dot.getAttribute('cx')),
    cy: Number(dot.getAttribute('cy')),
    r: Number(dot.getAttribute('r')) || 2.25
  }));
  const leaders = Array.from(root.querySelectorAll('.task-leader'));
  const halos = Array.from(root.querySelectorAll('.task-leader-halo'));
  const accents = Array.from(root.querySelectorAll('.task-label-accent'));
  const anchors = Array.from(root.querySelectorAll('.task-leader-anchor')).map(anchor => ({
    id: anchor.dataset.taskId,
    cx: Number(anchor.getAttribute('cx')),
    cy: Number(anchor.getAttribute('cy')),
    r: Number(anchor.getAttribute('r')) || 1.55
  }));
  const leaderStyles = Array.from(new Set(leaders.map(path => path.dataset.leaderStyle))).sort();
  const leaderColors = Array.from(new Set(leaders.map(path => path.getAttribute('stroke')))).sort();
  const stylesWithDash = leaders.filter(path => path.getAttribute('stroke-dasharray')).length;
  const leaderSegments = leaders.map(line => ({
    id: line.dataset.taskId,
    color: line.getAttribute('stroke'),
    x1: Number(line.getAttribute('x1')),
    y1: Number(line.getAttribute('y1')),
    x2: Number(line.getAttribute('x2')),
    y2: Number(line.getAttribute('y2'))
  }));
  function rectsOverlap(a, b, pad = 0.1) {
    return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > pad &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > pad;
  }
  function rectCircleOverlap(rect, circle, pad = 0) {
    const closestX = Math.min(Math.max(circle.cx, rect.x - pad), rect.x + rect.w + pad);
    const closestY = Math.min(Math.max(circle.cy, rect.y - pad), rect.y + rect.h + pad);
    return (closestX - circle.cx) ** 2 + (closestY - circle.cy) ** 2 < (circle.r + pad) ** 2;
  }
  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  function pointOnSegment(point, segment) {
    return Math.min(segment.a.x, segment.b.x) - 1e-9 <= point.x &&
      point.x <= Math.max(segment.a.x, segment.b.x) + 1e-9 &&
      Math.min(segment.a.y, segment.b.y) - 1e-9 <= point.y &&
      point.y <= Math.max(segment.a.y, segment.b.y) + 1e-9 &&
      Math.abs(orientation(segment.a, segment.b, point)) < 1e-9;
  }
  function segmentsIntersect(left, right) {
    const oa0 = orientation(left.a, left.b, right.a);
    const oa1 = orientation(left.a, left.b, right.b);
    const ob0 = orientation(right.a, right.b, left.a);
    const ob1 = orientation(right.a, right.b, left.b);
    if (oa0 * oa1 < 0 && ob0 * ob1 < 0) return true;
    return Math.abs(oa0) < 1e-9 && pointOnSegment(right.a, left) ||
      Math.abs(oa1) < 1e-9 && pointOnSegment(right.b, left) ||
      Math.abs(ob0) < 1e-9 && pointOnSegment(left.a, right) ||
      Math.abs(ob1) < 1e-9 && pointOnSegment(left.b, right);
  }
  function lineToSegment(line) {
    return { a: { x: line.x1, y: line.y1 }, b: { x: line.x2, y: line.y2 } };
  }
  function pointInRect(point, rect) {
    return point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h;
  }
  function segmentIntersectsRect(segment, rect) {
    if (pointInRect(segment.a, rect) || pointInRect(segment.b, rect)) return true;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h }
    ];
    const edges = corners.map((corner, index) => ({ a: corner, b: corners[(index + 1) % corners.length] }));
    return edges.some(edge => segmentsIntersect(segment, edge));
  }
  let labelLabelOverlaps = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (rectsOverlap(boxes[i], boxes[j], 0.1)) labelLabelOverlaps += 1;
    }
  }
  let labelCircleOverlaps = 0;
  for (const box of boxes) for (const circle of circles) if (rectCircleOverlap(box, circle, 1.0)) labelCircleOverlaps += 1;
  let labelDotOverlaps = 0;
  for (const box of boxes) for (const dot of dots) if (rectCircleOverlap(box, dot, 1.0)) labelDotOverlaps += 1;
  let labelAnchorOverlaps = 0;
  for (const box of boxes) for (const anchor of anchors) if (rectCircleOverlap(box, anchor, 0.25)) labelAnchorOverlaps += 1;
  let leaderLabelOverlaps = 0;
  for (const line of leaderSegments) {
    const segment = lineToSegment(line);
    for (const box of boxes) {
      if (box.id === line.id) continue;
      if (segmentIntersectsRect(segment, box)) leaderLabelOverlaps += 1;
    }
  }
  let leaderCrossings = 0;
  let sameColorLeaderCrossings = 0;
  for (let i = 0; i < leaderSegments.length; i += 1) {
    for (let j = i + 1; j < leaderSegments.length; j += 1) {
      if (segmentsIntersect(lineToSegment(leaderSegments[i]), lineToSegment(leaderSegments[j]))) {
        leaderCrossings += 1;
        if (leaderSegments[i].color === leaderSegments[j].color) sameColorLeaderCrossings += 1;
      }
    }
  }
  let tooSmallWidth = 0;
  let tooSmallHeight = 0;
  let minWidthSlack = Infinity;
  let minHeightSlack = Infinity;
  let minRenderedTextHeight = Infinity;
  let maxRenderedTextHeight = 0;
  for (const box of boxes) {
    const widthSlack = box.domRect.width - box.textRect.width;
    const heightSlack = box.domRect.height - box.textRect.height;
    minWidthSlack = Math.min(minWidthSlack, widthSlack);
    minHeightSlack = Math.min(minHeightSlack, heightSlack);
    minRenderedTextHeight = Math.min(minRenderedTextHeight, box.textRect.height);
    maxRenderedTextHeight = Math.max(maxRenderedTextHeight, box.textRect.height);
    if (widthSlack < -0.25) tooSmallWidth += 1;
    if (heightSlack < -0.25) tooSmallHeight += 1;
  }
  const card = root.closest('.example-card');
  const frame = card.querySelector('.viz-frame');
  const svgRect = root.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const sameColorRate = leaderCrossings ? sameColorLeaderCrossings / leaderCrossings : 0;
  const clean = labelLabelOverlaps === 0 &&
    labelCircleOverlaps === 0 &&
    labelDotOverlaps === 0 &&
    tooSmallWidth === 0 &&
    tooSmallHeight === 0 &&
    boxes.length === 100 &&
    circles.length === 9 &&
    dots.length === 100 &&
    leaders.length === 100 &&
    halos.length === 100 &&
    anchors.length === 0 &&
    accents.length === 0 &&
    leaderStyles.length === 1 &&
    leaderStyles[0] === 'solid' &&
    stylesWithDash === 0 &&
    leaderColors.length >= 5 &&
    leaderCrossings === Number(root.dataset.leaderCrossingCount) &&
    sameColorLeaderCrossings === Number(root.dataset.sameColorLeaderCrossingCount) &&
    sameColorRate <= 0.2 &&
    root.dataset.labelPlacement === 'external-lanes' &&
    root.dataset.leaderRoute === 'direct';
  return {
    clean,
    rootOverlapAttrs: {
      label: root.dataset.labelOverlapCount,
      circle: root.dataset.labelCircleOverlapCount,
      dot: root.dataset.labelDotOverlapCount,
      leader: root.dataset.labelLeaderOverlapCount,
      leaderUnderpass: root.dataset.labelLeaderUnderpassCount,
      nonLabel: root.dataset.labelNonlabelOverlapCount,
      placement: root.dataset.labelPlacement,
      clearancePolicy: root.dataset.labelClearancePolicy,
      leaderRoute: root.dataset.leaderRoute,
      leaderStyleCount: root.dataset.leaderStyleCount,
      leaderColorCount: root.dataset.leaderColorCount,
      leaderCrossingCount: root.dataset.leaderCrossingCount,
      sameColorLeaderCrossingCount: root.dataset.sameColorLeaderCrossingCount
    },
    counts: { labels: boxes.length, circles: circles.length, dots: dots.length, leaders: leaders.length, halos: halos.length, anchors: anchors.length, accents: accents.length },
    overlaps: { labelLabel: labelLabelOverlaps, labelCircle: labelCircleOverlaps, labelDot: labelDotOverlaps, labelAnchor: labelAnchorOverlaps, leaderLabel: leaderLabelOverlaps },
    leaderCrossings: { total: leaderCrossings, sameColor: sameColorLeaderCrossings, sameColorRate },
    labelBackgrounds: { tooSmallWidth, tooSmallHeight, minWidthSlack, minHeightSlack, minRenderedTextHeight, maxRenderedTextHeight },
    leaderStyles,
    leaderColors,
    stylesWithDash,
    viewport: { cardWidth: Math.round(cardRect.width), frameWidth: Math.round(frameRect.width), frameScrollWidth: Math.round(frame.scrollWidth), svgWidth: Math.round(svgRect.width), svgHeight: Math.round(svgRect.height) },
    viewBox: root.getAttribute('viewBox')
  };
}
"""


def source_to_url(source: str) -> str:
    if re.match(r"^https?://", source) or source.startswith("file://"):
        return source
    return Path(source).expanduser().resolve().as_uri()


def parse_viewport(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+)x(\d+)", value)
    if not match:
        raise argparse.ArgumentTypeError("Viewport must use WIDTHxHEIGHT, for example 1366x900.")
    return int(match.group(1)), int(match.group(2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", default=str(DEFAULT_GALLERY), help="Gallery HTML file, file URL, or HTTP URL.")
    parser.add_argument("--viewport", type=parse_viewport, default=(1366, 900))
    parser.add_argument("--wait-ms", type=int, default=2200)
    parser.add_argument("--expect-clean", action="store_true", help="Exit nonzero if the audit finds any issue.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    width, height = args.viewport
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(source_to_url(args.source), wait_until="load", timeout=90_000)
        page.wait_for_timeout(max(args.wait_ms, 0))
        page.locator("svg#task-overlap-dense").scroll_into_view_if_needed(timeout=90_000)
        page.wait_for_timeout(300)
        result: dict[str, Any] = page.evaluate(AUDIT_JS)
        browser.close()
    print(json.dumps(result, indent=2))
    if args.expect_clean and not result.get("clean"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
