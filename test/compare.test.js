import test from "node:test";
import assert from "node:assert/strict";

import { expandCompareConfigToManifest, loadCompareConfig } from "../src/compare.js";
import { compareConfigSchema } from "../src/compare-schema.js";
import { fromProjectRoot } from "../src/project-paths.js";

test("compare config expands into adapter x skill-mode scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "gws-gmail-triage",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "gws-gmail-triage-compare");
  assert.equal(manifest.scenarios.length, 4);
  assert.equal(manifest.scenarios[0].id, "codex-worst-no-skill");
  assert.equal(manifest.scenarios[1].id, "codex-worst-skill");
  assert.equal(manifest.scenarios[0].skillSource, "none");
  assert.equal(manifest.scenarios[1].skillSource, "system-installed");
  assert.equal(compareConfig.evaluation.requests, 10);
});

test("compare config defaults enabled skill source to workspace overlay when configured", () => {
  const compareConfig = {
    schemaVersion: 1,
    benchmark: {
      id: "compare-workspace-overlay",
      description: "Compare workspace overlay scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      skillOverlay: "fixtures/smoke-skill-following/skill-overlay",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 1,
      timeoutMs: 120000,
      tracing: false,
      maxConcurrency: 1,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "with-skill",
          description: "Workspace overlay enabled.",
          skillMode: "enabled",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  };

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.scenarios.length, 1);
  assert.equal(manifest.scenarios[0].skillSource, "workspace-overlay");
});

test("compare config evaluation leaves maxConcurrency unset so runtime can auto-resolve it", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-auto-concurrency",
      description: "Compare auto concurrency scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 2,
      timeoutMs: 120000,
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
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  });

  assert.equal(compareConfig.evaluation.maxConcurrency, undefined);
});

test("smoke compare config expands into codex and pi skill-mode scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "smoke-skill-following-compare");
  assert.ok("prompts" in manifest.task);
  assert.equal(manifest.task.prompts.length, 2);
  assert.equal(compareConfig.evaluation.requests, 10);
  assert.equal(manifest.scenarios.length, 4);
  assert.equal(manifest.scenarios[0].id, "codex-mini-no-skill");
  assert.equal(manifest.scenarios[1].id, "codex-mini-skill");
  assert.equal(manifest.scenarios[2].id, "pi-gpt5mini-no-skill");
  assert.equal(manifest.scenarios[3].id, "pi-gpt5mini-skill");
  assert.equal(manifest.scenarios[3].agent.model, "github-copilot/gpt-5-mini");
  assert.equal(manifest.scenarios[3].skillSource, "workspace-overlay");
});
