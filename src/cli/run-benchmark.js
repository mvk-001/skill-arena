import { findScenario, loadBenchmarkManifest } from "../manifest.js";
import {
  buildMergedBenchmarkSummary,
  renderMergedBenchmarkReport,
  writeMergedBenchmarkArtifacts,
} from "../results.js";
import { getDefaultParallelism, mapWithConcurrency } from "../concurrency.js";
import { runScenario } from "../runner.js";
import path from "node:path";

async function main() {
  const manifestPath = process.argv[2];
  const scenarioFlagIndex = process.argv.indexOf("--scenario");
  const dryRun = process.argv.includes("--dry-run");
  const scenarioId = scenarioFlagIndex > -1 ? process.argv[scenarioFlagIndex + 1] : null;
  const outputRootDirectory = process.cwd();

  if (!manifestPath) {
    throw new Error(
      "Usage: node ./src/cli/run-benchmark.js <manifest-path> [--scenario <scenario-id>] [--dry-run]",
    );
  }

  const { manifest, workspaceRootDirectory } = await loadBenchmarkManifest(manifestPath, {
    cwd: outputRootDirectory,
  });
  const scenarios = scenarioId
    ? [findScenario(manifest, scenarioId)]
    : manifest.scenarios;

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

    console.log(cliReport);
    console.log("");
  }

  console.log(JSON.stringify({ results, mergedArtifacts }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
