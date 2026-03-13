import { loadBenchmarkManifest } from "../manifest.js";

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    throw new Error("Usage: node ./src/cli/validate-manifest.js <manifest-path>");
  }

  const { manifest, manifestPath: absoluteManifestPath } = await loadBenchmarkManifest(
    manifestPath,
  );

  console.log(
    JSON.stringify(
      {
        manifestPath: absoluteManifestPath,
        benchmarkId: manifest.benchmark.id,
        scenarioIds: manifest.scenarios.map((scenario) => scenario.id),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
