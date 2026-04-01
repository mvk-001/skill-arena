import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  consolidatePatches,
  importTracePool,
  initializeTraceRun,
  proposePatches,
  validateConsolidation,
} from "../skills/skill-arena-traced-evolution/scripts/traced-evolution-core.js";

async function createToySkill(rootDir) {
  const skillDir = path.join(rootDir, "toy-skill");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: toy-skill",
      "description: Toy skill for traced evolution tests.",
      "---",
      "",
      "# Toy Skill",
      "",
      "Use this toy skill for traced evolution tests.",
      "",
    ].join("\n"),
    "utf8",
  );
  return skillDir;
}

async function createTraceDirectory(rootDir) {
  const traceDir = path.join(rootDir, "traces");
  await fs.mkdir(traceDir, { recursive: true });
  const traces = [
    {
      traceId: "trace-01",
      outcome: "failure",
      issues: ["missing-output-contract", "scope-drift"],
      strengths: [],
    },
    {
      traceId: "trace-02",
      outcome: "failure",
      issues: ["missing-output-contract", "weak-baseline"],
      strengths: [],
    },
    {
      traceId: "trace-03",
      outcome: "success",
      issues: [],
      strengths: ["strong-output-contract", "strong-scope-discipline", "strong-holdout-validation"],
    },
    {
      traceId: "trace-04",
      outcome: "success",
      issues: [],
      strengths: ["strong-output-contract", "strong-holdout-validation", "strong-scope-discipline"],
    },
  ];
  await Promise.all(traces.map((trace) => fs.writeFile(
    path.join(traceDir, `${trace.traceId}.json`),
    JSON.stringify(trace, null, 2),
    "utf8",
  )));
  return traceDir;
}

test("skill-arena-traced-evolution initializes a trace run and imports normalized traces", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-traced-init-"));
  const skillDir = await createToySkill(tempDir);
  const traceDir = await createTraceDirectory(tempDir);
  const runDir = path.join(tempDir, "run");

  const { manifest } = await initializeTraceRun({
    skillSourceDir: skillDir,
    outputDir: runDir,
    benchmarkId: "toy-benchmark",
  });
  assert.equal(manifest.benchmarkId, "toy-benchmark");
  await assert.doesNotReject(() => fs.access(path.join(runDir, "baseline-skill", "SKILL.md")));

  const pool = await importTracePool({ runDir, traceSourceDir: traceDir });
  assert.equal(pool.counts.total, 4);
  assert.equal(pool.counts.successes, 2);
  assert.equal(pool.counts.failures, 2);
});

test("skill-arena-traced-evolution proposes patches from success and failure traces", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-traced-propose-"));
  const skillDir = await createToySkill(tempDir);
  const traceDir = await createTraceDirectory(tempDir);
  const runDir = path.join(tempDir, "run");

  await initializeTraceRun({ skillSourceDir: skillDir, outputDir: runDir });
  await importTracePool({ runDir, traceSourceDir: traceDir });
  const proposalState = await proposePatches(runDir);

  assert.equal(proposalState.proposalCount, 10);
  assert.equal(proposalState.proposals[0].sourceTraceId, "trace-01");
  assert.match(JSON.stringify(proposalState.proposals), /issue:missing-output-contract/);
  assert.match(JSON.stringify(proposalState.proposals), /strength:strong-output-contract/);
});

test("skill-arena-traced-evolution consolidates by prevalence and validates accepted patches", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-traced-consolidate-"));
  const skillDir = await createToySkill(tempDir);
  const traceDir = await createTraceDirectory(tempDir);
  const runDir = path.join(tempDir, "run");

  await initializeTraceRun({ skillSourceDir: skillDir, outputDir: runDir });
  await importTracePool({ runDir, traceSourceDir: traceDir });
  await proposePatches(runDir);
  const consolidation = await consolidatePatches({ runDir, minSupport: 2 });

  assert.deepEqual(
    consolidation.accepted.map((patch) => patch.patchId),
    ["issue:missing-output-contract", "strength:strong-holdout-validation", "strength:strong-scope-discipline"],
  );
  assert.ok(consolidation.rejected.some((entry) => entry.reason === "conflict-lost"));

  const validation = await validateConsolidation(runDir);
  assert.equal(validation.valid, true);
  assert.equal(validation.acceptedPatchCount, 3);
});
