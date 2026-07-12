#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Circuit Breaker animated SVG HTML file."""

from __future__ import annotations

import argparse
import html
from pathlib import Path


WIDTH = 1080
HEIGHT = 640

PALETTE = {
    "red": "#9e1b32",
    "red_highlight": "#ffccd5",
    "orange": "#e77204",
    "orange_highlight": "#ffe5cc",
    "green": "#45842a",
    "green_highlight": "#dbffcc",
    "blue": "#007298",
    "blue_highlight": "#cdf3ff",
    "purple": "#652f6c",
    "purple_highlight": "#f9ccff",
    "ink": "#333e48",
    "surface": "#ffffff",
    "page": "#f7f7f7",
    "gray100": "#e7e7e7",
    "gray200": "#cfcfcf",
    "gray300": "#b5b5b5",
    "gray600": "#696969",
    "gray700": "#4f4f4f",
}

CLIENTS = [
    {"id": "web", "label": "Checkout web", "rate": "1.9k/s", "color": "blue", "y": 232, "kind": "user traffic"},
    {"id": "mobile", "label": "Mobile app", "rate": "1.4k/s", "color": "blue", "y": 302, "kind": "user traffic"},
    {"id": "retry", "label": "Retry loop", "rate": "900/s", "color": "orange", "y": 372, "kind": "amplifies"},
]

BREAKER_STATE = {
    "state": "open",
    "failure_threshold": 50,
    "current_failure_rate": 78,
    "open_window_seconds": 45,
    "timeout_ms": 650,
    "retry_budget": "18%",
    "probe_count": 2,
}

STATUS_CARDS = [
    ("breaker", "OPEN", "fail fast enabled", "red"),
    ("failures", "78%", "above 50% trip line", "orange"),
    ("retry budget", "18%", "storm is suppressed", "purple"),
    ("fallback", "active", "degraded response served", "green"),
]

STATE_NODES = [
    {"id": "closed-initial", "label": "Closed", "note": "normal calls", "state": "closed", "color": "blue"},
    {"id": "open", "label": "Open", "note": "fail fast", "state": "open", "color": "red"},
    {"id": "half-open", "label": "Half-open", "note": "2 probes", "state": "half-open", "color": "purple"},
    {"id": "closed-recovered", "label": "Closed", "note": "recovered", "state": "closed", "color": "green"},
]

METRICS = [
    {"second": -45, "failure": 12, "latency": 210},
    {"second": -40, "failure": 18, "latency": 240},
    {"second": -35, "failure": 27, "latency": 310},
    {"second": -30, "failure": 44, "latency": 470},
    {"second": -25, "failure": 61, "latency": 720},
    {"second": -20, "failure": 78, "latency": 940},
    {"second": -15, "failure": 74, "latency": 840},
    {"second": -10, "failure": 52, "latency": 620},
    {"second": -5, "failure": 31, "latency": 390},
    {"second": 0, "failure": 16, "latency": 260},
]

MITIGATIONS = [
    {"id": "timeout", "label": "Set timeout", "note": "650 ms cap", "color": "orange"},
    {"id": "trip", "label": "Trip threshold", "note": "50% failures", "color": "red"},
    {"id": "fail-fast", "label": "Fail fast", "note": "serve fallback", "color": "green"},
    {"id": "probe-close", "label": "Probe + close", "note": "2 good checks", "color": "purple"},
]

CLIENT_X = 80
CALLER_X = 308
CALLER_Y = 302
BREAKER_X = 526
BREAKER_Y = 302
DOWNSTREAM_X = 826
DOWNSTREAM_Y = 250
FALLBACK_X = 824
FALLBACK_Y = 400


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def client_path(client: dict[str, object]) -> str:
    x0 = CLIENT_X + 176
    y0 = float(client["y"])
    x1 = CALLER_X - 92
    y1 = CALLER_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 40)} {fmt(y0)} {fmt(x1 - 42)} {fmt(y1)} {x1} {fmt(y1)}"


def caller_to_breaker_path() -> str:
    return f"M{CALLER_X + 86} {CALLER_Y} C430 {CALLER_Y} 454 {CALLER_Y} {BREAKER_X - 92} {BREAKER_Y}"


def breaker_to_downstream_path() -> str:
    return f"M{BREAKER_X + 94} {BREAKER_Y - 30} C674 222 712 218 {DOWNSTREAM_X - 94} {DOWNSTREAM_Y - 4}"


def failure_feedback_path() -> str:
    return f"M{DOWNSTREAM_X - 94} {DOWNSTREAM_Y + 26} C706 320 666 344 {BREAKER_X + 94} {BREAKER_Y + 32}"


def fail_fast_path() -> str:
    return f"M{BREAKER_X + 56} {BREAKER_Y + 70} C652 428 714 424 {FALLBACK_X - 92} {FALLBACK_Y}"


def probe_path() -> str:
    return f"M{BREAKER_X + 96} {BREAKER_Y - 2} C682 286 712 272 {DOWNSTREAM_X - 94} {DOWNSTREAM_Y + 2}"


def metric_x(second: float) -> float:
    left = 104
    right = 594
    return left + ((second + 45.0) / 45.0) * (right - left)


def failure_y(value: float) -> float:
    top = 536
    bottom = 612
    return bottom - (value / 100.0) * (bottom - top)


def latency_y(value: float) -> float:
    top = 536
    bottom = 612
    return bottom - (min(value, 1000.0) / 1000.0) * (bottom - top)


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def status_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        y = 88
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="breaker-status-card" data-card-index="{index}" transform="translate({x} {y})">
        <rect x="0" y="0" width="222" height="56" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.2"/>
        <circle cx="18" cy="28" r="6.2" fill="{color}"/>
        <text class="status-eyebrow" x="34" y="17">{esc(eyebrow)}</text>
        <text class="status-value" x="34" y="34">{esc(value)}</text>
        <text class="status-note" x="34" y="48">{esc(note)}</text>
      </g>"""
        )
    return "\n".join(parts)


def topology_panel_markup() -> str:
    return f"""
    <g class="breaker-topology-panel" data-panel-id="breaker-topology">
      <rect x="58" y="160" width="970" height="318" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Circuit breaker around a failing downstream dependency</text>
      <text class="panel-subtitle" x="78" y="203">trip repeated failures, stop retry storms, serve fallback, then allow limited half-open probes</text>
      <line x1="266" x2="266" y1="216" y2="460" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="456" x2="456" y1="216" y2="460" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="694" x2="694" y1="216" y2="460" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
    </g>"""


def clients_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color_name = str(client["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="breaker-client" data-client-id="{esc(client['id'])}" data-rate="{esc(client['rate'])}" data-kind="{esc(client['kind'])}"
        transform="translate({CLIENT_X} {float(client['y']) - 24})">
        <rect x="0" y="0" width="176" height="48" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="18" cy="24" r="6.4" fill="{color}"/>
        <text class="source-label" x="34" y="20">{esc(client['label'])}</text>
        <text class="source-rate" x="34" y="36">{esc(client['rate'])} - {esc(client['kind'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def caller_markup() -> str:
    return f"""
    <g class="caller-service" data-service-id="checkout-api" transform="translate({CALLER_X - 86} {CALLER_Y - 44})">
      <rect x="0" y="0" width="172" height="88" rx="10" fill="{PALETTE['blue_highlight']}" stroke="{PALETTE['blue']}" stroke-width="1.3"/>
      <text class="node-label" x="18" y="25">Caller service</text>
      <text class="node-note" x="18" y="43">checkout-api</text>
      <text class="node-note" x="18" y="60">timeout {BREAKER_STATE['timeout_ms']} ms</text>
      <text class="node-note" x="18" y="77">retry budget {esc(BREAKER_STATE['retry_budget'])}</text>
    </g>
    <g class="retry-suppression-gate" data-gate-id="retry-budget-guard" data-retry-budget="{esc(BREAKER_STATE['retry_budget'])}" transform="translate({CALLER_X - 74} {CALLER_Y + 70})">
      <rect x="0" y="0" width="148" height="38" rx="8" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.15"/>
      <circle cx="18" cy="19" r="6.2" fill="{PALETTE['purple']}">
        <animate attributeName="r" values="5.4;8.2;6.2" dur="1.45s" begin="1.4s" repeatCount="indefinite"/>
      </circle>
      <text class="gate-label" x="34" y="16">Retry guard</text>
      <text class="gate-note" x="34" y="30">shed excess retries</text>
    </g>"""


def breaker_markup() -> str:
    return f"""
    <g class="circuit-breaker" data-breaker-id="payment-breaker" data-state="{esc(BREAKER_STATE['state'])}"
      data-failure-threshold="{BREAKER_STATE['failure_threshold']}" transform="translate({BREAKER_X - 102} {BREAKER_Y - 88})">
      <rect x="0" y="0" width="204" height="176" rx="12" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.45"/>
      <text class="node-label" x="18" y="25">Circuit breaker</text>
      <text class="node-note" x="18" y="43">state: OPEN</text>
      <g class="breaker-dial" transform="translate(102 89)">
        <circle cx="0" cy="0" r="42" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
        <path d="M-30 21 A36 36 0 0 1 30 -21" fill="none" stroke="{PALETTE['gray300']}" stroke-width="7" stroke-linecap="round"/>
        <path d="M-30 21 A36 36 0 0 1 16 -32" fill="none" stroke="{PALETTE['red']}" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
          <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin=".55s" fill="freeze"/>
        </path>
        <line class="open-circuit-barrier" data-barrier-id="open-switch" x1="-12" y1="-28" x2="28" y2="20" stroke="{PALETTE['red']}" stroke-width="6" stroke-linecap="round">
          <animate attributeName="stroke-width" values="4;8;6" dur="1.35s" begin="1.05s" repeatCount="indefinite"/>
        </line>
        <circle cx="-16" cy="-18" r="5" fill="{PALETTE['ink']}"/>
        <circle cx="30" cy="22" r="5" fill="{PALETTE['ink']}"/>
      </g>
      <text class="metric-label" x="18" y="148">failure rate {BREAKER_STATE['current_failure_rate']}%</text>
      <text class="metric-label" x="18" y="164">open window {BREAKER_STATE['open_window_seconds']}s</text>
    </g>"""


def dependency_markup() -> str:
    return f"""
    <g class="downstream-service" data-service-id="payments" data-state="degraded" transform="translate({DOWNSTREAM_X - 94} {DOWNSTREAM_Y - 44})">
      <rect x="0" y="0" width="188" height="88" rx="10" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.3"/>
      <circle cx="20" cy="44" r="7" fill="{PALETTE['red']}">
        <animate attributeName="r" values="6;9;7" dur="1.25s" begin="1s" repeatCount="indefinite"/>
      </circle>
      <text class="node-label" x="38" y="25">Payment service</text>
      <text class="node-note" x="38" y="43">timeouts + 5xx</text>
      <text class="node-note" x="38" y="60">p95 latency 940 ms</text>
      <text class="node-note" x="38" y="77">direct calls blocked</text>
    </g>
    <g class="fallback-service" data-service-id="fallback" data-state="active" transform="translate({FALLBACK_X - 94} {FALLBACK_Y - 42})">
      <rect x="0" y="0" width="188" height="84" rx="10" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.3"/>
      <circle cx="20" cy="42" r="7" fill="{PALETTE['green']}"/>
      <text class="node-label" x="38" y="24">Fallback service</text>
      <text class="node-note" x="38" y="42">degraded checkout</text>
      <text class="node-note" x="38" y="59">cached eligibility</text>
      <text class="node-note" x="38" y="75">users get response</text>
    </g>"""


def paths_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color_name = str(client["color"])
        parts.append(
            f"""
      <path id="flow-{esc(client['id'])}-to-caller" class="breaker-flow-path" data-flow-id="{esc(client['id'])}-to-caller"
        data-source="{esc(client['id'])}" data-target="caller" data-kind="caller-pressure"
        d="{client_path(client)}" fill="none" stroke="{PALETTE[color_name]}" stroke-width="2.25" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".75s" begin=".2s" fill="freeze"/>
      </path>"""
        )
    flow_defs = [
        ("caller-to-breaker", "caller", "breaker", "policy-check", caller_to_breaker_path(), "blue", "breaker-flow-path", 0.35, "2.7"),
        ("breaker-to-downstream", "breaker", "payments", "blocked-direct-call", breaker_to_downstream_path(), "red", "breaker-flow-path blocked-downstream-path", 0.55, "5 7"),
        ("downstream-failure-feedback", "payments", "breaker", "failure-feedback", failure_feedback_path(), "red", "breaker-flow-path failure-feedback-path", 0.72, "4 6"),
        ("fail-fast-to-fallback", "breaker", "fallback", "fail-fast", fail_fast_path(), "green", "breaker-flow-path fail-fast-path fallback-path", 0.95, "2.9"),
        ("half-open-probe", "breaker", "payments", "half-open-probe", probe_path(), "purple", "breaker-flow-path probe-path", 1.15, "6 6"),
    ]
    for flow_id, source, target, kind, path, color_name, classes, begin, dash in flow_defs:
        dash_attr = f' stroke-dasharray="{dash}"' if " " in dash else ""
        if " " not in dash:
            dash_attr = ' pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0"'
        parts.append(
            f"""
      <path id="flow-{flow_id}" class="{classes}" data-flow-id="{flow_id}" data-source="{source}" data-target="{target}" data-kind="{kind}"
        d="{path}" fill="none" stroke="{PALETTE[color_name]}" stroke-width="{3.1 if color_name in ('red', 'green') else 2.55}" stroke-linecap="round"{dash_attr}>
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{fmt(begin)}s" fill="freeze"/>
      </path>"""
        )
    return "\n".join(parts)


def pulses_markup() -> str:
    pulse_defs = [
        ("web", "flow-web-to-caller", "blue", 0.95, "caller"),
        ("mobile", "flow-mobile-to-caller", "blue", 1.1, "caller"),
        ("retry", "flow-retry-to-caller", "orange", 1.25, "retry"),
        ("policy", "flow-caller-to-breaker", "blue", 1.35, "policy"),
        ("feedback", "flow-downstream-failure-feedback", "red", 1.6, "failure"),
        ("fallback", "flow-fail-fast-to-fallback", "green", 1.82, "fallback"),
        ("probe", "flow-half-open-probe", "purple", 2.05, "probe"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        extra_class = " half-open-probe" if kind == "probe" else ""
        parts.append(
            f"""
      <circle class="breaker-request-pulse{extra_class}" data-pulse-id="{pulse_id}" data-pulse-kind="{kind}" r="5.2" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.35" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="{2.5 if kind != 'probe' else 3.2}s" begin="{fmt(begin + index * .03)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def state_timeline_markup() -> str:
    parts: list[str] = []
    start_x = 314
    y = 438
    for index, state in enumerate(STATE_NODES):
        x = start_x + index * 112
        color_name = str(state["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="breaker-state-node" data-state-id="{esc(state['id'])}" data-state="{esc(state['state'])}" transform="translate({x} {y})">
        <rect x="-46" y="-21" width="92" height="42" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.15"/>
        <circle cx="-30" cy="0" r="5.9" fill="{color}">
          <animate attributeName="r" values="5.2;7.6;6.2" dur="1.35s" begin="{fmt(1.1 + index * .18)}s" repeatCount="indefinite"/>
        </circle>
        <text class="state-label" x="-17" y="-3">{esc(state['label'])}</text>
        <text class="state-note" x="-17" y="13">{esc(state['note'])}</text>
      </g>"""
        )
        if index < len(STATE_NODES) - 1:
            parts.append(
                f"""
      <path class="state-transition-link" data-transition-index="{index}" d="M{x + 47} {y} L{x + 64} {y}" fill="none" stroke="{PALETTE['gray300']}" stroke-width="1.6" stroke-linecap="round"/>"""
            )
    return f"""
    <g class="breaker-state-timeline" data-state-count="{len(STATE_NODES)}">
{''.join(parts)}
    </g>"""


def metrics_markup() -> str:
    failure_points = [(metric_x(float(sample["second"])), failure_y(float(sample["failure"]))) for sample in METRICS]
    latency_points = [(metric_x(float(sample["second"])), latency_y(float(sample["latency"]))) for sample in METRICS]
    failure_line = line_path(failure_points)
    latency_line = line_path(latency_points)
    point_parts: list[str] = []
    for index, (sample, (fx, fy), (lx, ly)) in enumerate(zip(METRICS, failure_points, latency_points)):
        fail_color = "red" if float(sample["failure"]) >= BREAKER_STATE["failure_threshold"] else "orange" if float(sample["failure"]) >= 35 else "green"
        point_parts.append(
            f"""
      <circle class="breaker-failure-point" data-second="{sample['second']}" data-failure-rate="{sample['failure']}" cx="{fmt(fx)}" cy="{fmt(fy)}"
        r="{4.8 if float(sample['failure']) >= BREAKER_STATE['failure_threshold'] else 3.4}" fill="{PALETTE[fail_color]}" stroke="#ffffff" stroke-width="1.2">
        <animate attributeName="r" values="2.1;5.4;{4.8 if float(sample['failure']) >= BREAKER_STATE['failure_threshold'] else 3.4}" dur=".44s" begin="{fmt(.75 + index * .05)}s" fill="freeze"/>
      </circle>
      <circle class="breaker-latency-point" data-second="{sample['second']}" data-latency-ms="{sample['latency']}" cx="{fmt(lx)}" cy="{fmt(ly)}"
        r="3.1" fill="{PALETTE['purple']}" stroke="#ffffff" stroke-width="1.1">
        <animate attributeName="r" values="1.8;4.4;3.1" dur=".4s" begin="{fmt(.9 + index * .05)}s" fill="freeze"/>
      </circle>"""
        )
    threshold_y = failure_y(float(BREAKER_STATE["failure_threshold"]))
    return f"""
    <g class="breaker-metric-panel" data-panel-id="breaker-metrics">
      <rect x="58" y="492" width="566" height="126" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="516">Trip signal and recovery</text>
      <text class="panel-subtitle" x="250" y="516">red = failure rate, purple = latency</text>
      <rect x="104" y="536" width="490" height="76" fill="{PALETTE['red_highlight']}" fill-opacity=".18"/>
      <line class="trip-threshold-line" data-threshold="{BREAKER_STATE['failure_threshold']}" x1="104" x2="594" y1="{fmt(threshold_y)}" y2="{fmt(threshold_y)}"
        stroke="{PALETTE['red']}" stroke-width="1.35" stroke-dasharray="5 6"/>
      <text class="threshold-label" x="588" y="{fmt(threshold_y - 6)}" text-anchor="end">trip at {BREAKER_STATE['failure_threshold']}%</text>
      <path class="breaker-latency-line" data-point-count="{len(METRICS)}" d="{latency_line}" fill="none" stroke="{PALETTE['purple']}" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" opacity=".72" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin=".62s" fill="freeze"/>
      </path>
      <path class="breaker-failure-line" data-point-count="{len(METRICS)}" d="{failure_line}" fill="none" stroke="{PALETTE['red']}" stroke-width="3.2"
        stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.08s" begin=".52s" fill="freeze"/>
      </path>
{''.join(point_parts)}
      <text class="axis-label" x="104" y="610">-45s</text>
      <text class="axis-label" x="566" y="610" text-anchor="end">now</text>
    </g>"""


def mitigation_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(MITIGATIONS):
        col = index % 2
        row = index // 2
        x = 660 + col * 178
        y = 528 + row * 43
        color_name = str(step["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="breaker-mitigation-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
        <rect x="0" y="0" width="160" height="35" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.15">
          <animate attributeName="opacity" values=".45;1" dur=".35s" begin="{fmt(1.15 + index * .16)}s" fill="freeze"/>
        </rect>
        <circle cx="18" cy="17.5" r="7.2" fill="{color}"/>
        <text class="step-index" x="18" y="21" text-anchor="middle">{index + 1}</text>
        <text class="step-label" x="34" y="15">{esc(step['label'])}</text>
        <text class="step-note" x="34" y="29">{esc(step['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="breaker-mitigation-panel" data-panel-id="breaker-mitigations">
      <rect x="642" y="492" width="386" height="126" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="662" y="516">Breaker runbook</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Circuit Breaker</title>
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
      width: min(100vw - 32px, 1160px);
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
      font-size: 22px;
      font-weight: 900;
    }}
    .root-subtitle, .panel-subtitle, .status-note, .source-rate, .node-note, .gate-note, .state-note, .axis-label, .step-note, .lane-label {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .source-label, .node-label, .gate-label, .step-label, .state-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .status-eyebrow, .step-index, .metric-label, .threshold-label {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .step-index {{
      fill: #ffffff;
    }}
    .threshold-label {{
      fill: {PALETTE["red"]};
    }}
    .breaker-request-pulse {{
      filter: drop-shadow(0 0 5px rgba(101, 47, 108, .28));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .breaker-request-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="circuit-breaker" data-pattern-id="d3-circuit-breaker"
    data-pattern-family="critical-resilience" data-client-count="{len(CLIENTS)}"
    data-flow-count="8" data-pulse-count="7" data-state-count="{len(STATE_NODES)}"
    data-failure-point-count="{len(METRICS)}" data-latency-point-count="{len(METRICS)}"
    data-mitigation-count="{len(MITIGATIONS)}" data-status-card-count="{len(STATUS_CARDS)}"
    data-breaker-state="{esc(BREAKER_STATE['state'])}" data-failure-threshold="{BREAKER_STATE['failure_threshold']}"
    data-current-failure-rate="{BREAKER_STATE['current_failure_rate']}" data-open-window-seconds="{BREAKER_STATE['open_window_seconds']}"
    data-timeout-ms="{BREAKER_STATE['timeout_ms']}" data-retry-budget="{esc(BREAKER_STATE['retry_budget'])}"
    data-probe-count="{BREAKER_STATE['probe_count']}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="circuit-breaker-title circuit-breaker-desc">
    <title id="circuit-breaker-title">Critical circuit breaker</title>
    <desc id="circuit-breaker-desc">A deterministic resilience pattern shows client pressure, an open circuit breaker, fail-fast fallback, retry suppression, half-open probes, and failure-rate recovery.</desc>
    <rect x="28" y="24" width="1024" height="606" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical circuit breaker</text>
    <text class="root-subtitle" x="58" y="80">Stop repeated downstream failures before retries turn a local outage into a system-wide incident.</text>
    <g class="breaker-status-cards">
{status_markup()}
    </g>
{topology_panel_markup()}
    <g class="breaker-flow-layer">
{paths_markup()}
    </g>
    <g class="breaker-pulses">
{pulses_markup()}
    </g>
{clients_markup()}
{caller_markup()}
{breaker_markup()}
{dependency_markup()}
{state_timeline_markup()}
{metrics_markup()}
{mitigation_markup()}
  </svg>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Output self-contained HTML path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
