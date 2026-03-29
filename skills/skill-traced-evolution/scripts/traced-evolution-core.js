import fs from "node:fs/promises";
import path from "node:path";

export const ALLOWED_TARGET_PREFIXES = ["SKILL.md", "references/", "scripts/", "agents/openai.yaml"];
export const DEFAULT_MIN_SUPPORT = 2;

const ISSUE_PATCH_LIBRARY = {
  "missing-output-contract": {
    targetFile: "SKILL.md",
    changeType: "strengthen-rule",
    conflictGroup: "output-contract",
    summary: "Require an explicit output contract earlier in the workflow.",
  },
  "weak-baseline": {
    targetFile: "SKILL.md",
    changeType: "strengthen-rule",
    conflictGroup: "baseline-discipline",
    summary: "Protect the unchanged baseline and compare every update against it.",
  },
  "scope-drift": {
    targetFile: "SKILL.md",
    changeType: "strengthen-rule",
    conflictGroup: "scope-discipline",
    summary: "Tighten scope discipline so the benchmark stays fixed.",
  },
  "missing-holdout": {
    targetFile: "references/holdout-validation.md",
    changeType: "add-reference-rule",
    conflictGroup: "holdout-policy",
    summary: "Define holdout validation before promotion.",
  },
  "missing-trace-schema": {
    targetFile: "references/trace-schema.md",
    changeType: "add-reference-rule",
    conflictGroup: "trace-schema",
    summary: "Make the trace schema explicit before analysis.",
  },
  "shallow-error-analysis": {
    targetFile: "SKILL.md",
    changeType: "strengthen-rule",
    conflictGroup: "analysis-depth",
    summary: "Require deeper agentic analysis for recurring failures.",
  },
};

const STRENGTH_PATCH_LIBRARY = {
  "strong-scope-discipline": {
    targetFile: "SKILL.md",
    changeType: "reinforce-strength",
    conflictGroup: "scope-discipline",
    summary: "Preserve strong fixed-benchmark discipline.",
  },
  "strong-output-contract": {
    targetFile: "SKILL.md",
    changeType: "reinforce-strength",
    conflictGroup: "output-contract",
    summary: "Keep explicit output-contract guidance.",
  },
  "strong-holdout-validation": {
    targetFile: "references/holdout-validation.md",
    changeType: "reinforce-strength",
    conflictGroup: "holdout-policy",
    summary: "Preserve holdout validation before promotion.",
  },
  "strong-trace-labeling": {
    targetFile: "references/trace-schema.md",
    changeType: "reinforce-strength",
    conflictGroup: "trace-schema",
    summary: "Keep explicit success and failure trace labeling.",
  },
};

export async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

export async function readJson(jsonPath) {
  return JSON.parse(await fs.readFile(jsonPath, "utf8"));
}

export async function writeJson(jsonPath, value) {
  await ensureDirectory(path.dirname(jsonPath));
  await fs.writeFile(jsonPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export async function copyDirectory(sourceDir, destinationDir) {
  await ensureDirectory(destinationDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeTrace(trace) {
  if (!trace || typeof trace !== "object") {
    throw new Error("Trace must be a JSON object.");
  }
  const traceId = String(trace.traceId ?? "").trim();
  const outcome = String(trace.outcome ?? "").trim();
  if (!traceId) {
    throw new Error("Trace is missing traceId.");
  }
  if (outcome !== "success" && outcome !== "failure") {
    throw new Error(`Trace ${traceId} must use outcome success or failure.`);
  }
  const issues = Array.isArray(trace.issues) ? sortStrings(trace.issues.map(slugify).filter(Boolean)) : [];
  const strengths = Array.isArray(trace.strengths) ? sortStrings(trace.strengths.map(slugify).filter(Boolean)) : [];
  return {
    traceId,
    outcome,
    benchmarkId: typeof trace.benchmarkId === "string" ? trace.benchmarkId : null,
    promptId: typeof trace.promptId === "string" ? trace.promptId : null,
    issues,
    strengths,
    notes: typeof trace.notes === "string" ? trace.notes : null,
    filesTouched: Array.isArray(trace.filesTouched) ? sortStrings(trace.filesTouched.map(String)) : [],
    score: typeof trace.score === "number" ? trace.score : null,
  };
}

export function patchIdFor(kind, tag) {
  return `${kind}:${slugify(tag)}`;
}

function patchTemplateFor(kind, tag) {
  const library = kind === "issue" ? ISSUE_PATCH_LIBRARY : STRENGTH_PATCH_LIBRARY;
  return library[tag] ?? {
    targetFile: "SKILL.md",
    changeType: kind === "issue" ? "strengthen-rule" : "reinforce-strength",
    conflictGroup: `generic-${slugify(tag)}`,
    summary: kind === "issue"
      ? `Address recurring issue ${tag}.`
      : `Preserve recurring strength ${tag}.`,
  };
}

export async function initializeTraceRun({
  skillSourceDir,
  outputDir,
  benchmarkId = null,
}) {
  const runDir = path.resolve(outputDir);
  const baselineSkillDir = path.join(runDir, "baseline-skill");
  await copyDirectory(skillSourceDir, baselineSkillDir);
  await ensureDirectory(path.join(runDir, "traces"));
  await ensureDirectory(path.join(runDir, "patches"));
  await ensureDirectory(path.join(runDir, "consolidated"));

  const manifest = {
    benchmarkId,
    initializedAt: new Date().toISOString(),
    baselineSkillDir,
    tracesDir: path.join(runDir, "traces"),
    tracesImported: 0,
  };
  await writeJson(path.join(runDir, "run-manifest.json"), manifest);
  return { runDir, manifest };
}

export async function importTracePool({
  runDir,
  traceSourceDir,
}) {
  const entries = await fs.readdir(traceSourceDir, { withFileTypes: true });
  const imported = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const sourcePath = path.join(traceSourceDir, entry.name);
    const normalized = normalizeTrace(await readJson(sourcePath));
    const destinationPath = path.join(runDir, "traces", `${normalized.traceId}.json`);
    await writeJson(destinationPath, normalized);
    imported.push(normalized);
  }

  imported.sort((left, right) => left.traceId.localeCompare(right.traceId));
  const pool = {
    importedAt: new Date().toISOString(),
    traces: imported,
    counts: {
      total: imported.length,
      successes: imported.filter((trace) => trace.outcome === "success").length,
      failures: imported.filter((trace) => trace.outcome === "failure").length,
    },
  };
  await writeJson(path.join(runDir, "trace-pool.json"), pool);

  const manifest = await readJson(path.join(runDir, "run-manifest.json"));
  manifest.tracesImported = imported.length;
  await writeJson(path.join(runDir, "run-manifest.json"), manifest);
  return pool;
}

export function proposalsFromTrace(trace) {
  const proposals = [];

  for (const issue of trace.issues) {
    const template = patchTemplateFor("issue", issue);
    proposals.push({
      patchId: patchIdFor("issue", issue),
      evidenceKind: "failure",
      sourceTraceId: trace.traceId,
      sourceOutcome: trace.outcome,
      tag: issue,
      ...template,
    });
  }

  for (const strength of trace.strengths) {
    const template = patchTemplateFor("strength", strength);
    proposals.push({
      patchId: patchIdFor("strength", strength),
      evidenceKind: "success",
      sourceTraceId: trace.traceId,
      sourceOutcome: trace.outcome,
      tag: strength,
      ...template,
    });
  }

  proposals.sort((left, right) => left.patchId.localeCompare(right.patchId));
  return proposals;
}

export async function proposePatches(runDir) {
  const pool = await readJson(path.join(runDir, "trace-pool.json"));
  const proposals = [];
  for (const trace of pool.traces) {
    proposals.push(...proposalsFromTrace(trace));
  }

  const proposalState = {
    proposedAt: new Date().toISOString(),
    proposalCount: proposals.length,
    proposals,
  };
  await writeJson(path.join(runDir, "patches", "proposals.json"), proposalState);
  return proposalState;
}

export function aggregatePatchSupport(proposals) {
  const grouped = new Map();
  for (const proposal of proposals) {
    const existing = grouped.get(proposal.patchId) ?? {
      patchId: proposal.patchId,
      targetFile: proposal.targetFile,
      changeType: proposal.changeType,
      conflictGroup: proposal.conflictGroup,
      summary: proposal.summary,
      evidenceKinds: new Set(),
      supportingTraces: new Set(),
      support: 0,
    };
    existing.evidenceKinds.add(proposal.evidenceKind);
    existing.supportingTraces.add(proposal.sourceTraceId);
    existing.support = existing.supportingTraces.size;
    grouped.set(proposal.patchId, existing);
  }

  return [...grouped.values()].map((entry) => {
    const evidenceKinds = sortStrings(entry.evidenceKinds);
    return {
      patchId: entry.patchId,
      targetFile: entry.targetFile,
      changeType: entry.changeType,
      conflictGroup: entry.conflictGroup,
      summary: entry.summary,
      support: entry.support,
      evidenceKinds,
      supportingTraces: sortStrings(entry.supportingTraces),
      supportClass: evidenceKinds.length > 1 ? "combined" : (evidenceKinds[0] ?? "unknown"),
    };
  });
}

function isAllowedTargetFile(targetFile) {
  return ALLOWED_TARGET_PREFIXES.some((prefix) => targetFile === prefix || targetFile.startsWith(prefix));
}

export function consolidateAggregatedPatches(aggregatedPatches, minSupport = DEFAULT_MIN_SUPPORT) {
  const eligible = aggregatedPatches
    .filter((patch) => patch.support >= minSupport)
    .sort((left, right) => {
      if (right.support !== left.support) {
        return right.support - left.support;
      }
      if (left.supportClass !== right.supportClass) {
        if (left.supportClass === "combined") {
          return -1;
        }
        if (right.supportClass === "combined") {
          return 1;
        }
      }
      return left.patchId.localeCompare(right.patchId);
    });

  const accepted = [];
  const rejected = [];
  const winningConflictGroups = new Map();

  for (const patch of eligible) {
    if (!isAllowedTargetFile(patch.targetFile)) {
      rejected.push({ patchId: patch.patchId, reason: "target-out-of-scope" });
      continue;
    }
    const currentWinner = winningConflictGroups.get(patch.conflictGroup);
    if (!currentWinner) {
      winningConflictGroups.set(patch.conflictGroup, patch);
      accepted.push(patch);
      continue;
    }
    rejected.push({
      patchId: patch.patchId,
      reason: "conflict-lost",
      conflictGroup: patch.conflictGroup,
      winner: currentWinner.patchId,
    });
  }

  accepted.sort((left, right) => left.patchId.localeCompare(right.patchId));
  rejected.sort((left, right) => left.patchId.localeCompare(right.patchId));
  return { accepted, rejected };
}

export async function consolidatePatches({
  runDir,
  minSupport = DEFAULT_MIN_SUPPORT,
}) {
  const proposalState = await readJson(path.join(runDir, "patches", "proposals.json"));
  const aggregated = aggregatePatchSupport(proposalState.proposals);
  const { accepted, rejected } = consolidateAggregatedPatches(aggregated, minSupport);
  const state = {
    consolidatedAt: new Date().toISOString(),
    minSupport,
    aggregated,
    accepted,
    rejected,
  };
  await writeJson(path.join(runDir, "consolidated", "consolidated-patches.json"), state);
  return state;
}

export async function validateConsolidation(runDir) {
  const state = await readJson(path.join(runDir, "consolidated", "consolidated-patches.json"));
  const violations = [];
  for (const patch of state.accepted) {
    if (!isAllowedTargetFile(patch.targetFile)) {
      violations.push({
        patchId: patch.patchId,
        reason: "target-out-of-scope",
        targetFile: patch.targetFile,
      });
    }
  }

  const conflictGroups = new Set();
  for (const patch of state.accepted) {
    if (conflictGroups.has(patch.conflictGroup)) {
      violations.push({
        patchId: patch.patchId,
        reason: "duplicate-conflict-group",
        conflictGroup: patch.conflictGroup,
      });
    }
    conflictGroups.add(patch.conflictGroup);
  }

  const validation = {
    validatedAt: new Date().toISOString(),
    acceptedPatchCount: state.accepted.length,
    violations,
    valid: violations.length === 0,
  };
  await writeJson(path.join(runDir, "consolidated", "validation.json"), validation);
  return validation;
}

export function parseFlagArguments(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      parsed.set(key, true);
      continue;
    }
    parsed.set(key, nextToken);
    index += 1;
  }
  return parsed;
}

export function requireFlag(flags, key) {
  const value = flags.get(key);
  if (value === undefined || value === true || value === "") {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}
