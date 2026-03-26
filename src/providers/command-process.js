import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function spawnProviderCommand({
  command,
  args,
  cwd,
  env,
  promptText,
  promptDirectoryPrefix,
  stdinText,
  abortSignal,
}) {
  const { executable, executableArgs, cleanup } = await buildSpawnCommand({
    command,
    args,
    env,
    promptText,
    promptDirectoryPrefix,
  });

  return await new Promise((resolve, reject) => {
    const childProcess = spawn(executable, executableArgs, {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    childProcess.on("error", (error) => {
      cleanupAbortListener();
      void cleanup();
      reject(error);
    });

    childProcess.on("exit", (exitCode) => {
      cleanupAbortListener();
      void cleanup();
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    if (typeof stdinText === "string") {
      childProcess.stdin.write(stdinText);
    }
    childProcess.stdin.end();

    const abortHandler = () => {
      childProcess.kill("SIGTERM");
    };

    const cleanupAbortListener = () => {
      abortSignal?.removeEventListener("abort", abortHandler);
    };

    abortSignal?.addEventListener("abort", abortHandler, { once: true });
  });
}

async function buildSpawnCommand({
  command,
  args,
  env,
  promptText,
  promptDirectoryPrefix,
}) {
  if (process.platform !== "win32") {
    return {
      executable: command,
      executableArgs: args.map((arg) => typeof arg === "object" ? arg.value : arg),
      cleanup: async () => {},
    };
  }

  if (typeof promptText === "string") {
    return await buildWindowsPowerShellCommand({
      command,
      args,
      env,
      promptText,
      promptDirectoryPrefix,
    });
  }

  return {
    executable: "cmd.exe",
    executableArgs: ["/d", "/s", "/c", resolveWindowsCommand(command), ...args.map((arg) => typeof arg === "object" ? arg.value : arg)],
    cleanup: async () => {},
  };
}

function resolveWindowsCommand(command) {
  return path.extname(command) ? command : `${command}.cmd`;
}

async function buildWindowsPowerShellCommand({
  command,
  args,
  env,
  promptText,
  promptDirectoryPrefix,
}) {
  const promptDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), promptDirectoryPrefix),
  );
  const promptPath = path.join(promptDirectory, "prompt.txt");
  await fs.writeFile(promptPath, promptText, "utf8");

  const resolvedCommandPath = resolveWindowsScriptPath(command, env);
  const script = [
    `$skillArenaPrompt = ((Get-Content -Raw ${toPowerShellLiteral(promptPath)}) -replace '\\s+', ' ').Trim()`,
    `$skillArenaArgs = @(${args.map((arg) =>
      arg.promptPlaceholder ? "$skillArenaPrompt" : toPowerShellLiteral(arg.value)
    ).join(", ")})`,
    `& ${toPowerShellLiteral(resolvedCommandPath)} @skillArenaArgs`,
  ].join("; ");

  return {
    executable: "powershell.exe",
    executableArgs: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    cleanup: async () => {
      await fs.rm(promptDirectory, { recursive: true, force: true });
    },
  };
}

function resolveWindowsScriptPath(command, env) {
  if (path.isAbsolute(command) || path.extname(command)) {
    return command;
  }

  const pathValue = env.Path ?? env.PATH ?? process.env.Path ?? process.env.PATH ?? "";
  const searchDirectories = pathValue.split(path.delimiter).filter(Boolean);

  for (const extension of [".ps1", ".cmd", ".exe", ""]) {
    const resolvedPath = findCommandPath(searchDirectories, command, extension);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return command;
}

function findCommandPath(searchDirectories, command, extension) {
  for (const directory of searchDirectories) {
    const candidate = path.join(directory, `${command}${extension}`);
    try {
      if (candidate && requirePathExists(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function requirePathExists(candidate) {
  return process.getBuiltinModule("node:fs").existsSync(candidate);
}

function toPowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function withPromptPlaceholder(args, promptPlaceholder) {
  return args.map((value) => ({
    value,
    promptPlaceholder: value === promptPlaceholder,
  }));
}
