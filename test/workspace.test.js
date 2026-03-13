import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { findScenario, loadBenchmarkManifest } from "../src/manifest.js";
import { fromProjectRoot } from "../src/project-paths.js";
import { materializeWorkspace } from "../src/workspace.js";

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
