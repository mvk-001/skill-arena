import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import AntigravityCliSystemProvider from "../src/providers/antigravity-cli-system-provider.js";

test("antigravity-cli provider builds print-mode arguments and supported controls", () => {
  const provider = new AntigravityCliSystemProvider({
    config: {
      command_path: "agy",
      model: "Gemini 3.5 Flash (Low)",
      working_dir: "C:/temp/workspace",
      approval_policy: "never",
      sandbox_mode: "workspace-write",
      additional_directories: ["fixtures", "skills"],
      antigravity_cli_config: {
        printTimeout: "10m",
        project: "demo-project",
        newProject: true,
        extraArgs: ["--log-file", "agy.log"],
      },
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "--print",
    "Return HELLO.",
    "--model",
    "Gemini 3.5 Flash (Low)",
    "--sandbox",
    "--dangerously-skip-permissions",
    "--print-timeout",
    "10m",
    "--project",
    "demo-project",
    "--new-project",
    "--add-dir",
    "C:\\temp\\workspace\\fixtures",
    "--add-dir",
    "C:\\temp\\workspace\\skills",
    "--log-file",
    "agy.log",
  ]);
});

test("antigravity-cli provider omits autonomous and sandbox flags when not requested", () => {
  const provider = new AntigravityCliSystemProvider({
    config: {
      working_dir: "C:/temp/workspace",
      approval_policy: "on-request",
      sandbox_mode: "danger-full-access",
      antigravity_cli_config: { extraArgs: [null, ""] },
    },
  });

  assert.deepEqual(provider.buildCommandArguments("Return HELLO."), [
    "--print",
    "Return HELLO.",
  ]);
});

test("antigravity-cli provider mirrors generic skills and writes isolated settings", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-layout-"));
  const isolatedHome = path.join(workingDirectory, "home");
  await fs.mkdir(path.join(workingDirectory, "skills", "marker-guide"), { recursive: true });
  await fs.writeFile(
    path.join(workingDirectory, "skills", "marker-guide", "SKILL.md"),
    "---\nname: marker-guide\ndescription: Return markers.\n---\n",
    "utf8",
  );

  const provider = new AntigravityCliSystemProvider({
    config: {
      working_dir: workingDirectory,
      cli_env: { HOME: isolatedHome },
      antigravity_cli_config: {
        settings: { colorScheme: "light", enableTelemetry: true },
      },
    },
  });

  const runtimeLayout = await provider.prepareRuntimeLayout();
  const settings = JSON.parse(await fs.readFile(runtimeLayout.settingsPath, "utf8"));
  const mirroredSkill = await fs.readFile(
    path.join(workingDirectory, ".agents", "skills", "marker-guide", "SKILL.md"),
    "utf8",
  );

  assert.match(mirroredSkill, /marker-guide/);
  assert.deepEqual(runtimeLayout.mirroredSkills, [".agents/skills/marker-guide"]);
  assert.equal(runtimeLayout.settingsPath, path.join(isolatedHome, ".gemini", "antigravity-cli", "settings.json"));
  assert.equal(settings.colorScheme, "light");
  assert.equal(settings.enableTelemetry, false);
  assert.deepEqual(settings.trustedWorkspaces, [workingDirectory]);
});

test("antigravity-cli provider ignores non-skill entries and accepts USERPROFILE homes", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-filter-"));
  const isolatedHome = path.join(workingDirectory, "profile-home");
  await fs.mkdir(path.join(workingDirectory, "skills", "missing-definition"), { recursive: true });
  await fs.writeFile(path.join(workingDirectory, "skills", "README.md"), "not a skill\n", "utf8");

  const provider = new AntigravityCliSystemProvider({
    config: {
      working_dir: workingDirectory,
      cli_env: { USERPROFILE: isolatedHome },
    },
  });
  const runtimeLayout = await provider.prepareRuntimeLayout();

  assert.deepEqual(runtimeLayout.mirroredSkills, []);
  assert.equal(runtimeLayout.homeDirectory, isolatedHome);
  assert.equal(runtimeLayout.settings.enableTelemetry, false);
});

test("antigravity-cli provider returns plain output and writes an execution event", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-hook-"));
  const isolatedHome = path.join(workingDirectory, "home");
  const provider = new AntigravityCliSystemProvider({
    config: {
      command_path: "agy",
      working_dir: workingDirectory,
      cli_env: { HOME: isolatedHome },
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.HOME, isolatedHome);
      assert.equal(options.env.USERPROFILE, isolatedHome);
      return { stdout: "FINAL-ANSWER\n", stderr: "diagnostic", exitCode: 0 };
    },
  });

  const response = await provider.callApi("Return the marker.");
  const payload = JSON.parse(await fs.readFile(response.metadata.executionEventHook.path, "utf8"));

  assert.equal(response.output, "FINAL-ANSWER");
  assert.equal(response.metadata.commandPath, "agy");
  assert.equal(response.metadata.stderr, "diagnostic");
  assert.equal(payload.adapter, "antigravity-cli");
  assert.equal(response.metadata.executionEventHook.eventCount, 0);
});

test("antigravity-cli provider prepends the skill activation preamble", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-prompt-"));
  const expectedPrompt = "Skill activation: use /marker-guide.\n\nTask:\nReturn HELLO.";
  const provider = new AntigravityCliSystemProvider({
    config: {
      working_dir: workingDirectory,
      prompt_preamble: "Skill activation: use /marker-guide.",
    },
    spawnProcess: async (options) => {
      if (process.platform === "win32") {
        assert.equal(options.promptText, expectedPrompt);
      } else {
        assert.equal(options.args[1], expectedPrompt);
      }
      return { stdout: "DONE", stderr: "", exitCode: 0 };
    },
  });

  const response = await provider.callApi("Return HELLO.");
  assert.equal(response.output, "DONE");
});

test("antigravity-cli provider reports failures and coarse policy mappings", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-failure-"));
  const provider = new AntigravityCliSystemProvider({
    id: "fallback",
    config: {
      working_dir: workingDirectory,
      approval_policy: "untrusted",
      sandbox_mode: "read-only",
      web_search_enabled: false,
      network_access_enabled: false,
      model_reasoning_effort: "low",
    },
    spawnProcess: async () => ({ stdout: "", stderr: "failed", exitCode: 7 }),
  });

  const response = await provider.callApi("Return the marker.");

  assert.equal(provider.id(), "fallback");
  assert.equal(response.error, "failed");
  assert.deepEqual(response.metadata.unsupportedSettings, [
    "approvalPolicy",
    "sandboxMode",
    "webSearchEnabled",
    "networkAccessEnabled",
    "reasoningEffort",
  ]);
  assert.equal(
    response.metadata.appliedSettings.settingsPath,
    path.join(workingDirectory, ".skill-arena", "antigravity-cli", "home", ".gemini", "antigravity-cli", "settings.json"),
  );
});

test("antigravity-cli provider uses the default command transport", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-spawn-"));
  const provider = new AntigravityCliSystemProvider({
    config: {
      command_path: process.execPath,
      working_dir: workingDirectory,
      approval_policy: "on-request",
      sandbox_mode: "danger-full-access",
    },
  });

  const response = await provider.callApi("1+1");
  assert.equal(response.output, "2");
});

test("antigravity-cli provider falls back to an exit-code error", async () => {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-antigravity-exit-"));
  const abortController = new AbortController();
  const provider = new AntigravityCliSystemProvider({
    config: { working_dir: workingDirectory },
    spawnProcess: async () => ({ stdout: "", stderr: "", exitCode: 9 }),
  });

  const response = await provider.callApi(
    "Return the marker.",
    undefined,
    { abortSignal: abortController.signal },
  );
  assert.equal(response.error, "agy exited with code 9.");
});

test("antigravity-cli provider validates required configuration", async () => {
  const provider = new AntigravityCliSystemProvider();
  await assert.rejects(() => provider.callApi("prompt"), /working_dir/);
});
