/**
 * Compare matrix construction helpers.
 *
 * Extracted from run-compare.js to reduce cognitive complexity
 * and improve maintainability index (rust-code-analysis).
 */

import { summarizeSamples } from "./code-metrics.js";

// ── Scenario label accessors ───────────────────────────────────────

export function getScenarioVariantId(scenario) {
  return scenario.output.labels.variant ?? scenario.id;
}

export function getScenarioVariantDisplayName(scenario) {
  return (
    scenario.output.labels.variantDisplayName ??
    scenario.output.labels.adapterDisplayName ??
    getScenarioVariantId(scenario)
  );
}

export function getScenarioProfileId(scenario) {
  return (
    scenario.output.labels.profileId ??
    scenario.output.labels.skillModeId ??
    scenario.output.labels.displayName ??
    scenario.id
  );
}

export function getScenarioProfileLabel(scenario) {
  return (
    scenario.output.labels.profileDisplayName ??
    scenario.output.labels.skillDisplayName ??
    getScenarioProfileId(scenario)
  );
}

// ── Row / route key helpers ────────────────────────────────────────

export function buildRowId(variantId, promptId) {
  return `${variantId}:${promptId ?? "default"}`;
}

export function buildRouteKey(variantId, skillModeId) {
  return `${variantId ?? "unknown"}:${skillModeId ?? "unknown"}`;
}

// ── Matrix construction ────────────────────────────────────────────

export function buildMatrix({
  manifest,
  supportedRuns,
  outputs,
  routeMap,
  evaluationRequests,
  compareRunDirectory,
  skippedCells,
}) {
  const columns = buildMatrixColumns(supportedRuns, skippedCells);
  const rows = buildMatrixRows(manifest.task.prompts, supportedRuns, skippedCells);

  applyUnsupportedCells(rows, manifest.task.prompts, skippedCells);
  applyOutputsToRows(rows, outputs, routeMap, evaluationRequests);

  return {
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    compareRunDirectory,
    columns: [...columns.values()],
    rows: sortAndStripRows(rows),
  };
}

function buildMatrixColumns(supportedRuns, skippedCells) {
  const columns = new Map();

  for (const { scenario } of supportedRuns) {
    const id = getScenarioProfileId(scenario);
    columns.set(id, { id, label: getScenarioProfileLabel(scenario) });
  }

  for (const cell of skippedCells) {
    columns.set(cell.profileId, {
      id: cell.profileId,
      label: cell.profileDisplayName ?? cell.profileId,
    });
  }

  return columns;
}

function buildMatrixRows(taskPrompts, supportedRuns, skippedCells) {
  const rows = new Map();
  const variants = buildMatrixVariantEntries(supportedRuns, skippedCells);

  for (const variant of variants.values()) {
    for (const taskPrompt of taskPrompts) {
      const rowId = buildRowId(variant.variantId, taskPrompt.id);
      rows.set(rowId, {
        rowId,
        variantId: variant.variantId,
        variantDisplayName: variant.variantDisplayName,
        promptId: taskPrompt.id,
        promptDescription: taskPrompt.description ?? null,
        prompt: taskPrompt.prompt,
        cells: {},
      });
    }
  }

  return rows;
}

function buildMatrixVariantEntries(supportedRuns, skippedCells) {
  const entries = new Map();

  for (const { scenario } of supportedRuns) {
    const id = getScenarioVariantId(scenario);
    entries.set(id, {
      variantId: id,
      variantDisplayName: getScenarioVariantDisplayName(scenario),
    });
  }

  for (const cell of skippedCells) {
    entries.set(cell.variantId, {
      variantId: cell.variantId,
      variantDisplayName: cell.variantDisplayName ?? cell.variantId,
    });
  }

  return entries;
}

function applyUnsupportedCells(rows, taskPrompts, skippedCells) {
  for (const skippedCell of skippedCells) {
    for (const taskPrompt of taskPrompts) {
      const rowId = buildRowId(skippedCell.variantId, taskPrompt.id);
      const rowEntry = rows.get(rowId);
      if (rowEntry) {
        rowEntry.cells[skippedCell.profileId] = createUnsupportedCellEntry(skippedCell);
      }
    }
  }
}

function applyOutputsToRows(rows, outputs, routeMap, evaluationRequests) {
  for (const output of outputs) {
    const rowId = output.rowId ?? buildOutputRowId(output);
    const rowEntry = rows.get(rowId) ?? createOutputRowEntry(output, rowId);
    const routeEntry = routeMap.get(buildRouteKey(output.variantId, output.provider));

    rowEntry.cells[output.provider] = updateCellEntry({
      cellEntry: rowEntry.cells[output.provider] ?? createMatrixCellEntry(routeEntry, evaluationRequests),
      output,
      evaluationRequests,
    });

    rows.set(rowId, rowEntry);
  }
}

function sortAndStripRows(rows) {
  return [...rows.values()]
    .sort((left, right) => {
      const variantOrder = left.variantDisplayName.localeCompare(right.variantDisplayName);
      return variantOrder !== 0
        ? variantOrder
        : (left.promptDescription ?? left.promptId).localeCompare(
            right.promptDescription ?? right.promptId,
          );
    })
    .map(stripCellComputationState);
}

// ── Cell helpers ───────────────────────────────────────────────────

export function createUnsupportedCellEntry(skippedCell) {
  return {
    status: "unsupported",
    profileId: skippedCell.profileId,
    adapter: skippedCell.adapter,
    model: skippedCell.model,
    requestedRuns: 0,
    completedRuns: 0,
    passedRuns: 0,
    failedRuns: 0,
    errors: 0,
    passRate: 0,
    displayValue: "unsupported",
    tokenUsage: createEmptyTokenUsageSummary(),
    latency: createEmptyLatencySummary(),
    codeMetrics: null,
    sampleOutputs: [],
    reason: skippedCell.reason,
  };
}

function buildOutputRowId(output) {
  return buildRowId(output.variantId ?? "unknown", output.promptId ?? "default");
}

function createOutputRowEntry(output, rowId) {
  return {
    rowId,
    variantId: output.variantId ?? "unknown",
    variantDisplayName: output.variantDisplayName ?? output.variantId ?? "unknown",
    promptId: output.promptId ?? "default",
    promptDescription: output.promptDescription ?? null,
    prompt: output.prompt,
    cells: {},
  };
}

export function createMatrixCellEntry(routeEntry, evaluationRequests) {
  return {
    scenarioId: routeEntry?.scenario.id ?? null,
    scenarioDescription: routeEntry?.scenario.description ?? null,
    adapter: routeEntry?.scenario.agent.adapter ?? null,
    model: routeEntry?.scenario.agent.model ?? null,
    profileId: routeEntry ? getScenarioProfileId(routeEntry.scenario) : null,
    skillMode: routeEntry?.scenario.skillMode ?? null,
    skillSource: routeEntry?.scenario.skillSource ?? null,
    labels: routeEntry?.scenario.output.labels ?? {},
    requestedRuns: evaluationRequests,
    completedRuns: 0,
    passedRuns: 0,
    failedRuns: 0,
    errors: 0,
    passRate: 0,
    displayValue: "-",
    tokenUsage: createEmptyTokenUsageSummary(),
    latency: createEmptyLatencySummary(),
    codeMetrics: null,
    sampleOutputs: [],
  };
}

export function updateCellEntry({ cellEntry, output, evaluationRequests }) {
  cellEntry.completedRuns += 1;
  cellEntry.passedRuns += output.success ? 1 : 0;
  cellEntry.failedRuns += output.success === false ? 1 : 0;
  cellEntry.errors += isExecutionError(output) ? 1 : 0;
  cellEntry.passRate =
    evaluationRequests > 0 ? cellEntry.passedRuns / evaluationRequests : 0;
  cellEntry.tokenUsage = buildTokenUsageSummary(
    cellEntry.tokenUsage,
    output.tokenUsage,
  );
  cellEntry.latency = buildLatencySummary(cellEntry.latency, output.latencyMs);
  cellEntry.codeMetrics = buildCodeMetricsSummary(
    cellEntry.codeMetrics,
    output.codeMetricsDelta,
  );
  cellEntry.displayValue = formatCellDisplayValue({
    passRate: cellEntry.passRate,
    passedRuns: cellEntry.passedRuns,
    evaluationRequests,
    tokenUsage: cellEntry.tokenUsage,
    latency: cellEntry.latency,
    codeMetrics: cellEntry.codeMetrics,
  });

  if (cellEntry.sampleOutputs.length < 3 && output.text !== null) {
    cellEntry.sampleOutputs.push(output.text);
  }

  return cellEntry;
}

// ── Token usage ────────────────────────────────────────────────────

export function createEmptyTokenUsageSummary() {
  return {
    count: 0,
    averageTotalTokens: null,
    stddevTotalTokens: null,
    samples: [],
  };
}

export function createEmptyLatencySummary() {
  return {
    count: 0,
    averageLatencyMs: null,
    stddevLatencyMs: null,
    samples: [],
  };
}

function buildTokenUsageSummary(currentSummary, tokenUsage) {
  const previous = currentSummary ?? createEmptyTokenUsageSummary();
  const totalTokens = extractTotalTokens(tokenUsage);

  if (typeof totalTokens !== "number") {
    return previous;
  }

  const samples = [
    ...(Array.isArray(previous.samples) ? previous.samples : []),
    totalTokens,
  ];

  return summarizeTokenSamples(samples);
}

function extractTotalTokens(tokenUsage) {
  if (typeof tokenUsage === "number" && Number.isFinite(tokenUsage)) {
    return tokenUsage;
  }

  if (tokenUsage && typeof tokenUsage.total === "number" && Number.isFinite(tokenUsage.total)) {
    return tokenUsage.total;
  }

  return null;
}

function summarizeTokenSamples(samples) {
  const summary = summarizeNumericSamples(samples);
  return {
    count: summary.count,
    averageTotalTokens: summary.average,
    stddevTotalTokens: summary.stddev,
    samples: summary.samples,
  };
}

// ── Latency ────────────────────────────────────────────────────────

function buildLatencySummary(currentSummary, latencyMs) {
  const previous = currentSummary ?? createEmptyLatencySummary();

  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) {
    return previous;
  }

  const samples = [
    ...(Array.isArray(previous.samples) ? previous.samples : []),
    latencyMs,
  ];

  const summary = summarizeNumericSamples(samples);
  return {
    count: summary.count,
    averageLatencyMs: summary.average,
    stddevLatencyMs: summary.stddev,
    samples: summary.samples,
  };
}

function summarizeNumericSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return { count: 0, average: null, stddev: null, samples: [] };
  }

  const count = samples.length;
  const average = samples.reduce((sum, v) => sum + v, 0) / count;
  const variance =
    samples.reduce((sum, v) => sum + (v - average) ** 2, 0) / count;

  return {
    count,
    average,
    stddev: Math.sqrt(variance),
    samples,
  };
}

// ── Code metrics summary ───────────────────────────────────────────

function buildCodeMetricsSummary(currentSummary, codeMetricsDelta) {
  if (!currentSummary && !hasMetricSummaryMap(codeMetricsDelta?.metrics)) {
    return null;
  }

  const previous = currentSummary ?? { changedOriginalFiles: [], metrics: {} };

  if (!hasMetricSummaryMap(codeMetricsDelta?.metrics)) {
    return previous;
  }

  const changedOriginalFiles = [
    ...new Set([
      ...(Array.isArray(previous.changedOriginalFiles) ? previous.changedOriginalFiles : []),
      ...(Array.isArray(codeMetricsDelta.changedOriginalFiles)
        ? codeMetricsDelta.changedOriginalFiles
        : []),
    ]),
  ].sort();

  const metrics = mergeCodeMetricSummaries(previous.metrics, codeMetricsDelta.metrics);

  return Object.keys(metrics).length === 0 ? previous : { changedOriginalFiles, metrics };
}

function hasMetricSummaryMap(metrics) {
  return metrics && typeof metrics === "object";
}

function mergeCodeMetricSummaries(previousMetrics, nextMetrics) {
  const metricNames = new Set([
    ...Object.keys(previousMetrics ?? {}),
    ...Object.keys(nextMetrics ?? {}),
  ]);
  const metrics = {};

  for (const name of metricNames) {
    const samples = [
      ...readMetricSamples(previousMetrics, name),
      ...readMetricSamples(nextMetrics, name),
    ];

    if (samples.length > 0) {
      metrics[name] = summarizeSamples(samples);
    }
  }

  return metrics;
}

function readMetricSamples(metrics, name) {
  return Array.isArray(metrics?.[name]?.samples) ? metrics[name].samples : [];
}

// ── Display formatting ─────────────────────────────────────────────

export function formatPercent(value) {
  return `${(value * 100).toFixed(0)}%`;
}

function formatCellDisplayValue({
  passRate,
  passedRuns,
  evaluationRequests,
  tokenUsage,
  latency,
  codeMetrics,
}) {
  const lines = [`${formatPercent(passRate)} (${passedRuns}/${evaluationRequests})`];

  const tokensText = formatTokenUsageDisplay(tokenUsage);
  if (tokensText) {
    lines.push(`tokens avg ${tokensText.average}, sd ${tokensText.stddev}`);
  }

  const latencyText = formatLatencyDisplay(latency);
  if (latencyText) {
    lines.push(`time avg ${latencyText.average} ms, sd ${latencyText.stddev} ms`);
  }

  lines.push(...formatCodeMetricsDisplay(codeMetrics));
  return lines.join("<br>");
}

function formatTokenUsageDisplay(tokenUsage) {
  if (!tokenUsage || tokenUsage.count === 0) {
    return null;
  }

  return {
    average: formatNumericMetric(tokenUsage.averageTotalTokens),
    stddev: formatNumericMetric(tokenUsage.stddevTotalTokens),
  };
}

function formatLatencyDisplay(latency) {
  if (!latency || latency.count === 0) {
    return null;
  }

  return {
    average: formatNumericMetric(latency.averageLatencyMs),
    stddev: formatNumericMetric(latency.stddevLatencyMs),
  };
}

function formatCodeMetricsDisplay(codeMetrics) {
  return Object.entries(codeMetrics?.metrics ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, summary]) =>
        `code ${name} avg ${formatSignedNumericMetric(summary.avg)}, sd ${formatNumericMetric(summary.standardDeviation)}`,
    );
}

export function formatNumericMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(value >= 100 ? 0 : 1);
}

export function formatSignedNumericMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  const formatted = formatNumericMetric(Math.abs(value));
  return formatted === "n/a" ? formatted : `${value >= 0 ? "+" : "-"}${formatted}`;
}

// ── Strip internal state before serialization ──────────────────────

function stripCellComputationState(row) {
  return {
    ...row,
    cells: Object.fromEntries(
      Object.entries(row.cells ?? {}).map(([cellId, cell]) => [
        cellId,
        stripSingleCellState(cell),
      ]),
    ),
  };
}

function stripSingleCellState(cell) {
  return {
    ...cell,
    tokenUsage: cell.tokenUsage
      ? {
          count: cell.tokenUsage.count ?? 0,
          averageTotalTokens: cell.tokenUsage.averageTotalTokens ?? null,
          stddevTotalTokens: cell.tokenUsage.stddevTotalTokens ?? null,
        }
      : null,
    latency: cell.latency
      ? {
          count: cell.latency.count ?? 0,
          averageLatencyMs: cell.latency.averageLatencyMs ?? null,
          stddevLatencyMs: cell.latency.stddevLatencyMs ?? null,
        }
      : null,
    codeMetrics: cell.codeMetrics
      ? {
          changedOriginalFiles: cell.codeMetrics.changedOriginalFiles ?? [],
          metrics: Object.fromEntries(
            Object.entries(cell.codeMetrics.metrics ?? {}).map(
              ([metricName, summary]) => [
                metricName,
                {
                  count: summary.count ?? 0,
                  avg: summary.avg ?? null,
                  standardDeviation: summary.standardDeviation ?? null,
                },
              ],
            ),
          ),
        }
      : null,
  };
}

// ── Scenario stats ─────────────────────────────────────────────────

export function buildScenarioStats(outputs) {
  const stats = outputs.reduce(
    (summary, output) => {
      summary.successes += output.success ? 1 : 0;
      summary.failures += output.success === false ? 1 : 0;
      summary.errors += isExecutionError(output) ? 1 : 0;
      summary.durationMs +=
        typeof output.latencyMs === "number" ? output.latencyMs : 0;
      return summary;
    },
    { successes: 0, failures: 0, errors: 0, durationMs: 0 },
  );

  return { ...stats, evaluationDurationMs: stats.durationMs };
}

function isExecutionError(output) {
  if (!output?.error) {
    return false;
  }

  if (
    output.success === false &&
    typeof output.error === "string" &&
    output.error.startsWith("Custom function returned false")
  ) {
    return false;
  }

  return true;
}
