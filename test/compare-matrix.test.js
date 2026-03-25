import test from "node:test";
import assert from "node:assert/strict";

import {
  getScenarioVariantId,
  getScenarioVariantDisplayName,
  getScenarioProfileId,
  getScenarioProfileLabel,
  buildRowId,
  buildRouteKey,
  buildMatrix,
  createUnsupportedCellEntry,
  createMatrixCellEntry,
  updateCellEntry,
  createEmptyTokenUsageSummary,
  formatPercent,
  formatNumericMetric,
  formatSignedNumericMetric,
  buildScenarioStats,
} from "../src/compare-matrix.js";

// ── Label accessors ─────────────────────────────────────────────────

test("getScenarioVariantId returns variant label when present", () => {
  const scenario = { id: "fallback", output: { labels: { variant: "codex-mini" } } };
  assert.equal(getScenarioVariantId(scenario), "codex-mini");
});

test("getScenarioVariantId falls back to scenario id", () => {
  const scenario = { id: "scenario-1", output: { labels: {} } };
  assert.equal(getScenarioVariantId(scenario), "scenario-1");
});

test("getScenarioVariantDisplayName prefers variantDisplayName", () => {
  const scenario = {
    id: "s1",
    output: { labels: { variantDisplayName: "Codex Mini", adapterDisplayName: "codex" } },
  };
  assert.equal(getScenarioVariantDisplayName(scenario), "Codex Mini");
});

test("getScenarioVariantDisplayName falls back to adapterDisplayName", () => {
  const scenario = {
    id: "s1",
    output: { labels: { adapterDisplayName: "codex" } },
  };
  assert.equal(getScenarioVariantDisplayName(scenario), "codex");
});

test("getScenarioVariantDisplayName falls back to variant id", () => {
  const scenario = { id: "s1", output: { labels: { variant: "v1" } } };
  assert.equal(getScenarioVariantDisplayName(scenario), "v1");
});

test("getScenarioVariantDisplayName falls back to scenario id", () => {
  const scenario = { id: "fallback-id", output: { labels: {} } };
  assert.equal(getScenarioVariantDisplayName(scenario), "fallback-id");
});

test("getScenarioProfileId prefers profileId", () => {
  const scenario = {
    id: "s1",
    output: { labels: { profileId: "baseline", skillModeId: "no-skill" } },
  };
  assert.equal(getScenarioProfileId(scenario), "baseline");
});

test("getScenarioProfileId falls back to skillModeId", () => {
  const scenario = {
    id: "s1",
    output: { labels: { skillModeId: "skill" } },
  };
  assert.equal(getScenarioProfileId(scenario), "skill");
});

test("getScenarioProfileId falls back to displayName then scenario id", () => {
  const scenario = { id: "s1", output: { labels: { displayName: "Display" } } };
  assert.equal(getScenarioProfileId(scenario), "Display");

  const scenario2 = { id: "s2", output: { labels: {} } };
  assert.equal(getScenarioProfileId(scenario2), "s2");
});

test("getScenarioProfileLabel prefers profileDisplayName", () => {
  const scenario = {
    id: "s1",
    output: { labels: { profileDisplayName: "Baseline Profile", profileId: "baseline" } },
  };
  assert.equal(getScenarioProfileLabel(scenario), "Baseline Profile");
});

test("getScenarioProfileLabel falls back to skillDisplayName", () => {
  const scenario = {
    id: "s1",
    output: { labels: { skillDisplayName: "Skill Mode" } },
  };
  assert.equal(getScenarioProfileLabel(scenario), "Skill Mode");
});

test("getScenarioProfileLabel falls back to profileId chain", () => {
  const scenario = { id: "s1", output: { labels: {} } };
  assert.equal(getScenarioProfileLabel(scenario), "s1");
});

// ── Row / route key helpers ─────────────────────────────────────────

test("buildRowId joins variant and prompt ids", () => {
  assert.equal(buildRowId("v1", "p1"), "v1:p1");
  assert.equal(buildRowId("v1", undefined), "v1:default");
  assert.equal(buildRowId("v1", null), "v1:default");
});

test("buildRouteKey joins variant and skill mode ids", () => {
  assert.equal(buildRouteKey("v1", "baseline"), "v1:baseline");
  assert.equal(buildRouteKey(undefined, undefined), "unknown:unknown");
  assert.equal(buildRouteKey(null, null), "unknown:unknown");
});

// ── Token usage ─────────────────────────────────────────────────────

test("createEmptyTokenUsageSummary returns zeroed structure", () => {
  const summary = createEmptyTokenUsageSummary();
  assert.equal(summary.count, 0);
  assert.equal(summary.averageTotalTokens, null);
  assert.equal(summary.stddevTotalTokens, null);
  assert.deepEqual(summary.samples, []);
});

// ── Unsupported cell entry ──────────────────────────────────────────

test("createUnsupportedCellEntry sets status and fields", () => {
  const cell = createUnsupportedCellEntry({
    profileId: "skill",
    adapter: "codex",
    model: "gpt-5",
    reason: "unsupported capability",
  });

  assert.equal(cell.status, "unsupported");
  assert.equal(cell.profileId, "skill");
  assert.equal(cell.adapter, "codex");
  assert.equal(cell.displayValue, "unsupported");
  assert.equal(cell.requestedRuns, 0);
  assert.equal(cell.passRate, 0);
  assert.equal(cell.reason, "unsupported capability");
  assert.deepEqual(cell.sampleOutputs, []);
});

// ── Matrix cell entry ───────────────────────────────────────────────

test("createMatrixCellEntry initializes from route entry", () => {
  const routeEntry = {
    scenario: {
      id: "s1",
      description: "Test scenario",
      agent: { adapter: "codex", model: "gpt-5" },
      skillMode: "enabled",
      skillSource: "workspace-overlay",
      output: { labels: { profileId: "skill" } },
    },
  };

  const cell = createMatrixCellEntry(routeEntry, 10);
  assert.equal(cell.scenarioId, "s1");
  assert.equal(cell.adapter, "codex");
  assert.equal(cell.model, "gpt-5");
  assert.equal(cell.requestedRuns, 10);
  assert.equal(cell.completedRuns, 0);
  assert.equal(cell.passedRuns, 0);
  assert.equal(cell.displayValue, "-");
});

test("createMatrixCellEntry handles null route entry", () => {
  const cell = createMatrixCellEntry(null, 5);
  assert.equal(cell.scenarioId, null);
  assert.equal(cell.adapter, null);
  assert.equal(cell.model, null);
  assert.equal(cell.requestedRuns, 5);
});

// ── updateCellEntry ─────────────────────────────────────────────────

test("updateCellEntry increments success and pass rate", () => {
  const routeEntry = {
    scenario: {
      id: "s1",
      description: "Test",
      agent: { adapter: "codex", model: "gpt-5" },
      skillMode: "enabled",
      skillSource: "workspace-overlay",
      output: { labels: { profileId: "skill" } },
    },
  };
  const cell = createMatrixCellEntry(routeEntry, 2);

  const output1 = {
    success: true,
    error: null,
    text: "output-1",
    tokenUsage: { total: 100 },
    codeMetricsDelta: null,
  };
  updateCellEntry({ cellEntry: cell, output: output1, evaluationRequests: 2 });

  assert.equal(cell.completedRuns, 1);
  assert.equal(cell.passedRuns, 1);
  assert.equal(cell.failedRuns, 0);
  assert.equal(cell.passRate, 0.5);
  assert.equal(cell.sampleOutputs.length, 1);

  const output2 = {
    success: false,
    error: "timeout",
    text: "output-2",
    tokenUsage: { total: 200 },
    codeMetricsDelta: null,
  };
  updateCellEntry({ cellEntry: cell, output: output2, evaluationRequests: 2 });

  assert.equal(cell.completedRuns, 2);
  assert.equal(cell.passedRuns, 1);
  assert.equal(cell.failedRuns, 1);
  assert.equal(cell.errors, 1);
  assert.equal(cell.passRate, 0.5);
  assert.equal(cell.sampleOutputs.length, 2);
});

test("updateCellEntry limits sample outputs to 3", () => {
  const cell = createMatrixCellEntry(null, 5);

  for (let i = 0; i < 5; i++) {
    updateCellEntry({
      cellEntry: cell,
      output: { success: true, error: null, text: `output-${i}`, tokenUsage: null, codeMetricsDelta: null },
      evaluationRequests: 5,
    });
  }

  assert.equal(cell.sampleOutputs.length, 3);
});

test("updateCellEntry skips null text in sample outputs", () => {
  const cell = createMatrixCellEntry(null, 1);
  updateCellEntry({
    cellEntry: cell,
    output: { success: true, error: null, text: null, tokenUsage: null, codeMetricsDelta: null },
    evaluationRequests: 1,
  });

  assert.equal(cell.sampleOutputs.length, 0);
});

test("updateCellEntry handles token usage as a number", () => {
  const cell = createMatrixCellEntry(null, 1);
  updateCellEntry({
    cellEntry: cell,
    output: { success: true, error: null, text: "ok", tokenUsage: 50, codeMetricsDelta: null },
    evaluationRequests: 1,
  });

  assert.equal(cell.tokenUsage.count, 1);
  assert.equal(cell.tokenUsage.averageTotalTokens, 50);
  assert.equal(cell.tokenUsage.stddevTotalTokens, 0);
});

test("updateCellEntry handles zero evaluationRequests", () => {
  const cell = createMatrixCellEntry(null, 0);
  updateCellEntry({
    cellEntry: cell,
    output: { success: true, error: null, text: "ok", tokenUsage: null, codeMetricsDelta: null },
    evaluationRequests: 0,
  });

  assert.equal(cell.passRate, 0);
});

test("updateCellEntry accumulates code metrics across multiple outputs", () => {
  const cell = createMatrixCellEntry(null, 2);

  updateCellEntry({
    cellEntry: cell,
    output: {
      success: true,
      error: null,
      text: "a",
      tokenUsage: null,
      codeMetricsDelta: {
        changedOriginalFiles: ["file.js"],
        metrics: {
          "loc.sloc": { count: 1, avg: 2, standardDeviation: 0, samples: [2] },
        },
      },
    },
    evaluationRequests: 2,
  });

  updateCellEntry({
    cellEntry: cell,
    output: {
      success: true,
      error: null,
      text: "b",
      tokenUsage: null,
      codeMetricsDelta: {
        changedOriginalFiles: ["file.js", "other.js"],
        metrics: {
          "loc.sloc": { count: 1, avg: 4, standardDeviation: 0, samples: [4] },
        },
      },
    },
    evaluationRequests: 2,
  });

  assert.ok(cell.codeMetrics);
  assert.deepEqual(cell.codeMetrics.changedOriginalFiles, ["file.js", "other.js"]);
  assert.equal(cell.codeMetrics.metrics["loc.sloc"].count, 2);
  assert.equal(cell.codeMetrics.metrics["loc.sloc"].avg, 3);
});

// ── Format helpers ──────────────────────────────────────────────────

test("formatPercent formats to integer percentage", () => {
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(0.5), "50%");
  assert.equal(formatPercent(1), "100%");
  assert.equal(formatPercent(0.333), "33%");
});

test("formatNumericMetric formats values correctly", () => {
  assert.equal(formatNumericMetric(0), "0.0");
  assert.equal(formatNumericMetric(99.5), "99.5");
  assert.equal(formatNumericMetric(100), "100");
  assert.equal(formatNumericMetric(150.7), "151");
  assert.equal(formatNumericMetric(NaN), "n/a");
  assert.equal(formatNumericMetric(Infinity), "n/a");
  assert.equal(formatNumericMetric(null), "n/a");
  assert.equal(formatNumericMetric("string"), "n/a");
});

test("formatSignedNumericMetric adds sign prefix", () => {
  assert.equal(formatSignedNumericMetric(5), "+5.0");
  assert.equal(formatSignedNumericMetric(-3.2), "-3.2");
  assert.equal(formatSignedNumericMetric(0), "+0.0");
  assert.equal(formatSignedNumericMetric(150), "+150");
  assert.equal(formatSignedNumericMetric(NaN), "n/a");
  assert.equal(formatSignedNumericMetric(null), "n/a");
});

// ── buildScenarioStats ──────────────────────────────────────────────

test("buildScenarioStats summarizes outputs", () => {
  const outputs = [
    { success: true, error: null, latencyMs: 100 },
    { success: false, error: "timeout", latencyMs: 200 },
    { success: true, error: null, latencyMs: 50 },
  ];

  const stats = buildScenarioStats(outputs);

  assert.equal(stats.successes, 2);
  assert.equal(stats.failures, 1);
  assert.equal(stats.errors, 1);
  assert.equal(stats.durationMs, 350);
  assert.equal(stats.evaluationDurationMs, 350);
});

test("buildScenarioStats handles empty outputs", () => {
  const stats = buildScenarioStats([]);
  assert.equal(stats.successes, 0);
  assert.equal(stats.failures, 0);
  assert.equal(stats.errors, 0);
  assert.equal(stats.durationMs, 0);
});

test("buildScenarioStats handles missing latencyMs", () => {
  const outputs = [{ success: true, error: null }];
  const stats = buildScenarioStats(outputs);
  assert.equal(stats.durationMs, 0);
  assert.equal(stats.successes, 1);
});

// ── buildMatrix ─────────────────────────────────────────────────────

function createTestScenario({ id, variantId, profileId, variantDisplayName, profileDisplayName }) {
  return {
    id,
    description: `Description for ${id}`,
    agent: { adapter: "codex", model: "gpt-5" },
    skillMode: profileId === "skill" ? "enabled" : "disabled",
    skillSource: profileId === "skill" ? "workspace-overlay" : "none",
    output: {
      labels: {
        variant: variantId,
        variantDisplayName: variantDisplayName ?? variantId,
        profileId,
        profileDisplayName: profileDisplayName ?? profileId,
      },
    },
  };
}

test("buildMatrix constructs a matrix from supported runs and outputs", () => {
  const baselineScenario = createTestScenario({
    id: "s1",
    variantId: "codex-mini",
    profileId: "baseline",
    variantDisplayName: "Codex Mini",
    profileDisplayName: "Baseline",
  });
  const skillScenario = createTestScenario({
    id: "s2",
    variantId: "codex-mini",
    profileId: "skill",
    variantDisplayName: "Codex Mini",
    profileDisplayName: "Skill",
  });

  const manifest = {
    benchmark: { id: "test-bench", description: "Test benchmark" },
    task: {
      prompts: [
        { id: "p1", prompt: "Do something", description: "Prompt 1" },
      ],
    },
  };

  const supportedRuns = [
    { scenario: baselineScenario, workspaceDirectory: "/tmp/ws1" },
    { scenario: skillScenario, workspaceDirectory: "/tmp/ws2" },
  ];

  const routeMap = new Map([
    [buildRouteKey("codex-mini", "baseline"), { scenario: baselineScenario }],
    [buildRouteKey("codex-mini", "skill"), { scenario: skillScenario }],
  ]);

  const outputs = [
    {
      variantId: "codex-mini",
      provider: "baseline",
      promptId: "p1",
      prompt: "Do something",
      success: true,
      error: null,
      text: "result-1",
      tokenUsage: { total: 100 },
      codeMetricsDelta: null,
    },
    {
      variantId: "codex-mini",
      provider: "skill",
      promptId: "p1",
      prompt: "Do something",
      success: true,
      error: null,
      text: "result-2",
      tokenUsage: { total: 200 },
      codeMetricsDelta: null,
    },
  ];

  const matrix = buildMatrix({
    manifest,
    supportedRuns,
    outputs,
    routeMap,
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells: [],
  });

  assert.equal(matrix.benchmarkId, "test-bench");
  assert.equal(matrix.columns.length, 2);
  assert.equal(matrix.rows.length, 1);

  const row = matrix.rows[0];
  assert.equal(row.variantId, "codex-mini");
  assert.equal(row.promptId, "p1");
  assert.ok(row.cells.baseline);
  assert.ok(row.cells.skill);
  assert.equal(row.cells.baseline.passedRuns, 1);
  assert.equal(row.cells.skill.passedRuns, 1);
  // Token usage samples are stripped in serialization
  assert.equal(row.cells.baseline.tokenUsage.count, 1);
  assert.equal(row.cells.baseline.tokenUsage.averageTotalTokens, 100);
});

test("buildMatrix includes skipped cells as unsupported entries", () => {
  const scenario = createTestScenario({
    id: "s1",
    variantId: "codex-mini",
    profileId: "baseline",
  });

  const manifest = {
    benchmark: { id: "test", description: "Test" },
    task: {
      prompts: [{ id: "p1", prompt: "Test prompt" }],
    },
  };

  const supportedRuns = [
    { scenario, workspaceDirectory: "/tmp/ws" },
  ];

  const skippedCells = [
    {
      variantId: "codex-mini",
      variantDisplayName: "Codex Mini",
      profileId: "skill",
      profileDisplayName: "Skill",
      adapter: "codex",
      model: "gpt-5",
      reason: "Unsupported capability",
    },
  ];

  const matrix = buildMatrix({
    manifest,
    supportedRuns,
    outputs: [],
    routeMap: new Map(),
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells,
  });

  assert.equal(matrix.columns.length, 2);
  assert.equal(matrix.rows.length, 1);
  const row = matrix.rows[0];
  assert.equal(row.cells.skill.status, "unsupported");
  assert.equal(row.cells.skill.displayValue, "unsupported");
});

test("buildMatrix sorts rows by variant then prompt", () => {
  const scenarioA = createTestScenario({ id: "s1", variantId: "alpha", profileId: "baseline" });
  const scenarioB = createTestScenario({ id: "s2", variantId: "beta", profileId: "baseline" });

  const manifest = {
    benchmark: { id: "test", description: "Test" },
    task: {
      prompts: [
        { id: "p2", prompt: "Second prompt", description: "B prompt" },
        { id: "p1", prompt: "First prompt", description: "A prompt" },
      ],
    },
  };

  const matrix = buildMatrix({
    manifest,
    supportedRuns: [
      { scenario: scenarioA, workspaceDirectory: "/tmp/ws1" },
      { scenario: scenarioB, workspaceDirectory: "/tmp/ws2" },
    ],
    outputs: [],
    routeMap: new Map(),
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells: [],
  });

  assert.equal(matrix.rows.length, 4);
  assert.equal(matrix.rows[0].variantId, "alpha");
  assert.equal(matrix.rows[0].promptDescription, "A prompt");
  assert.equal(matrix.rows[1].variantId, "alpha");
  assert.equal(matrix.rows[1].promptDescription, "B prompt");
  assert.equal(matrix.rows[2].variantId, "beta");
});

test("buildMatrix handles outputs without rowId by falling back to output fields", () => {
  const scenario = createTestScenario({ id: "s1", variantId: "v1", profileId: "baseline" });

  const manifest = {
    benchmark: { id: "test", description: "Test" },
    task: {
      prompts: [{ id: "default", prompt: "Test" }],
    },
  };

  const routeMap = new Map([
    [buildRouteKey("v1", "baseline"), { scenario }],
  ]);

  const outputs = [
    {
      // no rowId set — force the fallback path
      variantId: "v1",
      provider: "baseline",
      promptId: "default",
      prompt: "Test",
      success: true,
      error: null,
      text: "output",
      tokenUsage: null,
      codeMetricsDelta: null,
    },
  ];

  const matrix = buildMatrix({
    manifest,
    supportedRuns: [{ scenario, workspaceDirectory: "/tmp/ws" }],
    outputs,
    routeMap,
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells: [],
  });

  assert.equal(matrix.rows.length, 1);
  assert.equal(matrix.rows[0].cells.baseline.completedRuns, 1);
});

test("buildMatrix display value includes token and code metric info", () => {
  const scenario = createTestScenario({ id: "s1", variantId: "v1", profileId: "baseline" });

  const manifest = {
    benchmark: { id: "test", description: "Test" },
    task: { prompts: [{ id: "p1", prompt: "Test" }] },
  };

  const routeMap = new Map([
    [buildRouteKey("v1", "baseline"), { scenario }],
  ]);

  const outputs = [
    {
      variantId: "v1",
      provider: "baseline",
      promptId: "p1",
      prompt: "Test",
      success: true,
      error: null,
      text: "result",
      tokenUsage: { total: 100 },
      codeMetricsDelta: {
        changedOriginalFiles: ["main.js"],
        metrics: {
          "loc.sloc": { count: 1, avg: 5, standardDeviation: 0, samples: [5] },
        },
      },
    },
  ];

  const matrix = buildMatrix({
    manifest,
    supportedRuns: [{ scenario, workspaceDirectory: "/tmp/ws" }],
    outputs,
    routeMap,
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells: [],
  });

  const displayValue = matrix.rows[0].cells.baseline.displayValue;
  assert.ok(displayValue.includes("100%"));
  assert.ok(displayValue.includes("tokens avg"));
  assert.ok(displayValue.includes("code loc.sloc"));
});

test("buildMatrix strips token usage samples and code metric samples in output", () => {
  const scenario = createTestScenario({ id: "s1", variantId: "v1", profileId: "baseline" });

  const manifest = {
    benchmark: { id: "test", description: "Test" },
    task: { prompts: [{ id: "p1", prompt: "Test" }] },
  };

  const routeMap = new Map([
    [buildRouteKey("v1", "baseline"), { scenario }],
  ]);

  const outputs = [
    {
      variantId: "v1",
      provider: "baseline",
      promptId: "p1",
      prompt: "Test",
      success: true,
      error: null,
      text: "ok",
      tokenUsage: { total: 100 },
      codeMetricsDelta: {
        changedOriginalFiles: ["a.js"],
        metrics: { cyclomatic: { count: 1, avg: 2, standardDeviation: 0, samples: [2] } },
      },
    },
  ];

  const matrix = buildMatrix({
    manifest,
    supportedRuns: [{ scenario, workspaceDirectory: "/tmp/ws" }],
    outputs,
    routeMap,
    evaluationRequests: 1,
    compareRunDirectory: "/tmp/run",
    skippedCells: [],
  });

  const cell = matrix.rows[0].cells.baseline;
  // Samples should be stripped
  assert.equal(cell.tokenUsage.samples, undefined);
  assert.equal(cell.codeMetrics.metrics.cyclomatic.samples, undefined);
});
