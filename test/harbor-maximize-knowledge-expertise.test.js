import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-maximize-knowledge-expertise",
  "scripts",
  "plan_knowledge_expertise.py",
);
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const pythonAvailable = spawnSync(python, ["--version"], { encoding: "utf8" }).status === 0;

function run(...args) {
  return spawnSync(python, [script, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
}

function succeeded(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function failed(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, pattern);
}

function digest(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-knowledge-expertise-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const skill = path.join(root, "knowledge-expert");
  await fs.mkdir(path.join(skill, "scripts"), { recursive: true });
  await fs.mkdir(path.join(skill, "references"), { recursive: true });
  await fs.writeFile(path.join(skill, "SKILL.md"), [
    "---",
    "name: knowledge-expert",
    "description: Test knowledge expert.",
    "---",
    "",
    "# Knowledge Expert",
    "",
    "Use exact bundled evidence.",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(skill, "scripts", "search.py"), "print('ok')\n", "utf8");
  const evidence = path.join(root, "evidence", "development-archive.json");
  const evidenceBytes = Buffer.from('{"state":"development-only","cases":5}\n');
  await fs.mkdir(path.dirname(evidence), { recursive: true });
  await fs.writeFile(evidence, evidenceBytes);
  const target = succeeded(run("digest", skill));
  const configPath = path.join(root, "campaign.json");
  const outputPath = path.join(root, "plans", "generation-001.json");
  const config = {
    schemaVersion: 1,
    campaign: {
      id: "knowledge-expert-generation-001",
      targetSkill: "knowledge-expert",
      expectedTargetTreeSha256: target.treeSha256,
      outputPath: "plans/generation-001.json",
      developmentEvidence: [
        {
          id: "development-archive",
          role: "development",
          path: "evidence/development-archive.json",
          sha256: digest(evidenceBytes),
          sanitized: true,
        },
      ],
      expertiseDimensions: [
        {
          id: "ranking-discrimination",
          objective: "maximize",
          priority: 5,
          metricKeys: ["ndcg_at_10", "mrr_at_10"],
        },
        {
          id: "evidence-fidelity",
          objective: "hard-gate",
          priority: 5,
          metricKeys: ["evidence_contract_gate"],
        },
        {
          id: "robustness",
          objective: "hard-gate",
          priority: 5,
          metricKeys: ["case_non_regression"],
        },
        {
          id: "efficiency",
          objective: "minimize",
          priority: 3,
          metricKeys: ["p95_latency_ms"],
        },
      ],
      gaps: [
        {
          id: "late-authority",
          failureMode: "relevant-evidence-late",
          severity: 0.9,
          dimensionIds: ["ranking-discrimination"],
          evidenceIds: ["development-archive"],
          caseIds: ["case-01", "case-02"],
        },
        {
          id: "rank-conflict",
          failureMode: "ranking-disagreement",
          severity: 0.7,
          dimensionIds: ["ranking-discrimination", "robustness"],
          evidenceIds: ["development-archive"],
          caseIds: ["case-03"],
        },
        {
          id: "latency-pressure",
          failureMode: "latency-budget-pressure",
          severity: 0.4,
          dimensionIds: ["efficiency"],
          evidenceIds: ["development-archive"],
          caseIds: ["case-04"],
        },
      ],
      portfolio: {
        minimumOperators: 4,
        maximumOperators: 6,
        includeConservative: true,
      },
      evaluation: {
        developmentSplitId: "development-v1",
        selectionMechanism: "harbor-reflective-pareto-search",
        requiredRewardKeys: [
          "evidence_contract_gate",
          "mechanical_qualification_gate",
        ],
        allowCaseRegressions: false,
        minimumOperatorTrials: 2,
        holdout: {
          status: "unavailable",
          splitId: null,
        },
      },
    },
  };
  await writeJson(configPath, config);
  return {
    root,
    skill,
    evidence,
    config,
    configPath,
    outputPath,
  };
}

test("plans and verifies a deterministic multi-family expertise portfolio", {
  skip: !pythonAvailable,
}, async (t) => {
  const fixture = await createFixture(t);
  const planned = succeeded(run("plan", fixture.configPath));
  assert.equal(planned.mode, "planned");
  assert.equal(planned.operatorCount, 4);
  const plan = JSON.parse(await fs.readFile(fixture.outputPath, "utf8"));
  assert.equal(plan.state, "planned-fitness-unverified");
  assert.equal(plan.target.logicalName, "knowledge-expert");
  assert.equal(plan.target.treeSha256, fixture.config.campaign.expectedTargetTreeSha256);
  assert.equal(plan.developmentEvidence[0].sha256, fixture.config.campaign.developmentEvidence[0].sha256);
  assert.deepEqual(
    plan.portfolio.operators.map(({ operatorId }) => operatorId),
    [
      "conservative-regression-gate",
      "early-rank-calibration",
      "confidence-gated-fusion",
      "cost-aware-signal-routing",
    ],
  );
  assert.ok(new Set(plan.portfolio.operators.map(({ family }) => family)).size >= 2);
  assert.equal(plan.evaluationHandoff.promotionEligible, false);
  assert.equal(plan.evaluationHandoff.claimScope, "retrospective-development-only");
  assert.equal(plan.boundaries.harborCalls, 0);
  assert.equal(plan.boundaries.modelCalls, 0);
  assert.equal(plan.boundaries.candidateFitnessEvaluated, false);
  assert.equal(plan.boundaries.operatorInstructionsContainCaseIds, false);
  for (const operator of plan.portfolio.operators) {
    for (const caseId of operator.caseIds) {
      assert.doesNotMatch(operator.instruction, new RegExp(caseId, "i"));
    }
  }
  assert.equal(succeeded(run("verify", fixture.configPath)).planSha256, plan.planSha256);
  failed(run("plan", fixture.configPath), /refusing to overwrite existing plan/i);
});

test("verification fails closed on target, evidence, or plan drift", {
  skip: !pythonAvailable,
}, async (t) => {
  const fixture = await createFixture(t);
  succeeded(run("plan", fixture.configPath));
  await fs.appendFile(path.join(fixture.skill, "SKILL.md"), "\nDrift.\n", "utf8");
  failed(run("verify", fixture.configPath), /target skill tree digest mismatch/i);

  const restored = await createFixture(t);
  succeeded(run("plan", restored.configPath));
  await fs.appendFile(restored.evidence, "drift\n", "utf8");
  failed(run("verify", restored.configPath), /development evidence .* digest mismatch/i);

  const planDrift = await createFixture(t);
  succeeded(run("plan", planDrift.configPath));
  const plan = JSON.parse(await fs.readFile(planDrift.outputPath, "utf8"));
  plan.state = "improved";
  await writeJson(planDrift.outputPath, plan);
  failed(run("verify", planDrift.configPath), /stored plan differs/i);
});

test("campaign validation rejects holdout evidence and weak expertise contracts", {
  skip: !pythonAvailable,
}, async (t) => {
  const holdout = await createFixture(t);
  holdout.config.campaign.developmentEvidence[0].role = "holdout";
  await writeJson(holdout.configPath, holdout.config);
  failed(run("plan", holdout.configPath), /must have role development/i);

  const obviousHoldout = await createFixture(t);
  obviousHoldout.config.campaign.developmentEvidence[0].id = "holdout-archive";
  obviousHoldout.config.campaign.gaps[0].evidenceIds = ["holdout-archive"];
  obviousHoldout.config.campaign.gaps[1].evidenceIds = ["holdout-archive"];
  obviousHoldout.config.campaign.gaps[2].evidenceIds = ["holdout-archive"];
  await writeJson(obviousHoldout.configPath, obviousHoldout.config);
  failed(run("plan", obviousHoldout.configPath), /obvious non-development label/i);

  const missingRobustness = await createFixture(t);
  missingRobustness.config.campaign.expertiseDimensions =
    missingRobustness.config.campaign.expertiseDimensions
      .filter(({ id }) => id !== "robustness");
  await writeJson(missingRobustness.configPath, missingRobustness.config);
  failed(run("plan", missingRobustness.configPath), /required expertise dimension absent: robustness/i);

  const unknown = await createFixture(t);
  unknown.config.campaign.untrustedScore = 1;
  await writeJson(unknown.configPath, unknown.config);
  failed(run("plan", unknown.configPath), /unknown keys: untrustedScore/i);
});

test("an untouched holdout declaration stays unopened and unverified", {
  skip: !pythonAvailable,
}, async (t) => {
  const fixture = await createFixture(t);
  fixture.config.campaign.outputPath = "plans/frozen-holdout.json";
  fixture.outputPath = path.join(fixture.root, "plans", "frozen-holdout.json");
  fixture.config.campaign.evaluation.holdout = {
    status: "frozen-unopened",
    splitId: "holdout-v1",
  };
  fixture.config.campaign.evaluation.selectionMechanism = "harbor-operator-coevolution";
  await writeJson(fixture.configPath, fixture.config);
  succeeded(run("plan", fixture.configPath));
  const plan = JSON.parse(await fs.readFile(fixture.outputPath, "utf8"));
  assert.equal(plan.evaluationHandoff.promotionEligible, true);
  assert.equal(plan.evaluationHandoff.claimScope, "holdout-promotion-unverified");
  assert.equal(plan.evaluationHandoff.holdout.status, "frozen-unopened");
  assert.equal(plan.boundaries.holdoutOpened, false);
  assert.equal(plan.boundaries.promotionPerformed, false);
});
