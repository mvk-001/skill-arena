import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-population-search",
  "scripts",
  "search_harbor_population.py",
);
const fixtures = path.resolve(
  "evaluations",
  "harbor-report-parity-poc",
  "fixtures",
  "harbor-jobs",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

function runSearch(args) {
  return spawnSync("uv", ["run", script, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 120000,
  });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function createToySkill(root, directoryName, body) {
  const skillDirectory = path.join(root, directoryName);
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, "SKILL.md"),
    [
      "---",
      "name: toy-harbor-skill",
      "description: Exercise native Harbor population analysis.",
      "---",
      "",
      "# Toy Harbor Skill",
      "",
      body,
      "",
    ].join("\n"),
    "utf8",
  );
  return skillDirectory;
}

async function stageJob(source, destination, skillDirectory, options = {}) {
  await fs.cp(source, destination, { recursive: true });
  const rootConfigPath = path.join(destination, "config.json");
  const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, "utf8"));
  rootConfig.job_name = path.basename(destination);
  rootConfig.jobs_dir = path.dirname(destination);
  for (const agent of rootConfig.agents) {
    agent.skills = [skillDirectory];
  }
  await writeJson(rootConfigPath, rootConfig);

  const entries = await fs.readdir(destination, { withFileTypes: true });
  const trialDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(destination, entry.name))
    .sort();
  const lockTrials = [];
  let errors = 0;
  for (const trialDirectory of trialDirectories) {
    const resultPath = path.join(trialDirectory, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.config.agent.skills = [skillDirectory];
    if (options.reward !== undefined) {
      result.verifier_result = { rewards: { reward: options.reward } };
      result.exception_info = null;
    }
    if (options.taskName) {
      result.task_name = options.taskName;
      result.task_checksum = options.taskChecksum;
    }
    if (result.exception_info) {
      errors += 1;
    }
    await writeJson(resultPath, result);
    await writeJson(path.join(trialDirectory, "config.json"), result.config);
    const trialLock = {
      schema_version: 1,
      task: {
        name: result.task_name,
        type: "local",
        digest: result.task_checksum,
      },
      agent: {
        name: result.agent_info.name,
        model_name: result.agent_info.model_info?.name ?? null,
      },
    };
    await writeJson(path.join(trialDirectory, "lock.json"), trialLock);
    lockTrials.push(trialLock);
  }

  const rootResultPath = path.join(destination, "result.json");
  const rootResult = JSON.parse(await fs.readFile(rootResultPath, "utf8"));
  rootResult.stats.n_errored_trials = errors;
  await writeJson(rootResultPath, rootResult);
  await writeJson(path.join(destination, "lock.json"), {
    schema_version: 2,
    harbor: { version: "0.18.0", is_editable: false },
    trials: lockTrials,
  });

  if (options.feedback) {
    const firstTrial = trialDirectories[0];
    await writeJson(path.join(firstTrial, "agent", "trajectory.json"), {
      schema_version: "ATIF-v1.7",
      steps: [],
    });
    await fs.mkdir(path.join(firstTrial, "verifier"), { recursive: true });
    await fs.writeFile(
      path.join(firstTrial, "verifier", "test-output.txt"),
      "diagnostic evidence\n",
      "utf8",
    );
  }
  return destination;
}

function baseArgs(template, baselineSkill, candidateSkill, output) {
  return [
    "--job-template",
    template,
    "--candidate",
    "baseline=" + baselineSkill,
    "--candidate",
    "challenger=" + candidateSkill,
    "--baseline",
    "baseline",
    "--output",
    output,
  ];
}

test("Harbor population search plans without output writes", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-plan-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Keep baseline behavior.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Try improved behavior.");
    const template = path.join(fixtures, "skill", "config.json");
    const output = path.join(tempDirectory, "output");

    const doctor = runSearch([
      ...baseArgs(template, baseline, challenger, output),
      "--doctor",
    ]);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).mode, "doctor");

    const dryRun = runSearch([
      ...baseArgs(template, baseline, challenger, output),
      "--dry-run",
    ]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(JSON.parse(dryRun.stdout).mode, "dry-run");
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search parses artifacts, ranks development, preserves baseline, and gates holdout", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-rank-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Keep baseline behavior.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Try improved behavior.");
    const jobs = path.join(tempDirectory, "jobs");
    const developmentBaseline = await stageJob(
      path.join(fixtures, "no-skill"),
      path.join(jobs, "development-baseline"),
      baseline,
    );
    const developmentChallenger = await stageJob(
      path.join(fixtures, "skill"),
      path.join(jobs, "development-challenger"),
      challenger,
      { feedback: true },
    );
    const holdoutBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(jobs, "holdout-baseline"),
      baseline,
      {
        reward: 1,
        taskName: "holdout/marker-write",
        taskChecksum: "sha256:holdout-marker-v1",
      },
    );
    const holdoutWinner = await stageJob(
      path.join(fixtures, "skill"),
      path.join(jobs, "holdout-winner"),
      challenger,
      {
        reward: 0,
        taskName: "holdout/marker-write",
        taskChecksum: "sha256:holdout-marker-v1",
      },
    );
    const developmentTemplate = path.join(developmentChallenger, "config.json");
    const holdoutTemplate = path.join(holdoutBaseline, "config.json");
    const output = path.join(tempDirectory, "output");
    const baselineBefore = await fs.readFile(path.join(baseline, "SKILL.md"), "utf8");

    const completed = runSearch([
      ...baseArgs(developmentTemplate, baseline, challenger, output),
      "--job",
      "baseline=" + developmentBaseline,
      "--job",
      "challenger=" + developmentChallenger,
      "--holdout-template",
      holdoutTemplate,
      "--holdout-job",
      "baseline=" + holdoutBaseline,
      "--holdout-job",
      "winner=" + holdoutWinner,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const ranking = JSON.parse(
      await fs.readFile(path.join(output, "generation-000", "ranking.json"), "utf8"),
    );
    assert.equal(ranking.selectedWinner, "challenger");
    assert.deepEqual(ranking.survivors, ["challenger", "baseline"]);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "challenger");
    assert.equal(run.holdout.status, "complete");
    assert.equal(run.holdout.promoted, false);
    assert.equal(run.holdout.baselineMeanReward, 1);
    assert.equal(run.holdout.winnerMeanReward, 0);

    const result = JSON.parse(
      await fs.readFile(
        path.join(
          output,
          "generation-000",
          "candidates",
          "challenger",
          "candidate-result.json",
        ),
        "utf8",
      ),
    );
    assert.equal(result.source, "harbor");
    assert.equal(result.fitness, 1);
    assert.ok(result.trials.some((trial) => trial.trajectoryPath));
    assert.ok(result.trials.some((trial) =>
      trial.verifierFiles.some((file) => file.endsWith("test-output.txt"))
    ));

    await fs.writeFile(path.join(baseline, "SKILL.md"), "mutated source\n", "utf8");
    assert.equal(
      await fs.readFile(path.join(output, "baseline-skill", "SKILL.md"), "utf8"),
      baselineBefore,
    );
    const log = JSON.parse(
      await fs.readFile(path.join(output, "population-search-log.json"), "utf8"),
    );
    assert.equal(log.generations.length, 1);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects incomplete jobs", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-incomplete-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Keep baseline behavior.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Try improved behavior.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
    );
    const trial = (await fs.readdir(challengerJob, { withFileTypes: true }))
      .find((entry) => entry.isDirectory());
    await fs.rm(path.join(challengerJob, trial.name), { recursive: true, force: true });

    const completed = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        path.join(tempDirectory, "output"),
      ),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /Incomplete Harbor job/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects task drift across candidate jobs", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-drift-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Keep baseline behavior.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Try improved behavior.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
    );
    const trial = (await fs.readdir(challengerJob, { withFileTypes: true }))
      .find((entry) => entry.isDirectory());
    const resultPath = path.join(challengerJob, trial.name, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.task_checksum = "sha256:drifted-task";
    await writeJson(resultPath, result);

    const completed = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        path.join(tempDirectory, "output"),
      ),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /drift detected/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
