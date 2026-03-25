/**
 * Skill source and install normalization utilities.
 *
 * Extracted from normalize.js to keep each normalization concern
 * in a focused module.
 */

import { includeOptionalProperty, includeOptionalStringProperty, normalizeInlineFiles } from "./normalize-helpers.js";

export function normalizeSkill(sourceSkill, { skillMode, legacySkillOverlay, legacySkillSource }) {
  if (skillMode === "disabled") {
    return createNormalizedSkill("none", "none");
  }

  if (sourceSkill) {
    return buildNormalizedSkill(sourceSkill);
  }

  if (legacySkillSource === "system-installed") {
    return createNormalizedSkill("system-installed");
  }

  if (legacySkillSource === "workspace-overlay" || legacySkillOverlay) {
    return buildLegacyWorkspaceOverlaySkill(legacySkillOverlay);
  }

  return createNormalizedSkill("system-installed");
}

export function deriveSkillSourceLabel(skill) {
  switch (skill.install.strategy) {
    case "none":
      return "none";
    case "system-installed":
      return "system-installed";
    case "workspace-overlay":
      return "workspace-overlay";
    default:
      throw new Error(`Unsupported skill install strategy "${skill.install.strategy}".`);
  }
}

export function buildNormalizedSkill(skill) {
  return {
    source: normalizeSkillSource(skill.source),
    install: {
      strategy: skill.install?.strategy
        ?? inferInstallStrategy(skill.source),
    },
  };
}

function createNormalizedSkill(sourceType, strategy = sourceType) {
  return buildNormalizedSkill({
    source: {
      type: sourceType,
    },
    install: {
      strategy,
    },
  });
}

function buildLegacyWorkspaceOverlaySkill(skillOverlay) {
  return buildNormalizedSkill({
    source: normalizeLegacySkillOverlay(skillOverlay),
    install: {
      strategy: "workspace-overlay",
    },
  });
}

function inferInstallStrategy(source) {
  if (!source || source.type === "none") {
    return "none";
  }

  if (source.type === "system-installed") {
    return "system-installed";
  }

  return "workspace-overlay";
}

function normalizeSkillSource(source) {
  switch (source.type) {
    case "none":
      return { type: "none" };
    case "system-installed":
      return { type: "system-installed" };
    case "local-path":
      return {
        type: "local-path",
        path: source.path,
        ...includeOptionalStringProperty("skillId", source.skillId),
      };
    case "git":
      return {
        type: "git",
        repo: source.repo,
        ...includeOptionalStringProperty("ref", source.ref),
        ...includeOptionalStringProperty("subpath", source.subpath),
        ...includeOptionalStringProperty("skillPath", source.skillPath),
        ...includeOptionalStringProperty("skillId", source.skillId),
      };
    case "inline":
      return {
        type: "inline",
        skillId: source.skillId,
        ...includeOptionalProperty("content", source.content),
        ...(source.files ? { files: normalizeInlineFiles(source.files) } : {}),
      };
    case "inline-files":
      return {
        type: "inline-files",
        files: normalizeInlineFiles(source.files),
      };
    default:
      throw new Error(`Unsupported skill source type "${source.type}".`);
  }
}

function normalizeLegacySkillOverlay(skillOverlay) {
  if (!skillOverlay) {
    return {
      type: "none",
    };
  }

  if (typeof skillOverlay === "string") {
    return {
      type: "local-path",
      path: skillOverlay,
    };
  }

  if ("path" in skillOverlay) {
    return {
      type: "local-path",
      path: skillOverlay.path,
    };
  }

  if ("git" in skillOverlay) {
    return {
      type: "git",
      repo: skillOverlay.git.repo,
      ...includeOptionalStringProperty("ref", skillOverlay.git.ref),
      ...includeOptionalStringProperty("subpath", skillOverlay.git.subpath),
    };
  }

  throw new Error("Unsupported legacy workspace.skillOverlay configuration.");
}
