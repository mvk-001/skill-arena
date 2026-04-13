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
    assertRequiredConfig(this.config, "pi", ["working_dir"]);

    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "pi",
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
    const sessionUsage = extractSessionUsage(observedEvents);
    const executionEventHook = await writeExecutionEventHook({
      workingDirectory: this.config.working_dir,
      adapter: "pi",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "pi",
      args,
      exitCode,
      stdout,
      stderr,
      rawEvents: observedEvents,
    });

    if (exitCode !== 0) {
      return {
        error: stderr.trim() || stdout.trim() || `pi exited with code ${exitCode}.`,
        metadata: {
          backend: "command",
          stderr: stderr.trim() || null,
          sessionUsage,
          executionEventHook,
        },
      };
    }

    return {
      output: stdout.trim(),
      metadata: {
        backend: "command",
        stderr: stderr.trim() || null,
        sessionUsage,
        executionEventHook,
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
    return buildIsolatedProviderEnvironment(this.config.cli_env);
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
    promptDirectoryPrefix: "skill-arena-pi-prompt-",
    abortSignal,
  });
}

function extractSessionUsage(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  for (const event of [...events].reverse()) {
    const usage = normalizeSessionUsage(event?.usage ?? event?.data?.usage);
    if (usage) {
      return usage;
    }
  }

  return null;
}

function normalizeSessionUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const normalized = {};

  if (Number.isFinite(usage.premiumRequests)) {
    normalized.premiumRequests = usage.premiumRequests;
  }

  if (Number.isFinite(usage.totalApiDurationMs)) {
    normalized.totalApiDurationMs = usage.totalApiDurationMs;
  }

  if (Number.isFinite(usage.sessionDurationMs)) {
    normalized.sessionDurationMs = usage.sessionDurationMs;
  }

  if (usage.codeChanges && typeof usage.codeChanges === "object") {
    normalized.codeChanges = usage.codeChanges;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
