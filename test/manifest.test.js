import test from "node:test";
import assert from "node:assert/strict";

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
