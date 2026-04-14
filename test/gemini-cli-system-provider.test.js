import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import GeminiCliSystemProvider from "../src/providers/gemini-cli-system-provider.js";

test("gemini-cli provider builds CLI arguments with model, approval mode, sandbox, and directories", () => {
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      model: "gemini-2.5-pro",
      working_dir: "C:/temp/workspace",
      approval_policy: "never",
      sandbox_mode: "workspace-write",
      additional_directories: ["fixtures", "skills"],
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "-p",
    "Return HELLO.",
    "--output-format",
    "stream-json",
    "--model",
    "gemini-2.5-pro",
    "--approval-mode",
    "yolo",
    "--sandbox",
    "--include-directories",
    "C:\\temp\\workspace\\fixtures",
    "--include-directories",
    "C:\\temp\\workspace\\skills",
  ]);
});

test("gemini-cli provider omits optional CLI arguments when not needed", () => {
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: "C:/temp/workspace",
      sandbox_mode: "danger-full-access",
      approval_policy: "untrusted",
      additional_directories: [],
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "-p",
    "Return HELLO.",
    "--output-format",
    "stream-json",
  ]);
});

test("gemini-cli provider mirrors skills and AGENTS instructions into Gemini layout", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-layout-"));
  await fs.mkdir(path.join(workingDirectory, "skills", "marker-guide"), { recursive: true });
  await fs.mkdir(path.join(workingDirectory, ".gemini"), { recursive: true });
  await fs.writeFile(path.join(workingDirectory, ".gemini", "settings.json"), JSON.stringify({
    output: {
      format: "text",
    },
    ui: {
      theme: "light",
    },
  }, null, 2), "utf8");
  await fs.writeFile(path.join(workingDirectory, "skills", "marker-guide", "SKILL.md"), "---\nname: marker-guide\n---\n", "utf8");
  await fs.writeFile(path.join(workingDirectory, "AGENTS.md"), "# Shared instructions\n", "utf8");

  const provider = new GeminiCliSystemProvider({
    config: {
      working_dir: workingDirectory,
      gemini_cli_config: {
        settings: {
          general: {
            vimMode: true,
          },
        },
      },
    },
  });

  const runtimeLayout = await provider.prepareRuntimeLayout();
  const settingsContent = JSON.parse(await fs.readFile(runtimeLayout.projectSettingsPath, "utf8"));
  const mirroredSkill = await fs.readFile(
    path.join(workingDirectory, ".gemini", "skills", "marker-guide", "SKILL.md"),
    "utf8",
  );
  const mirroredInstruction = await fs.readFile(path.join(workingDirectory, "GEMINI.md"), "utf8");

  assert.match(mirroredSkill, /marker-guide/);
  assert.match(mirroredInstruction, /Shared instructions/);
  assert.equal(settingsContent.general.vimMode, true);
  assert.equal(settingsContent.general.enableAutoUpdate, false);
  assert.equal(settingsContent.admin.extensions.enabled, false);
  assert.equal(settingsContent.admin.mcp.enabled, false);
  assert.equal(settingsContent.hooksConfig.enabled, false);
  assert.equal(settingsContent.ui.theme, "light");
  assert.equal(settingsContent.output.format, "json");
  assert.equal(runtimeLayout.environment.GEMINI_CLI_SYSTEM_SETTINGS_PATH.endsWith("system-settings.json"), true);
});

test("gemini-cli provider returns extracted output and writes an execution-event hook", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-hook-"));
  const isolatedHome = path.join(workingDirectory, "home");
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      cli_env: {
        HOME: isolatedHome,
      },
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.HOME, isolatedHome);
      assert.equal(options.env.USERPROFILE, isolatedHome);
      assert.equal(options.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH.endsWith("system-settings.json"), true);
      return {
        stdout: [
          "{\"type\":\"tool_use\",\"toolName\":\"run_shell_command\"}",
          "{\"type\":\"result\",\"response\":\"FINAL-ANSWER\"}",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return the marker.");
  const hook = response.metadata.executionEventHook;
  const payload = JSON.parse(await fs.readFile(hook.path, "utf8"));

  assert.equal(response.output, "FINAL-ANSWER");
  assert.equal(hook.eventCount, 2);
  assert.equal(payload.adapter, "gemini-cli");
});

test("gemini-cli provider prepends the configured skill activation preamble", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-prompt-"));
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      prompt_preamble: "Skill activation: use activate_skill for marker-guide.",
    },
    spawnProcess: async (options) => {
      assert.equal(options.promptText, "Skill activation: use activate_skill for marker-guide.\n\nTask:\nReturn HELLO.");
      return {
        stdout: "{\"response\":\"DONE\"}",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return HELLO.");
  assert.equal(response.output, "DONE");
});

test("gemini-cli provider extracts nested stream-json content and preserves explicit user profile", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-nested-"));
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      strict_runtime_isolation: false,
      cli_env: {
        HOME: "C:/isolated/home",
        USERPROFILE: "C:/custom/profile",
      },
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.USERPROFILE, "C:/custom/profile");
      return {
        stdout: [
          "{\"type\":\"message\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"NESTED-ANSWER\"}]}}",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "NESTED-ANSWER");
});

test("gemini-cli provider keeps explicit GEMINI.md and handles plain text fallback output", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-fallback-"));
  await fs.writeFile(path.join(workingDirectory, "GEMINI.md"), "# Existing Gemini instructions\n", "utf8");

  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      approval_policy: "on-request",
    },
    spawnProcess: async () => ({
      stdout: "plain-text-output",
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "plain-text-output");
  assert.match(await fs.readFile(path.join(workingDirectory, "GEMINI.md"), "utf8"), /Existing Gemini instructions/);
});

test("gemini-cli provider extracts result.text from non-stream JSON output", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-result-text-"));
  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      approval_policy: "on-request",
    },
    spawnProcess: async () => ({
      stdout: "{\"result\":{\"text\":\"RESULT-TEXT\"}}",
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "RESULT-TEXT");
});

test("gemini-cli provider preserves explicit GEMINI.md, reports failures, and tracks unsupported settings", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-gemini-cli-json-"));
  await fs.writeFile(path.join(workingDirectory, "GEMINI.md"), "# Existing Gemini instructions\n", "utf8");
  await fs.writeFile(path.join(workingDirectory, "AGENTS.md"), "# Should not replace\n", "utf8");

  const provider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      model: "gemini-2.5-pro",
      approval_policy: "on-request",
      sandbox_mode: "danger-full-access",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "low",
    },
    spawnProcess: async () => ({
      stdout: "{\"response\":\"JSON-ANSWER\"}",
      stderr: "",
      exitCode: 0,
    }),
  });

  const successResponse = await provider.callApi("Return the marker.");
  assert.equal(successResponse.output, "JSON-ANSWER");
  assert.match(await fs.readFile(path.join(workingDirectory, "GEMINI.md"), "utf8"), /Existing Gemini instructions/);
  assert.deepEqual(successResponse.metadata.unsupportedSettings, [
    "webSearchEnabled",
    "networkAccessEnabled",
    "reasoningEffort",
  ]);

  const failingProvider = new GeminiCliSystemProvider({
    config: {
      command_path: "gemini",
      working_dir: workingDirectory,
      approval_policy: "on-failure",
      sandbox_mode: "read-only",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "low",
    },
    spawnProcess: async () => ({
      stdout: "",
      stderr: "failed",
      exitCode: 7,
    }),
  });

  const failureResponse = await failingProvider.callApi("Return the marker.");
  assert.equal(failureResponse.error, "failed");
  assert.deepEqual(failureResponse.metadata.unsupportedSettings, [
    "approvalPolicy",
    "sandboxMode",
    "webSearchEnabled",
    "networkAccessEnabled",
    "reasoningEffort",
  ]);
});
