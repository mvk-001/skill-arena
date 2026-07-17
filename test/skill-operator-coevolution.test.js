import test from "node:test";
import assert from "node:assert/strict";

import {
  breedOperatorPlans,
  rankCoevolution,
} from "../skills/skill-arena-operator-coevolution/scripts/operator-coevolution-core.js";

function fixture() {
  return {
    generationId: "generation-001",
    operators: [
      { operatorId: "op-a", instruction: "Tighten the output contract." },
      { operatorId: "op-b", instruction: "Add broad examples." },
      { operatorId: "op-c", instruction: "Simplify the core workflow." },
    ],
    candidates: [
      { candidateId: "a1", operatorId: "op-a", parentFitness: 0.5, fitness: 0.8, hardGatesPassed: true, complexityDelta: 2 },
      { candidateId: "a2", operatorId: "op-a", parentFitness: 0.6, fitness: 0.75, hardGatesPassed: true, complexityDelta: 1 },
      { candidateId: "b1", operatorId: "op-b", parentFitness: 0.8, fitness: 0.82, hardGatesPassed: true, complexityDelta: 8 },
      { candidateId: "b2", operatorId: "op-b", parentFitness: 0.7, fitness: 0.95, hardGatesPassed: false, complexityDelta: 8 },
      { candidateId: "c1", operatorId: "op-c", parentFitness: 0.7, fitness: 0.82, hardGatesPassed: true, complexityDelta: -2 },
    ],
  };
}

test("operator coevolution assigns credit from parent-to-child improvement", () => {
  const ranking = rankCoevolution(fixture());
  assert.equal(ranking.operatorRanking[0].operatorId, "op-a");
  assert.equal(ranking.operatorRanking[0].trialCount, 2);
  assert.equal(ranking.operatorRanking[0].established, true);
  assert.equal(ranking.operatorRanking.at(-1).operatorId, "op-b");
  assert.equal(ranking.candidateRanking[0].candidateId, "c1");
  assert.equal(ranking.candidateRanking.find((entry) => entry.candidateId === "b2").fitness, 0);
});

test("operator coevolution creates deterministic survivor, mutation, and crossover plans", () => {
  const input = fixture();
  const ranking = rankCoevolution(input);
  const plans = breedOperatorPlans(input, ranking, 6);
  assert.equal(plans.operators.length, 6);
  assert.deepEqual(plans.operators.slice(0, 2).map((entry) => entry.origin), ["survivor", "survivor"]);
  assert.equal(plans.operators[2].origin, "mutation-plan");
  assert.equal(plans.operators[3].origin, "crossover-plan");
  assert.deepEqual(plans.operators[3].parentOperatorIds, ["op-c", "op-a"]);
});

test("operator coevolution rejects candidates referencing unknown operators", () => {
  const input = fixture();
  input.candidates[0].operatorId = "missing";
  assert.throws(() => rankCoevolution(input), /declared operatorId/);
});

test("operator coevolution does not penalize the highest-fitness child for a weak parent", () => {
  const input = {
    generationId: "generation-plateau",
    operators: [
      { operatorId: "balanced", instruction: "Preserve case balance." },
      { operatorId: "evolved", instruction: "Apply the evolved mutation." },
    ],
    candidates: [
      { candidateId: "pareto-balanced", operatorId: "balanced", parentFitness: 0.70, fitness: 0.87, complexityDelta: 5 },
      { candidateId: "operator-child-a", operatorId: "evolved", parentFitness: 0.35, fitness: 0.89, complexityDelta: 6 },
      { candidateId: "operator-child-b", operatorId: "evolved", parentFitness: 0.40, fitness: 0.86, complexityDelta: 4 },
    ],
  };
  const ranking = rankCoevolution(input);
  assert.equal(ranking.candidateRanking[0].candidateId, "operator-child-a");
  assert.equal(ranking.operatorRanking[0].operatorId, "evolved");
});
