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

async function tryCreateDirectoryLink(target, link) {
  try {
    await fs.symlink(
      target,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return false;
    throw error;
  }
}

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

function stagedSkill(output, role) {
  return path.join(output, role, "skills", "evidence-skill");
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

async function prepareDiscoveryJob(root, jobName, options = {}) {
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
    const diagnostics = options.diagnosticsByTrial?.[index];
    if (diagnostics !== undefined) {
      const verifierDirectory = path.join(directories[index], "verifier");
      await fs.mkdir(verifierDirectory, { recursive: true });
      await fs.writeFile(
        path.join(verifierDirectory, "diagnostics.json"),
        JSON.stringify(diagnostics, null, 2),
        "utf8",
      );
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

async function attachTraceJobLock(directory, lockedSkill) {
  const configSource = lockedSkill.configSource ?? lockedSkill.source;
  const configPath = path.join(directory, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.agents = config.agents.map((agent) => ({
    ...agent,
    skills: [configSource],
  }));
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  const trialLocks = [];
  const directories = await trialDirectories(directory);
  for (let index = 0; index < directories.length; index += 1) {
    const trialDirectory = directories[index];
    const resultPath = path.join(trialDirectory, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.config.agent.skills = [configSource];
    const taskLeaf = result.task_name.split("/").at(-1);
    const trialLock = {
      schema_version: 1,
      task: {
        name: taskLeaf,
        type: "local",
        digest: `sha256:${String(index + 1).padStart(64, "0")}`,
        source: "synthetic-trace-test",
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
      skills: [{
        name: lockedSkill.name ?? path.basename(lockedSkill.source),
        source: lockedSkill.source,
        digest: lockedSkill.digest,
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
    await fs.writeFile(
      path.join(trialDirectory, "lock.json"),
      JSON.stringify(trialLock, null, 2),
      "utf8",
    );
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    trialLocks.push(trialLock);
  }
  await fs.writeFile(
    path.join(directory, "lock.json"),
    JSON.stringify({
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
    }, null, 2),
    "utf8",
  );
}

async function canonicalSkillCopy(root, source, label) {
  const destination = path.join(root, label, "skills", "evidence-skill");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
  return destination;
}

async function prepareHoldoutJob(
  root,
  jobName,
  reward,
  lockedSkill = null,
  options = {},
) {
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
  const directories = await trialDirectories(directory);
  for (let index = 0; index < directories.length; index += 1) {
    const trialDirectory = directories[index];
    const resultPath = path.join(trialDirectory, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.task_name = "fixture/holdout-task";
    result.task_checksum = "sha256:holdout-v1";
    result.exception_info = null;
    result.verifier_result = { rewards: { reward } };
    const requiredValue = options.requiredRewardValues?.[index];
    if (requiredValue !== undefined) {
      result.verifier_result.rewards.mechanical_qualification_gate = requiredValue;
    }
    if (options.missingRewardTrials?.includes(index)) {
      result.verifier_result = null;
    }
    if (options.errorTrial === index) {
      result.exception_info = {
        exception_type: "AgentTimeoutError",
        exception_message: "agent timed out",
        exception_traceback: "traceback",
        occurred_at: "2026-07-13T00:00:18Z",
      };
    }
    const diagnostics = options.diagnosticsByTrial?.[index];
    if (diagnostics !== undefined) {
      const verifierDirectory = path.join(trialDirectory, "verifier");
      await fs.mkdir(verifierDirectory, { recursive: true });
      await fs.writeFile(
        path.join(verifierDirectory, "diagnostics.json"),
        JSON.stringify(diagnostics, null, 2),
        "utf8",
      );
    }
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
            name: lockedSkill.name ?? path.basename(lockedSkill.source),
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
  jobResult.stats.n_errored_trials = options.errorTrial === undefined ? 0 : 1;
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
      requiredRewards: values.requiredRewards ?? {},
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
      requireNoErrors: values.requireNoErrors ?? true,
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
    const dryPlan = JSON.parse(dry.stdout);
    assert.equal(dryPlan.harborVersion, "0.18.0");
    assert.deepEqual(dryPlan.requiredRewardThresholds, {});
    assert.equal(dryPlan.stagedBaselineSkill, stagedSkill(output, "baseline"));
    assert.equal(dryPlan.candidateSkill, stagedSkill(output, "candidate"));

    const nonFinitePath = path.join(root, "trace-plan-non-finite.json");
    const nonFiniteConfig = (await fs.readFile(config, "utf8")).replace(
      '"requiredRewards": {},',
      '"requiredRewards": {"mechanical_qualification_gate": .inf},',
    );
    await fs.writeFile(nonFinitePath, nonFiniteConfig, "utf8");
    const nonFinite = runScript(nonFinitePath, "--dry-run");
    assert.notEqual(nonFinite.status, 0);
    assert.match(nonFinite.stderr, /requiredRewards.*finite/i);

    const unsafeBaseline = path.join(root, "unsafe-baseline");
    await fs.cp(baseline, unsafeBaseline, { recursive: true });
    await fs.writeFile(
      path.join(unsafeBaseline, "SKILL.md"),
      (await fs.readFile(path.join(unsafeBaseline, "SKILL.md"), "utf8")).replace(
        "name: evidence-skill",
        "name: evidence_skill",
      ),
      "utf8",
    );
    const unsafeConfig = JSON.parse(await fs.readFile(config, "utf8"));
    unsafeConfig.run.baselineSkill = unsafeBaseline;
    unsafeConfig.run.outputDir = path.join(root, "unsafe-output");
    const unsafeConfigPath = path.join(root, "trace-plan-unsafe-name.json");
    await fs.writeFile(
      unsafeConfigPath,
      JSON.stringify(unsafeConfig, null, 2),
      "utf8",
    );
    const unsafeName = runScript(unsafeConfigPath, "--dry-run");
    assert.notEqual(unsafeName.status, 0);
    assert.match(unsafeName.stderr, /exact portable skill basename/i);

    const doctor = runScript(config, "--doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).checks.jobConfigs, 0);
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor trace rejects linked bundles and non-finite policies or rewards", {
  skip: !uvAvailable,
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-adversarial-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-adversarial");
    const proposals = await writeProposals(
      root,
      "discovery-adversarial",
      discovery.results,
    );
    const output = path.join(root, "output");
    const configPath = await writeConfig(root, {
      name: "trace-adversarial",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
    });
    const configText = await fs.readFile(configPath, "utf8");

    for (const [label, from, to, expected] of [
      ["pass-threshold", '"passThreshold": 1', '"passThreshold": .nan', /passThreshold.*finite/i],
      ["mean-gain", '"minimumMeanGain": 0', '"minimumMeanGain": .inf', /minimumMeanGain.*finite/i],
    ]) {
      const invalidPath = path.join(root, `${label}.json`);
      await fs.writeFile(invalidPath, configText.replace(from, to), "utf8");
      const completed = runScript(invalidPath, "--dry-run");
      assert.notEqual(completed.status, 0, label);
      assert.match(completed.stderr, expected);
    }

    const resultPath = path.join(
      (await trialDirectories(discovery.directory))[0],
      "result.json",
    );
    const originalResult = await fs.readFile(resultPath, "utf8");
    const infiniteReward = originalResult.replace('"reward": 0', '"reward": 1e309');
    assert.notEqual(infiniteReward, originalResult);
    await fs.writeFile(resultPath, infiniteReward, "utf8");
    const invalidReward = runScript(configPath, "--analyze-only");
    assert.notEqual(invalidReward.status, 0);
    assert.match(invalidReward.stderr, /reward .* finite numeric/i);
    await fs.writeFile(resultPath, originalResult, "utf8");

    const linkedBaseline = path.join(root, "linked-baseline");
    await fs.cp(baseline, linkedBaseline, { recursive: true });
    const outside = path.join(root, "outside-bundle");
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, "payload.txt"), "outside\n", "utf8");
    const linkedRoot = path.join(root, "linked-baseline-root");
    if (!await tryCreateDirectoryLink(baseline, linkedRoot)) {
      t.diagnostic("Directory links are unavailable; reparse-point assertion skipped.");
      return;
    }
    const rootLinkedConfig = JSON.parse(configText);
    rootLinkedConfig.run.baselineSkill = linkedRoot;
    rootLinkedConfig.run.outputDir = path.join(root, "linked-root-output");
    const rootLinkedConfigPath = path.join(root, "linked-root-config.json");
    await fs.writeFile(
      rootLinkedConfigPath,
      JSON.stringify(rootLinkedConfig, null, 2),
      "utf8",
    );
    const linkedRootResult = runScript(rootLinkedConfigPath, "--dry-run");
    assert.notEqual(linkedRootResult.status, 0);
    assert.match(linkedRootResult.stderr, /symbolic link|junction|reparse point/i);
    if (!await tryCreateDirectoryLink(outside, path.join(linkedBaseline, "linked"))) {
      t.diagnostic("Directory links are unavailable; reparse-point assertion skipped.");
      return;
    }
    const linkedConfig = JSON.parse(configText);
    linkedConfig.run.baselineSkill = linkedBaseline;
    linkedConfig.run.outputDir = path.join(root, "linked-output");
    const linkedConfigPath = path.join(root, "linked-config.json");
    await fs.writeFile(
      linkedConfigPath,
      JSON.stringify(linkedConfig, null, 2),
      "utf8",
    );
    const linked = runScript(linkedConfigPath, "--dry-run");
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /symbolic link|reparse point/i);
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
      path.join(stagedSkill(output, "candidate"), "SKILL.md"),
      "utf8",
    );

    assert.equal(tracePool.summary.uniqueTrials, 4);
    assert.equal(tracePool.summary.uniqueTasks, 3);
    assert.equal(tracePool.summary.outcomes["missing-reward"], 1);
    assert.equal(tracePool.summary.outcomes.error, 1);
    assert.equal(tracePool.summary.qualification.missingPrimaryRewardTrials, 1);
    assert.equal(tracePool.summary.qualification.nonEvaluableTrials, 1);
    assert.deepEqual(tracePool.summary.skillIdentity, {
      legacyAliasTrials: 0,
      unverifiedLockTrials: 4,
      promotionEligible: false,
    });
    assert.equal(state.developmentEvidencePromotionEligible, false);
    const missingReward = tracePool.traces.find(
      (item) => item.outcome === "missing-reward",
    );
    assert.ok(missingReward);
    assert.equal(missingReward.reward, null);
    assert.equal(missingReward.reportedReward, null);
    assert.equal(missingReward.primaryRewardMissing, true);
    assert.equal(missingReward.evaluable, false);
    assert.equal(missingReward.evaluationFailure.failureDomain, "evaluator");
    assert.equal(missingReward.evidenceEligible, false);
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
      await fs.readFile(
        path.join(stagedSkill(output, "candidate"), "preserved.txt"),
        "utf8",
      ),
      "preserved\n",
    );
    assert.equal(gate.decision, "not-evaluated");
    assert.match(gate.reason, /excludes all holdout reads/i);
    assert.equal(path.basename(stagedSkill(output, "candidate")), "evidence-skill");
    assert.equal(
      await fs.readFile(
        path.join(stagedSkill(output, "baseline"), "preserved.txt"),
        "utf8",
      ),
      "preserved\n",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("context-limit diagnostics support only recurrent context-budget patches", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-context-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-context", {
      diagnosticsByTrial: {
        0: {
          status: "provider-failure",
          failure_domain: "provider",
          terminal_outcome: "provider-context-limit",
          error_code: "request_failed",
        },
        1: {
          status: "provider-failure",
          failure_domain: "provider",
          terminal_outcome: "provider-context-limit",
          error_code: "context_length_exceeded",
        },
        2: {
          status: "provider-failure",
          failure_domain: "provider",
          terminal_outcome: "provider-request-failed",
          error_code: "context_length_exceeded",
        },
        3: {
          status: "infrastructure-failure",
          failure_domain: "environment",
          terminal_outcome: "environment-unavailable",
          error_code: "runtime_unavailable",
        },
      },
    });
    const mixedTrial = (await trialDirectories(discovery.directory))[1];
    const nestedVerifier = path.join(mixedTrial, "steps", "02", "verifier");
    await fs.mkdir(nestedVerifier, { recursive: true });
    await fs.writeFile(
      path.join(nestedVerifier, "diagnostics.json"),
      JSON.stringify({
        status: "environment-failure",
        failure_domain: "environment",
        terminal_outcome: "container-startup-failure",
        error_code: "docker_error",
      }, null, 2),
      "utf8",
    );
    const contextEvidence = [
      evidenceId("discovery-context", discovery.results[0]),
      evidenceId("discovery-context", discovery.results[2]),
    ];
    const externalEvidence = [
      evidenceId("discovery-context", discovery.results[1]),
      evidenceId("discovery-context", discovery.results[3]),
    ];
    const proposals = path.join(root, "context-proposals.json");
    await fs.writeFile(
      proposals,
      JSON.stringify(
        {
          proposals: [
            {
              id: "context-budget-patch",
              diagnosis: "Two independent tasks exhaust the provider context budget.",
              domain: "execution-efficiency/context-budget",
              evidenceIds: contextEvidence,
              target: "SKILL.md",
              operation: "append",
              content: "\n## Context budget\n\nBound retrieval and intermediate output.\n",
            },
            {
              id: "semantic-claim",
              diagnosis: "Context failures claim semantic answer improvement.",
              domain: "semantic-quality",
              evidenceIds: contextEvidence,
              target: "SKILL.md",
              operation: "append",
              content: "\nClaim semantic quality improved.\n",
            },
            {
              id: "external-failure-patch",
              diagnosis: "Quota and environment failures should mutate the skill.",
              domain: "execution-efficiency/context-budget",
              evidenceIds: externalEvidence,
              target: "SKILL.md",
              operation: "append",
              content: "\nAttempt to patch external failures.\n",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-context",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
    });

    const completed = runScript(config, "--analyze-only");
    assert.equal(completed.status, 0, completed.stderr);
    const tracePool = JSON.parse(
      await fs.readFile(path.join(output, "trace-pool.json"), "utf8"),
    );
    const state = JSON.parse(
      await fs.readFile(path.join(output, "proposal-state.json"), "utf8"),
    );
    const traces = Object.fromEntries(
      tracePool.traces.map((item) => [item.evidenceId, item]),
    );

    for (const id of contextEvidence) {
      assert.equal(traces[id].reward, null);
      assert.equal(traces[id].outcome, "non-evaluable");
      assert.equal(traces[id].evidenceClass, "operational-context-budget");
      assert.equal(traces[id].evidenceEligible, true);
      assert.equal(
        traces[id].actionability.domain,
        "execution-efficiency/context-budget",
      );
    }
    assert.equal(
      traces[externalEvidence[0]].evidenceClass,
      "external-environment",
    );
    assert.equal(traces[externalEvidence[0]].reportedReward, null);
    assert.equal(traces[externalEvidence[0]].primaryRewardMissing, false);
    assert.equal(
      traces[externalEvidence[0]].evaluationFailure.failureDomain,
      "environment",
    );
    assert.equal(traces[externalEvidence[0]].evidenceEligible, false);
    assert.equal(traces[externalEvidence[0]].actionability.actionable, false);
    assert.equal(
      traces[externalEvidence[1]].evidenceClass,
      "external-environment",
    );
    assert.equal(traces[externalEvidence[1]].evidenceEligible, false);
    assert.equal(tracePool.summary.qualification.actionableContextBudgetTrials, 2);
    assert.equal(tracePool.summary.qualification.nonActionableExternalTrials, 2);

    assert.deepEqual(state.accepted.map((item) => item.id), [
      "context-budget-patch",
    ]);
    assert.equal(
      state.accepted[0].domain,
      "execution-efficiency/context-budget",
    );
    const rejected = Object.fromEntries(
      state.rejected.map((item) => [item.id, item.reasons]),
    );
    assert.ok(
      rejected["semantic-claim"].includes(
        "operational-evidence-domain-mismatch",
      ),
    );
    assert.ok(
      rejected["external-failure-patch"].includes(
        "ineligible-external-evidence",
      ),
    );
    assert.match(
      await fs.readFile(
        path.join(stagedSkill(output, "candidate"), "SKILL.md"),
        "utf8",
      ),
      /Bound retrieval and intermediate output/,
    );
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
    const canonicalBaseline = await canonicalSkillCopy(
      root,
      baseline,
      "canonical-discovery",
    );
    await attachTraceJobLock(discovery.directory, {
      source: canonicalBaseline,
      digest: computeSkillDigest(canonicalBaseline),
    });
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

    const unlockedDiscovery = path.join(root, "discovery-unlocked");
    await fs.cp(discovery.directory, unlockedDiscovery, { recursive: true });
    await fs.rm(path.join(unlockedDiscovery, "lock.json"), { force: true });
    for (const trialDirectory of await trialDirectories(unlockedDiscovery)) {
      await fs.rm(path.join(trialDirectory, "lock.json"), { force: true });
    }
    const unlockedConfig = await writeConfig(root, {
      name: "trace-unlocked-discovery",
      baseline,
      output: path.join(root, "output-unlocked"),
      discovery: unlockedDiscovery,
      proposals,
      holdoutBaseline,
      holdoutCandidate,
    });
    const unlocked = runScript(unlockedConfig);
    assert.equal(unlocked.status, 0, unlocked.stderr);
    const unlockedGate = JSON.parse(
      await fs.readFile(
        path.join(root, "output-unlocked", "holdout-gate.json"),
        "utf8",
      ),
    );
    assert.equal(unlockedGate.developmentEvidencePromotionEligible, false);
    assert.equal(unlockedGate.decision, "keep-baseline");

    const overlapCandidate = path.join(root, "holdout-candidate-overlap");
    await fs.cp(holdoutCandidate, overlapCandidate, { recursive: true });
    const overlapTrial = (await trialDirectories(overlapCandidate))[0];
    const overlapResultPath = path.join(overlapTrial, "result.json");
    const overlapResult = JSON.parse(
      await fs.readFile(overlapResultPath, "utf8"),
    );
    overlapResult.task_name = discovery.results[0].task_name;
    overlapResult.task_checksum = discovery.results[0].task_checksum;
    await fs.writeFile(
      overlapResultPath,
      JSON.stringify(overlapResult, null, 2),
      "utf8",
    );
    const overlapConfig = await writeConfig(root, {
      name: "trace-overlap",
      baseline,
      output: path.join(root, "output-overlap"),
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate: overlapCandidate,
    });
    const overlap = runScript(overlapConfig);
    assert.notEqual(overlap.status, 0);
    assert.match(overlap.stderr, /Discovery and holdout Harbor tasks overlap/i);

    const profileCandidate = path.join(root, "holdout-candidate-profile-drift");
    await fs.cp(holdoutCandidate, profileCandidate, { recursive: true });
    const profileTrial = (await trialDirectories(profileCandidate))[0];
    const profileResultPath = path.join(profileTrial, "result.json");
    const profileResult = JSON.parse(
      await fs.readFile(profileResultPath, "utf8"),
    );
    profileResult.agent_info.model_info.name = "drifted-model";
    await fs.writeFile(
      profileResultPath,
      JSON.stringify(profileResult, null, 2),
      "utf8",
    );
    const profileConfig = await writeConfig(root, {
      name: "trace-profile-drift",
      baseline,
      output: path.join(root, "output-profile-drift"),
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate: profileCandidate,
    });
    const profileDrift = runScript(profileConfig);
    assert.notEqual(profileDrift.status, 0);
    assert.match(profileDrift.stderr, /evaluation-profile drift/i);

    const lockedBaseline = await prepareHoldoutJob(
      root,
      "holdout-baseline-multiset",
      0,
      {
        source: canonicalBaseline,
        digest: computeSkillDigest(canonicalBaseline),
      },
    );
    const priorCandidate = stagedSkill(output, "candidate");
    const lockedCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-multiset",
      1,
      {
        source: priorCandidate,
        digest: computeSkillDigest(priorCandidate),
      },
    );
    for (const [directory, multipliers] of [
      [lockedBaseline, [1, 1, 2, 2]],
      [lockedCandidate, [1, 2, 2, 2]],
    ]) {
      for (const [index, trialDirectory] of (
        await trialDirectories(directory)
      ).entries()) {
        const lockPath = path.join(trialDirectory, "lock.json");
        const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
        lock.timeout_multiplier = multipliers[index];
        await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
      }
    }
    const multisetConfig = await writeConfig(root, {
      name: "trace-multiset-drift",
      baseline,
      output: path.join(root, "output-multiset-drift"),
      discovery: discovery.directory,
      proposals,
      holdoutBaseline: lockedBaseline,
      holdoutCandidate: lockedCandidate,
      allowWeakFairness: false,
    });
    const multisetDrift = runScript(multisetConfig);
    assert.notEqual(multisetDrift.status, 0);
    assert.match(multisetDrift.stderr, /trial-lock drift/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Harbor trace holdout applies non-compensating required reward gates", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-gates-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-gates");
    const proposals = await writeProposals(root, "discovery-gates", discovery.results);
    const holdoutBaseline = await prepareHoldoutJob(
      root,
      "holdout-baseline-gates",
      0,
      null,
      { requiredRewardValues: [1, 1, 1, 1] },
    );
    const holdoutCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-gates",
      1,
      null,
      {
        requiredRewardValues: [1, undefined, 0.5, 1],
        errorTrial: 3,
      },
    );
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-gates",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate,
      requiredRewards: { mechanical_qualification_gate: 1 },
      requireNoErrors: false,
    });

    const completed = runScript(config);
    assert.equal(completed.status, 0, completed.stderr);
    const gate = JSON.parse(
      await fs.readFile(path.join(output, "holdout-gate.json"), "utf8"),
    );
    assert.equal(gate.decision, "keep-baseline");
    assert.ok(gate.meanGain > 0);
    assert.equal(gate.requiredRewardsComplete, false);
    assert.equal(gate.candidateQualified, false);
    assert.equal(gate.candidateQualification.missingRequiredRewards, 1);
    assert.equal(gate.candidateQualification.belowThresholdRewards, 1);
    assert.equal(gate.candidateQualification.erroredTrials, 1);
    assert.deepEqual(gate.requiredRewardThresholds, {
      mechanical_qualification_gate: 1,
    });

    const missing = gate.candidateEvidence.find(
      (item) => item.requiredRewards.mechanical_qualification_gate === null,
    );
    assert.ok(missing);
    assert.deepEqual(missing.qualificationFailures, [
      {
        key: "mechanical_qualification_gate",
        threshold: 1,
        actual: null,
        reason: "missing",
      },
    ]);
    const below = gate.candidateEvidence.find(
      (item) => item.requiredRewards.mechanical_qualification_gate === 0.5,
    );
    assert.ok(below);
    assert.equal(below.qualificationPassed, false);
    assert.equal(below.qualificationFailures[0].reason, "below-threshold");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing rewards block holdout while provider diagnostics keep precedence", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-provider-"));
  try {
    const baseline = await createBaseline(root);
    const discovery = await prepareDiscoveryJob(root, "discovery-provider");
    const proposals = await writeProposals(
      root,
      "discovery-provider",
      discovery.results,
    );
    const holdoutBaseline = await prepareHoldoutJob(
      root,
      "holdout-baseline-provider",
      0,
    );
    const holdoutCandidate = await prepareHoldoutJob(
      root,
      "holdout-candidate-provider",
      0,
      null,
      {
        missingRewardTrials: [0, 1],
        diagnosticsByTrial: {
          0: {
            status: "provider-failure",
            failure_domain: "provider",
            terminal_outcome: "provider-context-limit",
            error_code: "context_length_exceeded",
            detail: "unbounded diagnostic detail must not be copied",
          },
        },
      },
    );
    const output = path.join(root, "output");
    const config = await writeConfig(root, {
      name: "trace-provider",
      baseline,
      output,
      discovery: discovery.directory,
      proposals,
      holdoutBaseline,
      holdoutCandidate,
    });

    const completed = runScript(config);
    assert.equal(completed.status, 0, completed.stderr);
    const gateText = await fs.readFile(
      path.join(output, "holdout-gate.json"),
      "utf8",
    );
    const gate = JSON.parse(gateText);
    assert.equal(gate.decision, "not-evaluable");
    assert.equal(gate.promoted, false);
    assert.equal(gate.evaluable, false);
    assert.equal(gate.baselineEvaluable, true);
    assert.equal(gate.candidateEvaluable, false);
    assert.equal(gate.baselineMeanReward, 0);
    assert.equal(gate.candidateMeanReward, null);
    assert.equal(gate.meanGain, null);
    assert.equal(gate.candidateErrors, 0);
    assert.equal(gate.candidateQualified, false);
    assert.equal(gate.candidateQualification.nonEvaluableTrials, 2);
    assert.equal(gate.candidateQualification.providerFailureTrials, 1);
    assert.equal(gate.candidateQualification.missingPrimaryRewardTrials, 1);
    assert.match(gate.reason, /missing primary reward/i);

    const providerFailure = gate.candidateEvidence.find(
      (item) => item.outcome === "non-evaluable",
    );
    assert.ok(providerFailure);
    assert.equal(providerFailure.reward, null);
    assert.equal(providerFailure.reportedReward, null);
    assert.equal(providerFailure.primaryRewardMissing, false);
    assert.equal(providerFailure.qualificationPassed, false);
    assert.equal(providerFailure.evidenceClass, "operational-context-budget");
    assert.equal(providerFailure.evidenceEligible, true);
    assert.deepEqual(providerFailure.actionability, {
      actionable: true,
      domain: "execution-efficiency/context-budget",
      reason: "context-budget-exhausted",
    });
    assert.deepEqual(providerFailure.evaluationFailure, {
      failureDomain: "provider",
      status: "provider-failure",
      terminalOutcome: "provider-context-limit",
      errorCode: "context_length_exceeded",
      diagnosticsPath: providerFailure.verifierDiagnostics[0].path,
      evidenceClass: "operational-context-budget",
      actionability: {
        actionable: true,
        domain: "execution-efficiency/context-budget",
        reason: "context-budget-exhausted",
      },
    });
    const missingReward = gate.candidateEvidence.find(
      (item) => item.outcome === "missing-reward",
    );
    assert.ok(missingReward);
    assert.equal(missingReward.reward, null);
    assert.equal(missingReward.reportedReward, null);
    assert.equal(missingReward.primaryRewardMissing, true);
    assert.equal(missingReward.evaluable, false);
    assert.equal(missingReward.qualificationPassed, false);
    assert.equal(missingReward.evaluationFailure.failureDomain, "evaluator");
    assert.equal(missingReward.evidenceClass, "missing-primary-reward");
    assert.equal(missingReward.evidenceEligible, false);
    assert.ok(
      gate.candidateEvidence.some(
        (item) => item.outcome === "verifier-failure" && item.reward === 0,
      ),
    );
    assert.doesNotMatch(gateText, /unbounded diagnostic detail/);
    assert.match(
      await fs.readFile(path.join(output, "report.md"), "utf8"),
      /Candidate mean reward: null/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("locked holdout requires the exact logical skill basename", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-identity-"));
  try {
    const baseline = await createBaseline(root);
    const strictBaseline = path.join(
      root,
      "strict-baseline",
      "skills",
      "evidence-skill",
    );
    await fs.mkdir(path.dirname(strictBaseline), { recursive: true });
    await fs.cp(baseline, strictBaseline, { recursive: true });
    const candidateSource = path.join(
      root,
      "strict-candidate",
      "skills",
      "evidence-skill",
    );
    await fs.mkdir(path.dirname(candidateSource), { recursive: true });
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
    await attachTraceJobLock(discovery.directory, {
      source: strictBaseline,
      digest: baselineDigest,
    });
    const proposals = await writeProposals(
      root,
      "discovery-identity",
      discovery.results,
    );
    const holdoutBaseline = await prepareHoldoutJob(
      root,
      "holdout-baseline-locked",
      0,
      { source: strictBaseline, digest: baselineDigest },
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
    for (const item of [...gate.baselineEvidence, ...gate.candidateEvidence]) {
      assert.equal(item.skillIdentity.logicalName, "evidence-skill");
      assert.equal(item.skillIdentity.lockedName, "evidence-skill");
      assert.equal(item.skillIdentity.sourceBasename, "evidence-skill");
      assert.equal(item.skillIdentity.legacyAliasAccepted, false);
      assert.equal(item.skillIdentity.promotionEligible, true);
    }
    const consolidation = JSON.parse(
      await fs.readFile(path.join(output, "consolidation.json"), "utf8"),
    );
    assert.equal(consolidation.candidateSkill, stagedSkill(output, "candidate"));
    assert.equal(consolidation.stagedBaselineSkill, stagedSkill(output, "baseline"));
    assert.equal(consolidation.logicalSkillName, "evidence-skill");

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

test("analyze-only marks legacy physical aliases as non-promotable", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-trace-legacy-"));
  try {
    const baseline = await createBaseline(root);
    const baselineDigest = computeSkillDigest(baseline);
    const legacyDiscovery = await prepareHoldoutJob(
      root,
      "legacy-discovery-alias",
      1,
      { source: baseline, digest: baselineDigest },
    );
    const proposals = path.join(root, "legacy-proposals.json");
    await fs.writeFile(
      proposals,
      JSON.stringify({ proposals: [] }, null, 2),
      "utf8",
    );
    const output = path.join(root, "output-analyze-only");
    const config = await writeConfig(root, {
      name: "trace-legacy-analyze",
      baseline,
      output,
      discovery: legacyDiscovery,
      proposals,
    });

    const analyzed = runScript(config, "--analyze-only");
    assert.equal(analyzed.status, 0, analyzed.stderr);
    const tracePool = JSON.parse(
      await fs.readFile(path.join(output, "trace-pool.json"), "utf8"),
    );
    const state = JSON.parse(
      await fs.readFile(path.join(output, "proposal-state.json"), "utf8"),
    );
    const consolidation = JSON.parse(
      await fs.readFile(path.join(output, "consolidation.json"), "utf8"),
    );
    assert.deepEqual(tracePool.summary.skillIdentity, {
      legacyAliasTrials: 4,
      unverifiedLockTrials: 0,
      promotionEligible: false,
    });
    assert.ok(
      tracePool.traces.every(
        (item) =>
          item.skillIdentity.legacyAliasAccepted === true &&
          item.skillIdentity.promotionEligible === false,
      ),
    );
    assert.equal(state.developmentEvidencePromotionEligible, false);
    assert.equal(consolidation.developmentEvidencePromotionEligible, false);
    assert.equal(consolidation.candidateSkill, stagedSkill(output, "candidate"));

    const liveConfig = await writeConfig(root, {
      name: "trace-legacy-live",
      baseline,
      output: path.join(root, "output-live"),
      discovery: legacyDiscovery,
      proposals,
    });
    const rejectedLiveAlias = runScript(liveConfig);
    assert.notEqual(rejectedLiveAlias.status, 0);
    assert.match(
      rejectedLiveAlias.stderr,
      /must use logical frontmatter name .* as both locked name and source basename/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
