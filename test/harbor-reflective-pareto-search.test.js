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
  "test",
  "fixtures",
  "harbor-jobs",
);
const jobTemplate = path.join(
  root,
  "test",
  "fixtures",
  "job-configs",
  "skill.yaml",
);

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

function run(config, ...args) {
  return spawnSync("uv", ["run", script, config, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
}

async function writeSkill(directory, extra = "", logicalName = "example-skill") {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "SKILL.md"),
    [
      "---",
      `name: ${logicalName}`,
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
  requiredRewards,
  developmentJob = jobTemplate,
  holdoutJob = jobTemplate,
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
      developmentJob,
      holdoutJob,
      rewardKey: "reward",
      passThreshold: 1,
      ...(requiredRewards ? { requiredRewards } : {}),
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

async function addTrialRewards(jobDirectory, rewards) {
  const entries = await fs.readdir(jobDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const resultPath = path.join(jobDirectory, entry.name, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.verifier_result ??= {};
    result.verifier_result.rewards = {
      ...(result.verifier_result.rewards ?? {}),
      ...rewards,
    };
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  }
}

async function addVerifierDiagnostics(jobDirectory, diagnostics) {
  const entries = await fs.readdir(jobDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const verifier = path.join(jobDirectory, entry.name, "verifier");
    await fs.mkdir(verifier, { recursive: true });
    await fs.writeFile(
      path.join(verifier, "diagnostics.json"),
      JSON.stringify(diagnostics, null, 2),
    );
  }
}

async function addVerifierDiagnosticsByTrial(jobDirectory, diagnostics) {
  const entries = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(entries.length, diagnostics.length);
  for (const [index, entry] of entries.entries()) {
    const verifier = path.join(jobDirectory, entry.name, "verifier");
    await fs.mkdir(verifier, { recursive: true });
    await fs.writeFile(
      path.join(verifier, "diagnostics.json"),
      JSON.stringify(diagnostics[index], null, 2),
    );
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

async function bindJobSkill(jobDirectory, skill) {
  const jobConfigPath = path.join(jobDirectory, "config.json");
  const jobConfig = JSON.parse(await fs.readFile(jobConfigPath, "utf8"));
  for (const agent of jobConfig.agents) agent.skills = [skill];
  await fs.writeFile(jobConfigPath, JSON.stringify(jobConfig, null, 2), "utf8");
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of trialDirectories) {
    const resultPath = path.join(jobDirectory, entry.name, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.config.agent.skills = [skill];
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  }
  return trialDirectories;
}

async function attachJobLock(jobDirectory, skill, {
  excludedExceptions = [],
  extraInstructions = null,
  lockedName = "example-skill",
} = {}) {
  const skillDigest = await computeSkillDigest(skill);
  const trialDirectories = await bindJobSkill(jobDirectory, skill);
  const trials = [];
  for (const entry of trialDirectories) {
    const result = JSON.parse(
      await fs.readFile(path.join(jobDirectory, entry.name, "result.json"), "utf8"),
    );
    if (extraInstructions) {
      result.config.extra_instruction_paths = extraInstructions.map(
        (instruction) => instruction.path,
      );
      await fs.writeFile(
        path.join(jobDirectory, entry.name, "result.json"),
        JSON.stringify(result, null, 2),
        "utf8",
      );
    }
    const taskLeaf = path.basename(result.config.task.path);
    const trialLock = {
      schema_version: 1,
      task: {
        name: taskLeaf,
        type: "local",
        // Harbor 0.18 uses Packager.compute_content_hash() for TrialLock.task,
        // not the deprecated dirhash value stored in TrialResult.task_checksum.
        digest: `sha256:${sha256(`packager:${result.config.task.path}`)}`,
        source: result.config.task.source ?? null,
        path: result.config.task.path,
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
        name: lockedName,
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
    trials.push(trialLock);
    await fs.writeFile(
      path.join(jobDirectory, entry.name, "lock.json"),
      JSON.stringify(trialLock, null, 2),
      "utf8",
    );
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

async function normalizeJobSourcePaths(jobDirectory) {
  const configPath = path.join(jobDirectory, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  for (const dataset of config.datasets ?? []) {
    for (const key of ["path", "registry_path", "download_dir"]) {
      if (dataset[key] && !path.isAbsolute(dataset[key])) {
        dataset[key] = path.resolve(dataset[key]);
      }
    }
  }
  for (const task of config.tasks ?? []) {
    for (const key of ["path", "download_dir"]) {
      if (task[key] && !path.isAbsolute(task[key])) {
        task[key] = path.resolve(task[key]);
      }
    }
  }
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

async function preparePromotableJob(source, destination, skill, replacements = []) {
  await fs.cp(source, destination, { recursive: true });
  if (replacements.length > 0) {
    await replaceInTrialResults(destination, replacements);
  }
  await normalizeJobSourcePaths(destination);
  await attachJobLock(destination, skill);
  return destination;
}

async function prepareLockedAnalyzeCase(prefix) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill);
  await attachJobLock(candidateJob, candidateSkill);
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
  }), null, 2));
  return { temp, baselineJob, candidateJob, configPath };
}

async function jobTrialDirectories(jobDirectory) {
  return (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function rewriteJobTaskBinding(jobDirectory, {
  kind,
  gitCommitId = null,
  lockedGitCommitId = null,
  gitUrl = "https://example.invalid/tasks.git",
  packageName = "fixture/marker-write",
  packageRef = null,
  packageDigest = `sha256:${sha256("package-content")}`,
}) {
  const rootLockPath = path.join(jobDirectory, "lock.json");
  const rootLock = JSON.parse(await fs.readFile(rootLockPath, "utf8"));
  const entries = await jobTrialDirectories(jobDirectory);
  for (const [index, entry] of entries.entries()) {
    const resultPath = path.join(jobDirectory, entry.name, "result.json");
    const trialLockPath = path.join(jobDirectory, entry.name, "lock.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    let taskLock;
    if (kind === "git") {
      const taskPath = result.config.task.path;
      result.config.task = {
        path: taskPath,
        git_url: gitUrl,
        git_commit_id: gitCommitId,
        overwrite: false,
        download_dir: null,
        source: null,
      };
      result.task_id = {
        git_url: gitUrl,
        git_commit_id: gitCommitId,
        path: taskPath,
      };
      taskLock = {
        ...rootLock.trials[index].task,
        name: path.basename(taskPath),
        type: "git",
        source: null,
        path: taskPath,
        git_url: gitUrl,
        git_commit_id: lockedGitCommitId,
      };
    } else if (kind === "package") {
      const [org, ...nameParts] = packageName.split("/");
      const name = nameParts.join("/");
      result.config.task = {
        path: null,
        git_url: null,
        git_commit_id: null,
        name: packageName,
        ref: packageRef,
        overwrite: false,
        download_dir: null,
        source: null,
      };
      result.task_id = { org, name, ref: packageRef };
      taskLock = {
        name: packageName,
        type: "package",
        digest: packageDigest,
        source: null,
        path: null,
        git_url: null,
        git_commit_id: null,
      };
    } else {
      throw new Error(`Unknown task binding kind: ${kind}`);
    }
    rootLock.trials[index].task = taskLock;
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    const trialLock = JSON.parse(await fs.readFile(trialLockPath, "utf8"));
    trialLock.task = taskLock;
    await fs.writeFile(trialLockPath, JSON.stringify(trialLock, null, 2), "utf8");
  }
  await fs.writeFile(rootLockPath, JSON.stringify(rootLock, null, 2), "utf8");
}

async function removePerTrialLocks(jobDirectory, indexes = null) {
  const entries = await jobTrialDirectories(jobDirectory);
  const selected = indexes ?? entries.map((_, index) => index);
  for (const index of selected) {
    await fs.rm(path.join(jobDirectory, entries[index].name, "lock.json"));
  }
}

async function rewriteResolvedGitLocks(jobDirectory, commitId) {
  const rootLockPath = path.join(jobDirectory, "lock.json");
  const rootLock = JSON.parse(await fs.readFile(rootLockPath, "utf8"));
  const entries = await jobTrialDirectories(jobDirectory);
  for (const [index, entry] of entries.entries()) {
    rootLock.trials[index].task.git_commit_id = commitId;
    const trialLockPath = path.join(jobDirectory, entry.name, "lock.json");
    const trialLock = JSON.parse(await fs.readFile(trialLockPath, "utf8"));
    trialLock.task.git_commit_id = commitId;
    await fs.writeFile(trialLockPath, JSON.stringify(trialLock, null, 2), "utf8");
  }
  await fs.writeFile(rootLockPath, JSON.stringify(rootLock, null, 2), "utf8");
}

async function writeMatchingJobTemplate(directory, jobDirectory) {
  const templatePath = path.join(directory, "matching-job.json");
  await fs.writeFile(
    templatePath,
    await fs.readFile(path.join(jobDirectory, "config.json"), "utf8"),
    "utf8",
  );
  return templatePath;
}

test("Harbor reflective Pareto search builds an archive from native jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve verified recovery behavior.");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await bindJobSkill(baselineJob, baselineSkill);
  await bindJobSkill(candidateJob, candidateSkill);
  const config = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
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
  assert.match(archive.developmentProfileDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(archive.developmentProfile.schemaVersion, 1);
  assert.equal(archive.developmentProfile.declaredObservedDevelopmentMatch, false);
  assert.equal(archive.promotionEligibleProfile, false);
  assert.deepEqual(
    archive.archive.map((item) => item.candidateId),
    ["improved"],
  );
  assert.equal(archive.candidateResults.length, 2);
  assert.ok(archive.candidateResults.every(
    (item) =>
      item.identityMode === "legacy-alias" &&
      item.promotionEligibleProvenance === false &&
      item.exploratory === true,
  ));
  assert.equal(archive.limitations.length, 1);
});

test("Harbor reflective Pareto binds Harbor 0.18 task identities without equating digest algorithms", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-task-lock-"));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill);
  await attachJobLock(candidateJob, candidateSkill);

  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const trialEntry = (await fs.readdir(candidateJob, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))[0];
  const resultPath = path.join(candidateJob, trialEntry.name, "result.json");
  const trialLockPath = path.join(candidateJob, trialEntry.name, "lock.json");
  const rootLockPath = path.join(candidateJob, "lock.json");
  const originalResult = JSON.parse(await fs.readFile(resultPath, "utf8"));
  const originalTrialLock = JSON.parse(await fs.readFile(trialLockPath, "utf8"));
  assert.notEqual(
    originalTrialLock.task.digest,
    `sha256:${sha256(originalResult.task_checksum)}`,
  );

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);

  const identityDrifts = [
    {
      label: "name/path",
      mutate: (result) => {
        result.config.task.path = "C:/fixture/tampered-task";
        result.task_id.path = "C:/fixture/tampered-task";
      },
    },
    {
      label: "source",
      mutate: (result) => { result.config.task.source = "tampered-source"; },
    },
    {
      label: "git identity",
      mutate: (result) => {
        result.config.task.git_url = "https://example.invalid/tasks.git";
        result.config.task.git_commit_id = "0123456789abcdef";
        result.task_id = {
          git_url: result.config.task.git_url,
          git_commit_id: result.config.task.git_commit_id,
          path: result.config.task.path,
        };
      },
    },
    {
      label: "package ref",
      mutate: (result) => {
        result.config.task = {
          path: null,
          git_url: null,
          git_commit_id: null,
          name: "fixture/tampered-task",
          ref: "v2",
          overwrite: false,
          download_dir: null,
          source: null,
        };
        result.task_id = { org: "fixture", name: "tampered-task", ref: "v2" };
      },
    },
  ];
  for (const scenario of identityDrifts) {
    const drift = JSON.parse(JSON.stringify(originalResult));
    scenario.mutate(drift);
    await fs.writeFile(resultPath, JSON.stringify(drift, null, 2), "utf8");
    const rejected = run(configPath, "--analyze-only");
    assert.notEqual(rejected.status, 0, scenario.label);
    assert.match(rejected.stderr, /configured task identity differs/i, scenario.label);
  }
  await fs.writeFile(resultPath, JSON.stringify(originalResult, null, 2), "utf8");

  const tamperedDigest = `sha256:${sha256("tampered-packager-digest")}`;
  const trialLock = JSON.parse(JSON.stringify(originalTrialLock));
  trialLock.task.digest = tamperedDigest;
  await fs.writeFile(trialLockPath, JSON.stringify(trialLock, null, 2), "utf8");
  const rootLock = JSON.parse(await fs.readFile(rootLockPath, "utf8"));
  const rootTrial = rootLock.trials.find(
    (item) => item.task.path === originalTrialLock.task.path,
  );
  rootTrial.task.digest = tamperedDigest;
  await fs.writeFile(rootLockPath, JSON.stringify(rootLock, null, 2), "utf8");
  const digestDrift = run(configPath, "--analyze-only");
  assert.notEqual(digestDrift.status, 0);
  assert.match(digestDrift.stderr, /locks drift/i);
});

test("Harbor reflective Pareto accepts adjacent symbolic Git locks and rejects resolved-commit tampering", async () => {
  const {
    baselineJob,
    candidateJob,
    configPath,
  } = await prepareLockedAnalyzeCase("harbor-pareto-symbolic-git-");
  const resolvedCommit = "a".repeat(40);
  for (const job of [baselineJob, candidateJob]) {
    await rewriteJobTaskBinding(job, {
      kind: "git",
      gitCommitId: "main",
      lockedGitCommitId: resolvedCommit,
    });
  }

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);

  // A coordinated root/direct-lock edit still changes the canonical evaluation
  // input and must fail the cross-candidate lock comparison.
  await rewriteResolvedGitLocks(candidateJob, "b".repeat(40));
  const rejected = run(configPath, "--analyze-only");
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /locks drift/i);
});

test("Harbor reflective Pareto accepts durable root-only Git and package identities with duplicate multiplicity", async () => {
  const packageDigest = `sha256:${sha256("root-only-package-content")}`;
  const scenarios = [
    {
      label: "resolved Git",
      binding: {
        kind: "git",
        gitCommitId: "c".repeat(40),
        lockedGitCommitId: "c".repeat(40),
      },
    },
    {
      label: "digest-pinned package",
      binding: {
        kind: "package",
        packageRef: packageDigest,
        packageDigest,
      },
    },
  ];
  for (const scenario of scenarios) {
    const {
      baselineJob,
      candidateJob,
      configPath,
    } = await prepareLockedAnalyzeCase("harbor-pareto-root-durable-");
    for (const job of [baselineJob, candidateJob]) {
      await rewriteJobTaskBinding(job, scenario.binding);
      await removePerTrialLocks(job);
    }
    const completed = run(configPath, "--analyze-only");
    assert.equal(completed.status, 0, `${scenario.label}: ${completed.stderr}`);
  }
});

test("Harbor reflective Pareto uses full runtime identity for root-only association", async () => {
  const {
    baselineJob,
    candidateJob,
    configPath,
  } = await prepareLockedAnalyzeCase("harbor-pareto-root-runtime-");
  for (const job of [baselineJob, candidateJob]) {
    await removePerTrialLocks(job);
    const entries = await jobTrialDirectories(job);
    const resultPath = path.join(job, entries[0].name, "result.json");
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    result.config.timeout_multiplier = 2;
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");

    const rootLockPath = path.join(job, "lock.json");
    const rootLock = JSON.parse(await fs.readFile(rootLockPath, "utf8"));
    rootLock.trials[0].timeout_multiplier = 2;
    rootLock.trials.reverse();
    await fs.writeFile(rootLockPath, JSON.stringify(rootLock, null, 2), "utf8");
  }

  // The two attempts for each agent share task identity. Reversing the root
  // lock order exercises runtime-aware association instead of greedy pairing.
  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
});

test("Harbor reflective Pareto fails closed on partial and ambiguous root-only locks", async () => {
  {
    const {
      baselineJob,
      configPath,
    } = await prepareLockedAnalyzeCase("harbor-pareto-partial-lock-");
    await removePerTrialLocks(baselineJob, [0]);
    const rejected = run(configPath, "--analyze-only");
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /partial set of per-trial locks/i);
  }

  {
    const {
      baselineJob,
      candidateJob,
      configPath,
    } = await prepareLockedAnalyzeCase("harbor-pareto-ambiguous-lock-");
    for (const job of [baselineJob, candidateJob]) {
      await removePerTrialLocks(job);
      const rootLockPath = path.join(job, "lock.json");
      const rootLock = JSON.parse(await fs.readFile(rootLockPath, "utf8"));
      rootLock.trials[0].task.digest = `sha256:${sha256("ambiguous-task")}`;
      await fs.writeFile(rootLockPath, JSON.stringify(rootLock, null, 2), "utf8");
    }
    const rejected = run(configPath, "--analyze-only");
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /ambiguous across non-identical TrialLocks/i);
  }
});

test("Harbor reflective Pareto requires adjacent locks for mutable Git and package refs", async () => {
  const scenarios = [
    {
      label: "symbolic Git",
      binding: {
        kind: "git",
        gitCommitId: "release",
        lockedGitCommitId: "d".repeat(40),
      },
    },
    {
      label: "mutable package ref",
      binding: {
        kind: "package",
        packageRef: "latest",
        packageDigest: `sha256:${sha256("latest-package-content")}`,
      },
    },
  ];
  for (const scenario of scenarios) {
    const {
      baselineJob,
      candidateJob,
      configPath,
    } = await prepareLockedAnalyzeCase("harbor-pareto-root-mutable-");
    for (const job of [baselineJob, candidateJob]) {
      await rewriteJobTaskBinding(job, scenario.binding);
      await removePerTrialLocks(job);
    }
    const rejected = run(configPath, "--analyze-only");
    assert.notEqual(rejected.status, 0, scenario.label);
    assert.match(
      rejected.stderr,
      /cannot durably bind a mutable Git\/package task identity/i,
      scenario.label,
    );
  }
});

test("Harbor reflective Pareto plans name-preserving isolated staging for development and holdout", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-stage-"));
  const baselineSkill = path.join(temp, "source-baseline-arbitrary-name");
  const candidateSkill = path.join(temp, "source-candidate-arbitrary-name");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Keep a general repair.");
  const config = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: path.join(fixtureRoot, "no-skill"),
    candidateJob: path.join(fixtureRoot, "skill"),
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  for (const args of [["--dry-run"], ["--phase", "holdout", "--dry-run"]]) {
    const completed = run(configPath, ...args);
    assert.equal(completed.status, 0, completed.stderr);
    const plan = JSON.parse(completed.stdout);
    for (const candidate of plan.candidates) {
      assert.equal(candidate.skillName, "example-skill");
      assert.equal(path.basename(candidate.stagedSkill), "example-skill");
      assert.equal(path.basename(path.dirname(candidate.stagedSkill)), "skills");
      assert.notEqual(
        path.basename(candidate.sourceSkill),
        path.basename(candidate.stagedSkill),
      );
      assert.match(candidate.stagedSkill, /candidate-staging/);
    }
  }
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test("Harbor reflective Pareto keeps legacy analyze-only evidence exploratory", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-legacy-"));
  const baselineSkill = path.join(temp, "baseline-alias");
  const candidateSkill = path.join(temp, "candidate-alias");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve verified recovery behavior.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill);
  await attachJobLock(candidateJob, candidateSkill);
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
  }), null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const archive = JSON.parse(
    await fs.readFile(JSON.parse(completed.stdout).archive, "utf8"),
  );
  assert.ok(archive.candidateResults.every(
    (item) =>
      item.identityMode === "legacy-alias" &&
      item.promotionEligibleProvenance === false &&
      item.exploratory === true,
  ));
  assert.ok(archive.archive.every(
    (item) => item.promotionEligibleProvenance === false,
  ));
});

test("Harbor reflective Pareto rejects linked bundles and non-finite policies", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-adversarial-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Keep a general repair.");
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob: path.join(fixtureRoot, "no-skill"),
    candidateJob: path.join(fixtureRoot, "skill"),
  });
  const configText = JSON.stringify(config, null, 2);
  for (const [label, from, to, expected] of [
    ["pass-threshold", '"passThreshold": 1', '"passThreshold": .nan', /passThreshold.*finite/i],
    ["mean-gain", '"minimumMeanGain": 0', '"minimumMeanGain": .inf', /minimumMeanGain.*finite/i],
  ]) {
    const invalidPath = path.join(temp, `${label}.json`);
    await fs.writeFile(invalidPath, configText.replace(from, to), "utf8");
    const completed = run(invalidPath, "--dry-run");
    assert.notEqual(completed.status, 0, label);
    assert.match(completed.stderr, expected);
  }

  const nonFiniteJob = path.join(temp, "non-finite-job");
  const boundBaselineJob = path.join(temp, "bound-baseline-job");
  await fs.cp(path.join(fixtureRoot, "skill"), nonFiniteJob, { recursive: true });
  await fs.cp(
    path.join(fixtureRoot, "no-skill"),
    boundBaselineJob,
    { recursive: true },
  );
  const nonFiniteTrial = (await fs.readdir(nonFiniteJob, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))[0];
  const nonFiniteResultPath = path.join(
    nonFiniteJob,
    nonFiniteTrial.name,
    "result.json",
  );
  const nonFiniteResult = await fs.readFile(nonFiniteResultPath, "utf8");
  await fs.writeFile(
    nonFiniteResultPath,
    nonFiniteResult.replace('"reward": 1', '"reward": 1e309'),
    "utf8",
  );
  await bindJobSkill(nonFiniteJob, candidateSkill);
  await bindJobSkill(boundBaselineJob, baselineSkill);
  const nonFiniteRewardConfig = JSON.parse(configText);
  nonFiniteRewardConfig.search.outputDir = path.join(temp, "non-finite-output");
  nonFiniteRewardConfig.candidates[0].jobDirectory = boundBaselineJob;
  nonFiniteRewardConfig.candidates[1].jobDirectory = nonFiniteJob;
  const nonFiniteRewardPath = path.join(temp, "non-finite-reward.json");
  await fs.writeFile(
    nonFiniteRewardPath,
    JSON.stringify(nonFiniteRewardConfig, null, 2),
    "utf8",
  );
  const nonFiniteReward = run(nonFiniteRewardPath, "--analyze-only");
  assert.notEqual(nonFiniteReward.status, 0);
  assert.match(
    nonFiniteReward.stderr,
    /non-finite reward|reward .*finite|valid number/i,
  );

  const linkedBaseline = path.join(temp, "linked-baseline");
  await fs.cp(baselineSkill, linkedBaseline, { recursive: true });
  const outside = path.join(temp, "outside-bundle");
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(outside, "payload.txt"), "outside\n", "utf8");
  const linkedRoot = path.join(temp, "linked-root");
  if (!await tryCreateDirectoryLink(baselineSkill, linkedRoot)) {
    t.diagnostic("Directory links are unavailable; reparse-point assertion skipped.");
    return;
  }
  const rootLinkedConfig = JSON.parse(configText);
  rootLinkedConfig.search.baselineSkill = linkedRoot;
  rootLinkedConfig.search.outputDir = path.join(temp, "linked-root-output");
  rootLinkedConfig.candidates[0].skill = linkedRoot;
  const rootLinkedConfigPath = path.join(temp, "linked-root-config.json");
  await fs.writeFile(
    rootLinkedConfigPath,
    JSON.stringify(rootLinkedConfig, null, 2),
    "utf8",
  );
  const rootLinked = run(rootLinkedConfigPath, "--dry-run");
  assert.notEqual(rootLinked.status, 0);
  assert.match(rootLinked.stderr, /symbolic link|junction|reparse point/i);
  if (!await tryCreateDirectoryLink(outside, path.join(linkedBaseline, "linked"))) {
    t.diagnostic("Directory links are unavailable; reparse-point assertion skipped.");
    return;
  }
  config.search.baselineSkill = linkedBaseline;
  config.search.outputDir = path.join(temp, "linked-output");
  config.candidates[0].skill = linkedBaseline;
  const linkedConfigPath = path.join(temp, "linked-config.json");
  await fs.writeFile(linkedConfigPath, JSON.stringify(config, null, 2), "utf8");
  const linked = run(linkedConfigPath, "--dry-run");
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /symbolic link|reparse point/i);
});

test("Harbor reflective Pareto rejects unsafe logical names without a fallback", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-name-"));
  for (const [index, logicalName] of ["../escaped", "toy_skill", "con"].entries()) {
    const caseRoot = path.join(temp, `case-${index}`);
    const baselineSkill = path.join(caseRoot, "baseline-source");
    const candidateSkill = path.join(caseRoot, "candidate-source");
    const output = path.join(caseRoot, "run");
    await writeSkill(baselineSkill, "", logicalName);
    await writeSkill(candidateSkill, "Keep a rule.", logicalName);
    const config = configFor({
      output,
      baselineSkill,
      candidateSkill,
      baselineJob: path.join(fixtureRoot, "no-skill"),
      candidateJob: path.join(fixtureRoot, "skill"),
    });
    const configPath = path.join(caseRoot, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    const completed = run(configPath, "--dry-run");
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /exact portable skill basename/i);
    assert.match(completed.stderr, /No fallback name is used/i);
    await assert.rejects(fs.stat(output), /ENOENT/);
  }
  await assert.rejects(fs.stat(path.join(temp, "escaped")), /ENOENT/);
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

test("Harbor reflective Pareto archive excludes candidates with missing required rewards", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-gates-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Try a higher scalar score.");
  await fs.cp(path.join(fixtureRoot, "skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await addTrialRewards(baselineJob, { mechanical_qualification_gate: 1 });
  await attachJobLock(baselineJob, baselineSkill);
  await attachJobLock(candidateJob, candidateSkill);
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
    requiredRewards: { mechanical_qualification_gate: 1 },
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const archive = JSON.parse(
    await fs.readFile(JSON.parse(completed.stdout).archive, "utf8"),
  );
  assert.deepEqual(archive.archive.map((item) => item.candidateId), ["baseline"]);
  const candidate = archive.candidateResults.find(
    (item) => item.candidateId === "improved",
  );
  assert.equal(candidate.qualification.passed, false);
  assert.equal(
    candidate.qualification.missingRequiredRewards,
    candidate.summary.expectedTrials,
  );
  assert.ok(candidate.trials.every(
    (trial) => trial.requiredRewards.mechanical_qualification_gate === null,
  ));
});

test("Harbor reflective Pareto excludes provider failures without treating observed rewards as zero", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-provider-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the otherwise passing response.");
  await fs.cp(path.join(fixtureRoot, "skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await addTrialRewards(baselineJob, { mechanical_qualification_gate: 1 });
  await addTrialRewards(candidateJob, { mechanical_qualification_gate: 1 });
  await addVerifierDiagnostics(candidateJob, {
    status: "provider-failure",
    failure_domain: "provider",
    terminal_outcome: "provider-context-limit",
    error_code: "context_length_exceeded",
  });
  await attachJobLock(baselineJob, baselineSkill);
  await attachJobLock(candidateJob, candidateSkill);
  const config = configFor({
    output: path.join(temp, "run"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
    requiredRewards: { mechanical_qualification_gate: 1 },
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  const completed = run(configPath, "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const archive = JSON.parse(
    await fs.readFile(JSON.parse(completed.stdout).archive, "utf8"),
  );
  assert.deepEqual(archive.archive.map((item) => item.candidateId), ["baseline"]);
  assert.deepEqual(archive.evaluationCounts, {
    candidateCount: 2,
    evaluableCandidates: 1,
    nonEvaluableCandidates: 1,
    trialCount: 8,
    diagnosticsAvailableTrials: 4,
    diagnosticsUnavailableTrials: 4,
    providerFailureTrials: 4,
    infrastructureFailureTrials: 4,
  });
  const baseline = archive.candidateResults.find(
    (item) => item.candidateId === "baseline",
  );
  const candidate = archive.candidateResults.find(
    (item) => item.candidateId === "improved",
  );
  assert.equal(baseline.evaluable, true);
  assert.equal(baseline.summary.diagnosticsAvailableTrials, 0);
  assert.equal(baseline.summary.diagnosticsUnavailableTrials, 4);
  assert.ok(baseline.trials.every(
    (trial) => trial.diagnosticsClassification === "unavailable"
      && trial.diagnosticsStatus === null
      && trial.evaluable,
  ));
  assert.equal(candidate.evaluable, false);
  assert.equal(candidate.qualification.passed, false);
  assert.equal(candidate.summary.meanReward, null);
  assert.equal(candidate.summary.observedMeanReward, 1);
  assert.equal(candidate.summary.evaluableTrials, 0);
  assert.equal(candidate.summary.providerFailureTrials, 4);
  assert.ok(candidate.trials.every(
    (trial) => trial.reward === null
      && trial.reportedReward === 1
      && trial.requiredRewards.mechanical_qualification_gate === null
      && trial.reportedRequiredRewards.mechanical_qualification_gate === 1
      && !trial.evaluable
      && !trial.qualificationPassed
      && trial.diagnosticsStatus === "provider-failure"
      && trial.failureDomain === "provider"
      && trial.terminalOutcome === "provider-context-limit"
      && trial.errorCode === "context_length_exceeded"
      && trial.diagnosticsClassification === "provider-failure",
  ));
});

test("Harbor reflective Pareto recognizes every external domain and terminal/error equivalent", async () => {
  const scenarios = [
    {
      label: "domains",
      diagnostics: [
        { failure_domain: "authentication" },
        { failure_domain: "environment" },
        { failure_domain: "evaluator" },
        { failure_domain: "infrastructure" },
      ],
      expected: ["authentication", "environment", "evaluator", "infrastructure"],
    },
    {
      label: "equivalents",
      diagnostics: [
        { status: "credential-expired" },
        { terminal_outcome: "docker-unavailable" },
        { error_code: "verifier_runtime_failure" },
        { error_code: "context_length_exceeded" },
      ],
      expected: ["authentication", "environment", "evaluator", "provider"],
    },
  ];
  for (const scenario of scenarios) {
    const temp = await fs.mkdtemp(
      path.join(os.tmpdir(), `harbor-pareto-${scenario.label}-`),
    );
    const baselineSkill = path.join(temp, "baseline-source-directory");
    const candidateSkill = path.join(temp, "arbitrary-candidate-directory");
    const baselineJob = path.join(temp, "baseline-job");
    const candidateJob = path.join(temp, "candidate-job");
    await writeSkill(baselineSkill);
    await writeSkill(candidateSkill, "Preserve semantic behavior.");
    await fs.cp(path.join(fixtureRoot, "skill"), baselineJob, { recursive: true });
    await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
    await addVerifierDiagnosticsByTrial(candidateJob, scenario.diagnostics);
    await attachJobLock(baselineJob, baselineSkill);
    await attachJobLock(candidateJob, candidateSkill);
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
    assert.deepEqual(archive.archive.map((item) => item.candidateId), ["baseline"]);
    const candidate = archive.candidateResults.find(
      (item) => item.candidateId === "improved",
    );
    assert.equal(candidate.evaluable, false);
    assert.equal(candidate.summary.meanReward, null);
    assert.equal(candidate.summary.observedMeanReward, 1);
    assert.equal(candidate.summary.infrastructureFailureTrials, 4);
    assert.deepEqual(
      candidate.trials.map(
        (trial) => trial.infrastructureFailureDomain,
      ).sort(),
      [...scenario.expected].sort(),
    );
    assert.ok(candidate.trials.every(
      (trial) => trial.reward === null && !trial.qualificationPassed,
    ));
  }
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

test("Harbor reflective Pareto rejects lock provenance with the wrong logical skill name", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-lock-name-"));
  const baselineSkill = path.join(temp, "baseline-source");
  const candidateSkill = path.join(temp, "candidate-source");
  const baselineJob = path.join(temp, "baseline-job");
  const candidateJob = path.join(temp, "candidate-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Keep a general repair.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), baselineJob, { recursive: true });
  await fs.cp(path.join(fixtureRoot, "skill"), candidateJob, { recursive: true });
  await attachJobLock(baselineJob, baselineSkill, {
    excludedExceptions: ["AgentTimeoutError"],
  });
  await attachJobLock(candidateJob, candidateSkill, {
    excludedExceptions: ["AgentTimeoutError"],
    lockedName: "candidate-source",
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
  assert.match(completed.stderr, /lock skill digest mismatch or identity mismatch/i);

  await attachJobLock(candidateJob, candidateSkill, {
    excludedExceptions: ["AgentTimeoutError"],
  });
  const trialEntry = (await fs.readdir(candidateJob, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))[0];
  const resultPath = path.join(candidateJob, trialEntry.name, "result.json");
  const originalResult = JSON.parse(await fs.readFile(resultPath, "utf8"));

  const wrongTrialSkill = JSON.parse(JSON.stringify(originalResult));
  wrongTrialSkill.config.agent.skills = [baselineSkill];
  await fs.writeFile(resultPath, JSON.stringify(wrongTrialSkill, null, 2), "utf8");
  const trialSkill = run(configPath, "--analyze-only");
  assert.notEqual(trialSkill.status, 0);
  assert.match(trialSkill.stderr, /does not install exactly candidate improved/i);

  const runtimeDrift = JSON.parse(JSON.stringify(originalResult));
  runtimeDrift.config.timeout_multiplier = 2;
  await fs.writeFile(resultPath, JSON.stringify(runtimeDrift, null, 2), "utf8");
  const runtime = run(configPath, "--analyze-only");
  assert.notEqual(runtime.status, 0);
  assert.match(runtime.stderr, /TrialResult\.config\/lock runtime drift/i);

  const observedDrift = JSON.parse(JSON.stringify(originalResult));
  observedDrift.agent_info.model_info.name = "different-observed-model";
  await fs.writeFile(resultPath, JSON.stringify(observedDrift, null, 2), "utf8");
  const observed = run(configPath, "--analyze-only");
  assert.notEqual(observed.status, 0);
  assert.match(observed.stderr, /observed agent\/model profile differs/i);

  await fs.writeFile(resultPath, JSON.stringify(originalResult, null, 2), "utf8");
  const lockPath = path.join(candidateJob, "lock.json");
  const shortLock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  shortLock.trials.pop();
  await fs.writeFile(lockPath, JSON.stringify(shortLock, null, 2), "utf8");
  const lockCount = run(configPath, "--analyze-only");
  assert.notEqual(lockCount.status, 0);
  assert.match(lockCount.stderr, /lock\/result trial-count drift/i);
});

test("Harbor reflective Pareto chains immediate generations, profiles, and parents", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-generation-"));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");
  const baselineJob = await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    path.join(temp, "baseline-job"),
    baselineSkill,
  );
  const candidateJob = await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    path.join(temp, "candidate-job"),
    candidateSkill,
  );
  const matchingJob = await writeMatchingJobTemplate(temp, baselineJob);
  const configPath = path.join(temp, "config.json");
  const generationZero = configFor({
    output: path.join(temp, "generation-zero"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  await fs.writeFile(configPath, JSON.stringify(generationZero, null, 2));
  const first = run(configPath, "--analyze-only");
  assert.equal(first.status, 0, first.stderr);
  const previousPath = JSON.parse(first.stdout).archive;
  const previous = JSON.parse(await fs.readFile(previousPath, "utf8"));

  const generationOne = configFor({
    output: path.join(temp, "generation-one"),
    baselineSkill,
    candidateSkill,
    baselineJob,
    candidateJob,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  generationOne.search.generation = 1;
  generationOne.search.previousGenerationLog = previousPath;
  generationOne.candidates[1].id = "improved-g1";
  generationOne.candidates[1].parents = ["improved"];
  await fs.writeFile(configPath, JSON.stringify(generationOne, null, 2));
  const second = run(configPath, "--analyze-only");
  assert.equal(second.status, 0, second.stderr);
  const secondArchive = JSON.parse(
    await fs.readFile(JSON.parse(second.stdout).archive, "utf8"),
  );
  assert.equal(secondArchive.generation, 1);
  assert.equal(secondArchive.previousGenerationSeal, previous.generationSeal);
  assert.equal(secondArchive.previousGenerationLog, path.resolve(previousPath));

  const unrelatedPath = path.join(temp, "unrelated-previous.json");
  const unrelated = JSON.parse(JSON.stringify(previous));
  unrelated.searchId = "another-search";
  await fs.writeFile(unrelatedPath, JSON.stringify(unrelated, null, 2));
  const unrelatedConfig = JSON.parse(JSON.stringify(generationOne));
  unrelatedConfig.search.outputDir = path.join(temp, "unrelated-output");
  unrelatedConfig.search.previousGenerationLog = unrelatedPath;
  await fs.writeFile(configPath, JSON.stringify(unrelatedConfig, null, 2));
  const unrelatedResult = run(configPath, "--analyze-only");
  assert.notEqual(unrelatedResult.status, 0);
  assert.match(unrelatedResult.stderr, /belongs to another searchId/i);

  const parentDrift = JSON.parse(JSON.stringify(generationOne));
  parentDrift.search.outputDir = path.join(temp, "parent-drift-output");
  parentDrift.candidates[1].parents = ["unrelated-parent"];
  await fs.writeFile(configPath, JSON.stringify(parentDrift, null, 2));
  const parentResult = run(configPath, "--analyze-only");
  assert.notEqual(parentResult.status, 0);
  assert.match(parentResult.stderr, /neither current nor in the previous Pareto archive/i);

  const profileDrift = JSON.parse(JSON.stringify(generationOne));
  profileDrift.search.outputDir = path.join(temp, "profile-drift-output");
  profileDrift.promotion.minimumMeanGain = 0.25;
  await fs.writeFile(configPath, JSON.stringify(profileDrift, null, 2));
  const profileResult = run(configPath, "--analyze-only");
  assert.notEqual(profileResult.status, 0);
  assert.match(profileResult.stderr, /profile drifted from the previous generation/i);
});

test("Harbor reflective Pareto search rejects incomplete native jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-incomplete-"));
  const baselineSkill = path.join(temp, "baseline-skill");
  const candidateSkill = path.join(temp, "candidate-skill");
  const incomplete = path.join(temp, "incomplete-job");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Add one general rule.");
  await fs.cp(path.join(fixtureRoot, "no-skill"), incomplete, { recursive: true });
  for (const entry of await fs.readdir(incomplete, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await fs.rm(path.join(incomplete, entry.name), { recursive: true, force: true });
    }
  }
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
  assert.match(completed.stderr, /contains no trials/i);
});

test("Harbor reflective Pareto search gates only on disjoint holdout jobs", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-holdout-"));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");

  const baselineDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    path.join(temp, "development-baseline"),
    baselineSkill,
  );
  const candidateDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    path.join(temp, "development-candidate"),
    candidateSkill,
  );
  const matchingJob = await writeMatchingJobTemplate(temp, baselineDevelopment);

  const developmentConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(developmentConfig, null, 2));
  const development = run(configPath, "--analyze-only");
  assert.equal(development.status, 0, development.stderr);
  const archive = JSON.parse(development.stdout).archive;

  const baselineHoldout = path.join(temp, "holdout-baseline");
  const candidateHoldout = path.join(temp, "holdout-candidate");
  const replacements = [
    ["sha256:marker-write-v1", "sha256:holdout-v2"],
    ["skill-arena/marker-write", "example/holdout"],
  ];
  await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    baselineHoldout,
    baselineSkill,
    replacements,
  );
  await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    candidateHoldout,
    candidateSkill,
    replacements,
  );

  const nameOverlapBaseline = path.join(temp, "name-overlap-baseline");
  const nameOverlapCandidate = path.join(temp, "name-overlap-candidate");
  const checksumOnly = [
    ["sha256:marker-write-v1", "sha256:name-overlap-new-checksum"],
  ];
  await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    nameOverlapBaseline,
    baselineSkill,
    checksumOnly,
  );
  await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    nameOverlapCandidate,
    candidateSkill,
    checksumOnly,
  );
  const nameOverlapConfig = configFor({
    output: path.join(temp, "name-overlap-output"),
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    baselineHoldout: nameOverlapBaseline,
    candidateHoldout: nameOverlapCandidate,
    archive,
    selected: true,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  await fs.writeFile(configPath, JSON.stringify(nameOverlapConfig, null, 2));
  const nameOverlap = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(nameOverlap.status, 0);
  assert.match(nameOverlap.stderr, /overlap by name or checksum/i);

  const profileBaseline = path.join(temp, "profile-baseline");
  const profileCandidate = path.join(temp, "profile-candidate");
  await fs.cp(baselineHoldout, profileBaseline, { recursive: true });
  await fs.cp(candidateHoldout, profileCandidate, { recursive: true });
  for (const job of [profileBaseline, profileCandidate]) {
    for (const entry of await fs.readdir(job, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const resultPath = path.join(job, entry.name, "result.json");
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      result.agent_info.version = "holdout-version-drift";
      await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    }
  }
  const profileDriftConfig = configFor({
    output: path.join(temp, "profile-drift-output"),
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    baselineHoldout: profileBaseline,
    candidateHoldout: profileCandidate,
    archive,
    selected: true,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  await fs.writeFile(configPath, JSON.stringify(profileDriftConfig, null, 2));
  const profileDrift = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(profileDrift.status, 0);
  assert.match(profileDrift.stderr, /observed agent\/version\/model profile differs/i);
  const failedReleaseBytes = await fs.readdir(path.join(profileDriftConfig.search.outputDir, "holdout"));
  const failedReleaseRetry = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(failedReleaseRetry.status, 0);
  assert.match(failedReleaseRetry.stderr, /validation\/holdout already opened or attempted/i);
  assert.deepEqual(
    await fs.readdir(path.join(profileDriftConfig.search.outputDir, "holdout")),
    failedReleaseBytes,
  );

  const holdoutConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    baselineHoldout,
    candidateHoldout,
    archive,
    selected: true,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
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
    promotion.selectedSkillDigest,
    await computeSkillDigest(candidateSkill),
  );
  assert.match(promotion.developmentProfileDigest, /^sha256:[0-9a-f]{64}$/);
  const promotionBytes = await fs.readFile(result.promotion, "utf8");
  const reopened = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(reopened.status, 0);
  assert.match(reopened.stderr, /validation\/holdout already opened or attempted/i);
  assert.equal(await fs.readFile(result.promotion, "utf8"), promotionBytes);

  const successor = structuredClone(developmentConfig);
  successor.search.generation = 1;
  successor.search.previousGenerationLog = archive;
  successor.search.outputDir = path.join(temp, "must-not-create-successor");
  await fs.writeFile(configPath, JSON.stringify(successor, null, 2));
  for (const mode of ["--analyze-only", "--dry-run"]) {
    const continued = run(configPath, mode);
    assert.notEqual(continued.status, 0);
    assert.match(continued.stderr, /validation\/holdout already opened or attempted/i);
    await assert.rejects(fs.stat(successor.search.outputDir), /ENOENT/);
  }
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

test("Harbor reflective Pareto binds holdout to search, generation, profile, and selected digest", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-binding-"));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");

  const baselineDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    path.join(temp, "development-baseline"),
    baselineSkill,
  );
  const candidateDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    path.join(temp, "development-candidate"),
    candidateSkill,
  );
  const matchingJob = await writeMatchingJobTemplate(temp, baselineDevelopment);

  const developmentConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(developmentConfig, null, 2));
  const development = run(configPath, "--analyze-only");
  assert.equal(development.status, 0, development.stderr);
  const archive = JSON.parse(development.stdout).archive;

  const baselineHoldout = path.join(temp, "holdout-baseline");
  const candidateHoldout = path.join(temp, "holdout-candidate");
  const replacements = [
    ["sha256:marker-write-v1", "sha256:holdout-binding-v2"],
    ["skill-arena/marker-write", "example/holdout-binding"],
  ];
  await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    baselineHoldout,
    baselineSkill,
    replacements,
  );
  await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    candidateHoldout,
    candidateSkill,
    replacements,
  );
  const holdoutConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    baselineHoldout,
    candidateHoldout,
    archive,
    selected: true,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });

  const tamperedArchivePath = path.join(temp, "tampered-archive.json");
  const tamperedArchive = JSON.parse(await fs.readFile(archive, "utf8"));
  tamperedArchive.caseNames = ["attacker/hidden-development-case"];
  await fs.writeFile(
    tamperedArchivePath,
    JSON.stringify(tamperedArchive, null, 2),
    "utf8",
  );
  const tamperedConfig = JSON.parse(JSON.stringify(holdoutConfig));
  tamperedConfig.search.developmentArchive = tamperedArchivePath;
  tamperedConfig.search.outputDir = path.join(temp, "tampered-output");
  await fs.writeFile(configPath, JSON.stringify(tamperedConfig, null, 2));
  const tampered = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /generation seal is invalid/i);

  const driftScenarios = [
    {
      label: "search",
      mutate: (config) => { config.search.id = "another-search"; },
      expected: /archive searchId does not match/i,
    },
    {
      label: "generation",
      mutate: (config) => { config.search.generation = 1; },
      expected: /previousGenerationLog is required|archive generation does not match/i,
    },
    {
      label: "profile",
      mutate: (config) => { config.promotion.minimumMeanGain = 0.25; },
      expected: /archive profile does not match/i,
    },
  ];
  for (const scenario of driftScenarios) {
    const drifted = JSON.parse(JSON.stringify(holdoutConfig));
    scenario.mutate(drifted);
    await fs.writeFile(configPath, JSON.stringify(drifted, null, 2));
    const completed = run(configPath, "--phase", "holdout", "--analyze-only");
    assert.notEqual(completed.status, 0, scenario.label);
    assert.match(completed.stderr, scenario.expected);
  }

  await fs.appendFile(
    path.join(candidateSkill, "SKILL.md"),
    "\nPreserve one additional general behavior.\n",
  );
  await fs.writeFile(configPath, JSON.stringify(holdoutConfig, null, 2));
  const mutated = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.notEqual(mutated.status, 0);
  assert.match(mutated.stderr, /skillDigest drifted after development/i);
  await assert.rejects(fs.stat(path.join(output, "holdout")), /ENOENT/);
});

test("Harbor reflective Pareto blocks holdout when infrastructure diagnostics make it non-evaluable", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-pareto-holdout-provider-"));
  const baselineSkill = path.join(temp, "baseline-source", "example-skill");
  const candidateSkill = path.join(temp, "candidate-source", "example-skill");
  const output = path.join(temp, "run");
  await writeSkill(baselineSkill);
  await writeSkill(candidateSkill, "Preserve the verified general repair.");

  const baselineDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    path.join(temp, "development-baseline"),
    baselineSkill,
  );
  const candidateDevelopment = await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    path.join(temp, "development-candidate"),
    candidateSkill,
  );
  const matchingJob = await writeMatchingJobTemplate(temp, baselineDevelopment);

  const developmentConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(developmentConfig, null, 2));
  const development = run(configPath, "--analyze-only");
  assert.equal(development.status, 0, development.stderr);
  const archive = JSON.parse(development.stdout).archive;

  const baselineHoldout = path.join(temp, "holdout-baseline");
  const candidateHoldout = path.join(temp, "holdout-candidate");
  const replacements = [
    ["sha256:marker-write-v1", "sha256:holdout-provider-v2"],
    ["skill-arena/marker-write", "example/holdout-provider"],
  ];
  await preparePromotableJob(
    path.join(fixtureRoot, "no-skill"),
    baselineHoldout,
    baselineSkill,
    replacements,
  );
  await preparePromotableJob(
    path.join(fixtureRoot, "skill"),
    candidateHoldout,
    candidateSkill,
    replacements,
  );
  await addVerifierDiagnostics(candidateHoldout, {
    status: "infrastructure-failure",
    failure_domain: "infrastructure",
    terminal_outcome: "infra-runtime-unavailable",
    error_code: "docker_unavailable",
  });

  const holdoutConfig = configFor({
    output,
    baselineSkill,
    candidateSkill,
    baselineJob: baselineDevelopment,
    candidateJob: candidateDevelopment,
    baselineHoldout,
    candidateHoldout,
    archive,
    selected: true,
    developmentJob: matchingJob,
    holdoutJob: matchingJob,
  });
  await fs.writeFile(configPath, JSON.stringify(holdoutConfig, null, 2));
  const completed = run(configPath, "--phase", "holdout", "--analyze-only");
  assert.equal(completed.status, 0, completed.stderr);
  const result = JSON.parse(completed.stdout);
  assert.equal(result.decision, "blocked-non-evaluable");
  const promotion = JSON.parse(await fs.readFile(result.promotion, "utf8"));
  assert.equal(promotion.holdout.status, "non-evaluable");
  assert.equal(promotion.holdout.evaluable, false);
  assert.equal(promotion.holdout.blocked, true);
  assert.equal(
    promotion.holdout.blockReason,
    "provider-or-infrastructure-failure",
  );
  assert.equal(promotion.holdout.promoted, false);
  assert.equal(promotion.holdout.candidateMeanReward, null);
  assert.equal(promotion.holdout.meanGain, null);
  assert.equal(promotion.holdout.observedCandidateMeanReward, 1);
  assert.deepEqual(promotion.holdout.diagnosticsCounts.candidate, {
    available: 4,
    unavailable: 0,
    providerFailures: 0,
    infrastructureFailures: 4,
  });
  assert.ok(promotion.holdout.perCase.every(
    (row) => !row.evaluable && row.candidateMeanReward === null,
  ));
  assert.match(await fs.readFile(result.report, "utf8"), /not available/);
});
