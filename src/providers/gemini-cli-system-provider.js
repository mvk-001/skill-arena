import fs from "node:fs/promises";
import path from "node:path";
import {
  spawnProviderCommand,
  withPromptPlaceholder,
} from "./command-process.js";
import { prependPromptPreamble } from "../prompt-augmentation.js";
import { parseJsonLines, writeExecutionEventHook } from "./execution-event-hook.js";
import { buildIsolatedProviderEnvironment } from "./provider-environment.js";
import { assertRequiredConfig } from "./provider-validation.js";
import { withRetry } from "./retry.js";

const WINDOWS_PROMPT_PLACEHOLDER = "__SKILL_ARENA_PROMPT__";

export default class GeminiCliSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "gemini-cli-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    assertRequiredConfig(this.config, "gemini-cli", ["working_dir"]);
    const effectivePrompt = prependPromptPreamble(prompt, this.config.prompt_preamble);

    const runtimeLayout = await this.prepareRuntimeLayout();
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : effectivePrompt,
    );
    const appliedSettings = this.describeAppliedSettings(runtimeLayout);
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "gemini",
        args,
        cwd: this.config.working_dir,
        env: this.buildEnvironment(runtimeLayout.environment),
        promptText: useWindowsPromptWrapper ? effectivePrompt : undefined,
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
      adapter: "gemini-cli",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "gemini",
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
        error: stderr.trim() || stdout.trim() || `gemini exited with code ${exitCode}.`,
        metadata: {
          backend: "command",
          commandPath: this.config.command_path ?? "gemini",
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
        commandPath: this.config.command_path ?? "gemini",
        stderr: stderr.trim() || null,
        appliedSettings,
        executionEventHook,
        unsupportedSettings: describeUnsupportedSettings(this.config),
        workspaceDirectory: this.config.working_dir,
        workingDirectory: this.config.working_dir,
      },
    };
  }

  async prepareRuntimeLayout() {
    const geminiDirectory = path.join(this.config.working_dir, ".gemini");
    const skillArenaDirectory = path.join(this.config.working_dir, ".skill-arena", "gemini-cli");
    const projectSettingsPath = path.join(geminiDirectory, "settings.json");
    const systemSettingsPath = path.join(skillArenaDirectory, "system-settings.json");
    const systemDefaultsPath = path.join(skillArenaDirectory, "system-defaults.json");
    const mirroredSkills = await mirrorWorkspaceSkillsToGeminiDirectory(this.config.working_dir, geminiDirectory);
    const mirroredInstruction = await mirrorAgentsInstructionsToGeminiMd(this.config.working_dir);
    const existingSettings = await readJsonIfExists(projectSettingsPath);
    const settings = buildGeminiSettings(this.config, mirroredSkills.length > 0, existingSettings);

    await fs.mkdir(geminiDirectory, { recursive: true });
    await fs.mkdir(skillArenaDirectory, { recursive: true });
    await fs.writeFile(projectSettingsPath, JSON.stringify(settings, null, 2), "utf8");
    await fs.writeFile(systemSettingsPath, "{}\n", "utf8");
    await fs.writeFile(systemDefaultsPath, "{}\n", "utf8");

    return {
      mirroredInstruction,
      mirroredSkills,
      projectSettingsPath,
      settings,
      environment: {
        GEMINI_CLI_SYSTEM_SETTINGS_PATH: systemSettingsPath,
        GEMINI_CLI_SYSTEM_DEFAULTS_PATH: systemDefaultsPath,
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = ["-p", prompt, "--output-format", "stream-json"];
    const additionalDirectories = this.config.additional_directories ?? [];
    const approvalMode = resolveApprovalMode(this.config);

    pushOption(args, "--model", this.config.model);
    pushOption(args, "--approval-mode", approvalMode);
    pushFlag(args, "--sandbox", shouldEnableSandbox(this.config));

    for (const directory of additionalDirectories) {
      args.push("--include-directories", path.resolve(this.config.working_dir, directory));
    }

    return args;
  }

  buildEnvironment(runtimeEnvironment = {}) {
    const cliEnvironment = {
      ...(this.config.cli_env ?? {}),
      ...runtimeEnvironment,
    };

    if (this.config.strict_runtime_isolation !== false && cliEnvironment.HOME && !cliEnvironment.USERPROFILE) {
      cliEnvironment.USERPROFILE = cliEnvironment.HOME;
    }

    return buildIsolatedProviderEnvironment(cliEnvironment);
  }

  describeAppliedSettings(runtimeLayout) {
    return {
      mirroredInstruction: runtimeLayout.mirroredInstruction,
      mirroredSkills: runtimeLayout.mirroredSkills,
      model: this.config.model ?? null,
      approvalMode: resolveApprovalMode(this.config),
      sandboxEnabled: shouldEnableSandbox(this.config),
      projectSettingsPath: runtimeLayout.projectSettingsPath,
    };
  }
}

async function mirrorWorkspaceSkillsToGeminiDirectory(workingDirectory, geminiDirectory) {
  const sourceSkillsDirectory = path.join(workingDirectory, "skills");
  const sourceEntries = await fs.readdir(sourceSkillsDirectory, { withFileTypes: true }).catch(() => []);
  const mirrored = [];

  if (sourceEntries.length === 0) {
    return mirrored;
  }

  const destinationSkillsDirectory = path.join(geminiDirectory, "skills");
  await fs.mkdir(destinationSkillsDirectory, { recursive: true });

  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDirectory = path.join(sourceSkillsDirectory, entry.name);
    const skillFile = path.join(sourceDirectory, "SKILL.md");
    const skillExists = await fs.stat(skillFile).catch(() => null);
    if (!skillExists?.isFile()) {
      continue;
    }

    const destinationDirectory = path.join(destinationSkillsDirectory, entry.name);
    await fs.rm(destinationDirectory, { recursive: true, force: true });
    await fs.cp(sourceDirectory, destinationDirectory, { recursive: true });
    mirrored.push(path.relative(workingDirectory, destinationDirectory).split(path.sep).join("/"));
  }

  return mirrored;
}

async function mirrorAgentsInstructionsToGeminiMd(workingDirectory) {
  const geminiMdPath = path.join(workingDirectory, "GEMINI.md");
  const existingGeminiMd = await fs.stat(geminiMdPath).catch(() => null);
  if (existingGeminiMd?.isFile()) {
    return null;
  }

  const agentsMdPath = path.join(workingDirectory, "AGENTS.md");
  const agentsMd = await fs.stat(agentsMdPath).catch(() => null);
  if (!agentsMd?.isFile()) {
    return null;
  }

  await fs.copyFile(agentsMdPath, geminiMdPath);
  return "GEMINI.md";
}

function buildGeminiSettings(config, hasWorkspaceSkills, existingSettings = {}) {
  const adapterConfig = (config.gemini_cli_config && typeof config.gemini_cli_config === "object")
    ? config.gemini_cli_config
    : {};
  const settings = {
    ...(existingSettings && typeof existingSettings === "object" ? existingSettings : {}),
    ...((adapterConfig.settings && typeof adapterConfig.settings === "object") ? adapterConfig.settings : {}),
  };

  settings.general = {
    ...(settings.general ?? {}),
    enableAutoUpdate: false,
    enableAutoUpdateNotification: false,
  };

  settings.privacy = {
    ...(settings.privacy ?? {}),
    usageStatisticsEnabled: false,
  };

  settings.output = {
    ...(settings.output ?? {}),
    format: "json",
  };

  settings.skills = {
    ...(settings.skills ?? {}),
    enabled: hasWorkspaceSkills ? true : (settings.skills?.enabled ?? true),
    disabled: Array.isArray(settings.skills?.disabled) ? settings.skills.disabled : [],
  };

  settings.hooksConfig = {
    ...(settings.hooksConfig ?? {}),
    enabled: false,
    disabled: Array.isArray(settings.hooksConfig?.disabled) ? settings.hooksConfig.disabled : [],
  };

  settings.admin = {
    ...(settings.admin ?? {}),
    extensions: {
      ...((settings.admin && typeof settings.admin === "object" && settings.admin.extensions) ? settings.admin.extensions : {}),
      enabled: false,
    },
    mcp: {
      ...((settings.admin && typeof settings.admin === "object" && settings.admin.mcp) ? settings.admin.mcp : {}),
      enabled: false,
    },
    skills: {
      ...((settings.admin && typeof settings.admin === "object" && settings.admin.skills) ? settings.admin.skills : {}),
      enabled: true,
    },
  };

  return settings;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function resolveApprovalMode(config) {
  switch (config.approval_policy) {
    case "never":
      return "yolo";
    case "on-request":
      return "default";
    default:
      return undefined;
  }
}

function shouldEnableSandbox(config) {
  return config.sandbox_mode !== "danger-full-access";
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
    event?.response,
    event?.result?.response,
    event?.result?.text,
    event?.message?.content,
    event?.message?.text,
    event?.text,
    event?.content,
    event?.output,
    extractNestedText(event?.message),
    extractNestedText(event?.result),
  ]) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function extractNestedText(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return "";
  }

  if (Array.isArray(candidate.content)) {
    for (const part of candidate.content) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function describeUnsupportedSettings(config) {
  const unsupported = [];

  if (config.approval_policy === "on-failure" || config.approval_policy === "untrusted") {
    unsupported.push("approvalPolicy");
  }

  if (config.sandbox_mode === "read-only" || config.sandbox_mode === "workspace-write") {
    unsupported.push("sandboxMode");
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

function pushFlag(args, optionName, enabled) {
  if (enabled) {
    args.push(optionName);
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
  return spawnProviderCommand({
    command,
    args: promptText ? withPromptPlaceholder(args, WINDOWS_PROMPT_PLACEHOLDER) : args,
    cwd,
    env,
    promptText,
    promptDirectoryPrefix: "skill-arena-gemini-cli-prompt-",
    abortSignal,
  });
}
