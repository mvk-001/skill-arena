import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.resolve(
  "skills",
  "harbor-author-evaluation-datasets",
  "scripts",
  "plan_harbor_task_datasets.py",
);
const REPORT_SCRIPT = path.resolve(
  "skills",
  "harbor-author-evaluation-datasets",
  "scripts",
  "consolidate_harbor_reports.py",
);
const PYTHON = process.env.PYTHON ?? "python";
const CORE_RESPONSE_MODES = ["single_file", "structured", "code", "service_state"];
const ALL_RESPONSE_MODES = [
  "scalar",
  "numeric",
  "structured",
  "collection",
  "open_text",
  "single_file",
  "multi_file",
  "in_place_edit",
  "code",
  "service_state",
  "mixed",
  "trajectory",
];

test("planning is canonical, group-disjoint, coverage-checked, varied, and redacted", (t) => {
  const fixture = createFixture(t);
  const blueprint = makeBlueprint();
  const permuted = permuteBlueprint(blueprint);
  const seeds = makeSeeds();
  const first = path.join(fixture, "plan-a");
  const second = path.join(fixture, "plan-b");

  const firstRun = runPlan(fixture, blueprint, seeds, first);
  const secondRun = runPlan(fixture, permuted, seeds, second);
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(secondRun.status, 0, secondRun.stderr);

  const firstPlanBytes = fs.readFileSync(path.join(first, "plan.private.json"));
  const secondPlanBytes = fs.readFileSync(path.join(second, "plan.private.json"));
  const firstSummaryBytes = fs.readFileSync(path.join(first, "summary.redacted.json"));
  const secondSummaryBytes = fs.readFileSync(path.join(second, "summary.redacted.json"));
  assert.deepEqual(firstPlanBytes, secondPlanBytes);
  assert.deepEqual(firstSummaryBytes, secondSummaryBytes);

  const plan = JSON.parse(firstPlanBytes);
  const summary = JSON.parse(firstSummaryBytes);
  const privatePlanText = firstPlanBytes.toString("utf8");
  for (const rawSeed of [seeds.partitionSeed, ...Object.values(seeds.variantSeeds)]) {
    assert.equal(privatePlanText.includes(rawSeed), false, rawSeed);
  }
  assert.equal(plan.families.length, blueprint.families.length);
  assert.equal(plan.tasks.length, 36);
  for (const split of Object.keys(blueprint.splitWeights)) {
    assert.ok(plan.families.some((family) => family.split === split), split);
    assert.ok(plan.tasks.some((task) => task.split === split), split);
  }
  assert.equal(new Set(plan.families.map((family) => family.familyId)).size, 9);
  assert.equal(new Set(plan.tasks.map((task) => task.taskId)).size, 36);
  for (const family of plan.families) {
    const taskSplits = new Set(
      plan.tasks
        .filter((task) => task.familyId === family.familyId)
        .map((task) => task.split),
    );
    assert.deepEqual([...taskSplits], [family.split]);
  }

  for (const split of Object.keys(blueprint.splitWeights)) {
    const splitTasks = plan.tasks.filter((task) => task.split === split);
    assert.deepEqual(
      [...new Set(splitTasks.map((task) => task.responseMode))].sort(),
      [...CORE_RESPONSE_MODES].sort(),
    );
    for (const axis of ["input_root", "output_name", "output_root"]) {
      const options = blueprint.families[0].cases[0].variantAxes[axis];
      for (const task of splitTasks) assert.ok(options.includes(task.variantAxes[axis]));
    }
    const splitFamilies = plan.families.filter((family) => family.split === split);
    assert.ok(splitFamilies.length >= blueprint.coverageRequirements[split].minimumFamilies);
    for (const dimension of ["capability", "domain", "difficulty", "resourceClass"]) {
      assert.equal(new Set(splitFamilies.map((family) => family.strata[dimension])).size, 2);
    }
  }
  for (const axis of ["input_root", "output_name", "output_root"]) {
    assert.ok(new Set(plan.tasks.map((task) => task.variantAxes[axis])).size >= 2, axis);
  }
  assert.equal(summary.coverageSatisfied, true);
  assert.equal(summary.datasetId, blueprint.datasetId);

  const redacted = JSON.stringify(summary);
  const privateTokens = new Set([
    seeds.partitionSeed,
    ...Object.values(seeds.variantSeeds),
    ...blueprint.families.flatMap((family) => [
      family.familyId,
      family.sourceId,
      family.templateId,
      ...Object.values(family.strata),
      ...family.cases.flatMap((task) => [
        task.taskId,
        ...Object.values(task.variantAxes).flat(),
      ]),
    ]),
    plan.seedCommitments.partition,
    ...Object.values(plan.seedCommitments.variants),
    ...plan.tasks.flatMap((task) => [task.variantId, task.materializedTaskId]),
  ]);
  for (const secret of privateTokens) {
    assert.equal(redacted.includes(JSON.stringify(secret)), false, secret);
  }
  assert.deepEqual(summary.redaction, {
    containsPathsOrVariantValues: false,
    containsDirectSeedsOrSeedCommitments: false,
    containsTaskOrFamilyIdentifiers: false,
    reviewRequiredBeforePublication: true,
  });

  const lightweight = runVerify(first);
  assert.equal(lightweight.status, 0, lightweight.stderr);
  assert.equal(JSON.parse(lightweight.stdout).sourceInputsReproduced, false);
  assert.equal(runVerify(second).status, 0);
});

test("a different seed changes the authoring assignment or selected surfaces", (t) => {
  const fixture = createFixture(t);
  const blueprint = makeBlueprint();
  const first = path.join(fixture, "first");
  const second = path.join(fixture, "second");
  assert.equal(runPlan(fixture, blueprint, makeSeeds(), first).status, 0);
  const changedSeeds = makeSeeds();
  changedSeeds.partitionSeed = "aa".repeat(32);
  changedSeeds.variantSeeds = {
    development: "bb".repeat(32),
    validation: "cc".repeat(32),
    holdout: "dd".repeat(32),
  };
  assert.equal(runPlan(fixture, blueprint, changedSeeds, second).status, 0);

  const firstPlan = readPlan(first);
  const secondPlan = readPlan(second);
  assert.notEqual(
    firstPlan.integrity.planCoreSha256,
    secondPlan.integrity.planCoreSha256,
  );
  assert.notDeepEqual(
    firstPlan.tasks.map(({ taskId, split, variantAxes }) => ({ taskId, split, variantAxes })),
    secondPlan.tasks.map(({ taskId, split, variantAxes }) => ({ taskId, split, variantAxes })),
  );
});

test("adding a task does not reroll existing per-task surfaces when splits are unchanged", (t) => {
  const fixture = createFixture(t);
  const baseline = makeBlueprint();
  const extended = structuredClone(baseline);
  extended.families[0].cases.push({
    taskId: "task-01-extra",
    responseMode: "single_file",
    variantAxes: structuredClone(extended.families[0].cases[0].variantAxes),
  });
  const first = path.join(fixture, "baseline");
  const second = path.join(fixture, "extended");
  assert.equal(runPlan(fixture, baseline, makeSeeds(), first).status, 0);
  assert.equal(runPlan(fixture, extended, makeSeeds(), second).status, 0);

  const firstPlan = readPlan(first);
  const secondPlan = readPlan(second);
  const secondTasks = new Map(secondPlan.tasks.map((task) => [task.taskId, task]));
  let unchangedSplitTasks = 0;
  for (const task of firstPlan.tasks) {
    const extendedTask = secondTasks.get(task.taskId);
    if (extendedTask.split === task.split) {
      unchangedSplitTasks += 1;
      assert.deepEqual(extendedTask.variantAxes, task.variantAxes, task.taskId);
      assert.equal(extendedTask.variantId, task.variantId, task.taskId);
    }
  }
  assert.ok(unchangedSplitTasks > 0);
});

test("all documented response modes are accepted and materialized", (t) => {
  const fixture = createFixture(t);
  const blueprint = makeBlueprint();
  blueprint.families[0].cases = ALL_RESPONSE_MODES.map((responseMode, index) => ({
    taskId: `task-01-mode-${String(index + 1).padStart(2, "0")}`,
    responseMode,
    variantAxes: makeVariantAxes(),
  }));
  const output = path.join(fixture, "all-response-modes");
  const result = runPlan(fixture, blueprint, makeSeeds(), output);
  assert.equal(result.status, 0, result.stderr);
  const observed = new Set(readPlan(output).tasks.map((task) => task.responseMode));
  assert.deepEqual([...observed].sort(), [...ALL_RESPONSE_MODES].sort());
});

test("the planner rejects ambiguous lineage, duplicate tasks, and invalid splits", (t) => {
  const fixture = createFixture(t);

  const duplicateTask = makeBlueprint();
  duplicateTask.families[1].cases[0].taskId = duplicateTask.families[0].cases[0].taskId;
  const duplicateTaskRun = runPlan(
    fixture,
    duplicateTask,
    makeSeeds(),
    path.join(fixture, "duplicate-task"),
  );
  assert.equal(duplicateTaskRun.status, 2);
  assert.match(duplicateTaskRun.stderr, /duplicate taskId/);

  const sharedSource = makeBlueprint();
  sharedSource.families[1].sourceId = sharedSource.families[0].sourceId;
  const sharedSourceRun = runPlan(
    fixture,
    sharedSource,
    makeSeeds(),
    path.join(fixture, "shared-source"),
  );
  assert.equal(sharedSourceRun.status, 2);
  assert.match(sharedSourceRun.stderr, /sourceId .* spans families/);

  const missingValidation = makeBlueprint();
  delete missingValidation.splitWeights.validation;
  const missingValidationRun = runPlan(
    fixture,
    missingValidation,
    makeSeeds(),
    path.join(fixture, "missing-validation"),
  );
  assert.equal(missingValidationRun.status, 2);
  assert.match(missingValidationRun.stderr, /missing mandatory splits: validation/);

  const insufficientProfiles = makeBlueprint();
  for (const family of insufficientProfiles.families) {
    for (const task of family.cases) {
      if (task.responseMode === "service_state") task.responseMode = "code";
    }
  }
  const insufficientProfilesRun = runPlan(
    fixture,
    insufficientProfiles,
    makeSeeds(),
    path.join(fixture, "insufficient-profiles"),
  );
  assert.equal(insufficientProfilesRun.status, 2);
  assert.match(insufficientProfilesRun.stderr, /requires .* service_state tasks/);

  const insufficientStratum = makeBlueprint();
  for (const family of insufficientStratum.families) {
    family.strata.resourceClass = "cpu-standard";
  }
  const insufficientStratumRun = runPlan(
    fixture,
    insufficientStratum,
    makeSeeds(),
    path.join(fixture, "insufficient-stratum"),
  );
  assert.equal(insufficientStratumRun.status, 2);
  assert.match(
    insufficientStratumRun.stderr,
    /resourceClass=gpu-standard but only 0 exist/,
  );

  const malformedSeed = makeSeeds();
  malformedSeed.partitionSeed = "not-a-256-bit-hex-seed";
  const malformedSeedRun = runPlan(
    fixture,
    makeBlueprint(),
    malformedSeed,
    path.join(fixture, "malformed-seed"),
  );
  assert.equal(malformedSeedRun.status, 2);
  assert.match(malformedSeedRun.stderr, /64 lowercase hexadecimal characters/);
});

test("the planner refuses an existing destination without changing it", (t) => {
  const fixture = createFixture(t);
  const output = path.join(fixture, "existing");
  fs.mkdirSync(output);
  const marker = path.join(output, "keep.txt");
  fs.writeFileSync(marker, "user data", "utf8");

  const result = runPlan(fixture, makeBlueprint(), makeSeeds(), output);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /output already exists/);
  assert.equal(fs.readFileSync(marker, "utf8"), "user data");
  assert.deepEqual(fs.readdirSync(output), ["keep.txt"]);
});

test("verification is read-only and fails closed on noncanonical or tampered plans", (t) => {
  const fixture = createFixture(t);
  const output = path.join(fixture, "plan");
  const blueprint = makeBlueprint();
  const seeds = makeSeeds();
  const inputs = writeInputs(fixture, blueprint, seeds);
  assert.equal(runPlanWithInputs(inputs, output).status, 0);
  const planPath = path.join(output, "plan.private.json");
  const summaryPath = path.join(output, "summary.redacted.json");
  const before = snapshotFiles([planPath, summaryPath]);
  const verified = runVerify(output);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(snapshotFiles([planPath, summaryPath]), before);
  const reproduced = runVerify(output, inputs);
  assert.equal(reproduced.status, 0, reproduced.stderr);
  assert.equal(JSON.parse(reproduced.stdout).sourceInputsReproduced, true);
  assert.deepEqual(snapshotFiles([planPath, summaryPath]), before);

  const differentSeeds = makeSeeds();
  differentSeeds.variantSeeds.validation = "ee".repeat(32);
  const mismatchedInputs = writeInputs(fixture, blueprint, differentSeeds);
  const mismatched = runVerify(output, mismatchedInputs);
  assert.equal(mismatched.status, 2);
  assert.match(mismatched.stderr, /does not reproduce from the supplied blueprint and seeds/);

  const parsed = JSON.parse(fs.readFileSync(planPath, "utf8"));
  fs.writeFileSync(planPath, JSON.stringify(parsed, null, 2), "utf8");
  const noncanonical = runVerify(output);
  assert.equal(noncanonical.status, 2);
  assert.match(noncanonical.stderr, /not canonical JSON/);

  fs.writeFileSync(planPath, canonicalJson(parsed));
  const tamperedSummary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  tamperedSummary.datasetId = "different-dataset";
  fs.writeFileSync(summaryPath, canonicalJson(tamperedSummary));
  const tampered = runVerify(output);
  assert.equal(tampered.status, 2);
  assert.match(tampered.stderr, /integrity digest does not match/);
});

test("the CLI exposes plan and verify commands", () => {
  const result = spawnSync(PYTHON, [SCRIPT, "--help"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\{plan,verify\}/);
});

test("the report consolidator writes deterministic aggregate Markdown and accessible SVGs", (t) => {
  const fixture = createFixture(t);
  const reportPath = path.join(
    fixture,
    "PRIVATE-SOURCE-PATH-MUST-NOT-LEAK",
    "final-report.json",
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const nativeReport = makeFinalReport();
  nativeReport.jobs[1].label =
    "candidate <script>alert(1)</script> | [details](javascript:alert(2))";
  fs.writeFileSync(reportPath, canonicalJson(nativeReport), "utf8");
  const first = path.join(fixture, "consolidated-a");
  const second = path.join(fixture, "consolidated-b");

  const firstRun = runConsolidator(reportPath, first);
  const secondRun = runConsolidator(reportPath, second);
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(secondRun.status, 0, secondRun.stderr);
  const expectedFiles = [
    "comparison-report.json",
    "comparison-report.md",
    "efficiency-frontier.svg",
    "quality-comparison.svg",
    "resource-comparison.svg",
  ];
  assert.deepEqual(fs.readdirSync(first).sort(), expectedFiles);

  const report = JSON.parse(fs.readFileSync(path.join(first, "comparison-report.json"), "utf8"));
  assert.equal(report.source, "harbor-final-report-consolidation");
  assert.equal(report.baselineLabel, "baseline");
  assert.deepEqual(report.sourceReports.map((source) => source.locator), ["input-1"]);
  assert.equal(report.runs.length, 2);
  assert.equal(report.runs[0].tokens.cache.total, 30);
  assert.equal(report.runs[0].tokens.reasoning.total, 18);
  assert.equal(report.runs[0].tokens.total.total, 220);
  assert.equal(report.runs[0].costUsd, 0.03);
  assert.equal(report.runs[0].agentTimeSeconds, 5);
  assert.equal(report.runs[0].wallTimeSeconds, 20);
  assert.equal(report.deltas[0].metrics.passRate.absolute, 0.5);

  const markdown = fs.readFileSync(path.join(first, "comparison-report.md"), "utf8");
  assert.match(markdown, /Input tokens \| Cached subset \| Output tokens \| Reasoning tokens/);
  assert.match(markdown, /Cost USD \| Agent time \| Wall time \| Tasks\/min/);
  assert.match(markdown, /sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(markdown, /sealed-task|resultPath|jobDirectory|PRIVATE-SOURCE-PATH-MUST-NOT-LEAK/);
  assert.equal(markdown.includes("<script>"), false);
  assert.ok(
    markdown.includes(
      String.raw`candidate \<script\>alert(1)\</script\> \| \[details\](javascript:alert(2))`,
    ),
  );

  for (const name of expectedFiles.filter((name) => name.endsWith(".svg"))) {
    const svg = fs.readFileSync(path.join(first, name), "utf8");
    assert.match(svg, /^<svg[^>]+role="img"[^>]+aria-labelledby=/);
    assert.match(svg, /<title id="chart-title">/);
    assert.match(svg, /<desc id="chart-desc">/);
    assert.match(svg, /baseline/i);
    assert.doesNotMatch(svg, /sealed-task|resultPath|jobDirectory|PRIVATE-SOURCE-PATH-MUST-NOT-LEAK/);
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b/i);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href)\s*=\s*["'](?!#)/i);
  }
  assert.match(
    fs.readFileSync(path.join(first, "quality-comparison.svg"), "utf8"),
    /candidate &lt;script&gt;/,
  );
  for (const name of expectedFiles) {
    assert.deepEqual(fs.readFileSync(path.join(first, name)), fs.readFileSync(path.join(second, name)), name);
  }

  const before = snapshotFiles(expectedFiles.map((name) => path.join(first, name)));
  const refused = runConsolidator(reportPath, first);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /refusing to overwrite/);
  assert.deepEqual(snapshotFiles(expectedFiles.map((name) => path.join(first, name))), before);
});

test("the report consolidator fails closed on inconsistent token accounting", (t) => {
  const fixture = createFixture(t);
  const report = makeFinalReport();
  report.jobs[0].summary.totalTokens.total += 30;
  report.jobs[0].summary.totalTokens.average += 15;
  const reportPath = path.join(fixture, "final-report.json");
  fs.writeFileSync(reportPath, canonicalJson(report), "utf8");
  const output = path.join(fixture, "must-not-exist");
  const result = runConsolidator(reportPath, output);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /total tokens must equal input plus output/);
  assert.equal(fs.existsSync(output), false);
});

test("the report consolidator labels partial resource coverage without ranking it", (t) => {
  const fixture = createFixture(t);
  const nativeReport = makeFinalReport();
  const partial = nativeReport.jobs[1].summary;
  partial.reward = { count: 1, total: 1, average: 1 };
  partial.totalTokens = { count: 1, total: 130, average: 130 };
  partial.costUsd = { count: 1, total: 0.02, average: 0.02 };
  partial.agentLatencyMs = { count: 1, total: 1800, average: 1800 };
  const reportPath = path.join(fixture, "partial", "final-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, canonicalJson(nativeReport), "utf8");
  const output = path.join(fixture, "comparison");

  const result = runConsolidator(reportPath, output);
  assert.equal(result.status, 0, result.stderr);
  const normalized = JSON.parse(
    fs.readFileSync(path.join(output, "comparison-report.json"), "utf8"),
  );
  const baseline = normalized.runs.find((run) => run.label === "baseline");
  const candidate = normalized.runs.find((run) => run.label === "candidate");
  assert.ok(baseline);
  assert.ok(candidate);
  assert.equal(baseline.totalTokensCoverageComplete, true);
  assert.equal(baseline.costCoverageComplete, true);
  assert.equal(baseline.agentTimeCoverageComplete, true);
  assert.equal(baseline.tokensPerTrial, 110);
  assert.equal(baseline.costPerTrialUsd, 0.015);
  assert.equal(baseline.costPerPassUsd, 0.03);
  assert.equal(baseline.agentSecondsPerTrial, 2.5);

  assert.equal(candidate.rewardCoverageComplete, false);
  assert.equal(candidate.totalTokensCoverageComplete, false);
  assert.equal(candidate.costCoverageComplete, false);
  assert.equal(candidate.agentTimeCoverageComplete, false);
  assert.equal(candidate.tokens.total.count, 1);
  assert.equal(candidate.tokens.total.total, 130);
  assert.equal(candidate.costObservedTrials, 1);
  assert.equal(candidate.costUsd, 0.02);
  assert.equal(candidate.agentTimeObservedTrials, 1);
  assert.equal(candidate.agentTimeSeconds, 1.8);
  for (const field of [
    "tokensPerTrial",
    "costPerTrialUsd",
    "costPerPassUsd",
    "agentSecondsPerTrial",
  ]) {
    assert.equal(candidate[field], null, field);
  }

  const delta = normalized.deltas.find((row) => row.candidateRunId === candidate.runId);
  assert.ok(delta);
  for (const field of ["tokensPerTrial", "costPerTrialUsd", "agentSecondsPerTrial"]) {
    assert.equal(delta.metrics[field].absolute, null, `${field}.absolute`);
    assert.equal(delta.metrics[field].percent, null, `${field}.percent`);
    assert.equal(delta.metrics[field].signedImprovement, null, `${field}.signedImprovement`);
  }

  const markdown = fs.readFileSync(path.join(output, "comparison-report.md"), "utf8");
  assert.match(markdown, /1\.000 \(1\/2\)/);
  assert.match(markdown, /130 \(1\/2\)/);
  assert.match(markdown, /0\.0200 \(1\/2\)/);
  assert.match(markdown, /1\.8 s \(1\/2\)/);
  assert.match(
    markdown,
    /A parenthesized coverage fraction such as `\(3\/4\)` means only three of four completed trials reported that metric; it is not a complete total\./,
  );

  const resourceSvg = fs.readFileSync(path.join(output, "resource-comparison.svg"), "utf8");
  assert.match(resourceSvg, /total 130\.00 \(1\/2\)/);
  assert.match(resourceSvg, /\$0\.0200 \(1\/2\)/);
  assert.match(resourceSvg, /1\.80s \(1\/2\) agent/);

  const efficiencySvg = fs.readFileSync(path.join(output, "efficiency-frontier.svg"), "utf8");
  assert.ok((efficiencySvg.match(/>baseline<\/text>/g) ?? []).length >= 2);
  assert.equal((efficiencySvg.match(/>candidate<\/text>/g) ?? []).length, 1);
  assert.match(efficiencySvg, /n\/a tok\/trial · n\/a\/pass · n\/as agent\/trial/);
  assert.match(efficiencySvg, /Missing or partial cost values are omitted from the frontier/);
});

test("the report consolidator rejects invalid counts and timestamps without outputs", (t) => {
  const fixture = createFixture(t);
  const cases = [
    {
      name: "pass-counts",
      mutate(report) {
        report.jobs[0].summary.erroredTrials = 1;
      },
      error: /must sum to completed trials/,
    },
    {
      name: "metric-coverage",
      mutate(report) {
        report.jobs[0].summary.reward = { count: 3, total: 1.5, average: 0.5 };
      },
      error: /count exceeds completedTrials/,
    },
    {
      name: "mixed-job-timezones",
      mutate(report) {
        report.jobs[0].finishedAt = "2026-09-02T11:00:20";
      },
      error: /must either both include a timezone/,
    },
    {
      name: "invalid-generated-at",
      mutate(report) {
        report.generatedAt = "not-a-timestamp";
      },
      error: /must be an ISO 8601 timestamp/,
    },
  ];

  for (const testCase of cases) {
    const nativeReport = makeFinalReport();
    testCase.mutate(nativeReport);
    const reportPath = path.join(fixture, testCase.name, "final-report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, canonicalJson(nativeReport), "utf8");
    const output = path.join(fixture, `output-${testCase.name}`);
    const result = runConsolidator(reportPath, output);
    assert.equal(result.status, 2, `${testCase.name}: ${result.stderr}`);
    assert.match(result.stderr, testCase.error, testCase.name);
    assert.equal(fs.existsSync(output), false, testCase.name);
  }
});

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-author-datasets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeBlueprint() {
  const families = [];
  for (let index = 1; index <= 9; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const firstGroup = index % 2 !== 0;
    families.push({
      familyId: `family-${suffix}`,
      sourceId: `source-${suffix}`,
      templateId: `template-${suffix}`,
      strata: {
        capability: firstGroup ? "artifact-authoring" : "state-control",
        domain: firstGroup ? "data-analysis" : "repository",
        difficulty: firstGroup ? "medium" : "hard",
        resourceClass: firstGroup ? "cpu-standard" : "gpu-standard",
      },
      cases: CORE_RESPONSE_MODES.map((responseMode, caseIndex) => ({
        taskId: `task-${suffix}-${String(caseIndex + 1).padStart(2, "0")}`,
        responseMode,
        variantAxes: makeVariantAxes(),
      })),
    });
  }
  return {
    schemaVersion: 1,
    datasetId: "example-evolution-v1",
    splitWeights: { development: 6, validation: 2, holdout: 2 },
    coverageRequirements: {
      development: makeCoverageRequirement(3, 12, 3),
      validation: makeCoverageRequirement(2, 8, 2),
      holdout: makeCoverageRequirement(2, 8, 2),
    },
    families,
  };
}

function makeVariantAxes() {
  return {
    input_root: ["inputs", "fixtures/raw", "data/source"],
    output_name: ["answer.txt", "summary.md", "report.json"],
    output_root: ["workspace", "results", "artifacts/final"],
  };
}

function makeCoverageRequirement(minimumFamilies, minimumTasks, perMode) {
  return {
    minimumFamilies,
    minimumTasks,
    responseModes: Object.fromEntries(
      CORE_RESPONSE_MODES.map((responseMode) => [responseMode, perMode]),
    ),
    strata: {
      capability: { "artifact-authoring": 1, "state-control": 1 },
      domain: { "data-analysis": 1, repository: 1 },
      difficulty: { hard: 1, medium: 1 },
      resourceClass: { "cpu-standard": 1, "gpu-standard": 1 },
    },
  };
}

function permuteBlueprint(blueprint) {
  return {
    families: [...blueprint.families].reverse().map((family) => ({
      cases: [...family.cases].reverse().map((task) => ({
        variantAxes: Object.fromEntries(
          Object.entries(task.variantAxes)
            .reverse()
            .map(([axis, options]) => [axis, [...options].reverse()]),
        ),
        responseMode: task.responseMode,
        taskId: task.taskId,
      })),
      strata: Object.fromEntries(Object.entries(family.strata).reverse()),
      templateId: family.templateId,
      sourceId: family.sourceId,
      familyId: family.familyId,
    })),
    coverageRequirements: Object.fromEntries(
      Object.entries(blueprint.coverageRequirements)
        .reverse()
        .map(([split, requirement]) => [
          split,
          {
            strata: Object.fromEntries(
              Object.entries(requirement.strata)
                .reverse()
                .map(([dimension, minima]) => [
                  dimension,
                  Object.fromEntries(Object.entries(minima).reverse()),
                ]),
            ),
            responseModes: Object.fromEntries(
              Object.entries(requirement.responseModes).reverse(),
            ),
            minimumTasks: requirement.minimumTasks,
            minimumFamilies: requirement.minimumFamilies,
          },
        ]),
    ),
    splitWeights: { holdout: 2, validation: 2, development: 6 },
    datasetId: blueprint.datasetId,
    schemaVersion: blueprint.schemaVersion,
  };
}

function makeSeeds() {
  return {
    schemaVersion: 1,
    partitionSeed: "11".repeat(32),
    variantSeeds: {
      development: "22".repeat(32),
      validation: "33".repeat(32),
      holdout: "44".repeat(32),
    },
  };
}

function makeFinalReport() {
  function metric(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return { count: values.length, total, average: total / values.length };
  }
  function job({ label, id, passed, rewards, tokens, costs, latencies, startedAt, finishedAt }) {
    const trials = tokens.map((token, index) => ({
      trialName: `${label}-${index + 1}`,
      taskName: `sealed-task-${index + 1}`,
      resultPath: `C:\\private\\${label}\\${index + 1}\\result.json`,
      tokens: token,
    }));
    return {
      label,
      jobId: id,
      startedAt,
      finishedAt,
      complete: true,
      summary: {
        requestedTrials: tokens.length,
        completedTrials: tokens.length,
        passedTrials: passed,
        verifierFailedTrials: tokens.length - passed,
        erroredTrials: 0,
        passRate: passed / tokens.length,
        reward: metric(rewards),
        totalTokens: metric(tokens.map((value) => value.total)),
        agentLatencyMs: metric(latencies),
        costUsd: metric(costs),
      },
      trials,
    };
  }
  return {
    schemaVersion: 1,
    source: "harbor",
    harborVersion: "0.18.0",
    title: "Fixture comparison",
    generatedAt: "2026-09-02T12:00:00+00:00",
    comparison: {
      enabled: true,
      fairnessBasis: "lock-and-trial-results",
      warning: null,
    },
    jobs: [
      job({
        label: "baseline",
        id: "job-baseline",
        passed: 1,
        rewards: [0, 1],
        tokens: [
          { input: 100, cachedInput: 20, output: 20, reasoningTokens: 10, total: 120 },
          { input: 80, cachedInput: 10, output: 20, reasoning: 8, total: 100 },
        ],
        costs: [0.01, 0.02],
        latencies: [2000, 3000],
        startedAt: "2026-09-02T11:00:00+00:00",
        finishedAt: "2026-09-02T11:00:20+00:00",
      }),
      job({
        label: "candidate",
        id: "job-candidate",
        passed: 2,
        rewards: [1, 1],
        tokens: [
          { input: 105, cachedInput: 25, output: 25, reasoning: 9, total: 130 },
          { input: 95, cachedInput: 15, output: 25, reasoning: 7, total: 120 },
        ],
        costs: [0.02, 0.02],
        latencies: [1800, 2200],
        startedAt: "2026-09-02T11:01:00+00:00",
        finishedAt: "2026-09-02T11:01:18+00:00",
      }),
    ],
  };
}

function runPlan(fixture, blueprint, seeds, output) {
  return runPlanWithInputs(writeInputs(fixture, blueprint, seeds), output);
}

function writeInputs(fixture, blueprint, seeds) {
  const invocation = crypto.randomBytes(6).toString("hex");
  const blueprintPath = path.join(fixture, `blueprint-${invocation}.json`);
  const seedsPath = path.join(fixture, `seeds-${invocation}.json`);
  fs.writeFileSync(blueprintPath, JSON.stringify(blueprint), "utf8");
  fs.writeFileSync(seedsPath, JSON.stringify(seeds), "utf8");
  return { blueprintPath, seedsPath };
}

function runPlanWithInputs({ blueprintPath, seedsPath }, output) {
  return spawnSync(
    PYTHON,
    [SCRIPT, "plan", "--blueprint", blueprintPath, "--seeds", seedsPath, "--output", output],
    { cwd: path.resolve("."), encoding: "utf8", windowsHide: true },
  );
}

function runVerify(planDir, inputs) {
  const args = [SCRIPT, "verify", "--plan-dir", planDir];
  if (inputs) args.push("--blueprint", inputs.blueprintPath, "--seeds", inputs.seedsPath);
  return spawnSync(PYTHON, args, {
    cwd: path.resolve("."),
    encoding: "utf8",
    windowsHide: true,
  });
}

function runConsolidator(reportPath, output) {
  const reportPaths = Array.isArray(reportPath) ? reportPath : [reportPath];
  return spawnSync(
    PYTHON,
    [REPORT_SCRIPT, ...reportPaths, "--output-dir", output, "--title", "Fixture dashboard"],
    { cwd: path.resolve("."), encoding: "utf8", windowsHide: true },
  );
}

function readPlan(planDir) {
  return JSON.parse(fs.readFileSync(path.join(planDir, "plan.private.json"), "utf8"));
}

function canonicalJson(value) {
  return `${JSON.stringify(sortValue(value))}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

function snapshotFiles(paths) {
  return paths.map((filePath) => ({
    bytes: fs.readFileSync(filePath).toString("base64"),
    mtimeMs: fs.statSync(filePath).mtimeMs,
  }));
}
