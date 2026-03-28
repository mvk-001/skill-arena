import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { buildPromptfooProvider, getAdapter } from "../adapters.js";
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
import {
  clearGitSourceCache,
  materializeWorkspace,
  syncExecutionWorkspaceToArtifacts,
} from "../workspace.js";
import { ensureKnownLongOptions, parsePositiveIntegerOption } from "./cli-options.js";
import { resolveScenarioSupport } from "../capability-validation.js";
import {
  buildMatrix,
  buildRouteKey,
  buildRowId,
  buildScenarioStats,
  createEmptyTokenUsageSummary,
  formatPercent,
  getScenarioProfileId,
  getScenarioProfileLabel,
  getScenarioVariantDisplayName,
  getScenarioVariantId,
} from "../compare-matrix.js";

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

  try {
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
        await fs.rm(workspace.executionRootDirectory, { recursive: true, force: true }).catch(() => {});
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
  } finally {
    await mapWithConcurrency(
      supportedRuns,
      effectiveConcurrency,
      async ({ workspace }) => {
        await fs.rm(workspace.executionRootDirectory, { recursive: true, force: true }).catch(() => {});
      },
    );
    clearGitSourceCache();
  }
}

// ── CLI option parsing ─────────────────────────────────────────────

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

// ── Scenario classification ────────────────────────────────────────

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

  return { supportedScenarios, skippedVariants, skippedCells };
}

function buildSkippedVariantEntry(scenario, variantId) {
  return {
    variantId,
    variantDisplayName:
      scenario.output.labels.variantDisplayName ??
      scenario.output.labels.adapterDisplayName ??
      variantId,
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

// ── Artifacts ──────────────────────────────────────────────────────

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

  return { benchmarkRunDirectory, executionLogPath };
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

// ── Promptfoo config builder ───────────────────────────────────────

function buildComparePromptfooConfig({ manifest, runs }) {
  const routerProviderPath = fromPackageRoot("src", "providers", "compare-matrix-provider.js");
  const profileMap = buildProfileMap(runs, manifest, routerProviderPath);

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
      taskPrompts.map((taskPrompt) => buildTestEntry(variant, taskPrompt, manifest, evaluation, runs)),
    ),
  };

  if (evaluation.tracing) {
    config.tracing = {
      enabled: true,
      otlp: { http: { enabled: true } },
    };
  }

  return config;
}

function buildProfileMap(runs, manifest, routerProviderPath) {
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

    entry.config.routes[variantId] = { scenarioId: scenario.id, provider };
    profileMap.set(profileId, entry);
  }

  return profileMap;
}

function buildTestEntry(variant, taskPrompt, manifest, evaluation, runs) {
  return {
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
        { resolveFromProviderWorkspace: true },
      ),
    ),
  };
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

// ── Result normalization ───────────────────────────────────────────

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
      buildRouteKey(getScenarioVariantId(scenario), getScenarioProfileId(scenario)),
      { scenario, workspace },
    ]),
  );
  const { rawResults, stats, outputs } = await normalizeRawPromptfooResults(promptfooResultsPath);
  const scenarioOutputsMap = groupOutputsByScenario(outputs, routeMap);

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

function groupOutputsByScenario(outputs, routeMap) {
  const map = new Map();

  for (const output of outputs) {
    const routeEntry = routeMap.get(buildRouteKey(output.variantId, output.provider));
    if (!routeEntry) {
      continue;
    }

    const scenarioId = routeEntry.scenario.id;
    const list = map.get(scenarioId) ?? [];
    list.push({
      ...output,
      scenarioId,
      scenarioDescription: routeEntry.scenario.description,
    });
    map.set(scenarioId, list);
  }

  return map;
}

// ── Promptfoo execution ────────────────────────────────────────────

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
      env: {
        ...process.env,
        PROMPTFOO_DISABLE_TELEMETRY: "1",
        PROMPTFOO_DISABLE_UPDATE: "1",
      },
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

    attachExecutionStream({ stream: childProcess.stdout, executionLogPath, verbose, outputWriter: process.stdout });
    attachExecutionStream({ stream: childProcess.stderr, executionLogPath, verbose, outputWriter: process.stderr });

    childProcess.on("exit", (code, signal) => {
      clearTimeout(killTimer);

      if (code === 0 || code === 100) {
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
  const args = [
    "promptfoo", "eval",
    "-c", promptfooConfigPath,
    "--output", promptfooResultsPath,
    "--repeat", String(requests),
    "-j", String(maxConcurrency),
    "--no-progress-bar",
  ];

  if (noCache) {
    args.push("--no-cache");
  }

  return args;
}

function attachExecutionStream({ stream, executionLogPath, verbose, outputWriter }) {
  stream.on("data", (chunk) => {
    void fs.appendFile(executionLogPath, chunk);
    if (verbose) {
      outputWriter.write(chunk);
    }
  });
}

function buildPromptfooExitError({ code, signal, timedOut, timeoutMs }) {
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

async function buildPromptfooCommand(args) {
  const promptfooEntrypoint = fromPackageRoot(
    "node_modules", "promptfoo", "dist", "src", "entrypoint.js",
  );

  try {
    await fs.access(promptfooEntrypoint);
    return {
      executable: process.execPath,
      executableArgs: [promptfooEntrypoint, ...args.slice(1)],
    };
  } catch {
    if (process.platform !== "win32") {
      return { executable: "npx", executableArgs: args };
    }

    return { executable: "cmd.exe", executableArgs: ["/d", "/s", "/c", "npx.cmd", ...args] };
  }
}

// ── Config overrides ───────────────────────────────────────────────

function applyRuntimeOverrides({ compareConfig, requestsOverride, maxConcurrencyOverride }) {
  if (requestsOverride == null && maxConcurrencyOverride == null) {
    return compareConfig;
  }

  return {
    ...compareConfig,
    evaluation: {
      ...compareConfig.evaluation,
      ...(requestsOverride != null && { requests: requestsOverride }),
      ...(maxConcurrencyOverride != null && { maxConcurrency: maxConcurrencyOverride }),
    },
  };
}

// ── Timeout calculation ────────────────────────────────────────────

function resolveCompareEvalTimeoutMs(compareConfig, effectiveConcurrency) {
  const taskPrompts = getTaskPrompts(compareConfig);
  const requestsPerCell = compareConfig.evaluation.requests;
  const profiles = compareConfig.comparison.profiles.length;
  const variants = compareConfig.comparison.variants.length;
  const totalRequests = taskPrompts.length * profiles * variants * requestsPerCell;
  const batches = Math.max(1, Math.ceil(totalRequests / Math.max(1, effectiveConcurrency)));
  return compareConfig.evaluation.timeoutMs * batches;
}

// ── Console output helpers ─────────────────────────────────────────

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

  const planRows = [
    ["Benchmark", manifest.benchmark.id],
    ["Configuration", compareConfigPath ?? "compare.yaml"],
    ["Output root", outputRootDirectory],
    ["Prompts", taskPrompts.length],
    ["Profiles", profiles.length],
    ["Variants", supportedVariants.length],
    ["Unsupported cells", unsupportedCells],
    ["Requests per cell", requestsPerCell],
    ["Total cells", compareCells],
    ["Total requests", totalRequests],
    ["Parallel requests", effectiveConcurrency],
    ["Effective timeout", `${effectiveEvalTimeoutMs} ms`],
  ];

  console.log("# skill-arena evaluate");
  console.log("");
  console.log("| Key | Value |");
  console.log("| --- | --- |");
  for (const [key, value] of planRows) {
    console.log(`| ${key} | ${value} |`);
  }
  console.log("");
  if (skippedVariants.length > 0) {
    console.log(`- Skipped variants: ${skippedVariants.length}`);
  }

  console.log("Running evaluation with Promptfoo...");
  console.log("");
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

function printExecutionTotals(mergedSummary, compareSummary) {
  const cells = collectMatrixCells(mergedSummary.matrix);
  const totals = summarizeExecutionCells(cells);
  const passRate =
    totals.requested > 0
      ? `${((totals.passed / totals.requested) * 100).toFixed(0)}%`
      : "0%";

  const summaryRows = [
    ["Status", buildExecutionStatus(totals)],
    ["Eval ID", compareSummary.evalId ?? "N/A"],
    ["Requested evaluations", totals.requested],
    ["Completed evaluations", totals.completed],
    ["Passed", totals.passed],
    ["Failed", totals.failed],
    ["Errors", totals.errors],
    ["Overall rate", `${totals.passed}/${totals.requested} (${passRate})`],
  ];

  console.log("### Overall summary");
  console.log("| Metric | Value |");
  console.log("| --- | --- |");
  for (const [key, value] of summaryRows) {
    console.log(`| ${key} | ${value} |`);
  }
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
  return cells.reduce(
    (s, cell) => {
      s.requested += cell.requestedRuns ?? 0;
      s.completed += cell.completedRuns ?? 0;
      s.passed += cell.passedRuns ?? 0;
      s.failed += cell.failedRuns ?? 0;
      s.errors += cell.errors ?? 0;
      return s;
    },
    { requested: 0, completed: 0, passed: 0, failed: 0, errors: 0 },
  );
}

function buildExecutionStatus({ failed, errors }) {
  if (errors > 0) return "FAILED (errors)";
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

// ── Utilities ──────────────────────────────────────────────────────

async function logExecution(logPath, message) {
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function formatDurationMs(durationMs) {
  return `${durationMs} ms`;
}

main().catch((error) => {
  if (latestCompareArtifacts) {
    console.error("");
    printCompareArtifactPaths(latestCompareArtifacts);
  }
  console.error(error.message);
  process.exitCode = 1;
});
