#!/usr/bin/env node
// Run: node .agents/skills/d3-animated-svg/scripts/build_cardinality_variants.ts variants.json artifact.html
// Dependencies: none

import fs from "node:fs";
import path from "node:path";

const SUPPORTED_PATTERNS = new Set(["d3-force-network", "d3-beeswarm"]);

function usage() {
  console.error("Usage: node skills/d3-animated-svg/scripts/build_cardinality_variants.ts <variants.json> [artifact.html]");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kebab(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function primaryMarkForPattern(patternId) {
  if (patternId === "d3-force-network") {
    return "node";
  }
  if (patternId === "d3-beeswarm") {
    return "dot";
  }
  return null;
}

function numericRuleEquals(rule) {
  if (typeof rule === "number") {
    return rule;
  }
  if (rule && typeof rule === "object" && Number.isFinite(rule.equals)) {
    return Number(rule.equals);
  }
  return null;
}

function numericCount(variant, primaryMark) {
  const primaryEquals = numericRuleEquals(variant.marks?.[primaryMark]);
  const count = Number(variant.targetCount ?? variant.count ?? primaryEquals);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Variant ${variant.id ?? "(missing id)"} needs a positive targetCount.`);
  }
  const normalized = Math.trunc(count);
  if (!Number.isFinite(primaryEquals)) {
    throw new Error(`Variant ${variant.id} must declare marks.${primaryMark}.equals with the exact requested count copied from the prompt.`);
  }
  if (Math.trunc(primaryEquals) !== normalized) {
    throw new Error(`Variant ${variant.id} has targetCount ${normalized} but marks.${primaryMark}.equals ${primaryEquals}. Copy the same exact requested count into both fields.`);
  }
  return normalized;
}

function normalizeSpec(spec) {
  const variants = Array.isArray(spec) ? spec : spec.svgs;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("Spec must be an array or an object with a non-empty svgs array.");
  }
  return {
    title: spec.title ?? "D3 Cardinality Variants",
    subtitle: spec.subtitle ?? "Small, medium, and large SVG variants generated from deterministic inline geometry.",
    variants: variants.map((variant) => {
      if (!variant.id) {
        throw new Error("Every variant needs an exact id.");
      }
      if (!SUPPORTED_PATTERNS.has(variant.patternId)) {
        throw new Error(`Unsupported patternId for ${variant.id}: ${variant.patternId}`);
      }
      const primaryMark = primaryMarkForPattern(variant.patternId);
      return {
        ...variant,
        size: variant.size ?? "variant",
        targetCount: numericCount(variant, primaryMark),
      };
    }),
  };
}

function ringPoint(cx, cy, radius, index, count, phase = -Math.PI / 2) {
  const angle = phase + (Math.PI * 2 * index) / count;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function forceNodes(count, width, height) {
  const groups = ["core", "data", "ops", "edge"];
  const center = { x: width / 2, y: height / 2 + 4 };
  if (count <= 6) {
    return Array.from({ length: count }, (_, index) => {
      const point = index === 0 ? center : ringPoint(center.x, center.y, 78, index - 1, count - 1);
      return {
        id: `N${index + 1}`,
        group: groups[index % groups.length],
        x: point.x,
        y: point.y,
      };
    });
  }

  if (count <= 16) {
    const clusterCenters = [
      { x: width * 0.5, y: 75 },
      { x: width * 0.28, y: 185 },
      { x: width * 0.72, y: 185 },
    ];
    return Array.from({ length: count }, (_, index) => {
      const cluster = index % clusterCenters.length;
      const localIndex = Math.floor(index / clusterCenters.length);
      const localCount = Math.ceil((count - cluster) / clusterCenters.length);
      const point = ringPoint(clusterCenters[cluster].x, clusterCenters[cluster].y, 31, localIndex, localCount);
      return {
        id: `N${index + 1}`,
        group: groups[cluster],
        x: point.x,
        y: point.y,
      };
    });
  }

  const clusterCenters = [
    { x: width * 0.28, y: 83 },
    { x: width * 0.72, y: 83 },
    { x: width * 0.3, y: 203 },
    { x: width * 0.7, y: 203 },
  ];
  return Array.from({ length: count }, (_, index) => {
    const cluster = index % clusterCenters.length;
    const localIndex = Math.floor(index / clusterCenters.length);
    const localCount = Math.ceil((count - cluster) / clusterCenters.length);
    const point = ringPoint(clusterCenters[cluster].x, clusterCenters[cluster].y, count > 44 ? 28 : 35, localIndex, localCount);
    return {
      id: `N${index + 1}`,
      group: groups[cluster],
      x: point.x,
      y: point.y,
    };
  });
}

function forceLinks(nodes, minimumLinks) {
  const links = [];
  const seen = new Set();
  const targetLinks = Math.min(minimumLinks, (nodes.length * (nodes.length - 1)) / 2);
  const add = (sourceIndex, targetIndex) => {
    if (sourceIndex === targetIndex) {
      return;
    }
    const a = Math.min(sourceIndex, targetIndex);
    const b = Math.max(sourceIndex, targetIndex);
    const key = `${a}-${b}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    links.push({ source: nodes[sourceIndex], target: nodes[targetIndex] });
  };

  for (let index = 1; index < nodes.length; index += 1) {
    add(index - 1, index);
  }
  for (let index = 2; index < nodes.length && links.length < targetLinks; index += 1) {
    add(0, index);
  }
  for (let step = 2; links.length < targetLinks && step < nodes.length; step += 1) {
    for (let index = 0; index < nodes.length && links.length < targetLinks; index += 1) {
      add(index, (index + step) % nodes.length);
    }
  }
  return links;
}

function colorForGroup(group) {
  return {
    core: "#007298",
    data: "#45842a",
    ops: "#e77204",
    edge: "#652f6c",
    Baseline: "#007298",
    Pilot: "#45842a",
    Scaled: "#e77204",
  }[group] ?? "#333e48";
}

function renderForceSvg(variant) {
  const width = 360;
  const height = 280;
  const count = variant.targetCount;
  const linkMin = Number(variant.linkMin ?? variant.marks?.link?.min ?? Math.max(count, Math.round(count * 1.3)));
  const nodes = forceNodes(count, width, height);
  const links = forceLinks(nodes, linkMin);
  const labels = count <= 12 ? nodes : nodes.filter((node, index) => index % Math.ceil(count / 8) === 0);
  const radius = count > 30 ? 5.2 : count > 12 ? 6.6 : 9;

  return `
<svg id="${escapeHtml(variant.id)}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${escapeHtml(variant.id)}-title ${escapeHtml(variant.id)}-desc" data-pattern-id="d3-force-network" data-size="${escapeHtml(variant.size)}" data-target-count="${count}" font-family="Open Sans, Arial, sans-serif" xmlns="http://www.w3.org/2000/svg">
  <title id="${escapeHtml(variant.id)}-title">${escapeHtml(variant.size)} force network, ${count} nodes</title>
  <desc id="${escapeHtml(variant.id)}-desc">Deterministic force-network variant with ${count} node marks and ${links.length} link marks.</desc>
  <rect class="frame" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
  <text class="svg-heading" x="18" y="28">${escapeHtml(variant.label ?? `${variant.size} force network`)}</text>
  <text class="svg-caption" x="18" y="48">${count} nodes / ${links.length} links</text>
  <g class="links">
    ${links
      .map(
        (link, index) =>
          `<line class="link" x1="${link.source.x.toFixed(1)}" y1="${link.source.y.toFixed(1)}" x2="${link.target.x.toFixed(1)}" y2="${link.target.y.toFixed(1)}" style="--i:${index}" />`,
      )
      .join("\n    ")}
  </g>
  <g class="nodes">
    ${nodes
      .map(
        (node, index) =>
          `<g class="node ${kebab(node.group)}" transform="translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})" style="--i:${index}"><circle r="${radius}" fill="${colorForGroup(node.group)}" /><title>${escapeHtml(node.id)} ${escapeHtml(node.group)}</title></g>`,
      )
      .join("\n    ")}
  </g>
  <g class="labels">
    ${labels
      .map(
        (node, index) =>
          `<text class="label" x="${node.x.toFixed(1)}" y="${(node.y - radius - 4).toFixed(1)}" text-anchor="middle" style="--i:${index}">${escapeHtml(node.id)}</text>`,
      )
      .join("\n    ")}
  </g>
  <g class="legend" transform="translate(18 248)">
    ${["core", "data", "ops", "edge"]
      .map(
        (group, index) =>
          `<g transform="translate(${index * 78} 0)"><circle r="5" fill="${colorForGroup(group)}" /><text x="10" y="4">${escapeHtml(group)}</text></g>`,
      )
      .join("\n    ")}
  </g>
</svg>`;
}

function beeswarmData(count) {
  const groups = ["Baseline", "Pilot", "Scaled"];
  return Array.from({ length: count }, (_, index) => {
    const group = groups[index % groups.length];
    const score = 34 + ((index * 17 + group.length * 7) % 60);
    return {
      id: `O${index + 1}`,
      group,
      score,
      groupIndex: groups.indexOf(group),
    };
  });
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function renderBeeswarmSvg(variant) {
  const width = 360;
  const height = 280;
  const count = variant.targetCount;
  const data = beeswarmData(count);
  const laneY = {
    Baseline: 94,
    Pilot: 146,
    Scaled: 198,
  };
  const radius = count > 60 ? 3.4 : count > 20 ? 4.8 : 6.8;
  const dots = data.map((d, index) => {
    const laneIndex = Math.floor(index / 3);
    const stack = ((laneIndex % 7) - 3) * (count > 60 ? 4.2 : count > 20 ? 5.4 : 7.4);
    return {
      ...d,
      x: scale(d.score, 30, 96, 72, width - 26),
      y: laneY[d.group] + stack,
    };
  });
  const ticks = [30, 45, 60, 75, 90];

  return `
<svg id="${escapeHtml(variant.id)}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${escapeHtml(variant.id)}-title ${escapeHtml(variant.id)}-desc" data-pattern-id="d3-beeswarm" data-size="${escapeHtml(variant.size)}" data-target-count="${count}" font-family="Open Sans, Arial, sans-serif" xmlns="http://www.w3.org/2000/svg">
  <title id="${escapeHtml(variant.id)}-title">${escapeHtml(variant.size)} beeswarm, ${count} observations</title>
  <desc id="${escapeHtml(variant.id)}-desc">Deterministic beeswarm variant with ${count} observation dots across three lanes.</desc>
  <rect class="frame" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
  <text class="svg-heading" x="18" y="28">${escapeHtml(variant.label ?? `${variant.size} beeswarm`)}</text>
  <text class="svg-caption" x="18" y="48">${count} observations / shared score scale</text>
  <g class="axis" transform="translate(0 232)">
    <line x1="72" x2="${width - 26}" y1="0" y2="0" />
    ${ticks
      .map((tick) => {
        const x = scale(tick, 30, 96, 72, width - 26);
        return `<g transform="translate(${x.toFixed(1)} 0)"><line y2="6" /><text y="20" text-anchor="middle">${tick}</text></g>`;
      })
      .join("\n    ")}
    <text x="${width - 28}" y="40" text-anchor="end">score</text>
  </g>
  <g class="lanes">
    ${Object.entries(laneY)
      .map(
        ([group, y]) =>
          `<g><line class="lane" x1="72" x2="${width - 26}" y1="${y}" y2="${y}" /><text class="lane-label" x="18" y="${y + 4}">${escapeHtml(group)}</text></g>`,
      )
      .join("\n    ")}
  </g>
  <g class="dots">
    ${dots
      .map(
        (dot, index) =>
          `<circle class="dot ${kebab(dot.group)}" cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="${radius}" fill="${colorForGroup(dot.group)}" style="--i:${index}"><title>${escapeHtml(dot.id)} ${escapeHtml(dot.group)} score ${dot.score}</title></circle>`,
      )
      .join("\n    ")}
  </g>
</svg>`;
}

function renderVariant(variant) {
  if (variant.patternId === "d3-force-network") {
    return renderForceSvg(variant);
  }
  if (variant.patternId === "d3-beeswarm") {
    return renderBeeswarmSvg(variant);
  }
  throw new Error(`Unsupported patternId: ${variant.patternId}`);
}

function renderHtml(spec) {
  const cards = spec.variants
    .map(
      (variant) => `
      <article class="card">
        ${renderVariant(variant)}
      </article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(spec.title)}</title>
    <style>
      :root {
        --brand-neutral: #333e48;
        --blue: #007298;
        --green: #45842a;
        --orange: #e77204;
        --purple: #652f6c;
        --gray-100: #e7e7e7;
        --gray-300: #b5b5b5;
        --gray-700: #4f4f4f;
        --page: #f7f7f7;
        --white: #ffffff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--page);
        color: var(--brand-neutral);
        font-family: "Open Sans", Arial, sans-serif;
      }
      main {
        width: min(1160px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
      }
      .intro {
        margin: 8px 0 18px;
        max-width: 820px;
        color: var(--gray-700);
        line-height: 1.45;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
        gap: 16px;
      }
      .card {
        min-width: 0;
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
      }
      .frame {
        fill: var(--white);
        stroke: var(--gray-300);
      }
      .svg-heading {
        fill: var(--brand-neutral);
        font-size: 14px;
        font-weight: 700;
      }
      .svg-caption,
      .label,
      .legend text,
      .lane-label,
      .axis text {
        fill: var(--gray-700);
        font-size: 10px;
      }
      .label,
      .lane-label {
        font-weight: 700;
        paint-order: stroke;
        stroke: #ffffff;
        stroke-width: 4px;
        stroke-linejoin: round;
      }
      .link {
        stroke: #78838c;
        stroke-width: 1.2;
        opacity: 0;
        animation: fade-in 0.65s ease forwards;
        animation-delay: calc(var(--i) * 18ms);
      }
      .node,
      .dot {
        opacity: 0;
        transform-box: fill-box;
        transform-origin: center;
        animation: mark-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        animation-delay: calc(var(--i) * 14ms);
      }
      .node circle,
      .dot {
        stroke: #ffffff;
        stroke-width: 1.5;
      }
      .lane,
      .axis line {
        stroke: var(--gray-300);
        stroke-width: 1;
      }
      .axis {
        color: var(--gray-700);
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 0.72; }
      }
      @keyframes mark-in {
        from { opacity: 0; transform: scale(0.45); }
        to { opacity: 1; transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .link,
        .node,
        .dot {
          animation: none;
          opacity: 1;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(spec.title)}</h1>
      <p class="intro">${escapeHtml(spec.subtitle)}</p>
      <section class="cards" aria-label="D3 cardinality variants">
${cards}
      </section>
    </main>
  </body>
</html>
`;
}

function main() {
  const [specPath, outputArg] = process.argv.slice(2);
  if (!specPath) {
    usage();
    process.exit(2);
  }

  const spec = normalizeSpec(readJson(specPath));
  const outputPath = outputArg ?? "d3-cardinality-variants.html";
  fs.writeFileSync(outputPath, renderHtml(spec), "utf8");
  console.log(
    JSON.stringify(
      {
        file: path.resolve(outputPath),
        svgs: spec.variants.map((variant) => ({
          id: variant.id,
          patternId: variant.patternId,
          size: variant.size,
          targetCount: variant.targetCount,
        })),
      },
      null,
      2,
    ),
  );
}

main();
