import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const script = path.join(
  root,
  "skills",
  "harbor-reflective-pareto-search",
  "scripts",
  "harbor_reflective_pareto.py",
);
const fixtureRoot = path.join(
  root,
  "evaluations",
  "harbor-report-parity-poc",
  "fixtures",
  "harbor-jobs",
);
const jobTemplate = path.join(
  root,
  "evaluations",
  "harbor-report-parity-poc",
  "jobs",
  "skill.yaml",
);

function run(config, ...args) {
  return spawnSync("uv", ["run", script, config, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
}

async function writeSkill(directory, extra = "") {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "SKILL.md"),
    [
      "---",
      "name: example-skill",
      "description: Exercise a deterministic example skill.",
      "---",
      "",
      "# Example Skill",
      "",
      "Follow the task contract.",
      extra,
      "",
    ].join("\n"),
  );
}

function configFor({
  output,
  baselineSkill,
  candidateSkill,
  baselineJob,
  candidateJob,
  baselineHoldout,
  candidateHoldout,
  archive,
  selected = false,
}) {
  return {
    schemaVersion: 1,
    search: {
      id: "fixture-pareto",
      baselineSkill,
      baselineCandidate: "baseline",
      outputDir: output,
      generation: 0,
      ...(selected
        ? {
            selectedCandidate: "improved",
            developmentArchive: archive,
          }
        : {}),
    },
    harbor: {
      developmentJob: jobTemplate,
      holdoutJob: jobTemplate,
      rewardKey: "reward",
      passThreshold: 1,
      requiredEnv: [],
    },
    candidates: [
      {
        id: "baseline",
        skill: baselineSkill,
        parents: [],
        rationale: "Frozen baseline.",
        jobDirectory: baselineJob,
        ...(baselineHoldout ? { holdoutJobDirectory: baselineHoldout } : {}),
      },
      {
        id: "improved",
        skill: candidateSkill,
        parents: ["baseline"],
        rationale: "Evidence-backed repair.",
        jobDirectory: candidateJob,
        ...(candidateHoldout ? { holdoutJobDirectory: candidateHoldout } : {}),
      },
    ],
    promotion: {
      minimumMeanGain: 0,
      allowCaseRegressions: false,
      requireNoErrors: true,
    },
  };
}

async function replaceInTrialResults(jobDirectory, replacements) {
  const entries = await fs.readdir(jobDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const resultPath = path.join(jobDirectory, entry.name, "result.json");
    let text = await fs.readFile(resultPath, "utf8");
    for (const [from, to] of replacements) {
      text = text.replaceAll(from, to);
    }
    await fs.writeFile(resultPath, text);
  }
}

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
    digest.update(relative);
    digest.update(Buffer.from([0]));
    digest.update(sha256(await fs.readFile(file)));
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest("hex")}`;
}

async function attachJobLock(jobDirectory, skill, {
  excludedExceptions,
  extraInstructions = null,
}) {
  const skillDigest = await computeSkillDigest(skill);
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const trials = [];
  for (const entry of trialDirectories) {
    const result = JSON.parse(
      await fs.readFile(path.join(jobDirectory, entry.name, "result.json"), "utf8"),
    );
    const taskLeaf = result.task_name.split("/").at(-1);
    trials.push({
      schema_version: 1,
      task: {
        name: taskLeaf,
        type: "local",
        digest: /^sha256:[0-9a-f]{64}$/.test(result.task_checksum)
          ? result.task_checksum
          : `sha256:${sha256(result.task_checksum)}`,
        source: "synthetic-pareto-test",
        path: `C:/fixture/${taskLeaf}`,
      },
      install_only: false,
      timeout_multiplier: 1,
      ...(extraInstructions ? { extra_instructions: extraInstructions } : {}),
      agent: {
        name: result.agent_info.name,
        model_name: `${result.agent_info.model_info.provider}/${result.agent_info.model_info.name}`,
        skills: [skill],
        extra_allowed_hosts: [],
        kwargs: {},
        mcp_servers: [],
      },
      skills: [{
        name: "example-skill",
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
    });
  }
  await fs.writeFile(
    path.join(jobDirectory, "lock.json"),
    JSON.stringify({
      schema_version: 2,
      created_at: "2026-07-16T12:00:00Z",
      harbor: { version: "0.18.0", is_editable: false },
      n_concurrent_trials: 2,
      retry: {
        max_retries: 0,
        exclude_exceptions: excludedExceptions,
        wait_multiplier: 1,
        min_wait_sec: 1,
        max_wait_sec: 60,
      },
      trials,
    }, null, 2),
    "utf8",
  );
}

test("Harbor reflective Pareto search builds an archive from native jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve verified recovery behavior.");
  const config = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: path.join(fixtureRoot, "no-skill"),
    candidateJob: path.join(fixtureRoot, "skill"),
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const summary = JSON.parse(completed.stdout);
  assert.equal(summary.bestAggregateCandidate, "improved");
  const archive = JSON.parse(
    await fs.readFile(summary.archive, "utf8"),
  );
  assert.equal(archive.source, "harbor");
  assert.equal(archive.holdoutDataUsed, false);
  assert.deepEqual(
    archive.archive.map((item) => item.candidateId),
    ["improved"],
  );
  assert.equal(archive.candidateResults.length, 2);
  assert.equal(archive.limitations.length, 1);
});

test("Harbor reflective Pareto search ignores exclude-exception set order", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-lock-set-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve verified recovery behavior.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill, {
    excludedExceptions: ["VerifierTimeoutError", "AgentTimeoutError"],
  });
  await attachJobLock(candidateJob, candidateSkill, {
    excludedExceptions: ["AgentTimeoutError", "VerifierTimeoutError"],
  });
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const archive = JSON.parse(
    await fs.readFile(JSON.parse(completed.stdout).archive, "utf8"),
  );
  assert.deepEqual(archive.limitations, []);
});

test("Harbor reflective Pareto search preserves ordered lock arrays", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-lock-order-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  const instructionA = {
    path: "C:/fixture/a.md",
    digest: `sha256:${sha256("instruction-a")}`,
  };
  const instructionB = {
    path: "C:/fixture/b.md",
    digest: `sha256:${sha256("instruction-b")}`,
  };
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve verified recovery behavior.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill, {
    excludedExceptions: ["AgentTimeoutError", "VerifierTimeoutError"],
    extraInstructions: [instructionA, instructionB],
  });
  await attachJobLock(candidateJob, candidateSkill, {
    excludedExceptions: ["VerifierTimeoutError", "AgentTimeoutError"],
    extraInstructions: [instructionB, instructionA],
  });
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.notEqual(completed.status, 0);
  assert.match(completed.stderr, /locks drift/i);
});

test("Harbor reflective Pareto search rejects incomplete native jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-incomplete-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const incomplete = path.join(temp, "incomplete-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Add one general rule.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), incomplete, { recursive: true });
  const rootResult = path.join(incomplete, "result.json");
  const payload = JSON.parse(await fs.readFile(rootResult, "utf8"));
  payload.finished_at = null;
  await fs.writeFile(rootResult, JSON.stringify(payload, null, 2));
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob: incomplete,
    candidateJob: path.join(fixtureRoot, "skill"),
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.notEqual(completed.status, 0);
  assert.match(completed.stderr, /Incomplete Harbor job/i);
});

test("Harbor reflective Pareto search gates only on disjoint holdout jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-holdout-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");

  const developmentConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: path.join(fixtureRoot, "no-skill"),
    candidateJob: path.join(fixtureRoot, "skill"),
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(developmentConfig, null, 2));
  const development = run(configPath, "--analyze-only");
  assert.equal(development.status, 0, development.stderr);
  const archive = JSON.parse(development.stdout).archive;

  const baselineHoldout = path.join(temp, "holdout-baseline");
  const candidateHoldout = path.join(temp, "holdout-candidate");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineHoldout, {
    recursive: true,
  });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateHoldout, {
    recursive: true,
  });
  const replacements = [
    ["sha256:marker-write-v1", "sha256:holdout-v2"],
    ["skill-arena/marker-write", "example/holdout"],
  ];
  await replaceInTrialResults(baselineHoldout, replacements);
  await replaceInTrialResults(candidateHoldout, replacements);

  const holdoutConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: path.join(fixtureRoot, "no-skill"),
    candidateJob: path.join(fixtureRoot, "skill"),
    baselineHoldout,
    candidateHoldout,
    archive,
    selected: true,
  });
  await fs.writeFile(configPath, JSON.stringify(holdoutConfig, null, 2));
  const completed = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const result = JSON.parse(completed.stdout);
  assert.equal(result.decision, "promote");
  const promotion = JSON.parse(await fs.readFile(result.promotion, "utf8"));
  assert.equal(promotion.holdout.promoted, true);
  assert.deepEqual(promotion.holdout.regressedCases, []);
  assert.equal(
    await fs.readFile(path.join(baselineSkill, "SKILL.md"), "utf8"),
    [
      "---",
      "name: example-skill",
      "description: Exercise a deterministic example skill.",
      "---",
      "",
      "# Example Skill",
      "",
      "Follow the task contract.",
      "",
      "",
    ].join("\n"),
  );
});
