import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { findScenario, loadBenchmarkManifest } from "../src/manifest.js";
import { benchmarkManifestSchema } from "../src/manifest-schema.js";
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
  const isolatedTargetFile = path.join(workspace.executionWorkspaceDirectory, "notes", "target.txt");
  const targetContents = await fs.readFile(targetFile, "utf8");
  const isolatedTargetContents = await fs.readFile(isolatedTargetFile, "utf8");

  assert.match(targetContents, /ALPHA-42/);
  assert.match(isolatedTargetContents, /ALPHA-42/);
  assert.notEqual(workspace.executionWorkspaceDirectory, workspace.workspaceDirectory);
  assert.match(workspace.executionEnvironment.CODEX_HOME, /skill-arena-execution-|skill-arena-run-/);
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
  assert.equal(enabledWorkspace.isolation.mountedSkillIds[0], "marker-guide");
  assert.equal(disabledWorkspace.isolation.mountedSkillIds.length, 0);
  assert.match(enabledWorkspace.executionWorkspaceDirectory, /skill-arena-execution-/);
  assert.equal(enabledWorkspace.executionEnvironment.CODEX_HOME.endsWith("codex-home"), true);
});

test("workspace sanitization strips base AGENTS.md and base skills from isolated runs", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-sanitize-"));
  const baseDirectory = path.join(tempDirectory, "base");
  const skillDirectory = path.join(tempDirectory, "skill-overlay");

  await fs.mkdir(path.join(baseDirectory, "skills", "base-only"), { recursive: true });
  await fs.mkdir(path.join(skillDirectory, "skills", "allowed-skill"), { recursive: true });
  await fs.writeFile(path.join(baseDirectory, "AGENTS.md"), "# Base instructions\n", "utf8");
  await fs.writeFile(
    path.join(baseDirectory, "skills", "base-only", "SKILL.md"),
    "---\nname: base-only\n---\n",
    "utf8",
  );
  await fs.writeFile(path.join(skillDirectory, "AGENTS.md"), "# Allowed overlay\n", "utf8");
  await fs.writeFile(
    path.join(skillDirectory, "skills", "allowed-skill", "SKILL.md"),
    "---\nname: allowed-skill\n---\n",
    "utf8",
  );

  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-sanitized-isolation",
      description: "Workspace sanitization",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: baseDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "no-skill",
        description: "No skill",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
      {
        id: "with-skill",
        description: "With skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "local-path",
            path: skillDirectory,
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  const disabledWorkspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[0],
  });
  const enabledWorkspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[1],
  });

  assert.equal(
    await fs.stat(path.join(disabledWorkspace.workspaceDirectory, "AGENTS.md")).catch(() => null),
    null,
  );
  assert.equal(
    await fs.stat(path.join(disabledWorkspace.workspaceDirectory, "skills")).catch(() => null),
    null,
  );
  assert.match(
    await fs.readFile(path.join(enabledWorkspace.workspaceDirectory, "AGENTS.md"), "utf8"),
    /Allowed overlay/,
  );
  assert.equal(
    await fs.stat(path.join(enabledWorkspace.workspaceDirectory, "skills", "base-only")).catch(() => null),
    null,
  );
  assert.deepEqual(enabledWorkspace.isolation.mountedSkillIds, ["allowed-skill"]);
});

test("strict isolation rejects system-installed skills and multiple mounted skills", async () => {
  const singleBaseManifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-strict-system-installed",
      description: "Reject system installed skills",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "empty",
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "system-skill",
        description: "System skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "system-installed",
          },
          install: {
            strategy: "system-installed",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({
      manifest: singleBaseManifest,
      scenario: singleBaseManifest.scenarios[0],
    }),
    /Strict isolation does not support system-installed skills/,
  );

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-multi-skill-"));
  const baseDirectory = path.join(tempDirectory, "base");
  const overlayDirectory = path.join(tempDirectory, "overlay");
  await fs.mkdir(baseDirectory, { recursive: true });
  await fs.mkdir(path.join(overlayDirectory, "skills", "one"), { recursive: true });
  await fs.mkdir(path.join(overlayDirectory, "skills", "two"), { recursive: true });
  await fs.writeFile(path.join(overlayDirectory, "skills", "one", "SKILL.md"), "one", "utf8");
  await fs.writeFile(path.join(overlayDirectory, "skills", "two", "SKILL.md"), "two", "utf8");

  const multiSkillManifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-strict-multi-skill",
      description: "Reject multiple skills",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: baseDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "multi-skill",
        description: "Multiple skills",
        skillMode: "enabled",
        skill: {
          source: {
            type: "local-path",
            path: overlayDirectory,
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({
      manifest: multiSkillManifest,
      scenario: multiSkillManifest.scenarios[0],
    }),
    /Strict isolation requires exactly one configured skill, found 2/,
  );
});

test("workspace sources are applied in declaration order", async () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "ordered-sources",
      description: "Ordered sources test",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: "fixtures/smoke-skill-following/base",
          target: "/",
        },
        {
          id: "override",
          type: "inline-files",
          target: "/notes",
          files: [
            {
              path: "target.txt",
              content: "OVERRIDDEN",
            },
          ],
        },
      ],
      setup: {
        initializeGit: false,
        env: {
          SAMPLE_FLAG: "1",
        },
      },
    },
    scenarios: [
      {
        id: "ordered",
        description: "Ordered sources scenario",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  const workspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[0],
  });
  const targetContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "notes", "target.txt"),
    "utf8",
  );

  assert.equal(targetContents, "OVERRIDDEN");
  assert.equal(workspace.environment.SAMPLE_FLAG, "1");
});

test("inline skill sources are written into the workspace only for enabled runs", async () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "inline-skill-check",
      description: "Inline skill test",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: "fixtures/smoke-skill-following/base",
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "inline-enabled",
        description: "Inline skill enabled",
        skillMode: "enabled",
        skill: {
          source: {
            type: "inline",
            skillId: "inline-helper",
            content: "---\nname: inline-helper\n---\n",
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  const workspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[0],
  });
  const skillContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "skills", "inline-helper", "SKILL.md"),
    "utf8",
  );

  assert.match(skillContents, /name: inline-helper/);
  assert.equal(workspace.isolation.mountedSkillIds[0], "inline-helper");
});

test("workspace base sources strip AGENTS.md and skills while overlays remain visible", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-sanitize-"));
  const baseDirectory = path.join(tempDirectory, "base");
  const overlayDirectory = path.join(tempDirectory, "overlay");

  await fs.mkdir(path.join(baseDirectory, "skills", "base-helper"), { recursive: true });
  await fs.writeFile(path.join(baseDirectory, "AGENTS.md"), "# Base Instructions\n", "utf8");
  await fs.writeFile(
    path.join(baseDirectory, "skills", "base-helper", "SKILL.md"),
    "---\nname: base-helper\n---\n",
    "utf8",
  );
  await fs.writeFile(path.join(baseDirectory, "README.md"), "BASE", "utf8");

  await fs.mkdir(path.join(overlayDirectory, "skills", "only-skill"), { recursive: true });
  await fs.writeFile(path.join(overlayDirectory, "AGENTS.md"), "# Overlay Instructions\n", "utf8");
  await fs.writeFile(
    path.join(overlayDirectory, "skills", "only-skill", "SKILL.md"),
    "---\nname: only-skill\n---\n",
    "utf8",
  );

  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "sanitize-surface",
      description: "Sanitize agent instructions",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: baseDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "no-skill",
        description: "No skill isolation",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
      {
        id: "with-skill",
        description: "With isolated skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "local-path",
            path: overlayDirectory,
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  const noSkillWorkspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[0],
  });
  const skillWorkspace = await materializeWorkspace({
    manifest,
    scenario: manifest.scenarios[1],
  });

  assert.equal(await fs.stat(path.join(noSkillWorkspace.workspaceDirectory, "AGENTS.md")).catch(() => null), null);
  assert.equal(await fs.stat(path.join(noSkillWorkspace.workspaceDirectory, "skills")).catch(() => null), null);
  assert.equal(await fs.readFile(path.join(noSkillWorkspace.workspaceDirectory, "README.md"), "utf8"), "BASE");

  assert.match(
    await fs.readFile(path.join(skillWorkspace.workspaceDirectory, "AGENTS.md"), "utf8"),
    /Overlay Instructions/,
  );
  assert.match(
    await fs.readFile(path.join(skillWorkspace.workspaceDirectory, "skills", "only-skill", "SKILL.md"), "utf8"),
    /name: only-skill/,
  );
  assert.deepEqual(skillWorkspace.isolation.mountedSkillIds, ["only-skill"]);
});

test("workspace isolation rejects system-installed and multi-skill overlays", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-isolation-errors-"));
  const baseDirectory = path.join(tempDirectory, "base");
  const multiSkillDirectory = path.join(tempDirectory, "multi");
  await fs.mkdir(baseDirectory, { recursive: true });
  await fs.writeFile(path.join(baseDirectory, "README.md"), "BASE", "utf8");
  await fs.mkdir(path.join(multiSkillDirectory, "skills", "one"), { recursive: true });
  await fs.mkdir(path.join(multiSkillDirectory, "skills", "two"), { recursive: true });
  await fs.writeFile(path.join(multiSkillDirectory, "AGENTS.md"), "# Overlay\n", "utf8");
  await fs.writeFile(path.join(multiSkillDirectory, "skills", "one", "SKILL.md"), "---\nname: one\n---\n", "utf8");
  await fs.writeFile(path.join(multiSkillDirectory, "skills", "two", "SKILL.md"), "---\nname: two\n---\n", "utf8");

  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "isolation-errors",
      description: "Isolation errors",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: baseDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "system-installed",
        description: "System skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "system-installed",
          },
          install: {
            strategy: "system-installed",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
      {
        id: "multi-skill",
        description: "Multi skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "local-path",
            path: multiSkillDirectory,
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({ manifest, scenario: manifest.scenarios[0] }),
    /Strict isolation does not support system-installed skills/,
  );
  await assert.rejects(
    () => materializeWorkspace({ manifest, scenario: manifest.scenarios[1] }),
    /Strict isolation requires exactly one configured skill, found 2\./,
  );
});

test("git skill sources can select one skill folder from a repository", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-git-overlay-"));
  const fixtureDirectory = path.join(tempDirectory, "fixture");
  const skillRepoDirectory = path.join(tempDirectory, "skill-repo");

  await fs.mkdir(path.join(fixtureDirectory, "notes"), { recursive: true });
  await fs.writeFile(path.join(fixtureDirectory, "notes", "target.txt"), "BASE", "utf8");

  await fs.mkdir(path.join(skillRepoDirectory, "skills", "remote-guide"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(skillRepoDirectory, "skills", "remote-guide", "SKILL.md"),
    "---\nname: remote-guide\n---\n",
    "utf8",
  );
  await fs.mkdir(path.join(skillRepoDirectory, "skills", "unused-guide"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(skillRepoDirectory, "skills", "unused-guide", "SKILL.md"),
    "---\nname: unused-guide\n---\n",
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

  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "git-overlay-workspace",
      description: "Git overlay workspace",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: fixtureDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "git-skill",
        description: "Uses one selected remote skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "git",
            repo: skillRepoDirectory,
            ref: "main",
            subpath: ".",
            skillPath: "skills/remote-guide",
            skillId: "remote-guide",
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
          executionMethod: "command",
          commandPath: "codex",
        },
        evaluation: {
          assertions: [
            {
              type: "equals",
              value: "HELLO",
            },
          ],
        },
      },
    ],
  });

  const workspace = await materializeWorkspace({ manifest, scenario: manifest.scenarios[0] });
  const skillContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "skills", "remote-guide", "SKILL.md"),
    "utf8",
  );
  const unusedSkillStats = await fs.stat(
    path.join(workspace.workspaceDirectory, "skills", "unused-guide", "SKILL.md"),
  ).catch(() => null);

  assert.match(skillContents, /name: remote-guide/);
  assert.equal(unusedSkillStats, null);
});

test("workspace materialization supports empty sources and rejects escaping targets", async () => {
  const manifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-empty-source",
      description: "Workspace empty source",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "empty-source",
          type: "empty",
          target: "/ignored",
        },
        {
          id: "inline-source",
          type: "inline-files",
          target: "/",
          files: [
            {
              path: "README.md",
              content: "HELLO",
            },
          ],
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "workspace-empty",
        description: "Workspace empty",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  const workspace = await materializeWorkspace({ manifest, scenario: manifest.scenarios[0] });
  const readmeContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "README.md"),
    "utf8",
  );

  assert.equal(readmeContents, "HELLO");

  const escapingManifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-escaping-target",
      description: "Workspace escaping target",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "inline-source",
          type: "inline-files",
          target: "../escape",
          files: [
            {
              path: "README.md",
              content: "HELLO",
            },
          ],
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "workspace-escaping",
        description: "Workspace escaping",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({
      manifest: escapingManifest,
      scenario: escapingManifest.scenarios[0],
    }),
    /Workspace target escapes the workspace root/,
  );
});

test("workspace materialization rejects missing directories and broken git sources", async () => {
  const missingManifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-missing-source",
      description: "Workspace missing source",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "missing-source",
          type: "local-path",
          path: "fixtures/does-not-exist",
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "workspace-missing",
        description: "Workspace missing",
        skillMode: "disabled",
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({
      manifest: missingManifest,
      scenario: missingManifest.scenarios[0],
    }),
    /workspace\.sources\.missing-source\.path does not exist or is not a directory/,
  );

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-broken-git-"));
  const fixtureDirectory = path.join(tempDirectory, "fixture");
  await fs.mkdir(fixtureDirectory, { recursive: true });

  const brokenGitManifest = benchmarkManifestSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "workspace-broken-git",
      description: "Workspace broken git",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      sources: [
        {
          id: "base",
          type: "local-path",
          path: fixtureDirectory,
          target: "/",
        },
      ],
      setup: {
        initializeGit: false,
        env: {},
      },
    },
    scenarios: [
      {
        id: "workspace-broken-git-skill",
        description: "Workspace broken git skill",
        skillMode: "enabled",
        skill: {
          source: {
            type: "git",
            repo: path.join(tempDirectory, "missing-repo"),
          },
          install: {
            strategy: "workspace-overlay",
          },
        },
        agent: {
          adapter: "codex",
        },
        evaluation: {
          assertions: [{ type: "equals", value: "HELLO" }],
        },
      },
    ],
  });

  await assert.rejects(
    () => materializeWorkspace({
      manifest: brokenGitManifest,
      scenario: brokenGitManifest.scenarios[0],
    }),
    /Failed to clone git repo/,
  );
});
