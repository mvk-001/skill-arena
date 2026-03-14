import { findScenario, loadBenchmarkManifest } from "../manifest.js";
import {
  buildMergedBenchmarkSummary,
  renderMergedBenchmarkReport,
  writeMergedBenchmarkArtifacts,
} from "../results.js";
import { runScenario } from "../runner.js";
import { fromProjectRoot } from "../project-paths.js";

async function main() {
  const manifestPath = process.argv[2];
  const scenarioFlagIndex = process.argv.indexOf("--scenario");
  const dryRun = process.argv.includes("--dry-run");
  const scenarioId = scenarioFlagIndex > -1 ? process.argv[scenarioFlagIndex + 1] : null;

  if (!manifestPath) {
    throw new Error(
      "Usage: node ./src/cli/run-benchmark.js <manifest-path> [--scenario <scenario-id>] [--dry-run]",
    );
  }

  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenarios = scenarioId
    ? [findScenario(manifest, scenarioId)]
    : manifest.scenarios;

  const results = [];

  for (const scenario of scenarios) {
    results.push(
      await runScenario({
        manifest,
        scenario,
        dryRun,
      }),
    );
  }

  const completedSummaries = results
    .filter((result) => !result.skipped && result.summary)
    .map((result) => result.summary);

  let mergedArtifacts = null;

  if (completedSummaries.length > 0) {
    const batchRunId = new Date().toISOString().replace(/[:.]/g, "-");
    const benchmarkRunDirectory = fromProjectRoot(
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
