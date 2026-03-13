import fs from "node:fs/promises";
import path from "node:path";

import { findScenario, loadBenchmarkManifest } from "../manifest.js";
import { buildPromptfooConfig, stringifyPromptfooConfig } from "../promptfoo-config.js";
import { materializeWorkspace } from "../workspace.js";

async function main() {
  const manifestPath = process.argv[2];
  const scenarioFlagIndex = process.argv.indexOf("--scenario");
  const scenarioId = scenarioFlagIndex > -1 ? process.argv[scenarioFlagIndex + 1] : null;

  if (!manifestPath || !scenarioId) {
    throw new Error(
      "Usage: node ./src/cli/generate-promptfoo-config.js <manifest-path> --scenario <scenario-id>",
    );
  }

  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = findScenario(manifest, scenarioId);
  const workspace = await materializeWorkspace({ manifest, scenario });
  const config = buildPromptfooConfig({ manifest, scenario, workspace });
  const yaml = stringifyPromptfooConfig(config);
  const configPath = path.join(workspace.runDirectory, "promptfooconfig.yaml");

  await fs.writeFile(configPath, yaml, "utf8");

  console.log(
    JSON.stringify(
      {
        benchmarkId: manifest.benchmark.id,
        scenarioId: scenario.id,
        runDirectory: workspace.runDirectory,
        workspaceDirectory: workspace.workspaceDirectory,
        promptfooConfigPath: configPath,
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
