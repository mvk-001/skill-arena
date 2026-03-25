import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildCompareMatrixSummary,
  buildMergedBenchmarkSummary,
  normalizeRawPromptfooResults,
  normalizePromptfooResults,
  normalizeOutput,
  writeMergedBenchmarkArtifacts,
  writePromptfooArtifacts,
  renderCompareMatrixReport,
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
  assert.equal(summary.workspaceDirectory, "C:/temp/workspace");
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
  assert.match(report, /\| Prompt \| baseline \| with-skill \|/);
  assert.match(report, /\| Prompt one \| 0% \(0\/1\) \| 100% \(1\/1\) \|/);
});

test("merged benchmark report includes skipped scenarios", () => {
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
        scenarioId: "codex-no-skill",
        scenarioDescription: "No skill",
        skillMode: "disabled",
        model: "gpt-5.1-codex-mini",
        outputLabels: {
          skill_state: "off",
          displayName: "no-skill",
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
    ],
    skippedScenarios: [
      {
        scenarioId: "pi-skill",
        displayName: "pi:skill",
        skillState: "on",
      },
    ],
  });

  const report = renderMergedBenchmarkReport(mergedSummary);

  assert.match(report, /\| Prompt one \| 0% \(0\/1\) \| skipped \|/);
});

test("normalizeOutput captures compare row metadata", () => {
  const output = normalizeOutput({
    provider: "skill",
    prompt: {
      raw: "Prompt text",
    },
    response: {
      output: "{\"ok\":true}",
    },
    success: true,
    metadata: {
      promptId: "gmail",
      promptDescription: "Unread Gmail triage",
      variantId: "codex-worst",
      variantDisplayName: "codex",
      rowId: "codex-worst:gmail",
    },
  }, 0);

  assert.equal(output.provider, "skill");
  assert.equal(output.variantId, "codex-worst");
  assert.equal(output.variantDisplayName, "codex");
  assert.equal(output.rowId, "codex-worst:gmail");
});

test("compare matrix report renders pass ratios by skill-mode column", () => {
  const mergedSummary = buildCompareMatrixSummary({
    manifest: {
      benchmark: {
        id: "gws-gmail-triage-compare",
        description: "Compare Gmail triage skill usage.",
      },
    },
    generatedAt: "2026-03-14T00:00:00.000Z",
    matrix: {
      columns: [
        { id: "no-skill", label: "no-skill" },
        { id: "skill", label: "skill" },
      ],
      rows: [
        {
          rowId: "codex-worst:gmail",
          variantDisplayName: "codex",
          promptId: "gmail",
          promptDescription: "Unread Gmail triage",
          cells: {
            "no-skill": {
              displayValue: "40% (4/10)<br>tokens avg 120, sd 15.5",
            },
            skill: {
              displayValue: "100% (10/10)<br>tokens avg 90.0, sd 0.0",
            },
          },
        },
      ],
    },
  });
  const report = renderCompareMatrixReport(mergedSummary);

  assert.match(report, /\| Prompt \| Agent\/Config \| no-skill \| skill \|/);
  assert.match(
    report,
    /\| Unread Gmail triage \| codex \| 40% \(4\/10\)<br>tokens avg 120, sd 15\.5 \| 100% \(10\/10\)<br>tokens avg 90\.0, sd 0\.0 \|/,
  );
});

test("compare matrix report renders unsupported profile cells", () => {
  const report = renderCompareMatrixReport({
    benchmarkId: "benchmark-id",
    benchmarkDescription: "Benchmark",
    matrix: {
      columns: [
        { id: "baseline", label: "baseline" },
        { id: "agent-profile", label: "agent-profile" },
      ],
      rows: [
        {
          rowId: "codex-mini:prompt-1",
          variantDisplayName: "codex mini",
          promptId: "prompt-1",
          promptDescription: "Prompt 1",
          cells: {
            baseline: {
              displayValue: "100% (1/1)<br>tokens avg 42.0, sd 0.0",
            },
            "agent-profile": {
              displayValue: "unsupported",
            },
          },
        },
      ],
    },
  });

  assert.match(
    report,
    /\| Prompt 1 \| codex mini \| 100% \(1\/1\)<br>tokens avg 42\.0, sd 0\.0 \| unsupported \|/,
  );
});

test("compare matrix report renders code metric deltas in the cell", () => {
  const report = renderCompareMatrixReport({
    benchmarkId: "benchmark-id",
    benchmarkDescription: "Benchmark",
    matrix: {
      columns: [
        { id: "skill", label: "skill" },
      ],
      rows: [
        {
          rowId: "codex-mini:prompt-1",
          variantDisplayName: "codex mini",
          promptId: "prompt-1",
          promptDescription: "Prompt 1",
          cells: {
            skill: {
              displayValue: "100% (1/1)<br>tokens avg 42.0, sd 0.0<br>code loc.sloc avg +1.0, sd 0.0<br>code lexical.digits avg -2.0, sd 0.0",
            },
          },
        },
      ],
    },
  });

  assert.match(
    report,
    /\| Prompt 1 \| codex mini \| 100% \(1\/1\)<br>tokens avg 42\.0, sd 0\.0<br>code loc\.sloc avg \+1\.0, sd 0\.0<br>code lexical\.digits avg -2\.0, sd 0\.0 \|/,
  );
});

test("writePromptfooArtifacts persists config, summary, and copies result files", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-artifacts-"));
  const sourceResultsPath = path.join(tempDirectory, "source-results.json");
  const outputResultsPath = path.join(tempDirectory, "promptfoo-results.json");

  await fs.writeFile(sourceResultsPath, "{\"ok\":true}", "utf8");

  await writePromptfooArtifacts({
    runDirectory: tempDirectory,
    promptfooConfigYaml: "description: test\n",
    promptfooResultsPath: sourceResultsPath,
    promptfooJsonPath: outputResultsPath,
    summary: { ok: true },
  });

  assert.equal(
    await fs.readFile(path.join(tempDirectory, "promptfooconfig.yaml"), "utf8"),
    "description: test\n",
  );
  assert.equal(await fs.readFile(outputResultsPath, "utf8"), "{\"ok\":true}");
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(tempDirectory, "summary.json"), "utf8")),
    { ok: true },
  );
});

test("writeMergedBenchmarkArtifacts writes merged summary and report", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-merged-"));
  const result = await writeMergedBenchmarkArtifacts({
    benchmarkId: "benchmark-id",
    benchmarkRunDirectory: tempDirectory,
    mergedSummary: { benchmarkId: "benchmark-id" },
    cliReport: "# benchmark-id\n",
  });

  assert.equal(result.benchmarkId, "benchmark-id");
  assert.equal(
    await fs.readFile(path.join(tempDirectory, "report.md"), "utf8"),
    "# benchmark-id\n",
  );
});

test("normalizeRawPromptfooResults handles alternate outputs payloads", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-raw-results-"));
  const promptfooResultsPath = path.join(tempDirectory, "promptfoo-results.json");

  await fs.writeFile(
    promptfooResultsPath,
    JSON.stringify({
      results: {
        stats: {
          successes: 2,
        },
        outputs: [
          {
            provider: "skill",
            prompt: "Prompt text",
            output: "DONE",
            success: true,
          },
        ],
      },
    }),
    "utf8",
  );

  const normalized = await normalizeRawPromptfooResults(promptfooResultsPath);

  assert.equal(normalized.stats.successes, 2);
  assert.equal(normalized.outputs[0].provider, "skill");
  assert.equal(normalized.outputs[0].text, "DONE");
});

test("normalizeOutput handles failure fallbacks and testCase metadata", () => {
  const output = normalizeOutput({
    provider: {
      id: "provider-id",
    },
    prompt: "Prompt text",
    output: "Partial",
    failureReason: "Tool error",
    latency: 25,
    tokenUsage: {
      total: 10,
    },
    testCase: {
      metadata: {
        promptId: "prompt-id",
        promptDescription: "Prompt description",
        scenarioId: "scenario-id",
        scenarioDescription: "Scenario description",
        label_variantId: "variant-id",
        label_variantDisplayName: "Variant display",
        executionEventHook: {
          relativePath: ".skill-arena/hooks/execution-events/example.json",
        },
      },
    },
  }, 2);

  const nullFailureOutput = normalizeOutput({
    provider: "provider-id",
    prompt: "Prompt text",
    output: "DONE",
    failureReason: 0,
  }, 3);

  assert.equal(output.provider, "provider-id");
  assert.equal(output.error, "Tool error");
  assert.equal(output.variantId, "variant-id");
  assert.equal(output.variantDisplayName, "Variant display");
  assert.equal(output.latencyMs, 25);
  assert.equal(output.tokenUsage.total, 10);
  assert.equal(
    output.executionEventHook.relativePath,
    ".skill-arena/hooks/execution-events/example.json",
  );
  assert.equal(nullFailureOutput.error, null);
});

test("merged benchmark summary and reports handle defaults, skips, and empty cells", () => {
  const mergedSummary = buildMergedBenchmarkSummary({
    manifest: {
      benchmark: {
        id: "benchmark-id",
        description: "Benchmark",
      },
    },
    generatedAt: "2026-03-14T00:00:00.000Z",
    scenarioSummaries: [
      {
        scenarioId: "scenario-a",
        scenarioDescription: "Scenario A",
        skillMode: "enabled",
        model: "gpt-5",
        outputLabels: {
          reportDisplayName: "Scenario A",
        },
        outputTags: ["tag-a"],
        outputs: [
          {
            promptId: null,
            promptDescription: null,
            prompt: "Prompt A",
            text: "one",
            success: true,
            score: 0.4,
            latencyMs: 10,
          },
          {
            promptId: null,
            promptDescription: null,
            prompt: "Prompt A",
            text: "two",
            success: false,
            score: null,
            latencyMs: null,
          },
          {
            promptId: null,
            promptDescription: null,
            prompt: "Prompt A",
            text: "three",
            success: true,
            score: 0.8,
            latencyMs: 20,
          },
          {
            promptId: null,
            promptDescription: null,
            prompt: "Prompt A",
            text: "four",
            success: true,
            score: 1,
            latencyMs: 30,
          },
        ],
      },
    ],
    skippedScenarios: [
      {
        scenarioId: "scenario-b",
        displayName: "Scenario B",
      },
    ],
  });

  const report = renderMergedBenchmarkReport(mergedSummary);

  assert.equal(mergedSummary.prompts[0].promptId, "default");
  assert.equal(mergedSummary.prompts[0].scenarios["scenario-a"].sampleOutputs.length, 3);
  assert.equal(mergedSummary.prompts[0].scenarios["scenario-a"].avgScore, 0.65);
  assert.equal(mergedSummary.prompts[0].scenarios["scenario-a"].avgLatencyMs, 17.5);
  assert.match(report, /\| default \| 75% \(3\/4\) \| skipped \|/);
});

test("compare matrix summary appends skipped variants and render handles empty columns", () => {
  const mergedSummary = buildCompareMatrixSummary({
    manifest: {
      benchmark: {
        id: "benchmark-id",
        description: "Benchmark",
      },
    },
    generatedAt: "2026-03-14T00:00:00.000Z",
    matrix: {
      columns: [],
      rows: [],
    },
    skippedVariants: [
      {
        variantId: "variant-a",
        variantDisplayName: "Variant A",
        reason: "unsupported",
      },
    ],
    unsupportedCells: [
      {
        variantId: "variant-b",
        profileId: "agent-profile",
        reason: "unsupported capability bundle",
      },
    ],
  });

  assert.equal(mergedSummary.matrix.rows[0].skipped, true);
  assert.equal(mergedSummary.unsupportedCells.length, 1);
  assert.equal(renderCompareMatrixReport(mergedSummary), "# benchmark-id\n\nBenchmark\n");
});
