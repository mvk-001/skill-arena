import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  catalogSkills,
  renderReplayReport,
  replayStrategies,
} from "../skills/skill-arena-strategy-evaluator/scripts/strategy-evaluator-core.js";

function replayFixture() {
  return {
    schemaVersion: 1,
    scenarios: [{
      scenarioId: "toy",
      subjectId: "toy-skill",
      baselineCandidateId: "baseline",
      minTraceSupport: 2,
      traces: [
        { traceId: "t1", tags: ["exact-output"] },
        { traceId: "t2", tags: ["exact-output"] },
      ],
      candidates: [
        {
          candidateId: "baseline",
          devScore: 0.6,
          holdoutScore: 0.6,
          caseScores: { natural: 0.6, boundary: 0.6 },
          operatorId: "control",
          parentFitness: 0.6,
          patchTags: [],
          complexityDelta: 0,
          evaluationCost: 2,
        },
        {
          candidateId: "scalar-winner",
          devScore: 0.9,
          holdoutScore: 0.55,
          caseScores: { natural: 0.98, boundary: 0.3 },
          operatorId: "broad",
          parentFitness: 0.6,
          patchTags: [],
          complexityDelta: 8,
          evaluationCost: 2,
        },
        {
          candidateId: "robust",
          devScore: 0.82,
          holdoutScore: 0.85,
          caseScores: { natural: 0.82, boundary: 0.82 },
          operatorId: "focused",
          parentFitness: 0.5,
          patchTags: ["exact-output"],
          complexityDelta: 2,
          evaluationCost: 2,
        },
      ],
    }],
  };
}

test("strategy evaluator replays four selection policies without holdout leakage", () => {
  const replay = replayStrategies(replayFixture());
  assert.equal(replay.results.length, 4);
  assert.equal(
    replay.results.find((entry) => entry.strategyId === "population-search").selectedCandidateId,
    "scalar-winner",
  );
  for (const strategyId of ["trace-distillation", "reflective-pareto-search", "operator-coevolution"]) {
    assert.equal(replay.results.find((entry) => entry.strategyId === strategyId).selectedCandidateId, "robust");
  }
  assert.equal(replay.aggregates.length, 4);
  assert.match(renderReplayReport(replay), /deterministic-mechanism-replay/);
});

test("strategy evaluator catalogs standalone skill bundles deterministically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-strategy-catalog-"));
  const skillDir = path.join(root, "toy-skill");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: toy-skill\ndescription: A toy.\n---\n\n# Toy\n", "utf8");
  await fs.writeFile(path.join(skillDir, "scripts", "tool.js"), "export {};\n", "utf8");
  const first = await catalogSkills(root);
  const second = await catalogSkills(root);
  assert.equal(first.skillCount, 1);
  assert.equal(first.skills[0].scripts, 1);
  assert.equal(first.digest, second.digest);
});

test("strategy evaluator rejects missing baselines", () => {
  const input = replayFixture();
  input.scenarios[0].baselineCandidateId = "missing";
  assert.throws(() => replayStrategies(input), /baselineCandidateId/);
});
