import test from "node:test";
import assert from "node:assert/strict";

import { buildPromptfooProvider, getAdapter } from "../src/adapters.js";

test("getAdapter returns registered adapters and rejects unknown ids", () => {
  assert.equal(getAdapter("codex").id, "codex");
  assert.equal(getAdapter("copilot-cli").id, "copilot-cli");
  assert.equal(getAdapter("pi").id, "pi");
  assert.equal(getAdapter("opencode").id, "opencode");
  assert.throws(() => getAdapter("unknown"), /Unsupported adapter id "unknown"\./);
});

test("buildPromptfooProvider builds provider configs for codex, copilot-cli, pi, and opencode", () => {
  const context = {
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {
      BASE_FLAG: "1",
    },
    isolatedEnvironment: {
      HOME: "C:/temp/home",
      CODEX_HOME: "C:/temp/codex-home",
    },
    gitReady: false,
  };

  const codexProvider = buildPromptfooProvider({
    ...context,
    scenario: {
      agent: {
        adapter: "codex",
        executionMethod: "command",
        commandPath: "codex",
        model: "gpt-5.1-codex-mini",
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: ["fixtures"],
        cliEnv: { CODEX_FLAG: "1", CODEX_HOME: "C:/should-not-win" },
        config: { profile: "bench" },
      },
      evaluation: {
        tracing: true,
      },
    },
  });

  const copilotProvider = buildPromptfooProvider({
    ...context,
    scenario: {
      agent: {
        adapter: "copilot-cli",
        commandPath: "copilot",
        model: "gpt-5",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        webSearchEnabled: true,
        networkAccessEnabled: true,
        reasoningEffort: "low",
        additionalDirectories: ["fixtures"],
        cliEnv: { COPILOT_FLAG: "1", HOME: "C:/should-not-win" },
        config: { agent: "terminal" },
      },
      evaluation: {
        tracing: false,
      },
    },
  });

  const piProvider = buildPromptfooProvider({
    ...context,
    scenario: {
      agent: {
        adapter: "pi",
        commandPath: "pi",
        model: "github-copilot/gpt-5-mini",
        cliEnv: { PI_FLAG: "1", HOME: "C:/should-not-win" },
      },
      evaluation: {
        tracing: false,
      },
    },
  });
  const opencodeProvider = buildPromptfooProvider({
    ...context,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            {
              agentId: "reviewer",
              source: {
                type: "inline-files",
                target: "/",
                files: [
                  {
                    path: ".opencode/agents/reviewer.md",
                    content: "# Reviewer",
                  },
                ],
              },
            },
          ],
        },
      },
      agent: {
        adapter: "opencode",
        commandPath: "opencode",
        model: "openai/gpt-5",
        cliEnv: { OPENCODE_FLAG: "1", HOME: "C:/should-not-win" },
        config: { provider: { openai: {} } },
      },
      evaluation: {
        tracing: false,
      },
    },
  });

  assert.match(codexProvider.id, /codex-system-provider\.js$/);
  assert.equal(codexProvider.config.skip_git_repo_check, true);
  assert.equal(codexProvider.config.additional_directories[0], "C:\\temp\\workspace\\fixtures");
  assert.equal(codexProvider.config.cli_env.CODEX_FLAG, "1");

  assert.match(copilotProvider.id, /copilot-system-provider\.js$/);
  assert.deepEqual(copilotProvider.config.additional_directories, ["C:\\temp\\workspace\\fixtures"]);
  assert.equal(copilotProvider.config.cli_env.COPILOT_FLAG, "1");
  assert.equal(copilotProvider.config.copilot_config.agent, "terminal");

  assert.match(piProvider.id, /pi-system-provider\.js$/);
  assert.equal(piProvider.config.command_path, "pi");
  assert.equal(piProvider.config.cli_env.PI_FLAG, "1");
  assert.equal(piProvider.config.cli_env.HOME, "C:/temp/home");
  assert.match(opencodeProvider.id, /opencode-system-provider\.js$/);
  assert.equal(opencodeProvider.config.command_path, "opencode");
  assert.equal(opencodeProvider.config.cli_env.OPENCODE_FLAG, "1");
  assert.equal(opencodeProvider.config.cli_env.HOME, "C:/temp/home");
  assert.equal(opencodeProvider.config.agent, "reviewer");
  assert.equal(codexProvider.config.cli_env.CODEX_HOME, "C:/temp/codex-home");
});

test("buildPromptfooProvider rejects additional directories outside the workspace", () => {
  assert.throws(() => buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    gitReady: true,
    scenario: {
      agent: {
        adapter: "codex",
        executionMethod: "command",
        commandPath: "codex",
        additionalDirectories: ["../outside"],
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        cliEnv: {},
        config: {},
      },
      evaluation: {
        tracing: false,
      },
    },
  }), /Additional directory escapes the workspace root/);
});

test("buildPromptfooProvider maps compare profile agents into copilot config", () => {
  const provider = buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            {
              agentId: "reviewer-agent",
              source: {
                type: "inline-files",
                target: "/",
                files: [
                  {
                    path: ".github/agents/reviewer-agent.agent.md",
                    content: "---\ndescription: Reviewer agent\n---\n\n# Reviewer agent",
                  },
                ],
              },
            },
          ],
        },
      },
      agent: {
        adapter: "copilot-cli",
        commandPath: "copilot",
        model: "gpt-5",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: [],
        cliEnv: {},
        config: {},
      },
      evaluation: {
        tracing: false,
      },
    },
  });

  assert.equal(provider.config.copilot_config.agent, "reviewer-agent");
});

test("buildPromptfooProvider rejects copilot compare profiles with multiple agents", () => {
  assert.throws(() => buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            { agentId: "reviewer-a", source: { type: "empty" } },
            { agentId: "reviewer-b", source: { type: "empty" } },
          ],
        },
      },
      agent: {
        adapter: "copilot-cli",
        commandPath: "copilot",
        model: "gpt-5",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: [],
        cliEnv: {},
        config: {},
      },
      evaluation: {
        tracing: false,
      },
    },
  }), /supports at most one compare profile agent/);
});

test("buildPromptfooProvider rejects copilot compare agents without agentId", () => {
  assert.throws(() => buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            {
              source: {
                type: "inline-files",
                target: "/",
                files: [
                  {
                    path: ".github/agents/reviewer.agent.md",
                    content: "---\ndescription: Reviewer agent\n---\n\n# Reviewer agent",
                  },
                ],
              },
            },
          ],
        },
      },
      agent: {
        adapter: "copilot-cli",
        commandPath: "copilot",
        model: "gpt-5",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: [],
        cliEnv: {},
        config: {},
      },
      evaluation: {
        tracing: false,
      },
    },
  }), /requires profile\.capabilities\.agents\[\*\]\.agentId/);
});

test("buildPromptfooProvider interpolates $WORKSPACE in workspace env, cliEnv, and isolated env values", () => {
  const provider = buildPromptfooProvider({
    workspaceDirectory: "C:/runs/workspace-42",
    workspaceEnvironment: {
      MY_CONFIG: "$WORKSPACE/config/settings.json",
      PLAIN_VAR: "no-placeholder",
    },
    isolatedEnvironment: {
      ISOLATED_PATH: "${WORKSPACE}/isolated/path",
    },
    gitReady: true,
    scenario: {
      agent: {
        adapter: "codex",
        executionMethod: "command",
        commandPath: "codex",
        model: "gpt-5.1-codex-mini",
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: [],
        cliEnv: {
          CLI_PATH: "$WORKSPACE/bin/tool",
          MULTI: "$WORKSPACE/a:$WORKSPACE/b",
        },
        config: {},
      },
      evaluation: {
        tracing: false,
      },
    },
  });

  const env = provider.config.cli_env;

  // workspace.setup.env values
  assert.equal(env.MY_CONFIG, "C:/runs/workspace-42/config/settings.json");
  assert.equal(env.PLAIN_VAR, "no-placeholder");

  // scenario.agent.cliEnv values
  assert.equal(env.CLI_PATH, "C:/runs/workspace-42/bin/tool");
  assert.equal(env.MULTI, "C:/runs/workspace-42/a:C:/runs/workspace-42/b");

  // isolated env with ${WORKSPACE} brace form
  assert.equal(env.ISOLATED_PATH, "C:/runs/workspace-42/isolated/path");
});

test("buildPromptfooProvider interpolates $WORKSPACE for copilot-cli and pi adapters", () => {
  const baseContext = {
    workspaceDirectory: "/tmp/ws",
    workspaceEnvironment: {
      DATA_DIR: "$WORKSPACE/data",
    },
    isolatedEnvironment: {},
    gitReady: true,
  };

  const copilotProvider = buildPromptfooProvider({
    ...baseContext,
    scenario: {
      agent: {
        adapter: "copilot-cli",
        commandPath: "copilot",
        model: "gpt-5",
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchEnabled: false,
        networkAccessEnabled: false,
        reasoningEffort: "low",
        additionalDirectories: [],
        cliEnv: { TOOL_PATH: "${WORKSPACE}/tools/lint" },
        config: {},
      },
      evaluation: { tracing: false },
    },
  });

  const piProvider = buildPromptfooProvider({
    ...baseContext,
    scenario: {
      agent: {
        adapter: "pi",
        commandPath: "pi",
        model: "github-copilot/gpt-5-mini",
        cliEnv: { SCRIPT: "$WORKSPACE/run.sh" },
      },
      evaluation: { tracing: false },
    },
  });

  assert.equal(copilotProvider.config.cli_env.DATA_DIR, "/tmp/ws/data");
  assert.equal(copilotProvider.config.cli_env.TOOL_PATH, "/tmp/ws/tools/lint");
  assert.equal(piProvider.config.cli_env.DATA_DIR, "/tmp/ws/data");
  assert.equal(piProvider.config.cli_env.SCRIPT, "/tmp/ws/run.sh");
});

test("buildPromptfooProvider interpolates $WORKSPACE for opencode adapter", () => {
  const provider = buildPromptfooProvider({
    workspaceDirectory: "/tmp/ws",
    workspaceEnvironment: {
      DATA_DIR: "$WORKSPACE/data",
    },
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      agent: {
        adapter: "opencode",
        commandPath: "opencode",
        model: "openai/gpt-5",
        cliEnv: { SCRIPT: "${WORKSPACE}/run.sh" },
        config: {},
      },
      evaluation: { tracing: false },
    },
  });

  assert.equal(provider.config.cli_env.DATA_DIR, "/tmp/ws/data");
  assert.equal(provider.config.cli_env.SCRIPT, "/tmp/ws/run.sh");
});

test("buildPromptfooProvider omits opencode agent when no compare profile agent is declared", () => {
  const provider = buildPromptfooProvider({
    workspaceDirectory: "/tmp/ws",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      agent: {
        adapter: "opencode",
        commandPath: "opencode",
        model: "openai/gpt-5",
        cliEnv: {},
        config: {},
      },
      evaluation: { tracing: false },
    },
  });

  assert.equal(provider.config.agent, undefined);
});

test("buildPromptfooProvider rejects invalid opencode compare profile agents", () => {
  assert.throws(() => buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            { agentId: "one", source: { type: "empty" } },
            { agentId: "two", source: { type: "empty" } },
          ],
        },
      },
      agent: {
        adapter: "opencode",
        commandPath: "opencode",
        model: "openai/gpt-5",
        cliEnv: {},
        config: {},
      },
      evaluation: { tracing: false },
    },
  }), /supports at most one compare profile agent/);

  assert.throws(() => buildPromptfooProvider({
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {},
    isolatedEnvironment: {},
    gitReady: true,
    scenario: {
      profile: {
        capabilities: {
          agents: [
            {
              source: {
                type: "inline-files",
                target: "/",
                files: [{ path: ".opencode/agents/reviewer.md", content: "# Reviewer" }],
              },
            },
          ],
        },
      },
      agent: {
        adapter: "opencode",
        commandPath: "opencode",
        model: "openai/gpt-5",
        cliEnv: {},
        config: {},
      },
      evaluation: { tracing: false },
    },
  }), /requires profile\.capabilities\.agents\[\*\]\.agentId/);
});
