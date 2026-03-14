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
  assert.equal(config.prompts[0], "{{taskPrompt}}");
  assert.equal(config.tests[0].vars.taskPrompt, manifest.task.prompt);
  assert.equal(config.tests[0].metadata.skillMode, "disabled");
  assert.equal(config.tests[0].metadata.scenarioDescription, scenario.description);
  assert.equal(config.tests[0].metadata.model, "gpt-5.1-codex-mini");
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

test("llm-rubric assertions pass through to Promptfoo", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.evaluation.assertions = [
    {
      type: "llm-rubric",
      value:
        "Return a score of 1 only if the answer matches the expected answer `ALPHA-42` exactly.",
      threshold: 0.9,
      metric: "answer-quality",
      provider: "openai:gpt-5-mini",
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

  assert.deepEqual(config.tests[0].assert[0], scenario.evaluation.assertions[0]);
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

test("multiple task prompts become multiple Promptfoo tests", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = findScenario(manifest, "codex-mini-no-skill");

  manifest.task = {
    prompts: [
      {
        id: "prompt-one",
        prompt: "Return the marker.",
        description: "First prompt",
      },
      {
        id: "prompt-two",
        prompt: "Return the canonical token.",
      },
    ],
  };

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      gitReady: true,
    },
  });

  assert.equal(config.tests.length, 2);
  assert.equal(config.tests[0].metadata.promptId, "prompt-one");
  assert.equal(config.tests[0].vars.taskPrompt, "Return the marker.");
  assert.equal(config.tests[1].metadata.promptId, "prompt-two");
  assert.equal(config.tests[1].vars.taskPrompt, "Return the canonical token.");
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
