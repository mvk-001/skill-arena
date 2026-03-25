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

test("extractMetricMapFromRustCodeAnalysis handles arrays, empty, invalid, and no metrics", () => {
  // array form
  const arrayResult = extractMetricMapFromRustCodeAnalysis(JSON.stringify([{
    metrics: { cyclomatic: 5 },
  }]));
  assert.equal(arrayResult.get("cyclomatic"), 5);

  // empty string
  const emptyResult = extractMetricMapFromRustCodeAnalysis("");
  assert.equal(emptyResult.size, 0);

  // null/undefined
  const nullResult = extractMetricMapFromRustCodeAnalysis(null);
  assert.equal(nullResult.size, 0);

  // invalid JSON
  const invalidResult = extractMetricMapFromRustCodeAnalysis("{bad json");
  assert.equal(invalidResult.size, 0);

  // no metrics key
  const noMetrics = extractMetricMapFromRustCodeAnalysis(JSON.stringify({ other: 1 }));
  assert.equal(noMetrics.size, 0);

  // skips non-numeric non-object values
  const mixed = extractMetricMapFromRustCodeAnalysis(JSON.stringify({
    metrics: {
      good: 10,
      badString: "text",
      badArray: [1, 2, 3],
      nested: { deep: 5 },
    },
  }));
  assert.equal(mixed.get("good"), 10);
  assert.equal(mixed.get("nested.deep"), 5);
  assert.equal(mixed.has("badString"), false);
  assert.equal(mixed.has("badArray"), false);
});

test("captureWorkspaceSnapshot ignores .git directories", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-snapshot-git-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace");
  const gitDirectory = path.join(workspaceDirectory, ".git");
  await fs.mkdir(gitDirectory, { recursive: true });
  await fs.writeFile(path.join(gitDirectory, "HEAD"), "ref: refs/heads/main\n", "utf8");
  await fs.writeFile(path.join(workspaceDirectory, "visible.js"), "const x = 1;\n", "utf8");

  const snapshot = await captureWorkspaceSnapshot(workspaceDirectory);
  assert.equal(snapshot.has("visible.js"), true);
  assert.equal(snapshot.has(".git/HEAD"), false);
});

test("analyzeWorkspaceMetricDelta returns null when no files changed", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-no-change-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace");
  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "stable.js"), "const x = 1;\n", "utf8");

  const beforeSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);
  const afterSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);

  const result = await analyzeWorkspaceMetricDelta({
    beforeSnapshot,
    afterSnapshot,
    analyzeFileMetrics: async () => new Map([["loc.sloc", 1]]),
  });

  assert.equal(result, null);
});

test("analyzeWorkspaceMetricDelta returns null when metrics show no deltas", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-no-delta-"));
  const workspaceDirectory = path.join(tempDirectory, "workspace");
  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "file.js"), "const x = 1;\n", "utf8");

  const beforeSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);
  await fs.writeFile(path.join(workspaceDirectory, "file.js"), "const x = 2;\n", "utf8");
  const afterSnapshot = await captureWorkspaceSnapshot(workspaceDirectory);

  const result = await analyzeWorkspaceMetricDelta({
    beforeSnapshot,
    afterSnapshot,
    analyzeFileMetrics: async () => new Map([["loc.sloc", 1]]),
  });

  assert.equal(result, null);
});

test("summarizeSamples handles empty and valid arrays", async () => {
  const { summarizeSamples } = await import("../src/code-metrics.js");

  const empty = summarizeSamples([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.avg, null);

  const single = summarizeSamples([10]);
  assert.equal(single.count, 1);
  assert.equal(single.avg, 10);
  assert.equal(single.standardDeviation, 0);

  const multi = summarizeSamples([2, 4, 6]);
  assert.equal(multi.count, 3);
  assert.equal(multi.avg, 4);
  assert.ok(multi.standardDeviation > 0);
});
