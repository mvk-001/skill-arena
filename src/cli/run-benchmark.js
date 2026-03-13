import { findScenario, loadBenchmarkManifest } from "../manifest.js";
import { runScenario } from "../runner.js";

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

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
