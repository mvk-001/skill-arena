import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  spawnProviderCommand,
  withPromptPlaceholder,
} from "../src/providers/command-process.js";

test(
  "Windows prompt transport preserves UTF-8 text",
  { skip: process.platform !== "win32" },
  async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-unicode-"));
    const commandPath = path.join(directory, "echo-prompt.ps1");
    await fs.writeFile(
      commandPath,
      [
        "param([string] $Prompt)",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
        "[Console]::Out.Write($Prompt)",
      ].join("\n"),
      "utf8",
    );

    try {
      const prompt = "Research Summary: π — 李雷 — Ravi 🚀";
      const result = await spawnProviderCommand({
        command: commandPath,
        args: withPromptPlaceholder(["__PROMPT__"], "__PROMPT__"),
        cwd: directory,
        env: { ...process.env, TEMP: directory, TMP: directory },
        promptText: prompt,
        promptDirectoryPrefix: "prompt-",
      });

      assert.equal(result.exitCode, 0);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, prompt);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
