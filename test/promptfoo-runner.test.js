import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildPromptfooEvalArgs,
  resolvePromptfooCommand,
  runPromptfooEval,
} from "../src/promptfoo-runner.js";

test("buildPromptfooEvalArgs builds the shared eval command", () => {
  assert.deepEqual(buildPromptfooEvalArgs({
    promptfooConfigPath: "config.yaml",
    promptfooResultsPath: "results.json",
    requests: 3,
    maxConcurrency: 2,
    noCache: true,
  }), [
    "promptfoo", "eval", "-c", "config.yaml", "--output", "results.json",
    "--repeat", "3", "-j", "2", "--no-progress-bar", "--no-cache",
  ]);
});

test("resolvePromptfooCommand prefers the packaged Promptfoo entrypoint", async () => {
  const command = await resolvePromptfooCommand(["promptfoo", "eval", "--help"]);

  assert.equal(command.executable, process.execPath);
  assert.equal(command.executableArgs.at(-2), "eval");
  assert.equal(command.executableArgs.at(-1), "--help");
});

test("runPromptfooEval logs output and accepts Promptfoo success codes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-promptfoo-runner-"));
  const configPath = path.join(directory, "config.yaml");
  const logPath = path.join(directory, "execution.log");
  const scriptPath = path.join(directory, "fake-promptfoo.js");
  await fs.writeFile(configPath, "{}\n", "utf8");
  await fs.writeFile(
    scriptPath,
    "process.stdout.write('out'); process.stderr.write('err'); process.exit(100);\n",
    "utf8",
  );

  await runPromptfooEval({
    promptfooConfigPath: configPath,
    promptfooResultsPath: path.join(directory, "results.json"),
    requests: 1,
    maxConcurrency: 1,
    noCache: false,
    timeoutMs: 5_000,
    executionLogPath: logPath,
    verbose: false,
    commandResolver: async () => ({
      executable: process.execPath,
      executableArgs: [scriptPath],
    }),
  });

  const log = await fs.readFile(logPath, "utf8");
  assert.match(log, /out/);
  assert.match(log, /err/);
});

test("runPromptfooEval reports exit failures and timeouts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-promptfoo-errors-"));
  const configPath = path.join(directory, "config.yaml");
  const failScript = path.join(directory, "fail.js");
  const waitScript = path.join(directory, "wait.js");
  await fs.writeFile(configPath, "{}\n", "utf8");
  await fs.writeFile(failScript, "process.exit(2);\n", "utf8");
  await fs.writeFile(waitScript, "setInterval(() => {}, 1000);\n", "utf8");

  const baseOptions = {
    promptfooConfigPath: configPath,
    promptfooResultsPath: path.join(directory, "results.json"),
    requests: 1,
    maxConcurrency: 1,
    noCache: false,
    verbose: false,
  };

  await assert.rejects(
    () => runPromptfooEval({
      ...baseOptions,
      timeoutMs: 5_000,
      commandResolver: async () => ({
        executable: process.execPath,
        executableArgs: [failScript],
      }),
    }),
    /exited with code 2/,
  );
  await assert.rejects(
    () => runPromptfooEval({
      ...baseOptions,
      timeoutMs: 50,
      commandResolver: async () => ({
        executable: process.execPath,
        executableArgs: [waitScript],
      }),
    }),
    /timed out after 50 ms/,
  );
});
