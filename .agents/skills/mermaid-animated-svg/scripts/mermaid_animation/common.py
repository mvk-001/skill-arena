#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SVG_NS = "http://www.w3.org/2000/svg"


XLINK_NS = "http://www.w3.org/1999/xlink"


ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)


ROLE_PRIORITY = {
    "row": 0,
    "cluster": 0,
    "actor": 1,
    "node": 2,
    "edge": 3,
    "label": 4,
    "annotation": 5,
    "item": 6,
}


TRANSFORM_EFFECTS = {"pop", "slide-up", "slide-left", "zoom"}


ANIMATION_CHOICES = (
    "auto",
    "sequence",
    "organic",
    "ishikawa",
    "mindmap-level",
    "mindmap-branch",
    "fade",
    "draw",
    "pop",
    "slide-up",
    "slide-left",
    "zoom",
    "none",
)


@dataclass
class Candidate:
    element: ET.Element
    role: str
    dom_index: int
    element_id: str
    classes: list[str]
    text: str
    explicit_order: int | None = None
    effect: str = ""
    easing: str = ""
    delay_ms: float = 0.0
    duration_ms: float = 0.0
    level: int | None = None
    stage: int | None = None
    source_index: int | None = None
    target_index: int | None = None
    wave_index: int | None = None
    branch_index: int | None = None
    branch_step: int | None = None


def qname(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def class_tokens(element: ET.Element) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for token in re.split(r"\s+", element.get("class", "").strip()):
        if token and token not in seen:
            seen.add(token)
            tokens.append(token)
    return tokens


def class_text(element: ET.Element) -> str:
    return " ".join(class_tokens(element))


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).lower()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalized(value)).strip("-")


def collapsed_text(element: ET.Element) -> str:
    parts = [part.strip() for part in element.itertext() if part and part.strip()]
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def build_parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in list(parent)}


def ancestors(element: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> Iterable[ET.Element]:
    parent = parent_map.get(element)
    while parent is not None:
        yield parent
        parent = parent_map.get(parent)


def has_class(element: ET.Element, token: str) -> bool:
    return token in class_tokens(element)


def has_class_fragment(element: ET.Element, fragment: str) -> bool:
    return fragment.lower() in class_text(element).lower()


def ancestor_has_class_fragment(
    element: ET.Element, parent_map: dict[ET.Element, ET.Element], fragment: str
) -> bool:
    return any(has_class_fragment(parent, fragment) for parent in ancestors(element, parent_map))


def has_lower_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def parse_order_entries(values: list[str], order_file: Path | None) -> list[str]:
    entries: list[str] = []

    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        if stripped.startswith("["):
            loaded = json.loads(stripped)
            if not isinstance(loaded, list):
                raise ValueError("--order JSON must be an array")
            entries.extend(str(item) for item in loaded)
        else:
            entries.extend(part.strip() for part in stripped.split(",") if part.strip())

    if order_file is not None:
        content = order_file.read_text(encoding="utf-8").strip()
        if content:
            if content.startswith("["):
                loaded = json.loads(content)
                if not isinstance(loaded, list):
                    raise ValueError("--order-file JSON must be an array")
                entries.extend(str(item) for item in loaded)
            else:
                for line in content.splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        entries.append(line)

    return entries


def parse_keyed_number_entries(values: list[str], option_name: str) -> list[tuple[str, float]]:
    entries: list[tuple[str, float]] = []

    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        if stripped.startswith("{"):
            loaded = json.loads(stripped)
            if not isinstance(loaded, dict):
                raise ValueError(f"{option_name} JSON must be an object")
            parts = loaded.items()
        else:
            raw_parts = [part.strip() for part in stripped.split(",") if part.strip()]
            parts = []
            for part in raw_parts:
                if "=" not in part:
                    raise ValueError(f"{option_name} entries must use selector=value")
                selector, raw_number = part.split("=", 1)
                parts.append((selector.strip(), raw_number.strip()))

        for selector, raw_number in parts:
            selector = str(selector).strip()
            if not selector:
                raise ValueError(f"{option_name} selectors cannot be empty")
            try:
                number = float(raw_number)
            except (TypeError, ValueError):
                raise ValueError(f"{option_name} value for {selector!r} must be a number") from None
            if number < 0:
                raise ValueError(f"{option_name} value for {selector!r} must be zero or greater")
            entries.append((selector, number))

    return entries


def candidate_matches(candidate: Candidate, token: str) -> bool:
    raw = token.strip()
    value = normalized(raw)
    candidate_id = normalized(candidate.element_id)
    candidate_text = normalized(candidate.text)
    candidate_slug = slug(candidate.text)
    class_values = {normalized(token) for token in candidate.classes}

    def unquote_prefixed(prefix: str) -> str:
        prefixed = value.split(":", 1)[1].strip()
        if len(prefixed) >= 2 and prefixed[0] == prefixed[-1] and prefixed[0] in {"'", '"'}:
            return prefixed[1:-1]
        return prefixed

    if not value:
        return False
    if value.startswith("#"):
        return candidate_id == value[1:]
    if value.startswith("."):
        return value[1:] in class_values
    if value.startswith("role:"):
        return candidate.role == value.split(":", 1)[1]
    if value.startswith("id:"):
        return candidate_id == unquote_prefixed("id")
    if value.startswith("text:"):
        needle = unquote_prefixed("text")
        return candidate_text == needle or needle in candidate_text

    return (
        value == candidate_id
        or value in candidate_id
        or value in class_values
        or value == candidate_text
        or value == candidate_slug
        or value in candidate_text
    )


def dwell_for_candidate(
    candidate: Candidate,
    default_dwell_ms: float,
    overrides: list[tuple[str, float]],
) -> float:
    dwell_ms = default_dwell_ms
    for selector, value in overrides:
        if candidate_matches(candidate, selector):
            dwell_ms = value
    return dwell_ms


def state_dwell_for_candidate(
    candidate: Candidate,
    default_dwell_ms: float,
    overrides: list[tuple[str, float]],
) -> float:
    return dwell_for_candidate(candidate, default_dwell_ms, overrides)


def apply_order_tokens(candidates: list[Candidate], tokens: list[str]) -> list[str]:
    unmatched: list[str] = []
    for index, token in enumerate(tokens):
        matches = [candidate for candidate in candidates if candidate_matches(candidate, token)]
        if not matches:
            unmatched.append(token)
            continue
        for candidate in matches:
            if candidate.explicit_order is None or index < candidate.explicit_order:
                candidate.explicit_order = index
    return unmatched


def numeric_id_suffix(element_id: str, prefix: str) -> int | None:
    match = re.search(rf"{re.escape(prefix)}(\d+)$", element_id)
    if match:
        return int(match.group(1))
    return None


def class_number(candidate: Candidate, prefix: str) -> int | None:
    for token in candidate.classes:
        match = re.fullmatch(rf"{re.escape(prefix)}(-?\d+)", token)
        if match:
            return int(match.group(1))
    return None


def translate_position(element: ET.Element) -> tuple[float, float] | None:
    transform = element.get("transform", "")
    match = re.search(r"translate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)", transform)
    if not match:
        return None
    x = float(match.group(1))
    y = float(match.group(2) or 0)
    return x, y


def cumulative_translate_position(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float] | None:
    points: list[tuple[float, float]] = []
    current: ET.Element | None = element
    while current is not None:
        position = translate_position(current)
        if position is not None:
            points.append(position)
        current = parent_map.get(current)
    if not points:
        return None
    return sum(point[0] for point in points), sum(point[1] for point in points)


def average_position(candidates: Iterable[Candidate]) -> tuple[float, float] | None:
    points = [point for candidate in candidates if (point := translate_position(candidate.element)) is not None]
    if not points:
        return None
    return sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)


def parse_viewbox(root: ET.Element) -> tuple[float, float, float, float] | None:
    values = root.get("viewBox", "").replace(",", " ").split()
    if len(values) != 4:
        return None
    try:
        return tuple(float(value) for value in values)  # type: ignore[return-value]
    except ValueError:
        return None


def parse_points(value: str) -> list[tuple[float, float]]:
    numbers = [
        float(match.group(0))
        for match in re.finditer(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", value)
    ]
    return list(zip(numbers[0::2], numbers[1::2]))


def path_coordinate_points(value: str) -> list[tuple[float, float]]:
    tokens = re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?",
        value,
    )
    if not tokens:
        return []

    index = 0
    command = ""
    current = (0.0, 0.0)
    subpath_start = (0.0, 0.0)
    points: list[tuple[float, float]] = []

    def is_command(token: str) -> bool:
        return bool(re.fullmatch(r"[A-Za-z]", token))

    def take_float() -> float:
        nonlocal index
        if index >= len(tokens) or is_command(tokens[index]):
            raise ValueError
        value = float(tokens[index])
        index += 1
        return value

    def absolute_point(x: float, y: float, relative: bool) -> tuple[float, float]:
        if relative:
            return current[0] + x, current[1] + y
        return x, y

    def read_point(relative: bool) -> tuple[float, float]:
        return absolute_point(take_float(), take_float(), relative)

    try:
        while index < len(tokens):
            if is_command(tokens[index]):
                command = tokens[index]
                index += 1
            elif not command:
                return points

            relative = command.islower()
            upper = command.upper()

            if upper == "M":
                current = read_point(relative)
                subpath_start = current
                points.append(current)
                command = "l" if relative else "L"
                continue
            if upper == "Z":
                current = subpath_start
                points.append(current)
                continue

            while index < len(tokens) and not is_command(tokens[index]):
                if upper == "L":
                    current = read_point(relative)
                    points.append(current)
                elif upper == "H":
                    x = take_float()
                    current = ((current[0] + x) if relative else x, current[1])
                    points.append(current)
                elif upper == "V":
                    y = take_float()
                    current = (current[0], (current[1] + y) if relative else y)
                    points.append(current)
                elif upper == "C":
                    control_1 = read_point(relative)
                    control_2 = read_point(relative)
                    current = read_point(relative)
                    points.extend([control_1, control_2, current])
                elif upper == "S":
                    control = read_point(relative)
                    current = read_point(relative)
                    points.extend([control, current])
                elif upper == "Q":
                    control = read_point(relative)
                    current = read_point(relative)
                    points.extend([control, current])
                elif upper == "T":
                    current = read_point(relative)
                    points.append(current)
                elif upper == "A":
                    rx = take_float()
                    ry = take_float()
                    take_float()
                    take_float()
                    take_float()
                    current = read_point(relative)
                    points.extend(
                        [
                            (current[0] - rx, current[1] - ry),
                            (current[0] + rx, current[1] + ry),
                            current,
                        ]
                    )
                else:
                    return points
    except ValueError:
        return points

    return points


def numeric_attribute(element: ET.Element, name: str) -> float | None:
    value = element.get(name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def translated_point(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    point: tuple[float, float],
) -> tuple[float, float]:
    offset = cumulative_translate_position(element, parent_map)
    if offset is None:
        return point
    return point[0] + offset[0], point[1] + offset[1]


def element_bounds(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    include_path_points: bool = False,
) -> tuple[float, float, float, float] | None:
    points: list[tuple[float, float]] = []

    for child in element.iter():
        tag = local_name(child.tag)
        child_points: list[tuple[float, float]] = []
        if tag == "rect":
            x = numeric_attribute(child, "x") or 0.0
            y = numeric_attribute(child, "y") or 0.0
            width = numeric_attribute(child, "width")
            height = numeric_attribute(child, "height")
            if width is not None and height is not None:
                child_points.extend([(x, y), (x + width, y + height)])
        elif tag == "circle":
            cx = numeric_attribute(child, "cx")
            cy = numeric_attribute(child, "cy")
            radius = numeric_attribute(child, "r")
            if cx is not None and cy is not None and radius is not None:
                child_points.extend([(cx - radius, cy - radius), (cx + radius, cy + radius)])
        elif tag == "ellipse":
            cx = numeric_attribute(child, "cx")
            cy = numeric_attribute(child, "cy")
            rx = numeric_attribute(child, "rx")
            ry = numeric_attribute(child, "ry")
            if cx is not None and cy is not None and rx is not None and ry is not None:
                child_points.extend([(cx - rx, cy - ry), (cx + rx, cy + ry)])
        elif tag == "line":
            x1 = numeric_attribute(child, "x1")
            y1 = numeric_attribute(child, "y1")
            x2 = numeric_attribute(child, "x2")
            y2 = numeric_attribute(child, "y2")
            if x1 is not None and y1 is not None and x2 is not None and y2 is not None:
                child_points.extend([(x1, y1), (x2, y2)])
        elif tag in {"polygon", "polyline"}:
            child_points.extend(parse_points(child.get("points", "")))
        elif tag == "path":
            if include_path_points:
                child_points.extend(path_coordinate_points(child.get("d", "")))
            else:
                endpoints = path_endpoints(child.get("d", ""))
                if endpoints is not None:
                    child_points.extend(endpoints)
        elif tag == "text":
            x = numeric_attribute(child, "x")
            y = numeric_attribute(child, "y")
            if x is not None and y is not None:
                child_points.append((x, y))

        points.extend(translated_point(child, parent_map, point) for point in child_points)

    if not points:
        position = cumulative_translate_position(element, parent_map)
        if position is None:
            return None
        points.append(position)

    min_x = min(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_x = max(point[0] for point in points)
    max_y = max(point[1] for point in points)
    return min_x, min_y, max_x, max_y


def element_center(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float] | None:
    bounds = element_bounds(element, parent_map)
    if bounds is None:
        return cumulative_translate_position(element, parent_map)
    min_x, min_y, max_x, max_y = bounds
    return min_x + ((max_x - min_x) / 2), min_y + ((max_y - min_y) / 2)


def path_endpoints(value: str) -> tuple[tuple[float, float], tuple[float, float]] | None:
    tokens = re.findall(
        r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?",
        value,
    )
    if not tokens:
        return None

    index = 0
    command = ""
    current = (0.0, 0.0)
    subpath_start = (0.0, 0.0)
    first: tuple[float, float] | None = None

    def is_command(token: str) -> bool:
        return bool(re.fullmatch(r"[A-Za-z]", token))

    def take_float() -> float:
        nonlocal index
        if index >= len(tokens) or is_command(tokens[index]):
            raise ValueError
        value = float(tokens[index])
        index += 1
        return value

    def read_point(relative: bool) -> tuple[float, float]:
        x = take_float()
        y = take_float()
        if relative:
            return current[0] + x, current[1] + y
        return x, y

    try:
        while index < len(tokens):
            if is_command(tokens[index]):
                command = tokens[index]
                index += 1
            elif not command:
                return None

            relative = command.islower()
            upper = command.upper()

            if upper == "M":
                current = read_point(relative)
                subpath_start = current
                if first is None:
                    first = current
                command = "l" if relative else "L"
                continue
            if upper == "Z":
                current = subpath_start
                continue

            while index < len(tokens) and not is_command(tokens[index]):
                if upper == "L":
                    current = read_point(relative)
                elif upper == "H":
                    x = take_float()
                    current = ((current[0] + x) if relative else x, current[1])
                elif upper == "V":
                    y = take_float()
                    current = (current[0], (current[1] + y) if relative else y)
                elif upper == "C":
                    take_float()
                    take_float()
                    take_float()
                    take_float()
                    current = read_point(relative)
                elif upper == "S":
                    take_float()
                    take_float()
                    current = read_point(relative)
                elif upper == "Q":
                    take_float()
                    take_float()
                    current = read_point(relative)
                elif upper == "T":
                    current = read_point(relative)
                elif upper == "A":
                    take_float()
                    take_float()
                    take_float()
                    take_float()
                    take_float()
                    current = read_point(relative)
                else:
                    return None
    except ValueError:
        return None

    if first is None:
        return None
    return first, current


def edge_endpoints(candidate: Candidate) -> tuple[tuple[float, float], tuple[float, float]] | None:
    tag = local_name(candidate.element.tag)
    if tag == "path":
        return path_endpoints(candidate.element.get("d", ""))
    if tag == "line":
        try:
            return (
                (float(candidate.element.get("x1", "0")), float(candidate.element.get("y1", "0"))),
                (float(candidate.element.get("x2", "0")), float(candidate.element.get("y2", "0"))),
            )
        except ValueError:
            return None
    if tag == "polyline":
        points = parse_points(candidate.element.get("points", ""))
        if len(points) >= 2:
            return points[0], points[-1]
    return None


def effect_for(animation: str, role: str) -> str:
    if animation in {"state-flow", "flowchart-flow", "quadrant-points", "pie-segments", "radar-layers"}:
        animation = "sequence"
    if animation == "ishikawa":
        animation = "organic"
    if animation == "none":
        return "none"
    if animation in {"mindmap-level", "mindmap-branch", "organic"}:
        if role == "edge":
            return "grow-arrow"
        if role in {"cluster", "actor", "node"}:
            return "pop"
        return "fade"
    if animation == "sequence":
        if role == "edge":
            return "grow-arrow"
        if role in {"cluster", "actor", "node"}:
            return "pop"
        return "fade"
    if animation == "draw":
        return "draw" if role == "edge" else "fade"
    if role == "edge" and animation in TRANSFORM_EFFECTS:
        return "fade"
    return animation


def plan_staged_items_with_following_connections(
    stage_items: dict[int, list[Candidate]],
    args,
    effective_animation: str,
    connection_roles: set[str] | None = None,
) -> list[Candidate]:
    connection_roles = connection_roles or {"edge", "label"}
    stages = sorted(stage_items)
    duration = float(args.duration_ms)
    connection_gap = float(args.stagger_ms)
    stage_gap = float(args.stagger_ms)

    stage_spans: dict[int, float] = {}
    for stage in stages:
        items = stage_items[stage]
        has_base = any(candidate.role not in connection_roles for candidate in items)
        has_connection = any(candidate.role in connection_roles for candidate in items)
        stage_spans[stage] = (
            duration + connection_gap + duration if has_base and has_connection else duration
        )

    if args.total_ms is not None and len(stages) > 1:
        minimum_span = sum(stage_spans.values())
        available_gap = float(args.total_ms) - float(args.initial_delay_ms) - minimum_span
        if available_gap > stage_gap * (len(stages) - 1):
            stage_gap = available_gap / (len(stages) - 1)

    planned: list[Candidate] = []
    current_delay = float(args.initial_delay_ms)
    for stage in stages:
        items = stage_items[stage]
        has_base = any(candidate.role not in connection_roles for candidate in items)
        has_connection = any(candidate.role in connection_roles for candidate in items)
        connection_delay = (
            current_delay + duration + connection_gap if has_base and has_connection else current_delay
        )
        for candidate in items:
            candidate.effect = effect_for(effective_animation, candidate.role)
            candidate.delay_ms = connection_delay if candidate.role in connection_roles else current_delay
            candidate.duration_ms = duration
            candidate.stage = stage
            planned.append(candidate)
        current_delay += stage_spans[stage] + stage_gap

    return planned


def line_start(candidate: Candidate) -> tuple[float, float] | None:
    endpoints = edge_endpoints(candidate)
    if endpoints is None:
        return None
    return endpoints[0]


def parse_number_list(value: str, option_name: str) -> list[float]:
    stripped = value.strip()
    if not stripped:
        return []

    if stripped.startswith("["):
        loaded = json.loads(stripped)
        if not isinstance(loaded, list):
            raise ValueError(f"{option_name} JSON must be an array")
        raw_values = loaded
    else:
        raw_values = [part.strip() for part in stripped.split(",") if part.strip()]

    numbers: list[float] = []
    for raw_value in raw_values:
        number = float(raw_value)
        if number < 0:
            raise ValueError(f"{option_name} values must be zero or greater")
        numbers.append(number)
    return numbers


def ordered_reveal_key(candidate: Candidate) -> tuple[int, int, int]:
    return (
        0 if candidate.explicit_order is not None else 1,
        candidate.explicit_order if candidate.explicit_order is not None else 0,
        candidate.dom_index,
    )


def squared_distance(first: tuple[float, float], second: tuple[float, float]) -> float:
    return ((first[0] - second[0]) ** 2) + ((first[1] - second[1]) ** 2)


def nearest_candidate(
    point: tuple[float, float],
    candidates: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> Candidate | None:
    if not candidates:
        return None
    return min(candidates, key=lambda candidate: squared_distance(point, positions[id(candidate)]))
