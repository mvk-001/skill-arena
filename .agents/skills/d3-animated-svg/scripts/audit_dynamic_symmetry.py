#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///

"""Audit SVG composition points against a dynamic-symmetry armature."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GALLERY = SKILL_ROOT / "assets" / "examples" / "d3-animated-svg" / "index.html"
PHI = (1 + 5**0.5) / 2
EPSILON = 1e-9

EXTRACT_JS = r"""
(params) => {
  const root = document.querySelector(params.selector);
  if (!root) return { error: `No element matches selector: ${params.selector}` };
  const svg = root.tagName && root.tagName.toLowerCase() === "svg" ? root : root.ownerSVGElement;
  if (!svg) return { error: `Selected element is not inside an SVG: ${params.selector}` };

  const skipTags = new Set(["defs", "title", "desc", "metadata", "style", "script", "animate", "animatetransform", "clippath", "mask", "lineargradient", "radialgradient", "stop", "pattern", "marker", "filter"]);
  const points = [];

  function tagName(el) {
    return (el.tagName || "").toLowerCase();
  }

  function className(el) {
    return typeof el.className === "object" ? el.className.baseVal || "" : el.className || "";
  }

  function isVisible(el) {
    if (!el || skipTags.has(tagName(el))) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function localToSvg(el, x, y) {
    const elementMatrix = el.getScreenCTM && el.getScreenCTM();
    const svgMatrix = svg.getScreenCTM && svg.getScreenCTM();
    if (!elementMatrix || !svgMatrix) return null;
    const point = svg.createSVGPoint();
    point.x = x;
    point.y = y;
    const screenPoint = point.matrixTransform(elementMatrix);
    const svgPoint = screenPoint.matrixTransform(svgMatrix.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  function addPoint(el, x, y, role, source = "attribute") {
    const point = localToSvg(el, x, y);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    points.push({
      x: point.x,
      y: point.y,
      role,
      source,
      tag: tagName(el),
      id: el.id || "",
      className: className(el)
    });
  }

  function addBoxPoints(el, rolePrefix) {
    let box;
    try {
      box = el.getBBox();
    } catch (_) {
      return;
    }
    if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width < 0 || box.height < 0) return;
    const x0 = box.x;
    const y0 = box.y;
    const x1 = box.x + box.width;
    const y1 = box.y + box.height;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    addPoint(el, x0, y0, `${rolePrefix}:corner-tl`, "bbox");
    addPoint(el, x1, y0, `${rolePrefix}:corner-tr`, "bbox");
    addPoint(el, x1, y1, `${rolePrefix}:corner-br`, "bbox");
    addPoint(el, x0, y1, `${rolePrefix}:corner-bl`, "bbox");
    addPoint(el, cx, cy, `${rolePrefix}:center`, "bbox");
    addPoint(el, cx, y0, `${rolePrefix}:edge-top`, "bbox");
    addPoint(el, x1, cy, `${rolePrefix}:edge-right`, "bbox");
    addPoint(el, cx, y1, `${rolePrefix}:edge-bottom`, "bbox");
    addPoint(el, x0, cy, `${rolePrefix}:edge-left`, "bbox");
  }

  function addPathPoints(el) {
    let totalLength = 0;
    try {
      totalLength = el.getTotalLength();
    } catch (_) {
      addBoxPoints(el, "path");
      return;
    }
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      addBoxPoints(el, "path");
      return;
    }
    const samples = Math.max(2, Math.min(params.pathSamples, Math.ceil(totalLength / 18)));
    for (let index = 0; index <= samples; index += 1) {
      const length = totalLength * index / samples;
      const point = el.getPointAtLength(length);
      const role = index === 0 ? "path:start" : index === samples ? "path:end" : index === Math.floor(samples / 2) ? "path:midpoint" : "path:sample";
      addPoint(el, point.x, point.y, role, "path-length");
    }
  }

  function addPointList(el, closed) {
    const list = Array.from(el.points || []);
    list.forEach((point, index) => addPoint(el, point.x, point.y, `${tagName(el)}:vertex-${index}`, "points"));
    if (list.length) {
      const mean = list.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
      addPoint(el, mean.x / list.length, mean.y / list.length, `${tagName(el)}:${closed ? "centroid" : "midcloud"}`, "points");
    }
  }

  function addTextAnchor(el) {
    const xList = el.x && el.x.baseVal;
    const yList = el.y && el.y.baseVal;
    if (xList && yList && xList.numberOfItems > 0 && yList.numberOfItems > 0) {
      addPoint(el, xList.getItem(0).value, yList.getItem(0).value, "text:anchor", "attribute");
    }
    addBoxPoints(el, "text");
  }

  function addElementPoints(el) {
    const tag = tagName(el);
    if (!isVisible(el)) return;
    if (tag === "circle") {
      const cx = toNumber(el.getAttribute("cx"));
      const cy = toNumber(el.getAttribute("cy"));
      const r = toNumber(el.getAttribute("r"));
      addPoint(el, cx, cy, "circle:center");
      addPoint(el, cx - r, cy, "circle:left");
      addPoint(el, cx + r, cy, "circle:right");
      addPoint(el, cx, cy - r, "circle:top");
      addPoint(el, cx, cy + r, "circle:bottom");
    } else if (tag === "ellipse") {
      const cx = toNumber(el.getAttribute("cx"));
      const cy = toNumber(el.getAttribute("cy"));
      const rx = toNumber(el.getAttribute("rx"));
      const ry = toNumber(el.getAttribute("ry"));
      addPoint(el, cx, cy, "ellipse:center");
      addPoint(el, cx - rx, cy, "ellipse:left");
      addPoint(el, cx + rx, cy, "ellipse:right");
      addPoint(el, cx, cy - ry, "ellipse:top");
      addPoint(el, cx, cy + ry, "ellipse:bottom");
    } else if (tag === "rect" || tag === "image" || tag === "foreignobject" || tag === "use") {
      addBoxPoints(el, `${tag}:bbox`);
    } else if (tag === "line") {
      const x1 = toNumber(el.getAttribute("x1"));
      const y1 = toNumber(el.getAttribute("y1"));
      const x2 = toNumber(el.getAttribute("x2"));
      const y2 = toNumber(el.getAttribute("y2"));
      addPoint(el, x1, y1, "line:start");
      addPoint(el, x2, y2, "line:end");
      addPoint(el, (x1 + x2) / 2, (y1 + y2) / 2, "line:midpoint");
    } else if (tag === "polyline" || tag === "polygon") {
      addPointList(el, tag === "polygon");
    } else if (tag === "path") {
      addPathPoints(el);
    } else if (tag === "text" || tag === "tspan") {
      addTextAnchor(el);
    }
  }

  function frameFromBox(el) {
    let box;
    try {
      box = el.getBBox();
    } catch (_) {
      return null;
    }
    const corners = [
      localToSvg(el, box.x, box.y),
      localToSvg(el, box.x + box.width, box.y),
      localToSvg(el, box.x + box.width, box.y + box.height),
      localToSvg(el, box.x, box.y + box.height)
    ].filter(Boolean);
    if (corners.length !== 4) return null;
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return { x, y, width, height, source: "object-bbox" };
  }

  function frameFromSvg() {
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
      return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height, source: "svg-viewBox" };
    }
    return frameFromBox(svg) || { x: 0, y: 0, width: 0, height: 0, source: "missing" };
  }

  const elements = [];
  if (root !== svg) elements.push(root);
  elements.push(...Array.from(root.querySelectorAll("*")));
  elements.forEach(addElementPoints);

  const requestedFrame = params.frameMode === "auto" ? (root === svg ? "svg" : "object") : params.frameMode;
  const frame = requestedFrame === "object" ? (frameFromBox(root) || frameFromSvg()) : frameFromSvg();
  return {
    selector: params.selector,
    frameMode: requestedFrame,
    svgId: svg.id || "",
    rootTag: tagName(root),
    frame,
    points
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
    parser.add_argument("source", nargs="?", default=str(DEFAULT_GALLERY), help="HTML/SVG file, file URL, or HTTP URL.")
    parser.add_argument("--selector", default="svg", help="CSS selector for the SVG or SVG child object to audit.")
    parser.add_argument("--frame", choices=("auto", "svg", "object"), default="auto", help="Composition frame to use.")
    parser.add_argument("--viewport", type=parse_viewport, default=(1366, 900))
    parser.add_argument("--wait-ms", type=int, default=2200)
    parser.add_argument("--path-samples", type=int, default=24, help="Maximum samples per SVG path.")
    parser.add_argument("--tolerance", type=float, default=None, help="Alignment tolerance in SVG units.")
    parser.add_argument("--max-point-output", type=int, default=500, help="Maximum annotated points to include in JSON output.")
    parser.add_argument("--output", type=Path, help="Optional JSON report path.")
    parser.add_argument("--expect-min-score", type=float, help="Exit nonzero if the dynamic symmetry score is below this value.")
    parser.add_argument("--expect-min-line-rate", type=float, help="Exit nonzero if the guide alignment rate is below this 0-1 value.")
    return parser.parse_args()


def add_line(lines: list[dict[str, Any]], seen: set[tuple[float, ...]], guide_id: str, group: str, a: tuple[float, float], b: tuple[float, float]) -> None:
    if math.hypot(a[0] - b[0], a[1] - b[1]) < EPSILON:
        return
    endpoints = sorted([(round(a[0], 4), round(a[1], 4)), (round(b[0], 4), round(b[1], 4))])
    key = (endpoints[0][0], endpoints[0][1], endpoints[1][0], endpoints[1][1])
    if key in seen:
        return
    seen.add(key)
    lines.append({"id": guide_id, "group": group, "a": {"x": a[0], "y": a[1]}, "b": {"x": b[0], "y": b[1]}})


def clip_line(frame: dict[str, float], px: float, py: float, slope: float) -> tuple[tuple[float, float], tuple[float, float]] | None:
    x0 = frame["x"]
    y0 = frame["y"]
    x1 = x0 + frame["width"]
    y1 = y0 + frame["height"]
    points: list[tuple[float, float]] = []

    for x in (x0, x1):
        y = py + slope * (x - px)
        if y0 - EPSILON <= y <= y1 + EPSILON:
            points.append((x, min(max(y, y0), y1)))

    if abs(slope) > EPSILON:
        for y in (y0, y1):
            x = px + (y - py) / slope
            if x0 - EPSILON <= x <= x1 + EPSILON:
                points.append((min(max(x, x0), x1), y))

    unique: list[tuple[float, float]] = []
    for point in points:
        if not any(math.hypot(point[0] - existing[0], point[1] - existing[1]) < 1e-6 for existing in unique):
            unique.append(point)
    if len(unique) < 2:
        return None
    unique.sort()
    return unique[0], unique[-1]


def guide_lines(frame: dict[str, float]) -> list[dict[str, Any]]:
    x0 = frame["x"]
    y0 = frame["y"]
    width = frame["width"]
    height = frame["height"]
    x1 = x0 + width
    y1 = y0 + height
    lines: list[dict[str, Any]] = []
    seen: set[tuple[float, ...]] = set()

    add_line(lines, seen, "boundary-left", "boundary", (x0, y0), (x0, y1))
    add_line(lines, seen, "boundary-right", "boundary", (x1, y0), (x1, y1))
    add_line(lines, seen, "boundary-top", "boundary", (x0, y0), (x1, y0))
    add_line(lines, seen, "boundary-bottom", "boundary", (x0, y1), (x1, y1))
    add_line(lines, seen, "center-vertical", "center", (x0 + width / 2, y0), (x0 + width / 2, y1))
    add_line(lines, seen, "center-horizontal", "center", (x0, y0 + height / 2), (x1, y0 + height / 2))

    fractions = {
        "third-1": 1 / 3,
        "third-2": 2 / 3,
        "fifth-1": 1 / 5,
        "fifth-2": 2 / 5,
        "fifth-3": 3 / 5,
        "fifth-4": 4 / 5,
        "golden-short": 1 / (PHI**2),
        "golden-long": 1 / PHI,
        "root2": 1 / math.sqrt(2),
        "root2-comp": 1 - 1 / math.sqrt(2),
        "root3": 1 / math.sqrt(3),
        "root3-comp": 1 - 1 / math.sqrt(3),
        "root5": 1 / math.sqrt(5),
        "root5-comp": 1 - 1 / math.sqrt(5),
    }
    for name, fraction in fractions.items():
        add_line(lines, seen, f"{name}-vertical", "division", (x0 + width * fraction, y0), (x0 + width * fraction, y1))
        add_line(lines, seen, f"{name}-horizontal", "division", (x0, y0 + height * fraction), (x1, y0 + height * fraction))

    add_line(lines, seen, "diagonal-major", "diagonal", (x0, y0), (x1, y1))
    add_line(lines, seen, "diagonal-minor", "diagonal", (x0, y1), (x1, y0))

    if width > EPSILON and height > EPSILON:
        slopes = {
            "diagonal-parallel": height / width,
            "diagonal-counter-parallel": -height / width,
            "reciprocal": width / height,
            "reciprocal-counter": -width / height,
        }
        corners = {
            "tl": (x0, y0),
            "tr": (x1, y0),
            "br": (x1, y1),
            "bl": (x0, y1),
        }
        for slope_name, slope in slopes.items():
            for corner_name, corner in corners.items():
                segment = clip_line(frame, corner[0], corner[1], slope)
                if segment:
                    add_line(lines, seen, f"{slope_name}-{corner_name}", "armature", segment[0], segment[1])

    return lines


def distance_to_segment(point: dict[str, float], line: dict[str, Any]) -> float:
    ax = line["a"]["x"]
    ay = line["a"]["y"]
    bx = line["b"]["x"]
    by = line["b"]["y"]
    dx = bx - ax
    dy = by - ay
    length_sq = dx * dx + dy * dy
    if length_sq <= EPSILON:
        return math.hypot(point["x"] - ax, point["y"] - ay)
    t = ((point["x"] - ax) * dx + (point["y"] - ay) * dy) / length_sq
    t = min(1, max(0, t))
    px = ax + t * dx
    py = ay + t * dy
    return math.hypot(point["x"] - px, point["y"] - py)


def line_intersection(left: dict[str, Any], right: dict[str, Any], frame: dict[str, float]) -> dict[str, Any] | None:
    x1 = left["a"]["x"]
    y1 = left["a"]["y"]
    x2 = left["b"]["x"]
    y2 = left["b"]["y"]
    x3 = right["a"]["x"]
    y3 = right["a"]["y"]
    x4 = right["b"]["x"]
    y4 = right["b"]["y"]
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < EPSILON:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    if not (frame["x"] - EPSILON <= px <= frame["x"] + frame["width"] + EPSILON):
        return None
    if not (frame["y"] - EPSILON <= py <= frame["y"] + frame["height"] + EPSILON):
        return None
    return {"x": px, "y": py, "id": f"{left['id']} x {right['id']}"}


def guide_intersections(lines: list[dict[str, Any]], frame: dict[str, float]) -> list[dict[str, Any]]:
    intersections: list[dict[str, Any]] = []
    seen: set[tuple[float, float]] = set()
    interesting_groups = {"center", "division", "diagonal", "armature"}
    for index, left in enumerate(lines):
        for right in lines[index + 1 :]:
            if left["group"] == "boundary" and right["group"] == "boundary":
                continue
            if left["group"] not in interesting_groups and right["group"] not in interesting_groups:
                continue
            intersection = line_intersection(left, right, frame)
            if not intersection:
                continue
            key = (round(intersection["x"], 3), round(intersection["y"], 3))
            if key in seen:
                continue
            seen.add(key)
            intersections.append(intersection)
    return intersections


def nearest_line(point: dict[str, Any], lines: list[dict[str, Any]]) -> tuple[dict[str, Any], float]:
    best_line = lines[0]
    best_distance = float("inf")
    for line in lines:
        distance = distance_to_segment(point, line)
        if distance < best_distance:
            best_line = line
            best_distance = distance
    return best_line, best_distance


def nearest_node(point: dict[str, Any], nodes: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, float]:
    best_node = None
    best_distance = float("inf")
    for node in nodes:
        distance = math.hypot(point["x"] - node["x"], point["y"] - node["y"])
        if distance < best_distance:
            best_node = node
            best_distance = distance
    return best_node, best_distance


def enrich_points(points: list[dict[str, Any]], lines: list[dict[str, Any]], nodes: list[dict[str, Any]], tolerance: float) -> list[dict[str, Any]]:
    enriched = []
    for index, point in enumerate(points):
        line, line_distance = nearest_line(point, lines)
        node, node_distance = nearest_node(point, nodes)
        enriched.append(
            {
                **point,
                "index": index,
                "x": round(point["x"], 3),
                "y": round(point["y"], 3),
                "nearestGuide": line["id"],
                "nearestGuideGroup": line["group"],
                "guideDistance": round(line_distance, 3),
                "onGuide": line_distance <= tolerance,
                "nearestNode": node["id"] if node else "",
                "nodeDistance": round(node_distance, 3) if node else None,
                "onNode": bool(node and node_distance <= tolerance),
            }
        )
    return enriched


def balance_summary(points: list[dict[str, Any]], frame: dict[str, float]) -> dict[str, Any]:
    if not points:
        return {"centerOfMass": None, "quadrants": {}, "quadrantImbalance": 0, "balanceScore": 0}
    center_x = frame["x"] + frame["width"] / 2
    center_y = frame["y"] + frame["height"] / 2
    mean_x = sum(point["x"] for point in points) / len(points)
    mean_y = sum(point["y"] for point in points) / len(points)
    radius = math.hypot(frame["width"], frame["height"]) / 2
    center_offset = math.hypot(mean_x - center_x, mean_y - center_y)
    quadrants = Counter(
        (
            "left" if point["x"] < center_x else "right",
            "top" if point["y"] < center_y else "bottom",
        )
        for point in points
    )
    quadrant_map = {f"{horizontal}-{vertical}": quadrants[(horizontal, vertical)] for horizontal in ("left", "right") for vertical in ("top", "bottom")}
    counts = list(quadrant_map.values())
    imbalance = (max(counts) - min(counts)) / len(points) if points else 0
    return {
        "centerOfMass": {"x": round(mean_x, 3), "y": round(mean_y, 3), "offsetFromFrameCenter": round(center_offset, 3)},
        "quadrants": quadrant_map,
        "quadrantImbalance": round(imbalance, 4),
        "balanceScore": round(max(0, 1 - center_offset / max(radius, EPSILON)), 4),
    }


def recommendations(summary: dict[str, Any], role_rates: dict[str, Any]) -> list[str]:
    notes: list[str] = []
    if summary["lineAlignmentRate"] < 0.35:
        notes.append("Move dominant centers, terminals, or label columns closer to named dynamic guides before tuning secondary marks.")
    if summary["nodeAlignmentRate"] < 0.08:
        notes.append("Anchor at least a few primary marks on guide intersections so the composition has visible structural nodes.")
    if summary["balance"]["quadrantImbalance"] > 0.35:
        notes.append("Rebalance the current frame; one quadrant carries substantially more measured points than the opposite quadrants.")
    center_rate = role_rates.get("centerRoles", {}).get("lineAlignmentRate")
    if center_rate is not None and center_rate < 0.4:
        notes.append("Primary centers are weakly tied to the armature; adjust centers before changing labels or decorative marks.")
    if summary["outsideFramePointCount"] > 0:
        notes.append("Some measured points sit outside the composition frame; use --frame object if this is intentional or expand the SVG viewBox.")
    if not notes:
        notes.append("The measured points have usable armature alignment; prefer small local refinements over moving the whole pattern.")
    return notes


def role_alignment(points: list[dict[str, Any]]) -> dict[str, Any]:
    center_points = [point for point in points if point["role"].endswith(":center") or point["role"] in {"circle:center", "ellipse:center", "text:anchor"}]
    terminal_points = [point for point in points if point["role"].endswith(":start") or point["role"].endswith(":end")]

    def rate(subset: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not subset:
            return None
        return {
            "pointCount": len(subset),
            "lineAligned": sum(1 for point in subset if point["onGuide"]),
            "nodeAligned": sum(1 for point in subset if point["onNode"]),
            "lineAlignmentRate": round(sum(1 for point in subset if point["onGuide"]) / len(subset), 4),
            "nodeAlignmentRate": round(sum(1 for point in subset if point["onNode"]) / len(subset), 4),
        }

    return {
        "centerRoles": rate(center_points),
        "terminalRoles": rate(terminal_points),
    }


def analyze(extracted: dict[str, Any], tolerance: float | None, max_point_output: int) -> dict[str, Any]:
    if extracted.get("error"):
        return extracted
    frame = extracted["frame"]
    if frame["width"] <= 0 or frame["height"] <= 0:
        return {"error": "Composition frame has zero width or height.", "frame": frame}
    actual_tolerance = tolerance if tolerance is not None else max(2.0, min(frame["width"], frame["height"]) * 0.012)
    points = extracted["points"]
    lines = guide_lines(frame)
    nodes = guide_intersections(lines, frame)
    enriched = enrich_points(points, lines, nodes, actual_tolerance)
    point_count = len(enriched)
    line_aligned = sum(1 for point in enriched if point["onGuide"])
    node_aligned = sum(1 for point in enriched if point["onNode"])
    outside_frame = [
        point
        for point in enriched
        if point["x"] < frame["x"] - EPSILON
        or point["x"] > frame["x"] + frame["width"] + EPSILON
        or point["y"] < frame["y"] - EPSILON
        or point["y"] > frame["y"] + frame["height"] + EPSILON
    ]
    balance = balance_summary(enriched, frame)
    role_rates = role_alignment(enriched)
    line_rate = line_aligned / point_count if point_count else 0
    node_rate = node_aligned / point_count if point_count else 0
    score = round(100 * (0.62 * line_rate + 0.23 * node_rate + 0.15 * balance["balanceScore"]), 2)
    guide_counts = Counter(point["nearestGuide"] for point in enriched if point["onGuide"])
    guide_group_counts = Counter(point["nearestGuideGroup"] for point in enriched if point["onGuide"])
    node_counts = Counter(point["nearestNode"] for point in enriched if point["onNode"])
    role_counts = Counter(point["role"] for point in enriched)
    tag_counts = Counter(point["tag"] for point in enriched)
    farthest = sorted(enriched, key=lambda point: point["guideDistance"], reverse=True)[:20]
    summary = {
        "pointCount": point_count,
        "uniquePointCountRounded2": len({(round(point["x"], 2), round(point["y"], 2)) for point in enriched}),
        "guideCount": len(lines),
        "nodeCount": len(nodes),
        "tolerance": round(actual_tolerance, 3),
        "lineAligned": line_aligned,
        "nodeAligned": node_aligned,
        "lineAlignmentRate": round(line_rate, 4),
        "nodeAlignmentRate": round(node_rate, 4),
        "dynamicSymmetryScore": score,
        "outsideFramePointCount": len(outside_frame),
        "balance": balance,
    }
    summary["recommendations"] = recommendations(summary, role_rates)
    report = {
        "selector": extracted["selector"],
        "svgId": extracted["svgId"],
        "rootTag": extracted["rootTag"],
        "frameMode": extracted["frameMode"],
        "frame": {key: round(value, 3) if isinstance(value, (int, float)) else value for key, value in frame.items()},
        "summary": summary,
        "roleAlignment": role_rates,
        "guideHits": {
            "byGroup": dict(guide_group_counts.most_common()),
            "topGuides": dict(guide_counts.most_common(20)),
            "topNodes": dict(node_counts.most_common(20)),
        },
        "pointBreakdown": {
            "byRole": dict(role_counts.most_common(40)),
            "byTag": dict(tag_counts.most_common()),
        },
        "farthestPoints": farthest,
        "points": enriched[:max_point_output],
        "omittedPointCount": max(0, len(enriched) - max_point_output),
    }
    return report


def run_browser(args: argparse.Namespace) -> dict[str, Any]:
    width, height = args.viewport
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(source_to_url(args.source), wait_until="load", timeout=90_000)
        page.wait_for_timeout(max(args.wait_ms, 0))
        page.locator(args.selector).scroll_into_view_if_needed(timeout=90_000)
        page.wait_for_timeout(200)
        extracted: dict[str, Any] = page.evaluate(
            EXTRACT_JS,
            {
                "selector": args.selector,
                "frameMode": args.frame,
                "pathSamples": args.path_samples,
            },
        )
        browser.close()
    return extracted


def main() -> int:
    args = parse_args()
    extracted = run_browser(args)
    report = analyze(extracted, args.tolerance, args.max_point_output)
    output = json.dumps(report, indent=2)
    print(output)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8", newline="\n")
    if report.get("error"):
        return 1
    summary = report["summary"]
    if args.expect_min_score is not None and summary["dynamicSymmetryScore"] < args.expect_min_score:
        return 1
    if args.expect_min_line_rate is not None and summary["lineAlignmentRate"] < args.expect_min_line_rate:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
