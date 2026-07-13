import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { fromPackageRoot } from "./project-paths.js";

export function buildPromptfooEvalArgs({
  promptfooConfigPath,
  promptfooResultsPath,
  requests,
  maxConcurrency,
  noCache,
}) {
  const args = [
    "promptfoo", "eval",
    "-c", promptfooConfigPath,
    "--output", promptfooResultsPath,
    "--repeat", String(requests),
    "-j", String(maxConcurrency),
    "--no-progress-bar",
  ];

  if (noCache) {
    args.push("--no-cache");
  }

  return args;
}

export async function resolvePromptfooCommand(args) {
  const promptfooEntrypoint = fromPackageRoot(
    "node_modules", "promptfoo", "dist", "src", "entrypoint.js",
  );

  try {
    await fs.access(promptfooEntrypoint);
    return {
      executable: process.execPath,
      executableArgs: [promptfooEntrypoint, ...args.slice(1)],
    };
  } catch {
    if (process.platform !== "win32") {
      return { executable: "npx", executableArgs: args };
    }

    return {
      executable: "cmd.exe",
      executableArgs: ["/d", "/s", "/c", "npx.cmd", ...args],
    };
  }
}

export async function runPromptfooEval({
  promptfooConfigPath,
  promptfooResultsPath,
  requests,
  maxConcurrency,
  noCache,
  timeoutMs,
  executionLogPath = null,
  verbose = true,
  commandResolver = resolvePromptfooCommand,
}) {
  const args = buildPromptfooEvalArgs({
    promptfooConfigPath,
    promptfooResultsPath,
    requests,
    maxConcurrency,
    noCache,
  });
  const { executable, executableArgs } = await commandResolver(args);

  await new Promise((resolve, reject) => {
    let timedOut = false;
    let spawnError = null;
    const pendingLogWrites = [];
    const childProcess = spawn(executable, executableArgs, {
      cwd: path.dirname(promptfooConfigPath),
      env: {
        ...process.env,
        PROMPTFOO_DISABLE_TELEMETRY: "1",
        PROMPTFOO_DISABLE_UPDATE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      childProcess.kill("SIGTERM");
    }, timeoutMs);

    attachExecutionStream({
      stream: childProcess.stdout,
      executionLogPath,
      verbose,
      outputWriter: process.stdout,
      pendingLogWrites,
    });
    attachExecutionStream({
      stream: childProcess.stderr,
      executionLogPath,
      verbose,
      outputWriter: process.stderr,
      pendingLogWrites,
    });

    childProcess.on("error", (error) => {
      spawnError = error;
    });

    childProcess.on("close", async (code, signal) => {
      clearTimeout(killTimer);

      try {
        await Promise.all(pendingLogWrites);
      } catch (error) {
        reject(error);
        return;
      }

      if (spawnError) {
        reject(spawnError);
        return;
      }

      if (code === 0 || code === 100) {
        resolve();
        return;
      }

      reject(buildPromptfooExitError({ code, signal, timedOut, timeoutMs }));
    });
  });
}

function attachExecutionStream({
  stream,
  executionLogPath,
  verbose,
  outputWriter,
  pendingLogWrites,
}) {
  stream.on("data", (chunk) => {
    if (executionLogPath) {
      pendingLogWrites.push(fs.appendFile(executionLogPath, chunk));
    }
    if (verbose) {
      outputWriter.write(chunk);
    }
  });
}

function buildPromptfooExitError({ code, signal, timedOut, timeoutMs }) {
  if (timedOut) {
    return new Error(
      `promptfoo eval timed out after ${timeoutMs} ms and was terminated with signal ${signal ?? "unknown"}.`,
    );
  }

  if (signal) {
    return new Error(`promptfoo eval was terminated with signal ${signal}.`);
  }

  return new Error(`promptfoo eval exited with code ${code}.`);
}
