import test from "node:test";
import assert from "node:assert/strict";

import { findScenario, loadBenchmarkManifest } from "../src/manifest.js";
import { buildPromptfooConfig } from "../src/promptfoo-config.js";
import { fromProjectRoot } from "../src/project-paths.js";

test("codex scenarios generate Promptfoo custom script providers", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = findScenario(manifest, "codex-mini-no-skill");

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      gitReady: true,
    },
  });

  assert.match(config.providers[0].id, /codex-system-provider\.js$/);
  assert.equal(config.providers[0].config.model, "gpt-5.1-codex-mini");
  assert.equal(config.providers[0].config.execution_method, "command");
  assert.equal(config.providers[0].config.command_path, "codex");
  assert.equal(config.providers[0].config.working_dir, "C:/temp/workspace");
  assert.equal(config.providers[0].config.approval_policy, "never");
  assert.equal(config.tests[0].metadata.skillMode, "disabled");
});

test("file-contains assertions become Promptfoo javascript assertions", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.evaluation.assertions = [
    {
      type: "file-contains",
      path: "notes/target.txt",
      value: "ALPHA-42",
    },
  ];

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      gitReady: true,
    },
  });

  assert.equal(config.tests[0].assert[0].type, "javascript");
  assert.match(config.tests[0].assert[0].value, /notes\/target\.txt|notes\\\\target\.txt/);
});

test("codex scenarios can switch to sdk execution", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.agent.executionMethod = "sdk";

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      gitReady: false,
    },
  });

  assert.equal(config.providers[0].config.execution_method, "sdk");
  assert.equal(config.providers[0].config.skip_git_repo_check, true);
});

test("system skill benchmarks generate valid custom providers", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "gws-gmail-triage",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = findScenario(manifest, "codex-mini-command-with-system-skill");

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      gitReady: true,
    },
  });

  assert.equal(config.providers[0].config.execution_method, "command");
  assert.equal(config.providers[0].config.network_access_enabled, true);
  assert.equal(config.providers[0].config.sandbox_mode, "danger-full-access");
  assert.equal(config.tests[0].metadata.skillMode, "enabled");
});
