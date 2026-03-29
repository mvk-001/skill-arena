import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromProjectRoot } from "../src/project-paths.js";

const execFileAsync = promisify(execFile);
const binPath = fromProjectRoot("bin", "skill-arena.js");
const packageVersion = JSON.parse(fs.readFileSync(fromProjectRoot("package.json"), "utf8")).version;

function commandOutput(stdout, stderr) {
  return `${stdout}${stderr}`;
}

test("skill-arena CLI prints top-level help", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "--help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /Usage: skill-arena <command>/);
  assert.match(output, /evaluate <benchmark-config-path>/);
  assert.match(output, /gen-conf \[--output <path>\] \[--prompt <text>\] \[options\]/);
  assert.match(output, /val-conf <benchmark-config-path>/);
});

test("skill-arena CLI prints command-specific help", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "help", "evaluate"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /skill-arena evaluate <benchmark-config-path>/);
  assert.match(output, /Run one benchmark manifest or matrix evaluation config/);
});

test("skill-arena `help` prints top-level output when no subcommand is provided", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /Usage: skill-arena <command>/);
  assert.match(output, /Commands:/);
});

test("subcommand help flag is handled by the wrapper", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "evaluate", "--help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /skill-arena evaluate <benchmark-config-path>/);
  assert.match(output, /Run one benchmark manifest or matrix evaluation config/);
});

test("val-conf command shows inline help", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "val-conf", "--help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /skill-arena val-conf <benchmark-config-path>/);
  assert.match(output, /Validate a manifest or matrix evaluation config and print a normalized summary/);
});

test("val-gen is no longer a supported command", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [binPath, "val-gen"]),
    /Unknown command "val-gen"/,
  );
});

test("gen-conf command shows inline help", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "gen-conf", "--help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /skill-arena gen-conf \[--output <path>\] \[--prompt <text>\] \[options\]/);
  assert.match(output, /Generate a commented evaluation config template with TODO placeholders/);
  assert.match(output, /--skill-type <type>/);
});

test("gen-conf writes a commented compare template with requested options", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-gen-conf-"));
  const outputPath = path.join(outputDirectory, "compare.yaml");

  await execFileAsync(process.execPath, [
    binPath,
    "gen-conf",
    "--output",
    outputPath,
    "--prompt",
    "summarize file A",
    "--prompt",
    "create an evaluation script",
    "--evaluation-type",
    "javascript",
    "--evaluation-value",
    "@myscript.js",
    "--evaluation-type",
    "python",
    "--evaluation-value",
    "@myscript.py",
    "--requests",
    "3",
    "--maxConcurrency",
    "8",
    "--skill-type",
    "git",
  ]);

  const generated = fs.readFileSync(outputPath, "utf8");

  assert.match(generated, /schemaVersion: 1/);
  assert.match(generated, /prompt: "summarize file A"/);
  assert.match(generated, /prompt: "create an evaluation script"/);
  assert.match(generated, /type: "javascript"/);
  assert.match(generated, /value: "@myscript.js"/);
  assert.match(generated, /type: "python"/);
  assert.match(generated, /not part of the Skill Arena V1 supported set/);
  assert.match(generated, /repo: "TODO: replace with the real Git repository URL\."/);
  assert.match(generated, /local-path -> source\.type: local-path/);
  assert.match(generated, /system-installed -> source\.type: system-installed/);
  assert.match(generated, /requests is a positive integer/);
  assert.match(generated, /choose equals for exact output, contains\/icontains for stable substrings/);
  assert.match(generated, /sandboxMode is adapter-specific policy text/);
  assert.match(generated, /target is the destination inside the materialized run workspace/);
  assert.match(generated, /comparison:\n  profiles:/);
  assert.match(generated, /id: no-skill/);
  assert.match(generated, /capabilities:\s+\{\}/);
  assert.match(generated, /capabilities:\n        skills:/);
  assert.match(generated, /requests: 3/);
  assert.match(generated, /maxConcurrency: 8/);
});

test("gen-conf includes all supported assertion examples when none are specified", async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-gen-conf-defaults-"));
  const outputPath = path.join(outputDirectory, "compare.yaml");

  await execFileAsync(process.execPath, [binPath, "gen-conf", "--output", outputPath]);

  const generated = fs.readFileSync(outputPath, "utf8");

  assert.match(generated, /includes one example of every supported V1 assertion type/);
  assert.match(generated, /type: "equals"/);
  assert.match(generated, /type: "contains"/);
  assert.match(generated, /type: "icontains"/);
  assert.match(generated, /type: "regex"/);
  assert.match(generated, /type: "is-json"/);
  assert.match(generated, /type: "javascript"/);
  assert.match(generated, /type: "file-contains"/);
  assert.match(generated, /type: "llm-rubric"/);
  assert.match(generated, /example additional local-path source/);
  assert.match(generated, /example additional git source/);
  assert.match(generated, /example additional variant for copilot-cli/);
  assert.match(generated, /example additional variant for pi/);
});

test("evaluate command shows inline help", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, "evaluate", "--help"]);
  const output = commandOutput(stdout, stderr);

  assert.match(output, /skill-arena evaluate <benchmark-config-path>/);
  assert.match(output, /Run one benchmark manifest or matrix evaluation config/);
  assert.match(output, /--requests <n>/);
  assert.match(output, /--max-concurrency <n>/);
});

test("skill-arena CLI returns version", async () => {
  const { stdout } = await execFileAsync(process.execPath, [binPath, "--version"]);

  assert.match(stdout.trim(), new RegExp(`^skill-arena v?${packageVersion.replaceAll(".", "\\.")}$`));
});

test("unknown command returns a non-zero code", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [binPath, "not-a-command"]),
    /Unknown command "not-a-command"/,
  );
});
