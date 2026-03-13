import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizePromptfooResults } from "../src/results.js";

test("normalizePromptfooResults extracts stable summary fields", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-results-"));
  const promptfooResultsPath = path.join(tempDirectory, "promptfoo-results.json");

  await fs.writeFile(
    promptfooResultsPath,
    JSON.stringify({
      evalId: "eval-123",
      results: {
        stats: {
          successes: 1,
          failures: 0,
        },
        results: [
          {
            provider: {
              id: "openai:codex-sdk",
            },
            prompt: {
              raw: "Example prompt",
            },
            response: {
              output: "ALPHA-42",
            },
            success: true,
            score: 1,
            latencyMs: 42,
            cost: 0.001,
            gradingResult: {
              tokensUsed: {
                total: 12,
              },
            },
          },
        ],
      },
      metadata: {
        promptfooVersion: "0.121.2",
      },
    }),
    "utf8",
  );

  const summary = await normalizePromptfooResults({
    manifest: {
      benchmark: {
        id: "smoke-skill-following",
      },
    },
    scenario: {
      id: "codex-mini-no-skill",
      skillMode: "disabled",
      agent: {
        adapter: "codex",
        model: "gpt-5.1-codex-mini",
      },
    },
    workspace: {
      runId: "run-id",
      workspaceDirectory: "C:/temp/workspace",
    },
    promptfooResultsPath,
  });

  assert.equal(summary.benchmarkId, "smoke-skill-following");
  assert.equal(summary.evalId, "eval-123");
  assert.equal(summary.outputs[0].text, "ALPHA-42");
  assert.equal(summary.outputs[0].provider, "openai:codex-sdk");
  assert.equal(summary.stats.successes, 1);
});
