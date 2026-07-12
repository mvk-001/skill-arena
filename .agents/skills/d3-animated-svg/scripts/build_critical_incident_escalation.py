#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Incident Escalation animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1180
HEIGHT = 700
LEFT = 176
RIGHT = 890
MAX_MINUTE = 52
SLA_MINUTE = 30
CURRENT_MINUTE = 27

PALETTE = {
    "red": "#9e1b32",
    "red_hover": "#6d1222",
    "red_highlight": "#ffccd5",
    "orange": "#e77204",
    "orange_hover": "#994a00",
    "orange_highlight": "#ffe5cc",
    "green": "#45842a",
    "green_hover": "#2f5c1d",
    "green_highlight": "#dbffcc",
    "blue": "#007298",
    "blue_hover": "#00516c",
    "blue_highlight": "#cdf3ff",
    "purple": "#652f6c",
    "purple_hover": "#46214b",
    "purple_highlight": "#f9ccff",
    "ink": "#333e48",
    "surface": "#ffffff",
    "page": "#f7f7f7",
    "gray50": "#f3f3f3",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray700": "#4f4f4f",
}

LANES = [
    {"id": "signal", "label": "Signal", "y": 214},
    {"id": "command", "label": "Command", "y": 324},
    {"id": "mitigation", "label": "Mitigation", "y": 434},
]

PHASES = [
    {"id": "detect", "label": "Detect + assess", "start": 0, "end": 7, "status": "sev1", "color": "red"},
    {"id": "coordinate", "label": "Coordinate roles", "start": 7, "end": 18, "status": "command", "color": "purple"},
    {"id": "contain", "label": "Contain impact", "start": 18, "end": 32, "status": "warning", "color": "orange"},
    {"id": "recover", "label": "Recover + learn", "start": 32, "end": 52, "status": "stable", "color": "green"},
]

EVENTS = [
    {
        "id": "alert",
        "label": ["Anomaly", "alert"],
        "minute": 0,
        "lane": "signal",
        "severity": "sev1",
        "owner": "monitoring",
        "color": "blue",
        "label_dx": 0,
        "label_dy": -46,
        "anchor": "middle",
    },
    {
        "id": "impact",
        "label": ["Impact", "confirmed"],
        "minute": 4,
        "lane": "signal",
        "severity": "sev1",
        "owner": "on-call",
        "color": "red",
        "label_dx": -4,
        "label_dy": 42,
        "anchor": "middle",
    },
    {
        "id": "ic",
        "label": ["IC", "assigned"],
        "minute": 7,
        "lane": "command",
        "severity": "sev1",
        "owner": "incident-commander",
        "color": "purple",
        "label_dx": -30,
        "label_dy": -4,
        "anchor": "end",
    },
    {
        "id": "bridge",
        "label": ["Bridge", "open"],
        "minute": 11,
        "lane": "command",
        "severity": "sev1",
        "owner": "incident-commander",
        "color": "purple",
        "label_dx": 8,
        "label_dy": 42,
        "anchor": "start",
    },
    {
        "id": "comms",
        "label": ["Stakeholder", "update"],
        "minute": 16,
        "lane": "command",
        "severity": "warning",
        "owner": "comms-lead",
        "color": "purple",
        "label_dx": 0,
        "label_dy": -48,
        "anchor": "middle",
    },
    {
        "id": "failover",
        "label": ["Failover", "started"],
        "minute": 23,
        "lane": "mitigation",
        "severity": "warning",
        "owner": "ops-lead",
        "color": "orange",
        "label_dx": -10,
        "label_dy": -47,
        "anchor": "end",
    },
    {
        "id": "contained",
        "label": ["Impact", "contained"],
        "minute": 29,
        "lane": "mitigation",
        "severity": "warning",
        "owner": "ops-lead",
        "color": "orange",
        "label_dx": 0,
        "label_dy": -52,
        "anchor": "middle",
    },
    {
        "id": "recovered",
        "label": ["Service", "healthy"],
        "minute": 39,
        "lane": "mitigation",
        "severity": "stable",
        "owner": "sre",
        "color": "green",
        "label_dx": 0,
        "label_dy": -48,
        "anchor": "middle",
    },
    {
        "id": "postmortem",
        "label": ["Postmortem", "queued"],
        "minute": 49,
        "lane": "mitigation",
        "severity": "stable",
        "owner": "incident-commander",
        "color": "green",
        "label_dx": 0,
        "label_dy": -52,
        "anchor": "middle",
    },
]

ESCALATIONS = [
    {"id": "alert-impact", "source": "alert", "target": "impact", "kind": "detect", "critical": True, "color": "red"},
    {"id": "impact-ic", "source": "impact", "target": "ic", "kind": "page", "critical": True, "color": "red"},
    {"id": "ic-bridge", "source": "ic", "target": "bridge", "kind": "command", "critical": True, "color": "purple"},
    {"id": "bridge-comms", "source": "bridge", "target": "comms", "kind": "coordinate", "critical": True, "color": "purple"},
    {"id": "comms-failover", "source": "comms", "target": "failover", "kind": "handoff", "critical": True, "color": "orange"},
    {"id": "failover-contained", "source": "failover", "target": "contained", "kind": "mitigate", "critical": True, "color": "orange"},
    {"id": "contained-recovered", "source": "contained", "target": "recovered", "kind": "verify", "critical": True, "color": "green"},
    {"id": "recovered-postmortem", "source": "recovered", "target": "postmortem", "kind": "learn", "critical": False, "color": "green"},
]

TEAMS = [
    {"id": "incident-commander", "label": "Incident commander", "status": "owns state + decisions", "color": "purple"},
    {"id": "ops-lead", "label": "Ops lead", "status": "only team changing prod", "color": "orange"},
    {"id": "comms-lead", "label": "Comms lead", "status": "updates stakeholders", "color": "blue"},
    {"id": "scribe", "label": "Scribe", "status": "keeps timeline current", "color": "green"},
]

MITIGATIONS = [
    {"id": "freeze", "label": "Freeze deploys", "minute": 18, "status": "contain", "color": "orange"},
    {"id": "failover", "label": "Route failover", "minute": 23, "status": "mitigate", "color": "orange"},
    {"id": "verify", "label": "Verify SLOs", "minute": 39, "status": "validate", "color": "green"},
    {"id": "review", "label": "Postmortem", "minute": 49, "status": "learn", "color": "green"},
]

COMMUNICATION_BEATS = [
    {"id": "first-update", "minute": 16, "label": "First update", "color": "purple"},
    {"id": "sla-update", "minute": 31, "label": "SLA update", "color": "orange"},
    {"id": "recovery-update", "minute": 46, "label": "Recovery update", "color": "green"},
]

STATUS_CARDS = [
    {"id": "severity", "label": "Severity", "value": "SEV-1 contained", "color": "red"},
    {"id": "commander", "label": "Owner", "value": "IC: Rivera", "color": "purple"},
    {"id": "impact", "label": "Customer impact", "value": "partial -> low", "color": "orange"},
    {"id": "next", "label": "Next update", "value": "+15m cadence", "color": "blue"},
]


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def x_scale(minute: float) -> float:
    return LEFT + (RIGHT - LEFT) * minute / MAX_MINUTE


def lane_y(lane_id: str) -> float:
    for lane in LANES:
        if lane["id"] == lane_id:
            return float(lane["y"])
    raise KeyError(lane_id)


def event_by_id(event_id: str) -> dict[str, object]:
    for event in EVENTS:
        if event["id"] == event_id:
            return event
    raise KeyError(event_id)


def event_point(event: dict[str, object]) -> tuple[float, float]:
    return x_scale(float(event["minute"])), lane_y(str(event["lane"]))


def text_lines(
    lines: list[str],
    *,
    x: float,
    y: float,
    class_name: str,
    anchor: str = "middle",
    line_height: float = 12,
) -> str:
    tspans: list[str] = []
    for index, line in enumerate(lines):
        dy = 0 if index == 0 else line_height
        tspans.append(f'<tspan x="{fmt(x)}" dy="{fmt(dy)}">{esc(line)}</tspan>')
    return f'<text class="{class_name}" x="{fmt(x)}" y="{fmt(y)}" text-anchor="{anchor}">{"".join(tspans)}</text>'


def escalation_path(link: dict[str, object]) -> str:
    source = event_by_id(str(link["source"]))
    target = event_by_id(str(link["target"]))
    x0, y0 = event_point(source)
    x1, y1 = event_point(target)
    dx = max(42, abs(x1 - x0) * 0.42)
    bend = 18 if y0 == y1 else 0
    return (
        f"M{fmt(x0)} {fmt(y0)} "
        f"C{fmt(x0 + dx)} {fmt(y0 - bend)} {fmt(x1 - dx)} {fmt(y1 + bend)} {fmt(x1)} {fmt(y1)}"
    )


def phase_markup() -> str:
    parts: list[str] = []
    for index, phase in enumerate(PHASES):
        x0 = x_scale(float(phase["start"]))
        x1 = x_scale(float(phase["end"]))
        color = PALETTE[str(phase["color"])]
        fill = PALETTE[f"{phase['color']}_highlight"]
        delay = 0.14 + index * 0.09
        parts.append(
            f"""
      <g class="severity-band" data-phase-id="{esc(phase['id'])}" data-status="{esc(phase['status'])}"
        transform="translate({fmt(x0)} 126)">
        <rect x="0" y="0" width="{fmt(x1 - x0)}" height="23" rx="6" fill="{fill}" stroke="{color}" stroke-width="1.4" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".24s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <text class="phase-label" x="{fmt((x1 - x0) / 2)}" y="15" text-anchor="middle">{esc(phase['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def axis_markup() -> str:
    ticks: list[str] = []
    for minute in range(0, 53, 10):
        x = x_scale(minute)
        ticks.append(
            f"""
      <g class="incident-tick" data-minute="{minute}" opacity="0">
        <animate attributeName="opacity" values="0;1" dur=".18s" begin="{fmt(0.22 + minute * 0.008)}s" fill="freeze"/>
        <line x1="{fmt(x)}" x2="{fmt(x)}" y1="158" y2="464" stroke="{PALETTE['gray200']}" stroke-width="1" stroke-dasharray="2 6"/>
        <text class="axis-label" x="{fmt(x)}" y="486" text-anchor="middle">{minute}m</text>
      </g>"""
        )
    deadline_x = x_scale(SLA_MINUTE)
    current_x = x_scale(CURRENT_MINUTE)
    return (
        "\n".join(ticks)
        + f"""
      <g class="sla-countdown" data-sla-minutes="{SLA_MINUTE}" data-current-minute="{CURRENT_MINUTE}">
        <line x1="{LEFT}" x2="{fmt(deadline_x)}" y1="105" y2="105" stroke="{PALETTE['gray300']}" stroke-width="8" stroke-linecap="round"/>
        <line x1="{LEFT}" x2="{fmt(current_x)}" y1="105" y2="105" stroke="{PALETTE['orange']}" stroke-width="8" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
          <animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin=".28s" fill="freeze"/>
        </line>
        <line class="incident-clock" data-minute="{SLA_MINUTE}" x1="{fmt(deadline_x)}" x2="{fmt(deadline_x)}" y1="92" y2="474" stroke="{PALETTE['red']}" stroke-width="2" stroke-dasharray="6 6"/>
        <text class="sla-label" x="{fmt(deadline_x)}" y="120" text-anchor="middle">30m SLA</text>
        <text class="sla-note" x="{fmt(current_x)}" y="96" text-anchor="end">3m guardrail</text>
      </g>"""
    )


def lane_markup() -> str:
    parts: list[str] = []
    for lane in LANES:
        y = float(lane["y"])
        parts.append(
            f"""
      <g class="incident-lane" data-lane-id="{esc(lane['id'])}">
        <rect x="{LEFT - 12}" y="{fmt(y - 38)}" width="{fmt(RIGHT - LEFT + 24)}" height="76" rx="6"
          fill="{PALETTE['gray50']}" opacity=".86"/>
        <line x1="{LEFT}" x2="{RIGHT}" y1="{fmt(y)}" y2="{fmt(y)}" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
        <text class="lane-label" x="{LEFT - 28}" y="{fmt(y + 4)}" text-anchor="end">{esc(lane['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def link_markup(link: dict[str, object], index: int) -> str:
    is_critical = bool(link["critical"])
    color = PALETTE[str(link["color"])]
    width = 3.4 if is_critical else 2.1
    opacity = 0.9 if is_critical else 0.58
    delay = 0.82 + index * 0.105
    key = delay / (delay + 0.62)
    class_name = "escalation-link"
    if is_critical:
        class_name += " critical-escalation"
    return f"""
      <path id="escalation-link-{esc(link['id'])}" class="{class_name}"
        data-escalation-id="{esc(link['id'])}" data-source-id="{esc(link['source'])}" data-target-id="{esc(link['target'])}"
        data-kind="{esc(link['kind'])}" data-critical="{str(is_critical).lower()}"
        d="{escalation_path(link)}" fill="none" stroke="{color}" stroke-width="{fmt(width)}"
        stroke-opacity="{fmt(opacity)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;1;0"
          keyTimes="0;{key:.3f};1" dur="{fmt(delay + 0.62)}s" begin="0s" fill="freeze"/>
      </path>"""


def pulse_markup(link: dict[str, object], index: int) -> str:
    begin = 1.38 + index * 0.16
    color = PALETTE[str(link["color"])]
    key = begin / (begin + 0.14)
    return f"""
      <circle class="escalation-pulse" data-escalation-id="{esc(link['id'])}" r="{5.8 if link['critical'] else 4.6}"
        fill="{color}" stroke="#ffffff" stroke-width="1.5" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{key:.3f};1"
          dur="{fmt(begin + 0.14)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="{2.1 if link['critical'] else 2.7}s" begin="{fmt(begin)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#escalation-link-{esc(link['id'])}"/>
        </animateMotion>
      </circle>"""


def event_markup(event: dict[str, object], index: int) -> str:
    x, y = event_point(event)
    color = PALETTE[str(event["color"])]
    fill = PALETTE[f"{event['color']}_highlight"]
    is_stable = event["severity"] == "stable"
    delay = 0.56 + index * 0.115
    label = text_lines(
        list(event["label"]),
        x=float(event["label_dx"]),
        y=float(event["label_dy"]),
        class_name="event-label",
        anchor=str(event["anchor"]),
    )
    return f"""
      <g class="critical-incident-event" data-event-id="{esc(event['id'])}" data-minute="{event['minute']}"
        data-lane-id="{esc(event['lane'])}" data-severity="{esc(event['severity'])}" data-owner="{esc(event['owner'])}"
        transform="translate({fmt(x)} {fmt(y)})">
        <circle r="18" fill="{fill}" stroke="{color}" stroke-width="2.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".22s" begin="{fmt(delay)}s" fill="freeze"/>
          <animate attributeName="r" values="6;20;18" dur=".5s" begin="{fmt(delay)}s" fill="freeze"
            calcMode="spline" keySplines=".2 .8 .2 1;.28 0 .22 1"/>
        </circle>
        <circle r="6.3" fill="{PALETTE['green'] if is_stable else color}" stroke="#ffffff" stroke-width="1.5"/>
        {label}
      </g>"""


def status_panel_markup() -> str:
    x = 928
    y = 126
    parts = [
        f"""
      <g class="incident-command-panel" transform="translate({x} {y})">
        <rect x="0" y="0" width="210" height="338" rx="8" fill="{PALETTE['surface']}" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
        <text class="panel-title" x="18" y="29">Command post</text>
        <text class="panel-subtitle" x="18" y="48">live incident state</text>"""
    ]
    for index, card in enumerate(STATUS_CARDS):
        cy = 68 + index * 58
        color = PALETTE[str(card["color"])]
        fill = PALETTE[f"{card['color']}_highlight"]
        parts.append(
            f"""
        <g class="incident-status-card" data-status-id="{esc(card['id'])}" transform="translate(16 {cy})">
          <rect x="0" y="0" width="178" height="44" rx="6" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
          <circle cx="18" cy="22" r="6.5" fill="{color}"/>
          <text class="status-label" x="34" y="18">{esc(card['label'])}</text>
          <text class="status-value" x="34" y="34">{esc(card['value'])}</text>
        </g>"""
        )
    parts.append(
        f"""
        <g class="incident-pressure-gauge" data-current-minute="{CURRENT_MINUTE}" data-sla-minutes="{SLA_MINUTE}" transform="translate(16 308)">
          <rect x="0" y="0" width="178" height="10" rx="5" fill="{PALETTE['gray100']}"/>
          <rect x="0" y="0" width="{fmt(178 * CURRENT_MINUTE / SLA_MINUTE)}" height="10" rx="5" fill="{PALETTE['orange']}"/>
          <line x1="178" x2="178" y1="-4" y2="16" stroke="{PALETTE['red']}" stroke-width="2"/>
        </g>
      </g>"""
    )
    return "\n".join(parts)


def communication_markup() -> str:
    parts: list[str] = []
    for index, beat in enumerate(COMMUNICATION_BEATS):
        x = x_scale(float(beat["minute"]))
        color = PALETTE[str(beat["color"])]
        fill = PALETTE[f"{beat['color']}_highlight"]
        delay = 1.52 + index * 0.16
        parts.append(
            f"""
      <g class="communication-beat" data-beat-id="{esc(beat['id'])}" data-minute="{beat['minute']}" transform="translate({fmt(x)} 510)">
        <line x1="0" x2="0" y1="-24" y2="-7" stroke="{color}" stroke-width="1.5"/>
        <rect x="-54" y="-7" width="108" height="28" rx="6" fill="{fill}" stroke="{color}" stroke-width="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".22s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <text class="beat-label" x="0" y="11" text-anchor="middle">{esc(beat['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def mitigation_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(MITIGATIONS):
        x = x_scale(float(step["minute"]))
        row_y = 546 if index % 2 == 0 else 584
        color = PALETTE[str(step["color"])]
        fill = PALETTE[f"{step['color']}_highlight"]
        delay = 1.72 + index * 0.15
        parts.append(
            f"""
      <g class="mitigation-step" data-step-id="{esc(step['id'])}" data-minute="{step['minute']}" data-status="{esc(step['status'])}"
        transform="translate({fmt(x)} {row_y})">
        <line x1="0" x2="0" y1="-24" y2="-8" stroke="{color}" stroke-width="1.5"/>
        <rect x="-52" y="-8" width="104" height="30" rx="6" fill="{fill}" stroke="{color}" stroke-width="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur=".22s" begin="{fmt(delay)}s" fill="freeze"/>
        </rect>
        <text class="mitigation-label" x="0" y="12" text-anchor="middle">{esc(step['label'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def team_markup() -> str:
    parts: list[str] = []
    y = 626
    for index, team in enumerate(TEAMS):
        x = 54 + index * 278
        color = PALETTE[str(team["color"])]
        fill = PALETTE[f"{team['color']}_highlight"]
        parts.append(
            f"""
      <g class="response-team" data-team-id="{esc(team['id'])}" transform="translate({fmt(x)} {fmt(y)})">
        <rect x="0" y="0" width="238" height="48" rx="7" fill="{fill}" stroke="{color}" stroke-width="1.3"/>
        <circle cx="18" cy="24" r="7" fill="{color}"/>
        <text class="team-label" x="34" y="20">{esc(team['label'])}</text>
        <text class="team-status" x="34" y="36">{esc(team['status'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def build_html() -> str:
    critical_links = [link for link in ESCALATIONS if link["critical"]]
    links = "\n".join(link_markup(link, index) for index, link in enumerate(ESCALATIONS))
    pulses = "\n".join(pulse_markup(link, index) for index, link in enumerate(critical_links))
    events = "\n".join(event_markup(event, index) for index, event in enumerate(EVENTS))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Incident Escalation</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: {PALETTE["page"]};
      color: {PALETTE["ink"]};
      font-family: "Open Sans", Arial, sans-serif;
    }}
    svg {{
      width: min(100vw - 32px, 1180px);
      height: auto;
      display: block;
      background: {PALETTE["surface"]};
    }}
    text {{
      font-family: "Open Sans", Arial, sans-serif;
      letter-spacing: 0;
    }}
    .root-title {{
      fill: {PALETTE["ink"]};
      font-size: 24px;
      font-weight: 900;
    }}
    .root-subtitle, .panel-subtitle, .team-status, .status-label {{
      fill: {PALETTE["gray700"]};
      font-size: 10.5px;
      font-weight: 700;
    }}
    .axis-label, .lane-label, .phase-label, .sla-label, .sla-note,
    .event-label, .team-label, .mitigation-label, .beat-label,
    .panel-title, .status-value {{
      fill: {PALETTE["ink"]};
      font-size: 11px;
      font-weight: 850;
      paint-order: stroke;
      stroke: {PALETTE["surface"]};
      stroke-width: 4px;
      stroke-linejoin: round;
    }}
    .panel-title {{
      font-size: 15px;
      stroke-width: 3px;
    }}
    .phase-label, .mitigation-label, .beat-label {{
      font-size: 9.5px;
    }}
    .event-label {{
      font-size: 10.5px;
    }}
    .sla-note {{
      fill: {PALETTE["orange_hover"]};
    }}
    .escalation-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .28));
    }}
  </style>
</head>
<body>
  <svg id="incident-escalation" data-pattern-id="d3-incident-escalation"
    data-pattern-family="critical-incident" data-event-count="{len(EVENTS)}"
    data-escalation-count="{len(ESCALATIONS)}" data-critical-escalation-count="{len(critical_links)}"
    data-phase-count="{len(PHASES)}" data-team-count="{len(TEAMS)}"
    data-mitigation-count="{len(MITIGATIONS)}" data-communication-count="{len(COMMUNICATION_BEATS)}"
    data-status-card-count="{len(STATUS_CARDS)}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="incident-escalation-title incident-escalation-desc">
    <title id="incident-escalation-title">Critical incident escalation</title>
    <desc id="incident-escalation-desc">A deterministic major incident timeline shows detection, severity assessment, incident command, communications, mitigation, recovery, SLA pressure, response roles, and post-incident learning.</desc>
    <rect x="32" y="28" width="1116" height="650" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="56" y="62">Critical incident escalation</text>
    <text class="root-subtitle" x="56" y="84">SEV response timeline with command roles, stakeholder cadence, SLA pressure, mitigation, recovery, and learning.</text>
    <g class="severity-bands">
{phase_markup()}
    </g>
    <g class="incident-axis">
{axis_markup()}
    </g>
    <g class="incident-lanes">
{lane_markup()}
    </g>
    <g class="escalation-links">
{links}
    </g>
    <g class="incident-events">
{events}
    </g>
    <g class="escalation-pulses">
{pulses}
    </g>
    <g class="communication-beats">
{communication_markup()}
    </g>
    <g class="mitigation-steps">
{mitigation_markup()}
    </g>
{status_panel_markup()}
    <g class="response-teams">
{team_markup()}
    </g>
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Incident Escalation D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
