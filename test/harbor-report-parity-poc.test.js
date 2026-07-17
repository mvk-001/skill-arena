import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadHarborReportConfig,
  normalizeHarborJobs,
  normalizeHarborTrial,
} from "../skills/harbor-runner/scripts/normalize-harbor-jobs.js";

const evaluationDirectory = path.resolve("evaluations", "harbor-report-parity-poc");
const configPath = path.join(evaluationDirectory, "report-config.yaml");

test("Harbor POC normalizes job trials into the existing matrix and report contract", async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-report-poc-"));
  const loaded = await loadHarborReportConfig(configPath);

  try {
    const result = await normalizeHarborJobs({
      ...loaded,
      outputDirectory,
      generatedAt: "2026-07-13T02:00:00.000Z",
    });

    assert.equal(result.summary.source, "harbor");
    assert.equal(result.summary.promptfooVersion, null);
    assert.deepEqual(
      result.summary.matrix.columns.map((column) => column.id),
      ["no-skill", "skill"],
    );
    assert.equal(result.summary.matrix.rows.length, 2);

    const claudeRow = result.summary.matrix.rows.find((row) => row.variantId === "claude-haiku");
    const codexRow = result.summary.matrix.rows.find((row) => row.variantId === "codex-mini");
    assert.ok(claudeRow);
    assert.ok(codexRow);

    assert.deepEqual(
      pickCellCounts(claudeRow.cells["no-skill"]),
      { requested: 2, completed: 2, passed: 0, failed: 2, errors: 1 },
    );
    assert.equal(claudeRow.cells["no-skill"].tokenUsage.averageTotalTokens, 77.5);
    assert.equal(claudeRow.cells["no-skill"].tokenUsage.stddevTotalTokens, 22.5);
    assert.equal(claudeRow.cells["no-skill"].latency.averageLatencyMs, 1500);
    assert.equal(claudeRow.cells["no-skill"].latency.stddevLatencyMs, 500);
    assert.equal(claudeRow.cells.skill.passedRuns, 2);
    assert.equal(claudeRow.cells.skill.tokenUsage.averageTotalTokens, 120);
    assert.equal(claudeRow.cells.skill.latency.averageLatencyMs, 1400);

    assert.equal(codexRow.cells["no-skill"].passedRuns, 1);
    assert.equal(codexRow.cells["no-skill"].tokenUsage.averageTotalTokens, 145);
    assert.equal(codexRow.cells["no-skill"].latency.averageLatencyMs, 3500);
    assert.equal(codexRow.cells.skill.passedRuns, 2);
    assert.equal(codexRow.cells.skill.tokenUsage.averageTotalTokens, 170);
    assert.equal(codexRow.cells.skill.latency.averageLatencyMs, 2400);

    assert.match(result.report, /^# harbor-report-parity-poc/m);
    assert.match(result.report, /\| Prompt \| Agent\/Config \| no-skill \| skill \|/);
    assert.match(result.report, /Claude Code \/ Haiku \| 0% \(0\/2\).*100% \(2\/2\)/);
    assert.match(result.report, /Codex \/ GPT-5\.1 Mini \| 50% \(1\/2\).*100% \(2\/2\)/);

    await Promise.all([
      fs.stat(result.summaryPath),
      fs.stat(result.mergedArtifacts.mergedSummaryPath),
      fs.stat(result.mergedArtifacts.reportPath),
    ]);
    const persistedSummary = JSON.parse(await fs.readFile(result.summaryPath, "utf8"));
    const persistedReport = await fs.readFile(result.mergedArtifacts.reportPath, "utf8");
    const expectedReport = await fs.readFile(
      path.join(evaluationDirectory, "last_report.md"),
      "utf8",
    );
    assert.equal(persistedSummary.matrix.rows.length, 2);
    assert.equal(persistedReport, result.report);
    assert.equal(persistedReport, expectedReport.trimEnd());
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test("Harbor POC emits the stable normalized attempt fields and does not double-count cache tokens", async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-report-fields-"));
  const loaded = await loadHarborReportConfig(configPath);

  try {
    const result = await normalizeHarborJobs({
      ...loaded,
      outputDirectory,
      generatedAt: "2026-07-13T02:00:00.000Z",
    });
    const output = result.summary.scenarioSummaries
      .find((summary) => summary.scenarioId === "codex-mini-skill")
      .outputs[0];

    assert.deepEqual(Object.keys(output), [
      "index",
      "promptId",
      "promptDescription",
      "scenarioId",
      "scenarioDescription",
      "variantId",
      "variantDisplayName",
      "rowId",
      "profileId",
      "provider",
      "prompt",
      "text",
      "success",
      "score",
      "latencyMs",
      "cost",
      "tokenUsage",
      "sessionUsage",
      "codeMetricsDelta",
      "executionEventHook",
      "error",
    ]);
    assert.equal(output.tokenUsage.prompt, 120);
    assert.equal(output.tokenUsage.cached, 20);
    assert.equal(output.tokenUsage.completion, 30);
    assert.equal(output.tokenUsage.total, 150);
    assert.equal(output.text, "HARBOR-REPORT-PARITY-42");
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test("Harbor POC rejects task drift between profile jobs", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-report-drift-"));
  const skillFixture = path.join(
    evaluationDirectory,
    "fixtures",
    "harbor-jobs",
    "skill",
  );
  const copiedSkillJob = path.join(tempDirectory, "skill");
  await fs.cp(skillFixture, copiedSkillJob, { recursive: true });
  const changedTrialPath = path.join(copiedSkillJob, "marker-write__codex02", "result.json");
  const changedTrial = JSON.parse(await fs.readFile(changedTrialPath, "utf8"));
  changedTrial.task_checksum = "sha256:changed-task";
  await fs.writeFile(changedTrialPath, JSON.stringify(changedTrial, null, 2), "utf8");
  const outputDirectory = path.join(tempDirectory, "output");
  const loaded = await loadHarborReportConfig(configPath);

  try {
    await assert.rejects(
      normalizeHarborJobs({
        ...loaded,
        outputDirectory,
        profileDirectoryOverrides: new Map([["skill", copiedSkillJob]]),
      }),
      /task checksum mismatch/i,
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor POC rejects incomplete profile jobs", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-report-incomplete-"));
  const baselineFixture = path.join(
    evaluationDirectory,
    "fixtures",
    "harbor-jobs",
    "no-skill",
  );
  const copiedBaselineJob = path.join(tempDirectory, "no-skill");
  await fs.cp(baselineFixture, copiedBaselineJob, { recursive: true });
  await fs.rm(path.join(copiedBaselineJob, "marker-write__codex02"), {
    recursive: true,
    force: true,
  });
  const outputDirectory = path.join(tempDirectory, "output");
  const loaded = await loadHarborReportConfig(configPath);

  try {
    await assert.rejects(
      normalizeHarborJobs({
        ...loaded,
        outputDirectory,
        profileDirectoryOverrides: new Map([["no-skill", copiedBaselineJob]]),
      }),
      /has 3 completed trial artifacts; expected 4/i,
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor POC rejects a baseline job mislabeled as the skill profile", async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-report-skills-"));
  const loaded = await loadHarborReportConfig(configPath);
  const baselineFixture = path.join(
    evaluationDirectory,
    "fixtures",
    "harbor-jobs",
    "no-skill",
  );

  try {
    await assert.rejects(
      normalizeHarborJobs({
        ...loaded,
        outputDirectory,
        profileDirectoryOverrides: new Map([["skill", baselineFixture]]),
      }),
      /expected \[harbor-marker-guide\]/i,
    );
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test("Harbor POC reports only complete token totals and sums multi-step agent latency", () => {
  const common = {
    profile: {
      id: "skill",
      description: "Skill profile.",
    },
    variant: {
      id: "codex",
      displayName: "Codex",
    },
    prompt: {
      id: "marker-write",
      description: "Write marker.",
      prompt: "Write marker.",
    },
    rewardKey: "reward",
    passThreshold: 1,
  };
  const partial = normalizeHarborTrial({
    ...common,
    trial: {
      result: {
        trial_name: "partial",
        verifier_result: { rewards: { reward: 1 } },
        agent_result: { n_input_tokens: 10, n_output_tokens: null },
        started_at: "2026-07-13T00:00:00Z",
        finished_at: "2026-07-13T00:01:00Z",
      },
    },
  });
  assert.equal(partial.tokenUsage, null);
  assert.equal(partial.sessionUsage.inputTokens, 10);
  assert.equal(partial.latencyMs, null);

  const multiStep = normalizeHarborTrial({
    ...common,
    trial: {
      result: {
        trial_name: "multi-step",
        verifier_result: { rewards: { reward: 1 } },
        step_results: [
          {
            agent_result: { n_input_tokens: 10, n_output_tokens: 5 },
            agent_execution: {
              started_at: "2026-07-13T00:00:00Z",
              finished_at: "2026-07-13T00:00:01.500Z",
            },
          },
          {
            agent_result: { n_input_tokens: 20, n_output_tokens: 7 },
            agent_execution: {
              started_at: "2026-07-13T00:00:03Z",
              finished_at: "2026-07-13T00:00:05Z",
            },
          },
        ],
      },
    },
  });
  assert.equal(multiStep.tokenUsage.total, 42);
  assert.equal(multiStep.latencyMs, 3500);
});

function pickCellCounts(cell) {
  return {
    requested: cell.requestedRuns,
    completed: cell.completedRuns,
    passed: cell.passedRuns,
    failed: cell.failedRuns,
    errors: cell.errors,
  };
}
