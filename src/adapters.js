import path from "node:path";

import { fromPackageRoot } from "./project-paths.js";

export const ADAPTER_IDS = ["codex", "copilot-cli", "pi"];

const adapterRegistry = {
  codex: {
    id: "codex",
    supported: true,
    buildProvider({ scenario, workspaceDirectory, workspaceEnvironment, isolatedEnvironment, gitReady }) {
      const providerPath = fromPackageRoot("src", "providers", "codex-system-provider.js");
      const providerId = buildProviderId("codex", scenario.agent.executionMethod, scenario.agent.model);

      return {
        id: providerPath,
        label: providerId,
        config: {
          provider_id: providerId,
          execution_method: scenario.agent.executionMethod,
          command_path: scenario.agent.commandPath,
          model: scenario.agent.model,
          working_dir: workspaceDirectory,
          additional_directories: resolveAdditionalDirectories(
            workspaceDirectory,
            scenario.agent.additionalDirectories,
          ),
          sandbox_mode: scenario.agent.sandboxMode,
          approval_policy: scenario.agent.approvalPolicy,
          web_search_enabled: scenario.agent.webSearchEnabled,
          network_access_enabled: scenario.agent.networkAccessEnabled,
          model_reasoning_effort: scenario.agent.reasoningEffort,
          cli_env: buildCliEnvironment(
            workspaceEnvironment,
            scenario.agent.cliEnv,
            isolatedEnvironment,
          ),
          enable_streaming: scenario.evaluation.tracing,
          deep_tracing: scenario.evaluation.tracing,
          skip_git_repo_check: !gitReady,
          codex_config: mergeCodexSkillConfig({
            baseConfig: scenario.agent.config,
            strategy: resolveSkillStrategy(scenario),
            allowedSkillIds: getAllowedSkillIds(isolatedEnvironment),
            codexHome: isolatedEnvironment?.CODEX_HOME,
          }),
        },
      };
    },
  },
  "copilot-cli": {
    id: "copilot-cli",
    supported: true,
    buildProvider({ scenario, workspaceDirectory, workspaceEnvironment, isolatedEnvironment }) {
      const providerPath = fromPackageRoot("src", "providers", "copilot-system-provider.js");
      const providerId = buildProviderId("copilot-cli", scenario.agent.model);

      return {
        id: providerPath,
        label: providerId,
        config: {
          provider_id: providerId,
          command_path: scenario.agent.commandPath,
          model: scenario.agent.model,
          working_dir: workspaceDirectory,
          sandbox_mode: scenario.agent.sandboxMode,
          approval_policy: scenario.agent.approvalPolicy,
          web_search_enabled: scenario.agent.webSearchEnabled,
          network_access_enabled: scenario.agent.networkAccessEnabled,
          model_reasoning_effort: scenario.agent.reasoningEffort,
          additional_directories: resolveAdditionalDirectories(
            workspaceDirectory,
            scenario.agent.additionalDirectories,
          ),
          cli_env: buildCliEnvironment(
            workspaceEnvironment,
            scenario.agent.cliEnv,
            isolatedEnvironment,
          ),
          copilot_config: buildCopilotConfig({
            scenario,
            baseConfig: scenario.agent.config,
          }),
        },
      };
    },
  },
  pi: {
    id: "pi",
    supported: true,
    buildProvider({ scenario, workspaceDirectory, workspaceEnvironment, isolatedEnvironment }) {
      const providerPath = fromPackageRoot("src", "providers", "pi-system-provider.js");
      const providerId = buildProviderId("pi", scenario.agent.model);

      return {
        id: providerPath,
        label: providerId,
        config: {
          provider_id: providerId,
          command_path: scenario.agent.commandPath,
          model: scenario.agent.model,
          working_dir: workspaceDirectory,
          cli_env: buildCliEnvironment(
            workspaceEnvironment,
            scenario.agent.cliEnv,
            isolatedEnvironment,
          ),
          allowed_skills: getAllowedSkillIds(isolatedEnvironment),
          disable_other_skills: resolveSkillStrategy(scenario) !== "system-installed",
        },
      };
    },
  },
};

function resolveAdditionalDirectory(workspaceDirectory, directory) {
  const resolvedDirectory = path.resolve(workspaceDirectory, directory);
  const relative = path.relative(workspaceDirectory, resolvedDirectory);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Additional directory escapes the workspace root: ${directory}`);
  }

  return resolvedDirectory;
}

function resolveAdditionalDirectories(workspaceDirectory, directories = []) {
  return directories.map((directory) => resolveAdditionalDirectory(workspaceDirectory, directory));
}

function resolveSkillStrategy(scenario) {
  const profileSkills = scenario?.profile?.capabilities?.skills;
  if (Array.isArray(profileSkills) && profileSkills.length > 0) {
    return resolveProfileSkillStrategy(profileSkills);
  }

  if (scenario?.skill?.install?.strategy) {
    return scenario.skill.install.strategy;
  }

  if (scenario?.skillSource === "system-installed") {
    return "system-installed";
  }

  if (scenario?.skillSource === "workspace-overlay" || scenario?.skillMode === "enabled") {
    return "workspace-overlay";
  }

  return "none";
}

function resolveProfileSkillStrategy(profileSkills) {
  const strategies = new Set(profileSkills.map((skill) => skill.install?.strategy ?? "none"));
  return strategies.size === 1 ? [...strategies][0] : "mixed";
}

function getAllowedSkillIds(isolatedEnvironment) {
  const value = String(isolatedEnvironment?.SKILL_ARENA_ALLOWED_SKILLS ?? "");
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function getProfileCapabilities(scenario, family) {
  return Array.isArray(scenario?.profile?.capabilities?.[family])
    ? scenario.profile.capabilities[family]
    : [];
}

function buildCopilotConfig({ scenario, baseConfig }) {
  const profileAgents = getProfileCapabilities(scenario, "agents");
  if (profileAgents.length === 0) {
    return baseConfig;
  }

  if (profileAgents.length > 1) {
    throw new Error(
      `Adapter "copilot-cli" supports at most one compare profile agent, received ${profileAgents.length}.`,
    );
  }

  const agentId = profileAgents[0]?.agentId;
  if (typeof agentId !== "string" || agentId.trim() === "") {
    throw new Error(
      "Adapter \"copilot-cli\" requires profile.capabilities.agents[*].agentId to be a non-empty string.",
    );
  }

  return {
    ...(baseConfig ?? {}),
    agent: agentId,
  };
}

function mergeCodexSkillConfig({
  baseConfig,
  strategy,
  allowedSkillIds,
  codexHome,
}) {
  if (strategy === "system-installed" || strategy === "mixed") {
    return baseConfig;
  }

  if (baseConfig?.skills?.config !== undefined) {
    return baseConfig;
  }

  if (!allowedSkillIds.length) {
    return {
      ...baseConfig,
      skills: {
        ...(baseConfig?.skills ?? {}),
        config: [],
      },
    };
  }

  if (!codexHome) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    skills: {
      ...(baseConfig?.skills ?? {}),
      config: allowedSkillIds.map((skillId) => ({
        path: path.join(codexHome, "skills", skillId, "SKILL.md"),
        enabled: true,
      })),
    },
  };
}

function buildProviderId(adapterId, ...parts) {
  return [adapterId, ...parts.map((part) => part ?? "default")].join(":");
}

function buildCliEnvironment(workspaceEnvironment, cliEnvironment, isolatedEnvironment) {
  return {
    ...workspaceEnvironment,
    ...cliEnvironment,
    ...(isolatedEnvironment ?? {}),
  };
}

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
