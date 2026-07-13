import test from "node:test";
import assert from "node:assert/strict";

import {
  buildParetoArchive,
  buildReflectionPlan,
  planComplementaryMerge,
} from "../skills/skill-arena-reflective-pareto-search/scripts/reflective-pareto-core.js";

function fixture() {
  return {
    benchmarkId: "toy-benchmark",
    cases: [
      { caseId: "natural", weight: 1 },
      { caseId: "boundary", weight: 1 },
      { caseId: "recovery", weight: 1 },
    ],
    candidates: [
      {
        candidateId: "baseline",
        caseScores: { natural: 0.7, boundary: 0.5, recovery: 0.5 },
        complexityDelta: 0,
        evaluationCost: 3,
        feedback: [],
      },
      {
        candidateId: "natural-specialist",
        caseScores: { natural: 0.95, boundary: 0.45, recovery: 0.55 },
        complexityDelta: 3,
        evaluationCost: 3,
        feedback: [],
      },
      {
        candidateId: "boundary-specialist",
        caseScores: { natural: 0.75, boundary: 0.9, recovery: 0.75 },
        complexityDelta: 2,
        evaluationCost: 3,
        feedback: [{
          caseId: "recovery",
          outcome: "failure",
          diagnosis: "Recovery guidance omits cleanup.",
          evidence: "Temporary files remained after the retry.",
        }],
      },
      {
        candidateId: "dominated",
        caseScores: { natural: 0.6, boundary: 0.4, recovery: 0.4 },
        complexityDelta: 5,
        evaluationCost: 3,
        feedback: [],
      },
    ],
  };
}

test("reflective Pareto search preserves complementary candidates and rejects dominated ones", () => {
  const archive = buildParetoArchive(fixture());
  assert.deepEqual(
    archive.archive.map((entry) => entry.candidateId),
    ["boundary-specialist", "natural-specialist"],
  );
  assert.deepEqual(archive.dominatedCandidateIds, ["baseline", "dominated"]);
  assert.equal(archive.robustCandidateId, "boundary-specialist");
  assert.deepEqual(archive.archive.find((entry) => entry.candidateId === "natural-specialist").ownedCases, ["natural"]);
});

test("reflective Pareto search plans a deterministic complementary merge", () => {
  const archive = buildParetoArchive(fixture());
  const merge = planComplementaryMerge(archive);
  assert.deepEqual(merge.parentIds, ["boundary-specialist", "natural-specialist"]);
  assert.deepEqual(merge.coveredCases, ["boundary", "natural", "recovery"]);
});

test("reflective Pareto search targets the weakest archive case with verified feedback", () => {
  const plan = buildReflectionPlan(fixture());
  assert.equal(plan.targetCaseId, "recovery");
  assert.equal(plan.selectedParentId, "boundary-specialist");
  assert.equal(plan.feedback.length, 1);
  assert.match(plan.reflectionTask, /verified diagnosis/);
});

test("reflective Pareto search rejects incomplete case score vectors", () => {
  const invalid = fixture();
  delete invalid.candidates[0].caseScores.recovery;
  assert.throws(() => buildParetoArchive(invalid), /Score baseline\/recovery/);
});
