import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createRuntimeIsolation } from "../src/runtime-isolation.js";

test("runtime isolation seeds Codex home with only shared system state for codex scenarios", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-runtime-isolation-"));
  const sourceCodexHome = path.join(tempDirectory, "source-codex-home");
  const executionRootDirectory = path.join(tempDirectory, "execution-root");

  await fs.mkdir(path.join(sourceCodexHome, "skills", ".system", "builtin"), { recursive: true });
  await fs.mkdir(path.join(sourceCodexHome, "skills", "user-skill"), { recursive: true });
  await fs.mkdir(path.join(sourceCodexHome, "rules"), { recursive: true });
  await fs.mkdir(path.join(sourceCodexHome, "vendor_imports"), { recursive: true });
  await fs.writeFile(path.join(sourceCodexHome, "auth.json"), "{\"token\":\"x\"}", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "config.toml"), "model = \"gpt-5\"\n", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "version.json"), "{\"version\":1}", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, ".codex-global-state.json"), "{\"ok\":true}", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "AGENTS.md"), "# user instructions\n", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "skills", ".system", "builtin", "SKILL.md"), "system", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "skills", "user-skill", "SKILL.md"), "user", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "rules", "default.md"), "rule", "utf8");
  await fs.writeFile(path.join(sourceCodexHome, "vendor_imports", "vendor.json"), "{}", "utf8");

  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sourceCodexHome;

  try {
    const isolation = await createRuntimeIsolation(executionRootDirectory, {
      id: "baseline",
      skillMode: "disabled",
      agent: {
        adapter: "codex",
      },
    });

    assert.equal(isolation.environment.SKILL_ARENA_ALLOWED_SKILLS, "");
    assert.match(await fs.readFile(path.join(isolation.codexHome, "auth.json"), "utf8"), /token/);
    assert.equal(await fs.stat(path.join(isolation.codexHome, "AGENTS.md")).catch(() => null), null);
    assert.equal(await fs.stat(path.join(isolation.codexHome, "skills", "user-skill")).catch(() => null), null);
    assert.match(
      await fs.readFile(path.join(isolation.codexHome, "skills", ".system", "builtin", "SKILL.md"), "utf8"),
      /system/,
    );
    assert.match(await fs.readFile(path.join(isolation.codexHome, "rules", "default.md"), "utf8"), /rule/);
    assert.match(
      await fs.readFile(path.join(isolation.codexHome, "vendor_imports", "vendor.json"), "utf8"),
      /\{\}/,
    );
  } finally {
    if (previousCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  }
});

test("runtime isolation reports declared profile skills as the only allowed visible skills", async () => {
  const executionRootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-runtime-profile-"));

  const isolation = await createRuntimeIsolation(executionRootDirectory, {
    id: "skill-group",
    skillMode: "enabled",
    profile: {
      capabilities: {
        skills: [
          {
            source: {
              type: "inline",
              skillId: "alpha",
              content: "alpha",
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
          {
            source: {
              type: "inline-files",
              files: [
                {
                  path: "skills/beta/SKILL.md",
                  content: "beta",
                },
              ],
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
        ],
      },
    },
    agent: {
      adapter: "codex",
    },
  });

  assert.equal(isolation.environment.SKILL_ARENA_ALLOWED_SKILLS, "alpha,beta");
});

test("runtime isolation seeds pi home with local auth and settings", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-runtime-pi-"));
  const sourceHome = path.join(tempDirectory, "source-home");
  const executionRootDirectory = path.join(tempDirectory, "execution-root");
  const sourcePiAgentDirectory = path.join(sourceHome, ".pi", "agent");

  await fs.mkdir(path.join(sourcePiAgentDirectory, "bin"), { recursive: true });
  await fs.writeFile(path.join(sourcePiAgentDirectory, "auth.json"), "{\"token\":\"x\"}", "utf8");
  await fs.writeFile(path.join(sourcePiAgentDirectory, "settings.json"), "{\"defaultProvider\":\"github-copilot\"}", "utf8");
  await fs.writeFile(path.join(sourcePiAgentDirectory, "bin", "rg.exe"), "binary", "utf8");

  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = sourceHome;
  process.env.USERPROFILE = sourceHome;

  try {
    const isolation = await createRuntimeIsolation(executionRootDirectory, {
      id: "pi-baseline",
      skillMode: "disabled",
      agent: {
        adapter: "pi",
      },
    });

    const isolatedPiAgentDirectory = path.join(isolation.environment.USERPROFILE, ".pi", "agent");
    assert.match(
      await fs.readFile(path.join(isolatedPiAgentDirectory, "auth.json"), "utf8"),
      /token/,
    );
    assert.match(
      await fs.readFile(path.join(isolatedPiAgentDirectory, "settings.json"), "utf8"),
      /github-copilot/,
    );
    assert.match(
      await fs.readFile(path.join(isolatedPiAgentDirectory, "bin", "rg.exe"), "utf8"),
      /binary/,
    );
  } finally {
    if (previousHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile == null) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
});
