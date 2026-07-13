import fs from "node:fs/promises";
import path from "node:path";

import { prependPromptPreamble } from "../prompt-augmentation.js";
import {
  spawnProviderCommand,
  withPromptPlaceholder,
} from "./command-process.js";
import { writeExecutionEventHook } from "./execution-event-hook.js";
import { buildIsolatedProviderEnvironment } from "./provider-environment.js";
import { assertRequiredConfig } from "./provider-validation.js";
import { withRetry } from "./retry.js";

const WINDOWS_PROMPT_PLACEHOLDER = "__SKILL_ARENA_PROMPT__";
const ANTIGRAVITY_MODES = new Set(["default", "accept-edits", "plan"]);
const MANAGED_OR_UNSAFE_ARGUMENTS = new Set([
  "--add-dir",
  "--agent",
  "--continue",
  "--conversation",
  "--dangerously-skip-permissions",
  "--log-file",
  "--mode",
  "--model",
  "--new-project",
  "--print",
  "--print-timeout",
  "--project",
  "--prompt",
  "--prompt-interactive",
  "--sandbox",
  "-c",
  "-i",
  "-p",
]);

export default class AntigravityCliSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "antigravity-cli-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    assertRequiredConfig(this.config, "antigravity-cli", ["working_dir"]);
    validateAdapterConfig(this.config);
    const effectivePrompt = prependPromptPreamble(prompt, this.config.prompt_preamble);
    const runtimeLayout = await this.prepareRuntimeLayout();
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : effectivePrompt,
    );
    const appliedSettings = this.describeAppliedSettings(runtimeLayout);
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "agy",
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
    const executionEventHook = await writeExecutionEventHook({
      workingDirectory: this.config.working_dir,
      adapter: "antigravity-cli",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "agy",
      args,
      exitCode,
      stdout,
      stderr,
      rawEvents: [],
      extra: { appliedSettings },
    });

    if (exitCode !== 0) {
      return {
        error: stderr.trim() || stdout.trim() || `agy exited with code ${exitCode}.`,
        metadata: this.buildMetadata({
          appliedSettings,
          executionEventHook,
          stderr,
        }),
      };
    }

    return {
      output: stdout.trim(),
      metadata: this.buildMetadata({
        appliedSettings,
        executionEventHook,
        stderr,
      }),
    };
  }

  async prepareRuntimeLayout() {
    validateAdapterConfig(this.config);
    const homeDirectory = resolveRuntimeHome(this.config);
    const settingsDirectory = path.join(homeDirectory, ".gemini", "antigravity-cli");
    const settingsPath = path.join(settingsDirectory, "settings.json");
    const mirroredSkills = await mirrorWorkspaceSkills(
      this.config.working_dir,
      path.join(this.config.working_dir, ".agents", "skills"),
    );
    const settings = buildAntigravitySettings(this.config, this.config.working_dir);
    const logFile = resolveLogFile(this.config);

    await fs.mkdir(settingsDirectory, { recursive: true });
    if (logFile) {
      await fs.mkdir(path.dirname(logFile), { recursive: true });
    }
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

    return {
      homeDirectory,
      mirroredSkills,
      logFile,
      settings,
      settingsPath,
      environment: {
        HOME: homeDirectory,
        USERPROFILE: homeDirectory,
      },
    };
  }

  buildCommandArguments(prompt) {
    validateAdapterConfig(this.config);
    const args = ["--print", prompt];
    const adapterConfig = resolveAdapterConfig(this.config);

    pushOption(args, "--model", this.config.model);
    pushBooleanOption(args, "--sandbox", shouldEnableSandbox(this.config));
    pushFlag(args, "--dangerously-skip-permissions", this.config.approval_policy === "never");
    pushOption(args, "--agent", adapterConfig.agent);
    if (adapterConfig.mode && adapterConfig.mode !== "default") {
      pushOption(args, "--mode", adapterConfig.mode);
    }
    pushOption(args, "--log-file", resolveLogFile(this.config));
    pushOption(args, "--print-timeout", adapterConfig.printTimeout);
    pushOption(args, "--project", adapterConfig.project);
    pushFlag(args, "--new-project", adapterConfig.newProject === true);

    for (const directory of this.config.additional_directories ?? []) {
      args.push("--add-dir", path.resolve(this.config.working_dir, directory));
    }

    for (const extraArg of toStringArray(adapterConfig.extraArgs)) {
      args.push(extraArg);
    }

    return args;
  }

  buildEnvironment(runtimeEnvironment = {}) {
    return buildIsolatedProviderEnvironment(
      {
        ...(this.config.cli_env ?? {}),
        ...runtimeEnvironment,
      },
      this.config.env_passthrough,
    );
  }

  describeAppliedSettings(runtimeLayout) {
    return {
      mirroredSkills: runtimeLayout.mirroredSkills,
      agent: adapterConfigValue(this.config, "agent"),
      mode: adapterConfigValue(this.config, "mode") ?? "default",
      logFile: runtimeLayout.logFile,
      model: this.config.model ?? null,
      sandboxEnabled: shouldEnableSandbox(this.config),
      sandboxNetworkEnabled: this.config.network_access_enabled === true,
      toolPermission: resolveToolPermission(this.config.approval_policy),
      webSearchEnabled: this.config.web_search_enabled === true,
      permissionsAutoApproved: this.config.approval_policy === "never",
      settingsPath: runtimeLayout.settingsPath,
    };
  }

  buildMetadata({ appliedSettings, executionEventHook, stderr }) {
    return {
      backend: "command",
      commandPath: this.config.command_path ?? "agy",
      stderr: stderr.trim() || null,
      appliedSettings,
      executionEventHook,
      unsupportedSettings: describeUnsupportedSettings(this.config),
      workspaceDirectory: this.config.working_dir,
      workingDirectory: this.config.working_dir,
    };
  }
}

async function mirrorWorkspaceSkills(workingDirectory, destinationSkillsDirectory) {
  const sourceSkillsDirectory = path.join(workingDirectory, "skills");
  const sourceEntries = await fs.readdir(sourceSkillsDirectory, { withFileTypes: true }).catch(() => []);
  const mirrored = [];

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
    await fs.mkdir(destinationSkillsDirectory, { recursive: true });
    await fs.cp(sourceDirectory, destinationDirectory, { recursive: true });
    mirrored.push(path.relative(workingDirectory, destinationDirectory).split(path.sep).join("/"));
  }

  return mirrored;
}

function resolveRuntimeHome(config) {
  const configuredHome = config.cli_env?.HOME ?? config.cli_env?.USERPROFILE;
  return configuredHome || path.join(config.working_dir, ".skill-arena", "antigravity-cli", "home");
}

function buildAntigravitySettings(config, workingDirectory) {
  const adapterConfig = resolveAdapterConfig(config);
  const customSettings = isRecord(adapterConfig.settings) ? adapterConfig.settings : {};
  return {
    ...customSettings,
    permissions: buildPermissions(config, customSettings.permissions),
    allowNonWorkspaceAccess: false,
    artifactReviewPolicy: resolveArtifactReviewPolicy(config.approval_policy),
    enableTerminalSandbox: shouldEnableSandbox(config),
    sandboxAllowNetwork: config.network_access_enabled === true,
    toolPermission: resolveToolPermission(config.approval_policy),
    enableTelemetry: false,
    showFeedbackSurvey: false,
    showTips: false,
    trustedWorkspaces: [workingDirectory],
  };
}

function resolveAdapterConfig(config) {
  return config.antigravity_cli_config && typeof config.antigravity_cli_config === "object"
    ? config.antigravity_cli_config
    : {};
}

function adapterConfigValue(config, key) {
  return resolveAdapterConfig(config)[key] ?? null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveToolPermission(approvalPolicy) {
  switch (approvalPolicy) {
    case "never":
      return "always-proceed";
    case "on-failure":
      return "proceed-in-sandbox";
    case "untrusted":
      return "strict";
    case "on-request":
    default:
      return "request-review";
  }
}

function resolveArtifactReviewPolicy(approvalPolicy) {
  return approvalPolicy === "never" || approvalPolicy === "on-failure"
    ? "always-proceed"
    : "asks-for-review";
}

function buildPermissions(config, configuredPermissions) {
  const permissions = isRecord(configuredPermissions) ? configuredPermissions : {};
  const allow = toUniqueStringArray(permissions.allow);
  const ask = toUniqueStringArray(permissions.ask);
  const deny = toUniqueStringArray(permissions.deny);

  if (config.web_search_enabled === true) {
    appendUnique(allow, "read_url(*)");
  } else {
    appendUnique(deny, "read_url(*)");
  }

  appendUnique(deny, "execute_url(*)");

  return { allow, deny, ask };
}

function resolveLogFile(config) {
  const logFile = resolveAdapterConfig(config).logFile;
  if (logFile === undefined || logFile === null || logFile === "") {
    return undefined;
  }

  const resolved = path.resolve(config.working_dir, String(logFile));
  const relative = path.relative(config.working_dir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`antigravity_cli_config.logFile escapes the workspace root: ${logFile}`);
  }

  return resolved;
}

function validateAdapterConfig(config) {
  const adapterConfig = resolveAdapterConfig(config);

  if (adapterConfig.mode !== undefined && !ANTIGRAVITY_MODES.has(adapterConfig.mode)) {
    throw new Error(
      `antigravity_cli_config.mode must be one of: ${[...ANTIGRAVITY_MODES].join(", ")}.`,
    );
  }

  if (adapterConfig.agent !== undefined &&
      (typeof adapterConfig.agent !== "string" || adapterConfig.agent.trim() === "")) {
    throw new Error("antigravity_cli_config.agent must be a non-empty string.");
  }

  if (adapterConfig.extraArgs !== undefined && !Array.isArray(adapterConfig.extraArgs)) {
    throw new Error("antigravity_cli_config.extraArgs must be an array of strings.");
  }

  for (const argument of adapterConfig.extraArgs ?? []) {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new Error("antigravity_cli_config.extraArgs must contain only non-empty strings.");
    }

    const optionName = argument.split("=", 1)[0];
    if (MANAGED_OR_UNSAFE_ARGUMENTS.has(optionName)) {
      throw new Error(
        `antigravity_cli_config.extraArgs cannot override managed or stateful option "${optionName}".`,
      );
    }
  }

  resolveLogFile(config);
}

function shouldEnableSandbox(config) {
  return config.sandbox_mode !== "danger-full-access";
}

function describeUnsupportedSettings(config) {
  const unsupported = [];

  if (config.sandbox_mode === "read-only") {
    unsupported.push("sandboxMode");
  }

  if (config.network_access_enabled === false &&
      (config.sandbox_mode === "danger-full-access" || config.web_search_enabled === true)) {
    unsupported.push("networkAccessEnabled");
  }

  if (config.model_reasoning_effort) {
    unsupported.push("reasoningEffort");
  }

  return unsupported;
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.length > 0)
    : [];
}

function toUniqueStringArray(value) {
  return [...new Set(toStringArray(value))];
}

function appendUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
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

function pushBooleanOption(args, optionName, value) {
  args.push(`${optionName}=${value ? "true" : "false"}`);
}

async function spawnProcess({ command, args, cwd, env, promptText, abortSignal }) {
  return spawnProviderCommand({
    command,
    args: promptText ? withPromptPlaceholder(args, WINDOWS_PROMPT_PLACEHOLDER) : args,
    cwd,
    env,
    promptText,
    promptDirectoryPrefix: "skill-arena-antigravity-cli-prompt-",
    abortSignal,
  });
}
