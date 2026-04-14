import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import OpenCodeSystemProvider from "../src/providers/opencode-system-provider.js";

test("opencode provider builds CLI arguments with model and agent", () => {
  const provider = new OpenCodeSystemProvider({
    config: {
      command_path: "opencode",
      model: "anthropic/claude-sonnet-4-5",
      agent: "reviewer",
      working_dir: "C:/temp/workspace",
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "run",
    "--format",
    "json",
    "--pure",
    "--model",
    "anthropic/claude-sonnet-4-5",
    "--agent",
    "reviewer",
    "Return HELLO.",
  ]);
});

test("opencode provider mirrors allowed skills and AGENTS instructions into runtime config", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-opencode-config-"));
  await fs.mkdir(path.join(workingDirectory, "skills", "marker-guide"), { recursive: true });
  await fs.writeFile(path.join(workingDirectory, "skills", "marker-guide", "SKILL.md"), "---\nname: marker-guide\n---\n", "utf8");
  await fs.writeFile(path.join(workingDirectory, "AGENTS.md"), "# Project instructions\n", "utf8");

  const provider = new OpenCodeSystemProvider({
    config: {
      working_dir: workingDirectory,
      allowed_skills: ["marker-guide"],
      opencode_config: {
        model: "openai/gpt-5",
      },
    },
  });

  const runtimeConfig = await provider.prepareRuntimeConfig();
  const copiedSkill = await fs.readFile(
    path.join(runtimeConfig.configDirectory, "skills", "marker-guide", "SKILL.md"),
    "utf8",
  );
  const configContent = JSON.parse(runtimeConfig.environment.OPENCODE_CONFIG_CONTENT);

  assert.match(copiedSkill, /marker-guide/);
  assert.deepEqual(configContent.instructions, ["AGENTS.md"]);
  assert.equal(configContent.model, "openai/gpt-5");
});

test("opencode provider can disable strict isolation behavior explicitly", () => {
  const provider = new OpenCodeSystemProvider({
    config: {
      working_dir: "C:/temp/workspace",
      strict_runtime_isolation: false,
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "run",
    "--format",
    "json",
    "Return HELLO.",
  ]);
});

test("opencode provider returns extracted output and writes an execution-event hook", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-opencode-hook-"));
  const provider = new OpenCodeSystemProvider({
    config: {
      command_path: "opencode",
      working_dir: workingDirectory,
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.OPENCODE_CONFIG_DIR.endsWith(path.join(".skill-arena", "opencode-config")), true);
      return {
        stdout: [
          "{\"type\":\"tool.call\",\"toolName\":\"bash\"}",
          "{\"type\":\"assistant.message\",\"content\":\"FINAL-ANSWER\"}",
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
  assert.equal(hook.toolEventCount, 1);
  assert.equal(payload.adapter, "opencode");
  assert.equal(payload.toolEvents[0].data.toolName, "bash");
});

test("opencode provider prepends the configured skill activation preamble", async () => {
  const provider = new OpenCodeSystemProvider({
    config: {
      command_path: "opencode",
      working_dir: "C:/temp/workspace",
      prompt_preamble: "Skill activation: load marker-guide.",
    },
    spawnProcess: async (options) => {
      assert.equal(options.promptText, "Skill activation: load marker-guide.\n\nTask:\nReturn HELLO.");
      return {
        stdout: "{\"message\":\"DONE\"}",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return HELLO.");
  assert.equal(response.output, "DONE");
});

test("opencode provider preserves explicit instructions config, handles plain JSON output, and reports failures", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-opencode-json-"));
  const provider = new OpenCodeSystemProvider({
    config: {
      command_path: "opencode",
      working_dir: workingDirectory,
      sandbox_mode: "read-only",
      approval_policy: "never",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "low",
      opencode_config: {
        instructions: ["docs/custom.md"],
      },
    },
    spawnProcess: async () => ({
      stdout: "{\"result\":{\"text\":\"JSON-ANSWER\"}}",
      stderr: "",
      exitCode: 0,
    }),
  });

  const runtimeConfig = await provider.prepareRuntimeConfig();
  assert.deepEqual(
    JSON.parse(runtimeConfig.environment.OPENCODE_CONFIG_CONTENT).instructions,
    ["docs/custom.md"],
  );

  const successResponse = await provider.callApi("Return the marker.");
  assert.equal(successResponse.output, "JSON-ANSWER");

  const failingProvider = new OpenCodeSystemProvider({
    config: {
      command_path: "opencode",
      working_dir: workingDirectory,
      sandbox_mode: "read-only",
      approval_policy: "never",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "low",
    },
    spawnProcess: async () => ({
      stdout: "command failed from stdout",
      stderr: "",
      exitCode: 7,
    }),
  });

  const failureResponse = await failingProvider.callApi("Return the marker.");
  assert.equal(failureResponse.error, "command failed from stdout");
  assert.deepEqual(failureResponse.metadata.unsupportedSettings, [
    "sandboxMode",
    "approvalPolicy",
    "webSearchEnabled",
    "networkAccessEnabled",
    "reasoningEffort",
  ]);
});

test("opencode provider does not inherit arbitrary host environment variables", () => {
  const previousHostLeak = process.env.SKILL_ARENA_HOST_LEAK;
  const previousPath = process.env.PATH;
  process.env.SKILL_ARENA_HOST_LEAK = "should-not-leak";
  process.env.PATH = "C:/tooling";

  try {
    const provider = new OpenCodeSystemProvider({
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
