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
  stringifyPromptfooConfig,
  toPromptfooAssertion,
} from "../promptfoo-config.js";
import { fromProjectRoot } from "../project-paths.js";
import { materializeWorkspace } from "../workspace.js";

async function main() {
  const compareConfigPath = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!compareConfigPath) {
    throw new Error(
      "Usage: node ./src/cli/run-compare.js <compare-config-path> [--dry-run]",
    );
  }

  const { compareConfig } = await loadCompareConfig(compareConfigPath);
  const manifest = expandCompareConfigToManifest(compareConfig);
  const supportedRuns = [];
  const skippedVariants = [];
  const skippedVariantIds = new Set();

  for (const scenario of manifest.scenarios) {
    const adapter = getAdapter(scenario.agent.adapter);
    const variantId = scenario.output.labels.variant ?? scenario.id;

    if (!adapter.supported) {
      if (!skippedVariantIds.has(variantId)) {
        skippedVariantIds.add(variantId);
        skippedVariants.push({
          variantId,
          variantDisplayName:
            scenario.output.labels.variantDisplayName
            ?? scenario.output.labels.adapterDisplayName
            ?? variantId,
          adapter: scenario.agent.adapter,
          model: scenario.agent.model ?? null,
          reason: `Adapter "${scenario.agent.adapter}" is reserved but not implemented in V1.`,
        });
      }
      continue;
    }

    const workspace = await materializeWorkspace({ manifest, scenario });
    supportedRuns.push({
      scenario,
      workspace,
    });
  }

  const batchRunId = new Date().toISOString().replace(/[:.]/g, "-");
  const benchmarkRunDirectory = fromProjectRoot(
    "results",
    manifest.benchmark.id,
    `${batchRunId}-compare`,
  );
  await fs.mkdir(benchmarkRunDirectory, { recursive: true });

  const promptfooConfig = buildComparePromptfooConfig({
    manifest,
    runs: supportedRuns,
  });
  const promptfooConfigYaml = stringifyPromptfooConfig(promptfooConfig);
  const promptfooConfigPath = path.join(benchmarkRunDirectory, "promptfooconfig.yaml");
  const promptfooResultsPath = path.join(benchmarkRunDirectory, "promptfoo-results.json");

  await fs.writeFile(promptfooConfigPath, promptfooConfigYaml, "utf8");

  if (dryRun) {
    printSkipped(skippedVariants);
    console.log(JSON.stringify({
      compareRunDirectory: benchmarkRunDirectory,
      promptfooConfigPath,
      promptfooResultsPath,
      providers: promptfooConfig.providers.map((provider) => provider.label ?? provider.id),
      results: skippedVariants,
    }, null, 2));
    return;
  }

  await executePromptfoo({
    promptfooConfigPath,
    promptfooResultsPath,
    timeoutMs: compareConfig.evaluation.timeoutMs,
    maxConcurrency: compareConfig.evaluation.maxConcurrency,
    noCache: compareConfig.evaluation.noCache,
    requests: compareConfig.evaluation.requests,
  });

  const compareSummary = await normalizeComparePromptfooResults({
    manifest,
    supportedRuns,
    promptfooResultsPath,
    compareRunDirectory: benchmarkRunDirectory,
    evaluationRequests: compareConfig.evaluation.requests,
  });

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
    generatedAt: new Date().toISOString(),
  });
  const cliReport = renderCompareMatrixReport(mergedSummary);
  const mergedArtifacts = await writeMergedBenchmarkArtifacts({
    benchmarkId: manifest.benchmark.id,
    benchmarkRunDirectory: path.join(benchmarkRunDirectory, "merged"),
    mergedSummary,
    cliReport,
  });

  console.log(cliReport);
  console.log("");
  printSkipped(skippedVariants);
  console.log(JSON.stringify({
    compareRunDirectory: benchmarkRunDirectory,
    promptfooConfigPath,
    promptfooResultsPath,
    summaryPath: path.join(benchmarkRunDirectory, "summary.json"),
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

function buildComparePromptfooConfig({ manifest, runs }) {
  const routerProviderPath = fromProjectRoot("src", "providers", "compare-matrix-provider.js");
  const skillModeMap = new Map();

  for (const { scenario, workspace } of runs) {
    const skillModeId = scenario.output.labels.skillModeId ?? scenario.output.labels.displayName ?? scenario.id;
    const variantId = scenario.output.labels.variant ?? scenario.id;
    const provider = buildPromptfooProvider({
      manifest,
      scenario,
      workspaceDirectory: workspace.workspaceDirectory,
      gitReady: workspace.gitReady,
    });
    const entry = skillModeMap.get(skillModeId) ?? {
      id: routerProviderPath,
      label: scenario.output.labels.skillDisplayName ?? skillModeId,
      config: {
        provider_id: skillModeId,
        skill_mode_id: skillModeId,
        routes: {},
      },
    };

    entry.config.routes[variantId] = {
      scenarioId: scenario.id,
      provider,
    };
    skillModeMap.set(skillModeId, entry);
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
    providers: [...skillModeMap.values()],
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
        assert: evaluation.assertions.map((assertion) =>
          toPromptfooAssertion(assertion, runs[0].workspace.workspaceDirectory),
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
    const variantId = scenario.output.labels.variant ?? scenario.id;

    if (!variants.has(variantId)) {
      variants.set(variantId, {
        variantId,
        variantDisplayName:
          scenario.output.labels.variantDisplayName
          ?? scenario.output.labels.adapterDisplayName
          ?? variantId,
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
}) {
  const routeMap = new Map(
    supportedRuns.map(({ scenario, workspace }) => [
      buildRouteKey(
        scenario.output.labels.variant ?? scenario.id,
        scenario.output.labels.skillModeId ?? scenario.output.labels.displayName ?? scenario.id,
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
      skillMode: scenario.skillMode,
      skillSource: scenario.skillSource,
      labels: scenario.output.labels,
      tags: scenario.output.tags,
    })),
    matrix: buildMatrix({
      manifest,
      supportedRuns,
      outputs,
      routeMap,
      evaluationRequests,
      compareRunDirectory,
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
}) {
  const columns = new Map();
  const rows = new Map();

  for (const { scenario } of supportedRuns) {
    const skillModeId = scenario.output.labels.skillModeId ?? scenario.output.labels.displayName ?? scenario.id;
    columns.set(skillModeId, {
      id: skillModeId,
      label: scenario.output.labels.skillDisplayName ?? skillModeId,
    });
  }

  for (const output of outputs) {
    const rowId = output.rowId ?? buildRowId(output.variantId ?? "unknown", output.promptId ?? "default");
    const rowEntry = rows.get(rowId) ?? {
      rowId,
      variantId: output.variantId ?? "unknown",
      variantDisplayName: output.variantDisplayName ?? output.variantId ?? "unknown",
      promptId: output.promptId ?? "default",
      promptDescription: output.promptDescription ?? null,
      prompt: output.prompt,
      cells: {},
    };
    const routeEntry = routeMap.get(buildRouteKey(output.variantId, output.provider));
    const cellEntry = rowEntry.cells[output.provider] ?? {
      scenarioId: routeEntry?.scenario.id ?? null,
      scenarioDescription: routeEntry?.scenario.description ?? null,
      adapter: routeEntry?.scenario.agent.adapter ?? null,
      model: routeEntry?.scenario.agent.model ?? null,
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
      sampleOutputs: [],
    };

    cellEntry.completedRuns += 1;
    cellEntry.passedRuns += output.success ? 1 : 0;
    cellEntry.failedRuns += output.success === false ? 1 : 0;
    cellEntry.errors += output.error ? 1 : 0;
    cellEntry.passRate = evaluationRequests > 0 ? cellEntry.passedRuns / evaluationRequests : 0;
    cellEntry.displayValue = `${formatPercent(cellEntry.passRate)} (${cellEntry.passedRuns}/${evaluationRequests})`;

    if (cellEntry.sampleOutputs.length < 3 && output.text !== null) {
      cellEntry.sampleOutputs.push(output.text);
    }

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
    }),
  };
}

function buildRouteKey(variantId, skillModeId) {
  return `${variantId ?? "unknown"}:${skillModeId ?? "unknown"}`;
}

function buildScenarioStats(outputs) {
  const successes = outputs.filter((output) => output.success).length;
  const failures = outputs.filter((output) => output.success === false).length;
  const errors = outputs.filter((output) => output.error).length;
  const latencies = outputs
    .map((output) => output.latencyMs)
    .filter((value) => typeof value === "number");
  const durationMs = latencies.reduce((total, value) => total + value, 0);

  return {
    successes,
    failures,
    errors,
    durationMs,
    evaluationDurationMs: durationMs,
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(0)}%`;
}

function printSkipped(skippedVariants) {
  if (skippedVariants.length === 0) {
    return;
  }

  console.log("Skipped variants:");
  for (const result of skippedVariants) {
    console.log(`- ${result.variantId}: ${result.reason}`);
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

  const { executable, executableArgs } = buildPromptfooCommand(promptfooArgs);

  await new Promise((resolve, reject) => {
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
      childProcess.kill("SIGTERM");
    }, timeoutMs);

    childProcess.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    childProcess.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    childProcess.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    childProcess.on("exit", (code) => {
      clearTimeout(killTimer);

      if (code === 0 || code === 100) {
        resolve();
        return;
      }

      reject(new Error(`promptfoo eval exited with code ${code}.`));
    });
  });
}

function buildPromptfooCommand(args) {
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

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
