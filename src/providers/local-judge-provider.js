import CodexSystemProvider from "./codex-system-provider.js";
import ClaudeCodeSystemProvider from "./claude-code-system-provider.js";
import CopilotSystemProvider from "./copilot-system-provider.js";
import OpenCodeSystemProvider from "./opencode-system-provider.js";
import PiSystemProvider from "./pi-system-provider.js";

const DEFAULTS = {
  codex: {
    command_path: "codex",
    execution_method: "command",
    sandbox_mode: "read-only",
    approval_policy: "never",
    web_search_enabled: false,
    network_access_enabled: false,
    model_reasoning_effort: "low",
    additional_directories: [],
    cli_env: {},
    codex_config: {},
    skip_git_repo_check: true,
  },
  "copilot-cli": {
    command_path: "copilot",
    sandbox_mode: "read-only",
    approval_policy: "never",
    web_search_enabled: false,
    network_access_enabled: false,
    model_reasoning_effort: "low",
    additional_directories: [],
    cli_env: {},
    copilot_config: {},
  },
  pi: {
    command_path: "pi",
    cli_env: {},
  },
  opencode: {
    command_path: "opencode",
    cli_env: {},
    opencode_config: {},
  },
  "claude-code": {
    command_path: "claude",
    cli_env: {},
    claude_code_config: {},
  },
};

export default class LocalJudgeProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "local-judge-provider";
  }

  async callApi(prompt, context, callOptions) {
    const delegate = this.buildDelegate();
    return delegate.callApi(prompt, context, callOptions);
  }

  buildDelegate() {
    const adapter = this.config.adapter;

    switch (adapter) {
      case "codex":
        return new CodexSystemProvider({
          config: {
            ...DEFAULTS.codex,
            ...normalizeBaseConfig(this.config),
            command_path: this.config.commandPath ?? this.config.command_path ?? DEFAULTS.codex.command_path,
            execution_method: this.config.executionMethod ?? this.config.execution_method ?? DEFAULTS.codex.execution_method,
            working_dir: this.config.workingDirectory ?? this.config.working_directory ?? process.cwd(),
            model: this.config.model,
            cli_env: this.config.cliEnv ?? this.config.cli_env ?? DEFAULTS.codex.cli_env,
            codex_config: this.config.codexConfig ?? this.config.codex_config ?? DEFAULTS.codex.codex_config,
            additional_directories:
              this.config.additionalDirectories
              ?? this.config.additional_directories
              ?? DEFAULTS.codex.additional_directories,
            sandbox_mode: this.config.sandboxMode ?? this.config.sandbox_mode ?? DEFAULTS.codex.sandbox_mode,
            approval_policy: this.config.approvalPolicy ?? this.config.approval_policy ?? DEFAULTS.codex.approval_policy,
            web_search_enabled:
              this.config.webSearchEnabled ?? this.config.web_search_enabled ?? DEFAULTS.codex.web_search_enabled,
            network_access_enabled:
              this.config.networkAccessEnabled
              ?? this.config.network_access_enabled
              ?? DEFAULTS.codex.network_access_enabled,
            model_reasoning_effort:
              this.config.modelReasoningEffort
              ?? this.config.model_reasoning_effort
              ?? DEFAULTS.codex.model_reasoning_effort,
            skip_git_repo_check:
              this.config.skipGitRepoCheck ?? this.config.skip_git_repo_check ?? DEFAULTS.codex.skip_git_repo_check,
          },
        });
      case "copilot-cli":
        return new CopilotSystemProvider({
          config: {
            ...DEFAULTS["copilot-cli"],
            ...normalizeBaseConfig(this.config),
            command_path:
              this.config.commandPath
              ?? this.config.command_path
              ?? DEFAULTS["copilot-cli"].command_path,
            working_dir: this.config.workingDirectory ?? this.config.working_directory ?? process.cwd(),
            model: this.config.model,
            cli_env: this.config.cliEnv ?? this.config.cli_env ?? DEFAULTS["copilot-cli"].cli_env,
            copilot_config:
              this.config.copilotConfig
              ?? this.config.copilot_config
              ?? DEFAULTS["copilot-cli"].copilot_config,
            additional_directories:
              this.config.additionalDirectories
              ?? this.config.additional_directories
              ?? DEFAULTS["copilot-cli"].additional_directories,
            sandbox_mode:
              this.config.sandboxMode
              ?? this.config.sandbox_mode
              ?? DEFAULTS["copilot-cli"].sandbox_mode,
            approval_policy:
              this.config.approvalPolicy
              ?? this.config.approval_policy
              ?? DEFAULTS["copilot-cli"].approval_policy,
            web_search_enabled:
              this.config.webSearchEnabled
              ?? this.config.web_search_enabled
              ?? DEFAULTS["copilot-cli"].web_search_enabled,
            network_access_enabled:
              this.config.networkAccessEnabled
              ?? this.config.network_access_enabled
              ?? DEFAULTS["copilot-cli"].network_access_enabled,
            model_reasoning_effort:
              this.config.modelReasoningEffort
              ?? this.config.model_reasoning_effort
              ?? DEFAULTS["copilot-cli"].model_reasoning_effort,
          },
        });
      case "pi":
        return new PiSystemProvider({
          config: {
            ...DEFAULTS.pi,
            ...normalizeBaseConfig(this.config),
            command_path: this.config.commandPath ?? this.config.command_path ?? DEFAULTS.pi.command_path,
            working_dir: this.config.workingDirectory ?? this.config.working_directory ?? process.cwd(),
            model: this.config.model,
            cli_env: this.config.cliEnv ?? this.config.cli_env ?? DEFAULTS.pi.cli_env,
          },
        });
      case "opencode":
        return new OpenCodeSystemProvider({
          config: {
            ...DEFAULTS.opencode,
            ...normalizeBaseConfig(this.config),
            command_path:
              this.config.commandPath
              ?? this.config.command_path
              ?? DEFAULTS.opencode.command_path,
            working_dir: this.config.workingDirectory ?? this.config.working_directory ?? process.cwd(),
            model: this.config.model,
            cli_env: this.config.cliEnv ?? this.config.cli_env ?? DEFAULTS.opencode.cli_env,
            agent: this.config.agent,
            allowed_skills: this.config.allowedSkills ?? this.config.allowed_skills,
            disable_other_skills:
              this.config.disableOtherSkills
              ?? this.config.disable_other_skills,
            opencode_config:
              this.config.opencodeConfig
              ?? this.config.opencode_config
              ?? DEFAULTS.opencode.opencode_config,
          },
        });
      case "claude-code":
        return new ClaudeCodeSystemProvider({
          config: {
            ...DEFAULTS["claude-code"],
            ...normalizeBaseConfig(this.config),
            command_path:
              this.config.commandPath
              ?? this.config.command_path
              ?? DEFAULTS["claude-code"].command_path,
            working_dir: this.config.workingDirectory ?? this.config.working_directory ?? process.cwd(),
            model: this.config.model,
            cli_env: this.config.cliEnv ?? this.config.cli_env ?? DEFAULTS["claude-code"].cli_env,
            sandbox_mode:
              this.config.sandboxMode
              ?? this.config.sandbox_mode,
            approval_policy:
              this.config.approvalPolicy
              ?? this.config.approval_policy,
            web_search_enabled:
              this.config.webSearchEnabled
              ?? this.config.web_search_enabled,
            network_access_enabled:
              this.config.networkAccessEnabled
              ?? this.config.network_access_enabled,
            model_reasoning_effort:
              this.config.modelReasoningEffort
              ?? this.config.model_reasoning_effort,
            additional_directories:
              this.config.additionalDirectories
              ?? this.config.additional_directories,
            agent: this.config.agent,
            enable_streaming:
              this.config.enableStreaming
              ?? this.config.enable_streaming,
            claude_code_config:
              this.config.claudeCodeConfig
              ?? this.config.claude_code_config
              ?? DEFAULTS["claude-code"].claude_code_config,
          },
        });
      default:
        throw new Error(`Unsupported local judge adapter "${String(adapter)}".`);
    }
  }
}

function normalizeBaseConfig(config) {
  return {
    provider_id: config.provider_id,
  };
}
