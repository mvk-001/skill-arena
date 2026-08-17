import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  assert.equal(verified.datasetCount, 3);
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
  run([
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
  ]);
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

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-organize-"));
  return { root, study: path.join(root, "study") };
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
