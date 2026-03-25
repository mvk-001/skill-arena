import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import CopilotSystemProvider from "../src/providers/copilot-system-provider.js";

test("copilot provider builds best-effort CLI arguments", () => {
  const provider = new CopilotSystemProvider({
    config: {
      command_path: "copilot",
      model: "gpt-5",
      working_dir: "C:/temp/workspace",
      approval_policy: "never",
      sandbox_mode: "danger-full-access",
      network_access_enabled: true,
      web_search_enabled: false,
      additional_directories: ["fixtures", "skills"],
      copilot_config: {
        agent: "vscode",
        allowTool: ["editor", "terminal"],
        denyTool: ["browser"],
        allowUrl: ["https://api.github.com/*"],
        share: true,
      },
    },
  });

  const args = provider.buildCommandArguments("Return HELLO.");

  assert.deepEqual(args, [
    "-p",
    "Return HELLO.",
    "--output-format",
    "json",
    "--no-color",
    "--model",
    "gpt-5",
    "--agent",
    "vscode",
    "--allow-all-tools",
    "--allow-all-urls",
    "--allow-all-paths",
    "--no-ask-user",
    "--add-dir",
    "C:\\temp\\workspace\\fixtures",
    "--add-dir",
    "C:\\temp\\workspace\\skills",
    "--allow-tool",
    "editor",
    "--allow-tool",
    "terminal",
    "--deny-tool",
    "browser",
    "--allow",
    "https://api.github.com/*",
    "--share",
  ]);
});

test("copilot provider returns trimmed output on success", async () => {
  const isolatedHome = path.join(os.tmpdir(), "skill-arena-copilot-home");
  const provider = new CopilotSystemProvider({
    config: {
      command_path: "copilot",
      working_dir: "C:/temp/workspace",
      cli_env: {
        SAMPLE_FLAG: "1",
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
      },
    },
    spawnProcess: async (options) => {
      assert.equal(options.command, "copilot");
      assert.equal(options.cwd, "C:/temp/workspace");
      assert.equal(options.env.SAMPLE_FLAG, "1");
      assert.equal(options.env.HOME, isolatedHome);
      assert.equal(options.env.USERPROFILE, isolatedHome);
      return {
        stdout: "ALPHA-42\n",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return the marker.");

  assert.equal(response.output, "ALPHA-42");
  assert.equal(response.metadata.backend, "command");
  assert.equal(response.metadata.commandPath, "copilot");
  assert.equal(response.metadata.executionEventHook.eventCount, 0);
});

test("copilot provider falls back to message extracted from JSON lines", async () => {
  const provider = new CopilotSystemProvider({
    config: {
      command_path: "copilot",
      working_dir: "C:/temp/workspace",
    },
    spawnProcess: async () => ({
      stdout: [
        "{\"type\":\"assistant.message\",\"data\":{\"content\":\"thinking\"}}",
        "{\"type\":\"assistant.message\",\"data\":{\"content\":\"FINAL-ANSWER\"}}",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "FINAL-ANSWER");
});

test("copilot provider returns stderr on command failure", async () => {
  const provider = new CopilotSystemProvider({
    config: {
      command_path: "copilot",
      working_dir: "C:/temp/workspace",
      model_reasoning_effort: "low",
      sandbox_mode: "read-only",
      web_search_enabled: false,
    },
    spawnProcess: async () => ({
      stdout: "",
      stderr: "copilot executable not found",
      exitCode: 1,
    }),
  });

  const response = await provider.callApi("Return the marker.");

  assert.equal(response.error, "copilot executable not found");
  assert.equal(response.metadata.commandPath, "copilot");
  assert.deepEqual(response.metadata.unsupportedSettings, [
    "reasoningEffort",
    "sandboxMode",
    "webSearchEnabled",
  ]);
});

test("copilot provider exposes ids, trims fallback fields, and handles empty output", async () => {
  const provider = new CopilotSystemProvider({
    id: "custom-id",
    config: {
      working_dir: "C:/temp/workspace",
      copilot_config: {
        denyTool: ["browser", "", 1],
        extraContext: ["GITHUB_TOKEN"],
      },
    },
    spawnProcess: async () => ({
      stdout: [
        "{\"message\":\" first \"}",
        "{\"content\":\" second \"}",
        "{\"text\":\" third \"}",
        "{\"output\":\" final output \"}",
      ].join("\n"),
      stderr: "warn\n",
      exitCode: 0,
    }),
  });

  assert.equal(provider.id(), "custom-id");
  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "-p",
    "Return HELLO.",
    "--output-format",
    "json",
    "--no-color",
    "--no-ask-user",
    "--deny-tool",
    "browser",
    "--context",
    "GITHUB_TOKEN",
  ]);

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "final output");
  assert.equal(response.metadata.stderr, "warn");

  const emptyOutputProvider = new CopilotSystemProvider({
    config: {
      working_dir: "C:/temp/workspace",
    },
    spawnProcess: async () => ({
      stdout: "   ",
      stderr: "",
      exitCode: 0,
    }),
  });

  const emptyResponse = await emptyOutputProvider.callApi("Return the marker.");
  assert.equal(emptyResponse.output, "");
});

test("copilot provider executes a PATH-resolved Windows command and normalizes prompt whitespace", {
  skip: process.platform !== "win32",
}, async () => {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "skill-arena-copilot-provider-"),
  );

  try {
    const commandName = "skill-arena-test-copilot";
    const commandPath = path.join(tempDirectory, `${commandName}.cmd`);
    await fs.writeFile(
      commandPath,
      [
        "@echo off",
        "setlocal",
        "set \"PROMPT=%~2\"",
        "echo {\"type\":\"assistant.message\",\"data\":{\"content\":\"%PROMPT%\"}}",
      ].join("\r\n"),
      "utf8",
    );

    const provider = new CopilotSystemProvider({
      config: {
        command_path: commandName,
        working_dir: tempDirectory,
        cli_env: {
          Path: `${tempDirectory}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}`,
        },
      },
    });

    const response = await provider.callApi(" first \n second \t third ");
    assert.equal(response.output, "first second third");
    assert.equal(response.metadata.commandPath, commandName);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("copilot provider executes an absolute Windows command path and falls back to stdout on failure", {
  skip: process.platform !== "win32",
}, async () => {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "skill-arena-copilot-provider-fail-"),
  );

  try {
    const commandPath = path.join(tempDirectory, "copilot-fail.cmd");
    await fs.writeFile(
      commandPath,
      [
        "@echo off",
        "echo command failed from stdout",
        "exit /b 7",
      ].join("\r\n"),
      "utf8",
    );

    const provider = new CopilotSystemProvider({
      config: {
        command_path: commandPath,
        working_dir: tempDirectory,
      },
    });

    const response = await provider.callApi("Return the marker.");
    assert.equal(response.error, "command failed from stdout");
    assert.equal(response.metadata.commandPath, commandPath);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("copilot provider writes an execution-event hook artifact", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-copilot-hook-"));
  const provider = new CopilotSystemProvider({
    config: {
      command_path: "copilot",
      working_dir: workingDirectory,
    },
    spawnProcess: async () => ({
      stdout: [
        "{\"type\":\"assistant.message\",\"data\":{\"content\":\"FINAL\"}}",
        "{\"type\":\"tool.call\",\"data\":{\"toolName\":\"editor\"}}",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return the marker.");
  const hook = response.metadata.executionEventHook;
  const payload = JSON.parse(await fs.readFile(hook.path, "utf8"));

  assert.equal(hook.eventCount, 2);
  assert.equal(hook.toolEventCount, 1);
  assert.equal(payload.adapter, "copilot-cli");
  assert.equal(payload.toolEvents[0].type, "tool.call");
});
