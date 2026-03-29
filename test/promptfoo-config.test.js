import test from "node:test";
import assert from "node:assert/strict";

import { findScenario, loadBenchmarkManifest } from "../src/manifest.js";
import { benchmarkManifestSchema } from "../src/manifest-schema.js";
import {
  buildPromptfooConfig,
  flattenLabels,
  resolvePromptAssertions,
  stringifyPromptfooConfig,
  toPromptfooAssertion,
} from "../src/promptfoo-config.js";
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
      environment: {},
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
  assert.equal(config.tests[0].vars.taskPrompt, manifest.task.prompts[0].prompt);
  assert.equal(config.tests[0].metadata.skillMode, "disabled");
  assert.equal(config.tests[0].metadata.scenarioDescription, scenario.description);
  assert.equal(config.tests[0].metadata.model, "gpt-5.1-codex-mini");
});

test("promptfoo config prefers the isolated execution workspace and merged execution environment", async () => {
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
      workspaceDirectory: "C:/artifacts/workspace",
      executionWorkspaceDirectory: "C:/isolated/workspace",
      environment: {
        BASE_FLAG: "1",
      },
      executionEnvironment: {
        HOME: "C:/isolated/home",
      },
      gitReady: true,
    },
  });

  assert.equal(config.providers[0].config.working_dir, "C:/isolated/workspace");
  assert.equal(config.providers[0].config.cli_env.BASE_FLAG, "1");
  assert.equal(config.providers[0].config.cli_env.HOME, "C:/isolated/home");
  assert.match(config.tests[0].assert[0].value ?? "", /isolated[\\/]{2,4}workspace|isolated\/workspace/);
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
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tests[0].assert[0].type, "javascript");
  assert.match(config.tests[0].assert[0].value, /notes\/target\.txt|notes\\\\target\.txt/);
  assert.match(config.tests[0].assert[0].value, /process\.getBuiltinModule\('node:fs'\)/);
  assert.match(config.tests[0].assert[0].value, /^const fs =/);
  assert.match(config.tests[0].assert[0].value, /return fileContents\.includes/);
  assert.match(config.tests[0].assert[0].value, /error\?\.code === 'ENOENT'/);
});

test("file-contains assertions can resolve from the active compare provider workspace", () => {
  const assertion = toPromptfooAssertion(
    {
      type: "file-contains",
      path: "notes/target.txt",
      value: "ALPHA-42",
    },
    "C:/temp/workspace",
    { resolveFromProviderWorkspace: true },
  );

  assert.equal(assertion.type, "javascript");
  assert.match(assertion.value, /context\?\.providerResponse\?\.metadata\?\.workspaceDirectory/);
  assert.match(assertion.value, /process\.getBuiltinModule\('node:path'\)/);
  assert.match(assertion.value, /path\.resolve\(workspaceDirectory, "notes\/target\.txt"\)/);
  assert.match(assertion.value, /error\?\.code === 'ENOENT'/);
  assert.doesNotMatch(assertion.value, /C:\\\/temp\\\/workspace|C:\/temp\/workspace/);
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
      environment: {},
      gitReady: true,
    },
  });

  assert.deepEqual(config.tests[0].assert[0], scenario.evaluation.assertions[0]);
});

test("llm-rubric local judge shorthand rewrites to packaged custom provider", async () => {
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
      value: "Score 1 only if the answer is ALPHA-42.",
      provider: "skill-arena:judge:codex",
    },
  ];

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.match(config.tests[0].assert[0].provider.id, /local-judge-provider\.js$/);
  assert.equal(config.tests[0].assert[0].provider.config.adapter, "codex");
  assert.equal(config.tests[0].assert[0].provider.config.provider_id, "skill-arena:judge:codex");
});

test("llm-rubric local judge object form preserves custom config", async () => {
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
      value: "Score 1 only if the answer is ALPHA-42.",
      provider: {
        id: "skill-arena:judge:copilot-cli",
        config: {
          model: "gpt-5",
          commandPath: "copilot",
        },
      },
    },
  ];

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tests[0].assert[0].provider.config.adapter, "copilot-cli");
  assert.equal(config.tests[0].assert[0].provider.config.model, "gpt-5");
  assert.equal(config.tests[0].assert[0].provider.config.commandPath, "copilot");
});

test("llm-rubric opencode local judge shorthand rewrites to packaged custom provider", async () => {
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
      value: "Score 1 only if the answer is ALPHA-42.",
      provider: "skill-arena:judge:opencode",
    },
  ];

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tests[0].assert[0].provider.config.adapter, "opencode");
  assert.equal(config.tests[0].assert[0].provider.config.provider_id, "skill-arena:judge:opencode");
});

test("opencode scenarios generate Promptfoo custom script providers", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.id = "opencode-gpt5-no-skill";
  scenario.agent.adapter = "opencode";
  scenario.agent.model = "openai/gpt-5";
  scenario.agent.commandPath = "opencode";

  const parsedScenario = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: manifest.benchmark,
    task: manifest.task,
    workspace: manifest.workspace,
    scenarios: [scenario],
  }).scenarios[0];

  const config = buildPromptfooConfig({
    manifest,
    scenario: parsedScenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.match(config.providers[0].id, /opencode-system-provider\.js$/);
  assert.equal(config.providers[0].config.model, "openai/gpt-5");
  assert.equal(config.providers[0].config.command_path, "opencode");
  assert.equal(config.providers[0].config.working_dir, "C:/temp/workspace");
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
      environment: {},
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
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tests.length, 2);
  assert.equal(config.tests[0].metadata.promptId, "prompt-one");
  assert.equal(config.tests[0].vars.taskPrompt, "Return the marker.");
  assert.equal(config.tests[1].metadata.promptId, "prompt-two");
  assert.equal(config.tests[1].vars.taskPrompt, "Return the canonical token.");
});

test("prompt-level assertions are appended to scenario assertions", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  manifest.task = {
    prompts: [
      {
        id: "prompt-one",
        prompt: "Return the marker.",
        evaluation: {
          assertions: [
            {
              type: "contains",
              value: "ALPHA",
            },
          ],
        },
      },
    ],
  };
  scenario.evaluation.assertions = [
    {
      type: "contains",
      value: "42",
    },
  ];

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tests[0].assert.length, 2);
  assert.deepEqual(resolvePromptAssertions({
    defaultAssertions: scenario.evaluation.assertions,
    taskPrompt: manifest.task.prompts[0],
  }), [
    {
      type: "contains",
      value: "42",
    },
    {
      type: "contains",
      value: "ALPHA",
    },
  ]);
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
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.providers[0].config.execution_method, "command");
  assert.equal(config.providers[0].config.network_access_enabled, true);
  assert.equal(config.providers[0].config.sandbox_mode, "danger-full-access");
  assert.equal(config.tests[0].metadata.skillMode, "enabled");
});

test("pi scenarios generate Promptfoo custom script providers", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.id = "pi-gpt5mini-no-skill";
  scenario.agent.adapter = "pi";
  scenario.agent.model = "github-copilot/gpt-5-mini";
  scenario.agent.commandPath = "pi";

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.match(config.providers[0].id, /pi-system-provider\.js$/);
  assert.equal(config.providers[0].config.model, "github-copilot/gpt-5-mini");
  assert.equal(config.providers[0].config.command_path, "pi");
  assert.equal(config.providers[0].config.working_dir, "C:/temp/workspace");
});

test("copilot-cli scenarios generate Promptfoo custom script providers", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.id = "copilot-cli-no-skill";
  scenario.agent.adapter = "copilot-cli";
  delete scenario.agent.commandPath;
  scenario.agent.model = "gpt-5";

  const parsedScenario = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: manifest.benchmark,
    task: manifest.task,
    workspace: manifest.workspace,
    scenarios: [scenario],
  }).scenarios[0];

  const config = buildPromptfooConfig({
    manifest,
    scenario: parsedScenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.match(config.providers[0].id, /copilot-system-provider\.js$/);
  assert.equal(config.providers[0].config.model, "gpt-5");
  assert.equal(config.providers[0].config.command_path, "copilot");
  assert.equal(config.providers[0].config.working_dir, "C:/temp/workspace");
  assert.equal(config.providers[0].config.approval_policy, "never");
});

test("promptfoo config enables tracing and flattens labels", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = structuredClone(findScenario(manifest, "codex-mini-no-skill"));

  scenario.evaluation.tracing = true;
  scenario.output.labels = {
    displayName: "baseline",
    skill: "off",
  };

  const config = buildPromptfooConfig({
    manifest,
    scenario,
    workspace: {
      workspaceDirectory: "C:/temp/workspace",
      environment: {},
      gitReady: true,
    },
  });

  assert.equal(config.tracing.enabled, true);
  assert.equal(config.tests[0].metadata.label_displayName, "baseline");
  assert.match(stringifyPromptfooConfig(config), /description: smoke-skill-following:codex-mini-no-skill/);
  assert.deepEqual(flattenLabels({ a: "1", b: "2" }), {
    label_a: "1",
    label_b: "2",
  });
});

test("toPromptfooAssertion rejects unsupported assertion types", () => {
  assert.throws(
    () => toPromptfooAssertion({ type: "unsupported" }, "C:/temp/workspace"),
    /Unsupported assertion type "unsupported"\./,
  );
});
