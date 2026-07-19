import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-evolve-skill",
  "scripts",
  "evolve_skill_with_harbor.py",
);
const sourceTask = path.resolve(
  "evaluations",
  "harbor-report-parity-poc",
  "dataset",
  "marker-write",
);
const baselineSkill = path.resolve(
  "evaluations",
  "harbor-report-parity-poc",
  "skills",
  "harbor-marker-guide",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;
const simulation = path.resolve("test", "harbor-evolve-skill-simulation.py");

async function createTask(root, split, taskName) {
  const taskDirectory = path.join(root, "tasks", split, taskName);
  await fs.cp(sourceTask, taskDirectory, { recursive: true });
  const taskTomlPath = path.join(taskDirectory, "task.toml");
  const taskToml = await fs.readFile(taskTomlPath, "utf8");
  await fs.writeFile(
    taskTomlPath,
    taskToml.replace(
      /name = "skill-arena\/marker-write"/,
      "name = \"skill-tests/" + taskName + "\"",
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(taskDirectory, "instruction.md"),
    "Complete the " + taskName + " behavior.\n",
    "utf8",
  );
  return taskDirectory;
}

function runDry(configPath) {
  return spawnSync("uv", ["run", script, configPath, "--dry-run"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 60000,
  });
}

function configFor(root, tasks) {
  return {
    schemaVersion: 1,
    evolution: {
      id: "harbor-evolve-dry-run",
      baselineSkill,
      outputDir: path.join(root, "output"),
      objective: "Improve transferable instructions without benchmark leakage.",
      background: "Use Harbor rewards and diagnostics.",
    },
    harbor: {
      agent: {
        name: "codex",
        model: "openai/gpt-5.1-codex-mini",
        kwargs: {},
      },
      environment: "docker",
      concurrency: 2,
      rewardKey: "reward",
      holdoutAttempts: 2,
      requiredEnv: [],
    },
    gepa: {
      reflectionModel: "openai/gpt-5.1",
      reflectionMinibatchSize: 1,
      maxMetricCalls: 4,
      maxCandidateProposals: 1,
      seed: 7,
    },
    splits: {
      train: [tasks.train],
      validation: [tasks.validation],
      holdout: [tasks.holdout],
    },
    promotion: {
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

async function createAliasedSkill(root, logicalName) {
  const skill = path.join(root, "physical-alias");
  await fs.cp(baselineSkill, skill, { recursive: true });
  const skillPath = path.join(skill, "SKILL.md");
  const source = await fs.readFile(skillPath, "utf8");
  await fs.writeFile(
    skillPath,
    source.replace(/^name:.*$/m, `name: ${JSON.stringify(logicalName)}`),
    "utf8",
  );
  return skill;
}

test("Harbor evolution dry-run validates isolated train, validation, and holdout tasks", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-evolve-plan-"));
  try {
    const tasks = {
      train: await createTask(tempDirectory, "train", "train-case"),
      validation: await createTask(tempDirectory, "validation", "validation-case"),
      holdout: await createTask(tempDirectory, "holdout", "holdout-case"),
    };
    const configPath = path.join(tempDirectory, "evolution.yaml");
    await fs.writeFile(
      configPath,
      JSON.stringify(configFor(tempDirectory, tasks), null, 2),
      "utf8",
    );

    const completed = runDry(configPath);
    assert.equal(completed.status, 0, completed.stderr);
    const plan = JSON.parse(completed.stdout);
    assert.equal(plan.mode, "dry-run");
    assert.equal(plan.harborVersion, "0.18.0");
    assert.equal(plan.gepaVersion, "0.1.2");
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(plan.splits).map(([name, values]) => [
          name,
          values.map((value) => value.taskName),
        ]),
      ),
      {
        train: ["skill-tests/train-case"],
        validation: ["skill-tests/validation-case"],
        holdout: ["skill-tests/holdout-case"],
      },
    );
    await assert.rejects(fs.stat(path.join(tempDirectory, "output")), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor evolution dry-run rejects split leakage", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-evolve-leak-"));
  try {
    const train = await createTask(tempDirectory, "train", "train-case");
    const holdout = await createTask(tempDirectory, "holdout", "holdout-case");
    const config = configFor(tempDirectory, {
      train,
      validation: train,
      holdout,
    });
    const configPath = path.join(tempDirectory, "evolution.yaml");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const completed = runDry(configPath);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /occurs in both train and validation/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor evolution rejects unsafe logical names before staging", {
  skip: !uvAvailable,
}, async () => {
  for (const [index, logicalName] of [
    "../escaped",
    "toy_skill",
    "con",
    "a".repeat(65),
  ].entries()) {
    const tempDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), `harbor-evolve-name-${index}-`),
    );
    try {
      const tasks = {
        train: await createTask(tempDirectory, "train", "train-case"),
        validation: await createTask(
          tempDirectory,
          "validation",
          "validation-case",
        ),
        holdout: await createTask(tempDirectory, "holdout", "holdout-case"),
      };
      const config = configFor(tempDirectory, tasks);
      config.evolution.baselineSkill = await createAliasedSkill(
        tempDirectory,
        logicalName,
      );
      const configPath = path.join(tempDirectory, "evolution.yaml");
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

      const completed = runDry(configPath);
      assert.notEqual(completed.status, 0);
      assert.match(completed.stderr, /exact portable skill basename/i);
      await assert.rejects(fs.stat(path.join(tempDirectory, "output")), /ENOENT/);
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  }
});

test("Harbor evolution simulated lifecycle preserves baseline and gates on holdout", {
  skip: !uvAvailable,
}, () => {
  const completed = spawnSync("uv", ["run", simulation, script], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(completed.status, 0, completed.stderr);
  assert.deepEqual(JSON.parse(completed.stdout), {
    decision: "promote",
    developmentTrials: 2,
    holdoutBaselineTrials: 2,
    holdoutCandidateTrials: 2,
    aliasSourceBasename: "baseline",
    stagedSkillBasenames: ["simulation-skill"],
    stagedParentBasenames: ["skills"],
    verifiedIdentityTrials: 6,
  });
});

test("Harbor evolution fails closed when Harbor locks a staged alias", {
  skip: !uvAvailable,
}, () => {
  const completed = spawnSync(
    "uv",
    ["run", simulation, script, "tamper-lock-name"],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
      timeout: 60000,
    },
  );
  assert.equal(completed.status, 0, completed.stderr);
  assert.deepEqual(JSON.parse(completed.stdout), {
    status: "rejected",
    reason: "locked-name-mismatch",
    sourceUnchanged: true,
  });
});
