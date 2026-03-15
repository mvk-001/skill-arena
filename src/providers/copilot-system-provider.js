import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const WINDOWS_PROMPT_PLACEHOLDER = "__SKILL_ARENA_PROMPT__";

export default class CopilotSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "copilot-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const appliedSettings = this.describeAppliedSettings();
    const { stdout, stderr, exitCode } = await this.spawnProcess({
      command: this.config.command_path ?? "copilot",
      args,
      cwd: this.config.working_dir,
      env: this.buildEnvironment(),
      promptText: useWindowsPromptWrapper ? prompt : undefined,
      abortSignal: callOptions?.abortSignal,
    });

    if (exitCode !== 0) {
      return {
        error:
          stderr.trim() ||
          stdout.trim() ||
          `copilot exited with code ${exitCode}.`,
        metadata: {
          backend: "command",
          commandPath: this.config.command_path ?? "copilot",
          appliedSettings,
          unsupportedSettings: describeUnsupportedSettings(this.config),
        },
      };
    }

    return {
      output: extractFinalOutput(stdout),
      metadata: {
        backend: "command",
        commandPath: this.config.command_path ?? "copilot",
        stderr: stderr.trim() || null,
        appliedSettings,
        unsupportedSettings: describeUnsupportedSettings(this.config),
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = ["-p", prompt, "--output-format", "json", "--no-color"];
    const adapterConfig = this.config.copilot_config ?? {};

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    if (adapterConfig.agent) {
      args.push("--agent", String(adapterConfig.agent));
    }

    if (this.config.approval_policy === "never") {
      args.push("--allow-all-tools");
    }

    if (
      this.config.network_access_enabled
      || this.config.web_search_enabled
      || this.config.sandbox_mode === "danger-full-access"
    ) {
      args.push("--allow-all-urls");
    }

    if (
      this.config.sandbox_mode === "danger-full-access"
      || (this.config.additional_directories?.length ?? 0) > 0
    ) {
      args.push("--allow-all-paths");
    }

    args.push("--no-ask-user");

    for (const directory of this.config.additional_directories ?? []) {
      args.push("--add-dir", path.resolve(this.config.working_dir, directory));
    }

    for (const toolName of toStringArray(adapterConfig.allowTool)) {
      args.push("--allow-tool", toolName);
    }

    for (const toolName of toStringArray(adapterConfig.denyTool)) {
      args.push("--deny-tool", toolName);
    }

    for (const urlPattern of toStringArray(adapterConfig.allowUrl)) {
      args.push("--allow", urlPattern);
    }

    for (const envVarName of toStringArray(adapterConfig.extraContext)) {
      args.push("--context", envVarName);
    }

    if (adapterConfig.share === true) {
      args.push("--share");
    }

    return args;
  }

  buildEnvironment() {
    return {
      ...process.env,
      ...this.config.cli_env,
    };
  }

  describeAppliedSettings() {
    return {
      approvalPolicy: this.config.approval_policy ?? null,
      model: this.config.model ?? null,
      networkAccessEnabled: this.config.network_access_enabled ?? null,
      sandboxMode: this.config.sandbox_mode ?? null,
      webSearchEnabled: this.config.web_search_enabled ?? null,
    };
  }
}

function extractFinalOutput(stdout) {
  const trimmedOutput = stdout.trim();

  if (!trimmedOutput) {
    return "";
  }

  const jsonLines = trimmedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

  const jsonMessage = extractMessageFromJsonLines(jsonLines);
  return jsonMessage || trimmedOutput;
}

function extractMessageFromJsonLines(events) {
  for (const event of [...events].reverse()) {
    if (event?.type === "assistant.message" && typeof event?.data?.content === "string") {
      return event.data.content.trim();
    }

    if (typeof event?.message === "string" && event.message.trim()) {
      return event.message.trim();
    }

    if (typeof event?.content === "string" && event.content.trim()) {
      return event.content.trim();
    }

    if (typeof event?.text === "string" && event.text.trim()) {
      return event.text.trim();
    }

    if (typeof event?.output === "string" && event.output.trim()) {
      return event.output.trim();
    }
  }

  return "";
}

function describeUnsupportedSettings(config) {
  const unsupported = [];

  if (config.model_reasoning_effort) {
    unsupported.push("reasoningEffort");
  }

  if (config.sandbox_mode === "read-only" || config.sandbox_mode === "workspace-write") {
    unsupported.push("sandboxMode");
  }

  if (config.web_search_enabled === false) {
    unsupported.push("webSearchEnabled");
  }

  return unsupported;
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string" && entry.length > 0);
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
    path.join(os.tmpdir(), "skill-arena-copilot-prompt-"),
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
