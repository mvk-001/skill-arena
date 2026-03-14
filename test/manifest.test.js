import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
});

test("system skill benchmarks parse without workspace overlays", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "gws-gmail-triage",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);

  assert.equal(manifest.benchmark.id, "gws-gmail-triage");
  assert.equal(manifest.workspace.skillOverlay, undefined);
  assert.equal(manifest.scenarios[0].skillSource, "system-installed");
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

test("enabled skill mode requires a skill overlay path", () => {
  const invalidManifest = {
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
      initializeGit: true,
    },
    scenarios: [
      {
        id: "skill-enabled",
        description: "Missing skill overlay",
        skillMode: "enabled",
        skillSource: "workspace-overlay",
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
  };

  const parsed = benchmarkManifestSchema.safeParse(invalidManifest);

  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0].message, /skillOverlay/);
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

test("manifest validation accepts git skill overlays", () => {
  const manifest = {
    schemaVersion: 1,
    benchmark: {
      id: "git-overlay-check",
      description: "Validation fixture",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      skillOverlay: {
        git: {
          repo: "https://github.com/example/skills.git",
          ref: "main",
          subpath: "bundles/marker-guide",
        },
      },
      initializeGit: true,
    },
    scenarios: [
      {
        id: "git-overlay-enabled",
        description: "Uses a remote skill overlay",
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
              value: "HELLO",
            },
          ],
        },
      },
    ],
  };

  const parsed = benchmarkManifestSchema.safeParse(manifest);

  assert.equal(parsed.success, true);
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
});
