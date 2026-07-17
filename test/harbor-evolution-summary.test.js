import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const pythonTest = path.resolve("test", "harbor_evolution_summary_test.py");
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

test("Harbor evolution summary rejects frozen-evidence tampering", {
  skip: !uvAvailable,
}, () => {
  const result = spawnSync("uv", ["run", "--script", pythonTest, "-v"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 6 tests/);
  assert.match(result.stderr, /OK/);
});
