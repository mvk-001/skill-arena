import path from "node:path";

import YAML from "yaml";

import { buildPromptfooProvider } from "./adapters.js";
import { toPromptfooGraderProvider } from "./judge-provider.js";

export function buildPromptfooConfig({ manifest, scenario, workspace }) {
  const executionWorkspaceDirectory =
    workspace.executionWorkspaceDirectory ?? workspace.workspaceDirectory;
  const provider = buildPromptfooProvider({
    manifest,
    scenario,
    workspaceDirectory: executionWorkspaceDirectory,
    workspaceEnvironment: workspace.environment ?? {},
    isolatedEnvironment: workspace.executionEnvironment ?? {},
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
      assert: resolvePromptAssertions({
        defaultAssertions: scenario.evaluation.assertions,
        taskPrompt,
      }).map((assertion) =>
        toPromptfooAssertion(assertion, executionWorkspaceDirectory),
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
  return manifest.task.prompts;
}

export function resolvePromptAssertions({ defaultAssertions, taskPrompt }) {
  if (!taskPrompt.evaluation?.assertions) {
    return defaultAssertions;
  }

  return [...defaultAssertions, ...taskPrompt.evaluation.assertions];
}

export function toPromptfooAssertion(assertion, workspaceDirectory, options = {}) {
  switch (assertion.type) {
    case "equals":
    case "contains":
    case "icontains":
    case "regex":
    case "is-json":
    case "javascript":
    case "llm-rubric":
      return {
        ...assertion,
        ...(assertion.provider
          ? { provider: toPromptfooGraderProvider(assertion.provider, workspaceDirectory) }
          : {}),
      };
    case "file-contains": {
      const escapedRelativePath = JSON.stringify(assertion.path);
      const escapedExpectedValue = JSON.stringify(assertion.value);
      const assertionLines = [
        "const fs = process.getBuiltinModule('node:fs');",
      ];

      if (options.resolveFromProviderWorkspace) {
        assertionLines.push("const path = process.getBuiltinModule('node:path');");
        assertionLines.push(
          "const workspaceDirectory = context?.providerResponse?.metadata?.workspaceDirectory ?? context?.providerResponse?.metadata?.workingDirectory;",
        );
        assertionLines.push("if (!workspaceDirectory) {");
        assertionLines.push("  throw new Error('Missing provider workspaceDirectory in assertion context.');");
        assertionLines.push("}");
        assertionLines.push("try {");
        assertionLines.push(
          `  const fileContents = fs.readFileSync(path.resolve(workspaceDirectory, ${escapedRelativePath}), 'utf8');`,
        );
        assertionLines.push(`  return fileContents.includes(${escapedExpectedValue});`);
        assertionLines.push("} catch (error) {");
        assertionLines.push("  if (error?.code === 'ENOENT') {");
        assertionLines.push("    return false;");
        assertionLines.push("  }");
        assertionLines.push("  throw error;");
        assertionLines.push("}");
      } else {
        const filePath = path.resolve(workspaceDirectory, assertion.path);
        const escapedFilePath = JSON.stringify(filePath);
        assertionLines.push("try {");
        assertionLines.push(`  const fileContents = fs.readFileSync(${escapedFilePath}, 'utf8');`);
        assertionLines.push(`  return fileContents.includes(${escapedExpectedValue});`);
        assertionLines.push("} catch (error) {");
        assertionLines.push("  if (error?.code === 'ENOENT') {");
        assertionLines.push("    return false;");
        assertionLines.push("  }");
        assertionLines.push("  throw error;");
        assertionLines.push("}");
      }

      return {
        type: "javascript",
        value: assertionLines.join("\n"),
      };
    }
    default:
      throw new Error(`Unsupported assertion type "${assertion.type}".`);
  }
}
