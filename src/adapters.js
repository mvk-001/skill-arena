import path from "node:path";

import { fromProjectRoot } from "./project-paths.js";

export const ADAPTER_IDS = ["codex", "copilot-cli", "pi"];

const adapterRegistry = {
  codex: {
    id: "codex",
    supported: true,
    buildProvider({ scenario, workspaceDirectory, gitReady }) {
      const providerPath = fromProjectRoot("src", "providers", "codex-system-provider.js");

      return {
        id: providerPath,
        label: `codex:${scenario.agent.executionMethod}:${scenario.agent.model ?? "default"}`,
        config: {
          provider_id: `codex:${scenario.agent.executionMethod}:${scenario.agent.model ?? "default"}`,
          execution_method: scenario.agent.executionMethod,
          command_path: scenario.agent.commandPath,
          model: scenario.agent.model,
          working_dir: workspaceDirectory,
          additional_directories: scenario.agent.additionalDirectories.map(
            (directory) => path.resolve(workspaceDirectory, directory),
          ),
          sandbox_mode: scenario.agent.sandboxMode,
          approval_policy: scenario.agent.approvalPolicy,
          web_search_enabled: scenario.agent.webSearchEnabled,
          network_access_enabled: scenario.agent.networkAccessEnabled,
          model_reasoning_effort: scenario.agent.reasoningEffort,
          cli_env: scenario.agent.cliEnv,
          enable_streaming: scenario.evaluation.tracing,
          deep_tracing: scenario.evaluation.tracing,
          skip_git_repo_check: !gitReady,
          codex_config: scenario.agent.config,
        },
      };
    },
  },
  "copilot-cli": {
    id: "copilot-cli",
    supported: false,
  },
  pi: {
    id: "pi",
    supported: true,
    buildProvider({ scenario, workspaceDirectory }) {
      const providerPath = fromProjectRoot("src", "providers", "pi-system-provider.js");

      return {
        id: providerPath,
        label: `pi:${scenario.agent.model ?? "default"}`,
        config: {
          provider_id: `pi:${scenario.agent.model ?? "default"}`,
          command_path: scenario.agent.commandPath,
          model: scenario.agent.model,
          working_dir: workspaceDirectory,
          cli_env: scenario.agent.cliEnv,
        },
      };
    },
  },
};

export function getAdapter(adapterId) {
  const adapter = adapterRegistry[adapterId];

  if (!adapter) {
    throw new Error(`Unsupported adapter id "${adapterId}".`);
  }

  return adapter;
}

export function buildPromptfooProvider(context) {
  const adapter = getAdapter(context.scenario.agent.adapter);

  if (!adapter.supported) {
    throw new Error(
      `Adapter "${adapter.id}" is reserved but not implemented in V1.`,
    );
  }

  return adapter.buildProvider(context);
}
