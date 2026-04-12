import fs from "node:fs/promises";
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

export default class OpenCodeSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "opencode-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    assertRequiredConfig(this.config, "opencode", ["working_dir"]);

    const runtimeConfig = await this.prepareRuntimeConfig();
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const appliedSettings = this.describeAppliedSettings(runtimeConfig);
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "opencode",
        args,
        cwd: this.config.working_dir,
        env: this.buildEnvironment(runtimeConfig.environment),
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
      adapter: "opencode",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "opencode",
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
        error: stderr.trim() || stdout.trim() || `opencode exited with code ${exitCode}.`,
        metadata: {
          backend: "command",
          commandPath: this.config.command_path ?? "opencode",
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
        commandPath: this.config.command_path ?? "opencode",
        stderr: stderr.trim() || null,
        appliedSettings,
        executionEventHook,
        unsupportedSettings: describeUnsupportedSettings(this.config),
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = ["run", "--format", "json"];
    if (this.config.strict_runtime_isolation !== false) {
      args.push("--pure");
    }

    pushOption(args, "--model", this.config.model);
    pushOption(args, "--agent", this.config.agent);
    args.push(prompt);

    return args;
  }

  buildEnvironment(runtimeEnvironment = {}) {
    return buildIsolatedProviderEnvironment({
      ...this.config.cli_env,
      ...runtimeEnvironment,
    });
  }

  async prepareRuntimeConfig() {
    const runtimeConfigDirectory = path.join(
      this.config.working_dir,
      ".skill-arena",
      "opencode-config",
    );
    const runtimeSkillsDirectory = path.join(runtimeConfigDirectory, "skills");
    const allowedSkills = Array.isArray(this.config.allowed_skills)
      ? this.config.allowed_skills
      : [];
    const shouldDisableUndeclaredSkills = this.config.disable_other_skills ?? true;
    const mergedConfig = {
      ...(this.config.opencode_config ?? {}),
    };
    const instructions = collectInstructionPaths(this.config.working_dir);

    await fs.rm(runtimeConfigDirectory, { recursive: true, force: true });
    await fs.mkdir(runtimeSkillsDirectory, { recursive: true });

    if (instructions.length > 0 && mergedConfig.instructions === undefined) {
      mergedConfig.instructions = instructions;
    }

    if (allowedSkills.length > 0) {
      await copyAllowedSkills({
        skillIds: allowedSkills,
        workingDirectory: this.config.working_dir,
        runtimeSkillsDirectory,
      });
    }

    return {
      configDirectory: runtimeConfigDirectory,
      environment: {
        OPENCODE_CONFIG_DIR: runtimeConfigDirectory,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(mergedConfig),
        SKILL_ARENA_ALLOWED_SKILLS: allowedSkills.join(","),
      },
      allowedSkills,
      disableOtherSkills: shouldDisableUndeclaredSkills,
      instructions,
    };
  }

  describeAppliedSettings(runtimeConfig) {
    return {
      agent: this.config.agent ?? null,
      allowedSkills: runtimeConfig.allowedSkills,
      disableOtherSkills: runtimeConfig.disableOtherSkills,
      instructions: runtimeConfig.instructions,
      model: this.config.model ?? null,
    };
  }
}

function collectInstructionPaths(workingDirectory) {
  const agentsPath = path.join(workingDirectory, "AGENTS.md");
  return [agentsPath]
    .filter((candidate) => requirePathExists(candidate))
    .map((candidate) => path.relative(workingDirectory, candidate).split(path.sep).join("/"));
}

async function copyAllowedSkills({
  skillIds,
  workingDirectory,
  runtimeSkillsDirectory,
}) {
  for (const skillId of skillIds) {
    const sourceDirectory = path.join(workingDirectory, "skills", skillId);
    if (!requirePathExists(path.join(sourceDirectory, "SKILL.md"))) {
      continue;
    }

    await fs.cp(sourceDirectory, path.join(runtimeSkillsDirectory, skillId), {
      recursive: true,
    });
  }
}

function extractFinalOutput(stdout) {
  const trimmedOutput = stdout.trim();
  if (!trimmedOutput) {
    return "";
  }

  for (const event of [...parseJsonLines(trimmedOutput)].reverse()) {
    const message = extractMessage(event);
    if (message) {
      return message;
    }
  }

  try {
    const parsed = JSON.parse(trimmedOutput);
    const message = extractMessage(parsed);
    if (message) {
      return message;
    }
  } catch {}

  return trimmedOutput;
}

function extractMessage(event) {
  for (const value of [
    event?.content,
    event?.message,
    event?.text,
    event?.output,
    event?.result?.content,
    event?.result?.text,
    event?.data?.content,
    event?.data?.text,
  ]) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function describeUnsupportedSettings(config) {
  const unsupported = [];

  if (config.sandbox_mode) {
    unsupported.push("sandboxMode");
  }

  if (config.approval_policy) {
    unsupported.push("approvalPolicy");
  }

  if (config.web_search_enabled !== undefined) {
    unsupported.push("webSearchEnabled");
  }

  if (config.network_access_enabled !== undefined) {
    unsupported.push("networkAccessEnabled");
  }

  if (config.model_reasoning_effort) {
    unsupported.push("reasoningEffort");
  }

  return unsupported;
}

function pushOption(args, optionName, optionValue) {
  if (optionValue !== undefined && optionValue !== null && optionValue !== "") {
    args.push(optionName, String(optionValue));
  }
}

function requirePathExists(candidate) {
  return process.getBuiltinModule("node:fs").existsSync(candidate);
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
    promptDirectoryPrefix: "skill-arena-opencode-prompt-",
    abortSignal,
  });
}
