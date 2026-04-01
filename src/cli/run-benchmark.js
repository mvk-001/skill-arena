import { findScenario, loadBenchmarkManifest } from "../manifest.js";
import {
  buildMergedBenchmarkSummary,
  renderMergedBenchmarkReport,
  writeMarkdownReportOutput,
  writeMergedBenchmarkArtifacts,
} from "../results.js";
import { getDefaultParallelism, mapWithConcurrency } from "../concurrency.js";
import { runScenario } from "../runner.js";
import path from "node:path";
import { ensureKnownLongOptions, parsePositiveIntegerOption } from "./cli-options.js";

async function main() {
  const manifestPath = process.argv[2];
  const knownOptionSchema = {
    "--scenario": true,
    "--requests": true,
    "--max-concurrency": true,
    "--maxConcurrency": true,
    "--markdown-output": true,
    "--dry-run": false,
  };
  ensureKnownLongOptions(process.argv, knownOptionSchema);

  const scenarioFlagIndex = process.argv.indexOf("--scenario");
  const dryRun = process.argv.includes("--dry-run");
  const scenarioId = scenarioFlagIndex > -1 ? process.argv[scenarioFlagIndex + 1] : null;
  const requestsOverride = parsePositiveIntegerOption(process.argv, "--requests");
  const maxConcurrencyOverride = parsePositiveIntegerOption(
    process.argv,
    ["--max-concurrency", "--maxConcurrency"],
  );
  const outputRootDirectory = process.cwd();
  const markdownOutputPath = readStringOption(process.argv, "--markdown-output");

  if (!manifestPath) {
    throw new Error(
      "Usage: node ./src/cli/run-benchmark.js <manifest-path> [--scenario <scenario-id>] [--requests <n>] [--max-concurrency <n>] [--markdown-output <path>] [--dry-run]",
    );
  }

  const { manifest, workspaceRootDirectory } = await loadBenchmarkManifest(manifestPath, {
    cwd: outputRootDirectory,
  });
  const configuredScenarios = scenarioId
    ? [findScenario(manifest, scenarioId)]
    : manifest.scenarios;
  const scenarios = configuredScenarios.map((scenario) =>
    applyRuntimeOverrides({
      scenario,
      requestsOverride,
      maxConcurrencyOverride,
    }),
  );

  const results = await mapWithConcurrency(
    scenarios,
    getDefaultParallelism(),
    async (scenario) =>
      await runScenario({
        manifest,
        scenario,
        dryRun,
        outputRootDirectory,
        sourceBaseDirectory: workspaceRootDirectory,
      }),
  );

  const completedSummaries = results
    .filter((result) => !result.skipped && result.summary)
    .map((result) => result.summary);

  let mergedArtifacts = null;

  if (completedSummaries.length > 0) {
    const batchRunId = new Date().toISOString().replace(/[:.]/g, "-");
    const benchmarkRunDirectory = path.join(
      outputRootDirectory,
      "results",
      manifest.benchmark.id,
      `${batchRunId}-merged`,
    );
    const mergedSummary = buildMergedBenchmarkSummary({
      manifest,
      scenarioSummaries: completedSummaries,
      generatedAt: new Date().toISOString(),
    });
    const cliReport = renderMergedBenchmarkReport(mergedSummary);

    mergedArtifacts = await writeMergedBenchmarkArtifacts({
      benchmarkId: manifest.benchmark.id,
      benchmarkRunDirectory,
      mergedSummary,
      cliReport,
    });
    if (markdownOutputPath) {
      const resolvedMarkdownOutputPath = path.resolve(outputRootDirectory, markdownOutputPath);
      await writeMarkdownReportOutput({
        outputPath: resolvedMarkdownOutputPath,
        markdown: cliReport,
      });
      mergedArtifacts.markdownOutputPath = resolvedMarkdownOutputPath;
    }

    console.log(cliReport);
    console.log("");
  }

  console.log(JSON.stringify({ results, mergedArtifacts }, null, 2));
}

function readStringOption(argv, optionName) {
  const index = argv.indexOf(optionName);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

function applyRuntimeOverrides({
  scenario,
  requestsOverride,
  maxConcurrencyOverride,
}) {
  if (requestsOverride == null && maxConcurrencyOverride == null) {
    return scenario;
  }

  return {
    ...scenario,
    evaluation: {
      ...scenario.evaluation,
      ...(requestsOverride == null ? {} : { requests: requestsOverride }),
      ...(maxConcurrencyOverride == null ? {} : { maxConcurrency: maxConcurrencyOverride }),
    },
  };
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
