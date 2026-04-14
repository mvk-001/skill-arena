import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import CodexSystemProvider from "../src/providers/codex-system-provider.js";

test("codex provider forwards isolated home variables into the CLI environment", async () => {
  const isolatedHome = path.join(os.tmpdir(), "skill-arena-codex-home");
  const provider = new CodexSystemProvider({
    config: {
      command_path: "codex",
      working_dir: "C:/temp/workspace",
      sandbox_mode: "read-only",
      approval_policy: "never",
      network_access_enabled: false,
      cli_env: {
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
        CODEX_HOME: path.join(isolatedHome, ".codex"),
        SKILL_ARENA_ALLOWED_SKILLS: "marker-guide",
      },
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.HOME, isolatedHome);
      assert.equal(options.env.USERPROFILE, isolatedHome);
      assert.equal(options.env.CODEX_HOME, path.join(isolatedHome, ".codex"));
      assert.equal(options.env.SKILL_ARENA_ALLOWED_SKILLS, "marker-guide");

      return {
        stdout: "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return HELLO.");
  assert.equal(response.output, "");
  assert.equal(response.metadata.backend, "command");
});

test("codex provider prepends the configured skill activation preamble", async () => {
  const provider = new CodexSystemProvider({
    config: {
      command_path: "codex",
      working_dir: "C:/temp/workspace",
      sandbox_mode: "read-only",
      approval_policy: "never",
      network_access_enabled: false,
      prompt_preamble: "Skill activation: use $marker-guide.",
    },
    spawnProcess: async (options) => {
      assert.match(options.stdinText, /^Skill activation: use \$marker-guide\./);
      assert.match(options.stdinText, /\n\nTask:\nReturn HELLO\./);
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  await provider.callApi("Return HELLO.");
});

test("codex provider builds command arguments with the isolated working directory", () => {
  const provider = new CodexSystemProvider({
    config: {
      command_path: "codex",
      working_dir: "C:/temp/workspace",
      sandbox_mode: "read-only",
      approval_policy: "never",
      network_access_enabled: false,
      web_search_enabled: false,
      additional_directories: ["C:/temp/workspace/skills"],
      model_reasoning_effort: "low",
    },
  });

  const args = provider.buildCommandArguments("C:/temp/output.txt");
  assert.deepEqual(args, [
    "exec",
    "--json",
    "--color",
    "never",
    "--output-last-message",
    "C:/temp/output.txt",
    "--cd",
    "C:/temp/workspace",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--add-dir",
    "C:/temp/workspace/skills",
    "--config",
    "model_reasoning_effort=\"low\"",
    "--config",
    "approval_policy=\"never\"",
    "-",
  ]);
});

test("codex provider writes an execution-event hook artifact", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-codex-hook-"));
  const provider = new CodexSystemProvider({
    config: {
      command_path: "codex",
      working_dir: workingDirectory,
      sandbox_mode: "read-only",
      approval_policy: "never",
      network_access_enabled: false,
    },
    spawnProcess: async () => ({
      stdout: [
        "{\"type\":\"exec.command.started\",\"command\":\"npm test\"}",
        "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":2}}",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    }),
  });

  const response = await provider.callApi("Return HELLO.");
  const hook = response.metadata.executionEventHook;
  const payload = JSON.parse(await fs.readFile(hook.path, "utf8"));

  assert.equal(hook.eventCount, 2);
  assert.equal(hook.toolEventCount, 1);
  assert.equal(payload.adapter, "codex");
  assert.equal(payload.toolEvents[0].data.command, "npm test");
});

test("codex provider does not inherit arbitrary host environment variables", () => {
  const previousHostLeak = process.env.SKILL_ARENA_HOST_LEAK;
  const previousPath = process.env.PATH;
  process.env.SKILL_ARENA_HOST_LEAK = "should-not-leak";
  process.env.PATH = "C:/tooling";

  try {
    const provider = new CodexSystemProvider({
      config: {
        working_dir: "C:/temp/workspace",
        cli_env: {
          HOME: "C:/isolated/home",
        },
      },
    });

    const environment = provider.buildEnvironment();
    assert.equal(environment.SKILL_ARENA_HOST_LEAK, undefined);
    assert.equal(environment.PATH, "C:/tooling");
    assert.equal(environment.HOME, "C:/isolated/home");
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
});
