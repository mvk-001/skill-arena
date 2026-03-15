import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createRuntimeIsolation } from "../src/runtime-isolation.js";

test("runtime isolation seeds auth, config, and system skills from CODEX_HOME", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-runtime-isolation-"));
  const sourceCodexHome = path.join(tempDirectory, "source-codex-home");
  const executionRoot = path.join(tempDirectory, "execution-root");

  await fs.mkdir(path.join(sourceCodexHome, "skills", ".system", "example-system-skill"), {
    recursive: true,
  });
  await fs.writeFile(path.join(sourceCodexHome, "auth.json"), "{\"api_key\":\"test\"}", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "config.toml"), "model = \"gpt-5\"\n", "utf8");
  await fs.writeFile(
    path.join(sourceCodexHome, "skills", ".system", "example-system-skill", "SKILL.md"),
    "---\nname: example-system-skill\ndescription: Example system skill.\n---\n",
    "utf8",
  );

  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sourceCodexHome;

  try {
    const isolation = await createRuntimeIsolation(executionRoot, {
      skillMode: "enabled",
      skill: {
        source: {
          type: "local-path",
          path: "skills/example-skill",
          skillId: "example-skill",
        },
      },
    });

    assert.match(await fs.readFile(path.join(isolation.codexHome, "auth.json"), "utf8"), /api_key/);
    assert.match(await fs.readFile(path.join(isolation.codexHome, "config.toml"), "utf8"), /model/);
    assert.match(
      await fs.readFile(
        path.join(isolation.codexHome, "skills", ".system", "example-system-skill", "SKILL.md"),
        "utf8",
      ),
      /name: example-system-skill/,
    );
    assert.equal(isolation.environment.SKILL_ARENA_ALLOWED_SKILLS, "example-skill");
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});
