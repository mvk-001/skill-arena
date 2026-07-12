#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""Build a standalone self-contained Critical Rate Limit Token Bucket animated SVG HTML file."""

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
    {"id": "web", "label": "Web clients", "rate": "2.7k/s", "quota": "user", "color": "blue", "y": 238},
    {"id": "partner", "label": "Partner API", "rate": "3.1k/s", "quota": "api-key", "color": "blue", "y": 300},
    {"id": "mobile", "label": "Mobile app", "rate": "1.6k/s", "quota": "session", "color": "green", "y": 362},
    {"id": "bot", "label": "Bot spike", "rate": "5.4k/s", "quota": "ip", "color": "red", "y": 424},
]

BUCKET = {
    "capacity": 12,
    "current_tokens": 3,
    "refill_rate": "5k/s",
    "burst_limit": "12 tokens",
    "retry_after": 8,
    "allowed_rate": "5.0k/s",
    "throttled_rate": "4.4k/s",
}

METRICS = [
    {"t": 0, "incoming": 4.2, "allowed": 4.2, "rejected": 0.0},
    {"t": 1, "incoming": 4.7, "allowed": 4.7, "rejected": 0.0},
    {"t": 2, "incoming": 5.1, "allowed": 5.0, "rejected": 0.1},
    {"t": 3, "incoming": 6.8, "allowed": 5.0, "rejected": 1.8},
    {"t": 4, "incoming": 8.7, "allowed": 5.0, "rejected": 3.7},
    {"t": 5, "incoming": 9.4, "allowed": 5.0, "rejected": 4.4},
    {"t": 6, "incoming": 8.9, "allowed": 5.0, "rejected": 3.9},
    {"t": 7, "incoming": 7.1, "allowed": 5.0, "rejected": 2.1},
    {"t": 8, "incoming": 5.6, "allowed": 5.0, "rejected": 0.6},
    {"t": 9, "incoming": 4.9, "allowed": 4.9, "rejected": 0.0},
]

STATUS_CARDS = [
    ("incoming", "9.4k/s", "burst exceeds refill", "red"),
    ("limit", "5k/s", "steady token refill", "purple"),
    ("tokens", "3/12", "bucket nearly empty", "orange"),
    ("429", "4.4k/s", "Retry-After: 8s", "green"),
]

POLICY_STEPS = [
    {"id": "refill-rate", "label": "Set refill", "note": "5k/s steady", "color": "purple"},
    {"id": "burst-cap", "label": "Cap burst", "note": "12 token max", "color": "orange"},
    {"id": "return-429", "label": "Return 429", "note": "Retry-After: 8s", "color": "red"},
    {"id": "jitter-backoff", "label": "Jitter backoff", "note": "protect backend", "color": "green"},
]

CLIENT_X = 80
GATEWAY_X = 300
GATEWAY_Y = 332
BUCKET_X = 532
BUCKET_Y = 318
BACKEND_X = 832
BACKEND_Y = 270
RETRY_X = 832
RETRY_Y = 410
CLOCK_X = 658
CLOCK_Y = 230


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def client_path(client: dict[str, object]) -> str:
    x0 = CLIENT_X + 176
    y0 = float(client["y"])
    x1 = GATEWAY_X - 78
    y1 = GATEWAY_Y
    return f"M{x0} {fmt(y0)} C{fmt(x0 + 42)} {fmt(y0)} {fmt(x1 - 45)} {fmt(y1)} {x1} {fmt(y1)}"


def gateway_bucket_path() -> str:
    return f"M{GATEWAY_X + 76} {GATEWAY_Y} C420 {GATEWAY_Y} 438 {BUCKET_Y} {BUCKET_X - 114} {BUCKET_Y}"


def allowed_path() -> str:
    return f"M{BUCKET_X + 116} {BUCKET_Y - 36} C700 252 728 248 {BACKEND_X - 108} {BACKEND_Y}"


def throttled_path() -> str:
    return f"M{BUCKET_X + 116} {BUCKET_Y + 48} C702 396 726 410 {RETRY_X - 108} {RETRY_Y}"


def refill_path() -> str:
    return f"M{CLOCK_X} {CLOCK_Y + 28} C{CLOCK_X - 28} 260 {BUCKET_X - 58} 270 {BUCKET_X - 36} {BUCKET_Y - 82}"


def metric_x(index: int) -> float:
    left = 104
    right = 594
    return left + index / 9.0 * (right - left)


def metric_y(value: float) -> float:
    top = 524
    bottom = 584
    return bottom - min(value, 10.0) / 10.0 * (bottom - top)


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
      <g class="rate-limit-status-card" data-card-index="{index}" transform="translate({x} 88)">
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
    <g class="rate-limit-topology-panel" data-panel-id="rate-limit-topology">
      <rect x="58" y="160" width="970" height="304" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="186">Token bucket rate limit protects the backend</text>
      <text class="panel-subtitle" x="78" y="203">bursts spend saved tokens; excess requests get 429 with Retry-After instead of saturating dependencies</text>
      <line x1="270" x2="270" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="402" x2="402" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <line x1="682" x2="682" y1="216" y2="448" stroke="{PALETTE['gray100']}" stroke-width="1.2"/>
      <text class="lane-label" x="92" y="450">client pressure</text>
      <text class="lane-label" x="284" y="450">gateway</text>
      <text class="lane-label" x="488" y="450">admission tokens</text>
      <text class="lane-label" x="780" y="450">protected outcomes</text>
    </g>"""


def clients_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color_name = str(client["color"])
        color = PALETTE[color_name]
        fill = PALETTE[f"{color_name}_highlight"]
        parts.append(
            f"""
      <g class="rate-limit-client" data-client-id="{esc(client['id'])}" data-rate="{esc(client['rate'])}" data-quota-key="{esc(client['quota'])}"
        transform="translate({CLIENT_X} {float(client['y']) - 22})">
        <rect x="0" y="0" width="176" height="44" rx="8" fill="{fill}" stroke="{color}" stroke-width="1.25"/>
        <circle cx="18" cy="22" r="6.3" fill="{color}"/>
        <text class="source-label" x="34" y="18">{esc(client['label'])}</text>
        <text class="source-rate" x="34" y="34">{esc(client['rate'])} - key: {esc(client['quota'])}</text>
      </g>"""
        )
    return "\n".join(parts)


def gateway_markup() -> str:
    return f"""
    <g class="api-gateway" data-gateway-id="edge-api-gateway" transform="translate({GATEWAY_X - 76} {GATEWAY_Y - 54})">
      <rect x="0" y="0" width="152" height="108" rx="10" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.35"/>
      <text class="panel-title" x="18" y="26">API gateway</text>
      <text class="panel-subtitle" x="18" y="44">quota key + policy</text>
      <rect x="20" y="62" width="112" height="28" rx="7" fill="#ffffff" stroke="{PALETTE['purple']}" stroke-width="1"/>
      <circle cx="38" cy="76" r="6" fill="{PALETTE['purple']}">
        <animate attributeName="r" values="5.2;7.5;6" dur="1.3s" begin=".8s" repeatCount="indefinite"/>
      </circle>
      <text class="gate-label" x="54" y="73">check bucket</text>
      <text class="gate-note" x="54" y="87">per key</text>
    </g>"""


def bucket_markup() -> str:
    token_parts: list[str] = []
    for index in range(BUCKET["capacity"]):
        col = index % 4
        row = index // 4
        x = 28 + col * 36
        y = 82 + row * 30
        state = "available" if index < BUCKET["current_tokens"] else "empty"
        color = PALETTE["green"] if state == "available" else PALETTE["red"] if index >= 9 else PALETTE["gray300"]
        fill = PALETTE["green_highlight"] if state == "available" else "#ffffff"
        token_parts.append(
            f"""
        <circle class="token-slot" data-token-index="{index + 1}" data-state="{state}" cx="{x}" cy="{y}" r="10"
          fill="{fill}" stroke="{color}" stroke-width="1.35">
          <animate attributeName="r" values="8.8;11.4;10" dur="1.25s" begin="{fmt(.9 + index * .04)}s" fill="freeze"/>
        </circle>"""
        )
    return f"""
    <g class="token-bucket" data-bucket-id="global-api-bucket" data-capacity="{BUCKET['capacity']}" data-current-tokens="{BUCKET['current_tokens']}"
      transform="translate({BUCKET_X - 94} {BUCKET_Y - 94})">
      <rect x="0" y="0" width="188" height="188" rx="12" fill="{PALETTE['orange_highlight']}" stroke="{PALETTE['orange']}" stroke-width="1.45"/>
      <text class="node-label" x="18" y="26">Token bucket</text>
      <text class="node-note" x="18" y="44">capacity {BUCKET['capacity']} - now {BUCKET['current_tokens']}</text>
      <text class="node-note" x="18" y="61">refill {esc(BUCKET['refill_rate'])}, burst {esc(BUCKET['burst_limit'])}</text>
      <g class="token-slots" data-slot-count="{BUCKET['capacity']}">
{''.join(token_parts)}
      </g>
    </g>
    <g class="refill-clock" data-refill-rate="{esc(BUCKET['refill_rate'])}" transform="translate({CLOCK_X} {CLOCK_Y})">
      <circle cx="0" cy="0" r="24" fill="{PALETTE['purple_highlight']}" stroke="{PALETTE['purple']}" stroke-width="1.25"/>
      <path d="M0 -13 V0 L10 7" fill="none" stroke="{PALETTE['purple']}" stroke-width="2.3" stroke-linecap="round"/>
      <text class="clock-label" x="0" y="40" text-anchor="middle">refill {esc(BUCKET['refill_rate'])}</text>
    </g>"""


def outcome_markup() -> str:
    return f"""
    <g class="protected-backend" data-backend-id="orders-api" data-allowed-rate="{esc(BUCKET['allowed_rate'])}" transform="translate({BACKEND_X - 108} {BACKEND_Y - 48})">
      <rect x="0" y="0" width="216" height="96" rx="10" fill="{PALETTE['green_highlight']}" stroke="{PALETTE['green']}" stroke-width="1.35"/>
      <circle cx="24" cy="49" r="7" fill="{PALETTE['green']}"/>
      <text class="node-label" x="44" y="28">Protected backend</text>
      <text class="node-note" x="44" y="47">admitted {esc(BUCKET['allowed_rate'])}</text>
      <text class="node-note" x="44" y="64">p95 stays inside SLO</text>
    </g>
    <g class="retry-after-response" data-response-code="429" data-retry-after-seconds="{BUCKET['retry_after']}" data-throttled-rate="{esc(BUCKET['throttled_rate'])}"
      transform="translate({RETRY_X - 108} {RETRY_Y - 48})">
      <rect x="0" y="0" width="216" height="96" rx="10" fill="{PALETTE['orange_highlight']}" stroke="{PALETTE['orange']}" stroke-width="1.35"/>
      <circle cx="24" cy="49" r="7" fill="{PALETTE['orange']}">
        <animate attributeName="r" values="6;9;7" dur="1.15s" begin="1.4s" repeatCount="indefinite"/>
      </circle>
      <text class="node-label" x="44" y="27">429 Too Many Requests</text>
      <text class="node-note" x="44" y="46">Retry-After: {BUCKET['retry_after']}s</text>
      <text class="node-note" x="44" y="63">throttled {esc(BUCKET['throttled_rate'])}</text>
    </g>"""


def flows_markup() -> str:
    parts: list[str] = []
    for client in CLIENTS:
        color = PALETTE[str(client["color"])]
        parts.append(
            f"""
      <path id="rate-flow-client-{esc(client['id'])}" class="rate-limit-flow-path" data-flow-id="client-{esc(client['id'])}"
        data-source="{esc(client['id'])}" data-target="edge-api-gateway" data-kind="client-request" d="{client_path(client)}"
        fill="none" stroke="{color}" stroke-width="2.25" stroke-opacity=".75" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".75s" begin=".16s" fill="freeze"/>
      </path>"""
        )
    flow_defs = [
        ("gateway-bucket", "edge-api-gateway", "global-api-bucket", "admission-check", gateway_bucket_path(), "purple", "rate-limit-flow-path", ".48"),
        ("refill", "refill-clock", "global-api-bucket", "token-refill", refill_path(), "purple", "rate-limit-flow-path refill-path", ".68"),
        ("allowed", "global-api-bucket", "orders-api", "allowed", allowed_path(), "green", "rate-limit-flow-path allowed-path", ".88"),
        ("throttled", "global-api-bucket", "retry-after", "throttled-429", throttled_path(), "orange", "rate-limit-flow-path throttled-path", "1.08"),
    ]
    for flow_id, source, target, kind, path, color_name, classes, begin in flow_defs:
        parts.append(
            f"""
      <path id="rate-flow-{flow_id}" class="{classes}" data-flow-id="{flow_id}" data-source="{source}" data-target="{target}" data-kind="{kind}"
        d="{path}" fill="none" stroke="{PALETTE[color_name]}" stroke-width="{3.3 if flow_id in ('allowed', 'throttled') else 2.7}" stroke-opacity=".9" stroke-linecap="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="{begin}s" fill="freeze"/>
      </path>"""
        )
    return "\n".join(parts)


def pulses_markup() -> str:
    pulse_defs = [
        ("web", "rate-flow-client-web", "blue", 1.0, "client"),
        ("partner", "rate-flow-client-partner", "blue", 1.12, "client"),
        ("mobile", "rate-flow-client-mobile", "green", 1.24, "client"),
        ("bot-a", "rate-flow-client-bot", "red", 1.36, "client"),
        ("bot-b", "rate-flow-client-bot", "red", 1.56, "client"),
        ("check", "rate-flow-gateway-bucket", "purple", 1.58, "admission"),
        ("refill", "rate-flow-refill", "purple", 1.78, "refill"),
        ("allowed", "rate-flow-allowed", "green", 1.98, "allowed"),
        ("throttled", "rate-flow-throttled", "orange", 2.16, "throttled"),
    ]
    parts: list[str] = []
    for index, (pulse_id, path_id, color_name, begin, kind) in enumerate(pulse_defs):
        parts.append(
            f"""
      <circle class="rate-limit-request-pulse" data-pulse-id="{esc(pulse_id)}" data-pulse-kind="{esc(kind)}" r="5.4" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.35" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;{begin / (begin + .12):.3f};1" dur="{fmt(begin + .12)}s" begin="0s" fill="freeze"/>
        <animateMotion dur="2.65s" begin="{fmt(begin + index * .03)}s" repeatCount="indefinite" rotate="auto">
          <mpath href="#{path_id}"/>
        </animateMotion>
      </circle>"""
        )
    return "\n".join(parts)


def metrics_markup() -> str:
    series = [
        ("incoming", "incoming", "red"),
        ("allowed", "allowed", "green"),
        ("rejected", "rejected", "orange"),
    ]
    line_parts: list[str] = []
    point_parts: list[str] = []
    for series_id, key, color_name in series:
        points = [(metric_x(index), metric_y(float(sample[key]))) for index, sample in enumerate(METRICS)]
        line_parts.append(
            f"""
      <path class="rate-limit-metric-line" data-series="{series_id}" data-sample-count="{len(METRICS)}" d="{line_path(points)}"
        fill="none" stroke="{PALETTE[color_name]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin=".62s" fill="freeze"/>
      </path>"""
        )
        for index, (sample, (x, y)) in enumerate(zip(METRICS, points)):
            value = float(sample[key])
            point_parts.append(
                f"""
      <circle class="rate-limit-metric-point" data-series="{series_id}" data-sample-index="{index}" data-rate="{value}"
        cx="{fmt(x)}" cy="{fmt(y)}" r="{4.6 if value >= 8 else 3.2}" fill="{PALETTE[color_name]}" stroke="#ffffff" stroke-width="1.15"/>"""
            )
    limit_y = metric_y(5.0)
    return f"""
    <g class="rate-limit-metric-panel" data-panel-id="rate-limit-metrics">
      <rect x="58" y="474" width="600" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="78" y="496">Admission rate stays capped while incoming traffic spikes</text>
      <text class="panel-subtitle" x="78" y="512">red = incoming, green = admitted, orange = 429 responses</text>
      <rect x="104" y="{fmt(metric_y(10))}" width="490" height="{fmt(limit_y - metric_y(10))}" fill="{PALETTE['red_highlight']}" opacity=".32"/>
      <line class="limit-threshold-line" data-limit-rate="5.0" x1="104" x2="594" y1="{fmt(limit_y)}" y2="{fmt(limit_y)}"
        stroke="{PALETTE['purple']}" stroke-width="1.35" stroke-dasharray="5 6"/>
{''.join(line_parts)}
{''.join(point_parts)}
      <text class="axis-label" x="104" y="594">t0</text>
      <text class="axis-label" x="594" y="594" text-anchor="end">t9</text>
      <text class="axis-label" x="604" y="{fmt(limit_y + 4)}">5k/s</text>
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
      <g class="rate-limit-policy-step" data-step-id="{esc(step['id'])}" data-step-index="{index + 1}" transform="translate({x} {y})">
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
    <g class="rate-limit-policy-panel" data-panel-id="rate-limit-policy">
      <rect x="672" y="474" width="356" height="128" rx="8" fill="#ffffff" stroke="{PALETTE['gray200']}" stroke-width="1.2"/>
      <text class="panel-title" x="692" y="498">Rate-limit policy</text>
{''.join(parts)}
    </g>"""


def build_html() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Critical Rate Limit Token Bucket</title>
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
    .root-subtitle, .panel-subtitle, .status-note, .source-rate, .gate-note, .node-note, .axis-label, .lane-label, .step-note, .clock-label {{
      fill: {PALETTE["gray700"]};
      font-size: 9.5px;
      font-weight: 700;
    }}
    .panel-title, .status-value, .source-label, .gate-label, .node-label, .step-label {{
      fill: {PALETTE["ink"]};
      font-size: 12px;
      font-weight: 900;
    }}
    .status-eyebrow {{
      fill: {PALETTE["ink"]};
      font-size: 10px;
      font-weight: 850;
    }}
    .step-index {{
      fill: #ffffff;
      font-size: 10px;
      font-weight: 900;
    }}
    .rate-limit-request-pulse {{
      filter: drop-shadow(0 0 5px rgba(158, 27, 50, .24));
    }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateMotion, animateTransform {{
        dur: 1ms;
      }}
      .rate-limit-request-pulse {{
        opacity: 1;
      }}
    }}
  </style>
</head>
<body>
  <svg id="token-bucket" data-pattern-id="d3-token-bucket"
    data-pattern-family="critical-rate-limit" data-client-count="{len(CLIENTS)}" data-flow-count="8"
    data-pulse-count="9" data-token-count="{BUCKET['capacity']}" data-metric-line-count="3"
    data-metric-point-count="{len(METRICS) * 3}" data-policy-step-count="{len(POLICY_STEPS)}"
    data-status-card-count="{len(STATUS_CARDS)}" data-bucket-capacity="{BUCKET['capacity']}"
    data-current-tokens="{BUCKET['current_tokens']}" data-refill-rate="{esc(BUCKET['refill_rate'])}"
    data-burst-limit="{esc(BUCKET['burst_limit'])}" data-retry-after-seconds="{BUCKET['retry_after']}"
    data-allowed-rate="{esc(BUCKET['allowed_rate'])}" data-throttled-rate="{esc(BUCKET['throttled_rate'])}"
    viewBox="0 0 {WIDTH} {HEIGHT}" role="img"
    aria-labelledby="token-bucket-title token-bucket-desc">
    <title id="token-bucket-title">Critical rate limit token bucket</title>
    <desc id="token-bucket-desc">A deterministic token-bucket rate-limit pattern shows client bursts, an API gateway, bucket tokens, refill rate, admitted backend traffic, throttled 429 Retry-After responses, and metrics where incoming traffic exceeds the limit while admitted traffic remains capped.</desc>
    <rect x="28" y="24" width="1024" height="590" rx="10" fill="{PALETTE["surface"]}" stroke="{PALETTE["gray200"]}" stroke-width="1.2"/>
    <text class="root-title" x="58" y="58">Critical rate-limit token bucket</text>
    <text class="root-subtitle" x="58" y="80">Spend burst tokens deliberately, return 429 with Retry-After, and keep backend admission capped.</text>
    <g class="rate-limit-status-cards">
{status_markup()}
    </g>
{topology_panel_markup()}
    <g class="rate-limit-flow-paths">
{flows_markup()}
    </g>
    <g class="rate-limit-clients">
{clients_markup()}
    </g>
{gateway_markup()}
{bucket_markup()}
{outcome_markup()}
    <g class="rate-limit-request-pulses">
{pulses_markup()}
    </g>
{metrics_markup()}
{policy_markup()}
  </svg>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a standalone Critical Rate Limit Token Bucket D3/SVG pattern HTML artifact.")
    parser.add_argument("output", type=Path, help="Output HTML path.")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
