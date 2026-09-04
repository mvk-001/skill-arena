import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const SCRIPT = path.resolve(
  "skills",
  "harbor-organize-evaluations",
  "scripts",
  "manage_harbor_evaluations.py",
);
const PYTHON = process.env.PYTHON ?? "python";
const RECORDED_AT = "2026-07-24T12:00:00Z";

test("enforces development, sealed validation, and holdout ordering", () => {
  const fixture = createFixture();
  const development = createDataset(fixture.root, "development", "task-public", "development");
  const validation = createDataset(fixture.root, "validation", "task-validation", "validation");
  const holdout = createDataset(fixture.root, "holdout", "task-secret", "holdout");
  const developmentSecond = createDataset(fixture.root, "development-second", "task-public-second", "another development cohort");
  const validationSecond = createDataset(fixture.root, "validation-second", "task-private-second", "another independent cohort");
  const baselineEvidence = writeEvidence(fixture.root, "baseline-job", "baseline");
  const evolutionEvidence = writeEvidence(fixture.root, "evolution-report.json", "winner");
  const candidateEvidence = writeEvidence(fixture.root, "candidate-skill", "frozen winner");
  const validationEvidence = writeEvidence(fixture.root, "validation-report.json", "pass");
  const holdoutEvidence = writeEvidence(fixture.root, "holdout-report.json", "promote");

  run([
    "init",
    fixture.study,
    "--study-id",
    "ordered-study",
    "--title",
    "Ordered Harbor Study",
    "--objective",
    "Track one development evolution, independent validation, and final holdout gate.",
    "--comparison-profile",
    "codex-native-v1",
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "development-v1",
    "--split",
    "development",
    "--source",
    development,
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "validation-v1",
    "--split",
    "validation",
    "--source",
    validation,
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "holdout-v1",
    "--split",
    "holdout",
    "--source",
    holdout,
    "--recorded-at",
    RECORDED_AT,
  ]);
  for (const [id, split, source] of [["development-second", "development", developmentSecond], ["validation-second", "validation", validationSecond]]) {
    run(["add-dataset", fixture.study, "--dataset-id", id, "--split", split, "--source", source]);
  }
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "baseline-dev",
    "--kind",
    "baseline",
    "--owner-skill",
    "harbor-run-results",
    "--dataset-id",
    "development-v1",
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "evolve-g001",
    "--kind",
    "evolution",
    "--owner-skill",
    "harbor-reflective-pareto-search",
    "--dataset-id",
    "development-v1",
    "--dataset-id",
    "development-second",
    "--depends-on",
    "baseline-dev",
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "validate-g001",
    "--kind",
    "validation",
    "--owner-skill",
    "harbor-run-results",
    "--dataset-id",
    "validation-v1",
    "--dataset-id",
    "validation-second",
    "--depends-on",
    "evolve-g001",
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "holdout-gate",
    "--kind",
    "holdout",
    "--owner-skill",
    "harbor-run-results",
    "--dataset-id",
    "holdout-v1",
    "--depends-on",
    "validate-g001",
    "--recorded-at",
    RECORDED_AT,
  ]);

  sealFixtureDesign(fixture.study);
  transition(fixture.study, "baseline-dev", "running");
  recordEvidence(fixture.study, {
    evidenceId: "baseline-native-job",
    stageId: "baseline-dev",
    kind: "native-job",
    role: "development",
    visibility: "private",
    source: baselineEvidence,
  });
  transition(fixture.study, "baseline-dev", "completed");

  transition(fixture.study, "evolve-g001", "running");
  recordEvidence(fixture.study, {
    evidenceId: "evolve-g001-report",
    stageId: "evolve-g001",
    kind: "evolution-report",
    role: "report",
    visibility: "public",
    source: evolutionEvidence,
  });
  recordEvidence(fixture.study, {
    evidenceId: "evolve-g001-candidate",
    stageId: "evolve-g001",
    kind: "candidate",
    role: "lineage",
    visibility: "private",
    source: candidateEvidence,
  });
  transition(fixture.study, "evolve-g001", "completed");

  const prematureValidation = transition(
    fixture.study,
    "validate-g001",
    "running",
    false,
  );
  assert.match(prematureValidation.stderr, /cannot run before validation release/);

  run([
    "release-validation",
    fixture.study,
    "--selection-id",
    "winner-g001",
    "--selected-stage",
    "evolve-g001",
    "--candidate-evidence",
    candidateEvidence,
    "--recorded-at",
    RECORDED_AT,
  ]);
  transition(fixture.study, "validate-g001", "running");
  recordEvidence(fixture.study, {
    evidenceId: "validation-report",
    stageId: "validate-g001",
    kind: "final-report",
    role: "validation",
    visibility: "public",
    source: validationEvidence,
  });
  transition(fixture.study, "validate-g001", "completed");

  const prematureHoldout = transition(fixture.study, "holdout-gate", "running", false);
  assert.match(prematureHoldout.stderr, /cannot run before holdout release/);

  run([
    "release-holdout",
    fixture.study,
    "--selection-id",
    "validated-winner-g001",
    "--selected-stage",
    "validate-g001",
    "--selection-evidence",
    validationEvidence,
    "--recorded-at",
    RECORDED_AT,
  ]);
  transition(fixture.study, "holdout-gate", "running");
  recordEvidence(fixture.study, {
    evidenceId: "holdout-report",
    stageId: "holdout-gate",
    kind: "final-report",
    role: "holdout",
    visibility: "public",
    source: holdoutEvidence,
  });
  transition(fixture.study, "holdout-gate", "completed");

  const verified = JSON.parse(
    run(["verify", fixture.study, "--render"]).stdout,
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.datasetCount, 5);
  assert.equal(verified.stageCount, 4);
  assert.equal(verified.evidenceCount, 5);
  assert.equal(verified.validationReleased, true);
  assert.equal(verified.holdoutReleased, true);
  assert.equal(verified.completionPercent, 100);

  const status = JSON.parse(fs.readFileSync(path.join(fixture.study, "status.json"), "utf8"));
  assert.equal(status.progress.counts.completed, 4);
  assert.equal(status.progress.completionPercent, 100);
  assert.equal(status.validation.released, true);
  assert.equal(status.validation.optimizerVisible, false);
  assert.equal(status.holdout.released, true);
  assert.equal(status.nextAction, null);
  assert.deepEqual(
    status.stages.map(({ stageId, status: stageStatus }) => [stageId, stageStatus]),
    [
      ["baseline-dev", "completed"],
      ["evolve-g001", "completed"],
      ["validate-g001", "completed"],
      ["holdout-gate", "completed"],
    ],
  );
  assert.equal(JSON.stringify(status).includes(fixture.root), false);
  assert.equal(JSON.stringify(status).includes("task-validation"), false);
  assert.equal(JSON.stringify(status).includes("task-secret"), false);

  const markdown = fs.readFileSync(path.join(fixture.study, "status.md"), "utf8");
  assert.match(markdown, /4\/4 completed \(100\.00%\)/);
  assert.match(markdown, /Validation: released for the frozen candidate/);
  assert.match(markdown, /Holdout: released/);
  assert.doesNotMatch(markdown, /task-secret/);

  const publication = JSON.parse(
    fs.readFileSync(path.join(fixture.study, "publication", "index.json"), "utf8"),
  );
  assert.equal(publication.publicationPolicy, "indexes-and-result-tables-only-v1");
  assert.equal(Object.hasOwn(publication, "datasets"), false);
  assert.deepEqual(
    publication.resultIndex.map(({ evidenceId }) => evidenceId),
    ["evolve-g001-report", "validation-report", "holdout-report"],
  );
  assert.equal(JSON.stringify(publication).includes("baseline-native-job"), false);
  assert.equal(JSON.stringify(publication).includes(fixture.root), false);
  assert.equal(JSON.stringify(publication).includes("task-secret"), false);

  const publicationMarkdown = fs.readFileSync(
    path.join(fixture.study, "publication", "index.md"),
    "utf8",
  );
  assert.match(publicationMarkdown, /Raw Harbor evaluations.*intentionally excluded/);
  assert.doesNotMatch(publicationMarkdown, /baseline-native-job|task-secret/);
});

test("blocks evolution start until independent validation is planned and keeps it one-way", () => {
  const fixture = createFixture();
  const development = createDataset(fixture.root, "development", "task-dev", "development");
  const validation = createDataset(fixture.root, "validation", "task-val", "validation");
  const report = writeEvidence(fixture.root, "evolution-report.json", "selected");
  const candidate = writeEvidence(fixture.root, "candidate-skill", "frozen candidate");
  initialize(fixture.study);

  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "development-v1",
    "--split",
    "development",
    "--source",
    development,
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "evolve",
    "--kind",
    "evolution",
    "--owner-skill",
    "harbor-population-search",
    "--dataset-id",
    "development-v1",
    "--recorded-at",
    RECORDED_AT,
  ]);

  const missingBoundary = transition(fixture.study, "evolve", "running", false);
  assert.match(missingBoundary.stderr, /independent validation dataset is required/);
  assert.match(missingBoundary.stderr, /downstream validation stage.*must be planned/);

  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "validation-v1",
    "--split",
    "validation",
    "--source",
    validation,
    "--recorded-at",
    RECORDED_AT,
  ]);
  const validationAsEvolution = run(
    [
      "add-stage",
      fixture.study,
      "--stage-id",
      "leaky-evolution",
      "--kind",
      "evolution",
      "--owner-skill",
      "harbor-population-search",
      "--dataset-id",
      "validation-v1",
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(validationAsEvolution.stderr, /cannot use sealed validation/);

  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "validate",
    "--kind",
    "validation",
    "--owner-skill",
    "harbor-population-search",
    "--dataset-id",
    "validation-v1",
    "--depends-on",
    "evolve",
    "--recorded-at",
    RECORDED_AT,
  ]);
  sealFixtureDesign(fixture.study);
  transition(fixture.study, "evolve", "running");
  recordEvidence(fixture.study, {
    evidenceId: "evolution-report",
    stageId: "evolve",
    kind: "evolution-report",
    role: "report",
    visibility: "private",
    source: report,
  });
  recordEvidence(fixture.study, {
    evidenceId: "frozen-candidate",
    stageId: "evolve",
    kind: "candidate",
    role: "lineage",
    visibility: "private",
    source: candidate,
  });
  transition(fixture.study, "evolve", "completed");

  const unfrozen = run(
    [
      "release-validation",
      fixture.study,
      "--selection-id",
      "winner",
      "--selected-stage",
      "evolve",
      "--candidate-evidence",
      report,
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(unfrozen.stderr, /kind candidate/);

  run([
    "release-validation",
    fixture.study,
    "--selection-id",
    "winner",
    "--selected-stage",
    "evolve",
    "--candidate-evidence",
    candidate,
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "evolve-after-validation",
    "--kind",
    "evolution",
    "--owner-skill",
    "harbor-population-search",
    "--dataset-id",
    "development-v1",
    "--recorded-at",
    RECORDED_AT,
  ]);
  const lateValidation = run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "validate-after-validation",
    "--kind",
    "validation",
    "--owner-skill",
    "harbor-population-search",
    "--dataset-id",
    "validation-v1",
    "--depends-on",
    "evolve-after-validation",
    "--recorded-at",
    RECORDED_AT,
  ], false);
  assert.match(lateValidation.stderr, /must be planned before design sealing/);
  const consumedValidation = transition(
    fixture.study,
    "evolve-after-validation",
    "running",
    false,
  );
  assert.match(consumedValidation.stderr, /start a new study with a fresh validation dataset/);

  const status = JSON.parse(run(["status", fixture.study]).stdout);
  const evolution = status.stages.find(({ stageId }) => stageId === "evolve");
  assert.deepEqual(evolution.evaluationBoundary, {
    evolutionDatasetSplit: "development",
    validationDatasetSplit: "validation",
    validationOptimizerVisible: false,
    candidateFreezeEvidenceKind: "candidate",
    validationReleasePolicy: "after-completed-evolution",
    postValidationEvolutionPolicy: "new-study-with-fresh-validation",
  });
});

test("allows Git to track only publication indexes and reviewed result tables", () => {
  const fixture = createFixture();
  initialize(fixture.study);
  const rawJob = path.join(fixture.study, "jobs", "trial-001", "result.json");
  fs.mkdirSync(path.dirname(rawJob), { recursive: true });
  fs.writeFileSync(rawJob, '{"raw":"evaluation"}\n', "utf8");
  const table = path.join(
    fixture.study,
    "publication",
    "tables",
    "development-summary.table.csv",
  );
  fs.writeFileSync(table, "candidate,score\nbaseline,0.5\n", "utf8");
  const rendered = JSON.parse(run(["verify", fixture.study, "--render"]).stdout);
  assert.equal(rendered.publicationTableCount, 1);

  runGit(fixture.root, ["init"]);
  assert.equal(runGit(fixture.root, ["check-ignore", "-q", "--", rawJob]).status, 0);
  assert.notEqual(runGit(fixture.root, ["check-ignore", "-q", "--", table], false).status, 0);
  runGit(fixture.root, ["add", "."]);
  const tracked = runGit(fixture.root, ["ls-files"]).stdout.trim().split(/\r?\n/);
  assert.deepEqual(tracked, [
    "study/.gitignore",
    "study/publication/index.json",
    "study/publication/index.md",
    "study/publication/tables/development-summary.table.csv",
  ]);
  const verified = JSON.parse(run(["verify", fixture.study]).stdout);
  assert.equal(verified.gitRepositoryDetected, true);
  assert.equal(verified.trackedStudyFileCount, 4);

  fs.appendFileSync(table, "candidate,0.7\n");
  run(["verify", fixture.study, "--render"]);
  const rejectedStaleGitIndex = run(["verify", fixture.study], false);
  assert.match(
    rejectedStaleGitIndex.stderr,
    /tracked publication files differ between the Git index and worktree/,
  );
  runGit(fixture.root, ["add", path.join("study", "publication")]);
  run(["verify", fixture.study]);

  const unexpected = path.join(fixture.study, "publication", "raw-evaluation.json");
  fs.writeFileSync(unexpected, '{"raw":"evaluation"}\n', "utf8");
  const rejectedPublication = run(["verify", fixture.study], false);
  assert.match(rejectedPublication.stderr, /unexpected publication artifact/);
  fs.unlinkSync(unexpected);

  const ignorePath = path.join(fixture.study, ".gitignore");
  const policy = fs.readFileSync(ignorePath, "utf8");
  fs.appendFileSync(ignorePath, "\n!/jobs/\n");
  const rejectedPolicy = run(["verify", fixture.study], false);
  assert.match(rejectedPolicy.stderr, /publication Git allowlist drifted/);
  fs.writeFileSync(ignorePath, policy, "utf8");

  runGit(fixture.root, ["add", "-f", path.join("study", "ledger.jsonl")]);
  const rejectedTrackedRaw = run(["verify", fixture.study], false);
  assert.match(rejectedTrackedRaw.stderr, /Git tracks non-public Harbor study artifacts/);
});

test("rejects task content shared between optimizer-visible and holdout datasets", () => {
  const fixture = createFixture();
  const development = createDataset(fixture.root, "development", "task-a", "same");
  const holdout = createDataset(fixture.root, "holdout", "task-b", "same");
  initialize(fixture.study);

  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "development-v1",
    "--split",
    "development",
    "--source",
    development,
    "--recorded-at",
    RECORDED_AT,
  ]);
  const rejected = run(
    [
      "add-dataset",
      fixture.study,
      "--dataset-id",
      "holdout-v1",
      "--split",
      "holdout",
      "--source",
      holdout,
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(rejected.stderr, /task content overlaps development-v1/);
  assert.equal(fs.existsSync(path.join(fixture.study, "datasets", "holdout-v1.lock.json")), false);
});

test("fails closed on dataset drift and ledger tampering", () => {
  const fixture = createFixture();
  const development = createDataset(fixture.root, "development", "task-a", "original");
  initialize(fixture.study);
  run([
    "add-dataset",
    fixture.study,
    "--dataset-id",
    "development-v1",
    "--split",
    "development",
    "--source",
    development,
    "--recorded-at",
    RECORDED_AT,
  ]);

  const instruction = path.join(development, "task-a", "instruction.md");
  fs.appendFileSync(instruction, "\ndrift\n");
  const drifted = run(["verify", fixture.study], false);
  assert.match(drifted.stderr, /dataset drifted: development-v1/);

  fs.writeFileSync(instruction, "original\n", "utf8");
  run(["verify", fixture.study]);
  const ledgerPath = path.join(fixture.study, "ledger.jsonl");
  const ledger = fs.readFileSync(ledgerPath, "utf8");
  fs.writeFileSync(ledgerPath, ledger.replace('"sequence":1', '"sequence":9'), "utf8");
  const tampered = run(["verify", fixture.study], false);
  assert.match(tampered.stderr, /invalid sequence|invalid eventSha256/);
});

test("enforces owner boundaries, immutable dataset planning, and bound release evidence", () => {
  const fixture = createFixture();
  const development = createDataset(fixture.root, "development", "task-a", "development");
  const holdout = createDataset(fixture.root, "holdout", "task-b", "holdout");
  const report = writeEvidence(fixture.root, "selection.json", "selected");
  const unbound = writeEvidence(fixture.root, "unbound.json", "unbound");
  initialize(fixture.study);
  for (const [datasetId, split, source] of [
    ["development-v1", "development", development],
    ["holdout-v1", "holdout", holdout],
  ]) {
    run([
      "add-dataset",
      fixture.study,
      "--dataset-id",
      datasetId,
      "--split",
      split,
      "--source",
      source,
      "--recorded-at",
      RECORDED_AT,
    ]);
  }

  const wrongOwner = run(
    [
      "add-stage",
      fixture.study,
      "--stage-id",
      "bad-stage",
      "--kind",
      "recovery",
      "--owner-skill",
      "harbor-run-results",
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(wrongOwner.stderr, /cannot own a recovery stage/);

  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "baseline",
    "--kind",
    "baseline",
    "--owner-skill",
    "harbor-run-results",
    "--dataset-id",
    "development-v1",
    "--recorded-at",
    RECORDED_AT,
  ]);
  run([
    "add-stage",
    fixture.study,
    "--stage-id",
    "selection",
    "--kind",
    "comparison",
    "--owner-skill",
    "harbor-run-results",
    "--dataset-id",
    "development-v1",
    "--depends-on",
    "baseline",
    "--recorded-at",
    RECORDED_AT,
  ]);
  addFixtureStage(fixture.study, "holdout", "holdout", ["holdout-v1"], ["selection"]);
  sealFixtureDesign(fixture.study);
  transition(fixture.study, "baseline", "running");
  recordEvidence(fixture.study, {
    evidenceId: "baseline-report",
    stageId: "baseline",
    kind: "final-report",
    role: "report",
    visibility: "public",
    source: report,
  });
  transition(fixture.study, "baseline", "completed");
  transition(fixture.study, "selection", "running");
  recordEvidence(fixture.study, {
    evidenceId: "selection-report",
    stageId: "selection",
    kind: "final-report",
    role: "comparison",
    visibility: "public",
    source: report,
  });

  const lateDataset = createDataset(fixture.root, "late", "task-c", "late");
  const late = run(
    [
      "add-dataset",
      fixture.study,
      "--dataset-id",
      "late-v1",
      "--split",
      "validation",
      "--source",
      lateDataset,
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(late.stderr, /cannot be registered after study execution starts/);

  transition(fixture.study, "selection", "completed");
  const rejectedRelease = run(
    [
      "release-holdout",
      fixture.study,
      "--selection-id",
      "winner",
      "--selected-stage",
      "selection",
      "--selection-evidence",
      unbound,
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(rejectedRelease.stderr, /must already be recorded on the selected stage/);

  const baselineRelease = run(
    [
      "release-holdout",
      fixture.study,
      "--selection-id",
      "baseline-selection",
      "--selected-stage",
      "baseline",
      "--selection-evidence",
      report,
      "--recorded-at",
      RECORDED_AT,
    ],
    false,
  );
  assert.match(
    baselineRelease.stderr,
    /requires an evaluation or comparison selection stage/,
  );
});

test("supports several public datasets and requires the complete private verification portfolio", () => {
  const fixture = createPortfolioFixture({ holdout: true });
  const unsealed = transition(fixture.study, "evolve", "running", false);
  assert.match(unsealed.stderr, /seal-design is required/);
  assert.equal(JSON.parse(run(["status", fixture.study]).stdout).nextAction, null);
  sealFixtureDesign(fixture.study);
  const candidate = finishFixtureStage(fixture, "evolve", "candidate", "lineage");
  releaseFixtureValidation(fixture, candidate);
  const secondReport = finishFixtureStage(fixture, "validate-b", "final-report", "validation");
  const premature = releaseFixtureHoldout(fixture, secondReport, false);
  assert.match(premature.stderr, /every planned validation gate to complete/);
  finishFixtureStage(fixture, "validate-a", "final-report", "validation");
  releaseFixtureHoldout(fixture, secondReport);
  finishFixtureStage(fixture, "holdout", "final-report", "holdout");
  const verified = JSON.parse(run(["verify", fixture.study]).stdout);
  assert.equal(verified.datasetCount, 5);
  const status = JSON.parse(run(["status", fixture.study]).stdout);
  assert.equal(status.validation.datasetCount, 2);
  assert.equal(status.design.sealed, true);
  assert.deepEqual(status.stages[0].datasetIds, ["development-a", "development-b"]);
  assert.deepEqual(status.datasets.map(({ access, optimizerVisible }) => [access, optimizerVisible]), [
    ["public", true], ["public", true], ["private", false], ["private", false], ["private", false],
  ]);
  const publicText = fs.readFileSync(path.join(fixture.study, "publication", "index.json"), "utf8");
  assert.doesNotMatch(publicText, /task-secret|group-|reviewer|design-review|fixture-review/);
  assert.doesNotMatch(JSON.stringify(status), /task-secret|group-|reviewer|design-review/);
});

test("rejects byte-distinct renamed tasks that share a declared source or template group", () => {
  const fixture = createPortfolioFixture();
  const design = prepareFixtureDesign(fixture.study, (review) => {
    review.datasets.find(({ datasetId }) => datasetId === "development-a").tasks[0].groupIds.push("opaque-shared-template");
    review.datasets.find(({ datasetId }) => datasetId === "validation-b").tasks[0].groupIds.push("opaque-shared-template");
  });
  const ledgerBefore = fs.readFileSync(path.join(fixture.study, "ledger.jsonl"), "utf8");
  const rejected = sealFixtureDesign(fixture.study, design, false);
  assert.match(rejected.stderr, /declared independence group overlaps/);
  assert.doesNotMatch(rejected.stderr, /opaque-shared-template|task-secret/);
  assert.equal(fs.readFileSync(path.join(fixture.study, "ledger.jsonl"), "utf8"), ledgerBefore);
  assert.equal(JSON.parse(run(["status", fixture.study]).stdout).design.sealed, false);
});

test("permits related variants within one dataset while requiring their exact reviewed inventory", () => {
  const fixture = createFixture();
  initialize(fixture.study);
  const dataset = createDataset(fixture.root, "variants", "variant-a", "Write alpha.json with the requested content.");
  createDataset(fixture.root, "variants", "variant-b", "Write beta.json with the requested content.");
  run(["add-dataset", fixture.study, "--dataset-id", "development", "--split", "development", "--source", dataset]);
  addFixtureStage(fixture.study, "evaluate", "evaluation", ["development"]);
  const design = prepareFixtureDesign(fixture.study, (review) => {
    for (const task of review.datasets[0].tasks) task.groupIds = ["same-family"];
  });
  sealFixtureDesign(fixture.study, design);
  finishFixtureStage(fixture, "evaluate");
  assert.equal(JSON.parse(run(["verify", fixture.study]).stdout).ok, true);
});

test("requires evidence-backed quality checks and complete digest-bound dataset and task reviews", async (t) => {
  const cases = [
    ["unreviewed dataset", (r) => r.datasets.pop(), /every registered dataset exactly once/],
    ["unreviewed task", (r) => r.datasets[0].tasks.pop(), /every task exactly once/],
    ["wrong dataset digest", (r) => { r.datasets[0].datasetSha256 = "0".repeat(64); }, /dataset digest does not match/],
    ["wrong task digest", (r) => { r.datasets[0].tasks[0].taskSha256 = "0".repeat(64); }, /task digest does not match/],
    ["unknown task", (r) => { r.datasets[0].tasks[0].taskId = "secret-unknown"; }, /unknown or repeated task/],
    ["duplicate dataset", (r) => { r.datasets[1] = r.datasets[0]; }, /unknown or repeated dataset/],
    ["missing grouping", (r) => { r.datasets[0].tasks[0].groupIds = []; }, /unique opaque groupIds/],
    ["failed surface audit", (r) => { r.checks.surfaceCues.status = "fail"; }, /check must pass.*surfaceCues/],
    ["missing audit", (r) => { delete r.checks.accessIsolation; }, /six required quality checks/],
    ["escaping evidence", (r) => { r.checks.surfaceCues.evidenceFile = "../outside.md"; }, /must identify supporting evidence/],
    ["missing evidence", (r) => { r.checks.surfaceCues.evidenceFile = "missing.md"; }, /missing.md/],
  ];
  // Reuse only the still-unsealed synthetic study; failed commands append no events.
  const fixture = createPortfolioFixture();
  for (const [label, edit, expected] of cases) {
    await t.test(label, () => {
      const design = prepareFixtureDesign(fixture.study, edit);
      const result = sealFixtureDesign(fixture.study, design, false);
      assert.match(result.stderr, expected);
      assert.doesNotMatch(result.stderr, /Traceback|secret-unknown/);
    });
  }
});

test("freezes dataset membership and private gate coverage before execution", () => {
  const fixture = createPortfolioFixture({ omitSecondGate: true });
  const uncovered = sealFixtureDesign(fixture.study, prepareFixtureDesign(fixture.study), false);
  assert.match(uncovered.stderr, /every registered validation dataset needs a planned validation stage/);
  addFixtureStage(fixture.study, "validate-b", "validation", ["validation-b"], ["evolve"]);
  const design = prepareFixtureDesign(fixture.study);
  sealFixtureDesign(fixture.study, design);
  assert.match(sealFixtureDesign(fixture.study, design, false).stderr, /sealed only once/);
  const lateSource = createDataset(fixture.root, "late", "late-task", "late cohort");
  assert.match(run(["add-dataset", fixture.study, "--dataset-id", "late", "--split", "validation", "--source", lateSource], false).stderr,
    /cannot be registered after design sealing/);
  assert.match(addFixtureStage(fixture.study, "another-look", "comparison", ["validation-a"], ["evolve"], false).stderr,
    /must be planned before design sealing/);
  assert.match(addFixtureStage(fixture.study, "mixed", "comparison", ["development-a", "validation-a"], [], false).stderr,
    /cannot mix sealed/);
  assert.match(addFixtureStage(fixture.study, "mixed-recovery", "recovery", ["development-a", "validation-a"], [], false).stderr,
    /cannot mix sealed/);
});

test("stopping one planned private gate cannot remove it from acceptance", () => {
  const fixture = createPortfolioFixture();
  sealFixtureDesign(fixture.study);
  const candidate = finishFixtureStage(fixture, "evolve", "candidate", "lineage");
  transition(fixture.study, "validate-b", "stopped");
  assert.match(releaseFixtureValidation(fixture, candidate, false).stderr, /all planned validation gates/);
});

test("every private gate must descend from the same frozen selection", () => {
  const fixture = createPortfolioFixture({ omitSecondGate: true });
  addFixtureStage(fixture.study, "validate-b", "validation", ["validation-b"]);
  assert.match(sealFixtureDesign(fixture.study, prepareFixtureDesign(fixture.study), false).stderr,
    /all private validation gates need a common evolution selection ancestor/);
});

test("private release blocks further optimizer work but permits correctly bound external recovery", () => {
  const fixture = createPortfolioFixture();
  addFixtureStage(fixture.study, "later-evaluation", "evaluation", ["development-a"]);
  addFixtureStage(fixture.study, "later-realization", "realization", []);
  sealFixtureDesign(fixture.study);
  const candidate = finishFixtureStage(fixture, "evolve", "candidate", "lineage");
  transition(fixture.study, "later-evaluation", "running");
  assert.match(releaseFixtureValidation(fixture, candidate, false).stderr, /finish or stop all active work/);
  transition(fixture.study, "later-evaluation", "stopped");
  releaseFixtureValidation(fixture, candidate);
  addFixtureStage(fixture.study, "unbound-recovery", "recovery", []);
  addFixtureStage(fixture.study, "new-evaluation", "evaluation", ["development-b"]);
  for (const stage of ["later-realization", "unbound-recovery", "new-evaluation"]) {
    assert.match(transition(fixture.study, stage, "running", false).stderr, /optimizer-visible work cannot resume/);
  }
  addFixtureStage(fixture.study, "private-recovery", "recovery", ["validation-a"], ["evolve"]);
  // Native external-failure eligibility is still owned by the recovery skill.
  finishFixtureStage(fixture, "private-recovery", "recovery", "validation");
  const status = JSON.parse(run(["status", fixture.study]).stdout);
  assert.equal(status.nextAction.stageId, "validate-a");
  assert.equal(JSON.parse(run(["verify", fixture.study]).stdout).ok, true);
});

test("detects frozen baseline, protocol, and review drift before running a stage", async (t) => {
  for (const name of ["baseline", "protocol", "review"]) {
    await t.test(name, () => {
      const fixture = createPortfolioFixture();
      const design = prepareFixtureDesign(fixture.study);
      sealFixtureDesign(fixture.study, design);
      const target = name === "review" ? path.join(design.directory, "fixture-review.md") : design[name];
      fs.appendFileSync(target, "changed after sealing\n");
      assert.match(run(["verify", fixture.study], false).stderr, new RegExp(`design ${name} drifted`));
      assert.match(transition(fixture.study, "evolve", "running", false).stderr, new RegExp(`design ${name} drifted`));
    });
  }
});

test("keeps synthetic schema 1 evidence auditable without retroactively inventing a design review", () => {
  const fixture = createFixture();
  initialize(fixture.study);
  const metadataPath = path.join(fixture.study, "study.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  metadata.schemaVersion = 1;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
  const ledgerPath = path.join(fixture.study, "ledger.jsonl");
  const event = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  event.payload.studySha256 = createHash("sha256").update(fs.readFileSync(metadataPath)).digest("hex");
  delete event.eventSha256;
  const canonical = (value) => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en"))) : item);
  event.eventSha256 = createHash("sha256").update(canonical(event)).digest("hex");
  fs.writeFileSync(ledgerPath, canonical(event) + "\n");
  const source = createDataset(fixture.root, "legacy", "legacy-task", "legacy evaluation");
  run(["add-dataset", fixture.study, "--dataset-id", "legacy", "--split", "development", "--source", source]);
  const privateSource = createDataset(fixture.root, "legacy-private", "legacy-private-task", "legacy private case");
  run(["add-dataset", fixture.study, "--dataset-id", "legacy-private", "--split", "holdout", "--source", privateSource]);
  addFixtureStage(fixture.study, "legacy-evaluation", "evaluation", ["legacy"]);
  addFixtureStage(fixture.study, "legacy-recovery", "recovery", ["legacy", "legacy-private"]);
  const originalMetadata = fs.readFileSync(metadataPath, "utf8");
  const originalLock = fs.readFileSync(path.join(fixture.study, "datasets", "legacy.lock.json"), "utf8");
  assert.match(sealFixtureDesign(fixture.study, prepareFixtureDesign(fixture.study), false).stderr, /legacy studies cannot acquire/);
  finishFixtureStage(fixture, "legacy-evaluation");
  const beforeVerify = fs.readFileSync(ledgerPath, "utf8");
  assert.equal(JSON.parse(run(["verify", fixture.study]).stdout).ok, true);
  assert.equal(fs.readFileSync(metadataPath, "utf8"), originalMetadata);
  assert.equal(fs.readFileSync(path.join(fixture.study, "datasets", "legacy.lock.json"), "utf8"), originalLock);
  assert.equal(fs.readFileSync(ledgerPath, "utf8"), beforeVerify);
  assert.equal(JSON.parse(run(["status", fixture.study]).stdout).design.required, false);
});

test("rechecks frozen sources before consuming validation or holdout", () => {
  const validationFixture = createPortfolioFixture();
  const validationDesign = prepareFixtureDesign(validationFixture.study);
  sealFixtureDesign(validationFixture.study, validationDesign);
  const candidate = finishFixtureStage(validationFixture, "evolve", "candidate", "lineage");
  fs.appendFileSync(validationDesign.baseline, "changed after selection\n");
  assert.match(releaseFixtureValidation(validationFixture, candidate, false).stderr, /design baseline drifted/);
  assert.equal(JSON.parse(run(["status", validationFixture.study]).stdout).validation.released, false);

  const holdoutFixture = createPortfolioFixture({ holdout: true });
  const holdoutDesign = prepareFixtureDesign(holdoutFixture.study);
  sealFixtureDesign(holdoutFixture.study, holdoutDesign);
  const finalCandidate = finishFixtureStage(holdoutFixture, "evolve", "candidate", "lineage");
  releaseFixtureValidation(holdoutFixture, finalCandidate);
  finishFixtureStage(holdoutFixture, "validate-a", "final-report", "validation");
  const report = finishFixtureStage(holdoutFixture, "validate-b", "final-report", "validation");
  fs.appendFileSync(holdoutDesign.protocol, "changed after private evaluation\n");
  assert.match(releaseFixtureHoldout(holdoutFixture, report, false).stderr, /design protocol drifted/);
  assert.equal(JSON.parse(run(["status", holdoutFixture.study]).stdout).holdout.released, false);
});

test("private evidence cannot be relabeled as optimizer-visible development", () => {
  const fixture = createPortfolioFixture();
  sealFixtureDesign(fixture.study);
  const candidate = finishFixtureStage(fixture, "evolve", "candidate", "lineage");
  releaseFixtureValidation(fixture, candidate);
  transition(fixture.study, "validate-a", "running");
  const privateReport = writeEvidence(fixture.root, "private-report.json", "private diagnostics");
  const result = run(["record-evidence", fixture.study, "--stage-id", "validate-a",
    "--evidence-id", "misclassified", "--kind", "final-report", "--role", "development",
    "--path", privateReport], false);
  assert.match(result.stderr, /private gate evidence cannot be labeled development/);
  assert.equal(JSON.parse(run(["status", fixture.study]).stdout).evidence.length, 1);
});

test("an ordinary evaluation also closes optimizer work when its private holdout opens", () => {
  const fixture = createFixture();
  initialize(fixture.study);
  for (const split of ["development", "holdout"]) {
    const source = createDataset(fixture.root, split, `task-${split}`, `Synthetic ${split} case.`);
    run(["add-dataset", fixture.study, "--dataset-id", split, "--split", split, "--source", source]);
  }
  addFixtureStage(fixture.study, "selection", "evaluation", ["development"]);
  addFixtureStage(fixture.study, "ongoing", "evaluation", ["development"]);
  addFixtureStage(fixture.study, "holdout", "holdout", ["holdout"], ["selection"]);
  sealFixtureDesign(fixture.study);
  const report = finishFixtureStage(fixture, "selection");
  const releaseArgs = ["release-holdout", fixture.study, "--selection-id", "ordinary-winner",
    "--selected-stage", "selection", "--selection-evidence", report];
  transition(fixture.study, "ongoing", "running");
  assert.match(run(releaseArgs, false).stderr, /finish or stop all active work before holdout release/);
  transition(fixture.study, "ongoing", "stopped");
  run(releaseArgs);
  addFixtureStage(fixture.study, "late-public", "evaluation", ["development"]);
  assert.match(transition(fixture.study, "late-public", "running", false).stderr, /optimizer-visible work cannot resume/);
  finishFixtureStage(fixture, "holdout", "final-report", "holdout");
  assert.equal(JSON.parse(run(["status", fixture.study]).stdout).nextAction, null);
  assert.equal(JSON.parse(run(["verify", fixture.study]).stdout).ok, true);
});

function createPortfolioFixture({ holdout = false, omitSecondGate = false } = {}) {
  const fixture = createFixture();
  initialize(fixture.study);
  const definitions = [
    ["development-a", "development"], ["development-b", "development"],
    ["validation-a", "validation"], ["validation-b", "validation"],
    ...(holdout ? [["holdout", "holdout"]] : []),
  ];
  for (const [id, split] of definitions) {
    const source = createDataset(fixture.root, id, `task-secret-${id}`, `Independent synthetic case for ${id}.`);
    run(["add-dataset", fixture.study, "--dataset-id", id, "--split", split, "--source", source]);
  }
  addFixtureStage(fixture.study, "evolve", "evolution", ["development-a", "development-b"]);
  addFixtureStage(fixture.study, "validate-a", "validation", ["validation-a"], ["evolve"]);
  if (!omitSecondGate) addFixtureStage(fixture.study, "validate-b", "validation", ["validation-b"], ["evolve"]);
  if (holdout) addFixtureStage(fixture.study, "holdout", "holdout", ["holdout"], ["validate-b"]);
  return fixture;
}

function finishFixtureStage(fixture, stageId, kind = "final-report", role = "report") {
  transition(fixture.study, stageId, "running");
  const source = writeEvidence(fixture.root, `${stageId}-evidence.md`, `Synthetic ${kind} for ${stageId}.`);
  recordEvidence(fixture.study, { evidenceId: `${stageId}-evidence`, stageId, kind, role, visibility: "private", source });
  transition(fixture.study, stageId, "completed");
  return source;
}

function releaseFixtureValidation(fixture, candidate, expectSuccess = true) {
  return run(["release-validation", fixture.study, "--selection-id", "frozen-winner",
    "--selected-stage", "evolve", "--candidate-evidence", candidate], expectSuccess);
}

function releaseFixtureHoldout(fixture, report, expectSuccess = true) {
  return run(["release-holdout", fixture.study, "--selection-id", "verified-winner",
    "--selected-stage", "validate-b", "--selection-evidence", report], expectSuccess);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-organize-"));
  return { root, study: path.join(root, "study") };
}

function addFixtureStage(study, stageId, kind, datasetIds, dependsOn = [], expectSuccess = true) {
  const owner = kind === "evolution" ? "harbor-population-search"
    : kind === "realization" ? "harbor-realize-skill-candidate"
    : kind === "recovery" ? "harbor-resume-external-failures" : "harbor-run-results";
  return run(["add-stage", study, "--stage-id", stageId, "--kind", kind,
    "--owner-skill", owner, ...datasetIds.flatMap((id) => ["--dataset-id", id]),
    ...dependsOn.flatMap((id) => ["--depends-on", id])], expectSuccess);
}

function prepareFixtureDesign(study, editReview = () => {}) {
  const directory = path.join(path.dirname(study), "design-review");
  fs.mkdirSync(directory, { recursive: true });
  const review = {
    schemaVersion: 1,
    reviewer: "synthetic-fixture-curator",
    checks: Object.fromEntries([
      "provenanceAndContamination", "groupIsolation", "surfaceCues",
      "verifierQuality", "coverageAndPower", "accessIsolation",
    ].map((name) => [name, { status: "pass", evidenceFile: "fixture-review.md" }])),
    datasets: fs.readdirSync(path.join(study, "datasets")).map((filename) => {
      const lock = JSON.parse(fs.readFileSync(path.join(study, "datasets", filename), "utf8"));
      return {
        datasetId: lock.datasetId,
        datasetSha256: lock.sha256,
        tasks: lock.tasks.map((task, index) => ({
          taskId: task.taskId, taskSha256: task.sha256,
          groupIds: [`group-${lock.datasetId}-${index}`],
        })),
      };
    }),
  };
  editReview(review);
  fs.writeFileSync(path.join(directory, "review.json"), JSON.stringify(review));
  fs.writeFileSync(path.join(directory, "fixture-review.md"), "Synthetic receipt for organizer contract tests, not a real dataset audit.\n");
  const protocol = writeEvidence(path.dirname(study), "protocol.md", "Synthetic predeclared baseline comparison; all gates required.");
  const baseline = writeEvidence(path.dirname(study), "baseline-skill.md", "Unchanged synthetic baseline.");
  return { directory, protocol, baseline, review };
}

function sealFixtureDesign(study, design = prepareFixtureDesign(study), expectSuccess = true) {
  return run(["seal-design", study, "--protocol", design.protocol,
    "--baseline", design.baseline, "--review", design.directory], expectSuccess);
}

function createDataset(root, datasetName, taskName, marker) {
  const dataset = path.join(root, datasetName);
  const task = path.join(dataset, taskName);
  fs.mkdirSync(task, { recursive: true });
  fs.writeFileSync(path.join(task, "task.toml"), 'version = "1"\n', "utf8");
  fs.writeFileSync(path.join(task, "instruction.md"), `${marker}\n`, "utf8");
  return dataset;
}

function writeEvidence(root, name, content) {
  const output = path.join(root, "evidence", name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${content}\n`, "utf8");
  return output;
}

function initialize(study) {
  return run([
    "init",
    study,
    "--study-id",
    "fixture-study",
    "--title",
    "Fixture Study",
    "--objective",
    "Validate the organizer contract.",
    "--recorded-at",
    RECORDED_AT,
  ]);
}

function transition(study, stageId, status, expectSuccess = true) {
  return run(
    [
      "transition",
      study,
      "--stage-id",
      stageId,
      "--status",
      status,
      "--recorded-at",
      RECORDED_AT,
    ],
    expectSuccess,
  );
}

function recordEvidence(
  study,
  { evidenceId, stageId, kind, role, visibility, source },
) {
  return run([
    "record-evidence",
    study,
    "--evidence-id",
    evidenceId,
    "--stage-id",
    stageId,
    "--kind",
    kind,
    "--role",
    role,
    "--visibility",
    visibility,
    "--path",
    source,
    "--recorded-at",
    RECORDED_AT,
  ]);
}

function run(args, expectSuccess = true) {
  const result = spawnSync(PYTHON, [SCRIPT, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `command failed:\n${result.stderr || result.stdout || result.error?.message}`,
    );
  } else {
    assert.notEqual(result.status, 0, "command unexpectedly succeeded");
  }
  return result;
}

function runGit(cwd, args, expectSuccess = true) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `git command failed:\n${result.stderr || result.stdout || result.error?.message}`,
    );
  }
  return result;
}
