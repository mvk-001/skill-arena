import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveSkillSourceLabel,
  hasLegacyWorkspaceSkillOverlay,
  normalizeCompareConfigShape,
  normalizeCompareSkillMode,
  normalizeManifestShape,
  normalizeScenario,
  normalizeSkill,
  normalizeWorkspaceSource,
} from "../src/normalize.js";

test("normalizeWorkspaceSource supports all declared workspace source types", () => {
  assert.deepEqual(normalizeWorkspaceSource({
    id: "base",
    type: "local-path",
    path: "fixtures/base",
    target: "/",
  }), {
    id: "base",
    type: "local-path",
    path: "fixtures/base",
    target: "/",
  });

  assert.deepEqual(normalizeWorkspaceSource({
    id: "remote",
    type: "git",
    repo: "https://example.test/repo.git",
    ref: "main",
    subpath: "overlay",
    target: "/",
  }), {
    id: "remote",
    type: "git",
    repo: "https://example.test/repo.git",
    ref: "main",
    subpath: "overlay",
    target: "/",
  });

  assert.deepEqual(normalizeWorkspaceSource({
    id: "inline",
    type: "inline-files",
    target: "/",
    files: [
      {
        path: "README.md",
        content: "hello",
      },
      {
        path: "empty.txt",
      },
    ],
  }), {
    id: "inline",
    type: "inline-files",
    target: "/",
    files: [
      {
        path: "README.md",
        content: "hello",
      },
      {
        path: "empty.txt",
      },
    ],
  });

  assert.deepEqual(normalizeWorkspaceSource({
    id: "none",
    type: "empty",
    target: "/tmp",
  }), {
    id: "none",
    type: "empty",
    target: "/tmp",
  });
});

test("normalizeWorkspaceSource rejects unsupported source types", () => {
  assert.throws(
    () => normalizeWorkspaceSource({ type: "archive", target: "/" }),
    /Unsupported workspace source type "archive"\./,
  );
});

test("normalizeSkill handles disabled, legacy, explicit, and default system-installed cases", () => {
  assert.deepEqual(
    normalizeSkill(undefined, { skillMode: "disabled" }),
    {
      source: { type: "none" },
      install: { strategy: "none" },
    },
  );

  assert.deepEqual(
    normalizeSkill(undefined, {
      skillMode: "enabled",
      legacySkillSource: "system-installed",
    }),
    {
      source: { type: "system-installed" },
      install: { strategy: "system-installed" },
    },
  );

  assert.deepEqual(
    normalizeSkill(undefined, {
      skillMode: "enabled",
      legacySkillSource: "workspace-overlay",
      legacySkillOverlay: { path: "skills/overlay" },
    }),
    {
      source: { type: "local-path", path: "skills/overlay" },
      install: { strategy: "workspace-overlay" },
    },
  );

  assert.deepEqual(
    normalizeSkill(undefined, {
      skillMode: "enabled",
      legacySkillOverlay: {
        git: {
          repo: "https://example.test/overlay.git",
          ref: "main",
          subpath: "skill",
        },
      },
    }),
    {
      source: {
        type: "git",
        repo: "https://example.test/overlay.git",
        ref: "main",
        subpath: "skill",
      },
      install: { strategy: "workspace-overlay" },
    },
  );

  assert.deepEqual(
    normalizeSkill({
      source: {
        type: "inline-files",
        files: [{ path: "AGENTS.md", content: "x" }],
      },
    }, { skillMode: "enabled" }),
    {
      source: {
        type: "inline-files",
        files: [{ path: "AGENTS.md", content: "x" }],
      },
      install: { strategy: "workspace-overlay" },
    },
  );

  assert.deepEqual(
    normalizeSkill(undefined, { skillMode: "enabled" }),
    {
      source: { type: "system-installed" },
      install: { strategy: "system-installed" },
    },
  );
});

test("normalizeSkill rejects unsupported legacy overlays and deriveSkillSourceLabel rejects invalid strategies", () => {
  assert.throws(
    () => normalizeSkill(undefined, {
      skillMode: "enabled",
      legacySkillOverlay: { unsupported: true },
      legacySkillSource: "workspace-overlay",
    }),
    /Unsupported legacy workspace\.skillOverlay configuration\./,
  );

  assert.throws(
    () => deriveSkillSourceLabel({
      install: {
        strategy: "custom",
      },
    }),
    /Unsupported skill install strategy "custom"\./,
  );
});

test("normalizeScenario and normalizeCompareSkillMode populate defaults and labels", () => {
  const workspace = {
    fixture: "fixtures/base",
    skillOverlay: "skills/overlay",
  };

  const scenario = normalizeScenario({
    id: "skill-enabled",
    description: "Enabled scenario",
    skillMode: "enabled",
    agent: { adapter: "codex" },
    evaluation: { assertions: [] },
  }, workspace);

  const skillMode = normalizeCompareSkillMode({
    id: "skill",
    description: "Enabled compare mode",
    skillMode: "enabled",
  }, workspace);

  assert.equal(scenario.skillSource, "workspace-overlay");
  assert.deepEqual(scenario.output, { tags: [], labels: {} });
  assert.equal(skillMode.skillSource, "none");
  assert.deepEqual(skillMode.output, { tags: [], labels: {} });
});

test("normalizeManifestShape and normalizeCompareConfigShape normalize prompts and outputs", () => {
  const manifest = normalizeManifestShape({
    schemaVersion: 1,
    benchmark: {
      id: "manifest-check",
      description: "Manifest check",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/base",
      initializeGit: false,
    },
    scenarios: [
      {
        id: "scenario-one",
        description: "One scenario",
        skillMode: "disabled",
        skillSource: "none",
        agent: { adapter: "codex" },
        evaluation: { assertions: [] },
      },
    ],
  });

  const compareConfig = normalizeCompareConfigShape({
    schemaVersion: 1,
    benchmark: {
      id: "compare-check",
      description: "Compare check",
      tags: [],
    },
    task: {
      prompts: [{ prompt: "Return HELLO." }],
    },
    workspace: {
      fixture: "fixtures/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [],
      requests: 2,
      timeoutMs: 1000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "variant-one",
          description: "Variant one",
          agent: { adapter: "codex" },
        },
      ],
    },
  });

  assert.equal(manifest.task.prompts[0].id, "default");
  assert.deepEqual(manifest.scenarios[0].output, { tags: [], labels: {} });
  assert.equal(compareConfig.task.prompts[0].id, "prompt-1");
  assert.deepEqual(compareConfig.comparison.variants[0].output, { tags: [], labels: {} });
});

test("hasLegacyWorkspaceSkillOverlay detects only explicit skillOverlay entries", () => {
  assert.equal(hasLegacyWorkspaceSkillOverlay({ skillOverlay: "skills/overlay" }), true);
  assert.equal(hasLegacyWorkspaceSkillOverlay({}), false);
  assert.equal(hasLegacyWorkspaceSkillOverlay(null), false);
});
