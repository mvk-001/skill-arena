import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const WINDOWS_PROMPT_PLACEHOLDER = "__SKILL_ARENA_PROMPT__";

export default class PiSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "pi-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const { stdout, stderr, exitCode } = await this.spawnProcess({
      command: this.config.command_path ?? "pi",
      args,
      cwd: this.config.working_dir,
      env: this.buildEnvironment(),
      promptText: useWindowsPromptWrapper ? prompt : undefined,
      abortSignal: callOptions?.abortSignal,
    });

    if (exitCode !== 0) {
      return {
        error: stderr.trim() || stdout.trim() || `pi exited with code ${exitCode}.`,
      };
    }

    return {
      output: stdout.trim(),
      metadata: {
        backend: "command",
        stderr: stderr.trim() || null,
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = [];
    const workingDirectory = this.config.working_dir ?? process.cwd();
    const allowedSkills = Array.isArray(this.config.allowed_skills)
      ? this.config.allowed_skills
      : [];
    const shouldDisableUndeclaredSkills = this.config.disable_other_skills ?? true;

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    if (shouldDisableUndeclaredSkills) {
      args.push("--no-skills");
      for (const skill of allowedSkills) {
        const skillPath = path.resolve(workingDirectory, "skills", skill);
        args.push("--skill", skillPath);
      }
    } else if (allowedSkills.length > 0) {
      for (const skill of allowedSkills) {
        const skillPath = path.resolve(workingDirectory, "skills", skill);
        args.push("--skill", skillPath);
      }
    }

    args.push("-p", prompt);
    return args;
  }

  buildEnvironment() {
    return {
      ...process.env,
      ...this.config.cli_env,
    };
  }
}

async function spawnProcess({
  command,
  args,
  cwd,
  env,
  promptText,
  abortSignal,
}) {
  const { executable, executableArgs, cleanup } = await buildSpawnCommand(command, args, env, promptText);

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

async function buildSpawnCommand(command, args, env, promptText) {
  if (process.platform !== "win32") {
    return {
      executable: command,
      executableArgs: args,
      cleanup: async () => {},
    };
  }

  if (typeof promptText === "string") {
    return await buildWindowsPowerShellCommand(command, args, env, promptText);
  }

  return {
    executable: "cmd.exe",
    executableArgs: ["/d", "/s", "/c", resolveWindowsCommand(command), ...args],
    cleanup: async () => {},
  };
}

function resolveWindowsCommand(command) {
  return path.extname(command) ? command : `${command}.cmd`;
}

async function buildWindowsPowerShellCommand(command, args, env, promptText) {
  const promptDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "skill-arena-pi-prompt-"),
  );
  const promptPath = path.join(promptDirectory, "prompt.txt");
  await fs.writeFile(promptPath, promptText, "utf8");

  const resolvedCommandPath = resolveWindowsScriptPath(command, env);
  const script = [
    `$skillArenaPrompt = ((Get-Content -Raw ${toPowerShellLiteral(promptPath)}) -replace '\\s+', ' ').Trim()`,
    `$skillArenaArgs = @(${args.map((arg) =>
      arg === WINDOWS_PROMPT_PLACEHOLDER ? "$skillArenaPrompt" : toPowerShellLiteral(arg)
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
  }

  return command;
}

function requirePathExists(candidate) {
  return process.getBuiltinModule("node:fs").existsSync(candidate);
}

function toPowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
