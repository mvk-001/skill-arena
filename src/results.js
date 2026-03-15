import fs from "node:fs/promises";
import path from "node:path";

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
  const rawResults = JSON.parse(await fs.readFile(promptfooResultsPath, "utf8"));
  const resultEnvelope = rawResults.results ?? {};
  const stats = resultEnvelope.stats ?? {};
  const rowResults = Array.isArray(resultEnvelope.results)
    ? resultEnvelope.results
    : Array.isArray(resultEnvelope.outputs)
      ? resultEnvelope.outputs
      : [];

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
    outputs: rowResults.map((output, index) => normalizeOutput(output, index)),
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
    tokenUsage: output.tokenUsage ?? output.gradingResult?.tokensUsed ?? null,
    error: output.error ?? failureReason ?? null,
  };
}

export async function normalizeRawPromptfooResults(promptfooResultsPath) {
  const rawResults = JSON.parse(await fs.readFile(promptfooResultsPath, "utf8"));
  const resultEnvelope = rawResults.results ?? {};
  const stats = resultEnvelope.stats ?? {};
  const rowResults = Array.isArray(resultEnvelope.results)
    ? resultEnvelope.results
    : Array.isArray(resultEnvelope.outputs)
      ? resultEnvelope.outputs
      : [];

  return {
    rawResults,
    stats,
    outputs: rowResults.map((output, index) => normalizeOutput(output, index)),
  };
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

      const scenarioEntry = promptGroup.scenarios[summary.scenarioId] ?? {
        scenarioId: summary.scenarioId,
        scenarioDescription: summary.scenarioDescription,
        skillMode: summary.skillMode,
        model: summary.model,
        outputLabels: summary.outputLabels,
        outputTags: summary.outputTags,
        displayName:
          summary.outputLabels?.reportDisplayName
          ?? summary.outputLabels?.displayName
          ?? summary.scenarioId,
        status: "completed",
        runs: 0,
        successes: 0,
        failures: 0,
        avgScore: null,
        avgLatencyMs: null,
        sampleOutputs: [],
      };

      scenarioEntry.runs += 1;
      scenarioEntry.successes += output.success ? 1 : 0;
      scenarioEntry.failures += output.success === false ? 1 : 0;
      scenarioEntry.avgScore = averageNumbers(scenarioEntry.avgScore, scenarioEntry.runs, output.score);
      scenarioEntry.avgLatencyMs = averageNumbers(
        scenarioEntry.avgLatencyMs,
        scenarioEntry.runs,
        output.latencyMs,
      );

      if (scenarioEntry.sampleOutputs.length < 3 && output.text !== null) {
        scenarioEntry.sampleOutputs.push(output.text);
      }

      promptGroup.scenarios[summary.scenarioId] = scenarioEntry;
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

export function buildCompareMatrixSummary({
  manifest,
  matrix,
  skippedVariants = [],
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
    matrix: {
      columns: matrix?.columns ?? [],
      rows,
    },
    skippedVariants,
  };
}

export function renderMergedBenchmarkReport(mergedSummary) {
  const scenarioColumns = buildScenarioColumns(mergedSummary);
  const lines = [
    `# ${mergedSummary.benchmarkId}`,
    "",
    mergedSummary.benchmarkDescription ?? "",
    "",
  ];

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

  return lines.filter((line, index, array) => {
    if (line !== "") {
      return true;
    }
    return array[index - 1] !== "";
  }).join("\n");
}

export function renderCompareMatrixReport(mergedSummary) {
  const matrix = mergedSummary.matrix ?? { columns: [], rows: [] };
  const columns = matrix.columns ?? [];
  const lines = [
    `# ${mergedSummary.benchmarkId}`,
    "",
    mergedSummary.benchmarkDescription ?? "",
    "",
  ];

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

  return lines.filter((line, index, array) => {
    if (line !== "") {
      return true;
    }
    return array[index - 1] !== "";
  }).join("\n");
}

function buildScenarioColumns(mergedSummary) {
  const completedScenarios = new Map();

  for (const prompt of mergedSummary.prompts) {
    for (const scenario of Object.values(prompt.scenarios)) {
      if (!completedScenarios.has(scenario.scenarioId)) {
        completedScenarios.set(scenario.scenarioId, {
          scenarioId: scenario.scenarioId,
          displayName: scenario.displayName ?? scenario.scenarioId,
          status: scenario.status ?? "completed",
        });
      }
    }
  }

  for (const scenario of mergedSummary.skippedScenarios ?? []) {
    if (!completedScenarios.has(scenario.scenarioId)) {
      completedScenarios.set(scenario.scenarioId, {
        scenarioId: scenario.scenarioId,
        displayName: scenario.displayName ?? scenario.scenarioId,
        status: "skipped",
      });
    }
  }

  return [...completedScenarios.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
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

function averageNumbers(currentAverage, count, nextValue) {
  if (typeof nextValue !== "number") {
    return currentAverage;
  }

  if (currentAverage === null || typeof currentAverage !== "number" || count <= 1) {
    return nextValue;
  }

  return ((currentAverage * (count - 1)) + nextValue) / count;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(0)}%`;
}
