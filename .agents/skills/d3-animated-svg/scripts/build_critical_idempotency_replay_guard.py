#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Idempotency Replay Guard animated SVG HTML file."""

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

ATTEMPTS = [
    {"id": "initial", "label": "Initial charge", "meta": "create request", "key": "pay_9f3", "fingerprint": "hash A", "action": "create", "color": "blue", "y": 232},
    {"id": "timeout-retry", "label": "Timeout retry", "meta": "client unsure", "key": "pay_9f3", "fingerprint": "hash A", "action": "replay", "color": "orange", "y": 294},
    {"id": "mobile-retry", "label": "Mobile retry", "meta": "same payload", "key": "pay_9f3", "fingerprint": "hash A", "action": "replay", "color": "orange", "y": 356},
    {"id": "changed-payload", "label": "Payload changed", "meta": "same key, new body", "key": "pay_9f3", "fingerprint": "hash B", "action": "reject", "color": "red", "y": 418},
]

LEDGER_ROWS = [
    {"id": "first-write", "attempt": "initial", "key": "pay_9f3", "fingerprint": "hash A", "outcome": "store 201", "detail": "charge created", "color": "green"},
    {"id": "retry-a", "attempt": "timeout-retry", "key": "pay_9f3", "fingerprint": "hash A", "outcome": "replay 201", "detail": "no new charge", "color": "orange"},
    {"id": "retry-b", "attempt": "mobile-retry", "key": "pay_9f3", "fingerprint": "hash A", "outcome": "replay 201", "detail": "same response", "color": "orange"},
    {"id": "mismatch", "attempt": "changed-payload", "key": "pay_9f3", "fingerprint": "hash B", "outcome": "reject 409", "detail": "fingerprint differs", "color": "red"},
]

STATUS_CARDS = [
    ("side effect", "1x", "charge created once", "green"),
    ("retries", "3x", "same key returns safely", "orange"),
    ("mismatch", "1", "changed payload blocked", "red"),
    ("TTL window", "24h", "key retained in ledger", "purple"),
]

METRICS = [
    {"t": 0, "attempts": 1.0, "side_effects": 1.0, "suppressed": 0.0},
    {"t": 1, "attempts": 1.0, "side_effects": 1.0, "suppressed": 0.0},
    {"t": 2, "attempts": 2.0, "side_effects": 1.0, "suppressed": 1.0},
    {"t": 3, "attempts": 2.0, "side_effects": 1.0, "suppressed": 1.0},
    {"t": 4, "attempts": 3.0, "side_effects": 1.0, "suppressed": 2.0},
    {"t": 5, "attempts": 3.0, "side_effects": 1.0, "suppressed": 2.0},
    {"t": 6, "attempts": 4.0, "side_effects": 1.0, "suppressed": 3.0},
    {"t": 7, "attempts": 4.0, "side_effects": 1.0, "suppressed": 3.0},
    {"t": 8, "attempts": 4.0, "side_effects": 1.0, "suppressed": 3.0},
    {"t": 9, "attempts": 4.0, "side_effects": 1.0, "suppressed": 3.0},
]

POLICY_STEPS = [
    {"id": "require-key", "label": "Require key", "note": "client request ID", "color": "purple"},
    {"id": "fingerprint", "label": "Fingerprint", "note": "hash body + params", "color": "blue"},
    {"id": "store-first", "label": "Store first", "note": "persist 201 result", "color": "green"},
    {"id": "replay-or-reject", "label": "Replay/reject", "note": "same or changed", "color": "red"},
]

CLIENT_X = 80
GATEWAY_X = 298
GATEWAY_Y = 326
LEDGER_X = 440
LEDGER_Y = 222
LEDGER_W = 284
LEDGER_H = 218
SIDE_X = 846
SIDE_Y = 244
STORED_X = 846
STORED_Y = 340
REJECT_X = 846
REJECT_Y = 424


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def client_path(attempt: dict[str, object]) -> str:
    x0 = CLIENT_X + 176
    y0 = float(attempt["y"])
    x1 = GATEWAY_X - 78
    y1 = GATEWAY_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 42)} {fmt(y0)} {fmt(x1 - 44)} {fmt(y1)} {x1} {fmt(y1)}"


def gateway_ledger_path() -> str:
    return f"M{GATEWAY_X + 76} {GATEWAY_Y} C392 {GATEWAY_Y} 404 {GATEWAY_Y} {LEDGER_X - 22} {GATEWAY_Y}"


def side_effect_path() -> str:
    y = SIDE_Y + 28
    return f"M{LEDGER_X + LEDGER_W} {LEDGER_Y + 72} C762 {LEDGER_Y + 72} 770 {y} {SIDE_X - 112} {y}"


def replay_path() -> str:
    y = STORED_Y + 28
    return f"M{LEDGER_X + LEDGER_W} {LEDGER_Y + 128} C762 {LEDGER_Y + 128} 770 {y} {STORED_X - 112} {y}"


def reject_path() -> str:
    y = REJECT_Y + 22
    return f"M{LEDGER_X + LEDGER_W} {LEDGER_Y + 177} C760 {LEDGER_Y + 184} 770 {y} {REJECT_X - 112} {y}"


def metric_x(index: int) -> float:
    left = 104
    right = 594
    return left + index / 9.0 * (right - left)


def metric_y(value: float) -> float:
    top = 524
    bottom = 584
    return bottom - min(value, 4.0) / 4.0 * (bottom - top)


def line_path(points: list[tuple[float, float]]) -> str:
    return " ".join(("M" if index == 0 else "L") + f"{fmt(x)} {fmt(y)}" for index, (x, y) in enumerate(points))


def status_markup() -> str:
    parts: list[str] = []
    for index, (eyebrow, value, note, color_name) in enumerate(STATUS_CARDS):
        x = 58 + index * 244
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="idempotency-status-card" data-card-index="{index}" transform="translate({x} 88)">
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
    <g class="idempotency-topology-panel" data-panel-id="idempotency-topology">
      <rect x="58" y="160" width="970" height="304" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Idempotency replay guard prevents duplicate side effects</text>
      <text class="panel-subtitle" x="78" y="203">same key and fingerprint replays the stored response; same key with changed payload is rejected</text>
      <line x1="270" x2="270" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="406" x2="406" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="742" x2="742" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <text class="lane-label" x="92" y="450">retrying clients</text>
      <text class="lane-label" x="282" y="450">gateway guard</text>
      <text class="lane-label" x="528" y="450">idempotency ledger</text>
      <text class="lane-label" x="808" y="450">outcomes</text>
    </g>"""


def clients_markup() -> str:
    parts: list[str] = []
    for attempt in ATTEMPTS:
        color_name = str(attempt["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="idempotency-client" data-client-id="{esc(attempt['id'])}" data-idempotency-key="{esc(attempt['key'])}"
        data-fingerprint="{esc(attempt['fingerprint'])}" data-action="{esc(attempt['action'])}" transform="translate({CLIENT_X} {float(attempt['y']) - 23})">
        <rect x="0" y="0" width="176" height="46" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="18" cy="23" r="6.3" fill="{color}"/>
        <text class="source-label" x="34" y="17">{esc(attempt['label'])}</text>
        <text class="idempotency-key source-rate" x="34" y="31">key {esc(attempt['key'])}</text>
        <text class="request-fingerprint source-rate" x="112" y="31">{esc(attempt['fingerprint'])}</text>
        <text class="source-rate" x="34" y="43">{esc(attempt['meta'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def gateway_markup() -> str:
    return f"""
    <g class="idempotency-gateway" data-gateway-id="checkout-api-gateway" transform="translate({GATEWAY_X - 76} {GATEWAY_Y - 56})">
      <rect x="0" y="0" width="152" height="112" rx="10" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.35"/>
      <text class="panel-title" x="18" y="25">API gateway</text>
      <text class="panel-subtitle" x="18" y="43">check key + hash</text>
      <g class="duplicate-guard" data-guard-id="key-fingerprint-guard" transform="translate(20 61)">
        <rect x="0" y="0" width="112" height="32" rx="8" fill="#ffffff" stroke="{PALETTE['purple']}" stroke-width="1"/>
        <circle cx="18" cy="16" r="6" fill="{PALETTE['purple']}">
          <animate attributeName="r" values="5.2;7.6;6" dur="1.25s" begin=".8s" repeatCount="indefinite"/>
        </circle>
        <text class="gate-label" x="34" y="13">duplicate guard</text>
        <text class="gate-note" x="34" y="27">ledger lookup</text>
      </g>
    </g>"""


def ledger_markup() -> str:
    row_parts: list[str] = []
    for index, row in enumerate(LEDGER_ROWS):
        y = 62 + index * 37
        color = PALETTE[str(row["color"])]
        fill = PALETTE[f"{row['color']}_highlight"]
        row_parts.append(
            f"""
      <g class="idempotency-ledger-row" data-row-id="{esc(row['id'])}" data-attempt-id="{esc(row['attempt'])}"
        data-idempotency-key="{esc(row['key'])}" data-fingerprint="{esc(row['fingerprint'])}" data-outcome="{esc(row['outcome'])}"
        transform="translate(14 {y})">
        <rect x="0" y="0" width="{LEDGER_W - 28}" height="30" rx="7" fill="{fill}" stroke="{color}" stroke-width="1.05">
          <animate attributeName="opacity" values=".42;1" dur=".34s" begin="{fmt(.55 + index * .15)}s" fill="freeze"/>
        </rect>
        <circle cx="14" cy="15" r="5.7" fill="{color}"/>
        <text class="idempotency-key ledger-key" x="27" y="12">{esc(row['key'])}</text>
        <text class="request-fingerprint ledger-fingerprint" x="27" y="25">{esc(row['fingerprint'])}</text>
        <text class="ledger-outcome" x="116" y="12">{esc(row['outcome'])}</text>
        <text class="ledger-detail" x="116" y="25">{esc(row['detail'])}</text>
      </g>"""
        )
    return f"""
    <g class="idempotency-ledger" data-ledger-id="payment-idempotency-ledger" data-idempotency-key="pay_9f3" data-ttl-hours="24"
      transform="translate({LEDGER_X} {LEDGER_Y})">
      <rect x="0" y="0" width="{LEDGER_W}" height="{LEDGER_H}" rx="12" fill="{PALETTE['surface']}" stroke="{PALETTE['purple']}" stroke-width="1.45"/>
      <text class="node-label" x="18" y="25">Idempotency ledger</text>
      <text class="node-note" x="18" y="43">key + fingerprint + first response</text>
      <g class="ttl-window-marker" data-ttl-hours="24" transform="translate({LEDGER_W - 92} 16)">
        <rect x="0" y="0" width="72" height="24" rx="7" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1"/>
        <text class="ttl-label" x="36" y="16" text-anchor="middle">TTL 24h</text>
      </g>
{''.join(row_parts)}
    </g>"""


def outcomes_markup() -> str:
    return f"""
    <g class="side-effect-target" data-target-id="payment-processor" data-side-effect-count="1" transform="translate({SIDE_X - 112} {SIDE_Y})">
      <rect x="0" y="0" width="224" height="56" rx="10" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.35"/>
      <circle cx="22" cy="28" r="7" fill="{PALETTE['green']}"/>
      <text class="node-label" x="42" y="22">Payment processor</text>
      <text class="node-note" x="42" y="40">one charge created</text>
    </g>
    <g class="stored-response" data-response-code="201" data-replay-count="2" transform="translate({STORED_X - 112} {STORED_Y})">
      <rect x="0" y="0" width="224" height="56" rx="10" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.35"/>
      <circle cx="22" cy="28" r="7" fill="{PALETTE['green']}">
        <animate attributeName="r" values="6;9;7" dur="1.18s" begin="1.4s" repeatCount="indefinite"/>
      </circle>
      <text class="node-label" x="42" y="22">Stored response</text>
      <text class="node-note" x="42" y="40">replay HTTP 201, no new work</text>
    </g>
    <g class="mismatch-reject" data-response-code="409" data-mismatch-count="1" transform="translate({REJECT_X - 112} {REJECT_Y})">
      <rect x="0" y="0" width="224" height="44" rx="10" fill="{PALETTE['red_highlight']}" stroke="{PALETTE['red']}" stroke-width="1.35"/>
      <circle cx="22" cy="22" r="7" fill="{PALETTE['red']}"/>
      <text class="node-label" x="42" y="19">Reject mismatch</text>
      <text class="node-note" x="42" y="34">same key, different hash</text>
    </g>"""


def flows_markup() -> str:
    parts: list[str] = []
    for attempt in ATTEMPTS:
        color = PALETTE[str(attempt["color"])]
        parts.append(
            f"""
      <path id="idempotency-flow-client-{esc(attempt['id'])}" class="idempotency-flow-path" data-flow-id="client-{esc(attempt['id'])}"
        data-source="{esc(attempt['id'])}" data-target="checkout-api-gateway" data-kind="client-attempt" d="{client_path(attempt)}"
        fill="none" stroke="{color}" stroke-width="2.25" stroke-opacity=".78" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".75s" begin=".16s" fill="freeze"/>
      </path>"""
        )
    flow_defs = [
        ("gateway-ledger", "checkout-api-gateway", "payment-idempotency-ledger", "ledger-check", gateway_ledger_path(), "purple", "idempotency-flow-path duplicate-guard-path", ".46", "2.7"),
        ("side-effect", "payment-idempotency-ledger", "payment-processor", "first-side-effect", side_effect_path(), "green", "idempotency-flow-path side-effect-path", ".72", "3.2"),
        ("response-replay", "payment-idempotency-ledger", "stored-response", "stored-response-replay", replay_path(), "green", "idempotency-flow-path response-replay-path", ".98", "3"),
        ("mismatch-reject", "payment-idempotency-ledger", "reject-mismatch", "fingerprint-mismatch-reject", reject_path(), "red", "idempotency-flow-path mismatch-reject-path", "1.18", "3"),
    ]
    for flow_id, source, target, kind, path, color_name, classes, begin, width in flow_defs:
        parts.append(
            f"""
      <path id="idempotency-flow-{flow_id}" class="{classes}" data-flow-id="{flow_id}" data-source="{source}" data-target="{target}" data-kind="{kind}"
        d="{path}" fill="none" stroke="{PALETTE[color_name]}" stroke-width="{width}" stroke-opacity=".9" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{begin}s" fill="freeze"/>
      </path>"""
        )
    return "\n".join(parts)


def pulses_markup() -> str:
    pulse_defs = [
        ("initial", "idempotency-flow-client-initial", "blue", 0.96, "client"),
        ("timeout-retry", "idempotency-flow-client-timeout-retry", "orange", 1.1, "client"),
        ("mobile-retry", "idempotency-flow-client-mobile-retry", "orange", 1.24, "client"),
        ("changed-payload", "idempotency-flow-client-changed-payload", "red", 1.38, "client"),
        ("ledger-check", "idempotency-flow-gateway-ledger", "purple", 1.52, "ledger"),
        ("side-effect", "idempotency-flow-side-effect", "green", 1.74, "side-effect"),
        ("response-replay", "idempotency-flow-response-replay", "green", 1.94, "replay"),
        ("mismatch-reject", "idempotency-flow-mismatch-reject", "red", 2.12, "reject"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        parts.append(
            f"""
      <circle class="idempotency-request-pulse" data-pulse-id="{esc(pulse_id)}" data-pulse-kind="{esc(kind)}" r="5.4" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.35" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.65s" begin="{fmt(begin + index * .03)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def metrics_markup() -> str:
    series = [
        ("attempts", "attempts", "blue"),
        ("side-effects", "side_effects", "green"),
        ("suppressed", "suppressed", "orange"),
    ]
    line_parts: list[str] = []
    point_parts: list[str] = []
    for series_id, key, color_name in series:
        points = [(metric_x(index), metric_y(float(sample[key]))) for index, sample in enumerate(METRICS)]
        line_parts.append(
            f"""
      <path class="idempotency-metric-line" data-series="{series_id}" data-sample-count="{len(METRICS)}" d="{line_path(points)}"
        fill="none" stroke="{PALETTE[color_name]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin=".62s" fill="freeze"/>
      </path>"""
        )
        for index, (sample, (x, y)) in enumerate(zip(METRICS, points)):
            value = float(sample[key])
            point_parts.append(
                f"""
      <circle class="idempotency-metric-point" data-series="{series_id}" data-sample-index="{index}" data-value="{value}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{4.5 if value >= 3 else 3.2}" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.15"/>"""
            )
    side_y = metric_y(1.0)
    return f"""
    <g class="idempotency-metric-panel" data-panel-id="idempotency-metrics">
      <rect x="58" y="474" width="600" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="496">Attempts rise, side effects stay at one</text>
      <text class="panel-subtitle" x="78" y="512">blue = attempts, green = side effects, orange = duplicates suppressed</text>
      <line class="side-effect-ceiling-line" data-side-effect-count="1" x1="104" x2="594" y1="{fmt(side_y)}" y2="{fmt(side_y)}"
        stroke="{PALETTE['green']}" stroke-width="1.25" stroke-dasharray="5 6"/>
{''.join(line_parts)}
{''.join(point_parts)}
      <text class="axis-label" x="104" y="594">t0</text>
      <text class="axis-label" x="594" y="594" text-anchor="end">t9</text>
      <text class="axis-label" x="604" y="{fmt(side_y + 4)}">1 side effect</text>
    </g>"""


def policy_markup() -> str:
    parts: list[str] = []
    for index, step in enumerate(POLICY_STEPS):
        col = index % 2
        row = index // 2
        x = 690 + col * 164
        y = 512 + row * 42
        color = PALETTE[str(step["color"])]
        fill = PALETTE[f"{step['color']}_highlight"]
        parts.append(
            f"""
      <g class="idempotency-policy-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
        <rect x="0" y="0" width="150" height="34" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.1">
          <animate attributeName="opacity" values=".48;1" dur=".35s" begin="{fmt(1.15 + index * .15)}s" fill="freeze"/>
        </rect>
        <circle cx="17" cy="17" r="7" fill="{color}"/>
        <text class="step-index" x="17" y="20" text-anchor="middle">{index + 1}</text>
        <text class="step-label" x="31" y="14">{esc(step['label'])}</text>
        <text class="step-note" x="31" y="28">{esc(step['note'])}</text>
      </g>"""
        )
    return f"""
    <g class="idempotency-policy-panel" data-panel-id="idempotency-policy">
      <rect x="672" y="474" width="356" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="692" y="498">Replay-guard policy</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Idempotency Replay Guard</title>
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
    .root-subtitle, .panel-subtitle, .status-note, .source-rate, .gate-note, .node-note, .axis-label, .lane-label, .step-note, .ledger-detail, .ledger-fingerprint {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .source-label, .gate-label, .node-label, .step-label, .ledger-key, .ledger-outcome {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .status-eyebrow, .ttl-label {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .step-index {{
      fill: #ffffff;
      font-size: 10px;
      font-weight: 900;
    }}
    .idempotency-request-pulse {{
      filter: drop-shadow(0 0 5px rgba(101, 47, 108, .26));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .idempotency-request-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="idempotency-guard" data-pattern-id="d3-idempotency-guard"
    data-pattern-family="critical-idempotency" data-client-count="{len(ATTEMPTS)}" data-retry-count="3"
    data-duplicate-count="3" data-flow-count="8" data-pulse-count="8" data-ledger-row-count="{len(LEDGER_ROWS)}"
    data-side-effect-count="1" data-replay-count="2" data-mismatch-count="1" data-metric-line-count="3"
    data-metric-point-count="{len(METRICS) * 3}" data-policy-step-count="{len(POLICY_STEPS)}"
    data-status-card-count="{len(STATUS_CARDS)}" data-idempotency-key="pay_9f3" data-idempotency-ttl-hours="24"
    data-duplicate-suppressed="3" data-side-effects-created="1" data-replayed-response-code="201"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="idempotency-guard-title idempotency-guard-desc">
    <title id="idempotency-guard-title">Critical idempotency replay guard</title>
    <desc id="idempotency-guard-desc">A deterministic replay-guard pattern shows clients retrying with an idempotency key, a gateway duplicate guard, a ledger comparing request fingerprints, one committed side effect, stored response replay for same-key retries, changed-payload rejection, TTL retention, and metrics where attempts rise while side effects remain at one.</desc>
    <rect x="28" y="24" width="1024" height="590" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical idempotency replay guard</text>
    <text class="root-subtitle" x="58" y="80">Make retries safe by replaying the first stored result instead of creating duplicate side effects.</text>
    <g class="idempotency-status-cards">
{status_markup()}
    </g>
{topology_panel_markup()}
    <g class="idempotency-flow-paths">
{flows_markup()}
    </g>
    <g class="idempotency-clients">
{clients_markup()}
    </g>
{gateway_markup()}
{ledger_markup()}
{outcomes_markup()}
    <g class="idempotency-request-pulses">
{pulses_markup()}
    </g>
{metrics_markup()}
{policy_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Idempotency Replay Guard D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
