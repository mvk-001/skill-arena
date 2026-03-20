#!/usr/bin/env node

import fs from "node:fs";

const args = process.argv.slice(2);
const targetPath = args.find((arg) => !arg.startsWith("--"));
const benchmarkId = readOption(args, "--benchmark");

if (!targetPath) {
  console.error("Usage: node scripts/validate-compare-output.js <compare.yaml> [--benchmark <id>]");
  process.exit(1);
}

const text = fs.readFileSync(targetPath, "utf8").replace(/\r\n/g, "\n");
const errors = [];

validateGenericCompare(text, errors);

if (benchmarkId === "skill-arena-compare") {
  validateSkillArenaCompareBenchmark(text, errors);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(
  benchmarkId === "skill-arena-compare"
    ? "compare.yaml matches the skill-arena-compare benchmark contract"
    : "compare.yaml structure looks valid",
);

function readOption(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function validateGenericCompare(normalized, outputErrors) {
  const requiredPatterns = [
    /^schemaVersion:\s*1\s*$/m,
    /^benchmark:\s*$/m,
    /^task:\s*$/m,
    /^\s+prompts:\s*$/m,
    /^workspace:\s*$/m,
    /^evaluation:\s*$/m,
    /^\s+assertions:\s*$/m,
    /^comparison:\s*$/m,
    /^\s+profiles:\s*$/m,
    /^\s+variants:\s*$/m,
    /^\s+inheritSystem:\s+false\s*$/m,
    /^\s+executionMethod:\s+/m,
    /^\s+commandPath:\s+/m,
  ];

  const forbiddenPatterns = [
    /^\s*```[A-Za-z0-9-]*\s*$/m,
    /^profiles:\s*$/m,
    /^variants:\s*$/m,
    /^\s+execution:\s*$/m,
    /^\s+sandbox:\s+/m,
    /^\s+approval:\s+/m,
    /^\s+webSearch:\s+/m,
    /^\s+networkAccess:\s+/m,
    /^\s+network:\s+/m,
    /^\s+allowNetwork:\s+/m,
    /^\s+disabled:\s+(true|false)\s*$/m,
    /^\s+shared:\s*$/m,
    /^\s+-\s+local-path:\s*$/m,
    /type:\s+is-markdown\b/,
  ];

  if (!normalized.trimStart().startsWith("schemaVersion: 1")) {
    outputErrors.push("File must start with `schemaVersion: 1`.");
  }

  const topLevelKeys = Array.from(
    normalized.matchAll(/^([A-Za-z][A-Za-z0-9-]*):/gm),
    (match) => match[1],
  );

  if (
    JSON.stringify(topLevelKeys) !==
    JSON.stringify(["schemaVersion", "benchmark", "task", "workspace", "evaluation", "comparison"])
  ) {
    outputErrors.push(
      `Top-level keys must be exactly schemaVersion, benchmark, task, workspace, evaluation, comparison. Saw: ${JSON.stringify(topLevelKeys)}`,
    );
  }

  if ((normalized.match(/^\s+- id:\s+/gm) ?? []).length < 3) {
    outputErrors.push("Expected at least one prompt id and ids for the compare sections.");
  }

  for (const pattern of requiredPatterns) {
    if (!pattern.test(normalized)) {
      outputErrors.push(`Missing required pattern: ${pattern}`);
    }
  }

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(normalized)) {
      outputErrors.push(`Found forbidden pattern: ${pattern}`);
    }
  }
}

function validateSkillArenaCompareBenchmark(normalized, outputErrors) {
  const requiredPatterns = [
    /^  id:\s+gws-calendar-agenda-compare-generated\s*$/m,
    /^  description:\s+Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill\.\s*$/m,
    /^\s+- compare\s*$/m,
    /^\s+- calendar\s*$/m,
    /^\s+- gws\s*$/m,
    /^\s+- codex\s*$/m,
    /^\s+- id:\s+today-json\s*$/m,
    /^\s+- id:\s+week-markdown\s*$/m,
    /^workspace:\n  sources:\n    - (?:id: [^\n]+\n      )?type: local-path\n      path: fixtures\/gws-calendar-agenda-compare\/base\n      target: \/\n  setup:\n    initializeGit: true/m,
    /^\s+provider:\s+skill-arena:judge:codex\s*$/m,
    /^\s+requests:\s+2\s*$/m,
    /^\s+timeoutMs:\s+1200000\s*$/m,
    /^\s+maxConcurrency:\s+1\s*$/m,
    /^\s+capabilities:\s+\{\}\s*$/m,
    /^\s+skills:\s*$/m,
    /^\s+type:\s+git\s*$/m,
    /^\s+repo:\s+https:\/\/github\.com\/googleworkspace\/cli\.git\s*$/m,
    /^\s+ref:\s+main\s*$/m,
    /^\s+subpath:\s+\.\s*$/m,
    /^\s+skillPath:\s+skills\/gws-calendar-agenda\s*$/m,
    /^\s+skillId:\s+gws-calendar-agenda\s*$/m,
    /^\s+strategy:\s+workspace-overlay\s*$/m,
    /^\s+adapter:\s+codex\s*$/m,
    /^\s+model:\s+gpt-5\.1-codex-mini\s*$/m,
    /^\s+executionMethod:\s+command\s*$/m,
    /^\s+commandPath:\s+codex\s*$/m,
    /^\s+sandboxMode:\s+danger-full-access\s*$/m,
    /^\s+approvalPolicy:\s+never\s*$/m,
    /^\s+webSearchEnabled:\s+false\s*$/m,
    /^\s+networkAccessEnabled:\s+true\s*$/m,
    /^\s+reasoningEffort:\s+low\s*$/m,
    /^\s+variantDisplayName:\s+codex mini\s*$/m,
  ];

  const blockerPatterns = [
    /CreateProcessWithLogonW failed:/i,
    /\bI(?: am|['’]m)? stuck\b/i,
    /\bhelp unblock the environment\b/i,
    /\bprovide the relevant brief\b/i,
    /\bshell access\b/i,
  ];

  const invalidPatterns = [
    /^workspace:\n  fixture:/m,
    /^benchmarks:\s*$/m,
    /^tasks:\s*$/m,
    /^profiles:\s*$/m,
    /^variants:\s*$/m,
    /^\s+execution:\s*$/m,
    /^\s+sandbox:\s+/m,
    /^\s+webSearch:\s+/m,
    /^\s+networkAccess:\s+/m,
    /^\s+allowNetwork:\s+/m,
    /^\s+disabled:\s+(true|false)\s*$/m,
    /^\s+instructions:\s*$/m,
    /^\s+template:\s*$/m,
    /type:\s+is-markdown\b/,
  ];

  const todayBlock = normalized.match(/^\s+- id: today-json\s*\n([\s\S]*?)(?=^\s+- id: week-markdown\s*$)/m)?.[1] ?? "";
  const weekBlock = normalized.match(/^\s+- id: week-markdown\s*\n([\s\S]*?)(?=^workspace:\s*$)/m)?.[1] ?? "";

  for (const pattern of requiredPatterns) {
    if (!pattern.test(normalized)) {
      outputErrors.push(`Benchmark-specific requirement missing: ${pattern}`);
    }
  }

  if (!/gws calendar \+agenda/.test(todayBlock) || !/read-only/i.test(todayBlock) || !/JSON only/.test(todayBlock)) {
    outputErrors.push("`today-json` must mention `gws calendar +agenda`, read-only mode, and `JSON only`.");
  }

  if (!/gws calendar \+agenda/.test(weekBlock) || !/read-only/i.test(weekBlock) || !/Markdown only/.test(weekBlock)) {
    outputErrors.push("`week-markdown` must mention `gws calendar +agenda`, read-only mode, and `Markdown only`.");
  }

  if (!/type:\s+is-json\b/.test(todayBlock)) {
    outputErrors.push("`today-json` prompt block must include `type: is-json`.");
  }

  if (!/type:\s+regex\b/.test(weekBlock)) {
    outputErrors.push("`week-markdown` prompt block must include a `type: regex` assertion.");
  }

  if (/type:\s+is-json\b/.test(weekBlock)) {
    outputErrors.push("`week-markdown` prompt block must not include `type: is-json`.");
  }

  const promptIds = normalized.match(/^\s+- id:\s+(today-json|week-markdown)\s*$/gm) ?? [];
  if (promptIds.length !== 2) {
    outputErrors.push("Expected exactly two generated prompt ids: `today-json` and `week-markdown`.");
  }

  for (const pattern of blockerPatterns) {
    if (pattern.test(normalized)) {
      outputErrors.push(`Output still looks like a blocker message: ${pattern}`);
    }
  }

  for (const pattern of invalidPatterns) {
    if (pattern.test(normalized)) {
      outputErrors.push(`Benchmark-specific forbidden pattern found: ${pattern}`);
    }
  }
}
