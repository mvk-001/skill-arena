#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import shlex
import xml.etree.ElementTree as ET
from dataclasses import dataclass, replace
from pathlib import Path

from mermaid_animation.common import (
    Candidate,
    build_parent_map,
    candidate_matches,
    class_tokens,
    edge_endpoints,
    effect_for,
    element_bounds,
    local_name,
    parse_points,
    parse_viewbox,
    path_coordinate_points,
    qname,
    slug,
)
from mermaid_animation.style import append_classes, append_style_props


NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
DIRECTIVE_PREFIX = "%% @animate"
ANCHORS = {
    "center",
    "top",
    "right",
    "bottom",
    "left",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "start",
    "end",
}
EASING_ALIASES = {
    "linear": "linear",
    "in": "cubic-bezier(.42, 0, 1, 1)",
    "out": "cubic-bezier(0, 0, .2, 1)",
    "in-out": "cubic-bezier(.42, 0, .2, 1)",
}
COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z][a-zA-Z0-9-]*)$")


@dataclass
class DirectiveProgram:
    source: Path | None
    lines: list[tuple[int, str]]


@dataclass
class TargetDef:
    name: str
    selector: str
    candidates: list[Candidate]


@dataclass
class GroupDef:
    name: str
    refs: list[str]


@dataclass
class PointDef:
    name: str
    expression: str


@dataclass
class MarkDef:
    name: str
    point_expression: str
    options: dict[str, str]
    element: ET.Element | None = None
    initial_point: tuple[float, float] | None = None
    current_point: tuple[float, float] | None = None
    move_count: int = 0


@dataclass
class ActionDef:
    line_number: int
    time_ref: str
    verb: str
    subject: str
    args: list[str]
    options: dict[str, str]
    start_ms: float = 0.0
    duration_ms: float = 0.0
    end_ms: float = 0.0
    name: str = ""


@dataclass
class DirectiveDefinitions:
    version_options: dict[str, str]
    targets: dict[str, TargetDef]
    groups: dict[str, GroupDef]
    points: dict[str, PointDef]
    marks: dict[str, MarkDef]
    actions: list[ActionDef]


@dataclass
class DirectivePlan:
    candidates: list[Candidate]
    css_rules: list[str]
    total_ms: float


def load_directive_program(source: Path | None, directives_file: Path | None = None) -> DirectiveProgram | None:
    paths: list[Path] = []
    if source is not None and source.suffix.lower() in {".mmd", ".md"}:
        paths.append(source)
    if directives_file is not None:
        paths.append(directives_file)

    lines: list[tuple[int, str]] = []
    loaded_from: Path | None = None
    for path in paths:
        content = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith(DIRECTIVE_PREFIX):
                lines.append((line_number, stripped[len(DIRECTIVE_PREFIX) :].strip()))
        if lines:
            loaded_from = path

    if not lines:
        return None
    return DirectiveProgram(source=loaded_from, lines=lines)


def parse_directive_program(program: DirectiveProgram) -> DirectiveDefinitions:
    definitions = DirectiveDefinitions(
        version_options={},
        targets={},
        groups={},
        points={},
        marks={},
        actions=[],
    )

    for line_number, body in program.lines:
        if not body:
            continue
        if body == "v1" or body.startswith("v1 "):
            definitions.version_options.update(parse_option_tokens(split_tokens(body[2:].strip())))
            continue
        if body.startswith("target "):
            name, selector = parse_assignment(body[len("target ") :], "target", line_number)
            require_name(name, line_number)
            definitions.targets[name] = TargetDef(name=name, selector=selector, candidates=[])
            continue
        if body.startswith("group "):
            name, value = parse_assignment(body[len("group ") :], "group", line_number)
            require_name(name, line_number)
            refs = [part.strip() for part in value.split(",") if part.strip()]
            if not refs:
                raise ValueError(f"Line {line_number}: group {name!r} must include at least one target")
            definitions.groups[name] = GroupDef(name=name, refs=refs)
            continue
        if body.startswith("point "):
            name, expression = parse_assignment(body[len("point ") :], "point", line_number)
            require_name(name, line_number)
            definitions.points[name] = PointDef(name=name, expression=expression)
            continue
        if body.startswith("mark "):
            mark = parse_mark(body, line_number)
            definitions.marks[mark.name] = mark
            continue
        if body.startswith("at "):
            definitions.actions.append(parse_action(body, line_number))
            continue
        raise ValueError(f"Line {line_number}: unknown @animate directive: {body}")

    return definitions


def parse_assignment(value: str, label: str, line_number: int) -> tuple[str, str]:
    if "=" not in value:
        raise ValueError(f"Line {line_number}: {label} directive must use name = value")
    name, raw_value = value.split("=", 1)
    name = name.strip()
    raw_value = raw_value.strip()
    if not raw_value:
        raise ValueError(f"Line {line_number}: {label} {name!r} has an empty value")
    return name, raw_value


def require_name(name: str, line_number: int) -> None:
    if not NAME_RE.fullmatch(name):
        raise ValueError(
            f"Line {line_number}: names must use lowercase letters, digits, and hyphens, "
            f"and must start with a letter: {name!r}"
        )


def split_tokens(value: str) -> list[str]:
    if not value:
        return []
    lexer = shlex.shlex(value, posix=True)
    lexer.whitespace_split = True
    lexer.commenters = ""
    return list(lexer)


def parse_option_tokens(tokens: list[str]) -> dict[str, str]:
    options: dict[str, str] = {}
    for token in tokens:
        if "=" not in token:
            raise ValueError(f"Option token must use key=value: {token!r}")
        key, value = token.split("=", 1)
        key = key.strip()
        if not key:
            raise ValueError(f"Option token has an empty key: {token!r}")
        options[key] = value.strip()
    return options


def parse_mark(body: str, line_number: int) -> MarkDef:
    match = re.match(r"^mark\s+([a-z][a-z0-9-]*)\s+at\s+(.+)$", body)
    if not match:
        raise ValueError(f"Line {line_number}: mark directive must use mark <name> at <point>")
    name = match.group(1)
    require_name(name, line_number)
    tokens = split_tokens(match.group(2))
    point_tokens, option_tokens = split_point_and_options(tokens)
    if not point_tokens:
        raise ValueError(f"Line {line_number}: mark {name!r} needs a point expression")
    return MarkDef(
        name=name,
        point_expression=" ".join(point_tokens),
        options=parse_option_tokens(option_tokens),
    )


def parse_action(body: str, line_number: int) -> ActionDef:
    tokens = split_tokens(body)
    if len(tokens) < 4:
        raise ValueError(f"Line {line_number}: action directive must use at <time> <verb> <subject>")
    _, time_ref, verb, subject, *rest = tokens
    args, option_tokens = split_action_args_and_options(rest)
    options = parse_option_tokens(option_tokens)
    return ActionDef(
        line_number=line_number,
        time_ref=time_ref,
        verb=verb,
        subject=subject,
        args=args,
        options=options,
    )


def split_point_and_options(tokens: list[str]) -> tuple[list[str], list[str]]:
    for index, token in enumerate(tokens):
        if is_option_token(token):
            return tokens[:index], tokens[index:]
    return tokens, []


def split_action_args_and_options(tokens: list[str]) -> tuple[list[str], list[str]]:
    for index, token in enumerate(tokens):
        if is_option_token(token):
            return tokens[:index], tokens[index:]
    return tokens, []


def is_option_token(token: str) -> bool:
    return bool(re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]*=.*", token))


def parse_time_ms(value: str, label: str = "time") -> float:
    raw = value.strip()
    multiplier = 1.0
    if raw.endswith("ms"):
        raw = raw[:-2]
    elif raw.endswith("s"):
        raw = raw[:-1]
        multiplier = 1000.0
    try:
        number = float(raw)
    except ValueError:
        raise ValueError(f"{label} must be a number with optional ms or s unit: {value!r}") from None
    if number < 0:
        raise ValueError(f"{label} must be zero or greater: {value!r}")
    return number * multiplier


def duration_for(action: ActionDef, args: argparse.Namespace, definitions: DirectiveDefinitions) -> float:
    raw = action.options.get("duration") or action.options.get("duration-ms")
    if raw is not None:
        return parse_time_ms(raw, f"Line {action.line_number}: duration")
    raw_default = definitions.version_options.get("default-duration") or definitions.version_options.get(
        "default-action-duration"
    )
    if raw_default:
        return parse_time_ms(raw_default, f"Line {action.line_number}: default duration")
    return float(args.duration_ms)


def gap_for(action: ActionDef, args: argparse.Namespace) -> float:
    raw = action.options.get("gap")
    if raw is None:
        return float(args.stagger_ms)
    return parse_time_ms(raw, f"Line {action.line_number}: gap")


def normalize_easing(value: str | None, default: str) -> str:
    if not value:
        return default
    return EASING_ALIASES.get(value, value)


def append_animation(element: ET.Element, animation: str) -> None:
    style = element.get("style", "")
    match = re.search(r"animation\s*:\s*([^;]+);?", style)
    if match:
        existing = match.group(1).strip()
        replacement = f"animation: {existing}, {animation};"
        style = style[: match.start()] + replacement + style[match.end() :]
        element.set("style", style.strip())
        return
    append_style_props(element, {"animation": animation})


def graphical_descendants(element: ET.Element) -> list[ET.Element]:
    tags = {
        "g",
        "path",
        "line",
        "polyline",
        "polygon",
        "rect",
        "circle",
        "ellipse",
        "text",
        "foreignObject",
        "div",
        "span",
        "p",
    }
    return [child for child in element.iter() if local_name(child.tag) in tags]


def unquote_selector_value(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in {"'", '"'}:
        return stripped[1:-1]
    return stripped


def resolve_targets(root: ET.Element, candidates: list[Candidate], definitions: DirectiveDefinitions) -> None:
    for target in definitions.targets.values():
        target.candidates = resolve_selector(root, candidates, target.selector)
        if not target.candidates:
            raise ValueError(f"Target {target.name!r} matched no rendered SVG elements: {target.selector}")


def resolve_selector(root: ET.Element, candidates: list[Candidate], selector: str) -> list[Candidate]:
    raw = selector.strip()
    if raw.startswith("css:"):
        return resolve_css_selector(root, raw.split(":", 1)[1])
    return [candidate for candidate in candidates if candidate_matches(candidate, raw)]


def resolve_css_selector(root: ET.Element, raw_selector: str) -> list[Candidate]:
    selector = unquote_selector_value(raw_selector)
    parent_map = build_parent_map(root)
    dom_order = {element: index for index, element in enumerate(root.iter())}
    elements: list[ET.Element] = []

    if selector.startswith("#"):
        wanted = selector[1:]
        elements = [element for element in root.iter() if element.get("id") == wanted]
    elif selector.startswith("."):
        wanted = selector[1:]
        elements = [element for element in root.iter() if wanted in class_tokens(element)]
    elif re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9_-]+)?", selector):
        tag, _, class_name = selector.partition(".")
        elements = [
            element
            for element in root.iter()
            if local_name(element.tag) == tag and (not class_name or class_name in class_tokens(element))
        ]
    else:
        raise ValueError(
            f"Unsupported css: selector {selector!r}. Use #id, .class, tag, or tag.class in @animate directives."
        )

    return [
        Candidate(
            element=element,
            role="edge" if local_name(element.tag) in {"path", "line", "polyline"} else "item",
            dom_index=dom_order.get(element, 0),
            element_id=element.get("id", ""),
            classes=class_tokens(element),
            text=" ".join(part.strip() for part in element.itertext() if part and part.strip()),
        )
        for element in elements
        if element not in parent_map or local_name(element.tag) not in {"style", "defs", "marker"}
    ]


def plan_directive_program(
    root: ET.Element,
    candidates: list[Candidate],
    args: argparse.Namespace,
    program: DirectiveProgram,
) -> DirectivePlan:
    definitions = parse_directive_program(program)
    resolve_targets(root, candidates, definitions)

    parent_map = build_parent_map(root)
    viewbox = parse_viewbox(root)
    if viewbox is None:
        raise ValueError("The rendered SVG must have a viewBox before @animate points can be resolved.")

    overlay = ensure_overlay_layer(root)
    css_rules: list[str] = [directive_base_css()]
    for mark in definitions.marks.values():
        create_mark_element(overlay, mark, root, parent_map, viewbox, definitions)

    planned: list[Candidate] = []
    scheduled_elements: set[int] = set()
    action_ends: dict[str, float] = {}
    previous_start_ms = 0.0
    max_end_ms = 0.0

    for action_index, action in enumerate(definitions.actions):
        action.duration_ms = duration_for(action, args, definitions)
        action.start_ms = resolve_action_start(action, action_ends, previous_start_ms)
        previous_start_ms = action.start_ms
        action.name = action.options.get("name", implicit_action_name(action, action_ends))

        end_ms = compile_action(
            action_index=action_index,
            action=action,
            definitions=definitions,
            root=root,
            parent_map=parent_map,
            viewbox=viewbox,
            args=args,
            planned=planned,
            scheduled_elements=scheduled_elements,
            css_rules=css_rules,
        )
        action.end_ms = end_ms
        max_end_ms = max(max_end_ms, end_ms)
        if action.name:
            action_ends[action.name] = end_ms

    return DirectivePlan(candidates=planned, css_rules=css_rules, total_ms=max_end_ms)


def resolve_action_start(action: ActionDef, action_ends: dict[str, float], previous_start_ms: float) -> float:
    value = action.time_ref
    if value.startswith("+"):
        return previous_start_ms + parse_time_ms(value[1:], f"Line {action.line_number}: relative time")
    boundary_match = re.fullmatch(r"([a-z][a-z0-9-]*)\.end(?:(\+|-)(.+))?", value)
    if boundary_match:
        name = boundary_match.group(1)
        if name not in action_ends:
            raise ValueError(f"Line {action.line_number}: unknown action end reference {value!r}")
        start = action_ends[name]
        sign = boundary_match.group(2)
        offset = boundary_match.group(3)
        if sign and offset:
            offset_ms = parse_time_ms(offset, f"Line {action.line_number}: boundary offset")
            start = start + offset_ms if sign == "+" else start - offset_ms
            if start < 0:
                raise ValueError(f"Line {action.line_number}: boundary offset resolves before 0ms")
        return start
    return parse_time_ms(value, f"Line {action.line_number}: time")


def implicit_action_name(action: ActionDef, action_ends: dict[str, float]) -> str:
    if action.subject not in action_ends:
        return action.subject
    return ""


def compile_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    viewbox: tuple[float, float, float, float],
    args: argparse.Namespace,
    planned: list[Candidate],
    scheduled_elements: set[int],
    css_rules: list[str],
) -> float:
    verb = action.verb
    if verb in {"show", "reveal"}:
        return compile_reveal_action(action, definitions, args, planned, scheduled_elements, css_rules)
    if verb == "trace":
        return compile_trace_action(action, definitions, args, planned, scheduled_elements)
    if verb == "move":
        return compile_move_action(action_index, action, definitions, root, parent_map, viewbox, css_rules, args)
    if verb == "color":
        return compile_color_action(action_index, action, definitions, css_rules, args)
    if verb == "pulse":
        return compile_pulse_action(action_index, action, definitions, css_rules, args)
    if verb == "hide":
        return compile_hide_action(action_index, action, definitions, css_rules, args)
    if verb == "set":
        return compile_set_action(action, definitions)
    raise ValueError(f"Line {action.line_number}: unsupported @animate verb {verb!r}")


def compile_reveal_action(
    action: ActionDef,
    definitions: DirectiveDefinitions,
    args: argparse.Namespace,
    planned: list[Candidate],
    scheduled_elements: set[int],
    css_rules: list[str],
) -> float:
    if action.subject in definitions.marks:
        return compile_mark_reveal_action(action, definitions, css_rules=css_rules, args=args)

    targets = resolve_subject_candidates(action.subject, definitions)
    mode = action.options.get("mode", "together")
    gap_ms = gap_for(action, args) if mode == "sequence" else 0.0
    if mode not in {"together", "sequence"}:
        raise ValueError(f"Line {action.line_number}: reveal mode must be together or sequence")

    for index, candidate in enumerate(targets):
        scheduled = schedule_candidate(
            source=candidate,
            delay_ms=action.start_ms + (index * gap_ms),
            duration_ms=action.duration_ms,
            effect=action.options.get("effect") or effect_for("sequence", candidate.role),
            easing=normalize_easing(action.options.get("ease"), args.easing),
            scheduled_elements=scheduled_elements,
        )
        planned.append(scheduled)
    return action.start_ms + action.duration_ms + (max(0, len(targets) - 1) * gap_ms)


def compile_trace_action(
    action: ActionDef,
    definitions: DirectiveDefinitions,
    args: argparse.Namespace,
    planned: list[Candidate],
    scheduled_elements: set[int],
) -> float:
    targets = resolve_subject_candidates(action.subject, definitions)
    for candidate in targets:
        effect = action.options.get("effect") or ("grow-arrow" if candidate.role == "edge" else "draw")
        scheduled = schedule_candidate(
            source=candidate,
            delay_ms=action.start_ms,
            duration_ms=action.duration_ms,
            effect=effect,
            easing=normalize_easing(action.options.get("ease"), args.easing),
            scheduled_elements=scheduled_elements,
        )
        planned.append(scheduled)
    return action.start_ms + action.duration_ms


def compile_mark_reveal_action(
    action: ActionDef,
    definitions: DirectiveDefinitions,
    css_rules: list[str] | None,
    args: argparse.Namespace,
) -> float:
    if css_rules is None:
        raise ValueError("Internal error: mark reveal needs CSS output")
    mark = definitions.marks[action.subject]
    if mark.element is None:
        raise ValueError(f"Line {action.line_number}: mark {mark.name!r} was not created")
    class_name = f"am-directive-mark-show-{len(css_rules)}"
    keyframe = f"{class_name}-kf"
    effect = action.options.get("effect", "fade")
    easing = normalize_easing(action.options.get("ease"), args.easing)
    append_classes(mark.element, [class_name])
    append_animation(mark.element, f"{keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms forwards")
    if effect == "pop":
        frames = "0% { opacity: 0; } 70% { opacity: 1; } 100% { opacity: 1; }"
    else:
        frames = "from { opacity: 0; } to { opacity: 1; }"
    css_rules.append(
        f"""
.{class_name} {{
  transform-box: view-box;
  transform-origin: 0 0;
}}
@keyframes {keyframe} {{
  {frames}
}}
""".strip()
    )
    return action.start_ms + action.duration_ms


def schedule_candidate(
    source: Candidate,
    delay_ms: float,
    duration_ms: float,
    effect: str,
    easing: str,
    scheduled_elements: set[int],
) -> Candidate:
    element_key = id(source.element)
    if element_key in scheduled_elements:
        raise ValueError(
            "A rendered SVG element cannot have more than one reveal or trace directive. "
            "Use movement, color, pulse, hide, or set for later actions on the same target."
        )
    scheduled_elements.add(element_key)
    candidate = replace(source)
    candidate.delay_ms = delay_ms
    candidate.duration_ms = duration_ms
    candidate.effect = effect
    candidate.easing = easing
    return candidate


def compile_move_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    viewbox: tuple[float, float, float, float],
    css_rules: list[str],
    args: argparse.Namespace,
) -> float:
    to_expression = action.options.get("to") or read_move_to_expression(action)
    if not to_expression:
        raise ValueError(f"Line {action.line_number}: move requires to <point> or to=<point>")
    from_expression = action.options.get("from")
    easing = normalize_easing(action.options.get("ease"), args.easing)
    class_name = f"am-directive-move-{action_index}"
    keyframe = f"am-directive-move-kf-{action_index}"

    mark = definitions.marks.get(action.subject)
    if mark is not None:
        if mark.element is None or mark.initial_point is None:
            raise ValueError(f"Line {action.line_number}: mark {mark.name!r} was not created")
        start = (
            resolve_point(from_expression, root, parent_map, viewbox, definitions)
            if from_expression
            else mark.current_point or mark.initial_point
        )
        end = resolve_point(to_expression, root, parent_map, viewbox, definitions)
        via_points = resolve_via_points(action, root, parent_map, viewbox, definitions)
        move_points = [start, *via_points, end]
        append_classes(mark.element, [class_name])
        append_animation(
            mark.element,
            f"{keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms forwards",
        )
        css_rules.append(
            f"""
.{class_name} {{
  transform-box: view-box;
  transform-origin: 0 0;
}}
@keyframes {keyframe} {{
  {movement_keyframes(move_points, mark=True, reveal=mark.move_count == 0)}
}}
""".strip()
        )
        mark.current_point = end
        mark.move_count += 1
        return action.start_ms + action.duration_ms

    targets = resolve_subject_candidates(action.subject, definitions)
    for index, candidate in enumerate(targets):
        element = candidate.element
        current = element_center_or_error(element, parent_map, action.line_number, action.subject)
        start = resolve_point(from_expression, root, parent_map, viewbox, definitions) if from_expression else current
        end = resolve_point(to_expression, root, parent_map, viewbox, definitions)
        via_points = resolve_via_points(action, root, parent_map, viewbox, definitions)
        move_points = [start, *via_points, end]
        target_class = f"{class_name}-{index}"
        target_keyframe = f"{keyframe}-{index}"
        append_classes(element, [target_class])
        relative_points = [(point[0] - current[0], point[1] - current[1]) for point in move_points]
        append_animation(
            element,
            f"{target_keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms forwards",
        )
        css_rules.append(
            f"""
.{target_class} {{
  transform-box: fill-box;
  transform-origin: center;
}}
@keyframes {target_keyframe} {{
  {movement_keyframes(relative_points, mark=False, reveal=False)}
}}
""".strip()
        )
    return action.start_ms + action.duration_ms


def resolve_via_points(
    action: ActionDef,
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    viewbox: tuple[float, float, float, float],
    definitions: DirectiveDefinitions,
) -> list[tuple[float, float]]:
    raw = action.options.get("via", "")
    if not raw:
        return []
    return [
        resolve_point(part.strip(), root, parent_map, viewbox, definitions)
        for part in raw.split("|")
        if part.strip()
    ]


def movement_keyframes(points: list[tuple[float, float]], mark: bool, reveal: bool) -> str:
    if len(points) < 2:
        points = [points[0], points[0]]
    frames: list[str] = []
    last_index = len(points) - 1
    for index, point in enumerate(points):
        percent = 100.0 * index / last_index
        opacity = "opacity: 1; " if mark else ""
        if mark and index == 0 and reveal:
            frames.append(
                f"0% {{ opacity: 0; transform: translate({point[0]:.3f}px, {point[1]:.3f}px); }}"
            )
            frames.append(
                f"8% {{ opacity: 1; transform: translate({point[0]:.3f}px, {point[1]:.3f}px); }}"
            )
            continue
        frames.append(
            f"{percent:.3f}% {{ {opacity}transform: translate({point[0]:.3f}px, {point[1]:.3f}px); }}"
        )
    return "\n  ".join(frames)


def read_move_to_expression(action: ActionDef) -> str:
    if not action.args:
        return ""
    if action.args[0] != "to":
        raise ValueError(f"Line {action.line_number}: move arguments must use to <point>")
    if len(action.args) < 2:
        raise ValueError(f"Line {action.line_number}: move to requires a point expression")
    return " ".join(action.args[1:])


def compile_color_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    css_rules: list[str],
    args: argparse.Namespace,
) -> float:
    targets = resolve_subject_candidates(action.subject, definitions)
    props = color_props(action)
    easing = normalize_easing(action.options.get("ease"), args.easing)
    restore = action.options.get("restore", "false") == "true"
    for index, candidate in enumerate(targets):
        class_name = f"am-directive-color-{action_index}-{index}"
        keyframe = f"am-directive-color-kf-{action_index}-{index}"
        fill_mode = "none" if restore else "forwards"
        for element_offset, element in enumerate(graphical_descendants(candidate.element)):
            element_props = color_props_for_element(element, props)
            if not element_props:
                continue
            element_keyframe = f"{keyframe}-{element_offset}"
            to_props = " ".join(f"{name}: {value};" for name, value in element_props.items())
            frames = f"50% {{ {to_props} }}" if restore else f"to {{ {to_props} }}"
            append_classes(element, [class_name])
            append_animation(
                element,
                f"{element_keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms {fill_mode}",
            )
            css_rules.append(
                f"""
@keyframes {element_keyframe} {{
  {frames}
}}
""".strip()
            )
        css_rules.append(
            f"""
.{class_name} {{
  animation-composition: replace;
}}
""".strip()
        )
    return action.start_ms + action.duration_ms


def color_props(action: ActionDef) -> dict[str, str]:
    props: dict[str, str] = {}
    for key, css_name in (("fill", "fill"), ("stroke", "stroke"), ("text", "color"), ("opacity", "opacity")):
        if key not in action.options:
            continue
        value = action.options[key]
        if key == "opacity":
            number = float(value)
            if not 0 <= number <= 1:
                raise ValueError(f"Line {action.line_number}: opacity must be between 0 and 1")
            props[css_name] = str(number)
        else:
            validate_color(value, action.line_number)
            props[css_name] = value
    if not props:
        raise ValueError(f"Line {action.line_number}: color needs fill, stroke, text, or opacity")
    return props


def color_props_for_element(element: ET.Element, props: dict[str, str]) -> dict[str, str]:
    tag = local_name(element.tag)
    selected: dict[str, str] = {}
    if "opacity" in props:
        selected["opacity"] = props["opacity"]
    if tag in {"text", "foreignObject", "div", "span", "p"}:
        text_value = props.get("color") or props.get("fill")
        if text_value:
            selected["fill"] = text_value
            selected["color"] = text_value
        return selected
    if tag in {"rect", "circle", "ellipse", "path", "line", "polyline", "polygon", "g"}:
        if "fill" in props:
            selected["fill"] = props["fill"]
        if "stroke" in props:
            selected["stroke"] = props["stroke"]
    return selected


def validate_color(value: str, line_number: int) -> None:
    if not COLOR_RE.fullmatch(value):
        raise ValueError(f"Line {line_number}: malformed color value {value!r}")


def compile_pulse_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    css_rules: list[str],
    args: argparse.Namespace,
) -> float:
    targets = resolve_subject_candidates(action.subject, definitions)
    scale = float(action.options.get("scale", "1.08"))
    if scale <= 0:
        raise ValueError(f"Line {action.line_number}: pulse scale must be greater than zero")
    repeat = int(action.options.get("repeat", "1"))
    if repeat < 1:
        raise ValueError(f"Line {action.line_number}: pulse repeat must be at least 1")
    easing = normalize_easing(action.options.get("ease"), args.easing)
    pulse_props: list[str] = []
    for key in ("fill", "stroke"):
        if key in action.options:
            validate_color(action.options[key], action.line_number)
            pulse_props.append(f"{key}: {action.options[key]};")
    mid_props = " ".join([f"transform: scale({scale:.3f});", *pulse_props])
    for index, candidate in enumerate(targets):
        class_name = f"am-directive-pulse-{action_index}-{index}"
        keyframe = f"am-directive-pulse-kf-{action_index}-{index}"
        for element in pulse_target_elements(candidate.element):
            append_classes(element, [class_name])
            append_animation(
                element,
                f"{keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms {repeat}",
            )
        css_rules.append(
            f"""
.{class_name} {{
  transform-box: fill-box;
  transform-origin: center;
}}
@keyframes {keyframe} {{
  0%, 100% {{ transform: none; }}
  50% {{ {mid_props} }}
}}
""".strip()
        )
    return action.start_ms + (action.duration_ms * repeat)


def pulse_target_elements(element: ET.Element) -> list[ET.Element]:
    if element.get("transform") and local_name(element.tag) == "g":
        descendants = [
            descendant
            for descendant in graphical_descendants(element)
            if descendant is not element and local_name(descendant.tag) != "g"
        ]
        if descendants:
            return descendants
    return [element]


def compile_hide_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    css_rules: list[str],
    args: argparse.Namespace,
) -> float:
    if action.subject in definitions.marks:
        return compile_mark_hide_action(action_index, action, definitions, css_rules, args)

    targets = resolve_subject_candidates(action.subject, definitions)
    easing = normalize_easing(action.options.get("ease"), args.easing)
    restore = action.options.get("restore", "false") == "true"
    for index, candidate in enumerate(targets):
        class_name = f"am-directive-hide-{action_index}-{index}"
        keyframe = f"am-directive-hide-kf-{action_index}-{index}"
        append_classes(candidate.element, [class_name])
        fill_mode = "none" if restore else "forwards"
        frames = "50% { opacity: 0; }" if restore else "to { opacity: 0; }"
        append_animation(
            candidate.element,
            f"{keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms {fill_mode}",
        )
        css_rules.append(
            f"""
.{class_name} {{
  animation-composition: replace;
}}
@keyframes {keyframe} {{
  {frames}
}}
""".strip()
        )
    return action.start_ms + action.duration_ms


def compile_mark_hide_action(
    action_index: int,
    action: ActionDef,
    definitions: DirectiveDefinitions,
    css_rules: list[str],
    args: argparse.Namespace,
) -> float:
    mark = definitions.marks[action.subject]
    if mark.element is None:
        raise ValueError(f"Line {action.line_number}: mark {mark.name!r} was not created")
    class_name = f"am-directive-mark-hide-{action_index}"
    keyframe = f"am-directive-mark-hide-kf-{action_index}"
    easing = normalize_easing(action.options.get("ease"), args.easing)
    restore = action.options.get("restore", "false") == "true"
    fill_mode = "none" if restore else "forwards"
    frames = "50% { opacity: 0; }" if restore else "to { opacity: 0; }"
    append_classes(mark.element, [class_name])
    append_animation(mark.element, f"{keyframe} {action.duration_ms:.3f}ms {easing} {action.start_ms:.3f}ms {fill_mode}")
    css_rules.append(
        f"""
.{class_name} {{
  animation-composition: replace;
}}
@keyframes {keyframe} {{
  {frames}
}}
""".strip()
    )
    return action.start_ms + action.duration_ms


def compile_set_action(action: ActionDef, definitions: DirectiveDefinitions) -> float:
    targets = resolve_subject_candidates(action.subject, definitions)
    allowed = {"fill", "stroke", "opacity", "display"}
    props = {key: value for key, value in action.options.items() if key in allowed}
    if not props:
        raise ValueError(f"Line {action.line_number}: set needs one of fill, stroke, opacity, or display")
    for candidate in targets:
        append_style_props(candidate.element, props)
    return action.start_ms


def resolve_subject_candidates(subject: str, definitions: DirectiveDefinitions) -> list[Candidate]:
    if subject in definitions.targets:
        return definitions.targets[subject].candidates
    if subject in definitions.groups:
        candidates: list[Candidate] = []
        for ref in definitions.groups[subject].refs:
            candidates.extend(resolve_subject_candidates(ref, definitions))
        return candidates
    if subject in definitions.marks:
        raise ValueError(f"Mark {subject!r} can only be used with move actions for now")
    raise ValueError(f"Unknown @animate target or group {subject!r}")


def ensure_overlay_layer(root: ET.Element) -> ET.Element:
    for child in root:
        if child.get("id") == "am-directive-overlays":
            return child
    overlay = ET.Element(qname("g"), {"id": "am-directive-overlays", "class": "am-directive-overlays"})
    root.append(overlay)
    return overlay


def create_mark_element(
    overlay: ET.Element,
    mark: MarkDef,
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    viewbox: tuple[float, float, float, float],
    definitions: DirectiveDefinitions,
) -> None:
    point = resolve_point(mark.point_expression, root, parent_map, viewbox, definitions)
    mark.initial_point = point
    mark.current_point = point
    shape = mark.options.get("shape", "dot")
    mark_id = f"am-mark-{slug(mark.name)}"
    group = ET.Element(
        qname("g"),
        {
            "id": mark_id,
            "class": f"am-directive-mark am-directive-mark-{shape}",
            "transform": f"translate({point[0]:.3f} {point[1]:.3f})",
            "style": "opacity: 1;" if mark.options.get("visible") == "true" else "opacity: 0;",
        },
    )
    size = float(mark.options.get("size", "10"))
    if size <= 0:
        raise ValueError(f"Mark {mark.name!r} size must be greater than zero")
    fill = mark.options.get("fill", "#1971c2")
    stroke = mark.options.get("stroke", fill)
    if shape == "dot":
        group.append(ET.Element(qname("circle"), {"cx": "0", "cy": "0", "r": f"{size / 2:.3f}", "fill": fill}))
    elif shape == "ring":
        group.append(
            ET.Element(
                qname("circle"),
                {
                    "cx": "0",
                    "cy": "0",
                    "r": f"{size / 2:.3f}",
                    "fill": "none",
                    "stroke": stroke,
                    "stroke-width": mark.options.get("stroke-width", "2"),
                },
            )
        )
    elif shape == "label":
        text = mark.options.get("text", mark.name)
        padding = max(4.0, size * 0.45)
        width = max(size * 2.2, len(text) * size * 0.62)
        height = size * 1.65
        group.append(
            ET.Element(
                qname("rect"),
                {
                    "x": f"{-(width / 2):.3f}",
                    "y": f"{-(height / 2):.3f}",
                    "width": f"{width:.3f}",
                    "height": f"{height:.3f}",
                    "rx": "4",
                    "fill": fill,
                    "stroke": stroke,
                },
            )
        )
        text_element = ET.Element(
            qname("text"),
            {
                "x": "0",
                "y": f"{size * 0.34:.3f}",
                "font-size": f"{size:.3f}",
                "text-anchor": "middle",
                "fill": mark.options.get("text-fill", "#1f2933"),
            },
        )
        text_element.text = text
        group.append(text_element)
        group.set("data-padding", f"{padding:.3f}")
    else:
        raise ValueError(f"Mark {mark.name!r} has unsupported shape {shape!r}")
    overlay.append(group)
    mark.element = group


def resolve_point(
    expression: str | None,
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    viewbox: tuple[float, float, float, float],
    definitions: DirectiveDefinitions,
) -> tuple[float, float]:
    if expression is None:
        raise ValueError("Missing point expression")
    expr = expression.strip()
    if not expr:
        raise ValueError("Empty point expression")
    if expr in definitions.points:
        return resolve_point(definitions.points[expr].expression, root, parent_map, viewbox, definitions)
    if expr.startswith("xy(") and expr.endswith(")"):
        first, second = split_args(expr[3:-1], expected=2)
        return parse_coordinate(first, viewbox, "x"), parse_coordinate(second, viewbox, "y")
    if expr.startswith("mid(") and expr.endswith(")"):
        first, second = split_args(expr[4:-1], expected=2)
        point_a = resolve_point(first, root, parent_map, viewbox, definitions)
        point_b = resolve_point(second, root, parent_map, viewbox, definitions)
        return (point_a[0] + point_b[0]) / 2, (point_a[1] + point_b[1]) / 2
    if expr.startswith("offset(") and expr.endswith(")"):
        base_expr, raw_dx, raw_dy = split_args(expr[7:-1], expected=3)
        base = resolve_point(base_expr, root, parent_map, viewbox, definitions)
        return base[0] + float(raw_dx), base[1] + float(raw_dy)

    path_match = re.fullmatch(r"([a-z][a-z0-9-]*)[:.]path\(([^)]+)\)", expr)
    if path_match:
        target = single_target(path_match.group(1), definitions)
        fraction = float(path_match.group(2))
        if not 0 <= fraction <= 1:
            raise ValueError(f"path() fraction must be between 0 and 1: {expr}")
        return point_on_candidate_path(target, fraction)

    anchor_match = re.fullmatch(r"([a-z][a-z0-9-]*)\.([a-z-]+)", expr)
    if anchor_match:
        target_name = anchor_match.group(1)
        anchor = anchor_match.group(2)
        if anchor not in ANCHORS:
            raise ValueError(f"Unknown point anchor {anchor!r} in {expr!r}")
        target = single_target(target_name, definitions)
        return candidate_anchor(target, anchor, parent_map)

    raise ValueError(f"Unknown point expression: {expr}")


def parse_coordinate(raw: str, viewbox: tuple[float, float, float, float], axis: str) -> float:
    value = raw.strip()
    minimum = viewbox[0] if axis == "x" else viewbox[1]
    span = viewbox[2] if axis == "x" else viewbox[3]
    if value.endswith("%"):
        return minimum + (span * float(value[:-1]) / 100.0)
    return float(value)


def split_args(value: str, expected: int) -> list[str]:
    args: list[str] = []
    depth = 0
    current: list[str] = []
    for char in value:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
            continue
        current.append(char)
    args.append("".join(current).strip())
    if len(args) != expected or any(not arg for arg in args):
        raise ValueError(f"Expected {expected} argument(s), got {len(args)} in {value!r}")
    return args


def single_target(name: str, definitions: DirectiveDefinitions) -> Candidate:
    candidates = resolve_subject_candidates(name, definitions)
    if len(candidates) != 1:
        raise ValueError(f"Point expression {name!r} must resolve to exactly one target, got {len(candidates)}")
    return candidates[0]


def candidate_anchor(
    candidate: Candidate,
    anchor: str,
    parent_map: dict[ET.Element, ET.Element],
) -> tuple[float, float]:
    if anchor in {"start", "end"}:
        endpoints = edge_endpoints(candidate)
        if endpoints is not None:
            return endpoints[0 if anchor == "start" else 1]

    bounds = element_bounds(candidate.element, parent_map, include_path_points=True)
    if bounds is None:
        raise ValueError(f"Cannot resolve bounds for target {candidate.element_id or candidate.text!r}")
    min_x, min_y, max_x, max_y = bounds
    mid_x = min_x + ((max_x - min_x) / 2)
    mid_y = min_y + ((max_y - min_y) / 2)
    return {
        "center": (mid_x, mid_y),
        "top": (mid_x, min_y),
        "right": (max_x, mid_y),
        "bottom": (mid_x, max_y),
        "left": (min_x, mid_y),
        "top-left": (min_x, min_y),
        "top-right": (max_x, min_y),
        "bottom-left": (min_x, max_y),
        "bottom-right": (max_x, max_y),
        "start": (mid_x, mid_y),
        "end": (mid_x, mid_y),
    }[anchor]


def point_on_candidate_path(candidate: Candidate, fraction: float) -> tuple[float, float]:
    element = candidate.element
    tag = local_name(element.tag)
    points: list[tuple[float, float]] = []
    if tag == "path":
        points = path_coordinate_points(element.get("d", ""))
    elif tag == "polyline":
        points = parse_points(element.get("points", ""))
    elif tag == "line":
        endpoints = edge_endpoints(candidate)
        if endpoints:
            points = [endpoints[0], endpoints[1]]
    if len(points) < 2:
        endpoints = edge_endpoints(candidate)
        if endpoints:
            points = [endpoints[0], endpoints[1]]
    if len(points) < 2:
        raise ValueError(f"Target {candidate.element_id or candidate.text!r} is not path-like")
    return interpolate_polyline(points, fraction)


def interpolate_polyline(points: list[tuple[float, float]], fraction: float) -> tuple[float, float]:
    segments: list[tuple[tuple[float, float], tuple[float, float], float]] = []
    total = 0.0
    for first, second in zip(points, points[1:]):
        length = ((second[0] - first[0]) ** 2 + (second[1] - first[1]) ** 2) ** 0.5
        if length <= 0:
            continue
        segments.append((first, second, length))
        total += length
    if not segments:
        return points[0]
    remaining = total * fraction
    for first, second, length in segments:
        if remaining <= length:
            ratio = remaining / length
            return first[0] + ((second[0] - first[0]) * ratio), first[1] + ((second[1] - first[1]) * ratio)
        remaining -= length
    return segments[-1][1]


def element_center_or_error(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    line_number: int,
    subject: str,
) -> tuple[float, float]:
    bounds = element_bounds(element, parent_map, include_path_points=True)
    if bounds is None:
        raise ValueError(f"Line {line_number}: cannot calculate center for {subject!r}")
    min_x, min_y, max_x, max_y = bounds
    return min_x + ((max_x - min_x) / 2), min_y + ((max_y - min_y) / 2)


def directive_base_css() -> str:
    return """
.am-directive-overlays {
  pointer-events: none;
}
.am-directive-mark {
  transform-box: view-box;
  transform-origin: 0 0;
}
@media (prefers-reduced-motion: reduce) {
  [class*="am-directive-move-"],
  [class*="am-directive-color-"],
  [class*="am-directive-pulse-"],
  [class*="am-directive-hide-"] {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
  }
}
""".strip()


def apply_directive_plan(root: ET.Element, plan: DirectivePlan) -> None:
    if not plan.css_rules:
        return
    style = ET.Element(qname("style"), {"id": "animated-mermaid-directives-style", "type": "text/css"})
    style.text = "\n" + "\n\n".join(plan.css_rules) + "\n"
    root.append(style)
    root.set("data-animation-directives", "true")
    root.set("data-directive-total-ms", f"{plan.total_ms:.0f}")
