import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getDefaultParallelism } from "../src/concurrency.js";
import { benchmarkManifestSchema } from "../src/manifest-schema.js";
import { loadBenchmarkManifest } from "../src/manifest.js";
import { fromProjectRoot } from "../src/project-paths.js";

test("sample manifest parses successfully", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
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
    "benchmarks",
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
      fixture: "fixtures/smoke-skill-following/base",
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
      fixture: "fixtures/smoke-skill-following/base",
      skillOverlay: "fixtures/smoke-skill-following/skill-overlay",
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
      fixture: "fixtures/smoke-skill-following/base",
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
      fixture: "fixtures/smoke-skill-following/base",
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
          path: "fixtures/smoke-skill-following/base",
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
            type: "inline-files",
            files: [
              {
                path: "AGENTS.md",
                content: "# Inline skill\n",
              },
            ],
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
  assert.equal(manifest.scenarios[0].skill.source.type, "inline-files");
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
      "  fixture: fixtures/smoke-skill-following/base",
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
