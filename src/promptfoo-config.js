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
  const taskPrompts = getTaskPrompts(manifest);

  const config = {
    description: `${manifest.benchmark.id}:${scenario.id}`,
    prompts: ["{{taskPrompt}}"],
    providers: [provider],
    tests: taskPrompts.map((taskPrompt) => ({
      description: taskPrompt.description ?? scenario.description,
      vars: {
        taskPrompt: taskPrompt.prompt,
      },
      metadata: {
        benchmarkId: manifest.benchmark.id,
        scenarioId: scenario.id,
        scenarioDescription: scenario.description,
        promptId: taskPrompt.id,
        promptDescription: taskPrompt.description ?? null,
        skillMode: scenario.skillMode,
        model: scenario.agent.model ?? null,
        tags: [...manifest.benchmark.tags, ...scenario.output.tags],
        labels: scenario.output.labels,
        ...flattenLabels(scenario.output.labels),
      },
      assert: scenario.evaluation.assertions.map((assertion) =>
        toPromptfooAssertion(assertion, workspace.workspaceDirectory),
      ),
    })),
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

export function flattenLabels(labels) {
  return Object.fromEntries(
    Object.entries(labels).map(([key, value]) => [`label_${key}`, value]),
  );
}

export function getTaskPrompts(manifest) {
  if ("prompts" in manifest.task) {
    return manifest.task.prompts;
  }

  return [
    {
      id: "default",
      prompt: manifest.task.prompt,
    },
  ];
}

export function toPromptfooAssertion(assertion, workspaceDirectory) {
  switch (assertion.type) {
    case "equals":
    case "contains":
    case "icontains":
    case "regex":
    case "is-json":
    case "javascript":
    case "llm-rubric":
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
