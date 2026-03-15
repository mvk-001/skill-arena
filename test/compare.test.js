import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  assert.equal(manifest.scenarios[1].skill.source.type, "system-installed");
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

  const manifest = expandCompareConfigToManifest(compareConfigSchema.parse(compareConfig));

  assert.equal(manifest.scenarios.length, 1);
  assert.equal(manifest.scenarios[0].skillSource, "workspace-overlay");
  assert.equal(manifest.scenarios[0].skill.install.strategy, "workspace-overlay");
});

test("compare config supports explicit declarative skill definitions", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-explicit-skill",
      description: "Compare explicit skill scenarios.",
      tags: [],
    },
    task: {
      prompts: [
        {
          prompt: "Return HELLO.",
        },
      ],
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: "fixtures/smoke-skill-following/base",
          target: "/",
        },
      ],
      setup: {
        initializeGit: true,
        env: {},
      },
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
          id: "skill",
          description: "Inline skill",
          skillMode: "enabled",
          skill: {
            source: {
              type: "inline-files",
              files: [
                {
                  path: "AGENTS.md",
                  content: "# Inline compare skill\n",
                },
              ],
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
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

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(compareConfig.task.prompts[0].id, "prompt-1");
  assert.equal(manifest.scenarios[0].skill.source.type, "inline-files");
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

test("compare config defaults requests to 10 when omitted", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-default-requests",
      description: "Compare request default scenarios.",
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

  assert.equal(compareConfig.evaluation.requests, 10);
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

test("compare config accepts copilot-cli variants", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "copilot-compare",
      description: "Compare copilot scenarios.",
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
      requests: 1,
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
          id: "copilot-gpt5",
          description: "Copilot GPT-5",
          agent: {
            adapter: "copilot-cli",
            executionMethod: "command",
            model: "gpt-5",
          },
        },
      ],
    },
  });

  const manifest = expandCompareConfigToManifest(compareConfig);
  assert.equal(manifest.scenarios[0].agent.adapter, "copilot-cli");
  assert.equal(manifest.scenarios[0].agent.commandPath, "copilot");
});

test("copilot smoke compare config expands into skill and no-skill scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "copilot-cli-smoke-compare",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "copilot-cli-smoke-compare");
  assert.equal(compareConfig.evaluation.requests, 2);
  assert.equal(manifest.scenarios.length, 2);
  assert.equal(manifest.scenarios[0].id, "copilot-gpt5mini-no-skill");
  assert.equal(manifest.scenarios[1].id, "copilot-gpt5mini-skill");
  assert.equal(manifest.scenarios[0].agent.adapter, "copilot-cli");
  assert.equal(manifest.scenarios[0].agent.commandPath, "copilot");
  assert.equal(manifest.scenarios[1].skillSource, "workspace-overlay");
});

test("compare config loader reports invalid JSON and YAML parse errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-errors-"));
  const invalidJsonPath = path.join(tempDirectory, "compare.json");
  const invalidYamlPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(invalidJsonPath, "{ invalid json", "utf8");
  await fs.writeFile(invalidYamlPath, "schemaVersion: [", "utf8");

  await assert.rejects(
    () => loadCompareConfig(invalidJsonPath),
    /Expected valid JSON/,
  );
  await assert.rejects(
    () => loadCompareConfig(invalidYamlPath),
    /Expected valid YAML/,
  );
});

test("compare config loader formats schema validation errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-zod-"));
  const compareConfigPath = path.join(tempDirectory, "compare.json");

  await fs.writeFile(
    compareConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      benchmark: {
        id: "invalid-compare",
        description: "Invalid compare",
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
        assertions: [{ type: "equals", value: "HELLO" }],
      },
      comparison: {
        skillModes: [],
        variants: [],
      },
    }),
    "utf8",
  );

  await assert.rejects(
    () => loadCompareConfig(compareConfigPath),
    /comparison\./,
  );
});

test("compare config validation rejects duplicate ids and invalid normalized skill states", () => {
  assert.throws(() => compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "duplicate-compare",
      description: "Duplicate compare config",
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
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "same",
          description: "First",
          skillMode: "disabled",
        },
        {
          id: "same",
          description: "Second",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "variant",
          description: "Variant",
          agent: { adapter: "codex" },
        },
        {
          id: "variant",
          description: "Duplicate variant",
          agent: { adapter: "codex" },
        },
      ],
    },
  }), (error) => {
    assert.equal(error.message.includes("Duplicate comparison variant id"), true);
    assert.equal(error.message.includes("Duplicate comparison skill mode id"), true);
    return true;
  });

  assert.throws(() => compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-invalid-enabled",
      description: "Invalid compare enabled skill",
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
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "skill",
          description: "Enabled without concrete skill",
          skillMode: "enabled",
          skill: {
            source: {
              type: "none",
            },
            install: {
              strategy: "none",
            },
          },
        },
      ],
      variants: [
        {
          id: "variant",
          description: "Variant",
          agent: { adapter: "codex" },
        },
      ],
    },
  }), /Enabled skill variants must resolve to a concrete skill source\./);

});

test("compare expansion uses adapter and variant display labels for report labels", () => {
  const manifest = expandCompareConfigToManifest(compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-labels",
      description: "Compare labels",
      tags: ["compare"],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
          output: {
            labels: {
              skillLabel: "off",
            },
          },
        },
      ],
      variants: [
        {
          id: "variant-a",
          description: "Variant A",
          agent: {
            adapter: "codex",
          },
          output: {
            labels: {
              adapterDisplayName: "Codex Mini",
              variantDisplayName: "Mini Variant",
            },
          },
        },
        {
          id: "variant-b",
          description: "Variant B",
          agent: {
            adapter: "pi",
          },
        },
      ],
    },
  }));

  assert.equal(manifest.scenarios[0].output.labels.reportDisplayName, "Codex Mini:no-skill");
  assert.equal(manifest.scenarios[0].output.labels.variantDisplayName, "Mini Variant");
  assert.equal(manifest.scenarios[0].output.labels.skillLabel, "off");
  assert.equal(manifest.scenarios[1].output.labels.reportDisplayName, "pi:no-skill");
});
