import fs from "node:fs/promises";
import path from "node:path";

import { loadBenchmarkManifest } from "../manifest.js";
import { loadCompareConfig } from "../compare.js";
import YAML from "yaml";

function parseConfigFile(configFilePath) {
  const extension = path.extname(configFilePath).toLowerCase();

  return fs.readFile(configFilePath, "utf8").then((contents) => {
    try {
      if (extension === ".yaml" || extension === ".yml") {
        return YAML.parse(contents);
      }

      return JSON.parse(contents);
    } catch (error) {
      const parsedType = extension === ".yaml" || extension === ".yml" ? "YAML" : "JSON";
      throw new Error(
        `Failed to parse config "${configFilePath}". Expected valid ${parsedType}. ${error.message}`,
      );
    }
  });
}

function detectConfigKind(parsedConfig, configPath) {
  if (!parsedConfig || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) {
    throw new Error(`Invalid config format in "${configPath}".`);
  }

  const hasComparison = parsedConfig?.comparison
    && typeof parsedConfig.comparison === "object"
    && "variants" in parsedConfig.comparison
    && "skillModes" in parsedConfig.comparison;
  const hasScenarios = Array.isArray(parsedConfig.scenarios);

  if (hasComparison) {
    return "compare";
  }

  if (hasScenarios) {
    return "manifest";
  }

  throw new Error(
    `Unable to detect config type for "${configPath}". Expected either a manifest (` +
      "`scenarios`) or a compare config (`comparison`).",
  );
}

async function main() {
  const configPath = process.argv[2];

  if (!configPath) {
    throw new Error("Usage: node ./src/cli/validate-manifest.js <manifest-or-compare-path>");
  }

  const absoluteConfigPath = path.resolve(process.cwd(), configPath);
  const parsedConfig = await parseConfigFile(absoluteConfigPath);
  const configKind = detectConfigKind(parsedConfig, absoluteConfigPath);

  if (configKind === "manifest") {
    const { manifest, manifestPath: absoluteManifestPath } = await loadBenchmarkManifest(
      absoluteConfigPath,
    );

    console.log(
      JSON.stringify(
        {
          configPath: absoluteManifestPath,
          configKind,
          benchmarkId: manifest.benchmark.id,
          scenarioIds: manifest.scenarios.map((scenario) => scenario.id),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { compareConfig, compareConfigPath: absoluteCompareConfigPath } = await loadCompareConfig(
    absoluteConfigPath,
  );

  console.log(
    JSON.stringify(
      {
        configPath: absoluteCompareConfigPath,
        configKind,
        benchmarkId: compareConfig.benchmark.id,
        variantCount: compareConfig.comparison.variants.length,
        skillModeCount: compareConfig.comparison.skillModes.length,
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
