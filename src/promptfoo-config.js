import path from "node:path";

import YAML from "yaml";

import { buildPromptfooProvider } from "./adapters.js";

export function buildPromptfooConfig({ manifest, scenario, workspace }) {
  const provider = buildPromptfooProvider({
    manifest,
    scenario,
    workspaceDirectory: workspace.workspaceDirectory,
    gitReady: workspace.gitReady,
  });

  const config = {
    description: `${manifest.benchmark.id}:${scenario.id}`,
    prompts: [manifest.task.prompt],
    providers: [provider],
    tests: [
      {
        description: scenario.description,
        metadata: {
          benchmarkId: manifest.benchmark.id,
          scenarioId: scenario.id,
          skillMode: scenario.skillMode,
          tags: [...manifest.benchmark.tags, ...scenario.output.tags],
          labels: scenario.output.labels,
        },
        assert: scenario.evaluation.assertions.map((assertion) =>
          toPromptfooAssertion(assertion, workspace.workspaceDirectory),
        ),
      },
    ],
  };

  if (scenario.evaluation.tracing) {
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

export function stringifyPromptfooConfig(config) {
  return YAML.stringify(config);
}

function toPromptfooAssertion(assertion, workspaceDirectory) {
  switch (assertion.type) {
    case "equals":
    case "contains":
    case "icontains":
    case "regex":
      return assertion;
    case "is-json":
      return assertion;
    case "javascript":
      return assertion;
    case "file-contains": {
      const filePath = path.resolve(workspaceDirectory, assertion.path);
      const escapedFilePath = JSON.stringify(filePath);
      const escapedExpectedValue = JSON.stringify(assertion.value);

      return {
        type: "javascript",
        value: [
          "(() => {",
          "  const fs = require('node:fs');",
          `  const fileContents = fs.readFileSync(${escapedFilePath}, 'utf8');`,
          `  return fileContents.includes(${escapedExpectedValue});`,
          "})()",
        ].join("\n"),
      };
    }
    default:
      throw new Error(`Unsupported assertion type "${assertion.type}".`);
  }
}
