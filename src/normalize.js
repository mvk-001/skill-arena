/**
 * Normalization façade.
 *
 * This module re-exports all normalization functions from the focused
 * sub-modules so that existing import paths continue to work without
 * changes.  New code should prefer importing from the specific module
 * (normalize-task, normalize-workspace, normalize-skill,
 * normalize-compare, normalize-helpers) when only a narrow surface is
 * needed.
 */

// Helpers
export {
  isObject,
  includeOptionalProperty,
  includeOptionalStringProperty,
  normalizeInlineFiles,
  createDefaultOutput,
  createDefaultIsolation,
  createEmptyCapabilities,
} from "./normalize-helpers.js";

// Task
export { normalizeTask } from "./normalize-task.js";

// Workspace
export { normalizeWorkspace, normalizeWorkspaceSource } from "./normalize-workspace.js";

// Skill
export { normalizeSkill, deriveSkillSourceLabel, buildNormalizedSkill } from "./normalize-skill.js";

// Compare
export {
  normalizeCompareSkillMode,
  normalizeCompareProfile,
  normalizeCompareConfigShape,
  hasLegacyWorkspaceSkillOverlay,
} from "./normalize-compare.js";

// Manifest (composed from sub-modules)
import { normalizeTask } from "./normalize-task.js";
import { normalizeWorkspace } from "./normalize-workspace.js";
import { normalizeSkill, deriveSkillSourceLabel } from "./normalize-skill.js";
import { createDefaultOutput } from "./normalize-helpers.js";

export function normalizeScenario(scenario, workspace) {
  const skill = normalizeSkill(scenario.skill, {
    skillMode: scenario.skillMode,
    legacySkillOverlay: workspace.skillOverlay,
    legacySkillSource: scenario.skillSource,
  });
  const skillSource = deriveSkillSourceLabel(skill);

  return {
    id: scenario.id,
    description: scenario.description,
    skillMode: scenario.skillMode,
    skill,
    skillSource,
    agent: scenario.agent,
    evaluation: scenario.evaluation,
    output: scenario.output ?? createDefaultOutput(),
  };
}

export function normalizeManifestShape(manifest) {
  const workspace = normalizeWorkspace(manifest.workspace);

  return {
    schemaVersion: manifest.schemaVersion,
    benchmark: manifest.benchmark,
    task: normalizeTask(manifest.task),
    workspace,
    scenarios: manifest.scenarios.map((scenario) => normalizeScenario(scenario, manifest.workspace)),
  };
}
