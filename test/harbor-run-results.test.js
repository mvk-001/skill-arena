import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-run-results",
  "scripts",
  "report_harbor_jobs.py",
);
const fixtures = path.resolve(
  "test",
  "fixtures",
  "harbor-jobs",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

function runReporter(args) {
  return spawnSync("uv", ["run", script, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 60000,
  });
}

test("Harbor native reporter writes comparable final JSON and Markdown", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-native-report-"));
  try {
    const outputDirectory = path.join(tempDirectory, "report");
    const completed = runReporter([
      path.join(fixtures, "no-skill"),
      path.join(fixtures, "skill"),
      "--compare",
      "--output-dir",
      outputDirectory,
      "--generated-at",
      "2026-07-14T12:00:00Z",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const report = JSON.parse(
      await fs.readFile(path.join(outputDirectory, "final-report.json"), "utf8"),
    );
    const markdown = await fs.readFile(
      path.join(outputDirectory, "final-report.md"),
      "utf8",
    );
    assert.equal(report.source, "harbor");
    assert.equal(report.comparison.fairnessBasis, "trial-results");
    assert.deepEqual(
      report.jobs.map((job) => ({
        label: job.label,
        passed: job.summary.passedTrials,
        errors: job.summary.erroredTrials,
      })),
      [
        { label: "fixture-no-skill", passed: 1, errors: 1 },
        { label: "fixture-skill", passed: 4, errors: 0 },
      ],
    );
    assert.equal(report.jobs[0].summary.totalTokens.average, 111.25);
    assert.equal(report.jobs[1].summary.agentLatencyMs.average, 1900);
    assert.match(markdown, /\| fixture-skill \| harbor-marker-guide \| 4\/4 \| 4 \|/);
    assert.match(markdown, /\+75\.0 points/);
    assert.doesNotMatch(markdown, /Skill Arena report contract/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
test("Harbor native reporter rejects incomplete jobs by default", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-native-partial-"));
  const jobDirectory = path.join(tempDirectory, "job");
  try {
    await fs.cp(path.join(fixtures, "no-skill"), jobDirectory, { recursive: true });
    await fs.rm(path.join(jobDirectory, "marker-write__codex02"), {
      recursive: true,
      force: true,
    });
    const completed = runReporter([
      jobDirectory,
      "--output-dir",
      path.join(tempDirectory, "report"),
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /Incomplete Harbor job/i);
    await assert.rejects(
      fs.stat(path.join(tempDirectory, "report", "final-report.json")),
      /ENOENT/,
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor native reporter rejects task drift in comparisons", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-native-drift-"));
  const changedJob = path.join(tempDirectory, "skill");
  try {
    await fs.cp(path.join(fixtures, "skill"), changedJob, { recursive: true });
    const trialPath = path.join(changedJob, "marker-write__codex01", "result.json");
    const trial = JSON.parse(await fs.readFile(trialPath, "utf8"));
    trial.task_checksum = "sha256:drifted";
    await fs.writeFile(trialPath, JSON.stringify(trial, null, 2), "utf8");

    const completed = runReporter([
      path.join(fixtures, "no-skill"),
      changedJob,
      "--compare",
      "--output-dir",
      path.join(tempDirectory, "report"),
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /not comparable/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
