import path from "node:path";

import { compareConfigSchema } from "./compare-schema.js";
import { loadValidatedConfig } from "./config-file.js";
import { findWorkspaceRoot } from "./project-paths.js";

export async function loadCompareConfig(compareConfigPath, options = {}) {
  const { config: compareConfig, configPath: absoluteCompareConfigPath } =
    await loadValidatedConfig(compareConfigPath, compareConfigSchema, options);

  return {
    compareConfig,
    compareConfigPath: absoluteCompareConfigPath,
    compareConfigDirectory: path.dirname(absoluteCompareConfigPath),
    workspaceRootDirectory: findWorkspaceRoot(path.dirname(absoluteCompareConfigPath)),
  };
}

export function expandCompareConfigToManifest(compareConfig) {
  return {
    schemaVersion: compareConfig.schemaVersion,
    benchmark: compareConfig.benchmark,
    task: compareConfig.task,
    workspace: compareConfig.workspace,
    scenarios: compareConfig.comparison.variants.flatMap((variant) =>
      compareConfig.comparison.profiles.map((profile) =>
        buildScenario(compareConfig, variant, profile),
      ),
    ),
  };
}

function buildScenario(compareConfig, variant, profile) {
  const skillSource = profile.skillSource;
  const skillStateLabel = profile.skillMode === "enabled" ? "on" : "off";
  const adapterDisplayName = variant.output?.labels?.adapterDisplayName ?? variant.agent.adapter;
  const variantDisplayName = variant.output?.labels?.variantDisplayName ?? adapterDisplayName ?? variant.id;
  const reportDisplayName = compareConfig.comparison.variants.length > 1
    ? `${adapterDisplayName}:${profile.id}`
    : profile.id;

  return {
    id: `${variant.id}-${profile.id}`,
    description: `${variant.description} | ${profile.description}`,
    skillMode: profile.skillMode,
    skill: profile.skill,
    skillSource,
    profile: {
      id: profile.id,
      description: profile.description,
      isolation: profile.isolation,
      capabilities: profile.capabilities,
    },
    agent: variant.agent,
    evaluation: compareConfig.evaluation,
    output: {
      tags: [
        ...compareConfig.benchmark.tags,
        ...(variant.output?.tags ?? []),
        ...(profile.output?.tags ?? []),
      ],
      labels: {
        adapter: variant.agent.adapter,
        adapterDisplayName,
        displayName: profile.id,
        profileDisplayName: profile.id,
        profileId: profile.id,
        reportDisplayName,
        model: variant.agent.model ?? "default",
        skill: skillStateLabel,
        skillDisplayName: profile.id,
        skillModeId: profile.id,
        skillSource,
        variant: variant.id,
        variantDisplayName,
        ...(variant.output?.labels ?? {}),
        ...(profile.output?.labels ?? {}),
      },
    },
  };
}
