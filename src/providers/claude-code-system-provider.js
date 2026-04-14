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
const READ_ONLY_DENY_TOOLS = ["Edit", "NotebookEdit", "Write"];

export default class ClaudeCodeSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "claude-code-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    assertRequiredConfig(this.config, "claude-code", ["working_dir"]);
    const effectivePrompt = prependPromptPreamble(prompt, this.config.prompt_preamble);

    const runtimeLayout = await this.prepareRuntimeLayout();
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : effectivePrompt,
      runtimeLayout,
    );
    const appliedSettings = this.describeAppliedSettings(runtimeLayout);
    const { stdout, stderr, exitCode } = await withRetry(
      () => this.spawnProcess({
        command: this.config.command_path ?? "claude",
        args,
        cwd: this.config.working_dir,
        env: this.buildEnvironment(),
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
      adapter: "claude-code",
      providerId: this.id(),
      backend: "command",
      command: this.config.command_path ?? "claude",
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
        error: stderr.trim() || stdout.trim() || `claude exited with code ${exitCode}.`,
        metadata: {
          backend: "command",
          commandPath: this.config.command_path ?? "claude",
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
        commandPath: this.config.command_path ?? "claude",
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
    const claudeDirectory = path.join(this.config.working_dir, ".claude");
    const skillArenaDirectory = path.join(this.config.working_dir, ".skill-arena", "claude-code");
    const runtimeSettingsPath = path.join(skillArenaDirectory, "settings.json");
    const mirroredSkills = await mirrorWorkspaceSkillsToClaudeDirectory(this.config.working_dir, claudeDirectory);
    const mirroredInstruction = await mirrorAgentsInstructionsToClaudeMd(this.config.working_dir);
    const runtimeSettings = buildClaudeSettings(this.config);

    await fs.mkdir(skillArenaDirectory, { recursive: true });
    await fs.writeFile(runtimeSettingsPath, JSON.stringify(runtimeSettings, null, 2), "utf8");

    return {
      runtimeSettingsPath,
      mirroredSkills,
      mirroredInstruction,
      runtimeSettings,
    };
  }

  buildCommandArguments(prompt, runtimeLayout) {
    const args = ["-p", prompt, "--output-format", "stream-json", "--no-session-persistence"];
    const adapterConfig = this.config.claude_code_config ?? {};
    const additionalDirectories = this.config.additional_directories ?? [];
    const permissionMode = resolvePermissionMode(this.config, adapterConfig);

    pushOption(args, "--model", this.config.model);
    pushOption(args, "--effort", mapReasoningEffort(this.config.model_reasoning_effort));
    pushOption(args, "--agent", this.config.agent);
    pushOption(args, "--permission-mode", permissionMode);
    pushOption(args, "--settings", runtimeLayout.runtimeSettingsPath);

    pushOption(
      args,
      "--setting-sources",
      toStringArray(adapterConfig.settingSources ?? ["project"]).join(","),
    );

    for (const directory of additionalDirectories) {
      args.push("--add-dir", path.resolve(this.config.working_dir, directory));
    }

    pushRepeatedOptions(args, "--allowedTools", toStringArray(adapterConfig.allowedTools));
    pushRepeatedOptions(args, "--disallowedTools", toStringArray(adapterConfig.disallowedTools));
    pushOption(args, "--tools", adapterConfig.tools);
    pushOption(args, "--append-system-prompt", adapterConfig.appendSystemPrompt);
    pushOption(args, "--append-system-prompt-file", adapterConfig.appendSystemPromptFile);
    pushRepeatedOptions(args, "--mcp-config", toStringArray(adapterConfig.mcpConfig));
    pushFlag(args, "--strict-mcp-config", adapterConfig.strictMcpConfig === true);
    pushOption(args, "--fallback-model", adapterConfig.fallbackModel);
    pushOption(args, "--permission-prompt-tool", adapterConfig.permissionPromptTool);
    pushOption(args, "--max-turns", adapterConfig.maxTurns);
    pushFlag(args, "--include-hook-events", this.config.enable_streaming !== false);
    pushFlag(args, "--include-partial-messages", adapterConfig.includePartialMessages === true);
    pushOption(args, "--json-schema", adapterConfig.jsonSchema);

    for (const extraArg of toStringArray(adapterConfig.extraArgs)) {
      args.push(extraArg);
    }

    return args;
  }

  buildEnvironment() {
    const cliEnvironment = {
      ...(this.config.cli_env ?? {}),
    };
    if (this.config.strict_runtime_isolation !== false && !cliEnvironment.CLAUDE_CONFIG_DIR && cliEnvironment.HOME) {
      cliEnvironment.CLAUDE_CONFIG_DIR = path.join(cliEnvironment.HOME, ".claude");
    }

    return buildIsolatedProviderEnvironment(cliEnvironment);
  }

  describeAppliedSettings(runtimeLayout) {
    return {
      agent: this.config.agent ?? null,
      mirroredInstruction: runtimeLayout.mirroredInstruction,
      mirroredSkills: runtimeLayout.mirroredSkills,
      model: this.config.model ?? null,
      permissionMode: resolvePermissionMode(this.config, this.config.claude_code_config ?? {}),
      reasoningEffort: mapReasoningEffort(this.config.model_reasoning_effort),
      runtimeSettingsPath: runtimeLayout.runtimeSettingsPath,
      sandboxMode: this.config.sandbox_mode ?? null,
      webSearchEnabled: this.config.web_search_enabled ?? null,
      networkAccessEnabled: this.config.network_access_enabled ?? null,
    };
  }
}

async function mirrorWorkspaceSkillsToClaudeDirectory(workingDirectory, claudeDirectory) {
  const sourceSkillsDirectory = path.join(workingDirectory, "skills");
  const sourceEntries = await fs.readdir(sourceSkillsDirectory, { withFileTypes: true }).catch(() => []);
  const mirrored = [];

  if (sourceEntries.length === 0) {
    return mirrored;
  }

  await fs.mkdir(path.join(claudeDirectory, "skills"), { recursive: true });

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

    const destinationDirectory = path.join(claudeDirectory, "skills", entry.name);
    await fs.rm(destinationDirectory, { recursive: true, force: true });
    await fs.cp(sourceDirectory, destinationDirectory, { recursive: true });
    mirrored.push(path.relative(workingDirectory, destinationDirectory).split(path.sep).join("/"));
  }

  return mirrored;
}

async function mirrorAgentsInstructionsToClaudeMd(workingDirectory) {
  const claudeMdPath = path.join(workingDirectory, "CLAUDE.md");
  const existingClaudeMd = await fs.stat(claudeMdPath).catch(() => null);
  if (existingClaudeMd?.isFile()) {
    return null;
  }

  const agentsMdPath = path.join(workingDirectory, "AGENTS.md");
  const agentsMd = await fs.stat(agentsMdPath).catch(() => null);
  if (!agentsMd?.isFile()) {
    return null;
  }

  await fs.copyFile(agentsMdPath, claudeMdPath);
  return "CLAUDE.md";
}

function buildClaudeSettings(config) {
  const adapterConfig = config.claude_code_config ?? {};
  const settings = {
    ...((adapterConfig.settings && typeof adapterConfig.settings === "object") ? adapterConfig.settings : {}),
  };

  settings.env = {
    ...(settings.env ?? {}),
    ...(config.cli_env ?? {}),
  };

  settings.permissions = mergePermissions(
    settings.permissions,
    buildPermissionSettings(config),
  );

  if (config.sandbox_mode && config.sandbox_mode !== "danger-full-access") {
    settings.sandbox = buildSandboxSettings(config, settings.sandbox);
  }

  return settings;
}

function buildPermissionSettings(config) {
  const deny = [];

  if (config.sandbox_mode === "read-only") {
    deny.push(...READ_ONLY_DENY_TOOLS);
  }

  if (config.web_search_enabled === false) {
    deny.push("WebSearch");
  }

  if (config.network_access_enabled === false) {
    deny.push("WebFetch");
  }

  return {
    deny,
  };
}

function mergePermissions(existingPermissions, generatedPermissions) {
  const base = (existingPermissions && typeof existingPermissions === "object")
    ? existingPermissions
    : {};

  return {
    ...base,
    deny: dedupeStringArray([
      ...toStringArray(base.deny),
      ...toStringArray(generatedPermissions.deny),
    ]),
  };
}

function buildSandboxSettings(config, existingSandbox) {
  const base = (existingSandbox && typeof existingSandbox === "object")
    ? existingSandbox
    : {};
  const filesystem = (base.filesystem && typeof base.filesystem === "object")
    ? base.filesystem
    : {};
  const allowWrite = dedupeStringArray([
    ...toStringArray(filesystem.allowWrite),
    ...(config.sandbox_mode === "workspace-write" ? ["./"] : []),
  ]);

  return {
    ...base,
    enabled: true,
    network: {
      ...(base.network ?? {}),
      enabled: config.network_access_enabled === true,
    },
    filesystem: {
      ...filesystem,
      allowWrite,
    },
  };
}

function resolvePermissionMode(config, adapterConfig) {
  if (typeof adapterConfig.permissionMode === "string" && adapterConfig.permissionMode.length > 0) {
    return adapterConfig.permissionMode;
  }

  return config.approval_policy === "never" ? "bypassPermissions" : "default";
}

function mapReasoningEffort(effort) {
  switch (effort) {
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "max";
    case "none":
    case "minimal":
    case "low":
    default:
      return "low";
  }
}

function extractFinalOutput(stdout) {
  const trimmedOutput = stdout.trim();

  if (!trimmedOutput) {
    return "";
  }

  const events = parseJsonLines(trimmedOutput);
  for (const event of [...events].reverse()) {
    const message = extractTextCandidate(event);
    if (message) {
      return message;
    }
  }

  try {
    const parsed = JSON.parse(trimmedOutput);
    const message = extractTextCandidate(parsed);
    if (message) {
      return message;
    }
  } catch {}

  return trimmedOutput;
}

function extractTextCandidate(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => extractTextCandidate(entry))
      .filter(Boolean)
      .join("\n")
      .trim();
    return joined;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  for (const candidate of [
    value.result,
    value.message,
    value.content,
    value.text,
    value.output,
    value.delta,
    value.final,
    value.data,
  ]) {
    const text = extractTextCandidate(candidate);
    if (text) {
      return text;
    }
  }

  if (typeof value.type === "string" && /assistant|result|message|completion/i.test(value.type)) {
    const flattened = Object.values(value)
      .map((entry) => extractTextCandidate(entry))
      .filter(Boolean)
      .join("\n")
      .trim();
    return flattened;
  }

  return "";
}

function describeUnsupportedSettings(config) {
  const unsupported = [];

  if (config.approval_policy && config.approval_policy !== "never") {
    unsupported.push("approvalPolicy");
  }

  return unsupported;
}

function dedupeStringArray(values) {
  return [...new Set(toStringArray(values))];
}

function toStringArray(value) {
  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry))
    .filter((entry) => entry.length > 0);
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
    promptDirectoryPrefix: "skill-arena-claude-code-prompt-",
    abortSignal,
  });
}
