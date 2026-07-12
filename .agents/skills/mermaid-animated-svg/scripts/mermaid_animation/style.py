#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from typing import Iterable

from mermaid_animation.common import (
    Candidate,
    TRANSFORM_EFFECTS,
    build_parent_map,
    class_tokens,
    local_name,
    qname,
)


def append_classes(element: ET.Element, names: Iterable[str]) -> None:
    tokens = class_tokens(element)
    for name in names:
        if name not in tokens:
            tokens.append(name)
    element.set("class", " ".join(tokens))


def append_style_props(element: ET.Element, props: dict[str, str]) -> None:
    custom = " ".join(f"{name}: {value};" for name, value in props.items())
    existing = element.get("style", "").strip()
    element.set("style", f"{custom} {existing}".strip())


def wrap_element(element: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> ET.Element:
    parent = parent_map.get(element)
    if parent is None:
        return element

    wrapper = ET.Element(qname("g"))
    append_classes(wrapper, ["am-wrapper"])
    children = list(parent)
    index = children.index(element)
    parent.remove(element)
    wrapper.append(element)
    parent.insert(index, wrapper)
    return wrapper


def animation_css() -> str:
    return """
.am-step {
  animation-delay: var(--am-delay, 0ms);
  animation-duration: var(--am-duration, 650ms);
  animation-fill-mode: backwards;
  animation-timing-function: var(--am-easing, cubic-bezier(.2, .8, .2, 1));
  transform-box: fill-box;
  transform-origin: center;
}
.am-effect-fade { animation-name: am-fade; }
.am-effect-pop { animation-name: am-pop; }
.am-effect-slide-up { animation-name: am-slide-up; }
.am-effect-slide-left { animation-name: am-slide-left; }
.am-effect-zoom { animation-name: am-zoom; }
.am-effect-draw { animation-name: am-draw; }
.am-effect-radial-arrow,
.am-effect-grow-arrow {
  animation-name: am-grow-arrow;
  animation-timing-function: cubic-bezier(.16, .84, .28, 1);
  stroke-linecap: round;
  stroke-linejoin: round;
}
.am-effect-radial-arrow { animation-name: am-radial-arrow; }
@keyframes am-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes am-pop {
  0% { opacity: 0; transform: scale(.92); }
  70% { opacity: 1; transform: scale(1.025); }
  100% { opacity: 1; transform: none; }
}
@keyframes am-slide-up {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes am-slide-left {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: none; }
}
@keyframes am-zoom {
  from { opacity: 0; transform: scale(.86); }
  to { opacity: 1; transform: none; }
}
@keyframes am-draw {
  from {
    opacity: 0;
    stroke-dasharray: var(--am-draw-distance, 10000);
    stroke-dashoffset: var(--am-draw-distance, 10000);
  }
  12% { opacity: 1; }
  to {
    opacity: 1;
    stroke-dasharray: var(--am-draw-distance, 10000);
    stroke-dashoffset: 0;
  }
}
@keyframes am-grow-arrow {
  0% {
    opacity: 0;
    marker-start: none;
    marker-mid: none;
    marker-end: none;
    stroke-dasharray: var(--am-draw-distance, 10000);
    stroke-dashoffset: var(--am-draw-distance, 10000);
  }
  8% {
    opacity: 1;
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
  }
  34% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dasharray: var(--am-draw-distance, 10000);
    stroke-dashoffset: var(--am-grow-distance-a, 6600);
  }
  62% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dashoffset: var(--am-grow-distance-b, 2400);
  }
  84% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dashoffset: var(--am-grow-distance-c, 360);
  }
  100% {
    opacity: 1;
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dasharray: var(--am-draw-distance, 10000);
    stroke-dashoffset: 0;
  }
}
@keyframes am-radial-arrow {
  0% {
    opacity: 0;
    marker-start: none;
    marker-mid: none;
    marker-end: none;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
  }
  10% {
    opacity: 1;
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
  }
  38% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dasharray: 1;
    stroke-dashoffset: .66;
  }
  66% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dashoffset: .24;
  }
  86% {
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dashoffset: .05;
  }
  100% {
    opacity: 1;
    marker-start: var(--am-marker-start, none);
    marker-mid: var(--am-marker-mid, none);
    marker-end: var(--am-marker-end, none);
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .am-step {
    animation: none !important;
    opacity: initial !important;
    transform: none !important;
    stroke-dasharray: initial !important;
    stroke-dashoffset: initial !important;
  }
}
""".strip()


def insert_animation_style(root: ET.Element) -> None:
    style = ET.Element(qname("style"), {"id": "animated-mermaid-style", "type": "text/css"})
    style.text = f"\n{animation_css()}\n"

    insert_at = 0
    for index, child in enumerate(list(root)):
        if local_name(child.tag) in {"title", "desc", "metadata", "defs", "style"}:
            insert_at = index + 1
    root.insert(insert_at, style)


def apply_animation(root: ET.Element, candidates: list[Candidate], args: argparse.Namespace) -> None:
    if args.animation == "none":
        return

    parent_map = build_parent_map(root)
    insert_animation_style(root)

    for candidate in candidates:
        if candidate.effect == "none":
            continue

        target = candidate.element
        is_sankey_link = "sankey-link" in {class_name.lower() for class_name in candidate.classes}
        if candidate.effect in TRANSFORM_EFFECTS:
            target = wrap_element(candidate.element, parent_map)

        animation_classes = [
            "am-step",
            f"am-role-{candidate.role}",
            f"am-effect-{candidate.effect}",
        ]
        if is_sankey_link:
            animation_classes.append("am-sankey-link")
        append_classes(target, animation_classes)
        style_props = {
            "--am-delay": f"{candidate.delay_ms:.3f}ms",
            "--am-duration": f"{candidate.duration_ms:.3f}ms",
            "--am-easing": candidate.easing or args.easing,
            "--am-draw-distance": str(args.draw_distance),
        }
        if candidate.effect == "radial-arrow":
            target.set("pathLength", "1")
        if candidate.effect == "grow-arrow":
            if is_sankey_link:
                target.set("pathLength", str(args.draw_distance))
                style_props["stroke-linecap"] = "butt"
            style_props.update(
                {
                    "--am-grow-distance-a": f"{args.draw_distance * 0.66:.3f}",
                    "--am-grow-distance-b": f"{args.draw_distance * 0.24:.3f}",
                    "--am-grow-distance-c": f"{args.draw_distance * 0.036:.3f}",
                }
            )
        if candidate.effect in {"grow-arrow", "radial-arrow"}:
            for marker_attr in ("marker-start", "marker-mid", "marker-end"):
                marker_value = target.get(marker_attr)
                if marker_value:
                    style_props[f"--am-{marker_attr}"] = marker_value
        append_style_props(target, style_props)
        if candidate.level is not None:
            target.set("data-am-level", str(candidate.level))
        if candidate.stage is not None:
            target.set("data-am-stage", str(candidate.stage))
        if candidate.wave_index is not None:
            target.set("data-am-wave", str(candidate.wave_index))
        if candidate.branch_index is not None:
            target.set("data-am-branch", str(candidate.branch_index))
        if candidate.branch_step is not None:
            target.set("data-am-branch-step", str(candidate.branch_step))

    root.set("data-animated-mermaid", "true")
    root.set("data-animation", getattr(args, "effective_animation", args.animation))
    root.set("data-element-count", str(len(candidates)))
