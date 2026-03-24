import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  analyzeWorkspaceMetricDelta,
  captureWorkspaceSnapshot,
  extractMetricMapFromRustCodeAnalysis,
} from "../src/code-metrics.js";

test("extractMetricMapFromRustCodeAnalysis flattens numeric metrics", () => {
  const metrics = extractMetricMapFromRustCodeAnalysis(JSON.stringify({
    metrics: {
      loc: {
        sloc: 10,
        ploc: 7,
      },
      cyclomatic: 3,
    },
  }));

  assert.equal(metrics.get("cyclomatic"), 3);
  assert.equal(metrics.get("loc.sloc"), 10);
  assert.equal(metrics.get("loc.ploc"), 7);
});

test("analyzeWorkspaceMetricDelta reports only changed metrics from modified original files", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-code-metrics-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace");
  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "example.js"), "const value = 1;\n", "utf8");
  await fs.writeFile(path.join(workspaceDirectory, "added.js"), "const untouched = true;\n", "utf8");

  const beforeSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);

  await fs.writeFile(path.join(workspaceDirectory, "example.js"), "const value = 10;\nconst other = 20;\n", "utf8");
  await fs.rm(path.join(workspaceDirectory, "added.js"));
  await fs.writeFile(path.join(workspaceDirectory, "new-file.js"), "const brandNew = true;\n", "utf8");

  const afterSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);
  const codeMetricsDelta = await analyzeWorkspaceMetricDelta({
    beforeSnapshot,
    afterSnapshot,
    analyzeFileMetrics: async ({ fileContent }) => {
      const text = fileContent.toString("utf8");
      const lineCount = text.trim().split("\n").length;
      const digitCount = (text.match(/\d/g) ?? []).length;
      return new Map([
        ["loc.sloc", lineCount],
        ["lexical.digits", digitCount],
      ]);
    },
  });

  assert.deepEqual(codeMetricsDelta.changedOriginalFiles, ["example.js"]);
  assert.equal(codeMetricsDelta.metrics["loc.sloc"].avg, 1);
  assert.equal(codeMetricsDelta.metrics["loc.sloc"].standardDeviation, 0);
  assert.equal(codeMetricsDelta.metrics["lexical.digits"].avg, 3);
});
