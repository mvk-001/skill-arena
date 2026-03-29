import fs from "node:fs/promises";
import path from "node:path";

function collectPromptfooRows(resultEnvelope) {
  if (Array.isArray(resultEnvelope.results)) {
    return resultEnvelope.results;
  }

  if (Array.isArray(resultEnvelope.outputs)) {
    return resultEnvelope.outputs;
  }

  return [];
}

function extractPromptfooResultEnvelope(rawResults) {
  const resultEnvelope = rawResults.results ?? {};
  return {
    stats: resultEnvelope.stats ?? {},
    rowResults: collectPromptfooRows(resultEnvelope),
  };
}

async function loadNormalizedPromptfooEnvelope(promptfooResultsPath) {
  const rawResults = JSON.parse(await fs.readFile(promptfooResultsPath, "utf8"));
  const { stats, rowResults } = extractPromptfooResultEnvelope(rawResults);

  return {
    rawResults,
    stats,
    outputs: rowResults.map((output, index) => normalizeOutput(output, index)),
  };
}

function createReportLines(benchmarkId, benchmarkDescription) {
  return [
    `# ${benchmarkId}`,
    "",
    benchmarkDescription ?? "",
    "",
  ];
}

function joinMarkdownLines(lines) {
  return lines.filter((line, index, array) => {
    if (line !== "") {
      return true;
    }

    return array[index - 1] !== "";
  }).join("\n");
}

export async function writePromptfooArtifacts({
  runDirectory,
  promptfooConfigYaml,
  promptfooResultsPath,
  promptfooJsonPath,
  summary,
}) {
  await fs.writeFile(
    path.join(runDirectory, "promptfooconfig.yaml"),
    promptfooConfigYaml,
    "utf8",
  );

  if (promptfooResultsPath && promptfooResultsPath !== promptfooJsonPath) {
    await fs.copyFile(promptfooResultsPath, promptfooJsonPath);
  }

  await fs.writeFile(
    path.join(runDirectory, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
}

export async function writeMergedBenchmarkArtifacts({
  benchmarkId,
  benchmarkRunDirectory,
  mergedSummary,
  cliReport,
}) {
  await fs.mkdir(benchmarkRunDirectory, { recursive: true });
  await fs.writeFile(
    path.join(benchmarkRunDirectory, "merged-summary.json"),
    JSON.stringify(mergedSummary, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(benchmarkRunDirectory, "report.md"),
    cliReport,
    "utf8",
  );

  return {
    benchmarkId,
    benchmarkRunDirectory,
    mergedSummaryPath: path.join(benchmarkRunDirectory, "merged-summary.json"),
    reportPath: path.join(benchmarkRunDirectory, "report.md"),
  };
}

export async function normalizePromptfooResults({
  manifest,
  scenario,
  workspace,
  promptfooResultsPath,
}) {
  const { rawResults, stats, outputs } = await loadNormalizedPromptfooEnvelope(promptfooResultsPath);

  return {
    evalId: rawResults.evalId ?? null,
    promptfooVersion: rawResults.metadata?.promptfooVersion ?? null,
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    scenarioId: scenario.id,
    scenarioDescription: scenario.description ?? null,
    runId: workspace.runId,
    skillMode: scenario.skillMode,
    adapter: scenario.agent.adapter,
    model: scenario.agent.model ?? null,
    outputTags: scenario.output.tags,
    outputLabels: scenario.output.labels,
    workspaceDirectory: workspace.workspaceDirectory,
    promptfooResultsPath,
    stats,
    outputs,
    generatedAt: new Date().toISOString(),
  };
}

export function normalizeOutput(output, index) {
  const failureReason =
    output.failureReason === 0 || output.failureReason === null
      ? null
      : output.failureReason;
  const metadata = output.metadata ?? output.testCase?.metadata ?? {};

  return {
    index,
    promptId: metadata.promptId ?? null,
    promptDescription: metadata.promptDescription ?? null,
    scenarioId: metadata.scenarioId ?? null,
    scenarioDescription:
      metadata.scenarioDescription
      ?? null,
    variantId: metadata.variantId ?? metadata.label_variantId ?? null,
    variantDisplayName:
      metadata.variantDisplayName ?? metadata.label_variantDisplayName ?? null,
    rowId: metadata.rowId ?? null,
    profileId: metadata.profileId ?? metadata.skillModeId ?? null,
    provider:
      typeof output.provider === "string"
        ? output.provider
        : output.provider?.id ?? null,
    prompt: output.prompt?.raw ?? output.prompt ?? null,
    text: output.response?.output ?? output.output ?? null,
    success: output.success ?? null,
    score: output.score ?? null,
    latencyMs: output.latencyMs ?? output.latency ?? null,
    cost: output.cost ?? null,
    tokenUsage:
      output.tokenUsage
      ?? output.response?.tokenUsage
      ?? output.gradingResult?.tokensUsed
      ?? null,
    codeMetricsDelta: metadata.codeMetricsDelta ?? null,
    executionEventHook: metadata.executionEventHook ?? null,
    error: output.error ?? failureReason ?? null,
  };
}

export async function normalizeRawPromptfooResults(promptfooResultsPath) {
  return await loadNormalizedPromptfooEnvelope(promptfooResultsPath);
}

export function buildMergedBenchmarkSummary({
  manifest,
  scenarioSummaries,
  generatedAt,
  skippedScenarios = [],
}) {
  const promptGroups = new Map();

  for (const summary of scenarioSummaries) {
    for (const output of summary.outputs) {
      const promptId = output.promptId ?? "default";
      const promptGroup = getOrCreateMapEntry(promptGroups, promptId, () => ({
        promptId,
        promptDescription: output.promptDescription ?? null,
        prompt: output.prompt,
        scenarios: {},
      }));

      promptGroup.scenarios[summary.scenarioId] = accumulateScenarioEntry(
        promptGroup.scenarios[summary.scenarioId],
        summary,
        output,
      );
    }
  }

  return {
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    generatedAt,
    scenarioCount: scenarioSummaries.length,
    skippedScenarios,
    prompts: [...promptGroups.values()],
  };
}

function accumulateScenarioEntry(existing, summary, output) {
  const entry = existing ?? createInitialScenarioEntry(summary);

  entry.runs += 1;
  entry.successes += output.success ? 1 : 0;
  entry.failures += output.success === false ? 1 : 0;
  entry.avgScore = averageNumbers(entry.avgScore, entry.runs, output.score);
  entry.avgLatencyMs = averageNumbers(entry.avgLatencyMs, entry.runs, output.latencyMs);

  if (entry.sampleOutputs.length < 3 && output.text !== null) {
    entry.sampleOutputs.push(output.text);
  }

  return entry;
}

function createInitialScenarioEntry(summary) {
  return {
    scenarioId: summary.scenarioId,
    scenarioDescription: summary.scenarioDescription,
    skillMode: summary.skillMode,
    model: summary.model,
    outputLabels: summary.outputLabels,
    outputTags: summary.outputTags,
    displayName:
      summary.outputLabels?.reportDisplayName ??
      summary.outputLabels?.displayName ??
      summary.scenarioId,
    status: "completed",
    runs: 0,
    successes: 0,
    failures: 0,
    avgScore: null,
    avgLatencyMs: null,
    sampleOutputs: [],
  };
}

export function buildCompareMatrixSummary({
  manifest,
  matrix,
  skippedVariants = [],
  unsupportedCells = [],
  generatedAt,
}) {
  const rows = (matrix?.rows ?? []).map((row) => ({
    ...row,
    cells: { ...row.cells },
  }));

  for (const skippedVariant of skippedVariants) {
    const hasRowForVariant = rows.some((row) => row.variantId === skippedVariant.variantId);

    if (hasRowForVariant) {
      continue;
    }

    rows.push({
      rowId: `${skippedVariant.variantId}:skipped`,
      variantId: skippedVariant.variantId,
      variantDisplayName: skippedVariant.variantDisplayName,
      promptId: "skipped",
      promptDescription: "skipped",
      prompt: null,
      cells: {},
      skipped: true,
      reason: skippedVariant.reason,
    });
  }

  return {
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    generatedAt,
    unsupportedCells,
    matrix: {
      columns: matrix?.columns ?? [],
      rows,
    },
    skippedVariants,
  };
}

export function renderMergedBenchmarkReport(mergedSummary) {
  const scenarioColumns = buildScenarioColumns(mergedSummary);
  const lines = createReportLines(
    mergedSummary.benchmarkId,
    mergedSummary.benchmarkDescription,
  );

  if (scenarioColumns.length > 0) {
    lines.push("| Prompt | " + scenarioColumns.map((scenario) => scenario.displayName).join(" | ") + " |");
    lines.push("| --- | " + scenarioColumns.map(() => "---:").join(" | ") + " |");

    for (const prompt of mergedSummary.prompts) {
      const promptLabel = prompt.promptDescription ?? prompt.promptId;
      const cells = scenarioColumns.map((scenario) => {
        const promptScenario = prompt.scenarios[scenario.scenarioId];
        return formatScenarioRatio(promptScenario, scenario.status);
      });
      lines.push(`| ${promptLabel} | ${cells.join(" | ")} |`);
    }
  }

  return joinMarkdownLines(lines);
}

export function renderCompareMatrixReport(mergedSummary) {
  const matrix = mergedSummary.matrix ?? { columns: [], rows: [] };
  const columns = matrix.columns ?? [];
  const lines = createReportLines(
    mergedSummary.benchmarkId,
    mergedSummary.benchmarkDescription,
  );

  if (columns.length > 0) {
    lines.push(
      "| Prompt | Agent/Config | " + columns.map((column) => column.label).join(" | ") + " |",
    );
    lines.push("| --- | --- | " + columns.map(() => "---:").join(" | ") + " |");

    for (const row of matrix.rows ?? []) {
      const promptLabel = row.promptDescription ?? row.promptId;
      const cells = columns.map((column) => row.cells[column.id]?.displayValue ?? (row.skipped ? "skipped" : "-"));
      lines.push(`| ${promptLabel} | ${row.variantDisplayName} | ${cells.join(" | ")} |`);
    }
  }

  return joinMarkdownLines(lines);
}

function buildScenarioColumns(mergedSummary) {
  const columns = new Map();

  collectCompletedScenarioColumns(columns, mergedSummary.prompts);
  collectSkippedScenarioColumns(columns, mergedSummary.skippedScenarios ?? []);

  return [...columns.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

function collectCompletedScenarioColumns(columns, prompts) {
  for (const prompt of prompts) {
    for (const scenario of Object.values(prompt.scenarios)) {
      if (!columns.has(scenario.scenarioId)) {
        columns.set(scenario.scenarioId, {
          scenarioId: scenario.scenarioId,
          displayName: scenario.displayName ?? scenario.scenarioId,
          status: scenario.status ?? "completed",
        });
      }
    }
  }
}

function collectSkippedScenarioColumns(columns, skippedScenarios) {
  for (const scenario of skippedScenarios) {
    if (!columns.has(scenario.scenarioId)) {
      columns.set(scenario.scenarioId, {
        scenarioId: scenario.scenarioId,
        displayName: scenario.displayName ?? scenario.scenarioId,
        status: "skipped",
      });
    }
  }
}

function formatScenarioRatio(scenario, status) {
  if (status === "skipped") {
    return "skipped";
  }

  if (!scenario || scenario.runs === 0) {
    return "-";
  }

  const ratio = scenario.successes / scenario.runs;
  return `${formatPercent(ratio)} (${scenario.successes}/${scenario.runs})`;
}

function getOrCreateMapEntry(map, key, createValue) {
  if (!map.has(key)) {
    map.set(key, createValue());
  }

  return map.get(key);
}

/**
 * Numerically stable incremental mean using Welford's method.
 * `count` is the total count *including* the new value.
 */
function averageNumbers(currentAverage, count, nextValue) {
  if (typeof nextValue !== "number") {
    return currentAverage;
  }

  if (currentAverage === null || typeof currentAverage !== "number" || count <= 1) {
    return nextValue;
  }

  // Welford's incremental mean:  mean_n = mean_{n-1} + (x_n - mean_{n-1}) / n
  return currentAverage + (nextValue - currentAverage) / count;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(0)}%`;
}
