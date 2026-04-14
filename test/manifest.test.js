import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getDefaultParallelism } from "../src/concurrency.js";
import { benchmarkManifestSchema } from "../src/manifest-schema.js";
import { findScenario, loadBenchmarkManifest, resolveManifestPath } from "../src/manifest.js";
import { fromProjectRoot } from "../src/project-paths.js";

test("sample manifest parses successfully", async () => {
  const manifestPath = fromProjectRoot(
    "evaluations",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);

  assert.equal(manifest.benchmark.id, "smoke-skill-following");
  assert.equal(manifest.scenarios.length, 2);
  assert.equal(manifest.workspace.sources.length, 1);
  assert.equal(manifest.workspace.sources[0].type, "local-path");
});

test("system skill benchmarks normalize without workspace overlays", async () => {
  const manifestPath = fromProjectRoot(
    "evaluations",
    "gws-gmail-triage",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);

  assert.equal(manifest.benchmark.id, "gws-gmail-triage");
  assert.equal(manifest.scenarios[0].skillSource, "system-installed");
  assert.equal(manifest.scenarios[0].skill.source.type, "system-installed");
  assert.equal(manifest.scenarios[0].agent.executionMethod, "command");
});

test("manifest validation rejects unsupported adapter ids", async () => {
  const invalidManifest = {
    schemaVersion: 1,
    benchmark: {
      id: "adapter-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Hello",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "bad-adapter",
        description: "Invalid adapter",
        skillMode: "disabled",
        agent: {
          adapter: "unknown",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "Hello",
            },
          ],
        },
      },
    ],
  };

  assert.throws(() => benchmarkManifestSchema.parse(invalidManifest));
});

test("manifest validation accepts gemini-cli with command execution", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "gemini-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Hello",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "gemini",
        description: "Gemini adapter",
        skillMode: "disabled",
        agent: {
          adapter: "gemini-cli",
          executionMethod: "command",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "Hello",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].agent.commandPath, "gemini");
});

test("enabled skill mode defaults to workspace overlay when legacy skillOverlay exists", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "overlay-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Hello",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      skillOverlay: "evaluations/smoke-skill-following/fixtures/workspaces/skill-overlay",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "skill-enabled",
        description: "Legacy overlay default",
        skillMode: "enabled",
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "Hello",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].skillSource, "workspace-overlay");
  assert.equal(manifest.scenarios[0].skill.install.strategy, "workspace-overlay");
});

test("manifest validation accepts llm-rubric assertions", () => {
  const manifest = {
    schemaVersion: 1,
    benchmark: {
      id: "judge-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Summarize the repository state.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "judge-enabled",
        description: "Uses an LLM judge",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "llm-rubric",
              value: "Score the answer against the expected response `ALPHA-42`.",
              threshold: 0.8,
              provider: "openai:gpt-5-mini",
              metric: "quality",
            },
          ],
        },
      },
    ],
  };

  const parsed = benchmarkManifestSchema.safeParse(manifest);

  assert.equal(parsed.success, true);
});

test("manifest evaluation leaves maxConcurrency unset so runtime can use local parallelism", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "auto-concurrency-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "auto-concurrency",
        description: "Uses runtime concurrency defaults",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].evaluation.maxConcurrency, undefined);
  assert.ok(getDefaultParallelism() >= 1);
});

test("manifest validation accepts declarative workspace sources and explicit skill", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "declarative-check",
      description: "Declarative workspace fixture",
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
          path: "evaluations/smoke-skill-following/fixtures/workspaces/base",
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {
          SAMPLE_FLAG: "1",
        },
      },
    },
    scenarios: [
      {
        id: "declarative-skill",
        description: "Uses explicit skill config",
        skillMode: "enabled",
        skill: {
          source: {
            type: "inline",
            skillId: "inline-skill",
            content: "# Inline skill\n",
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.task.prompts[0].id, "prompt-1");
  assert.equal(manifest.workspace.setup.env.SAMPLE_FLAG, "1");
  assert.equal(manifest.scenarios[0].skill.source.type, "inline");
});

test("manifest validation accepts git skills that select a skill folder inside the repo", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "git-skill-selection",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "git-selected-skill",
        description: "Selects one skill from a repo",
        skillMode: "enabled",
        skill: {
          source: {
            type: "git",
            repo: "./skill-overlay-repo",
            ref: "main",
            subpath: ".",
            skillPath: "skills/example-skill",
            skillId: "example-skill",
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].skill.source.type, "git");
  assert.equal(manifest.scenarios[0].skill.source.skillPath, "skills/example-skill");
  assert.equal(manifest.scenarios[0].skill.source.skillId, "example-skill");
});

test("yaml manifests load successfully", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-manifest-"));
  const manifestPath = path.join(tempDirectory, "manifest.yaml");

  await fs.writeFile(
    manifestPath,
    [
      "schemaVersion: 1",
      "benchmark:",
      "  id: yaml-check",
      "  description: YAML manifest fixture",
      "  tags:",
      "    - yaml",
      "task:",
      "  prompt: Return HELLO.",
      "workspace:",
      "  fixture: evaluations/smoke-skill-following/fixtures/workspaces/base",
      "  initializeGit: true",
      "scenarios:",
      "  - id: yaml-scenario",
      "    description: YAML scenario",
      "    skillMode: disabled",
      "    agent:",
      "      adapter: codex",
      "      executionMethod: command",
      "      commandPath: codex",
      "    evaluation:",
      "      assertions:",
      "        - type: equals",
      "          value: HELLO",
    ].join("\n"),
    "utf8",
  );

  const { manifest } = await loadBenchmarkManifest(manifestPath);

  assert.equal(manifest.benchmark.id, "yaml-check");
  assert.equal(manifest.scenarios[0].id, "yaml-scenario");
  assert.equal(manifest.task.prompts[0].id, "default");
});

test("manifest loader reports invalid JSON and YAML parse errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-manifest-errors-"));
  const invalidJsonPath = path.join(tempDirectory, "manifest.json");
  const invalidYamlPath = path.join(tempDirectory, "manifest.yaml");

  await fs.writeFile(invalidJsonPath, "{ invalid json", "utf8");
  await fs.writeFile(invalidYamlPath, "schemaVersion: [", "utf8");

  await assert.rejects(
    () => loadBenchmarkManifest(invalidJsonPath),
    /Expected valid JSON/,
  );
  await assert.rejects(
    () => loadBenchmarkManifest(invalidYamlPath),
    /Expected valid YAML/,
  );
});

test("manifest loader formats schema validation errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-manifest-zod-"));
  const manifestPath = path.join(tempDirectory, "manifest.json");

  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      benchmark: {
        id: "invalid-manifest",
        description: "Invalid manifest",
        tags: [],
      },
      task: {
        prompt: "Return HELLO.",
      },
      workspace: {
        fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
        initializeGit: true,
      },
      scenarios: [],
    }),
    "utf8",
  );

  await assert.rejects(
    () => loadBenchmarkManifest(manifestPath),
    /scenarios:/,
  );
});

test("resolveManifestPath preserves absolute paths and resolves repository-relative paths", () => {
  const absolutePath = "C:\\temp\\manifest.json";
  assert.equal(resolveManifestPath(absolutePath), absolutePath);
  assert.match(resolveManifestPath("evaluations/smoke-skill-following/manifest.json"), /evaluations[\\/]smoke-skill-following[\\/]manifest\.json$/);
});

test("findScenario returns a scenario and rejects unknown ids", async () => {
  const manifestPath = fromProjectRoot(
    "evaluations",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);

  assert.equal(findScenario(manifest, "codex-mini-no-skill").id, "codex-mini-no-skill");
  assert.throws(
    () => findScenario(manifest, "missing-scenario"),
    /Scenario "missing-scenario" was not found in benchmark "smoke-skill-following"\./,
  );
});

test("copilot-cli defaults commandPath to copilot", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "copilot-default-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "copilot-default",
        description: "Uses copilot defaults",
        skillMode: "disabled",
        agent: {
          adapter: "copilot-cli",
          executionMethod: "command",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].agent.commandPath, "copilot");
});

test("copilot-cli rejects sdk execution", () => {
  assert.throws(() => benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "copilot-sdk-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "copilot-sdk",
        description: "Invalid copilot execution method",
        skillMode: "disabled",
        agent: {
          adapter: "copilot-cli",
          executionMethod: "sdk",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  }));
});

test("opencode rejects sdk execution", () => {
  assert.throws(() => benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "opencode-sdk-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "opencode-sdk",
        description: "Invalid opencode execution method",
        skillMode: "disabled",
        agent: {
          adapter: "opencode",
          executionMethod: "sdk",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  }));
});

test("claude-code defaults commandPath to claude", () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "claude-default-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "claude-default",
        description: "Uses claude defaults",
        skillMode: "disabled",
        agent: {
          adapter: "claude-code",
          executionMethod: "command",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  assert.equal(manifest.scenarios[0].agent.commandPath, "claude");
});

test("claude-code rejects sdk execution", () => {
  assert.throws(() => benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "claude-sdk-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "claude-sdk",
        description: "Invalid claude execution method",
        skillMode: "disabled",
        agent: {
          adapter: "claude-code",
          executionMethod: "sdk",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  }));
});

test("manifest validation rejects duplicate scenario ids and invalid normalized skill states", () => {
  assert.throws(() => benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "duplicate-scenarios",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "repeat",
        description: "First",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
      {
        id: "repeat",
        description: "Second",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  }), (error) => {
    assert.equal(error.message.includes("Duplicate scenario id"), true);
    return true;
  });

  assert.throws(() => benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "invalid-enabled-skill",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "evaluations/smoke-skill-following/fixtures/workspaces/base",
      initializeGit: true,
    },
    scenarios: [
      {
        id: "bad-enabled",
        description: "Bad enabled scenario",
        skillMode: "enabled",
        skill: {
          source: {
            type: "none",
          },
          install: {
            strategy: "none",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  }), /Enabled scenarios must resolve to a concrete skill source\./);
});
