#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET
from typing import Iterable

from mermaid_animation.common import (
    Candidate,
    ancestors,
    class_tokens,
    collapsed_text,
    edge_endpoints,
    local_name,
    nearest_candidate,
    normalized,
    plan_staged_items_with_following_connections,
    translate_position,
)


def is_architecture_root(root: ET.Element) -> bool:
    return normalized(root.get("aria-roledescription", "")) == "architecture"


def element_has_class(element: ET.Element, token: str) -> bool:
    return token.lower() in {value.lower() for value in class_tokens(element)}


def has_ancestor_class(
    element: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    token: str,
) -> bool:
    return any(element_has_class(parent, token) for parent in ancestors(element, parent_map))


def add_classes(classes: Iterable[str], extra_classes: Iterable[str]) -> list[str]:
    result = list(classes)
    for extra_class in extra_classes:
        if extra_class not in result:
            result.append(extra_class)
    return result


def architecture_service_key(candidate: Candidate) -> str:
    prefix = "my-svg-service-"
    if candidate.element_id.startswith(prefix):
        return candidate.element_id.removeprefix(prefix)
    return candidate.element_id


def architecture_edge_id(element: ET.Element) -> str:
    if local_name(element.tag) == "path" and element_has_class(element, "edge"):
        return element.get("id", "")
    for child in element.iter():
        if local_name(child.tag) == "path" and element_has_class(child, "edge"):
            return child.get("id", "")
    return element.get("id", "")


def architecture_edge_path(element: ET.Element) -> ET.Element | None:
    if local_name(element.tag) == "path" and element_has_class(element, "edge"):
        return element
    for child in element.iter():
        if local_name(child.tag) == "path" and element_has_class(child, "edge"):
            return child
    return None


def architecture_edge_endpoints(edge: Candidate) -> tuple[tuple[float, float], tuple[float, float]] | None:
    path = architecture_edge_path(edge.element)
    if path is None:
        return edge_endpoints(edge)

    probe = Candidate(
        element=path,
        role=edge.role,
        dom_index=edge.dom_index,
        element_id=path.get("id", ""),
        classes=class_tokens(path),
        text=collapsed_text(path),
    )
    return edge_endpoints(probe)


def discover_architecture_candidates(
    root: ET.Element,
    parent_map: dict[ET.Element, ET.Element],
    dom_order: dict[ET.Element, int],
) -> list[Candidate]:
    candidates: list[Candidate] = []

    for element in root.iter():
        tag = local_name(element.tag)
        if tag == "g" and element_has_class(element, "architecture-service"):
            candidates.append(
                Candidate(
                    element=element,
                    role="node",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), ["architecture-service"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if (
            tag == "rect"
            and has_ancestor_class(element, parent_map, "architecture-groups")
            and (element_has_class(element, "node-bkg") or "-group-" in element.get("id", ""))
        ):
            candidates.append(
                Candidate(
                    element=element,
                    role="cluster",
                    dom_index=dom_order[element],
                    element_id=element.get("id", ""),
                    classes=add_classes(class_tokens(element), ["architecture-group"]),
                    text=collapsed_text(element),
                )
            )
            continue

        if tag == "g" and has_ancestor_class(element, parent_map, "architecture-edges"):
            edge_id = architecture_edge_id(element)
            if not edge_id:
                continue
            candidates.append(
                Candidate(
                    element=element,
                    role="edge",
                    dom_index=dom_order[element],
                    element_id=edge_id,
                    classes=add_classes(class_tokens(element), ["architecture-edge"]),
                    text=collapsed_text(element),
                )
            )

    return candidates


def edge_services_from_id(
    edge: Candidate, service_by_key: dict[str, Candidate]
) -> tuple[Candidate, Candidate] | None:
    raw_id = edge.element_id
    matches: list[tuple[int, Candidate]] = []
    for key, service in service_by_key.items():
        pattern = re.compile(rf"(?:(?<=L_)|(?<=_)){re.escape(key)}(?=_|$)")
        matches.extend((match.start(), service) for match in pattern.finditer(raw_id))

    if len(matches) < 2:
        return None

    ordered = sorted(matches, key=lambda item: item[0])
    return ordered[0][1], ordered[1][1]


def service_position(candidate: Candidate) -> tuple[float, float] | None:
    position = translate_position(candidate.element)
    if position is None:
        return None
    return position[0] + 40.0, position[1] + 40.0


def edge_services_from_geometry(
    edge: Candidate,
    services: list[Candidate],
    positions: dict[int, tuple[float, float]],
) -> tuple[Candidate, Candidate] | None:
    endpoints = architecture_edge_endpoints(edge)
    if endpoints is None:
        return None

    source = nearest_candidate(endpoints[0], services, positions)
    target = nearest_candidate(endpoints[1], services, positions)
    if source is None or target is None:
        return None
    return source, target


def plan_architecture_candidates(
    candidates: list[Candidate], args: argparse.Namespace, effective_animation: str
) -> list[Candidate]:
    service_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "node" and "architecture-service" in {token.lower() for token in candidate.classes}
    ]
    edge_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "edge" and "architecture-edge" in {token.lower() for token in candidate.classes}
    ]
    cluster_candidates = [
        candidate
        for candidate in candidates
        if candidate.role == "cluster" and "architecture-group" in {token.lower() for token in candidate.classes}
    ]

    positions = {
        id(candidate): position
        for candidate in service_candidates
        if (position := service_position(candidate)) is not None
    }
    positioned_services = [candidate for candidate in service_candidates if id(candidate) in positions]
    if not positioned_services or not edge_candidates:
        return []

    def service_sort_key(candidate: Candidate) -> tuple[int, int, int]:
        return (
            0 if candidate.explicit_order is not None else 1,
            candidate.explicit_order if candidate.explicit_order is not None else 0,
            candidate.dom_index,
        )

    ordered_services = sorted(positioned_services, key=service_sort_key)
    service_stage = {id(candidate): index for index, candidate in enumerate(ordered_services)}
    service_by_key = {architecture_service_key(candidate): candidate for candidate in ordered_services}

    edge_services: dict[int, tuple[Candidate, Candidate]] = {}
    for edge in edge_candidates:
        endpoints = edge_services_from_id(edge, service_by_key)
        if endpoints is None:
            endpoints = edge_services_from_geometry(edge, positioned_services, positions)
        if endpoints is None:
            continue
        edge_services[id(edge)] = endpoints

    if not edge_services:
        return []

    stage_items: dict[int, list[Candidate]] = {0: sorted(cluster_candidates, key=lambda item: item.dom_index)}
    for index, service in enumerate(ordered_services):
        stage_items.setdefault(index, []).append(service)

    for edge in sorted(edge_candidates, key=lambda item: item.dom_index):
        source, target = edge_services.get(id(edge), (None, None))
        if source is None or target is None:
            continue

        source_stage = service_stage.get(id(source), len(ordered_services))
        target_stage = service_stage.get(id(target), len(ordered_services))
        stage = max(source_stage, target_stage)
        edge.source_index = source_stage
        edge.target_index = target_stage
        stage_items.setdefault(stage, []).append(edge)

    fallback_stage = len(ordered_services)
    planned_candidate_ids = {id(candidate) for stage in stage_items.values() for candidate in stage}
    for candidate in candidates:
        if id(candidate) in planned_candidate_ids:
            continue
        stage_items.setdefault(fallback_stage, []).append(candidate)
        fallback_stage += 1

    return plan_staged_items_with_following_connections(stage_items, args, effective_animation)
