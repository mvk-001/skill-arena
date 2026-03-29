import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expandCompareConfigToManifest } from "../src/compare.js";
import {
  computeScenarioReuseFingerprints,
  planScenarioReuse,
} from "../src/compare-reuse.js";

test("computeScenarioReuseFingerprints changes when a local-path skill changes", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-reuse-fingerprint-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace-base");
  const skillDirectory = path.join(tempDirectory, "skill");

  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "README.md"), "base\n", "utf8");
  await fs.writeFile(path.join(skillDirectory, "SKILL.md"), "# Skill v1\n", "utf8");

  const compareConfig = {
    schemaVersion: 1,
    benchmark: {
      id: "reuse-fingerprint-compare",
      description: "Reuse fingerprint compare",
      tags: ["compare"],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: "workspace-base",
          target: "/",
        },
      ],
      setup: {
        initializeGit: true,
        env: {},
      },
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
      timeoutMs: 1000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      profiles: [
        {
          id: "baseline",
          description: "Baseline",
          isolation: { inheritSystem: false },
          capabilities: {},
          skillMode: "disabled",
          skill: { source: { type: "none" }, install: { strategy: "none" } },
          skillSource: "none",
        },
        {
          id: "skill",
          description: "Skill",
          isolation: { inheritSystem: false },
          capabilities: {
            skills: [
              {
                source: {
                  type: "local-path",
                  path: "skill",
                },
                install: {
                  strategy: "workspace-overlay",
                },
              },
            ],
          },
          skillMode: "enabled",
          skill: {
            source: {
              type: "local-path",
              path: "skill",
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
          skillSource: "workspace-overlay",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
          },
        },
      ],
    },
  };

  const manifest = expandCompareConfigToManifest(compareConfig);
  const firstFingerprints = await computeScenarioReuseFingerprints({
    manifest,
    scenarios: manifest.scenarios,
    sourceBaseDirectory: tempDirectory,
  });

  await fs.writeFile(path.join(skillDirectory, "SKILL.md"), "# Skill v2\n", "utf8");

  const secondFingerprints = await computeScenarioReuseFingerprints({
    manifest,
    scenarios: manifest.scenarios,
    sourceBaseDirectory: tempDirectory,
  });

  assert.equal(
    firstFingerprints.get("codex-mini-baseline"),
    secondFingerprints.get("codex-mini-baseline"),
  );
  assert.notEqual(
    firstFingerprints.get("codex-mini-skill"),
    secondFingerprints.get("codex-mini-skill"),
  );
});

test("planScenarioReuse reuses only matching scenario fingerprints from the latest compare run", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-reuse-plan-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace-base");

  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "README.md"), "base\n", "utf8");

  const compareConfig = {
    schemaVersion: 1,
    benchmark: {
      id: "reuse-plan-compare",
      description: "Reuse plan compare",
      tags: ["compare"],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: "workspace-base",
          target: "/",
        },
      ],
      setup: {
        initializeGit: true,
        env: {},
      },
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
      timeoutMs: 1000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      profiles: [
        {
          id: "baseline",
          description: "Baseline",
          isolation: { inheritSystem: false },
          capabilities: {},
          skillMode: "disabled",
          skill: { source: { type: "none" }, install: { strategy: "none" } },
          skillSource: "none",
        },
        {
          id: "skill",
          description: "Skill",
          isolation: { inheritSystem: false },
          capabilities: {
            skills: [
              {
                source: {
                  type: "inline",
                  skillId: "example-skill",
                  content: "# Example skill\n",
                },
                install: {
                  strategy: "workspace-overlay",
                },
              },
            ],
          },
          skillMode: "enabled",
          skill: {
            source: {
              type: "inline",
              skillId: "example-skill",
              content: "# Example skill\n",
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
          skillSource: "workspace-overlay",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
          },
        },
      ],
    },
  };

  const manifest = expandCompareConfigToManifest(compareConfig);
  const fingerprints = await computeScenarioReuseFingerprints({
    manifest,
    scenarios: manifest.scenarios,
    sourceBaseDirectory: tempDirectory,
  });
  const previousRunDirectory = path.join(
    tempDirectory,
    "results",
    manifest.benchmark.id,
    "2026-03-29T00-00-00-000Z-compare",
  );

  await fs.mkdir(previousRunDirectory, { recursive: true });
  await fs.writeFile(
    path.join(previousRunDirectory, "summary.json"),
    JSON.stringify({
      scenarioSummaries: [
        {
          scenarioId: "codex-mini-baseline",
          reuseFingerprint: fingerprints.get("codex-mini-baseline"),
          workspaceDirectory: path.join(previousRunDirectory, "workspace", "baseline"),
          outputs: [
            {
              provider: "baseline",
              variantId: "codex-mini",
              variantDisplayName: "codex",
              promptId: "prompt-1",
              promptDescription: null,
              rowId: "codex-mini:prompt-1",
              text: "HELLO",
              success: true,
            },
          ],
        },
        {
          scenarioId: "codex-mini-skill",
          reuseFingerprint: "mismatch",
          workspaceDirectory: path.join(previousRunDirectory, "workspace", "skill"),
          outputs: [
            {
              provider: "skill",
              variantId: "codex-mini",
              variantDisplayName: "codex",
              promptId: "prompt-1",
              promptDescription: null,
              rowId: "codex-mini:prompt-1",
              text: "HELLO",
              success: true,
            },
          ],
        },
      ],
    }, null, 2),
    "utf8",
  );

  const plan = await planScenarioReuse({
    manifest,
    scenarios: manifest.scenarios,
    outputRootDirectory: tempDirectory,
    sourceBaseDirectory: tempDirectory,
    evaluationRequests: 1,
  });

  assert.equal(plan.previousRun.compareRunDirectory, previousRunDirectory);
  assert.deepEqual([...plan.reusableScenarioIds], ["codex-mini-baseline"]);
  assert.deepEqual(plan.freshScenarios.map((scenario) => scenario.id), ["codex-mini-skill"]);
});
