import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-trace-distillation",
  "scripts",
  "distill_harbor_traces.py",
);
const fixtureJob = path.resolve(
  "evaluations",
  "harbor-report-parity-poc",
  "fixtures",
  "harbor-jobs",
  "no-skill",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

function runScript(configPath, mode) {
  const args = ["run", script];
  if (configPath) args.push(configPath);
  if (mode) args.push(mode);
  return spawnSync("uv", args, {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 120000,
  });
}

function computeSkillDigest(skillPath) {
  const completed = spawnSync(
    "uv",
    [
      "run",
      "--with",
      "harbor==0.18.0",
      "python",
      "-c",
      "import sys; from pathlib import Path; from harbor.skills import compute_skill_digest; print(compute_skill_digest(Path(sys.argv[1])))",
      skillPath,
    ],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
      timeout: 120000,
    },
  );
  assert.equal(completed.status, 0, completed.stderr);
  return completed.stdout.trim();
}

async function createBaseline(root) {
  const baseline = path.join(root, "baseline-skill");
  await fs.mkdir(baseline, { recursive: true });
  await fs.writeFile(
    path.join(baseline, "SKILL.md"),
    [
      "---",
      "name: evidence-skill",
      "description: Guide evidence-backed fixture work.",
      "---",
      "",
      "# Evidence Skill",
      "",
      "Use the baseline behavior.",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(baseline, "preserved.txt"), "preserved\n", "utf8");
  return baseline;
}

async function trialDirectories(jobDirectory) {
  const entries = await fs.readdir(jobDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(jobDirectory, entry.name))
    .sort();
}

async function prepareDiscoveryJob(root, jobName) {
  const directory = path.join(root, jobName);
  await fs.cp(fixtureJob, directory, { recursive: true });
  const configPath = path.join(directory, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.job_name = jobName;
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  const directories = await trialDirectories(directory);
  const results = [];
  for (let index = 0; index < directories.length; index += 1) {
    const resultPath = path.join(directories[index], "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.source = jobName;
    result.task_name = index < 2 ? "fixture/task-a" : `fixture/task-${index}`;
    result.task_checksum = index < 2 ? "sha256:task-a" : `sha256:task-${index}`;
    result.exception_info = null;
    result.verifier_result = { rewards: { reward: index === 2 ? 1 : 0 } };
    if (index === 1) {
      result.verifier_result = null;
    }
    if (index === 3) {
      result.verifier_result = null;
      result.exception_info = {
        exception_type: "AgentTimeoutError",
        exception_message: "agent timed out",
        exception_traceback: "raw traceback must not be normalized",
        occurred_at: "2026-07-13T00:00:18Z",
      };
    }
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    results.push(result);
  }
  const jobResultPath = path.join(directory, "result.json");
  const jobResult = JSON.parse(await fs.readFile(jobResultPath, "utf8"));
  jobResult.stats.n_errored_trials = 1;
  await fs.writeFile(jobResultPath, JSON.stringify(jobResult, null, 2), "utf8");

  const firstAgent = path.join(directories[0], "agent");
  const firstVerifier = path.join(directories[0], "verifier");
  await fs.mkdir(firstAgent, { recursive: true });
  await fs.mkdir(firstVerifier, { recursive: true });
  await fs.writeFile(
    path.join(firstAgent, "trajectory.json"),
    JSON.stringify(
      {
        schema_version: "ATIF-v1.7",
        session_id: "fixture-session",
        agent: {
          name: results[0].agent_info.name,
          version: results[0].agent_info.version,
          model_name: results[0].agent_info.model_info.name,
        },
        steps: [
          { step_id: 1, source: "user", message: "Complete the fixture." },
          {
            step_id: 2,
            source: "agent",
            message: "I should verify the written artifact before finishing.",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(firstVerifier, "test-stdout.txt"),
    "Diagnosis: output was not verified. OPENAI_API_KEY=super-secret-fixture-value\n",
    "utf8",
  );
  return { directory, results };
}

async function prepareHoldoutJob(root, jobName, reward, lockedSkill = null) {
  const directory = path.join(root, jobName);
  await fs.cp(fixtureJob, directory, { recursive: true });
  const configPath = path.join(directory, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.job_name = jobName;
  if (lockedSkill) {
    const configSource = lockedSkill.configSource ?? lockedSkill.source;
    config.agents = config.agents.map((agent) => ({
      ...agent,
      skills: [configSource],
    }));
  }
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  const trialLocks = [];
  for (const trialDirectory of await trialDirectories(directory)) {
    const resultPath = path.join(trialDirectory, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.task_name = "fixture/holdout-task";
    result.task_checksum = "sha256:holdout-v1";
    result.exception_info = null;
    result.verifier_result = { rewards: { reward } };
    if (lockedSkill) {
      const configSource = lockedSkill.configSource ?? lockedSkill.source;
      result.config.agent.skills = [configSource];
      const trialLock = {
        schema_version: 1,
        task: {
          name: "fixture-holdout-task",
          type: "local",
          digest: `sha256:${"1".repeat(64)}`,
          source: "dataset",
          path: result.config.task.path,
        },
        install_only: false,
        timeout_multiplier: 1,
        agent: {
          name: result.config.agent.name,
          model_name: result.config.agent.model_name,
          skills: [configSource],
          extra_allowed_hosts: [],
          kwargs: {},
          mcp_servers: [],
        },
        skills: [
          {
            name: path.basename(lockedSkill.source),
            source: lockedSkill.source,
            digest: lockedSkill.digest,
          },
        ],
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
      await fs.writeFile(
        path.join(trialDirectory, "lock.json"),
        JSON.stringify(trialLock, null, 2),
        "utf8",
      );
      trialLocks.push(trialLock);
    }
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  }
  const jobResultPath = path.join(directory, "result.json");
  const jobResult = JSON.parse(await fs.readFile(jobResultPath, "utf8"));
  jobResult.stats.n_errored_trials = 0;
  await fs.writeFile(jobResultPath, JSON.stringify(jobResult, null, 2), "utf8");
  if (lockedSkill) {
    const jobLock = {
      schema_version: 2,
      created_at: "2026-07-13T00:00:00Z",
      harbor: { version: "0.18.0", is_editable: false },
      n_concurrent_trials: 2,
      retry: {
        max_retries: 0,
        exclude_exceptions: [
          "VerifierTimeoutError",
          "AgentTimeoutError",
          "VerifierOutputParseError",
          "RewardFileEmptyError",
          "ApiUsageLimitError",
          "RewardFileNotFoundError",
        ],
        wait_multiplier: 1,
        min_wait_sec: 1,
        max_wait_sec: 60,
      },
      trials: trialLocks,
    };
    await fs.writeFile(
      path.join(directory, "lock.json"),
      JSON.stringify(jobLock, null, 2),
      "utf8",
    );
  }
  return directory;
}

function evidenceId(jobName, result) {
  return `${jobName}:${result.id}`;
}

async function writeProposals(root, discoveryName, discoveryResults) {
  const proposalPath = path.join(root, "proposals.json");
  const first = evidenceId(discoveryName, discoveryResults[0]);
  const duplicateTask = evidenceId(discoveryName, discoveryResults[1]);
  const secondTask = evidenceId(discoveryName, discoveryResults[2]);
  const proposals = {
    proposals: [
      {
        id: "a-accepted",
        diagnosis: "Independent Harbor tasks support a completion check.",
        evidenceIds: [first, secondTask],
        conflictGroup: "completion-check",
        target: "SKILL.md",
        operation: "append",
        content: "\n## Completion check\n\nVerify the requested artifact before finishing.\n",
      },
      {
        id: "z-conflict",
        diagnosis: "The same evidence suggests a weaker conflicting rule.",
        evidenceIds: [first, secondTask],
        conflictGroup: "completion-check",
        target: "SKILL.md",
        operation: "append",
        content: "\nSkip verification.\n",
      },
      {
        id: "duplicate-attempts",
        diagnosis: "Two attempts on one task are not diverse task support.",
        evidenceIds: [first, duplicateTask],
        target: "SKILL.md",
        operation: "append",
        content: "\nThis must not be applied.\n",
      },
      {
        id: "outside-scope",
        diagnosis: "Attempt an out-of-bundle edit.",
        evidenceIds: [first, secondTask],
        target: "../outside.txt",
        operation: "create",
        content: "outside\n",
      },
      {
        id: "holdout-leak",
        diagnosis: "Attempt to cite holdout evidence.",
        evidenceIds: ["holdout-secret:00000000-0000-0000-0000-000000000000"],
        target: "SKILL.md",
        operation: "append",
        content: "\nLeaked holdout rule.\n",
      },
    ],
  };
  await fs.writeFile(proposalPath, JSON.stringify(proposals, null, 2), "utf8");
  return proposalPath;
}

async function writeConfig(root, values) {
  const configPath = path.join(root, values.name + ".json");
  const config = {
    schemaVersion: 1,
    run: {
      id: values.name,
      baselineSkill: values.baseline,
      outputDir: values.output,
    },
    harbor: {
      rewardKey: "reward",
      passThreshold: 1,
      requiredEnv: [],
      requireDiscoveryLocks: false,
    },
    discovery: {
      artifacts: [values.discovery],
      jobConfigs: [],
    },
    proposals: {
      path: values.proposals,
      minimumUniqueTrials: 2,
      minimumUniqueTasks: 2,
    },
    holdout: {
      baselineArtifacts: values.holdoutBaseline ? [values.holdoutBaseline] : [],
      candidateArtifacts: values.holdoutCandidate ? [values.holdoutCandidate] : [],
      baselineJobConfigs: [],
      candidateJobConfigs: [],
      allowWeakFairness: values.allowWeakFairness ?? true,
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

test("Harbor trace distillation dry-run and doctor do not create output", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-plan-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-plan");
    const proposals = await writeProposals(root, "discovery-plan", discovery.results);
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-plan",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
    });

    const lowSupportConfig = JSON.parse(await fs.readFile(config, "utf8"));
    lowSupportConfig.proposals.minimumUniqueTasks = 1;
    const lowSupportPath = path.join(root, "trace-plan-low-support.json");
    await fs.writeFile(
      lowSupportPath,
      JSON.stringify(lowSupportConfig, null, 2),
      "utf8",
    );
    const lowSupport = runScript(lowSupportPath, "--dry-run");
    assert.notEqual(lowSupport.status, 0);
    assert.match(lowSupport.stderr, /at least 2 unique trials and 2 unique tasks/i);

    const dry = runScript(config, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).harborVersion, "0.18.0");
    const doctor = runScript(config, "--doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).checks.jobConfigs, 0);
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor discovery normalization and consolidation preserve evidence scope", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-analyze-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-evidence");
    const proposals = await writeProposals(root, "discovery-evidence", discovery.results);
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-analyze",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
      holdoutBaseline: path.join(root, "HOLDOUT-SENTINEL-does-not-exist"),
      holdoutCandidate: path.join(root, "HOLDOUT-SENTINEL-candidate-does-not-exist"),
    });

    const completed = runScript(config, "--analyze-only");
    assert.equal(completed.status, 0, completed.stderr);
    const tracePoolText = await fs.readFile(path.join(output, "trace-pool.json"), "utf8");
    const tracePool = JSON.parse(tracePoolText);
    const state = JSON.parse(
      await fs.readFile(path.join(output, "proposal-state.json"), "utf8"),
    );
    const gate = JSON.parse(
      await fs.readFile(path.join(output, "holdout-gate.json"), "utf8"),
    );
    const candidate = await fs.readFile(
      path.join(output, "candidate-skill", "SKILL.md"),
      "utf8",
    );

    assert.equal(tracePool.summary.uniqueTrials, 4);
    assert.equal(tracePool.summary.uniqueTasks, 3);
    assert.equal(tracePool.summary.outcomes["missing-reward"], 1);
    assert.equal(tracePool.summary.outcomes.error, 1);
    assert.equal(tracePool.traces[0].feedback.trajectories[0].valid, true);
    assert.match(
      tracePool.traces[0].feedback.finalOutput,
      /verify the written artifact/i,
    );
    assert.doesNotMatch(tracePoolText, /super-secret-fixture-value/);
    assert.doesNotMatch(tracePoolText, /raw traceback must not be normalized/);
    assert.doesNotMatch(tracePoolText, /HOLDOUT-SENTINEL/);
    assert.deepEqual(state.accepted.map((item) => item.id), ["a-accepted"]);
    const rejected = Object.fromEntries(state.rejected.map((item) => [item.id, item.reasons]));
    assert.ok(rejected["duplicate-attempts"].includes("insufficient-unique-task-support"));
    assert.ok(rejected["outside-scope"].includes("out-of-scope-target"));
    assert.ok(rejected["z-conflict"].includes("conflict-lost"));
    assert.ok(rejected["holdout-leak"].includes("unknown-or-holdout-evidence"));
    assert.match(candidate, /Verify the requested artifact before finishing/);
    assert.doesNotMatch(candidate, /Skip verification/);
    assert.equal(
      await fs.readFile(path.join(output, "candidate-skill", "preserved.txt"), "utf8"),
      "preserved\n",
    );
    assert.equal(gate.decision, "not-evaluated");
    assert.match(gate.reason, /excludes all holdout reads/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor import-only holdout remains separate and gates the candidate", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-holdout-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-live");
    const proposals = await writeProposals(root, "discovery-live", discovery.results);
    const holdoutBaseline = await prepareHoldoutJob(root, "holdout-baseline", 0);
    const holdoutCandidate = await prepareHoldoutJob(root, "holdout-candidate", 1);
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-live",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate,
    });

    const completed = runScript(config);
    assert.equal(completed.status, 0, completed.stderr);
    const gate = JSON.parse(
      await fs.readFile(path.join(output, "holdout-gate.json"), "utf8"),
    );
    const tracePoolText = await fs.readFile(path.join(output, "trace-pool.json"), "utf8");
    const stateText = await fs.readFile(path.join(output, "proposal-state.json"), "utf8");
    assert.equal(gate.decision, "promote");
    assert.equal(gate.fairnessBasis, "trial-result-and-config");
    assert.equal(gate.baselineMeanReward, 0);
    assert.equal(gate.candidateMeanReward, 1);
    assert.doesNotMatch(tracePoolText, /holdout-baseline|holdout-candidate/);
    assert.doesNotMatch(stateText, /fixture\/holdout-task/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("locked holdout accepts Harbor basename aliases and rejects wrong skill identity", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-identity-"));
  try {
    const baseline = await createBaseline(root);
    const candidateSource = path.join(root, "trace-distillation");
    await fs.cp(baseline, candidateSource, { recursive: true });
    const candidateText = `${await fs.readFile(path.join(baseline, "SKILL.md"), "utf8")}\n## Completion check\n\nVerify the requested artifact before finishing.\n`;
    await fs.writeFile(
      path.join(candidateSource, "SKILL.md"),
      candidateText.replace(/\r?\n/g, os.EOL),
      "utf8",
    );
    const baselineDigest = computeSkillDigest(baseline);
    const candidateDigest = computeSkillDigest(candidateSource);
    const discovery = await prepareDiscoveryJob(root, "discovery-identity");
    const proposals = await writeProposals(
      root,
      "discovery-identity",
      discovery.results,
    );
    const holdoutBaseline = await prepareHoldoutJob(
      root,
      "holdout-baseline-locked",
      0,
      { source: baseline, digest: baselineDigest },
    );
    const holdoutCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-locked",
      1,
      { source: candidateSource, digest: candidateDigest },
    );
    const output = path.join(root, "output-valid");
    const config = await writeConfig(root, {
      name: "trace-identity-valid",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate,
      allowWeakFairness: false,
    });

    const completed = runScript(config);
    assert.equal(completed.status, 0, completed.stderr);
    const gate = JSON.parse(
      await fs.readFile(path.join(output, "holdout-gate.json"), "utf8"),
    );
    assert.equal(gate.decision, "promote");
    assert.equal(gate.fairnessBasis, "trial-lock-and-result");

    const wrongSkill = path.join(root, "wrong-skill");
    await fs.cp(baseline, wrongSkill, { recursive: true });
    await fs.writeFile(
      path.join(wrongSkill, "SKILL.md"),
      [
        "---",
        "name: wrong-skill",
        "description: A different logical skill.",
        "---",
        "",
        "# Wrong Skill",
        "",
      ].join("\n"),
      "utf8",
    );
    const wrongCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-wrong-digest",
      1,
      { source: wrongSkill, digest: computeSkillDigest(wrongSkill) },
    );
    const wrongConfig = await writeConfig(root, {
      name: "trace-identity-wrong-digest",
      baseline,
      output: path.join(root, "output-wrong-digest"),
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate: wrongCandidate,
      allowWeakFairness: false,
    });
    const rejectedWrongSkill = runScript(wrongConfig);
    assert.notEqual(rejectedWrongSkill.status, 0);
    assert.match(
      rejectedWrongSkill.stderr,
      /must lock exactly one target skill with digest .*; found 0/i,
    );

    const sourceAlias = path.join(root, "same-content-different-source");
    await fs.cp(candidateSource, sourceAlias, { recursive: true });
    const mismatchedSourceCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-source-mismatch",
      1,
      {
        source: sourceAlias,
        configSource: candidateSource,
        digest: candidateDigest,
      },
    );
    const sourceMismatchConfig = await writeConfig(root, {
      name: "trace-identity-source-mismatch",
      baseline,
      output: path.join(root, "output-source-mismatch"),
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate: mismatchedSourceCandidate,
      allowWeakFairness: false,
    });
    const rejectedSourceMismatch = runScript(sourceMismatchConfig);
    assert.notEqual(rejectedSourceMismatch.status, 0);
    assert.match(
      rejectedSourceMismatch.stderr,
      /must be referenced exactly once by TrialConfig\.agent\.skills .* found 0/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
