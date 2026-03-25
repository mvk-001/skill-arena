/**
 * Compare config normalization utilities.
 *
 * Extracted from normalize.js to keep each normalization concern
 * in a focused module.
 */

import {
  isObject,
  createDefaultOutput,
  createDefaultIsolation,
  createEmptyCapabilities,
} from "./normalize-helpers.js";
import { normalizeTask } from "./normalize-task.js";
import { normalizeWorkspace } from "./normalize-workspace.js";
import { normalizeSkill, deriveSkillSourceLabel, buildNormalizedSkill } from "./normalize-skill.js";

export function normalizeCompareSkillMode(skillMode, workspace) {
  const skill = skillMode.skillMode === "enabled" && !skillMode.skill
    ? buildNormalizedSkill({
      source: {
        type: "none",
      },
      install: {
        strategy: "none",
      },
    })
    : normalizeSkill(skillMode.skill, {
      skillMode: skillMode.skillMode,
      legacySkillOverlay: workspace.skillOverlay,
      legacySkillSource: skillMode.skillSource,
    });

  const capabilities = createEmptyCapabilities();
  if (skill.install.strategy !== "none") {
    capabilities.skills.push(skill);
  }

  return {
    id: skillMode.id,
    description: skillMode.description,
    isolation: createDefaultIsolation(),
    capabilities,
    skillMode: skillMode.skillMode,
    skill,
    skillSource: deriveSkillSourceLabel(skill),
    output: skillMode.output ?? createDefaultOutput(),
  };
}

function normalizeGenericCapabilityEntry(entry) {
  if (!isObject(entry)) {
    throw new Error("Capability entries must be objects.");
  }

  return { ...entry };
}

function normalizeCapabilities(capabilities = {}) {
  const normalized = createEmptyCapabilities();

  if (Array.isArray(capabilities.instructions)) {
    normalized.instructions = capabilities.instructions.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.skills)) {
    normalized.skills = capabilities.skills.map((skill) => buildNormalizedSkill(skill));
  }

  if (Array.isArray(capabilities.agents)) {
    normalized.agents = capabilities.agents.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.hooks)) {
    normalized.hooks = capabilities.hooks.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.mcp)) {
    normalized.mcp = capabilities.mcp.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.extensions)) {
    normalized.extensions = capabilities.extensions.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.plugins)) {
    normalized.plugins = capabilities.plugins.map(normalizeGenericCapabilityEntry);
  }

  return normalized;
}

function deriveCompareProfileSkillMode(capabilities) {
  return capabilities.skills.length > 0 ? "enabled" : "disabled";
}

function deriveCompareProfileSkill(capabilities) {
  if (capabilities.skills.length === 0) {
    return buildNormalizedSkill({
      source: { type: "none" },
      install: { strategy: "none" },
    });
  }

  if (capabilities.skills.length === 1) {
    return capabilities.skills[0];
  }

  return buildNormalizedSkill({
    source: {
      type: "inline-files",
      files: [],
    },
    install: {
      strategy: "workspace-overlay",
    },
  });
}

function deriveProfileSkillSource(capabilities) {
  if (capabilities.skills.length === 0) {
    return "none";
  }

  const strategies = new Set(capabilities.skills.map((skill) => deriveSkillSourceLabel(skill)));
  if (strategies.size === 1) {
    return capabilities.skills.length > 1 && strategies.has("workspace-overlay")
      ? "workspace-overlay"
      : [...strategies][0];
  }

  return "mixed";
}

export function normalizeCompareProfile(profile) {
  const capabilities = normalizeCapabilities(profile.capabilities);
  const skill = profile.skill ?? deriveCompareProfileSkill(capabilities);
  const skillMode = profile.skillMode ?? deriveCompareProfileSkillMode(capabilities);

  return {
    id: profile.id,
    description: profile.description,
    isolation: {
      inheritSystem: profile.isolation?.inheritSystem ?? false,
    },
    capabilities,
    skillMode,
    skill,
    skillSource: profile.skillSource ?? deriveProfileSkillSource(capabilities),
    output: profile.output ?? createDefaultOutput(),
  };
}

function normalizeLegacyCompareSkillModes(compareConfig) {
  if (!compareConfig?.comparison || Array.isArray(compareConfig.comparison.profiles)) {
    return compareConfig;
  }

  return {
    ...compareConfig,
    comparison: {
      ...compareConfig.comparison,
      profiles: (compareConfig.comparison.skillModes ?? []).map((skillMode) =>
        normalizeCompareSkillMode(skillMode, compareConfig.workspace)
      ),
    },
  };
}

export function normalizeCompareConfigShape(compareConfig) {
  const compareConfigWithProfiles = normalizeLegacyCompareSkillModes(compareConfig);
  const workspace = normalizeWorkspace(compareConfig.workspace);

  return {
    schemaVersion: compareConfigWithProfiles.schemaVersion,
    benchmark: compareConfigWithProfiles.benchmark,
    task: normalizeTask(compareConfigWithProfiles.task),
    workspace,
    evaluation: compareConfigWithProfiles.evaluation,
    comparison: {
      profiles: compareConfigWithProfiles.comparison.profiles.map((profile) =>
        "capabilities" in profile
          ? normalizeCompareProfile(profile)
          : normalizeCompareSkillMode(profile, compareConfig.workspace)
      ),
      variants: compareConfigWithProfiles.comparison.variants.map((variant) => ({
        id: variant.id,
        description: variant.description,
        agent: variant.agent,
        output: variant.output ?? createDefaultOutput(),
      })),
    },
  };
}

export function hasLegacyWorkspaceSkillOverlay(workspace) {
  return isObject(workspace) && "skillOverlay" in workspace && workspace.skillOverlay !== undefined;
}
