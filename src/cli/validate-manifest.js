import path from "node:path";

import { loadBenchmarkManifest } from "../manifest.js";
import { loadCompareConfig } from "../compare.js";
import { detectConfigKind, parseConfigFile } from "./config-file.js";

const TODO_MARKER = /TODO:/i;
const MAX_TODO_REPORTS = 30;

async function main() {
  const absoluteConfigPath = resolveConfigPathArgument(process.argv[2]);
  const parsedConfig = await parseConfigFile(absoluteConfigPath);
  const configKind = detectConfigKind(parsedConfig, absoluteConfigPath);
  const todoFindings = findTodoFindings(parsedConfig);

  if (configKind === "manifest") {
    const { manifest, manifestPath: absoluteManifestPath } = await loadBenchmarkManifest(
      absoluteConfigPath,
    );

    console.log(JSON.stringify(buildManifestValidationSummary({
      manifest,
      configPath: absoluteManifestPath,
      configKind,
      todoFindings,
    }), null, 2));
    return;
  }

  const { compareConfig, compareConfigPath: absoluteCompareConfigPath } = await loadCompareConfig(
    absoluteConfigPath,
  );

  console.log(JSON.stringify(buildCompareValidationSummary({
    compareConfig,
    configPath: absoluteCompareConfigPath,
    configKind,
    todoFindings,
  }), null, 2));
}

function findTodoFindings(config) {
  const findings = [];
  collectTodoFindings(config, [], findings);
  return findings;
}

function collectTodoFindings(value, pathParts, findings) {
  if (value == null) {
    return;
  }

  if (typeof value === "string") {
    appendTodoFinding(findings, pathParts, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectTodoFindings(entry, [...pathParts, index], findings);
    });
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      collectTodoFindings(entry, [...pathParts, key], findings);
    });
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

function resolveConfigPathArgument(configPath) {
  if (!configPath) {
    throw new Error("Usage: node ./src/cli/validate-manifest.js <benchmark-config-path>");
  }

  return path.resolve(process.cwd(), configPath);
}

function buildManifestValidationSummary({
  manifest,
  configPath,
  configKind,
  todoFindings,
}) {
  return {
    ...buildBaseValidationSummary({
      benchmarkId: manifest.benchmark.id,
      configPath,
      configKind,
      todoFindings,
    }),
    scenarioCount: manifest.scenarios.length,
    scenarioIds: manifest.scenarios.map((scenario) => scenario.id),
    scenarioSummaries: manifest.scenarios.map((scenario) => ({
      id: scenario.id,
      description: scenario.description,
      skillMode: scenario.skillMode,
      skillSource: scenario.skillSource,
    })),
  };
}

function buildCompareValidationSummary({
  compareConfig,
  configPath,
  configKind,
  todoFindings,
}) {
  return {
    ...buildBaseValidationSummary({
      benchmarkId: compareConfig.benchmark.id,
      configPath,
      configKind,
      todoFindings,
    }),
    promptCount: compareConfig.task.prompts.length,
    promptIds: compareConfig.task.prompts.map((prompt) => prompt.id),
    variantCount: compareConfig.comparison.variants.length,
    profileCount: compareConfig.comparison.profiles.length,
    variantIds: compareConfig.comparison.variants.map((variant) => variant.id),
    profileIds: compareConfig.comparison.profiles.map((profile) => profile.id),
  };
}

function buildBaseValidationSummary({
  benchmarkId,
  configPath,
  configKind,
  todoFindings,
}) {
  const hasTodos = todoFindings.length > 0;
  return {
    status: hasTodos ? "valid-with-todos" : "valid",
    configPath,
    configKind,
    benchmarkId,
    todoCount: todoFindings.length,
    todoSamples: todoFindings.slice(0, MAX_TODO_REPORTS),
    recommendation: hasTodos
      ? "Replace fields containing \"TODO:\" before running evaluate."
      : "Ready to run evaluate.",
  };
}

function appendTodoFinding(findings, pathParts, value) {
  if (!TODO_MARKER.test(value)) {
    return;
  }

  findings.push({
    path: formatPath(pathParts),
    value,
  });
}
