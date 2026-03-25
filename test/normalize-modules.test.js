import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeTask } from "../src/normalize-task.js";
import { normalizeWorkspace, normalizeWorkspaceSource } from "../src/normalize-workspace.js";
import { normalizeSkill, deriveSkillSourceLabel, buildNormalizedSkill } from "../src/normalize-skill.js";
import {
  normalizeCompareProfile,
  normalizeCompareConfigShape,
  hasLegacyWorkspaceSkillOverlay,
} from "../src/normalize-compare.js";
import {
  isObject,
  createEmptyCapabilities,
  createDefaultOutput,
} from "../src/normalize-helpers.js";

test("normalize-task normalizes single prompt shorthand", () => {
  const result = normalizeTask({ prompt: "do something" });
  assert.equal(result.prompts.length, 1);
  assert.equal(result.prompts[0].id, "default");
  assert.equal(result.prompts[0].prompt, "do something");
});

test("normalize-task preserves prompt list with ids", () => {
  const result = normalizeTask({
    prompts: [
      { id: "a", prompt: "prompt a" },
      { prompt: "prompt b" },
    ],
  });
  assert.equal(result.prompts.length, 2);
  assert.equal(result.prompts[0].id, "a");
  assert.equal(result.prompts[1].id, "prompt-2");
});

test("normalize-workspace from fixture legacy field", () => {
  const result = normalizeWorkspace({ fixture: "fixtures/base" });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].type, "local-path");
  assert.equal(result.sources[0].path, "fixtures/base");
});

test("normalize-workspace-source throws on unsupported type", () => {
  assert.throws(
    () => normalizeWorkspaceSource({ type: "nope", target: "/" }),
    /Unsupported workspace source type "nope"/,
  );
});

test("normalize-skill disabled mode returns none", () => {
  const result = normalizeSkill(undefined, { skillMode: "disabled" });
  assert.equal(result.source.type, "none");
  assert.equal(result.install.strategy, "none");
});

test("normalize-skill system-installed legacy", () => {
  const result = normalizeSkill(undefined, {
    skillMode: "enabled",
    legacySkillSource: "system-installed",
  });
  assert.equal(result.source.type, "system-installed");
  assert.equal(result.install.strategy, "system-installed");
});

test("deriveSkillSourceLabel covers all strategies", () => {
  assert.equal(deriveSkillSourceLabel({ install: { strategy: "none" } }), "none");
  assert.equal(deriveSkillSourceLabel({ install: { strategy: "system-installed" } }), "system-installed");
  assert.equal(deriveSkillSourceLabel({ install: { strategy: "workspace-overlay" } }), "workspace-overlay");
  assert.throws(
    () => deriveSkillSourceLabel({ install: { strategy: "unknown" } }),
    /Unsupported skill install strategy "unknown"/,
  );
});

test("buildNormalizedSkill infers strategy from source type", () => {
  const result = buildNormalizedSkill({ source: { type: "local-path", path: "test" } });
  assert.equal(result.install.strategy, "workspace-overlay");
});

test("normalize-helpers isObject works correctly", () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject(null), false);
  assert.equal(isObject([]), false);
  assert.equal(isObject("str"), false);
});

test("normalize-helpers createEmptyCapabilities returns all families", () => {
  const caps = createEmptyCapabilities();
  assert.deepEqual(Object.keys(caps).sort(), [
    "agents", "extensions", "hooks", "instructions", "mcp", "plugins", "skills",
  ]);
});

test("hasLegacyWorkspaceSkillOverlay detects overlay", () => {
  assert.equal(hasLegacyWorkspaceSkillOverlay({ skillOverlay: "path" }), true);
  assert.equal(hasLegacyWorkspaceSkillOverlay({}), false);
  assert.equal(hasLegacyWorkspaceSkillOverlay(null), false);
});

test("normalizeCompareProfile baseline with empty capabilities", () => {
  const profile = normalizeCompareProfile({
    id: "baseline",
    description: "test",
    capabilities: {},
  });
  assert.equal(profile.skillMode, "disabled");
  assert.equal(profile.skill.source.type, "none");
  assert.equal(profile.skillSource, "none");
});

test("normalizeCompareProfile with single skill capability", () => {
  const profile = normalizeCompareProfile({
    id: "skill",
    description: "skill profile",
    capabilities: {
      skills: [
        { source: { type: "local-path", path: "fixtures/skill" }, install: { strategy: "workspace-overlay" } },
      ],
    },
  });
  assert.equal(profile.skillMode, "enabled");
  assert.equal(profile.skill.source.type, "local-path");
  assert.equal(profile.skillSource, "workspace-overlay");
});

test("normalizeCompareProfile with multiple skills", () => {
  const profile = normalizeCompareProfile({
    id: "multi",
    description: "multi-skill profile",
    capabilities: {
      skills: [
        { source: { type: "local-path", path: "fixtures/s1" }, install: { strategy: "workspace-overlay" } },
        { source: { type: "local-path", path: "fixtures/s2" }, install: { strategy: "workspace-overlay" } },
      ],
    },
  });
  assert.equal(profile.skillMode, "enabled");
  assert.equal(profile.skillSource, "workspace-overlay");
  assert.equal(profile.skill.source.type, "inline-files");
});

test("normalizeCompareProfile preserves output and isolation", () => {
  const profile = normalizeCompareProfile({
    id: "test",
    description: "desc",
    isolation: { inheritSystem: false },
    capabilities: {},
    output: { tags: ["custom"], labels: { customLabel: "value" } },
  });
  assert.deepEqual(profile.output.tags, ["custom"]);
  assert.equal(profile.output.labels.customLabel, "value");
  assert.equal(profile.isolation.inheritSystem, false);
});

test("normalizeCompareProfile normalizes all capability families", () => {
  const profile = normalizeCompareProfile({
    id: "full",
    description: "full profile",
    capabilities: {
      instructions: [{ source: { type: "local-path", path: "inst", target: "/" } }],
      agents: [{ agentId: "agent1", source: { type: "local-path", path: "ag", target: "/" } }],
      hooks: [{ source: { type: "local-path", path: "hk", target: "/" } }],
      mcp: [{ source: { type: "empty" } }],
      extensions: [{ source: { type: "empty" } }],
      plugins: [{ source: { type: "empty" } }],
    },
  });
  assert.equal(profile.capabilities.instructions.length, 1);
  assert.equal(profile.capabilities.agents.length, 1);
  assert.equal(profile.capabilities.hooks.length, 1);
  assert.equal(profile.capabilities.mcp.length, 1);
  assert.equal(profile.capabilities.extensions.length, 1);
  assert.equal(profile.capabilities.plugins.length, 1);
});

test("normalizeCompareConfigShape normalizes full compare config", () => {
  const config = normalizeCompareConfigShape({
    schemaVersion: 1,
    benchmark: { id: "test", description: "test" },
    task: { prompt: "do something" },
    workspace: { fixture: "fixtures/base" },
    evaluation: { requests: 5 },
    comparison: {
      profiles: [
        { id: "baseline", description: "base", capabilities: {} },
      ],
      variants: [
        { id: "v1", description: "variant 1", agent: { adapter: "codex" } },
      ],
    },
  });
  assert.equal(config.task.prompts.length, 1);
  assert.equal(config.workspace.sources.length, 1);
  assert.equal(config.comparison.profiles.length, 1);
  assert.equal(config.comparison.variants.length, 1);
  assert.deepEqual(config.comparison.variants[0].output.tags, []);
});

test("normalizeCompareConfigShape normalizes legacy skillModes into profiles", () => {
  const config = normalizeCompareConfigShape({
    schemaVersion: 1,
    benchmark: { id: "test", description: "test" },
    task: { prompt: "do something" },
    workspace: { fixture: "fixtures/base" },
    evaluation: { requests: 5 },
    comparison: {
      skillModes: [
        { id: "disabled", skillMode: "disabled", description: "no skill" },
        { id: "enabled", skillMode: "enabled", description: "with skill" },
      ],
      variants: [
        { id: "v1", description: "variant 1", agent: { adapter: "codex" } },
      ],
    },
  });
  assert.equal(config.comparison.profiles.length, 2);
  assert.equal(config.comparison.profiles[0].skillMode, "disabled");
  assert.equal(config.comparison.profiles[1].skillMode, "enabled");
});

test("normalize-skill inline and git skill sources", () => {
  const inlineSkill = buildNormalizedSkill({
    source: { type: "inline", skillId: "test-skill", content: "# Skill" },
  });
  assert.equal(inlineSkill.source.type, "inline");
  assert.equal(inlineSkill.source.skillId, "test-skill");
  assert.equal(inlineSkill.install.strategy, "workspace-overlay");

  const gitSkill = buildNormalizedSkill({
    source: { type: "git", repo: "https://example.com/repo.git", ref: "main", subpath: ".", skillPath: "skills/s1", skillId: "s1" },
  });
  assert.equal(gitSkill.source.type, "git");
  assert.equal(gitSkill.source.repo, "https://example.com/repo.git");
  assert.equal(gitSkill.source.skillPath, "skills/s1");

  const inlineFilesSkill = buildNormalizedSkill({
    source: { type: "inline-files", files: [{ path: "skills/s1/SKILL.md", content: "test" }] },
  });
  assert.equal(inlineFilesSkill.source.type, "inline-files");
  assert.equal(inlineFilesSkill.source.files.length, 1);
});

test("normalize-skill with workspace-overlay legacy and explicit skill", () => {
  const result = normalizeSkill(undefined, {
    skillMode: "enabled",
    legacySkillSource: "workspace-overlay",
    legacySkillOverlay: "fixtures/overlay",
  });
  assert.equal(result.source.type, "local-path");
  assert.equal(result.source.path, "fixtures/overlay");
  assert.equal(result.install.strategy, "workspace-overlay");
});

test("normalize-skill defaults to system-installed when enabled with no other info", () => {
  const result = normalizeSkill(undefined, {
    skillMode: "enabled",
  });
  assert.equal(result.source.type, "system-installed");
  assert.equal(result.install.strategy, "system-installed");
});

test("normalize-skill with explicit skill source", () => {
  const explicit = {
    source: { type: "local-path", path: "fixtures/my-skill", skillId: "my-skill" },
    install: { strategy: "workspace-overlay" },
  };
  const result = normalizeSkill(explicit, { skillMode: "enabled" });
  assert.equal(result.source.type, "local-path");
  assert.equal(result.source.skillId, "my-skill");
});

test("normalizeWorkspaceSource supports all declared workspace source types", () => {
  const localPath = normalizeWorkspaceSource({ type: "local-path", path: "fixtures/base", target: "/" });
  assert.equal(localPath.type, "local-path");

  const git = normalizeWorkspaceSource({ type: "git", repo: "https://example.com", target: "/" });
  assert.equal(git.type, "git");

  const inlineFiles = normalizeWorkspaceSource({
    type: "inline-files",
    files: [{ path: "test.txt", content: "hello" }],
    target: "/",
  });
  assert.equal(inlineFiles.type, "inline-files");

  const empty = normalizeWorkspaceSource({ type: "empty", target: "/" });
  assert.equal(empty.type, "empty");
});

test("normalizeWorkspaceSource rejects unsupported source types", () => {
  assert.throws(
    () => normalizeWorkspaceSource({ type: "invalid", target: "/" }),
    /Unsupported workspace source type/,
  );
});

test("normalizeSkill handles disabled, legacy, explicit, and default system-installed cases", () => {
  const disabled = normalizeSkill(undefined, { skillMode: "disabled" });
  assert.equal(disabled.source.type, "none");

  const systemInstalled = normalizeSkill(undefined, { skillMode: "enabled", legacySkillSource: "system-installed" });
  assert.equal(systemInstalled.source.type, "system-installed");

  const defaultEnabled = normalizeSkill(undefined, { skillMode: "enabled" });
  assert.equal(defaultEnabled.source.type, "system-installed");
});
