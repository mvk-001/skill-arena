import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  canonicalJson,
  frozenProfileFromSource,
  objectDigest,
  treeDigest,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";
import {
  prepareGeneration002,
  piAuthDocumentHasRequiredShape,
  sha256File,
  verifyGeneration002,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/prepare-generation-002.js";
import {
  publishGeneration002,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/publish-generation-002.js";
import {
  recordAuthRemediation,
  verifyAuthRemediation,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-002/scripts/record-auth-remediation.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TRACKED_PROTOCOL = JSON.parse(await fs.readFile(
  path.join(
    REPO_ROOT,
    "evaluations",
    "knowledge-consult-evolution",
    "meta-evolution",
    "generation-002",
    "protocol.json",
  ),
  "utf8",
));
const temporaryRoots = [];

async function write(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function relativePosix(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

async function makeSkill(root, marker) {
  await write(
    path.join(root, "SKILL.md"),
    `---\nname: consult-semantic-okf\ndescription: Synthetic generation-002 fixture ${marker}.\n---\n\n# Fixture\n\n${marker}\n`,
  );
  await write(path.join(root, "scripts", "tool.py"), `MARKER = ${JSON.stringify(marker)}\n`);
}

async function makeFixture({ duplicateChildren = false } = {}) {
  await fs.mkdir(path.join(REPO_ROOT, ".tmp"), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO_ROOT, ".tmp", "meta-g002-test-"));
  temporaryRoots.push(root);
  const knowledgeRoot = path.join(root, "knowledge");
  const baselineRoot = path.join(knowledgeRoot, "skills", "consult-semantic-okf");
  await makeSkill(baselineRoot, "baseline");
  await write(path.join(knowledgeRoot, "bundle", "semantic", "records.jsonl"), "{}\n");
  git(knowledgeRoot, ["init", "--quiet"]);
  git(knowledgeRoot, ["config", "user.name", "Fixture"]);
  git(knowledgeRoot, ["config", "user.email", "fixture@example.invalid"]);
  git(knowledgeRoot, ["add", "."]);
  git(knowledgeRoot, ["commit", "--quiet", "-m", "fixture"]);
  const commit = git(knowledgeRoot, ["rev-parse", "HEAD"]);
  const baselineDigest = await treeDigest(baselineRoot);

  const generation001RuntimeRoot = path.join(root, "generation-001");
  const generation001Baseline = path.join(
    generation001RuntimeRoot,
    "prepared",
    "inputs",
    "baseline",
    "consult-semantic-okf",
  );
  await makeSkill(generation001Baseline, "baseline");
  assert.equal((await treeDigest(generation001Baseline)).sha256, baselineDigest.sha256);
  const q003Root = path.join(generation001RuntimeRoot, "prepared", "tasks", "q003");
  for (const name of ["environment", "solution", "tests"]) {
    await fs.mkdir(path.join(q003Root, name), { recursive: true });
  }
  await write(path.join(q003Root, "instruction.md"), "public development fixture\n");
  await write(path.join(q003Root, "task.toml"), "version = '1'\n");
  await write(path.join(q003Root, "tests", "fixture.txt"), "q003 verifier fixture\n");
  await write(
    path.join(generation001RuntimeRoot, "prepared", "tasks", "q007", "DO-NOT-READ.txt"),
    "Q007_PRIVATE_CANARY_721a\n",
  );
  const q003Digest = await treeDigest(q003Root);

  const profile = structuredClone(TRACKED_PROTOCOL.frozenEvaluationProfile);
  const sourceProtocol = {
    sourceFreeze: {
      repository: { commit },
      dataset: {
        baselineSkillPath: "skills/consult-semantic-okf",
        referenceBundlePath: "bundle",
      },
    },
    evaluationProfile: profile,
  };
  const sourceProtocolPath = path.join(root, "source-protocol.json");
  await write(sourceProtocolPath, canonicalJson(sourceProtocol));

  const jobName = "knowledge-consult-meta-g001-q003-baseline";
  const baselineJobsRoot = path.join(generation001RuntimeRoot, "jobs", "q003", "baseline");
  const jobDirectory = path.join(baselineJobsRoot, jobName);
  const trialName = "q003__fixture_parent";
  const taskChecksum = "4".repeat(64);
  const lockedSkillDigest = `sha256:${"6".repeat(64)}`;
  const expectedSkill = toHarborPath(generation001Baseline);
  const taskDataset = toHarborPath(path.join(generation001RuntimeRoot, "prepared", "tasks"));
  const agent = {
    name: profile.agent.name,
    model_name: profile.agent.model,
    n_concurrent: 1,
    skills: [expectedSkill],
    extra_allowed_hosts: [],
    kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
    env: { PI_CODING_AGENT_DIR: "/root/.pi/agent" },
    mcp_servers: [],
  };
  const parentConfig = {
    job_name: jobName,
    jobs_dir: toHarborPath(baselineJobsRoot),
    n_attempts: 1,
    n_concurrent_trials: 1,
    retry: { max_retries: 0 },
    environment: {
      type: "docker",
      mounts: [
        { type: "bind", source: toHarborPath(path.join(knowledgeRoot, "bundle")), target: "/knowledge", read_only: true },
        { type: "bind", source: "/tmp/skill-arena-knowledge-consult-auth", target: "/root/.pi/agent" },
      ],
    },
    agents: [agent],
    datasets: [{ path: taskDataset, task_names: ["q003"] }],
  };
  const parentLock = {
    harbor: { version: profile.harborVersion },
    retry: { max_retries: 0 },
    trials: [{
      task: { name: "q003", digest: "sha256:fixture-task" },
      agent,
      skills: [{
        name: "consult-semantic-okf",
        source: expectedSkill,
        digest: lockedSkillDigest,
      }],
    }],
  };
  const parentJobResult = {
    finished_at: "2026-07-18T00:00:00Z",
    n_total_trials: 1,
    stats: { n_retries: 0 },
  };
  const parentTrialResult = {
    task_name: "fixture/q003",
    trial_name: trialName,
    task_checksum: taskChecksum,
    config: {
      trial_name: trialName,
      task: { path: `${taskDataset}/q003` },
      agent,
    },
    agent_info: {
      name: profile.agent.name,
      version: profile.agent.version,
      model_info: { provider: "openai-codex", name: "gpt-5.3-codex-spark" },
    },
    agent_result: {
      n_input_tokens: 100,
      n_cache_tokens: 20,
      n_output_tokens: 10,
      reasoning: "PRIVATE_PARENT_TRACE_CANARY_a981",
    },
    verifier_result: {
      rewards: {
        reward: 0,
        evidence_contract_gate: 0,
        minimum_document_gate: 0,
        mechanical_qualification_gate: 0,
      },
      answer: "PRIVATE_PARENT_OUTPUT_CANARY_a233",
    },
    exception_info: null,
    finished_at: "2026-07-18T00:00:00Z",
  };
  await write(path.join(jobDirectory, "config.json"), canonicalJson(parentConfig));
  await write(path.join(jobDirectory, "lock.json"), canonicalJson(parentLock));
  await write(path.join(jobDirectory, "result.json"), canonicalJson(parentJobResult));
  await write(path.join(jobDirectory, trialName, "result.json"), canonicalJson(parentTrialResult));
  const parentHashes = {
    config: await sha256File(path.join(jobDirectory, "config.json")),
    lock: await sha256File(path.join(jobDirectory, "lock.json")),
    result: await sha256File(path.join(jobDirectory, "result.json")),
    trial: await sha256File(path.join(jobDirectory, trialName, "result.json")),
  };

  const preparationReceipt = {
    schemaVersion: 1,
    experimentId: "fixture-generation-001",
    generationId: "generation-001",
    knowledgeCommit: commit,
    frozenEvaluationProfileSha256: objectDigest(frozenProfileFromSource(sourceProtocol)),
    preparationTask: {
      taskId: "q003",
      treeSha256: q003Digest.sha256,
      fileCount: q003Digest.fileCount,
      totalBytes: q003Digest.totalBytes,
    },
    candidates: [{ candidateId: "baseline", treeSha256: baselineDigest.sha256 }],
  };
  const preparationReceiptPath = path.join(generation001RuntimeRoot, "prepared", "receipt.json");
  await write(preparationReceiptPath, canonicalJson(preparationReceipt));
  const preparationReceiptSha256 = await sha256File(preparationReceiptPath);

  const quarantineRoot = path.join(baselineJobsRoot, `${jobName}.external-environment-001`);
  await write(path.join(quarantineRoot, "result.json"), canonicalJson({ incomplete: true }));
  const quarantineDigest = await treeDigest(quarantineRoot);
  const remediation = {
    schemaVersion: 1,
    candidateId: "baseline",
    taskId: "q003",
    classification: {
      domain: "environment",
      code: "bind-source-missing",
      strategyEvaluated: false,
      agentStarted: false,
      modelCalls: 0,
      retryEligible: true,
    },
    evidence: {
      quarantinedJob: path.basename(quarantineRoot),
      trialName: "q003__external_fixture",
      exceptionType: "RuntimeError",
      failurePhase: "harbor.environment.start",
      jobTreeSha256: quarantineDigest.sha256,
      configSha256: parentHashes.config,
    },
    remediation: {
      type: "same-wsl-session-auth-mount",
      changesCandidate: false,
      changesTask: false,
      changesEvaluationProfile: false,
    },
    attemptPolicy: {
      maximumExternalRetries: 1,
      reservedAttempt: 1,
      semanticOutcomesRetried: false,
    },
  };
  const remediationPath = path.join(baselineJobsRoot, "external-resume-receipt.json");
  await write(remediationPath, canonicalJson(remediation));
  const remediationSha256 = await sha256File(remediationPath);

  const parentRecord = {
    taskId: "q003",
    candidateId: "baseline",
    parentCandidateId: null,
    operatorId: null,
    evaluable: true,
    qualified: false,
    status: "evaluated",
    metrics: { primary: 0 },
    gates: {
      evidence_contract_gate: 0,
      mechanical_qualification_gate: 0,
      minimum_document_gate: 0,
    },
    tokens: { input: 100, cache: 20, output: 10 },
    provenance: {
      candidateTreeSha256: baselineDigest.sha256,
      profileSha256: preparationReceipt.frozenEvaluationProfileSha256,
      taskChecksum,
      jobName,
      jobConfigSha256: parentHashes.config,
      jobLockSha256: parentHashes.lock,
      jobResultSha256: parentHashes.result,
      trialResultSha256: parentHashes.trial,
      lockedSkillDigest,
      lockedSkillName: "consult-semantic-okf",
    },
  };
  const publicationBody = {
    schemaVersion: 1,
    experimentId: "fixture-generation-001",
    generationId: "generation-001",
    taskId: "q003",
    profile: {
      sha256: preparationReceipt.frozenEvaluationProfileSha256,
      harborVersion: profile.harborVersion,
      agent: profile.agent.name,
      agentVersion: profile.agent.version,
      model: profile.agent.model,
      thinking: profile.agent.thinking,
      attempts: 1,
      retries: 0,
    },
    provenance: {
      taskTreeSha256: q003Digest.sha256,
      preparationReceiptSha256,
    },
    records: [parentRecord],
  };
  const publication = {
    ...publicationBody,
    publicationSha256: objectDigest(publicationBody),
  };
  const publicationPath = path.join(generation001RuntimeRoot, "publications", "q003", "result.json");
  await write(publicationPath, canonicalJson(publication));
  const publicationFileSha256 = await sha256File(publicationPath);

  const diagnosticLog = {
    schemaVersion: TRACKED_PROTOCOL.diagnosticRepairSource.schemaVersion,
    source: TRACKED_PROTOCOL.diagnosticRepairSource.source,
    evolutionId: TRACKED_PROTOCOL.diagnosticRepairSource.evolutionId,
    generation: TRACKED_PROTOCOL.diagnosticRepairSource.generation,
    generationId: TRACKED_PROTOCOL.diagnosticRepairSource.generationId,
    generationSeal: TRACKED_PROTOCOL.diagnosticRepairSource.generationSeal,
    evolutionProfileDigest: TRACKED_PROTOCOL.diagnosticRepairSource.evolutionProfileDigest,
    diagnosticOnly: true,
    chainEligible: false,
    holdoutOpened: false,
    promotion: false,
    breedingPlan: { operators: [] },
    repairPlan: {
      reason: TRACKED_PROTOCOL.diagnosticRepairSource.repairReason,
      fitnessAwarded: false,
      operatorCreditAwarded: false,
    },
  };
  const diagnosticLogPath = path.join(
    generation001RuntimeRoot,
    ...TRACKED_PROTOCOL.diagnosticRepairSource.path.split("/"),
  );
  await write(diagnosticLogPath, canonicalJson(diagnosticLog));
  const diagnosticLogSha256 = await sha256File(diagnosticLogPath);

  const generationRoot = path.join(root, "meta", "generation-002");
  const childIds = [
    "explicit-floor-terminal-finalize",
    "canonical-floor-terminal-finalize",
  ];
  const childData = [];
  for (const [index, candidateId] of childIds.entries()) {
    const candidateRoot = path.join(generationRoot, "candidates", candidateId);
    const skillRoot = path.join(candidateRoot, "consult-semantic-okf");
    await makeSkill(skillRoot, duplicateChildren ? "duplicate-child" : `child-${index}`);
    const digest = await treeDigest(skillRoot);
    const manifest = {
      schemaVersion: 1,
      generationId: "generation-002",
      candidateId,
      operatorId: "explicit-floor-terminal-finalize",
      parentCandidateId: "00-baseline",
      parentTreeSha256: baselineDigest.sha256,
      parentSourceCommit: commit,
      skill: {
        name: "consult-semantic-okf",
        basename: "consult-semantic-okf",
        treeSha256: digest.sha256,
      },
    };
    const realization = {
      schemaVersion: 1,
      generationId: "generation-002",
      candidateId,
      operatorId: "explicit-floor-terminal-finalize",
      instruction: TRACKED_PROTOCOL.operator.instruction,
      origin: TRACKED_PROTOCOL.operator.origin,
      parentCandidateId: "00-baseline",
      candidateTreeSha256: digest.sha256,
      parentCandidates: [{
        candidateId: "00-baseline",
        treeSha256: baselineDigest.sha256,
        sourceCommit: commit,
      }],
    };
    const manifestPath = path.join(candidateRoot, "candidate-manifest.json");
    const realizationPath = path.join(candidateRoot, "operator-realization.json");
    await write(manifestPath, canonicalJson(manifest));
    await write(realizationPath, canonicalJson(realization));
    childData.push({
      candidateId,
      candidateRoot,
      skillRoot,
      digest,
      manifestPath,
      realizationPath,
      manifestSha256: await sha256File(manifestPath),
      realizationSha256: await sha256File(realizationPath),
    });
  }

  const protocol = structuredClone(TRACKED_PROTOCOL);
  protocol.knowledge.commit = commit;
  protocol.knowledge.baselineSkillPath = "skills/consult-semantic-okf";
  protocol.knowledge.referenceBundlePath = "bundle";
  protocol.target.baseline.expectedTreeSha256 = baselineDigest.sha256;
  protocol.preparationTask.expectedTreeSha256 = q003Digest.sha256;
  protocol.frozenEvaluationProfile = profile;
  protocol.frozenEvaluationProfileSha256 = objectDigest(frozenProfileFromSource(sourceProtocol));
  protocol.diagnosticRepairSource.fileSha256 = diagnosticLogSha256;
  for (const [index, child] of protocol.target.children.entries()) {
    const fixtureChild = childData[index];
    child.sourcePath = relativePosix(fixtureChild.skillRoot);
    child.manifestPath = relativePosix(fixtureChild.manifestPath);
    child.operatorRealizationPath = relativePosix(fixtureChild.realizationPath);
    child.expectedTreeSha256 = fixtureChild.digest.sha256;
    child.expectedManifestSha256 = fixtureChild.manifestSha256;
    child.expectedOperatorRealizationSha256 = fixtureChild.realizationSha256;
  }
  Object.assign(protocol.parentEvidence, {
    publicationFileSha256,
    publicationSha256: publication.publicationSha256,
    preparationReceiptSha256,
    externalRemediationReceiptSha256: remediationSha256,
    taskChecksum,
    jobConfigSha256: parentHashes.config,
    jobLockSha256: parentHashes.lock,
    jobResultSha256: parentHashes.result,
    trialResultSha256: parentHashes.trial,
    lockedSkillDigest,
  });
  const protocolPath = path.join(generationRoot, "protocol.json");
  await write(protocolPath, canonicalJson(protocol));
  return {
    root,
    generationRoot,
    knowledgeRoot,
    sourceProtocolPath,
    generation001RuntimeRoot,
    protocol,
    protocolPath,
    runtimeRoot: path.join(root, "runtime-generation-002"),
    childData,
    parentRecord,
    publicationPath,
    diagnosticLogPath,
  };
}

function prepareOptions(fixture) {
  return {
    repoRoot: REPO_ROOT,
    generationRoot: fixture.generationRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    generation001RuntimeRoot: fixture.generation001RuntimeRoot,
    outputRoot: fixture.runtimeRoot,
  };
}

async function createChildJobs(fixture, { preModelAuthFailure = false } = {}) {
  for (const [index, child] of fixture.protocol.target.children.entries()) {
    const configPath = path.join(
      fixture.runtimeRoot,
      "prepared",
      "configs",
      "harbor",
      "q003",
      `${child.candidateId}.yaml`,
    );
    const config = parseYaml(await fs.readFile(configPath, "utf8"));
    const jobDirectory = path.join(
      fixture.runtimeRoot,
      "jobs",
      "q003",
      child.candidateId,
      config.job_name,
    );
    const trialName = `q003__fixture_child_${index}`;
    const lockedSkillDigest = `sha256:${String(index + 7).repeat(64).slice(0, 64)}`;
    await write(path.join(jobDirectory, "config.json"), canonicalJson(config));
    await write(path.join(jobDirectory, "lock.json"), canonicalJson({
      harbor: { version: fixture.protocol.frozenEvaluationProfile.harborVersion },
      retry: { max_retries: 0 },
      trials: [{
        task: { name: "q003", digest: "sha256:shared-fixture-task" },
        agent: config.agents[0],
        skills: [{
          name: "consult-semantic-okf",
          source: config.agents[0].skills[0],
          digest: lockedSkillDigest,
        }],
      }],
    }));
    await write(path.join(jobDirectory, "result.json"), canonicalJson({
      finished_at: "2026-07-18T00:00:00Z",
      n_total_trials: 1,
      stats: { n_retries: 0 },
    }));
    if (preModelAuthFailure) {
      await write(
        path.join(jobDirectory, trialName, "agent", "pi.txt"),
        `${JSON.stringify({ type: "session", id: `fixture-${index}`, version: "0.73.1" })}\nNo API key found for openai-codex\nPRIVATE_AUTH_LOG_CANARY_09d2\n`,
      );
    }
    const reward = preModelAuthFailure ? 0 : index === 0 ? 0.8 : 0.5;
    await write(path.join(jobDirectory, trialName, "result.json"), canonicalJson({
      task_name: "fixture/q003",
      trial_name: trialName,
      task_checksum: fixture.protocol.parentEvidence.taskChecksum,
      config: {
        trial_name: trialName,
        task: { path: `${config.datasets[0].path}/q003` },
        agent: config.agents[0],
      },
      agent_info: {
        name: "pi",
        version: "0.73.1",
        model_info: { provider: "openai-codex", name: "gpt-5.3-codex-spark" },
      },
      agent_result: {
        n_input_tokens: preModelAuthFailure ? 0 : 200 + index,
        n_cache_tokens: preModelAuthFailure ? 0 : 30 + index,
        n_output_tokens: preModelAuthFailure ? 0 : 20 + index,
        reasoning: "PRIVATE_CHILD_TRACE_CANARY_999e",
      },
      verifier_result: {
        rewards: {
          reward,
          evidence_contract_gate: preModelAuthFailure ? 0 : 1,
          minimum_document_gate: preModelAuthFailure ? 0 : 1,
          mechanical_qualification_gate: preModelAuthFailure ? 0 : 1,
          qrel_identity: "PRIVATE_RELEVANCE_CANARY_111a",
        },
        answer: "PRIVATE_CHILD_OUTPUT_CANARY_222b",
      },
      exception_info: preModelAuthFailure ? {
        exception_type: "NonZeroAgentExitCodeError",
        exception_message: "No API key found for openai-codex; PRIVATE_AUTH_VALUE_CANARY_4a8f",
        exception_traceback: "PRIVATE_AUTH_TRACE_CANARY_82c1",
        occurred_at: "2026-07-18T00:00:00Z",
      } : null,
      finished_at: "2026-07-18T00:00:00Z",
    }));
    await write(
      path.join(jobDirectory, trialName, "verifier", "private", "diagnostics.json"),
      canonicalJson({ details: "PRIVATE_DIAGNOSTIC_CANARY_333c" }),
    );
  }
}

test.after(async () => {
  for (const root of temporaryRoots) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("tracked generation-002 protocol rejects unsealed all-zero digests", async () => {
  const zero = "0".repeat(64);
  for (const child of TRACKED_PROTOCOL.target.children) {
    assert.notEqual(child.expectedTreeSha256, zero);
    assert.notEqual(child.expectedManifestSha256, zero);
    assert.notEqual(child.expectedOperatorRealizationSha256, zero);
  }
  const fixture = await makeFixture();
  const protocol = JSON.parse(await fs.readFile(fixture.protocolPath, "utf8"));
  protocol.target.children[0].expectedManifestSha256 = zero;
  await write(fixture.protocolPath, canonicalJson(protocol));
  await assert.rejects(
    prepareGeneration002(prepareOptions(fixture)),
    /all-zero placeholder is forbidden/,
  );
});

test("Pi auth contract rejects non-object, empty, and non-finite openai-codex entries", () => {
  const valid = {
    "openai-codex": {
      type: "oauth",
      access: "access-value",
      refresh: "refresh-value",
      accountId: "account-value",
      expires: 12345,
    },
  };
  assert.equal(piAuthDocumentHasRequiredShape(valid), true);
  assert.equal(piAuthDocumentHasRequiredShape({ "openai-codex": "token" }), false);
  assert.equal(piAuthDocumentHasRequiredShape({
    "openai-codex": { ...valid["openai-codex"], access: "" },
  }), false);
  assert.equal(piAuthDocumentHasRequiredShape({
    "openai-codex": { ...valid["openai-codex"], refresh: "   " },
  }), false);
  assert.equal(piAuthDocumentHasRequiredShape({
    "openai-codex": { ...valid["openai-codex"], expires: Number.POSITIVE_INFINITY },
  }), false);
  assert.equal(piAuthDocumentHasRequiredShape({
    "openai-codex": { ...valid["openai-codex"], expires: "12345" },
  }), false);
});

test("generation-002 reuses the exact parent, emits only two child YAMLs, preserves empty environment, and is idempotent", async () => {
  const fixture = await makeFixture();
  const first = await prepareGeneration002(prepareOptions(fixture));
  assert.equal(first.mode, "prepared");
  const receiptPath = path.join(fixture.runtimeRoot, "prepared", "receipt.json");
  const receiptBefore = await fs.readFile(receiptPath);
  const second = await prepareGeneration002(prepareOptions(fixture));
  assert.equal(second.mode, "verified-existing");
  assert.deepEqual(await fs.readFile(receiptPath), receiptBefore);
  await verifyGeneration002(prepareOptions(fixture));

  const q003Environment = path.join(
    fixture.generation001RuntimeRoot,
    "prepared",
    "tasks",
    "q003",
    "environment",
  );
  assert.equal((await fs.stat(q003Environment)).isDirectory(), true);
  assert.deepEqual(await fs.readdir(q003Environment), []);
  const harborConfigRoot = path.join(fixture.runtimeRoot, "prepared", "configs", "harbor", "q003");
  assert.deepEqual((await fs.readdir(harborConfigRoot)).sort(), [
    "canonical-floor-terminal-finalize.yaml",
    "explicit-floor-terminal-finalize.yaml",
  ]);
  await assert.rejects(fs.stat(path.join(harborConfigRoot, "baseline.yaml")), /ENOENT/);
  await assert.rejects(fs.stat(path.join(fixture.runtimeRoot, "prepared", "inputs", "baseline")), /ENOENT/);
  await assert.rejects(fs.stat(path.join(fixture.runtimeRoot, "prepared", "tasks")), /ENOENT/);
  for (const name of await fs.readdir(harborConfigRoot)) {
    const config = parseYaml(await fs.readFile(path.join(harborConfigRoot, name), "utf8"));
    assert.equal(config.retry.max_retries, 0);
    assert.equal(config.n_attempts, 1);
    assert.deepEqual(config.datasets[0].task_names, ["q003"]);
    assert.equal(config.environment.mounts[0].target, "/knowledge");
    assert.equal(config.environment.mounts[0].read_only, true);
    assert.equal(config.environment.mounts[1].read_only, undefined);
    assert.equal(path.posix.basename(config.agents[0].skills[0]), "consult-semantic-okf");
  }
  const operator = parseYaml(await fs.readFile(
    path.join(fixture.runtimeRoot, "prepared", "configs", "operator", "generation-002.yaml"),
    "utf8",
  ));
  assert.equal(operator.evolution.generationId, "generation-002");
  assert.equal(operator.evolution.generation, 0);
  assert.equal("previousGenerationLog" in operator.evolution, false);
  assert.equal(operator.coevolution.minimumOperatorTrials, 2);
  assert.equal(operator.operators.length, 2);
  assert.equal(operator.candidates.filter((candidate) => candidate.operatorId === "explicit-floor-terminal-finalize").length, 2);
  assert.equal(operator.candidates.filter((candidate) => candidate.operatorId === "control-no-change").length, 0);
  assert.match(operator.holdout.baseline.jobDirectory, /not-opened/);
  assert.equal(first.receipt.diagnosticRepairSource.diagnosticOnly, true);
  assert.equal(first.receipt.diagnosticRepairSource.chainEligible, false);
  assert.equal(first.receipt.diagnosticRepairSource.holdoutOpened, false);
  assert.equal(first.receipt.diagnosticRepairSource.usedAsPreviousGenerationLog, false);
  assert.equal(
    first.receipt.diagnosticRepairSource.fileSha256,
    await sha256File(fixture.diagnosticLogPath),
  );
  const wrapper = await fs.readFile(
    path.join(fixture.runtimeRoot, "prepared", "run-q003-same-session.sh"),
    "utf8",
  );
  assert.match(wrapper, /install -m 600 -- \"\$auth_json\" \"\$auth_mount\/auth\.json\"/);
  assert.doesNotMatch(wrapper, /cp -a/);
  assert.equal((wrapper.match(/harbor run --config/g) ?? []).length, 2);
  assert.match(wrapper, /credential = payload\.get\(\"openai-codex\"\)/);
  assert.match(wrapper, /isinstance\(credential, dict\)/);
  assert.match(wrapper, /math\.isfinite\(credential\[\"expires\"\]\)/);
  for (const field of ["type", "access", "refresh", "accountId"]) {
    assert.match(wrapper, new RegExp(`\\"${field}\\"`));
  }
  assert.match(wrapper, /complete openai-codex credential entry/);
  assert.ok(wrapper.indexOf("auth_has_openai_codex \"$auth_json\"") < wrapper.indexOf("docker run --pull never --rm --network none"));
  assert.ok(wrapper.indexOf("auth_has_openai_codex \"$auth_json\"") < wrapper.indexOf("harbor run --config"));
  assert.match(wrapper, /canonical child job output already exists/);
  assert.match(wrapper, /docker image inspect --format '\{\{\.Id\}\}' semantic-okf-harbor-runtime:1\.0/);
  assert.match(wrapper, /sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5/);
  assert.match(wrapper, /docker run --pull never --rm --network none --entrypoint \/bin\/bash/);
  assert.match(wrapper, /isolated Pi directory must contain exactly auth\.json/);
  assert.match(wrapper, /settings\.json or shellPath/);
  assert.match(wrapper, /test -x \/bin\/bash/);
  assert.match(wrapper, /command -v python/);
  assert.match(wrapper, /test -r \/candidate-explicit\/scripts\/harbor_answer\.py/);
  assert.match(wrapper, /test -r \/candidate-canonical\/scripts\/harbor_answer\.py/);
  assert.match(wrapper, /python -B \/candidate-explicit\/scripts\/harbor_answer\.py --help/);
  assert.match(wrapper, /python -B \/candidate-canonical\/scripts\/harbor_answer\.py --help/);
  assert.match(wrapper, /mktemp \/tmp\/g002-preflight/);
  assert.match(wrapper, /\.bind-write-preflight/);
  assert.ok(wrapper.indexOf("docker run --pull never --rm --network none") < wrapper.indexOf("harbor run --config"));
  const preparedText = await fs.readFile(receiptPath, "utf8");
  assert.doesNotMatch(preparedText, /Q007_PRIVATE_CANARY_721a|PRIVATE_PARENT_TRACE|PRIVATE_PARENT_OUTPUT/);
  assert.equal(first.receipt.parentEvidence.rerunConfigured, false);
  assert.equal(first.receipt.parentEvidence.externalRemediationModelCalls, 0);
  assert.equal(first.receipt.callAccounting.cumulativeDevelopmentMaximumModelCalls, 5);
});

test("generation-002 refuses to chain a diagnostic-only generation-001 log", async () => {
  const fixture = await makeFixture();
  const protocol = JSON.parse(await fs.readFile(fixture.protocolPath, "utf8"));
  protocol.diagnosticRepairSource.usedAsPreviousGenerationLog = true;
  await write(fixture.protocolPath, canonicalJson(protocol));
  await assert.rejects(
    prepareGeneration002(prepareOptions(fixture)),
    /diagnostic repair chaining policy drift/,
  );
});

test("generation-002 fails closed on reused-parent byte drift and duplicate child bundles", async () => {
  const drifted = await makeFixture();
  await fs.appendFile(drifted.publicationPath, " \n");
  await assert.rejects(
    prepareGeneration002(prepareOptions(drifted)),
    /parent publication file SHA-256 drift/,
  );

  const duplicate = await makeFixture({ duplicateChildren: true });
  await assert.rejects(
    prepareGeneration002(prepareOptions(duplicate)),
    /three distinct tree digests/,
  );

  const missingEnvironment = await makeFixture();
  await fs.rmdir(path.join(
    missingEnvironment.generation001RuntimeRoot,
    "prepared",
    "tasks",
    "q003",
    "environment",
  ));
  await assert.rejects(
    prepareGeneration002(prepareOptions(missingEnvironment)),
    /ENOENT|environment directory/,
  );
});

test("generation-002 publication combines the reused parent with two fresh children and leaks no private material", async () => {
  const fixture = await makeFixture();
  await prepareGeneration002(prepareOptions(fixture));
  await createChildJobs(fixture);
  const published = await publishGeneration002({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(published.publication.gate.passed, true);
  assert.equal(published.publication.gate.selectedCandidateId, "explicit-floor-terminal-finalize");
  assert.equal(published.publication.records.length, 3);
  assert.deepEqual(published.publication.records[0], fixture.parentRecord);
  assert.equal(published.publication.callAccounting.generation001CompletedModelCalls, 3);
  assert.equal(published.publication.callAccounting.externalBaselineRemediationModelCalls, 0);
  assert.equal(published.publication.callAccounting.generation002DevelopmentMaximumModelCalls, 2);
  assert.equal(published.publication.callAccounting.cumulativeDevelopmentMaximumModelCalls, 5);
  const publicBytes = `${await fs.readFile(path.join(published.outputDirectory, "result.json"), "utf8")}\n${await fs.readFile(path.join(published.outputDirectory, "report.md"), "utf8")}`;
  assert.doesNotMatch(
    publicBytes,
    /PRIVATE_|qrel_identity|reasoning|diagnostics|Q007_PRIVATE_CANARY/i,
  );
});

test("generation-002 preserves both zero-token auth failures without resume credit or private error text", async () => {
  const fixture = await makeFixture();
  await prepareGeneration002(prepareOptions(fixture));
  await createChildJobs(fixture, { preModelAuthFailure: true });
  const recorded = await recordAuthRemediation({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(recorded.mode, "recorded");
  assert.equal(recorded.receipt.attempts.length, 2);
  assert.equal(recorded.receipt.callAccounting.modelCalls, 0);
  assert.deepEqual(recorded.receipt.callAccounting.tokens, { input: 0, cache: 0, output: 0 });
  assert.equal(recorded.receipt.operatorEvidence.trialsCounted, 0);
  assert.equal(recorded.receipt.resumeSkill.eligible, false);
  assert.equal(recorded.receipt.resumeSkill.policyRelaxed, false);
  assert.equal(recorded.receipt.resumeSkill.verifierDiagnosticsFabricated, false);
  for (const attempt of recorded.receipt.attempts) {
    const source = path.join(fixture.runtimeRoot, ...attempt.originalJobDirectory.split("/"));
    const destination = path.join(fixture.runtimeRoot, ...attempt.quarantinedJobDirectory.split("/"));
    await assert.rejects(fs.stat(source), /ENOENT/);
    assert.equal((await fs.stat(destination)).isDirectory(), true);
    assert.equal((await fs.stat(path.join(destination, attempt.trialName, "verifier", "private", "diagnostics.json"))).isFile(), true);
    assert.deepEqual(attempt.nativeEvidence.piEventCounts, { session: 1, message: 0, tool: 0, other: 0 });
    assert.match(attempt.nativeEvidence.piLogSha256, /^[a-f0-9]{64}$/);
  }
  const second = await recordAuthRemediation({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(second.mode, "verified-existing");
  const verified = await verifyAuthRemediation({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(verified.mode, "verified");
  const receiptText = await fs.readFile(path.join(recorded.outputDirectory, "receipt.json"), "utf8");
  assert.doesNotMatch(receiptText, /PRIVATE_|No API key found|exception_message|exception_traceback|diagnostics\.json/i);
});
