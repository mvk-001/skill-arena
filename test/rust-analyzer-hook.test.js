import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromProjectRoot } from "../src/project-paths.js";

const execFileAsync = promisify(execFile);
const hookScriptPath = fromProjectRoot(
  "skills",
  "skill-arena-compare",
  "scripts",
  "run-rust-analyzer-hook.js",
);

test("rust analyzer hook skips cleanly when the binary is missing", async () => {
  const isolatedTempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-rust-hook-missing-"));
  const { stdout } = await execFileAsync(
    process.execPath,
    [hookScriptPath, "--bin", path.join(isolatedTempDirectory, "missing-rust-code-analysis-bin")],
    {
      env: {
        ...process.env,
        PATH: "",
        LOCALAPPDATA: isolatedTempDirectory,
        SKILL_ARENA_RUST_CODE_ANALYSIS_BIN: "",
      },
    },
  );

  assert.match(stdout, /Skipping Codex loop closeout hook/);
});

test("rust analyzer hook fails in strict mode when the binary is missing", async () => {
  const isolatedTempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-rust-hook-strict-"));
  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [hookScriptPath, "--strict", "--bin", path.join(isolatedTempDirectory, "missing-rust-code-analysis-bin")],
        {
          env: {
            ...process.env,
            PATH: "",
            LOCALAPPDATA: isolatedTempDirectory,
            SKILL_ARENA_RUST_CODE_ANALYSIS_BIN: "",
          },
        },
      ),
    /rust-code-analysis binary not found/i,
  );
});

test("rust analyzer hook runs the configured binary and writes output", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-rust-hook-"));
  const fakeBinaryPath = path.join(tempDirectory, "fake-rust-code-analysis.js");
  const outputDirectory = path.join(tempDirectory, "analysis-output");
  const argsCapturePath = path.join(tempDirectory, "captured-args.json");

  fs.writeFileSync(
    fakeBinaryPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const outIndex = args.indexOf("-o");
const outputDir = outIndex === -1 ? null : args[outIndex + 1];
if (!outputDir) {
  console.error("Missing -o output directory");
  process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "metrics.json"), JSON.stringify({ ok: true }), "utf8");
fs.writeFileSync(${JSON.stringify(argsCapturePath)}, JSON.stringify(args), "utf8");
`,
    "utf8",
  );

  const { stdout } = await execFileAsync(process.execPath, [
    hookScriptPath,
    "--bin",
    fakeBinaryPath,
    "--output-dir",
    outputDirectory,
    "--path",
    "src",
    "--path",
    "test",
  ]);

  const capturedArgs = JSON.parse(fs.readFileSync(argsCapturePath, "utf8"));

  assert.match(stdout, /Codex loop closeout hook completed/);
  assert.ok(fs.existsSync(path.join(outputDirectory, "metrics.json")));
  assert.deepEqual(capturedArgs.slice(0, 4), ["-m", "--pr", "-O", "json"]);
  assert.ok(capturedArgs.includes("src"));
  assert.ok(capturedArgs.includes("test"));
  assert.ok(capturedArgs.includes("*.js"));
});
