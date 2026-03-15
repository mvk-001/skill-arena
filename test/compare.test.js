import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expandCompareConfigToManifest, loadCompareConfig } from "../src/compare.js";
import { compareConfigSchema } from "../src/compare-schema.js";
import { fromProjectRoot } from "../src/project-paths.js";

const execFileAsync = promisify(execFile);

test("compare config expands into adapter x skill-mode scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "gws-gmail-triage",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "gws-gmail-triage-compare");
  assert.equal(manifest.scenarios.length, 4);
  assert.equal(manifest.scenarios[0].id, "codex-worst-no-skill");
  assert.equal(manifest.scenarios[1].id, "codex-worst-skill");
  assert.equal(manifest.scenarios[0].skillSource, "none");
  assert.equal(manifest.scenarios[1].skillSource, "system-installed");
  assert.equal(manifest.scenarios[1].skill.source.type, "system-installed");
  assert.equal(compareConfig.evaluation.requests, 10);
});

test("compare config requires an explicit skill definition for enabled skill modes", () => {
  const compareConfig = {
    schemaVersion: 1,
    benchmark: {
      id: "compare-workspace-overlay",
      description: "Compare workspace overlay scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      skillOverlay: "fixtures/smoke-skill-following/skill-overlay",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 1,
      timeoutMs: 120000,
      tracing: false,
      maxConcurrency: 1,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "with-skill",
          description: "Workspace overlay enabled.",
          skillMode: "enabled",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  };

  assert.throws(
    () => compareConfigSchema.parse(compareConfig),
    /Enabled compare skill modes must define comparison\.skillModes\[\*\]\.skill explicitly\./,
  );
});

test("compare config supports explicit declarative skill definitions", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-explicit-skill",
      description: "Compare explicit skill scenarios.",
      tags: [],
    },
    task: {
      prompts: [
        {
          prompt: "Return HELLO.",
        },
      ],
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
        initializeGit: true,
        env: {},
      },
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 2,
      timeoutMs: 120000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "skill",
          description: "Inline skill",
          skillMode: "enabled",
          skill: {
            source: {
              type: "inline-files",
              files: [
                {
                  path: "AGENTS.md",
                  content: "# Inline compare skill\n",
                },
              ],
            },
            install: {
              strategy: "workspace-overlay",
            },
          },
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  });

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(compareConfig.task.prompts[0].id, "prompt-1");
  assert.equal(manifest.scenarios[0].skill.source.type, "inline-files");
});

test("compare config evaluation leaves maxConcurrency unset so runtime can auto-resolve it", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-auto-concurrency",
      description: "Compare auto concurrency scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 2,
      timeoutMs: 120000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  });

  assert.equal(compareConfig.evaluation.maxConcurrency, undefined);
});

test("compare config defaults requests to 10 when omitted", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-default-requests",
      description: "Compare request default scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      timeoutMs: 120000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "codex-mini",
          description: "Codex mini",
          agent: {
            adapter: "codex",
            executionMethod: "command",
            commandPath: "codex",
          },
        },
      ],
    },
  });

  assert.equal(compareConfig.evaluation.requests, 10);
});

test("smoke compare config expands into codex and pi skill-mode scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "smoke-skill-following",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "smoke-skill-following-compare");
  assert.equal(manifest.task.prompts.length, 2);
  assert.equal(compareConfig.evaluation.requests, 10);
  assert.equal(manifest.scenarios.length, 4);
  assert.equal(manifest.scenarios[0].id, "codex-mini-no-skill");
  assert.equal(manifest.scenarios[1].id, "codex-mini-skill");
  assert.equal(manifest.scenarios[2].id, "pi-gpt5mini-no-skill");
  assert.equal(manifest.scenarios[3].id, "pi-gpt5mini-skill");
  assert.equal(manifest.scenarios[3].agent.model, "github-copilot/gpt-5-mini");
  assert.equal(manifest.scenarios[3].skillSource, "workspace-overlay");
});

test("compare config accepts copilot-cli variants", () => {
  const compareConfig = compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "copilot-compare",
      description: "Compare copilot scenarios.",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [
        {
          type: "equals",
          value: "HELLO",
        },
      ],
      requests: 1,
      timeoutMs: 120000,
      tracing: false,
      noCache: true,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "copilot-gpt5",
          description: "Copilot GPT-5",
          agent: {
            adapter: "copilot-cli",
            executionMethod: "command",
            model: "gpt-5",
          },
        },
      ],
    },
  });

  const manifest = expandCompareConfigToManifest(compareConfig);
  assert.equal(manifest.scenarios[0].agent.adapter, "copilot-cli");
  assert.equal(manifest.scenarios[0].agent.commandPath, "copilot");
});

test("copilot smoke compare config expands into skill and no-skill scenarios", async () => {
  const compareConfigPath = fromProjectRoot(
    "benchmarks",
    "copilot-cli-smoke-compare",
    "compare.yaml",
  );
  const { compareConfig } = await loadCompareConfig(compareConfigPath);

  const manifest = expandCompareConfigToManifest(compareConfig);

  assert.equal(manifest.benchmark.id, "copilot-cli-smoke-compare");
  assert.equal(compareConfig.evaluation.requests, 2);
  assert.equal(manifest.scenarios.length, 2);
  assert.equal(manifest.scenarios[0].id, "copilot-gpt5mini-no-skill");
  assert.equal(manifest.scenarios[1].id, "copilot-gpt5mini-skill");
  assert.equal(manifest.scenarios[0].agent.adapter, "copilot-cli");
  assert.equal(manifest.scenarios[0].agent.commandPath, "copilot");
  assert.equal(manifest.scenarios[1].skillSource, "workspace-overlay");
});

test("compare config loader reports invalid JSON and YAML parse errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-errors-"));
  const invalidJsonPath = path.join(tempDirectory, "compare.json");
  const invalidYamlPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(invalidJsonPath, "{ invalid json", "utf8");
  await fs.writeFile(invalidYamlPath, "schemaVersion: [", "utf8");

  await assert.rejects(
    () => loadCompareConfig(invalidJsonPath),
    /Expected valid JSON/,
  );
  await assert.rejects(
    () => loadCompareConfig(invalidYamlPath),
    /Expected valid YAML/,
  );
});

test("compare config loader formats schema validation errors", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-zod-"));
  const compareConfigPath = path.join(tempDirectory, "compare.json");

  await fs.writeFile(
    compareConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      benchmark: {
        id: "invalid-compare",
        description: "Invalid compare",
        tags: [],
      },
      task: {
        prompt: "Return HELLO.",
      },
      workspace: {
        fixture: "fixtures/smoke-skill-following/base",
        initializeGit: true,
      },
      evaluation: {
        assertions: [{ type: "equals", value: "HELLO" }],
      },
      comparison: {
        skillModes: [],
        variants: [],
      },
    }),
    "utf8",
  );

  await assert.rejects(
    () => loadCompareConfig(compareConfigPath),
    /comparison\./,
  );
});

test("compare config validation rejects duplicate ids and invalid normalized skill states", () => {
  assert.throws(() => compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "duplicate-compare",
      description: "Duplicate compare config",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "same",
          description: "First",
          skillMode: "disabled",
        },
        {
          id: "same",
          description: "Second",
          skillMode: "disabled",
        },
      ],
      variants: [
        {
          id: "variant",
          description: "Variant",
          agent: { adapter: "codex" },
        },
        {
          id: "variant",
          description: "Duplicate variant",
          agent: { adapter: "codex" },
        },
      ],
    },
  }), (error) => {
    assert.equal(error.message.includes("Duplicate comparison variant id"), true);
    assert.equal(error.message.includes("Duplicate comparison skill mode id"), true);
    return true;
  });

  assert.throws(() => compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-invalid-enabled",
      description: "Invalid compare enabled skill",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "skill",
          description: "Enabled without concrete skill",
          skillMode: "enabled",
          skill: {
            source: {
              type: "none",
            },
            install: {
              strategy: "none",
            },
          },
        },
      ],
      variants: [
        {
          id: "variant",
          description: "Variant",
          agent: { adapter: "codex" },
        },
      ],
    },
  }), /Enabled skill variants must resolve to a concrete skill source\./);

  assert.throws(() => compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-missing-enabled-skill",
      description: "Invalid compare missing enabled skill",
      tags: [],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      skillOverlay: "fixtures/smoke-skill-following/skill-overlay",
      initializeGit: true,
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "skill",
          description: "Enabled without explicit skill block",
          skillMode: "enabled",
        },
      ],
      variants: [
        {
          id: "variant",
          description: "Variant",
          agent: { adapter: "codex" },
        },
      ],
    },
  }), /Enabled compare skill modes must define comparison\.skillModes\[\*\]\.skill explicitly\./);

});

test("compare expansion uses adapter and variant display labels for report labels", () => {
  const manifest = expandCompareConfigToManifest(compareConfigSchema.parse({
    schemaVersion: 1,
    benchmark: {
      id: "compare-labels",
      description: "Compare labels",
      tags: ["compare"],
    },
    task: {
      prompt: "Return HELLO.",
    },
    workspace: {
      fixture: "fixtures/smoke-skill-following/base",
      initializeGit: true,
    },
    evaluation: {
      assertions: [{ type: "equals", value: "HELLO" }],
      requests: 1,
    },
    comparison: {
      skillModes: [
        {
          id: "no-skill",
          description: "No skill",
          skillMode: "disabled",
          output: {
            labels: {
              skillLabel: "off",
            },
          },
        },
      ],
      variants: [
        {
          id: "variant-a",
          description: "Variant A",
          agent: {
            adapter: "codex",
          },
          output: {
            labels: {
              adapterDisplayName: "Codex Mini",
              variantDisplayName: "Mini Variant",
            },
          },
        },
        {
          id: "variant-b",
          description: "Variant B",
          agent: {
            adapter: "pi",
          },
        },
      ],
    },
  }));

  assert.equal(manifest.scenarios[0].output.labels.reportDisplayName, "Codex Mini:no-skill");
  assert.equal(manifest.scenarios[0].output.labels.variantDisplayName, "Mini Variant");
  assert.equal(manifest.scenarios[0].output.labels.skillLabel, "off");
  assert.equal(manifest.scenarios[1].output.labels.reportDisplayName, "pi:no-skill");
});

test("compare dry-run resolves legacy local paths from the runtime working directory", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-cwd-"));
  const fixtureDirectory = path.join(tempDirectory, "fixture");
  const skillDirectory = path.join(tempDirectory, "skill-overlay");

  await fs.mkdir(path.join(fixtureDirectory, "notes"), { recursive: true });
  await fs.writeFile(path.join(fixtureDirectory, "notes", "target.txt"), "ALPHA-42", "utf8");
  await fs.mkdir(path.join(skillDirectory, "skills", "helper"), { recursive: true });
  await fs.writeFile(path.join(skillDirectory, "AGENTS.md"), "# Skill Overlay\n", "utf8");
  await fs.writeFile(
    path.join(skillDirectory, "skills", "helper", "SKILL.md"),
    "---\nname: helper\n---\n",
    "utf8",
  );

  const compareConfigPath = path.join(tempDirectory, "compare.yaml");
  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: cwd-relative-compare",
    "  description: Compare relative paths from cwd.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  fixture: ./fixture",
    "  skillOverlay:",
    "    path: ./skill-overlay",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: HELLO",
    "  requests: 1",
    "  timeoutMs: 120000",
    "  tracing: false",
    "  noCache: true",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "    - id: skill",
    "      description: Skill",
    "      skillMode: enabled",
    "      skill:",
    "        source:",
    "          type: local-path",
    "          path: ./skill-overlay",
    "        install:",
    "          strategy: workspace-overlay",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
    "        executionMethod: command",
    "        commandPath: codex",
  ].join("\n"), "utf8");

  await execFileAsync(process.execPath, [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"], {
    cwd: tempDirectory,
    windowsHide: true,
  });

  const resultsRoot = path.join(tempDirectory, "results", "cwd-relative-compare");
  const runDirectories = await fs.readdir(resultsRoot);
  const noSkillRunDirectory = runDirectories.find((entry) => entry.endsWith("-codex-mini-no-skill"));
  const skillRunDirectory = runDirectories.find((entry) => entry.endsWith("-codex-mini-skill"));

  assert.ok(noSkillRunDirectory);
  assert.ok(skillRunDirectory);

  const noSkillTarget = await fs.readFile(
    path.join(resultsRoot, noSkillRunDirectory, "workspace", "notes", "target.txt"),
    "utf8",
  );
  const skillAgents = await fs.readFile(
    path.join(resultsRoot, skillRunDirectory, "workspace", "AGENTS.md"),
    "utf8",
  );

  assert.equal(noSkillTarget, "ALPHA-42");
  assert.match(skillAgents, /Skill Overlay/);
});

test("compare dry-run accepts absolute local paths", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-absolute-"));
  const assetsDirectory = path.join(tempDirectory, "assets");
  const fixtureDirectory = path.join(assetsDirectory, "fixture");
  const skillDirectory = path.join(assetsDirectory, "skill-overlay");

  await fs.mkdir(path.join(fixtureDirectory, "notes"), { recursive: true });
  await fs.writeFile(path.join(fixtureDirectory, "notes", "target.txt"), "ALPHA-42", "utf8");
  await fs.mkdir(path.join(skillDirectory, "skills", "helper"), { recursive: true });
  await fs.writeFile(path.join(skillDirectory, "AGENTS.md"), "# Skill Overlay\n", "utf8");
  await fs.writeFile(
    path.join(skillDirectory, "skills", "helper", "SKILL.md"),
    "---\nname: helper\n---\n",
    "utf8",
  );

  const compareConfigPath = path.join(tempDirectory, "absolute-compare.yaml");
  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: absolute-path-compare",
    "  description: Compare absolute paths.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  sources:",
    "    - id: base",
    "      type: local-path",
    `      path: ${JSON.stringify(fixtureDirectory)}`,
    "      target: /",
    "  setup:",
    "    initializeGit: true",
    "    env: {}",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: HELLO",
    "  requests: 1",
    "  timeoutMs: 120000",
    "  tracing: false",
    "  noCache: true",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "    - id: skill",
    "      description: Skill",
    "      skillMode: enabled",
    "      skill:",
    "        source:",
    "          type: local-path",
    `          path: ${JSON.stringify(skillDirectory)}`,
    "        install:",
    "          strategy: workspace-overlay",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
    "        executionMethod: command",
    "        commandPath: codex",
  ].join("\n"), "utf8");

  await execFileAsync(process.execPath, [fromProjectRoot("src", "cli", "run-compare.js"), "absolute-compare.yaml", "--dry-run"], {
    cwd: tempDirectory,
    windowsHide: true,
  });

  const resultsRoot = path.join(tempDirectory, "results", "absolute-path-compare");
  const runDirectories = await fs.readdir(resultsRoot);
  assert.equal(runDirectories.some((entry) => entry.endsWith("-codex-mini-no-skill")), true);
  assert.equal(runDirectories.some((entry) => entry.endsWith("-codex-mini-skill")), true);
});

test("compare dry-run rejects unknown relative source paths when no packaged fixture matches exist", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-missing-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: missing-path-compare",
    "  description: Compare invalid relative paths.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  fixture: fixtures/does-not-exist/base",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: HELLO",
    "  requests: 1",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
  ].join("\n"), "utf8");

  await assert.rejects(
    () => execFileAsync(process.execPath, [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"], {
      cwd: tempDirectory,
      windowsHide: true,
    }),
    /does not exist or is not a directory/,
  );
});

test("compare dry-run bootstraps missing relative source paths from packaged fixtures and excludes AGENTS.md", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-bootstrap-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: bootstrap-relative-compare",
    "  description: Bootstrap relative compare sources.",
    "  tags: []",
    "task:",
    "  prompt: Return ALPHA-42.",
    "workspace:",
    "  fixture: fixtures/smoke-skill-following/base",
    "  skillOverlay: fixtures/smoke-skill-following/skill-overlay",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: ALPHA-42",
    "  requests: 1",
    "  timeoutMs: 120000",
    "  tracing: false",
    "  noCache: true",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "    - id: skill",
    "      description: Skill",
    "      skillMode: enabled",
    "      skill:",
    "        source:",
    "          type: local-path",
    "          path: fixtures/smoke-skill-following/skill-overlay",
    "        install:",
    "          strategy: workspace-overlay",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
    "        executionMethod: command",
    "        commandPath: codex",
  ].join("\n"), "utf8");

  await execFileAsync(process.execPath, [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"], {
    cwd: tempDirectory,
    windowsHide: true,
  });

  const bootstrappedBase = path.join(tempDirectory, "fixtures", "smoke-skill-following", "base");
  const bootstrappedSkill = path.join(tempDirectory, "fixtures", "smoke-skill-following", "skill-overlay");
  const resultsRoot = path.join(tempDirectory, "results", "bootstrap-relative-compare");
  const runDirectories = await fs.readdir(resultsRoot);
  const noSkillRunDirectory = runDirectories.find((entry) => entry.endsWith("-codex-mini-no-skill"));
  const skillRunDirectory = runDirectories.find((entry) => entry.endsWith("-codex-mini-skill"));

  assert.equal(
    await fs.readFile(path.join(bootstrappedBase, "notes", "target.txt"), "utf8"),
    "MARKER=ALPHA-42\n",
  );
  assert.equal(
    await fs.readFile(path.join(bootstrappedSkill, "skills", "marker-guide", "SKILL.md"), "utf8"),
    await fs.readFile(
      fromProjectRoot("fixtures", "smoke-skill-following", "skill-overlay", "skills", "marker-guide", "SKILL.md"),
      "utf8",
    ),
  );
  assert.equal(await fs.stat(path.join(bootstrappedSkill, "AGENTS.md")).catch(() => null), null);
  assert.ok(noSkillRunDirectory);
  assert.ok(skillRunDirectory);
  assert.equal(
    await fs.stat(path.join(resultsRoot, noSkillRunDirectory, "workspace", "skills", "marker-guide", "SKILL.md")).catch(() => null),
    null,
  );
  assert.equal(
    await fs.stat(path.join(resultsRoot, noSkillRunDirectory, "workspace", "AGENTS.md")).catch(() => null),
    null,
  );
  assert.match(
    await fs.readFile(path.join(resultsRoot, skillRunDirectory, "workspace", "skills", "marker-guide", "SKILL.md"), "utf8"),
    /name: marker-guide/,
  );
  assert.equal(
    await fs.stat(path.join(resultsRoot, skillRunDirectory, "workspace", "AGENTS.md")).catch(() => null),
    null,
  );
});

test("compare dry-run bootstraps nested fixture matches for repo-summary relative paths", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-repo-summary-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: repo-summary-relative-compare",
    "  description: Bootstrap nested repo summary fixtures.",
    "  tags: []",
    "task:",
    "  prompt: Summarize the repository.",
    "workspace:",
    "  fixture: fixtures/skill-arena-compare/base/fixtures/repo-summary/base",
    "  skillOverlay: fixtures/skill-arena-compare/base/fixtures/repo-summary/skill-overlay",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: contains",
    "      value: repository",
    "  requests: 1",
    "  timeoutMs: 120000",
    "  tracing: false",
    "  noCache: true",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "    - id: skill",
    "      description: Skill",
    "      skillMode: enabled",
    "      skill:",
    "        source:",
    "          type: local-path",
    "          path: fixtures/skill-arena-compare/base/fixtures/repo-summary/skill-overlay",
    "        install:",
    "          strategy: workspace-overlay",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
    "        executionMethod: command",
    "        commandPath: codex",
  ].join("\n"), "utf8");

  await execFileAsync(process.execPath, [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"], {
    cwd: tempDirectory,
    windowsHide: true,
  });

  assert.match(
    await fs.readFile(path.join(tempDirectory, "fixtures", "skill-arena-compare", "base", "fixtures", "repo-summary", "base", "README.md"), "utf8"),
    /repo summary fixture/i,
  );
  assert.equal(
    await fs.stat(path.join(tempDirectory, "fixtures", "skill-arena-compare", "base", "fixtures", "repo-summary", "skill-overlay", "AGENTS.md")).catch(() => null),
    null,
  );
});

test("compare dry-run prints explicit maxConcurrency as the effective concurrency", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-concurrency-explicit-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: explicit-concurrency-compare",
    "  description: Explicit concurrency compare.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  fixture: fixtures/smoke-skill-following/base",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: HELLO",
    "  requests: 1",
    "  maxConcurrency: 4",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
  ].join("\n"), "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"],
    {
      cwd: tempDirectory,
      windowsHide: true,
    },
  );

  assert.match(stdout, /Parallel requests: 4/);
});

test("compare dry-run rewrites local judge shorthand into a packaged Promptfoo provider", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-judge-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: local-judge-compare",
    "  description: Compare local judge provider rewriting.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  fixture: fixtures/smoke-skill-following/base",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: llm-rubric",
    "      provider: skill-arena:judge:pi",
    "      value: Score 1.0 only if the answer is HELLO.",
    "  requests: 1",
    "  timeoutMs: 120000",
    "  tracing: false",
    "  noCache: true",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
  ].join("\n"), "utf8");

  await execFileAsync(
    process.execPath,
    [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"],
    {
      cwd: tempDirectory,
      windowsHide: true,
    },
  );

  const resultsRoot = path.join(tempDirectory, "results", "local-judge-compare");
  const runDirectories = await fs.readdir(resultsRoot);
  const compareRunDirectory = runDirectories.find((entry) => entry.endsWith("-compare"));
  const promptfooConfigContents = await fs.readFile(
    path.join(resultsRoot, compareRunDirectory, "promptfooconfig.yaml"),
    "utf8",
  );

  assert.match(promptfooConfigContents, /local-judge-provider\.js/);
  assert.match(promptfooConfigContents, /provider_id: skill-arena:judge:pi/);
  assert.match(promptfooConfigContents, /adapter: pi/);
});

test("compare dry-run uses SKILL_ARENA_MAX_PARALLELISM when maxConcurrency is omitted", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-concurrency-env-"));
  const compareConfigPath = path.join(tempDirectory, "compare.yaml");

  await fs.writeFile(compareConfigPath, [
    "schemaVersion: 1",
    "benchmark:",
    "  id: env-concurrency-compare",
    "  description: Env concurrency compare.",
    "  tags: []",
    "task:",
    "  prompt: Return HELLO.",
    "workspace:",
    "  fixture: fixtures/smoke-skill-following/base",
    "  initializeGit: true",
    "evaluation:",
    "  assertions:",
    "    - type: equals",
    "      value: HELLO",
    "  requests: 1",
    "comparison:",
    "  skillModes:",
    "    - id: no-skill",
    "      description: No skill",
    "      skillMode: disabled",
    "  variants:",
    "    - id: codex-mini",
    "      description: Codex mini",
    "      agent:",
    "        adapter: codex",
  ].join("\n"), "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    [fromProjectRoot("src", "cli", "run-compare.js"), "compare.yaml", "--dry-run"],
    {
      cwd: tempDirectory,
      env: {
        ...process.env,
        SKILL_ARENA_MAX_PARALLELISM: "7",
      },
      windowsHide: true,
    },
  );

  assert.match(stdout, /Parallel requests: 7/);
});
