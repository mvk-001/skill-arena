import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { findScenario, loadBenchmarkManifest } from "../src/manifest.js";
import { fromProjectRoot } from "../src/project-paths.js";
import { materializeWorkspace } from "../src/workspace.js";

const execFileAsync = promisify(execFile);

test("workspace materialization copies the fixture tree", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const scenario = findScenario(manifest, "codex-mini-no-skill");

  const workspace = await materializeWorkspace({ manifest, scenario });
  const targetFile = path.join(workspace.workspaceDirectory, "notes", "target.txt");
  const targetContents = await fs.readFile(targetFile, "utf8");

  assert.match(targetContents, /ALPHA-42/);
});

test("skill overlays are applied only when skill mode is enabled", async () => {
  const manifestPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "manifest.json",
  );
  const { manifest } = await loadBenchmarkManifest(manifestPath);
  const disabledScenario = findScenario(manifest, "codex-mini-no-skill");
  const enabledScenario = findScenario(manifest, "codex-mini-with-skill");

  const disabledWorkspace = await materializeWorkspace({
    manifest,
    scenario: disabledScenario,
  });
  const enabledWorkspace = await materializeWorkspace({
    manifest,
    scenario: enabledScenario,
  });

  const disabledAgentsPath = path.join(disabledWorkspace.workspaceDirectory, "AGENTS.md");
  const enabledAgentsPath = path.join(enabledWorkspace.workspaceDirectory, "AGENTS.md");
  const enabledSkillPath = path.join(
    enabledWorkspace.workspaceDirectory,
    "skills",
    "marker-guide",
    "SKILL.md",
  );

  const disabledStats = await fs.stat(disabledAgentsPath).catch(() => null);
  const enabledContents = await fs.readFile(enabledAgentsPath, "utf8");
  const enabledSkillContents = await fs.readFile(enabledSkillPath, "utf8");

  assert.equal(disabledStats, null);
  assert.match(enabledContents, /Benchmark Skill Overlay/);
  assert.match(enabledSkillContents, /name: marker-guide/);
});

test("skill overlays can be cloned from a git repository", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-git-overlay-"));
  const fixtureDirectory = path.join(tempDirectory, "fixture");
  const skillRepoDirectory = path.join(tempDirectory, "skill-repo");

  await fs.mkdir(path.join(fixtureDirectory, "notes"), { recursive: true });
  await fs.writeFile(path.join(fixtureDirectory, "notes", "target.txt"), "BASE", "utf8");

  await fs.mkdir(path.join(skillRepoDirectory, "overlay", "skills", "remote-guide"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(skillRepoDirectory, "overlay", "AGENTS.md"),
    "# Remote Overlay\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(skillRepoDirectory, "overlay", "skills", "remote-guide", "SKILL.md"),
    "---\nname: remote-guide\n---\n",
    "utf8",
  );

  await execFileAsync("git", ["init", "--initial-branch=main"], {
    cwd: skillRepoDirectory,
    windowsHide: true,
  });
  await execFileAsync("git", ["config", "user.name", "Skill Arena"], {
    cwd: skillRepoDirectory,
    windowsHide: true,
  });
  await execFileAsync("git", ["config", "user.email", "skill-arena@example.com"], {
    cwd: skillRepoDirectory,
    windowsHide: true,
  });
  await execFileAsync("git", ["add", "."], {
    cwd: skillRepoDirectory,
    windowsHide: true,
  });
  await execFileAsync("git", ["commit", "-m", "Add remote overlay"], {
    cwd: skillRepoDirectory,
    windowsHide: true,
  });

  const scenario = {
    id: "git-skill",
    skillMode: "enabled",
  };
  const manifest = {
    benchmark: {
      id: "git-overlay-workspace",
    },
    workspace: {
      fixture: path.relative(fromProjectRoot(), fixtureDirectory).replaceAll("\\", "/"),
      skillOverlay: {
        git: {
          repo: skillRepoDirectory,
          ref: "main",
          subpath: "overlay",
        },
      },
      initializeGit: false,
    },
  };

  const workspace = await materializeWorkspace({ manifest, scenario });
  const agentsContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "AGENTS.md"),
    "utf8",
  );
  const skillContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "skills", "remote-guide", "SKILL.md"),
    "utf8",
  );

  assert.match(agentsContents, /Remote Overlay/);
  assert.match(skillContents, /name: remote-guide/);
});
