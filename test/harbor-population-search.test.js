import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  "test",
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

async function createToySkill(
  root,
  directoryName,
  body,
  logicalName = "toy-harbor-skill",
) {
  const skillDirectory = path.join(root, directoryName);
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, "SKILL.md"),
    [
      "---",
      "name: " + logicalName,
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

async function logicalSkillName(skillDirectory) {
  const text = await fs.readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
  const match = text.match(/^---\s*\r?\n[\s\S]*?^name:\s*([^\r\n]+)$/m);
  assert.ok(match, "toy skill must declare frontmatter.name");
  return match[1].trim();
}

async function harborSkillDigest(skillDirectory) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(absolute);
    }
  }
  await visit(skillDirectory);
  files.sort((left, right) => {
    const a = path.relative(skillDirectory, left).split(path.sep).join("/");
    const b = path.relative(skillDirectory, right).split(path.sep).join("/");
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const digest = createHash("sha256");
  for (const file of files) {
    const relative = path.relative(skillDirectory, file).split(path.sep).join("/");
    const contentDigest = createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex");
    digest.update(relative);
    digest.update(Buffer.from([0]));
    digest.update(contentDigest);
    digest.update(Buffer.from([0]));
  }
  return "sha256:" + digest.digest("hex");
}

async function stageJob(source, destination, skillDirectory, options = {}) {
  await fs.cp(source, destination, { recursive: true });
  const declaredName = await logicalSkillName(skillDirectory);
  const installedName = options.legacyAlias ?? declaredName;
  const evaluatedSkillDirectory = path.join(
    destination + "-skill-input",
    "skills",
    installedName,
  );
  await fs.cp(skillDirectory, evaluatedSkillDirectory, { recursive: true });
  const evaluatedSkillDigest = options.lockDigestOverride
    ?? await harborSkillDigest(evaluatedSkillDirectory);
  const lockedSkill = {
    name: installedName,
    source: evaluatedSkillDirectory,
    digest: evaluatedSkillDigest,
  };
  const rootConfigPath = path.join(destination, "config.json");
  const rootConfig = JSON.parse(await fs.readFile(rootConfigPath, "utf8"));
  rootConfig.job_name = path.basename(destination);
  rootConfig.jobs_dir = path.dirname(destination);
  for (const agent of rootConfig.agents) {
    agent.skills = [evaluatedSkillDirectory];
  }
  await writeJson(rootConfigPath, rootConfig);

  const entries = await fs.readdir(destination, { withFileTypes: true });
  const trialDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(destination, entry.name))
    .sort();
  const lockTrials = [];
  let errors = 0;
  for (const [trialIndex, trialDirectory] of trialDirectories.entries()) {
    const trialOutcome = options.trialOutcomes?.[trialIndex] ?? {};
    const resultPath = path.join(trialDirectory, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.config.agent.skills = [evaluatedSkillDirectory];
    const selectedReward = Object.hasOwn(trialOutcome, "reward")
      ? trialOutcome.reward
      : options.reward;
    if (selectedReward !== undefined) {
      result.verifier_result = { rewards: { reward: selectedReward } };
      result.exception_info = null;
    }
    const additionalRewards = {
      ...(options.rewards ?? {}),
      ...(trialOutcome.rewards ?? {}),
    };
    if (Object.keys(additionalRewards).length) {
      result.verifier_result ??= {};
      result.verifier_result.rewards = {
        ...(result.verifier_result.rewards ?? {}),
        ...additionalRewards,
      };
      result.exception_info = null;
    }
    const taskName = trialOutcome.taskName ?? options.taskName;
    const taskChecksum = trialOutcome.taskChecksum ?? options.taskChecksum;
    if (taskName) {
      result.task_name = taskName;
      result.task_checksum = taskChecksum;
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
      ...(options.omitLockSkills ? {} : { skills: [lockedSkill] }),
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
  if (options.diagnostics) {
    for (const trialDirectory of trialDirectories) {
      await writeJson(
        path.join(trialDirectory, "verifier", "diagnostics.json"),
        options.diagnostics,
      );
    }
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
    const logicalName = "consult-semantic-okf";
    const baseline = await createToySkill(
      tempDirectory,
      "baseline",
      "Keep baseline behavior.",
      logicalName,
    );
    const challenger = await createToySkill(
      tempDirectory,
      "challenger",
      "Try improved behavior.",
      logicalName,
    );
    const template = path.join(fixtures, "skill", "config.json");
    const output = path.join(tempDirectory, "output");

    const doctor = runSearch([
      ...baseArgs(template, baseline, challenger, output),
      "--doctor",
    ]);
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorPlan = JSON.parse(doctor.stdout);
    assert.equal(doctorPlan.mode, "doctor");
    assert.equal(doctorPlan.skillName, logicalName);
    assert.equal(doctorPlan.minimumDevelopmentPassRate, 0);
    for (const candidate of doctorPlan.candidates) {
      assert.equal(candidate.skillName, logicalName);
      assert.equal(path.basename(candidate.frozenSkill), logicalName);
      assert.equal(path.basename(path.dirname(candidate.frozenSkill)), "skills");
      assert.notEqual(path.basename(candidate.frozenSkill), "skill");
    }

    const dryRun = runSearch([
      ...baseArgs(template, baseline, challenger, output),
      "--holdout-template",
      template,
      "--dry-run",
    ]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRunPlan = JSON.parse(dryRun.stdout);
    assert.equal(dryRunPlan.mode, "dry-run");
    assert.equal(dryRunPlan.holdoutAttempt, 0);
    assert.equal(
      dryRunPlan.holdoutAttemptDirectory,
      path.join(output, "holdout", "generation-000", "attempt-000"),
    );
    assert.deepEqual(Object.keys(dryRunPlan.holdoutSkills).sort(), [
      "baseline",
      "winner",
    ]);
    for (const skillPath of Object.values(dryRunPlan.holdoutSkills)) {
      assert.equal(path.basename(skillPath), logicalName);
      assert.equal(path.basename(path.dirname(skillPath)), "skills");
    }
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects unsafe logical names without identity-changing fallback", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-name-"));
  try {
    const template = path.join(fixtures, "skill", "config.json");
    for (const [index, logicalName] of ["../escaped", "toy_skill", "con"].entries()) {
      const caseRoot = path.join(tempDirectory, "case-" + index);
      const baseline = await createToySkill(
        caseRoot,
        "baseline",
        "Keep baseline behavior.",
        logicalName,
      );
      const challenger = await createToySkill(
        caseRoot,
        "challenger",
        "Try improved behavior.",
        logicalName,
      );
      const output = path.join(caseRoot, "output");
      const completed = runSearch([
        ...baseArgs(template, baseline, challenger, output),
        "--doctor",
      ]);
      assert.notEqual(completed.status, 0);
      assert.match(completed.stderr, /exact portable skill basename/i);
      assert.match(completed.stderr, /No fallback name is used/i);
      await assert.rejects(fs.stat(output), /ENOENT/);
    }
    await assert.rejects(fs.stat(path.join(tempDirectory, "escaped")), /ENOENT/);
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
    assert.equal(run.skillName, "toy-harbor-skill");
    assert.equal(run.selectedWinner, "challenger");
    assert.equal(run.holdout.status, "complete");
    assert.equal(run.holdout.promoted, false);
    assert.equal(run.holdout.baselineMeanReward, 1);
    assert.equal(run.holdout.winnerMeanReward, 0);
    assert.equal(run.holdout.minimumDevelopmentPassRate, 0);
    assert.equal(run.holdout.developmentPassRateEligible, true);
    assert.equal(run.holdout.provenanceVerified, true);
    assert.equal(run.holdout.attempt.generation, 0);
    assert.equal(run.holdout.attempt.attempt, 0);
    const holdoutAttempt = run.holdout.attempt.directory;
    assert.equal(
      holdoutAttempt,
      path.join(output, "holdout", "generation-000", "attempt-000"),
    );
    const attemptManifest = JSON.parse(
      await fs.readFile(path.join(holdoutAttempt, "attempt.json"), "utf8"),
    );
    assert.equal(attemptManifest.generation, 0);
    assert.equal(attemptManifest.attempt, 0);
    assert.equal(attemptManifest.winnerCandidate, "challenger");
    assert.equal(attemptManifest.winnerDigest, run.ranking[0].skillDigest);
    for (const [role, skillPath] of Object.entries(run.holdout.candidateSkills)) {
      assert.ok(["baseline", "winner"].includes(role));
      assert.equal(path.basename(skillPath), "toy-harbor-skill");
      assert.equal(path.basename(path.dirname(skillPath)), "skills");
      await fs.stat(path.join(skillPath, "SKILL.md"));
      const holdoutConfig = await fs.readFile(
        path.join(holdoutAttempt, role, "harbor-job.yaml"),
        "utf8",
      );
      assert.ok(holdoutConfig.includes(skillPath));
    }

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
    assert.equal(result.provenance.status, "verified");
    assert.equal(result.provenance.verified, true);
    assert.ok(result.trials.some((trial) => trial.trajectoryPath));
    assert.ok(result.trials.some((trial) =>
      trial.verifierFiles.some((file) => file.endsWith("test-output.txt"))
    ));

    for (const candidateId of ["baseline", "challenger"]) {
      const candidate = JSON.parse(
        await fs.readFile(
          path.join(
            output,
            "generation-000",
            "candidates",
            candidateId,
            "candidate.json",
          ),
          "utf8",
        ),
      );
      assert.equal(candidate.skillName, "toy-harbor-skill");
      assert.equal(path.basename(candidate.frozenSkill), candidate.skillName);
      assert.equal(path.basename(path.dirname(candidate.frozenSkill)), "skills");
      const nativeConfig = await fs.readFile(candidate.nativeJobConfig, "utf8");
      assert.ok(nativeConfig.includes(candidate.frozenSkill));
    }

    await fs.writeFile(path.join(baseline, "SKILL.md"), "mutated source\n", "utf8");
    assert.equal(
      await fs.readFile(
        path.join(
          output,
          "baseline-skill",
          "skills",
          "toy-harbor-skill",
          "SKILL.md",
        ),
        "utf8",
      ),
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

test("Harbor population search applies non-compensating required reward gates", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-gates-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Keep baseline behavior.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Try improved behavior.");
    const missing = await createToySkill(tempDirectory, "missing", "Omit an evaluator metric.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0.6, rewards: { mechanical_qualification_gate: 1 } },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      { reward: 1, rewards: { mechanical_qualification_gate: 0 } },
    );
    const missingJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "missing-job"),
      missing,
      { reward: 1 },
    );
    const output = path.join(tempDirectory, "output");

    const completed = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        output,
      ),
      "--candidate",
      "missing=" + missing,
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--job",
      "missing=" + missingJob,
      "--required-reward",
      "mechanical_qualification_gate=1",
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "baseline");
    assert.equal(run.ranking[0].qualified, true);
    assert.equal(run.ranking[1].candidateId, "challenger");
    assert.equal(run.ranking[1].qualified, false);
    assert.equal(run.ranking[1].fitness, 0);
    assert.equal(run.ranking[2].candidateId, "missing");
    assert.equal(run.ranking[2].qualified, false);

    const challengerResult = JSON.parse(
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
    assert.equal(challengerResult.summary.meanReward, 1);
    assert.equal(
      challengerResult.qualification.belowThresholdRewards,
      challengerResult.summary.expectedTrials,
    );
    assert.ok(
      challengerResult.trials.every(
        (trial) => trial.qualificationFailures[0].reason === "below-threshold",
      ),
    );

    const missingResult = JSON.parse(
      await fs.readFile(
        path.join(
          output,
          "generation-000",
          "candidates",
          "missing",
          "candidate-result.json",
        ),
        "utf8",
      ),
    );
    assert.equal(
      missingResult.qualification.missingRequiredRewards,
      missingResult.summary.expectedTrials,
    );
    assert.ok(
      missingResult.trials.every(
        (trial) => trial.requiredRewards.mechanical_qualification_gate === null,
      ),
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search requires the configured development pass rate before holdout", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-pass-rate-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Return valid evidence.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Return valid evidence.");
    const qualifiedZero = {
      reward: 0,
      rewards: { mechanical_qualification_gate: 1 },
    };
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      qualifiedZero,
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      qualifiedZero,
    );
    const template = path.join(baselineJob, "config.json");
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(template, baseline, challenger, output),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--required-reward",
      "mechanical_qualification_gate=1",
      "--minimum-development-pass-rate",
      "1.0",
      "--holdout-template",
      template,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.minimumDevelopmentPassRate, 1);
    assert.equal(run.selectedWinner, null);
    assert.deepEqual(run.survivors, ["baseline", "challenger"]);
    assert.deepEqual(run.repairParents, ["baseline", "challenger"]);
    assert.equal(run.holdout.status, "not-eligible");
    assert.equal(run.holdout.minimumDevelopmentPassRate, 1);
    assert.match(run.holdout.nextStep, /pass rate at least 1/);
    assert.ok(
      run.ranking.every(
        (row) => row.qualified
          && row.passRate === 0
          && row.winnerEligible === false
          && row.winnerIneligibilityReasons.includes(
            "development-pass-rate-below-minimum",
          ),
      ),
    );
    assert.deepEqual(run.holdout.candidateReasons, {
      baseline: ["development-pass-rate-below-minimum"],
      challenger: ["development-pass-rate-below-minimum"],
    });
    await assert.rejects(fs.stat(path.join(output, "holdout")), /ENOENT/);

    const invalid = runSearch([
      ...baseArgs(template, baseline, challenger, path.join(tempDirectory, "invalid")),
      "--minimum-development-pass-rate",
      "1.01",
      "--doctor",
    ]);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /must be between 0 and 1/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search preserves complementary qualification signals for repair", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-repair-signals-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "No gate passes.");
    const contract = await createToySkill(tempDirectory, "contract", "Preserve contract.");
    const coverage = await createToySkill(tempDirectory, "coverage", "Preserve coverage.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0, rewards: { contract_gate: 0, coverage_gate: 0 } },
    );
    const contractJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "contract-job"),
      contract,
      { reward: 0, rewards: { contract_gate: 1, coverage_gate: 0 } },
    );
    const coverageJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "coverage-job"),
      coverage,
      { reward: 0, rewards: { contract_gate: 0, coverage_gate: 1 } },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      "--job-template",
      path.join(baselineJob, "config.json"),
      "--candidate",
      "baseline=" + baseline,
      "--candidate",
      "contract=" + contract,
      "--candidate",
      "coverage=" + coverage,
      "--baseline",
      "baseline",
      "--output",
      output,
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "contract=" + contractJob,
      "--job",
      "coverage=" + coverageJob,
      "--required-reward",
      "contract_gate=1",
      "--required-reward",
      "coverage_gate=1",
      "--minimum-development-pass-rate",
      "1",
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, null);
    assert.deepEqual(run.repairParents, ["contract", "coverage"]);
    assert.equal(run.bestEvolvableCandidate, "contract");
    const byId = Object.fromEntries(run.ranking.map((row) => [row.candidateId, row]));
    assert.deepEqual(byId.contract.passedRequiredRewards, ["contract_gate"]);
    assert.deepEqual(byId.coverage.passedRequiredRewards, ["coverage_gate"]);
    assert.deepEqual(byId.baseline.passedRequiredRewards, []);
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

test("Harbor population search keeps provider failures separate from semantic zero", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-provider-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Return a scored zero.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Hit a provider limit.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0 },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      {
        reward: 0,
        diagnostics: {
          status: "provider-failure",
          failure_domain: "provider",
          terminal_outcome: "provider-context-limit",
          error_code: "context_length_exceeded",
        },
      },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        output,
      ),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "baseline");
    assert.equal(run.ranking[0].fitness, 0);
    assert.equal(run.ranking[1].fitness, null);
    assert.equal(run.ranking[1].providerFailureTrials, 4);

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
    assert.equal(result.summary.evaluableTrials, 0);
    assert.equal(result.summary.evaluableMeanReward, null);
    assert.equal(result.qualification.passed, false);
    assert.ok(result.trials.every((trial) => trial.providerFailure));
    assert.ok(result.trials.every(
      (trial) => trial.terminalOutcomes.includes("provider-context-limit"),
    ));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search preserves a missing provider reward as unavailable", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-missing-primary-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Return a scored zero.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Fail authentication.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0 },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      {
        reward: 0,
        diagnostics: {
          status: "provider-failure",
          failure_domain: "authentication",
          terminal_outcome: "authentication-failed",
          error_code: "invalid_api_key",
        },
      },
    );
    const trialDirectories = (await fs.readdir(challengerJob, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory());
    for (const entry of trialDirectories) {
      const resultPath = path.join(challengerJob, entry.name, "result.json");
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      delete result.verifier_result.rewards.reward;
      await writeJson(resultPath, result);
    }

    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(path.join(baselineJob, "config.json"), baseline, challenger, output),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    const row = run.ranking.find((item) => item.candidateId === "challenger");
    assert.equal(row.fitness, null);
    assert.equal(row.meanReward, null);
    assert.equal(row.winnerEligible, false);

    const result = JSON.parse(await fs.readFile(
      path.join(
        output,
        "generation-000",
        "candidates",
        "challenger",
        "candidate-result.json",
      ),
      "utf8",
    ));
    assert.equal(result.summary.evaluableTrials, 0);
    assert.equal(result.summary.evaluableMeanReward, null);
    assert.equal(result.summary.meanReward, null);
    assert.equal(result.qualification.missingPrimaryRewards, 0);
    assert.ok(result.trials.every((trial) => trial.reward === null));
    assert.ok(result.trials.every((trial) => trial.reportedReward === null));
    assert.ok(result.trials.every((trial) => !trial.missingPrimaryReward));
    assert.ok(result.trials.every((trial) => trial.infrastructureFailure));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search stages a baseline repair when every candidate is non-evaluable", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-repair-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Exceed context.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Hit rate limit.");
    const providerDiagnostics = {
      status: "provider-failure",
      failure_domain: "provider",
      terminal_outcome: "provider-context-limit",
      error_code: "context_length_exceeded",
    };
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0, diagnostics: providerDiagnostics },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      { reward: 0, diagnostics: providerDiagnostics },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        output,
      ),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);

    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, null);
    assert.equal(run.bestEvolvableCandidate, null);
    assert.deepEqual(run.survivors, []);
    assert.deepEqual(run.repairParents, ["baseline"]);
    assert.deepEqual(run.nextGeneration.parents, ["baseline"]);
    assert.equal(run.holdout.status, "not-eligible");
    assert.ok(run.ranking.every((row) => row.fitness === null));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search binds analyze-only jobs to the supplied bundle digest", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-provenance-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline content.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Different content.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0 },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      { reward: 1 },
    );
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
      // Deliberately map the baseline job to a different candidate.
      "challenger=" + baselineJob,
      "--analyze-only",
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /locked skill digest does not match/i);
    await fs.stat(challengerJob);

    const baselineConfig = JSON.parse(
      await fs.readFile(path.join(baselineJob, "config.json"), "utf8"),
    );
    const challengerConfigPath = path.join(challengerJob, "config.json");
    const challengerConfig = JSON.parse(await fs.readFile(challengerConfigPath, "utf8"));
    for (const agent of challengerConfig.agents) {
      agent.skills = [...baselineConfig.agents[0].skills];
    }
    await writeJson(challengerConfigPath, challengerConfig);
    const sourceDrift = runSearch([
      ...baseArgs(
        path.join(baselineJob, "config.json"),
        baseline,
        challenger,
        path.join(tempDirectory, "source-drift-output"),
      ),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.notEqual(sourceDrift.status, 0);
    assert.match(sourceDrift.stderr, /root and trial JobConfigs install different/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search keeps legacy aliases exploratory and non-promotable", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-legacy-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline content.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Improved content.");
    const developmentBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-baseline"),
      baseline,
      { reward: 0, legacyAlias: "skill" },
    );
    const developmentWinner = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-winner"),
      challenger,
      { reward: 1, legacyAlias: "skill" },
    );
    const holdoutBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-baseline"),
      baseline,
      { reward: 0, taskName: "holdout/provenance", taskChecksum: "holdout-a" },
    );
    const holdoutWinner = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-winner"),
      challenger,
      { reward: 1, taskName: "holdout/provenance", taskChecksum: "holdout-a" },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(
        path.join(developmentBaseline, "config.json"),
        baseline,
        challenger,
        output,
      ),
      "--job",
      "baseline=" + developmentBaseline,
      "--job",
      "challenger=" + developmentWinner,
      "--holdout-template",
      path.join(holdoutBaseline, "config.json"),
      "--holdout-job",
      "baseline=" + holdoutBaseline,
      "--holdout-job",
      "winner=" + holdoutWinner,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);
    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "challenger");
    assert.equal(run.provenance.challenger.status, "exploratory");
    assert.deepEqual(run.provenance.challenger.reasons, [
      "legacy-installed-skill-alias",
    ]);
    assert.equal(run.holdout.status, "complete-exploratory");
    assert.equal(run.holdout.provenanceVerified, false);
    assert.equal(run.holdout.promoted, false);
    assert.ok(run.holdout.promotionBlockers.includes("exploratory-provenance"));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search normalizes the complete external failure matrix", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-failure-matrix-"));
  try {
    const definitions = {
      auth: [{ failure_domain: "auth" }, "authentication"],
      credential: [{ status: "invalid_api_key" }, "authentication"],
      environment: [{ terminal_outcome: "docker_startup_failed" }, "environment"],
      evaluator: [{ status: "verifier-error" }, "evaluator"],
      infrastructure: [{ error_code: "platform_unavailable" }, "infrastructure"],
      provider: [{ terminal_outcome: "context_length_exceeded" }, "provider"],
    };
    const candidates = {};
    const jobs = {};
    candidates.baseline = await createToySkill(tempDirectory, "baseline", "Semantic zero.");
    jobs.baseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      candidates.baseline,
      { reward: 0 },
    );
    for (const [id, [diagnostics]] of Object.entries(definitions)) {
      candidates[id] = await createToySkill(tempDirectory, id, "External failure.");
      jobs[id] = await stageJob(
        path.join(fixtures, "skill"),
        path.join(tempDirectory, id + "-job"),
        candidates[id],
        { reward: 0, diagnostics },
      );
    }
    const output = path.join(tempDirectory, "output");
    const args = [
      "--job-template",
      path.join(jobs.baseline, "config.json"),
      "--baseline",
      "baseline",
      "--output",
      output,
      "--analyze-only",
    ];
    for (const id of Object.keys(candidates)) {
      args.push("--candidate", id + "=" + candidates[id], "--job", id + "=" + jobs[id]);
    }
    const completed = runSearch(args);
    assert.equal(completed.status, 0, completed.stderr);
    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    for (const [id, [, expectedDomain]] of Object.entries(definitions)) {
      const row = run.ranking.find((candidate) => candidate.candidateId === id);
      assert.equal(row.fitness, null, id);
      const result = JSON.parse(await fs.readFile(
        path.join(output, "generation-000", "candidates", id, "candidate-result.json"),
        "utf8",
      ));
      assert.equal(result.qualification.infrastructureFailureTrials, 4, id);
      assert.ok(
        result.trials.every((trial) =>
          trial.classifiedFailureDomains.includes(expectedDomain)
        ),
        id,
      );
    }
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects non-finite primary and required rewards", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-finite-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0, rewards: { gate: 1 } },
    );
    for (const mode of ["primary", "required"]) {
      const challengerJob = await stageJob(
        path.join(fixtures, "skill"),
        path.join(tempDirectory, mode + "-job"),
        challenger,
        { reward: 1, rewards: { gate: 1 } },
      );
      const trialDirectories = (await fs.readdir(challengerJob, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory());
      const resultPath = path.join(challengerJob, trialDirectories[0].name, "result.json");
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      result.verifier_result.rewards[mode === "primary" ? "reward" : "gate"] = "NON_FINITE";
      const raw = (JSON.stringify(result, null, 2) + "\n").replace('"NON_FINITE"', "NaN");
      await fs.writeFile(resultPath, raw, "utf8");
      const completed = runSearch([
        ...baseArgs(
          path.join(baselineJob, "config.json"),
          baseline,
          challenger,
          path.join(tempDirectory, mode + "-output"),
        ),
        "--job",
        "baseline=" + baselineJob,
        "--job",
        "challenger=" + challengerJob,
        "--required-reward",
        "gate=1",
        "--analyze-only",
      ]);
      assert.notEqual(completed.status, 0, mode);
      assert.match(completed.stderr, /must be finite/i, mode);
    }
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search blocks per-task holdout regressions by default", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-regression-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const developmentBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-baseline"),
      baseline,
      { reward: 0.5 },
    );
    const developmentWinner = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-winner"),
      challenger,
      { reward: 1 },
    );
    const taskOutcomes = (firstReward, secondReward) => [
      { reward: firstReward, taskName: "holdout/a", taskChecksum: "sha256:a" },
      { reward: firstReward, taskName: "holdout/a", taskChecksum: "sha256:a" },
      { reward: secondReward, taskName: "holdout/b", taskChecksum: "sha256:b" },
      { reward: secondReward, taskName: "holdout/b", taskChecksum: "sha256:b" },
    ];
    const holdoutBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-baseline"),
      baseline,
      { trialOutcomes: taskOutcomes(1, 0.2) },
    );
    const holdoutWinner = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-winner"),
      challenger,
      { trialOutcomes: taskOutcomes(0.9, 0.4) },
    );
    const common = [
      ...baseArgs(
        path.join(developmentBaseline, "config.json"),
        baseline,
        challenger,
        "OUTPUT",
      ),
      "--job",
      "baseline=" + developmentBaseline,
      "--job",
      "challenger=" + developmentWinner,
      "--pass-threshold",
      "0.1",
      "--holdout-template",
      path.join(holdoutBaseline, "config.json"),
      "--holdout-job",
      "baseline=" + holdoutBaseline,
      "--holdout-job",
      "winner=" + holdoutWinner,
      "--analyze-only",
    ];
    const output = path.join(tempDirectory, "blocked-output");
    const blocked = runSearch(common.map((value) => value === "OUTPUT" ? output : value));
    assert.equal(blocked.status, 0, blocked.stderr);
    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.ok(run.holdout.gain > 0);
    assert.equal(run.holdout.taskRegressionCount, 1);
    assert.equal(run.holdout.promoted, false);
    assert.ok(run.holdout.promotionBlockers.includes("task-regression"));
    assert.equal(run.holdout.regressedTasks[0].taskName, "holdout/a");
    assert.match(await fs.readFile(path.join(output, "report.md"), "utf8"), /Regressed task signatures: 1/);

    const allowedOutput = path.join(tempDirectory, "allowed-output");
    const allowed = runSearch([
      ...common.map((value) => value === "OUTPUT" ? allowedOutput : value),
      "--allow-task-regressions",
    ]);
    assert.equal(allowed.status, 0, allowed.stderr);
    const allowedRun = JSON.parse(
      await fs.readFile(path.join(allowedOutput, "run.json"), "utf8"),
    );
    assert.equal(allowedRun.holdout.promoted, true);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search makes every opened holdout terminal and preserves staged selection", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-holdout-history-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const first = await createToySkill(tempDirectory, "first", "First winner.");
    const second = await createToySkill(tempDirectory, "second", "Second winner.");
    const developmentBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-baseline"),
      baseline,
      { reward: 0 },
    );
    const developmentFirst = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-first"),
      first,
      { reward: 1 },
    );
    const developmentSecond = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "development-second"),
      second,
      { reward: 1 },
    );
    const holdoutOptions = {
      taskName: "holdout/immutable-history",
      taskChecksum: "sha256:holdout-immutable-history",
    };
    const holdoutBaseline = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-baseline"),
      baseline,
      { ...holdoutOptions, reward: 0 },
    );
    const holdoutFirstExternalFailure = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-first-external"),
      first,
      {
        ...holdoutOptions,
        reward: 0,
        diagnostics: {
          failure_domain: "provider",
          terminal_outcome: "provider-context-limit",
          error_code: "context_length_exceeded",
        },
      },
    );
    const holdoutFirstRegression = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-first-regression"),
      first,
      { ...holdoutOptions, reward: -0.5 },
    );
    const holdoutSecond = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "holdout-second"),
      second,
      { ...holdoutOptions, reward: 1 },
    );
    let output = path.join(tempDirectory, "output");
    const generationArgs = (generation, candidateId, candidate, developmentJob, holdoutJob) => [
      "--job-template",
      path.join(developmentBaseline, "config.json"),
      "--candidate",
      "baseline=" + baseline,
      "--candidate",
      candidateId + "=" + candidate,
      "--baseline",
      "baseline",
      "--output",
      output,
      "--generation",
      String(generation),
      "--job",
      "baseline=" + developmentBaseline,
      "--job",
      candidateId + "=" + developmentJob,
      "--holdout-template",
      path.join(holdoutBaseline, "config.json"),
      "--holdout-job",
      "baseline=" + holdoutBaseline,
      "--holdout-job",
      "winner=" + holdoutJob,
      "--analyze-only",
    ];

    const scenarios = [
      ["external", "first", first, developmentFirst, holdoutFirstExternalFailure],
      ["rejected", "first", first, developmentFirst, holdoutFirstRegression],
      ["accepted", "second", second, developmentSecond, holdoutSecond],
    ];
    for (const [label, id, skill, developmentJob, holdoutJob] of scenarios) {
      output = path.join(tempDirectory, label);
      const args = generationArgs(0, id, skill, developmentJob, holdoutJob);
      if (label === "external") {
        const stagedArgs = args.filter((value, index) => (
          value !== "--holdout-job" && args[index - 1] !== "--holdout-job"
        ));
        const staged = runSearch(stagedArgs);
        assert.equal(staged.status, 0, staged.stderr);
        const frozenBytes = await harborSkillDigest(output);
        const unfinishedOutput = path.join(tempDirectory, "unfinished-stage");
        await fs.cp(output, unfinishedOutput, { recursive: true });
        await fs.rm(path.join(
          unfinishedOutput, "holdout", "generation-000", "attempt-000", "result.json",
        ));
        const unfinishedBytes = await harborSkillDigest(unfinishedOutput);
        const unfinishedArgs = [...args];
        unfinishedArgs[unfinishedArgs.indexOf("--output") + 1] = unfinishedOutput;
        const unfinished = runSearch(unfinishedArgs);
        assert.notEqual(unfinished.status, 0);
        assert.match(unfinished.stderr, /attempt is unfinished/i);
        assert.equal(await harborSkillDigest(unfinishedOutput), unfinishedBytes);

        const trial = (await fs.readdir(developmentFirst, { withFileTypes: true }))
          .find((entry) => entry.isDirectory());
        const trialPath = path.join(developmentFirst, trial.name, "result.json");
        const trialBytes = await fs.readFile(trialPath, "utf8");
        try {
          const driftedTrial = JSON.parse(trialBytes);
          driftedTrial.verifier_result.rewards.reward = 0.5;
          await writeJson(trialPath, driftedTrial);
          const changedEvidence = runSearch(args);
          assert.notEqual(changedEvidence.status, 0);
          assert.match(changedEvidence.stderr, /staged holdout development evidence changed/i);
          assert.equal(await harborSkillDigest(output), frozenBytes);
        } finally {
          await fs.writeFile(trialPath, trialBytes, "utf8");
        }
        const changed = runSearch(generationArgs(
          0, "first", second, developmentSecond, holdoutSecond,
        ));
        assert.notEqual(changed.status, 0);
        assert.match(changed.stderr, /staged holdout candidate or development job identity changed/i);
        assert.equal(await harborSkillDigest(output), frozenBytes);
        const later = runSearch(generationArgs(
          1, "second", second, developmentSecond, holdoutSecond,
        ));
        assert.notEqual(later.status, 0);
        assert.match(later.stderr, /staged holdout freezes selection/i);
        assert.equal(await harborSkillDigest(output), frozenBytes);
      }
      const completed = runSearch(args);
      assert.equal(completed.status, 0, completed.stderr);
      const receipt = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
      assert.equal(receipt.holdout.promoted, label === "accepted");
      if (label === "external") assert.equal(receipt.holdout.status, "non-evaluable");
      const before = await harborSkillDigest(output);

      const attempts = [
        args,
        generationArgs(1, "second", second, developmentSecond, holdoutSecond),
        [...args.filter((value) => value !== "--analyze-only"), "--dry-run"],
      ];
      for (const attempt of attempts) {
        const rejected = runSearch(attempt);
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /validation\/holdout already opened/i);
        assert.equal(await harborSkillDigest(output), before);
      }
      await assert.rejects(fs.stat(path.join(output, "generation-001")), /ENOENT/);
      const log = JSON.parse(await fs.readFile(
        path.join(output, "population-search-log.json"), "utf8",
      ));
      assert.equal(log.generations.length, 1);
      assert.equal(log.holdoutAttempts.length, label === "external" ? 2 : 1);
    }
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search retains an unchanged baseline bundle without holdout", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-baseline-self-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Identical content.");
    const duplicate = path.join(tempDirectory, "duplicate");
    await fs.cp(baseline, duplicate, { recursive: true });
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 1 },
    );
    const duplicateJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "duplicate-job"),
      duplicate,
      { reward: 1 },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      "--job-template",
      path.join(baselineJob, "config.json"),
      "--candidate",
      "z-baseline=" + baseline,
      "--candidate",
      "a-copy=" + duplicate,
      "--baseline",
      "z-baseline",
      "--output",
      output,
      "--job",
      "z-baseline=" + baselineJob,
      "--job",
      "a-copy=" + duplicateJob,
      "--holdout-template",
      path.join(baselineJob, "config.json"),
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);
    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "a-copy");
    assert.equal(run.ranking[0].sameAsBaseline, true);
    assert.equal(run.holdout.status, "baseline-retained");
    assert.equal(run.holdout.promoted, false);
    assert.equal(run.holdout.skillChanged, false);
    assert.deepEqual(run.holdout.promotionBlockers, ["no-skill-change"]);
    assert.match(
      await fs.readFile(path.join(output, "report.md"), "utf8"),
      /Promotion blockers: no-skill-change/,
    );
    await assert.rejects(fs.stat(path.join(output, "holdout")), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search freezes the benchmark contract across generations", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-contract-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0 },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      { reward: 1 },
    );
    const output = path.join(tempDirectory, "output");
    const common = [
      ...baseArgs(path.join(baselineJob, "config.json"), baseline, challenger, output),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ];
    const generationZero = runSearch(common);
    assert.equal(generationZero.status, 0, generationZero.stderr);
    const drift = runSearch([
      ...common,
      "--generation",
      "1",
      "--pass-threshold",
      "0.5",
    ]);
    assert.notEqual(drift.status, 0);
    assert.match(drift.stderr, /search contract drift/i);
    await assert.rejects(fs.stat(path.join(output, "generation-001")), /ENOENT/);

    const driftBaselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "drift-baseline-job"),
      baseline,
      { reward: 0, taskName: "drift/task", taskChecksum: "sha256:drift" },
    );
    const driftChallengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "drift-challenger-job"),
      challenger,
      { reward: 1, taskName: "drift/task", taskChecksum: "sha256:drift" },
    );
    const signatureDrift = runSearch([
      ...baseArgs(path.join(baselineJob, "config.json"), baseline, challenger, output),
      "--job",
      "baseline=" + driftBaselineJob,
      "--job",
      "challenger=" + driftChallengerJob,
      "--generation",
      "1",
      "--analyze-only",
    ]);
    assert.notEqual(signatureDrift.status, 0);
    assert.match(signatureDrift.stderr, /development task signature contract drift/i);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search always preserves the selected winner among parents", {
  skip: !uvAvailable,
}, async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-winner-parent-"));
  try {
    const definitions = {
      "a-broken": 0,
      "b-broken": 0,
      "z-qualified": 1,
    };
    const candidates = {};
    const jobs = {};
    for (const [id, gate] of Object.entries(definitions)) {
      candidates[id] = await createToySkill(tempDirectory, id, id);
      jobs[id] = await stageJob(
        path.join(fixtures, "skill"),
        path.join(tempDirectory, id + "-job"),
        candidates[id],
        { reward: 0, rewards: { gate } },
      );
    }
    const output = path.join(tempDirectory, "output");
    const args = [
      "--job-template",
      path.join(jobs["a-broken"], "config.json"),
      "--baseline",
      "a-broken",
      "--output",
      output,
      "--pass-threshold",
      "0",
      "--required-reward",
      "gate=1",
      "--analyze-only",
    ];
    for (const id of Object.keys(definitions)) {
      args.push("--candidate", id + "=" + candidates[id], "--job", id + "=" + jobs[id]);
    }
    const completed = runSearch(args);
    assert.equal(completed.status, 0, completed.stderr);
    const run = JSON.parse(await fs.readFile(path.join(output, "run.json"), "utf8"));
    assert.equal(run.selectedWinner, "z-qualified");
    assert.ok(run.survivors.includes("z-qualified"));
    assert.ok(run.repairParents.includes("z-qualified"));
    assert.ok(run.nextGeneration.parents.includes("z-qualified"));
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects skill symlinks that escape the bundle", {
  skip: !uvAvailable,
}, async (context) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-symlink-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const outside = path.join(tempDirectory, "outside.txt");
    const references = path.join(challenger, "references");
    await fs.mkdir(references, { recursive: true });
    await fs.writeFile(outside, "external dependency\n", "utf8");
    try {
      await fs.symlink(outside, path.join(references, "escape.txt"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) {
        context.skip("file symlinks are unavailable in this Windows environment");
        return;
      }
      throw error;
    }
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(path.join(fixtures, "skill", "config.json"), baseline, challenger, output),
      "--doctor",
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /symlink that escapes/i);
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search dereferences safe in-bundle file symlinks while staging", {
  skip: !uvAvailable,
}, async (context) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-internal-link-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const scripts = path.join(challenger, "scripts");
    await fs.mkdir(scripts, { recursive: true });
    await fs.writeFile(path.join(scripts, "source.txt"), "portable content\n", "utf8");
    try {
      await fs.symlink("source.txt", path.join(scripts, "alias.txt"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) {
        context.skip("file symlinks are unavailable in this Windows environment");
        return;
      }
      throw error;
    }
    const baselineJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "baseline-job"),
      baseline,
      { reward: 0 },
    );
    const challengerJob = await stageJob(
      path.join(fixtures, "skill"),
      path.join(tempDirectory, "challenger-job"),
      challenger,
      { reward: 1 },
    );
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(path.join(baselineJob, "config.json"), baseline, challenger, output),
      "--job",
      "baseline=" + baselineJob,
      "--job",
      "challenger=" + challengerJob,
      "--analyze-only",
    ]);
    assert.equal(completed.status, 0, completed.stderr);
    const stagedAlias = path.join(
      output,
      "generation-000",
      "candidates",
      "challenger",
      "skills",
      "toy-harbor-skill",
      "scripts",
      "alias.txt",
    );
    assert.equal((await fs.lstat(stagedAlias)).isSymbolicLink(), false);
    assert.equal(await fs.readFile(stagedAlias, "utf8"), "portable content\n");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor population search rejects Windows directory junctions", {
  skip: !uvAvailable || process.platform !== "win32",
}, async (context) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pop-junction-"));
  try {
    const baseline = await createToySkill(tempDirectory, "baseline", "Baseline.");
    const challenger = await createToySkill(tempDirectory, "challenger", "Challenger.");
    const outside = path.join(tempDirectory, "outside-directory");
    const references = path.join(challenger, "references");
    await fs.mkdir(outside, { recursive: true });
    await fs.mkdir(references, { recursive: true });
    await fs.writeFile(path.join(outside, "external.txt"), "external\n", "utf8");
    try {
      await fs.symlink(outside, path.join(references, "junction"), "junction");
    } catch (error) {
      if (["EPERM", "EACCES", "EINVAL"].includes(error.code)) {
        context.skip("directory junctions are unavailable in this environment");
        return;
      }
      throw error;
    }
    const output = path.join(tempDirectory, "output");
    const completed = runSearch([
      ...baseArgs(path.join(fixtures, "skill", "config.json"), baseline, challenger, output),
      "--doctor",
    ]);
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /junction\/reparse point/i);
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
