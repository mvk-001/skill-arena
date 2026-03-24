import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { buildPromptfooProvider, getAdapter } from "../adapters.js";
import { summarizeSamples } from "../code-metrics.js";
import { expandCompareConfigToManifest, loadCompareConfig } from "../compare.js";
import {
  buildCompareMatrixSummary,
  normalizeRawPromptfooResults,
  renderCompareMatrixReport,
  writeMergedBenchmarkArtifacts,
  writePromptfooArtifacts,
} from "../results.js";
import {
  flattenLabels,
  getTaskPrompts,
  resolvePromptAssertions,
  stringifyPromptfooConfig,
  toPromptfooAssertion,
} from "../promptfoo-config.js";
import { mapWithConcurrency, resolveEvaluationConcurrency } from "../concurrency.js";
import { ensureCompareScenarioLocalPaths } from "../compare-bootstrap.js";
import { fromPackageRoot } from "../project-paths.js";
import { materializeWorkspace, syncExecutionWorkspaceToArtifacts } from "../workspace.js";
import { ensureKnownLongOptions, parsePositiveIntegerOption } from "./cli-options.js";

let latestCompareArtifacts = null;

async function main() {
  const runtimeOptions = parseCompareRuntimeOptions(process.argv);
  const {
    compareConfigPath,
    dryRun,
    requestsOverride,
    maxConcurrencyOverride,
    verboseOutput,
    outputRootDirectory,
  } = runtimeOptions;

  if (!compareConfigPath) {
    throw new Error(
      "Usage: node ./src/cli/run-compare.js <compare-config-path> [--requests <n>] [--max-concurrency <n>] [--dry-run] [--verbose]",
    );
  }

  const { compareConfig: loadedCompareConfig } = await loadCompareConfig(compareConfigPath, {
    cwd: outputRootDirectory,
  });
  const compareConfig = applyRuntimeOverrides({
    compareConfig: loadedCompareConfig,
    requestsOverride,
    maxConcurrencyOverride,
  });
  const effectiveConcurrency = resolveEvaluationConcurrency(compareConfig.evaluation);
  const effectiveEvalTimeoutMs = resolveCompareEvalTimeoutMs(compareConfig, effectiveConcurrency);
  const manifest = expandCompareConfigToManifest(compareConfig);
  const {
    supportedScenarios,
    skippedVariants,
    skippedCells,
  } = classifyCompareScenarios(manifest.scenarios);
  const supportedRuns = [];

  printExecutionPlan({
    compareConfig,
    compareConfigPath,
    manifest,
    supportedScenarios,
    skippedVariants,
    skippedCells,
    outputRootDirectory,
    effectiveConcurrency,
    effectiveEvalTimeoutMs,
  });
  console.log("");

  const {
    benchmarkRunDirectory,
    executionLogPath,
  } = await initializeCompareRunArtifacts({
    outputRootDirectory,
    benchmarkId: manifest.benchmark.id,
    effectiveConcurrency,
  });
  const materializationStartMs = Date.now();

  const materializedRuns = await mapWithConcurrency(
    supportedScenarios,
    effectiveConcurrency,
    async (scenario) => {
      await ensureCompareScenarioLocalPaths({
        manifest,
        scenario,
        outputRootDirectory,
      });

      return {
        scenario,
        workspace: await materializeWorkspace({
          manifest,
          scenario,
          outputRootDirectory,
          sourceBaseDirectory: outputRootDirectory,
        }),
      };
    },
  );
  supportedRuns.push(...materializedRuns);
  await logExecution(
    executionLogPath,
    `workspace materialization completed in ${formatDurationMs(Date.now() - materializationStartMs)}`,
  );

  const promptfooConfig = buildComparePromptfooConfig({
    manifest,
    runs: supportedRuns,
  });
  const promptfooConfigYaml = stringifyPromptfooConfig(promptfooConfig);
  const promptfooConfigPath = path.join(benchmarkRunDirectory, "promptfooconfig.yaml");
  const promptfooResultsPath = path.join(benchmarkRunDirectory, "promptfoo-results.json");
  const summaryPath = path.join(benchmarkRunDirectory, "summary.json");

  latestCompareArtifacts = await writeInitialCompareArtifacts({
    compareRunDirectory: benchmarkRunDirectory,
    promptfooConfigPath,
    promptfooResultsPath,
    summaryPath,
    executionLogPath,
    promptfooConfigYaml,
  });
  if (verboseOutput) {
    printCompareArtifactPaths(latestCompareArtifacts);
  }

  if (dryRun) {
    await logExecution(executionLogPath, "dry-run completed without promptfoo eval");
    if (verboseOutput) {
      printCompareArtifactPaths(latestCompareArtifacts);
    }
    printSkipped(skippedVariants);

    console.log("");
    console.log("## Execution status");
    console.log("| Status | Detail |");
    console.log("| --- | --- |");
    console.log("| `--dry-run` | Planned execution only, no evaluation run |");
    console.log("");
    return;
  }

  const promptfooStartMs = Date.now();
  await executePromptfoo({
    promptfooConfigPath,
    promptfooResultsPath,
    timeoutMs: effectiveEvalTimeoutMs,
    maxConcurrency: effectiveConcurrency,
    noCache: compareConfig.evaluation.noCache,
    requests: compareConfig.evaluation.requests,
    verbose: verboseOutput,
    executionLogPath,
  });
  await logExecution(
    executionLogPath,
    `promptfoo eval completed in ${formatDurationMs(Date.now() - promptfooStartMs)}`,
  );
  await mapWithConcurrency(
    supportedRuns,
    effectiveConcurrency,
    async ({ workspace }) => {
      await syncExecutionWorkspaceToArtifacts(workspace);
    },
  );

  const normalizeStartMs = Date.now();
  const compareSummary = await normalizeComparePromptfooResults({
    manifest,
    supportedRuns,
    promptfooResultsPath,
    compareRunDirectory: benchmarkRunDirectory,
    evaluationRequests: compareConfig.evaluation.requests,
    skippedCells,
  });
  await logExecution(
    executionLogPath,
    `result normalization completed in ${formatDurationMs(Date.now() - normalizeStartMs)}`,
  );

  await writePromptfooArtifacts({
    runDirectory: benchmarkRunDirectory,
    promptfooConfigYaml,
    promptfooResultsPath,
    promptfooJsonPath: promptfooResultsPath,
    summary: compareSummary,
  });

  const mergedSummary = buildCompareMatrixSummary({
    manifest,
    matrix: compareSummary.matrix,
    skippedVariants,
    unsupportedCells: compareSummary.unsupportedCells,
    generatedAt: new Date().toISOString(),
  });
  const cliReport = renderCompareMatrixReport(mergedSummary);
  const mergedArtifacts = await writeMergedBenchmarkArtifacts({
    benchmarkId: manifest.benchmark.id,
    benchmarkRunDirectory: path.join(benchmarkRunDirectory, "merged"),
    mergedSummary,
    cliReport,
  });
  await logExecution(executionLogPath, `merged artifacts written to ${mergedArtifacts.reportPath}`);

  console.log("## Evaluation Result");
  console.log("");
  console.log(cliReport);
  console.log("");
  printExecutionTotals(mergedSummary, compareSummary);
  printSkipped(skippedVariants);
  if (verboseOutput) {
    printCompareArtifactPaths({
      compareRunDirectory: benchmarkRunDirectory,
      promptfooConfigPath,
      promptfooResultsPath,
      summaryPath,
      executionLogPath,
      mergedArtifacts,
    });
    console.log("");
    console.log("## Raw Output");
    console.log(JSON.stringify({
      compareRunDirectory: benchmarkRunDirectory,
      promptfooConfigPath,
      promptfooResultsPath,
      summaryPath,
      mergedArtifacts,
      results: [
        ...compareSummary.matrix.rows.map((row) => ({
          rowId: row.rowId,
          summaryPath: path.join(benchmarkRunDirectory, "summary.json"),
          skipped: false,
        })),
        ...skippedVariants.map((result) => ({
          variantId: result.variantId,
          skipped: true,
          reason: result.reason,
        })),
      ],
    }, null, 2));
  }
}

function parseCompareRuntimeOptions(argv) {
  const knownOptionSchema = {
    "--requests": true,
    "--max-concurrency": true,
    "--maxConcurrency": true,
    "--dry-run": false,
    "--verbose": false,
  };
  ensureKnownLongOptions(argv, knownOptionSchema);

  return {
    compareConfigPath: argv[2],
    dryRun: argv.includes("--dry-run"),
    requestsOverride: parsePositiveIntegerOption(argv, "--requests"),
    maxConcurrencyOverride: parsePositiveIntegerOption(
      argv,
      ["--max-concurrency", "--maxConcurrency"],
    ),
    verboseOutput: argv.includes("--verbose"),
    outputRootDirectory: process.cwd(),
  };
}

function classifyCompareScenarios(scenarios) {
  const supportedScenarios = [];
  const skippedVariants = [];
  const skippedCells = [];
  const skippedVariantIds = new Set();

  for (const scenario of scenarios) {
    const adapter = getAdapter(scenario.agent.adapter);
    const variantId = scenario.output.labels.variant ?? scenario.id;

    if (!adapter.supported) {
      if (!skippedVariantIds.has(variantId)) {
        skippedVariantIds.add(variantId);
        skippedVariants.push(buildSkippedVariantEntry(scenario, variantId));
      }
      continue;
    }

    const support = resolveScenarioSupport(scenario);
    if (!support.supported) {
      skippedCells.push(buildSkippedCellEntry(scenario, variantId, support.reason));
      continue;
    }

    supportedScenarios.push(scenario);
  }

  return {
    supportedScenarios,
    skippedVariants,
    skippedCells,
  };
}

function buildSkippedVariantEntry(scenario, variantId) {
  return {
    variantId,
    variantDisplayName:
      scenario.output.labels.variantDisplayName
      ?? scenario.output.labels.adapterDisplayName
      ?? variantId,
    adapter: scenario.agent.adapter,
    model: scenario.agent.model ?? null,
    reason: `Adapter "${scenario.agent.adapter}" is reserved but not implemented in V1.`,
  };
}

function buildSkippedCellEntry(scenario, variantId, reason) {
  return {
    variantId,
    variantDisplayName: getScenarioVariantDisplayName(scenario),
    profileId: getScenarioProfileId(scenario),
    profileDisplayName: getScenarioProfileLabel(scenario),
    adapter: scenario.agent.adapter,
    model: scenario.agent.model ?? null,
    reason,
  };
}

async function initializeCompareRunArtifacts({
  outputRootDirectory,
  benchmarkId,
  effectiveConcurrency,
}) {
  const batchRunId = new Date().toISOString().replace(/[:.]/g, "-");
  const benchmarkRunDirectory = path.join(
    outputRootDirectory,
    "results",
    benchmarkId,
    `${batchRunId}-compare`,
  );
  await fs.mkdir(benchmarkRunDirectory, { recursive: true });

  const executionLogPath = path.join(benchmarkRunDirectory, "execution.log");
  await logExecution(executionLogPath, "compare run initialized");
  await logExecution(executionLogPath, `effective concurrency: ${effectiveConcurrency}`);

  return {
    benchmarkRunDirectory,
    executionLogPath,
  };
}

async function writeInitialCompareArtifacts({
  compareRunDirectory,
  promptfooConfigPath,
  promptfooResultsPath,
  summaryPath,
  executionLogPath,
  promptfooConfigYaml,
}) {
  await fs.writeFile(promptfooConfigPath, promptfooConfigYaml, "utf8");
  await logExecution(executionLogPath, `promptfoo config written to ${promptfooConfigPath}`);

  return {
    compareRunDirectory,
    promptfooConfigPath,
    promptfooResultsPath,
    summaryPath,
    executionLogPath,
  };
}

function buildComparePromptfooConfig({ manifest, runs }) {
  const routerProviderPath = fromPackageRoot("src", "providers", "compare-matrix-provider.js");
  const profileMap = new Map();

  for (const { scenario, workspace } of runs) {
    const profileId = getScenarioProfileId(scenario);
    const variantId = getScenarioVariantId(scenario);
    const provider = buildPromptfooProvider({
      manifest,
      scenario,
      workspaceDirectory: workspace.executionWorkspaceDirectory ?? workspace.workspaceDirectory,
      workspaceEnvironment: workspace.environment ?? {},
      isolatedEnvironment: workspace.executionEnvironment ?? {},
      gitReady: workspace.gitReady,
    });
    const entry = profileMap.get(profileId) ?? {
      id: routerProviderPath,
      label: getScenarioProfileLabel(scenario),
      config: {
        provider_id: profileId,
        profile_id: profileId,
        skill_mode_id: profileId,
        routes: {},
      },
    };

    entry.config.routes[variantId] = {
      scenarioId: scenario.id,
      provider,
    };
    profileMap.set(profileId, entry);
  }

  const taskPrompts = getTaskPrompts(manifest);
  const evaluation = runs[0]?.scenario.evaluation ?? {
    assertions: [],
    tracing: false,
  };
  const variants = buildVariantEntries(runs);

  const config = {
    description: `${manifest.benchmark.id}:compare`,
    prompts: ["{{taskPrompt}}"],
    providers: [...profileMap.values()],
    tests: variants.flatMap((variant) =>
      taskPrompts.map((taskPrompt) => ({
        description: buildRowDescription(variant, taskPrompt, manifest),
        vars: {
          taskPrompt: taskPrompt.prompt,
          variantId: variant.variantId,
          variantDisplayName: variant.variantDisplayName,
        },
        metadata: {
          benchmarkId: manifest.benchmark.id,
          promptId: taskPrompt.id,
          promptDescription: taskPrompt.description ?? null,
          variantId: variant.variantId,
          variantDisplayName: variant.variantDisplayName,
          rowId: buildRowId(variant.variantId, taskPrompt.id),
          ...flattenLabels({
            variantId: variant.variantId,
            variantDisplayName: variant.variantDisplayName,
          }),
        },
        assert: resolvePromptAssertions({
          defaultAssertions: evaluation.assertions,
          taskPrompt,
        }).map((assertion) =>
          toPromptfooAssertion(
            assertion,
            runs[0].workspace.executionWorkspaceDirectory ?? runs[0].workspace.workspaceDirectory,
          ),
        ),
      })),
    ),
  };

  if (evaluation.tracing) {
    config.tracing = {
      enabled: true,
      otlp: {
        http: {
          enabled: true,
        },
      },
    };
  }

  return config;
}

function buildVariantEntries(runs) {
  const variants = new Map();

  for (const { scenario } of runs) {
    const variantId = getScenarioVariantId(scenario);

    if (!variants.has(variantId)) {
      variants.set(variantId, {
        variantId,
        variantDisplayName: getScenarioVariantDisplayName(scenario),
      });
    }
  }

  return [...variants.values()].sort((left, right) =>
    left.variantDisplayName.localeCompare(right.variantDisplayName),
  );
}

function buildRowDescription(variant, taskPrompt, manifest) {
  const promptLabel = taskPrompt.description ?? taskPrompt.id ?? manifest.benchmark.description;
  return `${variant.variantDisplayName} | ${promptLabel}`;
}

function buildRowId(variantId, promptId) {
  return `${variantId}:${promptId ?? "default"}`;
}

async function normalizeComparePromptfooResults({
  manifest,
  supportedRuns,
  promptfooResultsPath,
  compareRunDirectory,
  evaluationRequests,
  skippedCells,
}) {
  const routeMap = new Map(
    supportedRuns.map(({ scenario, workspace }) => [
      buildRouteKey(
        getScenarioVariantId(scenario),
        getScenarioProfileId(scenario),
      ),
      { scenario, workspace },
    ]),
  );
  const { rawResults, stats, outputs } = await normalizeRawPromptfooResults(promptfooResultsPath);
  const scenarioOutputsMap = new Map();

  for (const output of outputs) {
    const routeEntry = routeMap.get(buildRouteKey(output.variantId, output.provider));

    if (!routeEntry) {
      continue;
    }

    const scenarioOutputs = scenarioOutputsMap.get(routeEntry.scenario.id) ?? [];
    scenarioOutputs.push({
      ...output,
      scenarioId: routeEntry.scenario.id,
      scenarioDescription: routeEntry.scenario.description,
    });
    scenarioOutputsMap.set(routeEntry.scenario.id, scenarioOutputs);
  }

  const scenarioSummaries = supportedRuns.map(({ scenario, workspace }) => {
    const scenarioOutputs = scenarioOutputsMap.get(scenario.id) ?? [];

    return {
      evalId: rawResults.evalId ?? null,
      promptfooVersion: rawResults.metadata?.promptfooVersion ?? null,
      benchmarkId: manifest.benchmark.id,
      benchmarkDescription: manifest.benchmark.description ?? null,
      scenarioId: scenario.id,
      scenarioDescription: scenario.description ?? null,
      runId: path.basename(compareRunDirectory),
      profileId: getScenarioProfileId(scenario),
      skillMode: scenario.skillMode,
      adapter: scenario.agent.adapter,
      model: scenario.agent.model ?? null,
      outputTags: scenario.output.tags,
      outputLabels: scenario.output.labels,
      workspaceDirectory: workspace.workspaceDirectory,
      promptfooResultsPath,
      stats: buildScenarioStats(scenarioOutputs),
      outputs: scenarioOutputs,
      generatedAt: new Date().toISOString(),
    };
  });

  return {
    evalId: rawResults.evalId ?? null,
    promptfooVersion: rawResults.metadata?.promptfooVersion ?? null,
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    compareRunDirectory,
    promptfooResultsPath,
    stats,
    providers: supportedRuns.map(({ scenario }) => ({
      scenarioId: scenario.id,
      adapter: scenario.agent.adapter,
      model: scenario.agent.model ?? null,
      profileId: getScenarioProfileId(scenario),
      skillMode: scenario.skillMode,
      skillSource: scenario.skillSource,
      labels: scenario.output.labels,
      tags: scenario.output.tags,
    })),
    unsupportedCells: skippedCells,
    matrix: buildMatrix({
      manifest,
      supportedRuns,
      outputs,
      routeMap,
      evaluationRequests,
      compareRunDirectory,
      skippedCells,
    }),
    scenarioSummaries,
    generatedAt: new Date().toISOString(),
  };
}

function buildMatrix({
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

  for (const output of outputs) {
    const rowId = output.rowId ?? buildOutputRowId(output);
    const rowEntry = rows.get(rowId) ?? createOutputRowEntry(output, rowId);
    const routeEntry = routeMap.get(buildRouteKey(output.variantId, output.provider));
    const cellEntry = updateCellEntry({
      cellEntry: rowEntry.cells[output.provider] ?? createMatrixCellEntry(routeEntry, evaluationRequests),
      output,
      evaluationRequests,
    });

    rowEntry.cells[output.provider] = cellEntry;
    rows.set(rowId, rowEntry);
  }

  return {
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    compareRunDirectory,
    columns: [...columns.values()],
    rows: [...rows.values()].sort((left, right) => {
      const variantOrder = left.variantDisplayName.localeCompare(right.variantDisplayName);
      if (variantOrder !== 0) {
        return variantOrder;
      }
      return (left.promptDescription ?? left.promptId).localeCompare(
        right.promptDescription ?? right.promptId,
      );
    }).map(stripCellComputationState),
  };
}

function buildMatrixColumns(supportedRuns, skippedCells) {
  const columns = new Map();

  for (const { scenario } of supportedRuns) {
    columns.set(getScenarioProfileId(scenario), {
      id: getScenarioProfileId(scenario),
      label: getScenarioProfileLabel(scenario),
    });
  }

  for (const skippedCell of skippedCells) {
    columns.set(skippedCell.profileId, {
      id: skippedCell.profileId,
      label: skippedCell.profileDisplayName ?? skippedCell.profileId,
    });
  }

  return columns;
}

function buildMatrixVariantEntries(supportedRuns, skippedCells) {
  const variantEntries = new Map();

  for (const { scenario } of supportedRuns) {
    variantEntries.set(getScenarioVariantId(scenario), {
      variantId: getScenarioVariantId(scenario),
      variantDisplayName: getScenarioVariantDisplayName(scenario),
    });
  }

  for (const skippedCell of skippedCells) {
    variantEntries.set(skippedCell.variantId, {
      variantId: skippedCell.variantId,
      variantDisplayName: skippedCell.variantDisplayName ?? skippedCell.variantId,
    });
  }

  return variantEntries;
}

function buildMatrixRows(taskPrompts, supportedRuns, skippedCells) {
  const rows = new Map();

  for (const variant of buildMatrixVariantEntries(supportedRuns, skippedCells).values()) {
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

function applyUnsupportedCells(rows, taskPrompts, skippedCells) {
  for (const skippedCell of skippedCells) {
    for (const taskPrompt of taskPrompts) {
      const rowId = buildRowId(skippedCell.variantId, taskPrompt.id);
      const rowEntry = rows.get(rowId);

      if (!rowEntry) {
        continue;
      }

      rowEntry.cells[skippedCell.profileId] = createUnsupportedCellEntry(skippedCell);
    }
  }
}

function createUnsupportedCellEntry(skippedCell) {
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

function createMatrixCellEntry(routeEntry, evaluationRequests) {
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
    codeMetrics: null,
    sampleOutputs: [],
  };
}

function updateCellEntry({ cellEntry, output, evaluationRequests }) {
  cellEntry.completedRuns += 1;
  cellEntry.passedRuns += output.success ? 1 : 0;
  cellEntry.failedRuns += output.success === false ? 1 : 0;
  cellEntry.errors += output.error ? 1 : 0;
  cellEntry.passRate = evaluationRequests > 0 ? cellEntry.passedRuns / evaluationRequests : 0;
  cellEntry.tokenUsage = buildTokenUsageSummary(cellEntry.tokenUsage, output.tokenUsage);
  cellEntry.codeMetrics = buildCodeMetricsSummary(cellEntry.codeMetrics, output.codeMetricsDelta);
  cellEntry.displayValue = formatCellDisplayValue({
    passRate: cellEntry.passRate,
    passedRuns: cellEntry.passedRuns,
    evaluationRequests,
    tokenUsage: cellEntry.tokenUsage,
    codeMetrics: cellEntry.codeMetrics,
  });

  maybeAddSampleOutput(cellEntry.sampleOutputs, output.text);
  return cellEntry;
}

function maybeAddSampleOutput(sampleOutputs, text) {
  if (sampleOutputs.length < 3 && text !== null) {
    sampleOutputs.push(text);
  }
}

function buildRouteKey(variantId, skillModeId) {
  return `${variantId ?? "unknown"}:${skillModeId ?? "unknown"}`;
}

function buildScenarioStats(outputs) {
  const stats = outputs.reduce((summary, output) => {
    summary.successes += output.success ? 1 : 0;
    summary.failures += output.success === false ? 1 : 0;
    summary.errors += output.error ? 1 : 0;
    summary.durationMs += typeof output.latencyMs === "number" ? output.latencyMs : 0;
    return summary;
  }, createEmptyScenarioStats());

  return {
    ...stats,
    evaluationDurationMs: stats.durationMs,
  };
}

function createEmptyScenarioStats() {
  return {
    successes: 0,
    failures: 0,
    errors: 0,
    durationMs: 0,
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(0)}%`;
}

function formatCellDisplayValue({
  passRate,
  passedRuns,
  evaluationRequests,
  tokenUsage,
  codeMetrics,
}) {
  const passRatioText = `${formatPercent(passRate)} (${passedRuns}/${evaluationRequests})`;
  const tokensText = formatTokenUsageDisplay(tokenUsage);
  const codeMetricsText = formatCodeMetricsDisplay(codeMetrics);
  const lines = [passRatioText];

  if (tokensText) {
    lines.push(`tokens avg ${tokensText.average}, sd ${tokensText.stddev}`);
  }

  lines.push(...codeMetricsText);
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

function createEmptyTokenUsageSummary() {
  return {
    count: 0,
    averageTotalTokens: null,
    stddevTotalTokens: null,
    samples: [],
  };
}

function buildCodeMetricsSummary(currentSummary, codeMetricsDelta) {
  if (!currentSummary && !hasMetricSummaryMap(codeMetricsDelta?.metrics)) {
    return null;
  }

  const previous = currentSummary ?? createEmptyCodeMetricsSummary();

  if (!hasMetricSummaryMap(codeMetricsDelta?.metrics)) {
    return previous;
  }

  const changedOriginalFiles = new Set([
    ...(Array.isArray(previous.changedOriginalFiles) ? previous.changedOriginalFiles : []),
    ...(Array.isArray(codeMetricsDelta.changedOriginalFiles) ? codeMetricsDelta.changedOriginalFiles : []),
  ]);
  const metrics = mergeCodeMetricSummaries(previous.metrics, codeMetricsDelta.metrics);

  if (Object.keys(metrics).length === 0) {
    return previous;
  }

  return {
    changedOriginalFiles: [...changedOriginalFiles].sort(),
    metrics,
  };
}

function hasMetricSummaryMap(metrics) {
  return metrics && typeof metrics === "object";
}

function createEmptyCodeMetricsSummary() {
  return {
    changedOriginalFiles: [],
    metrics: {},
  };
}

function mergeCodeMetricSummaries(previousMetrics, nextMetrics) {
  const metrics = {};
  const metricNames = new Set([
    ...Object.keys(previousMetrics ?? {}),
    ...Object.keys(nextMetrics ?? {}),
  ]);

  for (const metricName of metricNames) {
    const samples = [
      ...readMetricSamples(previousMetrics, metricName),
      ...readMetricSamples(nextMetrics, metricName),
    ];

    if (samples.length === 0) {
      continue;
    }

    metrics[metricName] = summarizeSamples(samples);
  }

  return metrics;
}

function readMetricSamples(metrics, metricName) {
  return Array.isArray(metrics?.[metricName]?.samples)
    ? metrics[metricName].samples
    : [];
}

function summarizeTokenSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      count: 0,
      averageTotalTokens: null,
      stddevTotalTokens: null,
    };
  }

  const count = samples.length;
  const averageTotalTokens = samples.reduce((sum, value) => sum + value, 0) / count;
  const variance = samples.reduce(
    (sum, value) => sum + ((value - averageTotalTokens) ** 2),
    0,
  ) / count;

  return {
    count,
    averageTotalTokens,
    stddevTotalTokens: Math.sqrt(variance),
    samples,
  };
}

function extractTotalTokens(tokenUsage) {
  if (typeof tokenUsage === "number" && Number.isFinite(tokenUsage)) {
    return tokenUsage;
  }

  if (
    tokenUsage
    && typeof tokenUsage.total === "number"
    && Number.isFinite(tokenUsage.total)
  ) {
    return tokenUsage.total;
  }

  return null;
}

function formatCodeMetricsDisplay(codeMetrics) {
  const metricEntries = Object.entries(codeMetrics?.metrics ?? {});

  if (metricEntries.length === 0) {
    return [];
  }

  return metricEntries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([metricName, metricSummary]) =>
      `code ${metricName} avg ${formatSignedNumericMetric(metricSummary.avg)}, sd ${formatNumericMetric(metricSummary.standardDeviation)}`,
    );
}

function formatNumericMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(value >= 100 ? 0 : 1);
}

function formatSignedNumericMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  const formatted = formatNumericMetric(Math.abs(value));
  if (formatted === "n/a") {
    return formatted;
  }

  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function stripCellComputationState(row) {
  return {
    ...row,
    cells: Object.fromEntries(
      Object.entries(row.cells ?? {}).map(([cellId, cell]) => [
        cellId,
        {
          ...cell,
          tokenUsage: cell.tokenUsage
            ? {
              count: cell.tokenUsage.count ?? 0,
              averageTotalTokens: cell.tokenUsage.averageTotalTokens ?? null,
              stddevTotalTokens: cell.tokenUsage.stddevTotalTokens ?? null,
            }
            : null,
          codeMetrics: cell.codeMetrics
            ? {
              changedOriginalFiles: cell.codeMetrics.changedOriginalFiles ?? [],
              metrics: Object.fromEntries(
                Object.entries(cell.codeMetrics.metrics ?? {}).map(([metricName, summary]) => [
                  metricName,
                  {
                    count: summary.count ?? 0,
                    avg: summary.avg ?? null,
                    standardDeviation: summary.standardDeviation ?? null,
                  },
                ]),
              ),
            }
            : null,
        },
      ]),
    ),
  };
}

function printExecutionPlan({
  compareConfig,
  compareConfigPath,
  manifest,
  supportedScenarios,
  skippedVariants,
  skippedCells,
  outputRootDirectory,
  effectiveConcurrency,
  effectiveEvalTimeoutMs,
}) {
  const taskPrompts = getTaskPrompts(manifest);
  const requestsPerCell = compareConfig.evaluation.requests;
  const supportedVariantIds = new Set(
    supportedScenarios.map((scenario) => scenario.output.labels.variant ?? scenario.id),
  );
  const supportedVariants = compareConfig.comparison.variants.filter((variant) =>
    supportedVariantIds.has(variant.id),
  );
  const profiles = compareConfig.comparison.profiles;
  const compareCells = taskPrompts.length * supportedVariants.length * profiles.length;
  const unsupportedCells = taskPrompts.length * skippedCells.length;
  const supportedCells = Math.max(0, compareCells - unsupportedCells);
  const totalRequests = supportedCells * requestsPerCell;

  console.log("# skill-arena evaluate");
  console.log("");
  console.log("| Key | Value |");
  console.log("| --- | --- |");
  console.log(`| Benchmark | ${manifest.benchmark.id} |`);
  console.log(`| Configuration | ${compareConfigPath ?? "compare.yaml"} |`);
  console.log(`| Output root | ${outputRootDirectory} |`);
  console.log(`| Prompts | ${taskPrompts.length} |`);
  console.log(`| Profiles | ${profiles.length} |`);
  console.log(`| Variants | ${supportedVariants.length} |`);
  console.log(`| Unsupported cells | ${unsupportedCells} |`);
  console.log(`| Requests per cell | ${requestsPerCell} |`);
  console.log(`| Total cells | ${compareCells} |`);
  console.log(`| Total requests | ${totalRequests} |`);
  console.log(`| Parallel requests | ${effectiveConcurrency} |`);
  console.log(`| Effective timeout | ${effectiveEvalTimeoutMs} ms |`);
  console.log("");
  if (skippedVariants.length > 0) {
    console.log(`- Skipped variants: ${skippedVariants.length}`);
  }

  console.log("Running evaluation with Promptfoo...");
  console.log("");
}

function resolveCompareEvalTimeoutMs(compareConfig, effectiveConcurrency) {
  const taskPrompts = getTaskPrompts(compareConfig);
  const requestsPerCell = compareConfig.evaluation.requests;
  const profiles = compareConfig.comparison.profiles.length;
  const variants = compareConfig.comparison.variants.length;
  const totalRequests = taskPrompts.length * profiles * variants * requestsPerCell;
  const batches = Math.max(1, Math.ceil(totalRequests / Math.max(1, effectiveConcurrency)));
  return compareConfig.evaluation.timeoutMs * batches;
}

function printSkipped(skippedVariants) {
  if (skippedVariants.length === 0) {
    return;
  }

  console.log("");
  console.log("### Skipped variants");
  for (const result of skippedVariants) {
    console.log(`- ${result.variantId}: ${result.reason}`);
  }
}

function getScenarioVariantId(scenario) {
  return scenario.output.labels.variant ?? scenario.id;
}

function getScenarioVariantDisplayName(scenario) {
  return scenario.output.labels.variantDisplayName
    ?? scenario.output.labels.adapterDisplayName
    ?? getScenarioVariantId(scenario);
}

function getScenarioProfileId(scenario) {
  return scenario.output.labels.profileId
    ?? scenario.output.labels.skillModeId
    ?? scenario.output.labels.displayName
    ?? scenario.id;
}

function getScenarioProfileLabel(scenario) {
  return scenario.output.labels.profileDisplayName
    ?? scenario.output.labels.skillDisplayName
    ?? getScenarioProfileId(scenario);
}

function resolveScenarioSupport(scenario) {
  const capabilities = scenario.profile?.capabilities ?? {};
  const unsupportedFamilies = listUnsupportedCapabilityFamilies(
    scenario.agent.adapter,
    capabilities,
  );

  if (unsupportedFamilies.length > 0) {
    return {
      supported: false,
      reason: `Adapter "${scenario.agent.adapter}" does not yet support compare profile capabilities: ${unsupportedFamilies.join(", ")}.`,
    };
  }

  const capabilityValidationError = validateScenarioCapabilities(scenario);
  if (capabilityValidationError) {
    return {
      supported: false,
      reason: capabilityValidationError,
    };
  }

  const systemInstalledSkills = (capabilities.skills ?? []).filter((skill) =>
    skill.install?.strategy === "system-installed"
      || skill.source?.type === "system-installed"
  );
  if (systemInstalledSkills.length > 0) {
    return {
      supported: false,
      reason: "Strict compare isolation does not yet support system-installed skills in comparison profiles.",
    };
  }

  return { supported: true };
}

function listUnsupportedCapabilityFamilies(adapterId, capabilities) {
  const unsupportedFamilies = [];
  const supportedFamilies = getSupportedCapabilityFamilies(adapterId);

  for (const family of ["instructions", "agents", "hooks", "mcp", "extensions", "plugins"]) {
    if (
      Array.isArray(capabilities[family])
      && capabilities[family].length > 0
      && !supportedFamilies.has(family)
    ) {
      unsupportedFamilies.push(family);
    }
  }

  return unsupportedFamilies;
}

function getSupportedCapabilityFamilies(adapterId) {
  switch (adapterId) {
    case "codex":
      return new Set(["instructions", "skills"]);
    case "copilot-cli":
      return new Set(["instructions", "skills", "agents", "hooks"]);
    case "pi":
      return new Set(["skills"]);
    default:
      return new Set(["skills"]);
  }
}

function validateScenarioCapabilities(scenario) {
  if (scenario.agent.adapter === "copilot-cli") {
    return validateCopilotCapabilities(scenario.profile?.capabilities ?? {});
  }

  return validateMaterializedCapabilities(scenario.profile?.capabilities ?? {}, ["instructions"]);
}

function validateCopilotCapabilities(capabilities) {
  const agentError = validateSingleAgentCapability(capabilities.agents ?? []);
  if (agentError) {
    return agentError;
  }

  return validateMaterializedCapabilities(capabilities, ["instructions", "agents", "hooks"]);
}

function validateSingleAgentCapability(agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return null;
  }

  if (agents.length > 1) {
    return "Adapter \"copilot-cli\" supports at most one compare profile agent.";
  }

  const agentId = agents[0]?.agentId;
  if (typeof agentId !== "string" || agentId.trim() === "") {
    return "Adapter \"copilot-cli\" requires profile.capabilities.agents[*].agentId.";
  }

  return null;
}

function validateMaterializedCapabilities(capabilities, supportedFamilies) {
  const supportedSourceTypes = new Set(["local-path", "git", "inline-files", "empty"]);

  for (const family of supportedFamilies) {
    const entries = Array.isArray(capabilities?.[family]) ? capabilities[family] : [];

    for (const [index, entry] of entries.entries()) {
      const source = entry?.source;
      if (!source || typeof source !== "object") {
        return `profile.capabilities.${family}[${index}] must declare a materializable source.`;
      }

      if (typeof source.type !== "string" || source.type.length === 0) {
        return `profile.capabilities.${family}[${index}].source.type must be a non-empty string.`;
      }

      if (!supportedSourceTypes.has(source.type)) {
        return `profile.capabilities.${family}[${index}].source.type must be one of: local-path, git, inline-files, empty.`;
      }

      if (source.type !== "empty" && typeof source.target !== "string") {
        return `profile.capabilities.${family}[${index}].source.target must be defined.`;
      }
    }
  }

  return null;
}

function printExecutionTotals(mergedSummary, compareSummary) {
  const cells = collectMatrixCells(mergedSummary.matrix);
  const {
    requested,
    completed,
    passed,
    failed,
    errors,
  } = summarizeExecutionCells(cells);
  const passRate = requested > 0 ? `${((passed / requested) * 100).toFixed(0)}%` : "0%";

  console.log("### Overall summary");
  console.log("| Metric | Value |");
  console.log("| --- | --- |");
  console.log(`| Status | ${buildExecutionStatus({ failed, errors })} |`);
  console.log(`| Eval ID | ${compareSummary.evalId ?? "N/A"} |`);
  console.log(`| Requested evaluations | ${requested} |`);
  console.log(`| Completed evaluations | ${completed} |`);
  console.log(`| Passed | ${passed} |`);
  console.log(`| Failed | ${failed} |`);
  console.log(`| Errors | ${errors} |`);
  console.log(`| Overall rate | ${passed}/${requested} (${passRate}) |`);
}

function collectMatrixCells(matrix) {
  const cells = [];

  for (const row of matrix?.rows ?? []) {
    for (const column of matrix?.columns ?? []) {
      const cell = row.cells?.[column.id];
      if (cell) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

function summarizeExecutionCells(cells) {
  return cells.reduce((summary, cell) => {
    summary.requested += cell.requestedRuns ?? 0;
    summary.completed += cell.completedRuns ?? 0;
    summary.passed += cell.passedRuns ?? 0;
    summary.failed += cell.failedRuns ?? 0;
    summary.errors += cell.errors ?? 0;
    return summary;
  }, {
    requested: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    errors: 0,
  });
}

function buildExecutionStatus({ failed, errors }) {
  if (errors > 0) {
    return "FAILED (errors)";
  }

  return failed > 0 ? "FAILED" : "PASS";
}

function printCompareArtifactPaths({
  compareRunDirectory,
  promptfooConfigPath,
  promptfooResultsPath,
  summaryPath,
  executionLogPath,
  mergedArtifacts,
}) {
  console.log("Compare artifacts");
  console.log(`- Run directory: ${compareRunDirectory}`);
  console.log(`- Promptfoo config: ${promptfooConfigPath}`);
  console.log(`- Promptfoo results: ${promptfooResultsPath}`);
  console.log(`- Compare summary: ${summaryPath}`);
  if (executionLogPath) {
    console.log(`- Execution log: ${executionLogPath}`);
  }

  if (mergedArtifacts) {
    console.log(`- Final merged summary: ${mergedArtifacts.mergedSummaryPath}`);
    console.log(`- Final merged report: ${mergedArtifacts.reportPath}`);
  } else {
    console.log(`- Final merged summary: ${path.join(compareRunDirectory, "merged", "merged-summary.json")}`);
    console.log(`- Final merged report: ${path.join(compareRunDirectory, "merged", "report.md")}`);
  }

  console.log("");
}

async function executePromptfoo({
  promptfooConfigPath,
  promptfooResultsPath,
  timeoutMs,
  maxConcurrency,
  noCache,
  requests,
  verbose,
  executionLogPath,
}) {
  const promptfooArgs = buildPromptfooEvalArgs({
    promptfooConfigPath,
    promptfooResultsPath,
    requests,
    maxConcurrency,
    noCache,
  });

  const { executable, executableArgs } = await buildPromptfooCommand(promptfooArgs);

  await new Promise((resolve, reject) => {
    let timedOut = false;
    const childProcess = spawn(executable, executableArgs, {
      cwd: path.dirname(promptfooConfigPath),
      env: createPromptfooProcessEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      childProcess.kill("SIGTERM");
    }, timeoutMs);

    childProcess.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    attachExecutionStream({
      stream: childProcess.stdout,
      executionLogPath,
      verbose,
      outputWriter: process.stdout,
    });
    attachExecutionStream({
      stream: childProcess.stderr,
      executionLogPath,
      verbose,
      outputWriter: process.stderr,
    });

    childProcess.on("exit", (code, signal) => {
      clearTimeout(killTimer);

      if (isSuccessfulPromptfooExitCode(code)) {
        resolve();
        return;
      }

      reject(buildPromptfooExitError({ code, signal, timedOut, timeoutMs }));
    });
  });
}

function buildPromptfooEvalArgs({
  promptfooConfigPath,
  promptfooResultsPath,
  requests,
  maxConcurrency,
  noCache,
}) {
  const promptfooArgs = [
    "promptfoo",
    "eval",
    "-c",
    promptfooConfigPath,
    "--output",
    promptfooResultsPath,
    "--repeat",
    String(requests),
    "-j",
    String(maxConcurrency),
    "--no-progress-bar",
  ];

  if (noCache) {
    promptfooArgs.push("--no-cache");
  }

  return promptfooArgs;
}

function createPromptfooProcessEnvironment() {
  return {
    ...process.env,
    PROMPTFOO_DISABLE_TELEMETRY: "1",
    PROMPTFOO_DISABLE_UPDATE: "1",
  };
}

function attachExecutionStream({
  stream,
  executionLogPath,
  verbose,
  outputWriter,
}) {
  stream.on("data", (chunk) => {
    void fs.appendFile(executionLogPath, chunk);
    if (verbose) {
      outputWriter.write(chunk);
    }
  });
}

function isSuccessfulPromptfooExitCode(code) {
  return code === 0 || code === 100;
}

function buildPromptfooExitError({
  code,
  signal,
  timedOut,
  timeoutMs,
}) {
  if (timedOut) {
    return new Error(
      `promptfoo eval timed out after ${timeoutMs} ms and was terminated with signal ${signal ?? "unknown"}.`,
    );
  }

  if (signal) {
    return new Error(`promptfoo eval was terminated with signal ${signal}.`);
  }

  return new Error(`promptfoo eval exited with code ${code}.`);
}

async function logExecution(logPath, message) {
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function formatDurationMs(durationMs) {
  return `${durationMs} ms`;
}

async function buildPromptfooCommand(args) {
  const promptfooEntrypoint = fromPackageRoot(
    "node_modules",
    "promptfoo",
    "dist",
    "src",
    "entrypoint.js",
  );

  try {
    await fs.access(promptfooEntrypoint);
    return {
      executable: process.execPath,
      executableArgs: [promptfooEntrypoint, ...args.slice(1)],
    };
  } catch {
    if (process.platform !== "win32") {
      return {
        executable: "npx",
        executableArgs: args,
      };
    }

    return {
      executable: "cmd.exe",
      executableArgs: ["/d", "/s", "/c", "npx.cmd", ...args],
    };
  }
}

function applyRuntimeOverrides({
  compareConfig,
  requestsOverride,
  maxConcurrencyOverride,
}) {
  if (requestsOverride == null && maxConcurrencyOverride == null) {
    return compareConfig;
  }

  return {
    ...compareConfig,
    evaluation: {
      ...compareConfig.evaluation,
      ...(requestsOverride == null ? {} : { requests: requestsOverride }),
      ...(maxConcurrencyOverride == null ? {} : { maxConcurrency: maxConcurrencyOverride }),
    },
  };
}

main().catch((error) => {
  if (latestCompareArtifacts) {
    console.error("");
    printCompareArtifactPaths(latestCompareArtifacts);
  }
  console.error(error.message);
  process.exitCode = 1;
});
