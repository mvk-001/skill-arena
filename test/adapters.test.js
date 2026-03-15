import test from "node:test";
import assert from "node:assert/strict";

import { buildPromptfooProvider, getAdapter } from "../src/adapters.js";

test("getAdapter returns registered adapters and rejects unknown ids", () => {
  assert.equal(getAdapter("codex").id, "codex");
  assert.equal(getAdapter("copilot-cli").id, "copilot-cli");
  assert.equal(getAdapter("pi").id, "pi");
  assert.throws(() => getAdapter("unknown"), /Unsupported adapter id "unknown"\./);
});

test("buildPromptfooProvider builds provider configs for codex, copilot-cli, and pi", () => {
  const context = {
    workspaceDirectory: "C:/temp/workspace",
    workspaceEnvironment: {
      BASE_FLAG: "1",
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
        cliEnv: { CODEX_FLAG: "1" },
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
        cliEnv: { COPILOT_FLAG: "1" },
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
        cliEnv: { PI_FLAG: "1" },
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
  assert.deepEqual(copilotProvider.config.additional_directories, ["fixtures"]);
  assert.equal(copilotProvider.config.cli_env.COPILOT_FLAG, "1");
  assert.equal(copilotProvider.config.copilot_config.agent, "terminal");

  assert.match(piProvider.id, /pi-system-provider\.js$/);
  assert.equal(piProvider.config.command_path, "pi");
  assert.equal(piProvider.config.cli_env.PI_FLAG, "1");
});
