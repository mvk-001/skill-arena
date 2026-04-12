import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import ClaudeCodeSystemProvider from "../src/providers/claude-code-system-provider.js";

test("claude-code provider builds CLI arguments and runtime settings", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-claude-code-config-"));
  await fs.mkdir(path.join(workingDirectory, "skills", "marker-guide"), { recursive: true });
  await fs.writeFile(path.join(workingDirectory, "skills", "marker-guide", "SKILL.md"), "---\nname: marker-guide\n---\n", "utf8");
  await fs.writeFile(path.join(workingDirectory, "AGENTS.md"), "# Shared instructions\n", "utf8");

  const provider = new ClaudeCodeSystemProvider({
    config: {
      command_path: "claude",
      model: "claude-sonnet-4-20250514",
      agent: "reviewer",
      working_dir: workingDirectory,
      sandbox_mode: "read-only",
      approval_policy: "never",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "medium",
      claude_code_config: {
        allowedTools: ["Read", "Grep"],
        settings: {
          env: {
            FROM_CONFIG: "1",
          },
        },
      },
    },
  });

  const runtimeLayout = await provider.prepareRuntimeLayout();
  const settingsContent = JSON.parse(await fs.readFile(runtimeLayout.runtimeSettingsPath, "utf8"));
  const mirroredSkill = await fs.readFile(
    path.join(workingDirectory, ".claude", "skills", "marker-guide", "SKILL.md"),
    "utf8",
  );
  const mirroredInstruction = await fs.readFile(path.join(workingDirectory, "CLAUDE.md"), "utf8");
  const args = provider.buildCommandArguments("Return HELLO.", runtimeLayout);

  assert.match(mirroredSkill, /marker-guide/);
  assert.match(mirroredInstruction, /Shared instructions/);
  assert.deepEqual(settingsContent.permissions.deny, ["Edit", "NotebookEdit", "Write", "WebSearch", "WebFetch"]);
  assert.equal(settingsContent.env.FROM_CONFIG, "1");
  assert.equal(settingsContent.sandbox.enabled, true);
  assert.deepEqual(args.slice(0, 6), ["-p", "Return HELLO.", "--output-format", "stream-json", "--no-session-persistence", "--model"]);
  assert.match(args.join(" "), /--agent reviewer/);
  assert.match(args.join(" "), /--allowedTools Read --allowedTools Grep/);
});

test("claude-code provider returns extracted output and writes an execution-event hook", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-claude-code-hook-"));
  const provider = new ClaudeCodeSystemProvider({
    config: {
      command_path: "claude",
      working_dir: workingDirectory,
      model: "claude-sonnet-4-20250514",
      approval_policy: "never",
    },
    spawnProcess: async () => ({
      stdout: [
        "{\"type\":\"tool_use\",\"tool_name\":\"Read\",\"input\":{\"file_path\":\"README.md\"}}",
        "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"FINAL-ANSWER\"}]}}",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return the marker.");
  const hook = response.metadata.executionEventHook;
  const payload = JSON.parse(await fs.readFile(hook.path, "utf8"));

  assert.equal(response.output, "FINAL-ANSWER");
  assert.equal(hook.eventCount, 2);
  assert.equal(hook.toolEventCount, 1);
  assert.equal(payload.adapter, "claude-code");
  assert.equal(payload.toolEvents[0].data.tool_name, "Read");
});

test("claude-code provider preserves explicit CLAUDE.md, reports failures, and avoids host env leaks", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-claude-code-json-"));
  await fs.writeFile(path.join(workingDirectory, "CLAUDE.md"), "# Existing Claude instructions\n", "utf8");
  await fs.writeFile(path.join(workingDirectory, "AGENTS.md"), "# Should not replace\n", "utf8");

  const provider = new ClaudeCodeSystemProvider({
    config: {
      command_path: "claude",
      working_dir: workingDirectory,
      model: "claude-sonnet-4-20250514",
      approval_policy: "on-request",
      cli_env: {
        HOME: "C:/isolated/home",
      },
    },
    spawnProcess: async () => ({
      stdout: "{\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"JSON-ANSWER\"}]}}",
      stderr: "",
      exitCode: 0,
    }),
  });

  const successResponse = await provider.callApi("Return the marker.");
  assert.equal(successResponse.output, "JSON-ANSWER");
  assert.match(await fs.readFile(path.join(workingDirectory, "CLAUDE.md"), "utf8"), /Existing Claude instructions/);
  assert.deepEqual(successResponse.metadata.unsupportedSettings, ["approvalPolicy"]);

  const previousHostLeak = process.env.SKILL_ARENA_HOST_LEAK;
  const previousPath = process.env.PATH;
  process.env.SKILL_ARENA_HOST_LEAK = "should-not-leak";
  process.env.PATH = "C:/tooling";

  try {
    const environment = provider.buildEnvironment();
    assert.equal(environment.SKILL_ARENA_HOST_LEAK, undefined);
    assert.equal(environment.PATH, "C:/tooling");
    assert.equal(environment.HOME, "C:/isolated/home");
    assert.equal(environment.CLAUDE_CONFIG_DIR, "C:\\isolated\\home\\.claude");
  } finally {
    if (previousHostLeak == null) {
      delete process.env.SKILL_ARENA_HOST_LEAK;
    } else {
      process.env.SKILL_ARENA_HOST_LEAK = previousHostLeak;
    }

    if (previousPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
  }

  const failingProvider = new ClaudeCodeSystemProvider({
    config: {
      command_path: "claude",
      working_dir: workingDirectory,
      model: "claude-sonnet-4-20250514",
      approval_policy: "never",
    },
    spawnProcess: async () => ({
      stdout: "",
      stderr: "failed",
      exitCode: 7,
    }),
  });

  const failureResponse = await failingProvider.callApi("Return the marker.");
  assert.equal(failureResponse.error, "failed");
});
