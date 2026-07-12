#!/usr/bin/env node
// Run: node .agents/skills/d3-animated-svg/scripts/check_svg_contract.ts artifact.html svg-contract.json
// Dependencies: none

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: node skills/d3-animated-svg/scripts/check_svg_contract.ts <artifact.html> <contract.json>");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseAttributes(tag) {
  const attrs = {};
  const attrPattern = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = attrPattern.exec(tag)) !== null) {
    attrs[match[1]] = match[3];
  }
  return attrs;
}

function extractSvg(html, id) {
  const idPattern = escapeRegex(id);
  const pattern = new RegExp(`<svg\\b(?=[^>]*\\bid\\s*=\\s*["']${idPattern}["'])[^>]*>[\\s\\S]*?<\\/svg>`, "i");
  const match = html.match(pattern);
  if (!match) {
    return null;
  }
  const openTag = match[0].match(/<svg\b[^>]*>/i)?.[0] ?? "";
  return {
    markup: match[0],
    attrs: parseAttributes(openTag),
  };
}

function countClass(markup, className) {
  let count = 0;
  const classPattern = /\bclass\s*=\s*(["'])(.*?)\1/gis;
  let match;
  while ((match = classPattern.exec(markup)) !== null) {
    const classes = match[2].trim().split(/\s+/);
    if (classes.includes(className)) {
      count += 1;
    }
  }
  return count;
}

function totalElementCount(markup) {
  return (markup.match(/<([a-z][\w:-]*)\b/gi) ?? []).length;
}

function checkNumericRule(actual, rule, label, findings) {
  if (typeof rule === "number") {
    if (actual !== rule) {
      findings.push(`${label}: expected ${rule}, found ${actual}.`);
    }
    return;
  }

  if (!rule || typeof rule !== "object") {
    return;
  }

  if (Number.isFinite(rule.equals) && actual !== rule.equals) {
    findings.push(`${label}: expected exactly ${rule.equals}, found ${actual}.`);
  }
  if (Number.isFinite(rule.min) && actual < rule.min) {
    findings.push(`${label}: expected at least ${rule.min}, found ${actual}.`);
  }
  if (Number.isFinite(rule.max) && actual > rule.max) {
    findings.push(`${label}: expected at most ${rule.max}, found ${actual}.`);
  }
}

function hasTitle(markup) {
  return /<title\b[^>]*>[\s\S]*?<\/title>/i.test(markup);
}

function hasDesc(markup) {
  return /<desc\b[^>]*>[\s\S]*?<\/desc>/i.test(markup);
}

function hasFont(markup, html) {
  return /font-family/i.test(markup) || /svg(?:\s+[^{]+)?\s*\{[\s\S]*?font-family/i.test(html) || /svg\s+text\s*\{[\s\S]*?font-family/i.test(html);
}

function hasRemoteReference(html) {
  const withoutSvgNamespace = html.replace(/https?:\/\/www\.w3\.org\/2000\/svg/gi, "");
  return /https?:\/\//i.test(withoutSvgNamespace) || /<script\b[^>]*\bsrc\s*=/i.test(html) || /@import\s+/i.test(html);
}

function normalizeSvgs(contract) {
  if (Array.isArray(contract)) {
    return contract;
  }
  if (Array.isArray(contract.svgs)) {
    return contract.svgs;
  }
  throw new Error("Contract must be an array or an object with a svgs array.");
}

function main() {
  const [artifactPath, contractPath] = process.argv.slice(2);
  if (!artifactPath || !contractPath) {
    usage();
    process.exit(2);
  }

  const html = fs.readFileSync(artifactPath, "utf8");
  const contract = readJson(contractPath);
  const svgs = normalizeSvgs(contract);
  const findings = [];
  const summaries = [];
  const svgSummaries = new Map();

  if (contract.forbidRemote !== false && hasRemoteReference(html)) {
    findings.push("Artifact contains a remote URL, external script source, or CSS import.");
  }

  if (contract.requireReducedMotion !== false && !/prefers-reduced-motion/i.test(html)) {
    findings.push("Missing prefers-reduced-motion fallback.");
  }

  for (const expected of svgs) {
    if (!expected.id) {
      findings.push("A contract SVG entry is missing id.");
      continue;
    }

    const svg = extractSvg(html, expected.id);
    if (!svg) {
      findings.push(`Missing svg#${expected.id}.`);
      continue;
    }

    const summary = {
      id: expected.id,
      patternId: svg.attrs["data-pattern-id"] ?? null,
      size: svg.attrs["data-size"] ?? null,
      targetCount: svg.attrs["data-target-count"] ?? null,
      marks: {},
      elements: totalElementCount(svg.markup),
    };

    if (!svg.attrs.viewBox) {
      findings.push(`svg#${expected.id}: missing viewBox.`);
    }
    if (expected.requireTitle !== false && !hasTitle(svg.markup)) {
      findings.push(`svg#${expected.id}: missing title.`);
    }
    if (expected.requireDesc !== false && !hasDesc(svg.markup)) {
      findings.push(`svg#${expected.id}: missing desc.`);
    }
    if (expected.requireFont !== false && !hasFont(svg.markup, html)) {
      findings.push(`svg#${expected.id}: missing visible font-family rule.`);
    }
    if (expected.patternId && svg.attrs["data-pattern-id"] !== expected.patternId) {
      findings.push(`svg#${expected.id}: expected data-pattern-id="${expected.patternId}", found "${svg.attrs["data-pattern-id"] ?? ""}".`);
    }
    if (expected.size && svg.attrs["data-size"] !== expected.size) {
      findings.push(`svg#${expected.id}: expected data-size="${expected.size}", found "${svg.attrs["data-size"] ?? ""}".`);
    }
    if (Number.isFinite(expected.targetCount) && Number(svg.attrs["data-target-count"]) !== expected.targetCount) {
      findings.push(`svg#${expected.id}: expected data-target-count="${expected.targetCount}", found "${svg.attrs["data-target-count"] ?? ""}".`);
    }

    for (const [className, rule] of Object.entries(expected.marks ?? {})) {
      const actual = countClass(svg.markup, className);
      summary.marks[className] = actual;
      checkNumericRule(actual, rule, `svg#${expected.id} .${className}`, findings);
    }

    summaries.push(summary);
    svgSummaries.set(expected.id, summary);
  }

  for (const monotonic of contract.monotonic ?? []) {
    const ids = monotonic.ids ?? [];
    const mark = monotonic.mark;
    if (!mark || ids.length < 2) {
      continue;
    }
    const counts = ids.map((id) => svgSummaries.get(id)?.marks?.[mark]);
    if (counts.some((count) => !Number.isFinite(count))) {
      findings.push(`Monotonic check for .${mark} could not run because at least one SVG is missing a count.`);
      continue;
    }
    for (let index = 1; index < counts.length; index += 1) {
      if (counts[index] <= counts[index - 1]) {
        findings.push(`Monotonic check for .${mark} failed across ${ids.join(", ")}: ${counts.join(", ")}.`);
        break;
      }
    }
  }

  const result = {
    file: path.resolve(artifactPath),
    passed: findings.length === 0,
    summaries,
    findings,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

main();
