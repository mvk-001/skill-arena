import fs from "node:fs/promises";
import path from "node:path";

import { Codex } from "@openai/codex-sdk";
import { parseJsonLines, writeExecutionEventHook } from "./execution-event-hook.js";
import { spawnProviderCommand } from "./command-process.js";
import {
  buildIsolatedProviderEnvironment,
  resolveProcessTempDirectory,
} from "./provider-environment.js";
import { prependPromptPreamble } from "../prompt-augmentation.js";
import { assertRequiredConfig } from "./provider-validation.js";
import { withRetry } from "./retry.js";

export default class CodexSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnCodexCommand;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "codex-system-provider";
  }

  async callApi(prompt, context, callOptions) {
    assertRequiredConfig(this.config, "codex", ["working_dir"]);
    const effectivePrompt = prependPromptPreamble(prompt, this.config.prompt_preamble);

    if (this.config.execution_method === "sdk") {
      return this.runWithSdk(effectivePrompt, callOptions);
    }

    if (this.config.execution_method === "command" || !this.config.execution_method) {
      return this.runWithCommand(effectivePrompt, callOptions);
    }

    throw new Error(
      `Unsupported Codex execution method "${this.config.execution_method}".`,
    );
  }

  async runWithSdk(prompt, callOptions) {
    const codex = new Codex({
      codexPathOverride: resolveCommandPath(this.config.command_path),
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
    const executionEventHook = await writeExecutionEventHook({
      workingDirectory: this.config.working_dir,
      adapter: "codex",
      providerId: this.id(),
      backend: "sdk",
      command: resolveCommandPath(this.config.command_path),
      args: [],
      exitCode: 0,
      rawEvents: turn.items ?? [],
      extra: {
        threadId: thread.id,
        model: this.config.model ?? null,
      },
    });

    return {
      output: turn.finalResponse ?? "",
      tokenUsage: normalizeSdkUsage(turn.usage),
      metadata: {
        backend: "sdk",
        itemCount: turn.items.length,
        threadId: thread.id,
        executionEventHook,
      },
    };
  }

  async runWithCommand(prompt, callOptions) {
    this.assertCommandConfiguration();

    const outputDirectory = await fs.mkdtemp(
      path.join(resolveProcessTempDirectory(this.config.cli_env), "skill-arena-codex-command-"),
    );
    const outputFile = path.join(outputDirectory, "final-response.txt");

    try {
      const args = this.buildCommandArguments(outputFile);
      const { stdout, stderr, exitCode } = await withRetry(
        () => this.spawnProcess({
          command: this.config.command_path,
          args,
          cwd: this.config.working_dir,
          env: this.buildEnvironment(),
          stdinText: prompt,
          abortSignal: callOptions?.abortSignal,
        }),
        {
          retries: this.config.retries ?? 0,
          retryDelayMs: this.config.retry_delay_ms ?? 5_000,
        },
      );

      let finalResponse = await fs
        .readFile(outputFile, "utf8")
        .catch(() => "");
      const events = parseJsonLines(stdout);
      const executionEventHook = await writeExecutionEventHook({
        workingDirectory: this.config.working_dir,
        adapter: "codex",
        providerId: this.id(),
        backend: "command",
        command: this.config.command_path,
        args,
        exitCode,
        stdout,
        stderr,
        rawEvents: events,
      });
      const eventResponse = extractFinalAgentMessage(events);

      if (!finalResponse.trim()) {
        finalResponse = eventResponse;
      }

      if (exitCode !== 0) {
        return {
          error:
            stderr.trim() ||
            stdout.trim() ||
            `codex exec exited with code ${exitCode}.`,
          metadata: {
            backend: "command",
            executionEventHook,
          },
        };
      }

      const usage = extractCommandUsage(events);
      const output = finalResponse.trim() || eventResponse || "";

      return {
        output,
        tokenUsage: usage,
        metadata: {
          backend: "command",
          eventCount: events.length,
          executionEventHook,
          stderr: stderr.trim() || null,
        },
      };
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
    }
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
    return buildIsolatedProviderEnvironment(this.config.cli_env);
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

function extractCommandUsage(events) {
  const completedTurn = events.findLast((event) => event.type === "turn.completed");

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
  const finalMessageEvent = events.findLast(
    (event) => event.type === "item.completed" && event.item?.type === "agent_message",
  );

  const agentMessageEvent = events.findLast((event) => event.type === "agent_message");

  return finalMessageEvent?.item?.text ?? agentMessageEvent?.message ?? "";
}

async function spawnCodexCommand({
  command,
  args,
  cwd,
  env,
  stdinText,
  abortSignal,
}) {
  return await spawnProviderCommand({
    command,
    args: args.map((value) => ({ value, promptPlaceholder: false })),
    cwd,
    env,
    stdinText,
    abortSignal,
  });
}

function resolveCommandPath(command) {
  if (process.platform !== "win32") {
    return command;
  }

  return path.extname(command) ? command : `${command}.cmd`;
}
