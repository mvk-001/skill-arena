import path from "node:path";
import {
  spawnProviderCommand,
  withPromptPlaceholder,
} from "./command-process.js";
import { parseJsonLines, writeExecutionEventHook } from "./execution-event-hook.js";
import { buildIsolatedProviderEnvironment } from "./provider-environment.js";
import { assertRequiredConfig } from "./provider-validation.js";
import { withRetry } from "./retry.js";

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
    assertRequiredConfig(this.config, "copilot-cli", ["working_dir"]);

    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const appliedSettings = this.describeAppliedSettings();
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "copilot",
        args,
        cwd: this.config.working_dir,
        env: this.buildEnvironment(),
        promptText: useWindowsPromptWrapper ? prompt : undefined,
        abortSignal: callOptions?.abortSignal,
      }),
      {
        retries: this.config.retries ?? 0,
        retryDelayMs: this.config.retry_delay_ms ?? 5_000,
      },
    );
    const observedEvents = parseJsonLines(stdout);
    const executionEventHook = await writeExecutionEventHook({
      workingDirectory: this.config.working_dir,
      adapter: "copilot-cli",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "copilot",
      args,
      exitCode,
      stdout,
      stderr,
      rawEvents: observedEvents,
      extra: {
        appliedSettings,
      },
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
          executionEventHook,
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
        executionEventHook,
        unsupportedSettings: describeUnsupportedSettings(this.config),
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = ["-p", prompt, "--output-format", "json", "--no-color"];
    const adapterConfig = this.config.copilot_config ?? {};
    const additionalDirectories = this.config.additional_directories ?? [];

    pushOption(args, "--model", this.config.model);
    pushOption(args, "--agent", adapterConfig.agent);
    pushFlag(args, "--no-custom-instructions", adapterConfig.noCustomInstructions === true);
    pushFlag(args, "--allow-all-tools", this.config.approval_policy === "never");
    pushFlag(
      args,
      "--allow-all-urls",
      this.config.network_access_enabled
        || this.config.web_search_enabled
        || this.config.sandbox_mode === "danger-full-access",
    );
    pushFlag(
      args,
      "--allow-all-paths",
      this.config.sandbox_mode === "danger-full-access" || additionalDirectories.length > 0,
    );

    args.push("--no-ask-user");

    for (const directory of additionalDirectories) {
      args.push("--add-dir", path.resolve(this.config.working_dir, directory));
    }

    pushRepeatedOptions(args, "--allow-tool", toStringArray(adapterConfig.allowTool));
    pushRepeatedOptions(args, "--deny-tool", toStringArray(adapterConfig.denyTool));
    pushRepeatedOptions(args, "--allow", toStringArray(adapterConfig.allowUrl));
    pushRepeatedOptions(args, "--context", toStringArray(adapterConfig.extraContext));
    pushFlag(args, "--share", adapterConfig.share === true);

    return args;
  }

  buildEnvironment() {
    return buildIsolatedProviderEnvironment(this.config.cli_env);
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
    ? parseJsonLines(trimmedOutput)
    : [];

  const jsonMessage = extractMessageFromJsonLines(jsonLines);
  return jsonMessage || trimmedOutput;
}

function extractMessageFromJsonLines(events) {
  for (const event of [...events].reverse()) {
    for (const value of getEventMessageCandidates(event)) {
      const message = trimNonEmptyString(value);
      if (message) {
        return message;
      }
    }
  }

  return "";
}

function getEventMessageCandidates(event) {
  return [
    event?.type === "assistant.message" ? event?.data?.content : undefined,
    event?.message,
    event?.content,
    event?.text,
    event?.output,
  ];
}

function trimNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
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

function pushOption(args, optionName, optionValue) {
  if (optionValue !== undefined && optionValue !== null && optionValue !== "") {
    args.push(optionName, String(optionValue));
  }
}

function pushFlag(args, optionName, enabled) {
  if (enabled) {
    args.push(optionName);
  }
}

function pushRepeatedOptions(args, optionName, values) {
  for (const value of values) {
    args.push(optionName, value);
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
  return await spawnProviderCommand({
    command,
    args: withPromptPlaceholder(args, WINDOWS_PROMPT_PLACEHOLDER),
    cwd,
    env,
    promptText,
    promptDirectoryPrefix: "skill-arena-copilot-prompt-",
    abortSignal,
  });
}
