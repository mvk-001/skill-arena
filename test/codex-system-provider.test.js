import test from "node:test";
import assert from "node:assert/strict";
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
