import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { Codex } from "@openai/codex-sdk";

export default class CodexSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "codex-system-provider";
  }

  async callApi(prompt, context, callOptions) {
    if (this.config.execution_method === "sdk") {
      return this.runWithSdk(prompt, callOptions);
    }

    if (this.config.execution_method === "command" || !this.config.execution_method) {
      return this.runWithCommand(prompt, callOptions);
    }

    throw new Error(
      `Unsupported Codex execution method "${this.config.execution_method}".`,
    );
  }

  async runWithSdk(prompt, callOptions) {
    const codex = new Codex({
      codexPathOverride: this.config.command_path,
      env: this.buildEnvironment(),
      config: this.config.codex_config,
    });

    const thread = codex.startThread({
      model: this.config.model,
      sandboxMode: this.config.sandbox_mode,
      workingDirectory: this.config.working_dir,
      skipGitRepoCheck: this.config.skip_git_repo_check,
      modelReasoningEffort: this.config.model_reasoning_effort,
      networkAccessEnabled: this.config.network_access_enabled,
      webSearchEnabled: this.config.web_search_enabled,
      approvalPolicy: this.config.approval_policy,
      additionalDirectories: this.config.additional_directories,
    });

    const turn = await thread.run(prompt, {
      signal: callOptions?.abortSignal,
    });

    return {
      output: turn.finalResponse ?? "",
      tokenUsage: normalizeSdkUsage(turn.usage),
      metadata: {
        backend: "sdk",
        itemCount: turn.items.length,
        threadId: thread.id,
      },
    };
  }

  async runWithCommand(prompt, callOptions) {
    this.assertCommandConfiguration();

    const outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "skill-arena-codex-command-"),
    );
    const outputFile = path.join(outputDirectory, "final-response.txt");

    const args = this.buildCommandArguments(outputFile);
    const { stdout, stderr, exitCode } = await spawnProcess({
      command: this.config.command_path,
      args,
      cwd: this.config.working_dir,
      env: this.buildEnvironment(),
      stdinText: prompt,
      abortSignal: callOptions?.abortSignal,
    });

    let finalResponse = await fs
      .readFile(outputFile, "utf8")
      .catch(() => "");

    const events = parseJsonLines(stdout);

    if (!finalResponse.trim()) {
      finalResponse = extractFinalAgentMessage(events);
    }

    if (exitCode !== 0) {
      return {
        error:
          stderr.trim() ||
          stdout.trim() ||
          `codex exec exited with code ${exitCode}.`,
      };
    }

    const usage = extractCommandUsage(events);

    return {
      output: finalResponse,
      tokenUsage: usage,
      metadata: {
        backend: "command",
        eventCount: events.length,
        stderr: stderr.trim() || null,
      },
    };
  }

  buildCommandArguments(outputFile) {
    const args = [
      "exec",
      "--json",
      "--color",
      "never",
      "--output-last-message",
      outputFile,
      "--cd",
      this.config.working_dir,
      "--sandbox",
      this.config.sandbox_mode,
      "--ephemeral",
    ];

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    if (this.config.skip_git_repo_check) {
      args.push("--skip-git-repo-check");
    }

    if (this.config.web_search_enabled) {
      args.push("--search");
    }

    for (const directory of this.config.additional_directories ?? []) {
      args.push("--add-dir", directory);
    }

    for (const [key, value] of buildCommandConfigEntries(this.config)) {
      args.push("--config", `${key}=${value}`);
    }

    args.push("-");
    return args;
  }

  buildEnvironment() {
    return {
      ...process.env,
      ...this.config.cli_env,
    };
  }

  assertCommandConfiguration() {
    if (
      this.config.sandbox_mode === "danger-full-access" &&
      this.config.network_access_enabled === false
    ) {
      throw new Error(
        "The command execution method cannot guarantee networkAccessEnabled=false with danger-full-access sandbox.",
      );
    }
  }
}

function buildCommandConfigEntries(config) {
  const entries = [];

  if (config.model_reasoning_effort) {
    entries.push(["model_reasoning_effort", serializeTomlLiteral(config.model_reasoning_effort)]);
  }

  if (config.approval_policy) {
    entries.push(["approval_policy", serializeTomlLiteral(config.approval_policy)]);
  }

  if (config.sandbox_mode === "workspace-write") {
    entries.push([
      "sandbox_workspace_write.network_access",
      serializeTomlLiteral(config.network_access_enabled),
    ]);
  }

  for (const [key, value] of flattenConfigObject(config.codex_config ?? {})) {
    entries.push([key, serializeTomlLiteral(value)]);
  }

  return entries;
}

function flattenConfigObject(value, prefix = "") {
  const entries = [];

  for (const [key, childValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(childValue)) {
      entries.push(...flattenConfigObject(childValue, nextKey));
      continue;
    }

    entries.push([nextKey, childValue]);
  }

  return entries;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeTomlLiteral(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeTomlLiteral(entry)).join(", ")}]`;
  }

  if (isPlainObject(value)) {
    const parts = Object.entries(value).map(
      ([key, childValue]) => `${key} = ${serializeTomlLiteral(childValue)}`,
    );
    return `{ ${parts.join(", ")} }`;
  }

  throw new Error(`Unsupported Codex config value: ${String(value)}`);
}

function normalizeSdkUsage(usage) {
  if (!usage) {
    return undefined;
  }

  const promptTokens = usage.input_tokens ?? 0;
  const cachedTokens = usage.cached_input_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? 0;

  return {
    prompt: promptTokens,
    completion: completionTokens,
    cached: cachedTokens,
    total: promptTokens + completionTokens,
  };
}

function parseJsonLines(stdout) {
  return stdout
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
}

function extractCommandUsage(events) {
  const completedTurn = events.findLast?.((event) => event.type === "turn.completed")
    ?? [...events].reverse().find((event) => event.type === "turn.completed");

  const usage = completedTurn?.usage;

  if (!usage) {
    return undefined;
  }

  const promptTokens = usage.input_tokens ?? 0;
  const cachedTokens = usage.cached_input_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? 0;

  return {
    prompt: promptTokens,
    completion: completionTokens,
    cached: cachedTokens,
    total: promptTokens + completionTokens,
  };
}

function extractFinalAgentMessage(events) {
  const agentMessageEvent = events.findLast?.((event) => event.type === "agent_message")
    ?? [...events].reverse().find((event) => event.type === "agent_message");

  return agentMessageEvent?.message ?? "";
}

async function spawnProcess({
  command,
  args,
  cwd,
  env,
  stdinText,
  abortSignal,
}) {
  return await new Promise((resolve, reject) => {
    const isWindowsCommand = process.platform === "win32";
    const childProcess = spawn(
      isWindowsCommand ? "cmd.exe" : command,
      isWindowsCommand ? ["/d", "/s", "/c", command, ...args] : args,
      {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true,
      },
    );

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
      reject(error);
    });

    childProcess.on("exit", (exitCode) => {
      cleanupAbortListener();
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    if (stdinText) {
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
