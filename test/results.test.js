import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildMergedBenchmarkSummary,
  normalizePromptfooResults,
  renderMergedBenchmarkReport,
} from "../src/results.js";

test("normalizePromptfooResults extracts stable summary fields", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-results-"));
  const promptfooResultsPath = path.join(tempDirectory, "promptfoo-results.json");

  await fs.writeFile(
    promptfooResultsPath,
    JSON.stringify({
      evalId: "eval-123",
      results: {
        stats: {
          successes: 1,
          failures: 0,
        },
        results: [
          {
            provider: {
              id: "openai:codex-sdk",
            },
            prompt: {
              raw: "Example prompt",
            },
            response: {
              output: "ALPHA-42",
            },
            success: true,
            score: 1,
            latencyMs: 42,
            cost: 0.001,
            gradingResult: {
              tokensUsed: {
                total: 12,
              },
            },
          },
        ],
      },
      metadata: {
        promptfooVersion: "0.121.2",
      },
    }),
    "utf8",
  );

  const summary = await normalizePromptfooResults({
    manifest: {
      benchmark: {
        id: "smoke-skill-following",
        description: "Smoke benchmark",
      },
    },
    scenario: {
      id: "codex-mini-no-skill",
      description: "Baseline scenario",
      skillMode: "disabled",
      agent: {
        adapter: "codex",
        model: "gpt-5.1-codex-mini",
      },
      output: {
        tags: ["baseline"],
        labels: {
          skill: "off",
        },
      },
    },
    workspace: {
      runId: "run-id",
      workspaceDirectory: "C:/temp/workspace",
    },
    promptfooResultsPath,
  });

  assert.equal(summary.benchmarkId, "smoke-skill-following");
  assert.equal(summary.benchmarkDescription, "Smoke benchmark");
  assert.equal(summary.evalId, "eval-123");
  assert.equal(summary.scenarioDescription, "Baseline scenario");
  assert.equal(summary.outputs[0].text, "ALPHA-42");
  assert.equal(summary.outputs[0].provider, "openai:codex-sdk");
  assert.equal(summary.outputLabels.skill, "off");
  assert.equal(summary.stats.successes, 1);
});

test("merged benchmark summary groups outputs by prompt and scenario", () => {
  const mergedSummary = buildMergedBenchmarkSummary({
    manifest: {
      benchmark: {
        id: "comparison-benchmark",
        description: "Comparison benchmark",
      },
    },
    generatedAt: "2026-03-14T00:00:00.000Z",
    scenarioSummaries: [
      {
        scenarioId: "baseline",
        scenarioDescription: "No skill",
        skillMode: "disabled",
        model: "gpt-5.1-codex-mini",
        outputLabels: {
          skill_state: "off",
        },
        outputTags: ["baseline"],
        outputs: [
          {
            promptId: "p1",
            promptDescription: "Prompt one",
            prompt: "Question one",
            text: "wrong",
            success: false,
            score: 0,
            latencyMs: 20,
          },
        ],
      },
      {
        scenarioId: "with-skill",
        scenarioDescription: "With skill",
        skillMode: "enabled",
        model: "gpt-5.1-codex-mini",
        outputLabels: {
          skill_state: "on",
        },
        outputTags: ["skill"],
        outputs: [
          {
            promptId: "p1",
            promptDescription: "Prompt one",
            prompt: "Question one",
            text: "right",
            success: true,
            score: 1,
            latencyMs: 10,
          },
        ],
      },
    ],
  });

  const report = renderMergedBenchmarkReport(mergedSummary);

  assert.equal(mergedSummary.prompts.length, 1);
  assert.equal(mergedSummary.prompts[0].promptId, "p1");
  assert.equal(mergedSummary.prompts[0].scenarios.baseline.failures, 1);
  assert.equal(mergedSummary.prompts[0].scenarios["with-skill"].successes, 1);
  assert.match(report, /Scenario \| Skill \| Runs/);
  assert.match(report, /with-skill/);
});
