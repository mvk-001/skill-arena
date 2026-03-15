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
            type: "inline-files",
            files: [
              {
                path: "AGENTS.md",
                content: "# Inline overlay\n",
              },
            ],
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
  const agentsContents = await fs.readFile(
    path.join(workspace.workspaceDirectory, "AGENTS.md"),
    "utf8",
  );

  assert.match(agentsContents, /Inline overlay/);
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
        description: "Uses a remote skill overlay",
        skillMode: "enabled",
        skill: {
          source: {
            type: "git",
            repo: skillRepoDirectory,
            ref: "main",
            subpath: "overlay",
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
