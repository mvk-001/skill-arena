import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  findWorkspaceRoot,
  fromPackageRoot,
  fromProjectRoot,
  resolveFromBaseDirectory,
} from "../src/project-paths.js";

test("project path helpers join package and project roots", () => {
  assert.match(fromProjectRoot("src", "compare.js"), /src[\\/]compare\.js$/);
  assert.match(fromPackageRoot("bin", "skill-arena.js"), /bin[\\/]skill-arena\.js$/);
});

test("resolveFromBaseDirectory preserves absolute paths and resolves relative paths", () => {
  const absolutePath = "C:\\temp\\compare.yaml";

  assert.equal(resolveFromBaseDirectory("C:\\workspace", absolutePath), absolutePath);
  assert.equal(
    resolveFromBaseDirectory("C:\\workspace", ".\\fixtures\\repo-summary\\base"),
    path.resolve("C:\\workspace", ".\\fixtures\\repo-summary\\base"),
  );
});

test("findWorkspaceRoot detects a parent package.json and falls back when none exists", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-project-paths-"));
  const workspaceRoot = path.join(tempDirectory, "repo-root");
  const nestedDirectory = path.join(workspaceRoot, "nested", "deeper");
  const fallbackDirectory = path.join(tempDirectory, "no-root", "inner");

  await fs.mkdir(nestedDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "package.json"), "{}", "utf8");
  await fs.mkdir(fallbackDirectory, { recursive: true });

  assert.equal(findWorkspaceRoot(nestedDirectory), workspaceRoot);
  assert.equal(findWorkspaceRoot(fallbackDirectory), path.resolve(fallbackDirectory));
});
