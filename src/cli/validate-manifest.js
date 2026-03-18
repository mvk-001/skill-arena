import fs from "node:fs/promises";
import path from "node:path";

import { loadBenchmarkManifest } from "../manifest.js";
import { loadCompareConfig } from "../compare.js";
import YAML from "yaml";

const TODO_MARKER = /TODO:/i;
const MAX_TODO_REPORTS = 30;

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
  const todoFindings = findTodoFindings(parsedConfig);

  if (configKind === "manifest") {
    const { manifest, manifestPath: absoluteManifestPath } = await loadBenchmarkManifest(
      absoluteConfigPath,
    );

    console.log(
      JSON.stringify(
        {
          status: todoFindings.length > 0 ? "valid-with-todos" : "valid",
          configPath: absoluteManifestPath,
          configKind,
          benchmarkId: manifest.benchmark.id,
          scenarioCount: manifest.scenarios.length,
          scenarioIds: manifest.scenarios.map((scenario) => scenario.id),
          scenarioSummaries: manifest.scenarios.map((scenario) => ({
            id: scenario.id,
            description: scenario.description,
            skillMode: scenario.skillMode,
            skillSource: scenario.skillSource,
          })),
          todoCount: todoFindings.length,
          todoSamples: todoFindings.slice(0, MAX_TODO_REPORTS),
          recommendation:
            todoFindings.length > 0
              ? "Replace fields containing \"TODO:\" before running evaluate."
              : "Ready to run evaluate.",
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
        status: todoFindings.length > 0 ? "valid-with-todos" : "valid",
        configPath: absoluteCompareConfigPath,
        configKind,
        benchmarkId: compareConfig.benchmark.id,
        promptCount: compareConfig.task.prompts.length,
        promptIds: compareConfig.task.prompts.map((prompt) => prompt.id),
        variantCount: compareConfig.comparison.variants.length,
        skillModeCount: compareConfig.comparison.skillModes.length,
        variantIds: compareConfig.comparison.variants.map((variant) => variant.id),
        skillModeIds: compareConfig.comparison.skillModes.map((skillMode) => skillMode.id),
        todoCount: todoFindings.length,
        todoSamples: todoFindings.slice(0, MAX_TODO_REPORTS),
        recommendation:
          todoFindings.length > 0
            ? "Replace fields containing \"TODO:\" before running evaluate."
            : "Ready to run evaluate.",
      },
      null,
      2,
    ),
  );
}

function findTodoFindings(config) {
  const findings = [];
  collectTodoFindings(config, [], findings);
  return findings;
}

function collectTodoFindings(value, pathParts, findings) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (TODO_MARKER.test(value)) {
      findings.push({
        path: formatPath(pathParts),
        value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectTodoFindings(entry, [...pathParts, index], findings);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      collectTodoFindings(entry, [...pathParts, key], findings);
    }
  }
}

function formatPath(pathParts) {
  if (pathParts.length === 0) {
    return "<root>";
  }

  return pathParts
    .map((segment, index) => {
      if (Number.isInteger(segment)) {
        return `[${segment}]`;
      }
      return `${index === 0 ? "" : "."}${segment}`;
    })
    .join("");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
