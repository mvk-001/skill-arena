import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-operator-coevolution",
  "scripts",
  "harbor_operator_coevolution.py",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function computeSkillDigest(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  files.sort((left, right) => (
    path.relative(directory, left).replaceAll("\\", "/")
      .localeCompare(path.relative(directory, right).replaceAll("\\", "/"))
  ));
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    const relative = path.relative(directory, file).replaceAll("\\", "/");
    const contentDigest = sha256(await fs.readFile(file));
    digest.update(relative);
    digest.update(Buffer.from([0]));
    digest.update(contentDigest);
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest("hex")}`;
}

async function createSkill(root, candidateId, extraLines = 0) {
  const directory = path.join(root, "skills", candidateId);
  await fs.mkdir(directory, { recursive: true });
  const extras = Array.from({ length: extraLines }, (_, index) => `Rule ${index + 1}.`).join("\n");
  await fs.writeFile(
    path.join(directory, "SKILL.md"),
    [
      "---",
      "name: fixture-skill",
      "description: Guide the synthetic Harbor task.",
      "---",
      "",
      "# Fixture Skill",
      "",
      `Candidate ${candidateId}.`,
      extras,
      "",
    ].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n"),
    "utf8",
  );
  return directory;
}

function trialLock({ skill, skillDigest, taskName, taskChecksum }) {
  return {
    schema_version: 1,
    task: {
      name: taskName.split("/").at(-1),
      type: "local",
      digest: taskChecksum,
      source: "dataset",
      path: `C:/fixture/${taskName.split("/").at(-1)}`,
    },
    install_only: false,
    timeout_multiplier: 1,
    agent: {
      name: "codex",
      model_name: "openai/synthetic-model",
      skills: [skill],
      extra_allowed_hosts: [],
      kwargs: {},
      mcp_servers: [],
    },
    skills: [{
      name: "fixture-skill",
      source: skill,
      digest: skillDigest,
      git_url: null,
      git_commit_id: null,
    }],
    environment: {
      type: "docker",
      force_build: false,
      delete: true,
      cpu_enforcement_policy: "auto",
      memory_enforcement_policy: "auto",
      extra_docker_compose: [],
      kwargs: {},
      extra_allowed_hosts: [],
    },
    verifier: { disable: false },
  };
}

async function createJob({
  root,
  label,
  skill,
  rewards,
  taskName = "fixture/development",
  taskChecksum = `sha256:${sha256("development-task")}`,
  exceptionIndex = -1,
}) {
  const directory = path.join(root, "jobs", label);
  await fs.mkdir(directory, { recursive: true });
  const skillDigest = await computeSkillDigest(skill);
  const config = {
    job_name: label,
    jobs_dir: path.join(root, "jobs"),
    n_attempts: rewards.length,
    n_concurrent_trials: 2,
    environment: { type: "docker", force_build: false },
    agents: [{
      name: "codex",
      model_name: "openai/synthetic-model",
      skills: [skill],
    }],
    tasks: [{ path: `C:/fixture/${taskName.split("/").at(-1)}` }],
  };
  await fs.writeFile(
    path.join(directory, "config.json"),
    JSON.stringify(config, null, 2),
    "utf8",
  );

  const locks = [];
  for (let index = 0; index < rewards.length; index += 1) {
    const trialName = `${taskName.split("/").at(-1)}__${String(index + 1).padStart(2, "0")}`;
    const trialDirectory = path.join(directory, trialName);
    await fs.mkdir(path.join(trialDirectory, "agent"), { recursive: true });
    await fs.mkdir(path.join(trialDirectory, "verifier"), { recursive: true });
    const exception = index === exceptionIndex
      ? {
        exception_type: "AgentTimeoutError",
        exception_message: "synthetic timeout",
        exception_traceback: "synthetic traceback",
        occurred_at: "2026-07-15T12:00:01Z",
      }
      : null;
    const result = {
      id: crypto.randomUUID(),
      task_name: taskName,
      trial_name: trialName,
      trial_uri: `file:///${trialDirectory.replaceAll("\\", "/")}`,
      task_id: { path: `C:/fixture/${taskName.split("/").at(-1)}` },
      source: "synthetic-harbor-test",
      task_checksum: taskChecksum,
      config: {
        task: { path: `C:/fixture/${taskName.split("/").at(-1)}` },
        trial_name: trialName,
        agent: {
          name: "codex",
          model_name: "openai/synthetic-model",
          skills: [skill],
        },
      },
      agent_info: {
        name: "codex",
        version: "0.144.0",
        model_info: { name: "synthetic-model", provider: "openai" },
      },
      agent_result: {
        n_input_tokens: 100,
        n_cache_tokens: 20,
        n_output_tokens: 10,
        cost_usd: 0.01,
      },
      verifier_result: { rewards: { reward: rewards[index] } },
      exception_info: exception,
      started_at: "2026-07-15T12:00:00Z",
      finished_at: "2026-07-15T12:00:02Z",
      agent_execution: {
        started_at: "2026-07-15T12:00:00Z",
        finished_at: "2026-07-15T12:00:01Z",
      },
    };
    await fs.writeFile(
      path.join(trialDirectory, "result.json"),
      JSON.stringify(result, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(trialDirectory, "verifier", "test-output.txt"),
      `diagnostic for ${label} attempt ${index + 1}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(trialDirectory, "agent", "trajectory.json"),
      JSON.stringify({
        schema_version: "ATIF-v1.7",
        steps: [{ source: "agent", message: `agent evidence ${label}` }],
      }),
      "utf8",
    );
    locks.push(trialLock({ skill, skillDigest, taskName, taskChecksum }));
  }

  const completed = rewards.length;
  await fs.writeFile(
    path.join(directory, "result.json"),
    JSON.stringify({
      id: crypto.randomUUID(),
      started_at: "2026-07-15T12:00:00Z",
      updated_at: "2026-07-15T12:00:03Z",
      finished_at: "2026-07-15T12:00:03Z",
      n_total_trials: completed,
      stats: {
        n_completed_trials: completed,
        n_errored_trials: exceptionIndex >= 0 ? 1 : 0,
        n_running_trials: 0,
        n_pending_trials: 0,
        n_cancelled_trials: 0,
        n_retries: 0,
        evals: {},
        n_input_tokens: completed * 100,
        n_cache_tokens: completed * 20,
        n_output_tokens: completed * 10,
        cost_usd: completed * 0.01,
      },
    }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(directory, "lock.json"),
    JSON.stringify({
      schema_version: 2,
      created_at: "2026-07-15T12:00:00Z",
      harbor: { version: "0.18.0", is_editable: false },
      n_concurrent_trials: 2,
      retry: {
        max_retries: 0,
        exclude_exceptions: [],
        wait_multiplier: 1,
        min_wait_sec: 1,
        max_wait_sec: 60,
      },
      trials: locks,
    }, null, 2),
    "utf8",
  );
  return directory;
}

async function createFixture(root, {
  holdoutCandidateRewards = [0.8, 0.8],
  exceptionCandidate = null,
} = {}) {
  const definitions = [
    { id: "baseline", rewards: [0.8, 0.8], extra: 0 },
    { id: "weak-parent", rewards: [0.2, 0.2], extra: 1 },
    { id: "weak-child-a", rewards: [0.8, 0.8], extra: 2, parent: "weak-parent", operator: "op-a" },
    { id: "weak-child-b", rewards: [0.9, 0.9], extra: 3, parent: "weak-parent", operator: "op-a" },
    { id: "strong-child-a", rewards: [0.95, 0.95], extra: 4, parent: "baseline", operator: "op-b" },
    { id: "strong-child-b", rewards: [0.9, 0.9], extra: 5, parent: "baseline", operator: "op-b" },
  ];
  const candidates = [];
  const skills = new Map();
  const jobs = new Map();
  for (const definition of definitions) {
    const skill = await createSkill(root, definition.id, definition.extra);
    const job = await createJob({
      root,
      label: `development-${definition.id}`,
      skill,
      rewards: definition.rewards,
      exceptionIndex: definition.id === exceptionCandidate ? 0 : -1,
    });
    skills.set(definition.id, skill);
    jobs.set(definition.id, job);
    candidates.push({
      candidateId: definition.id,
      skill,
      ...(definition.parent ? {
        parentCandidateId: definition.parent,
        operatorId: definition.operator,
      } : {}),
      jobDirectory: job,
    });
  }
  const holdoutChecksum = `sha256:${sha256("holdout-task")}`;
  const holdoutBaseline = await createJob({
    root,
    label: "holdout-baseline",
    skill: skills.get("baseline"),
    rewards: [0.5, 0.5],
    taskName: "fixture/holdout",
    taskChecksum: holdoutChecksum,
  });
  const holdoutCandidate = await createJob({
    root,
    label: "holdout-candidate",
    skill: skills.get("strong-child-a"),
    rewards: holdoutCandidateRewards,
    taskName: "fixture/holdout",
    taskChecksum: holdoutChecksum,
  });
  const config = {
    schemaVersion: 1,
    evolution: {
      id: "synthetic-operator-search",
      generationId: "generation-001",
      outputDir: path.join(root, "default-output"),
      baselineCandidateId: "baseline",
    },
    harbor: {
      rewardKey: "reward",
      passThreshold: 1,
      requireNoErrors: true,
      requiredEnv: [],
      diagnosticChars: 1000,
    },
    coevolution: {
      candidateSurvivors: 2,
      operatorSurvivors: 2,
      nextOperatorCount: 6,
      minimumOperatorTrials: 2,
    },
    operators: [
      { operatorId: "op-a", instruction: "Improve a weak parent.", origin: "seed" },
      { operatorId: "op-b", instruction: "Refine a strong parent.", origin: "seed" },
    ],
    candidates,
    holdout: {
      baseline: { candidateId: "baseline", jobDirectory: holdoutBaseline },
      candidate: { candidateId: "strong-child-a", jobDirectory: holdoutCandidate },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
  const configPath = path.join(root, "generation.yaml");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return { config, configPath, jobs, skills };
}

function runAnalysis(configPath, outputDirectory) {
  return spawnSync(
    "uv",
    ["run", script, configPath, "--analyze-only", "--output-dir", outputDirectory],
    { cwd: path.resolve("."), encoding: "utf8", timeout: 60000 },
  );
}

async function readOutput(directory, name) {
  return JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
}

async function updateJobLock(jobDirectory, update) {
  const lockPath = path.join(jobDirectory, "lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  update(lock);
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
}

test("Harbor operator coevolution derives weak-parent credit and deterministic breeding", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-credit-"));
  try {
    const fixture = await createFixture(root);
    const firstOutput = path.join(root, "first-output");
    const secondOutput = path.join(root, "second-output");
    const first = runAnalysis(fixture.configPath, firstOutput);
    const second = runAnalysis(fixture.configPath, secondOutput);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);

    const candidates = await readOutput(firstOutput, "candidate-ranking.json");
    const operators = await readOutput(firstOutput, "operator-ranking.json");
    const breeding = await readOutput(firstOutput, "breeding-plan.json");
    const repeatedBreeding = await readOutput(secondOutput, "breeding-plan.json");
    const evidence = await readOutput(firstOutput, "generation-evidence.json");

    assert.equal(candidates.ranking[0].candidateId, "strong-child-a");
    assert.equal(candidates.ranking[0].effectiveFitness, 0.95);
    assert.equal(operators.ranking[0].operatorId, "op-a");
    assert.equal(operators.ranking[0].meanImprovement, 0.65);
    assert.equal(operators.ranking[0].established, true);
    assert.deepEqual(breeding, repeatedBreeding);
    assert.deepEqual(
      breeding.operators.slice(0, 4).map((entry) => entry.origin),
      ["survivor", "survivor", "mutation-plan", "crossover-plan"],
    );
    assert.match(evidence.development[0].trials[0].diagnostics.verifier, /diagnostic/);
    assert.match(evidence.development[0].trials[0].diagnostics.trajectory, /agent evidence/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution accepts source basenames but keeps identity strict", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-identity-"));
  try {
    const fixture = await createFixture(root);
    const candidateId = "strong-child-a";
    const candidateSkill = fixture.skills.get(candidateId);
    const candidateJobs = [
      fixture.jobs.get(candidateId),
      fixture.config.holdout.candidate.jobDirectory,
    ];
    for (const jobDirectory of candidateJobs) {
      await updateJobLock(jobDirectory, (lock) => {
        for (const trial of lock.trials) {
          trial.skills[0].name = path.basename(candidateSkill);
        }
      });
    }

    const validOutput = path.join(root, "identity-valid-output");
    const valid = runAnalysis(fixture.configPath, validOutput);
    assert.equal(valid.status, 0, valid.stderr);
    const evidence = await readOutput(validOutput, "generation-evidence.json");
    const candidateEvidence = evidence.development.find(
      (entry) => entry.candidateId === candidateId,
    );
    assert.equal(candidateEvidence.skillName, "fixture-skill");
    assert.equal(candidateEvidence.lockedSkillName, candidateId);
    assert.equal(candidateEvidence.skillSource, path.resolve(candidateSkill));

    await updateJobLock(fixture.jobs.get(candidateId), (lock) => {
      for (const trial of lock.trials) trial.skills[0].name = "unrelated-name";
    });
    const wrongName = runAnalysis(
      fixture.configPath,
      path.join(root, "identity-wrong-name-output"),
    );
    assert.notEqual(wrongName.status, 0);
    assert.match(wrongName.stderr, /locked skill name mismatch/i);

    await updateJobLock(fixture.jobs.get(candidateId), (lock) => {
      for (const trial of lock.trials) {
        trial.skills[0].name = path.basename(candidateSkill);
        trial.skills[0].source = fixture.skills.get("weak-parent");
      }
    });
    const wrongSource = runAnalysis(
      fixture.configPath,
      path.join(root, "identity-wrong-source-output"),
    );
    assert.notEqual(wrongSource.status, 0);
    assert.match(wrongSource.stderr, /locked skill source mismatch/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution ignores exclude-exception set order", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-lock-set-"));
  try {
    const fixture = await createFixture(root);
    const jobDirectories = [
      ...fixture.config.candidates.map((candidate) => candidate.jobDirectory),
      fixture.config.holdout.baseline.jobDirectory,
      fixture.config.holdout.candidate.jobDirectory,
    ];
    for (const [index, jobDirectory] of jobDirectories.entries()) {
      await updateJobLock(jobDirectory, (lock) => {
        lock.retry.exclude_exceptions = index % 2 === 0
          ? ["VerifierTimeoutError", "AgentTimeoutError"]
          : ["AgentTimeoutError", "VerifierTimeoutError"];
      });
    }

    const completed = runAnalysis(fixture.configPath, path.join(root, "output"));
    assert.equal(completed.status, 0, completed.stderr);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution preserves ordered lock arrays", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-lock-order-"));
  try {
    const fixture = await createFixture(root);
    const instructionA = {
      path: "C:/fixture/a.md",
      digest: `sha256:${sha256("instruction-a")}`,
    };
    const instructionB = {
      path: "C:/fixture/b.md",
      digest: `sha256:${sha256("instruction-b")}`,
    };
    for (const candidate of fixture.config.candidates) {
      await updateJobLock(candidate.jobDirectory, (lock) => {
        const reversed = candidate.candidateId === "weak-child-a";
        for (const trial of lock.trials) {
          trial.extra_instructions = reversed
            ? [instructionB, instructionA]
            : [instructionA, instructionB];
        }
      });
    }

    const completed = runAnalysis(fixture.configPath, path.join(root, "output"));
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /lock drift/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution rejects incomplete native jobs", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-incomplete-"));
  try {
    const fixture = await createFixture(root);
    const job = fixture.jobs.get("weak-child-a");
    const trialDirectories = (await fs.readdir(job, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory());
    await fs.rm(path.join(job, trialDirectories[0].name), { recursive: true, force: true });
    const completed = runAnalysis(fixture.configPath, path.join(root, "output"));
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /Incomplete Harbor job/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution rejects development drift", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-drift-"));
  try {
    const fixture = await createFixture(root);
    const job = fixture.jobs.get("weak-child-a");
    const trialDirectory = (await fs.readdir(job, { withFileTypes: true }))
      .find((entry) => entry.isDirectory());
    const resultPath = path.join(job, trialDirectory.name, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.task_checksum = `sha256:${sha256("drifted-task")}`;
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    const completed = runAnalysis(fixture.configPath, path.join(root, "output"));
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /drift/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution verifies locked candidate skill digests", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-digest-"));
  try {
    const fixture = await createFixture(root);
    const job = fixture.jobs.get("weak-child-a");
    const lockPath = path.join(job, "lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
    for (const trial of lock.trials) {
      trial.skills[0].digest = `sha256:${sha256("wrong-skill")}`;
    }
    await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
    const completed = runAnalysis(fixture.configPath, path.join(root, "output"));
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /Locked skill digest mismatch/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor trial errors are preserved and hard-gate candidate fitness", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-error-"));
  try {
    const fixture = await createFixture(root, { exceptionCandidate: "weak-child-a" });
    const output = path.join(root, "output");
    const completed = runAnalysis(fixture.configPath, output);
    assert.equal(completed.status, 0, completed.stderr);
    const candidates = await readOutput(output, "candidate-ranking.json");
    const evidence = await readOutput(output, "generation-evidence.json");
    const candidate = candidates.ranking.find((entry) => entry.candidateId === "weak-child-a");
    const candidateEvidence = evidence.development.find(
      (entry) => entry.candidateId === "weak-child-a",
    );
    assert.equal(candidate.hardGatesPassed, false);
    assert.equal(candidate.effectiveFitness, 0);
    assert.equal(candidateEvidence.errorCount, 1);
    assert.match(candidateEvidence.trials[0].error, /AgentTimeoutError/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("holdout rewards change promotion without changing selection or breeding", {
  skip: !uvAvailable,
}, async () => {
  const rootA = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-holdout-a-"));
  const rootB = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-holdout-b-"));
  try {
    const positive = await createFixture(rootA, { holdoutCandidateRewards: [0.8, 0.8] });
    const negative = await createFixture(rootB, { holdoutCandidateRewards: [0.1, 0.1] });
    const outputA = path.join(rootA, "output");
    const outputB = path.join(rootB, "output");
    const first = runAnalysis(positive.configPath, outputA);
    const second = runAnalysis(negative.configPath, outputB);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);

    const candidateA = await readOutput(outputA, "candidate-ranking.json");
    const candidateB = await readOutput(outputB, "candidate-ranking.json");
    const operatorA = await readOutput(outputA, "operator-ranking.json");
    const operatorB = await readOutput(outputB, "operator-ranking.json");
    const breedingA = await readOutput(outputA, "breeding-plan.json");
    const breedingB = await readOutput(outputB, "breeding-plan.json");
    const holdoutA = await readOutput(outputA, "holdout-promotion.json");
    const holdoutB = await readOutput(outputB, "holdout-promotion.json");

    assert.deepEqual(
      candidateA.ranking.map((entry) => entry.candidateId),
      candidateB.ranking.map((entry) => entry.candidateId),
    );
    assert.deepEqual(
      operatorA.ranking.map((entry) => entry.operatorId),
      operatorB.ranking.map((entry) => entry.operatorId),
    );
    assert.deepEqual(breedingA, breedingB);
    assert.equal(holdoutA.decision, "promote");
    assert.equal(holdoutB.decision, "keep-baseline");
  } finally {
    await fs.rm(rootA, { recursive: true, force: true });
    await fs.rm(rootB, { recursive: true, force: true });
  }
});

test("Harbor operator coevolution dry-run validates without creating outputs", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-operator-plan-"));
  try {
    const fixture = await createFixture(root);
    for (const candidate of fixture.config.candidates) {
      candidate.jobConfig = path.join(candidate.jobDirectory, "config.json");
      delete candidate.jobDirectory;
    }
    for (const side of [fixture.config.holdout.baseline, fixture.config.holdout.candidate]) {
      side.jobConfig = path.join(side.jobDirectory, "config.json");
      delete side.jobDirectory;
    }
    await fs.writeFile(
      fixture.configPath,
      JSON.stringify(fixture.config, null, 2),
      "utf8",
    );
    const completed = spawnSync(
      "uv",
      ["run", script, fixture.configPath, "--dry-run"],
      { cwd: path.resolve("."), encoding: "utf8", timeout: 60000 },
    );
    assert.equal(completed.status, 0, completed.stderr);
    const plan = JSON.parse(completed.stdout);
    assert.equal(plan.mode, "dry-run");
    assert.equal(plan.harborVersion, "0.18.0");
    await assert.rejects(fs.stat(path.join(root, "default-output")), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
