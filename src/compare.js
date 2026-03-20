import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";
import { ZodError } from "zod";

import { compareConfigSchema } from "./compare-schema.js";
import { findWorkspaceRoot } from "./project-paths.js";

export async function loadCompareConfig(compareConfigPath, options = {}) {
  const resolutionDirectory = options.cwd ?? process.cwd();
  const absoluteCompareConfigPath = path.resolve(resolutionDirectory, compareConfigPath);
  const compareConfigContents = await fs.readFile(absoluteCompareConfigPath, "utf8");
  const parsedCompareConfig = parseConfigContents({
    configContents: compareConfigContents,
    configPath: absoluteCompareConfigPath,
  });

  try {
    const compareConfig = compareConfigSchema.parse(parsedCompareConfig);
    return {
      compareConfig,
      compareConfigPath: absoluteCompareConfigPath,
      compareConfigDirectory: path.dirname(absoluteCompareConfigPath),
      workspaceRootDirectory: findWorkspaceRoot(path.dirname(absoluteCompareConfigPath)),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatConfigErrors(error));
    }

    throw error;
  }
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

function parseConfigContents({ configContents, configPath }) {
  const extension = path.extname(configPath).toLowerCase();

  try {
    if (extension === ".yaml" || extension === ".yml") {
      return YAML.parse(configContents);
    }

    return JSON.parse(configContents);
  } catch (error) {
    throw new Error(
      `Failed to parse compare config "${configPath}". Expected valid ${extension === ".yaml" || extension === ".yml" ? "YAML" : "JSON"}. ${error.message}`,
    );
  }
}

function formatConfigErrors(error) {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("\n");
}
