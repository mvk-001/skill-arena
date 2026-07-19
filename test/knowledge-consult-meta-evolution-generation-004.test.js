import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import { canonicalJson, objectDigest, treeDigest } from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";
import {
  BASELINE_ID,
  CANDIDATE_ID,
  DIAGNOSTIC_CONTRACT_ID,
  FIRST_TASK_ID,
  HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID,
  Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH,
  REMAINING_TASK_IDS,
  buildGeneration004HarborConfig,
  buildOperatorAnalysisConfig,
  buildRunWrapper,
  prepareQ007,
  prepareRemaining,
  sealQ007BaselineDiagnosticMigration,
  sealQ007PublicationProjectionMigration,
  sealGeneration004Authentication,
  sha256File,
  validateGeneration004Protocol,
  verifyQ007,
  verifyQ007BaselineDiagnosticMigration,
  verifyQ007PublicationProjectionMigration,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/prepare-generation-004.js";
import {
  assertPublicationMatchesRecomputed,
  baselineCandidateExecutionGate,
  evaluateForwardGate,
  publishStage,
  sanitizedRecordsFromOperator,
  validateNativeTrialLockProjection,
  verifyPublishedStage,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/publish-generation-004.js";

const trackedProtocolPath = path.resolve(
  "evaluations",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-004",
  "protocol.json",
);

async function trackedProtocol() {
  return JSON.parse(await fs.readFile(trackedProtocolPath, "utf8"));
}

test("generation-004 freezes four Harbor invocations, eight executions, zero retries, and analyzer-owned diagnostic policy", async () => {
  const protocol = validateGeneration004Protocol(await trackedProtocol());
  const runtimeRoot = path.resolve(".tmp", "generation-004-contract-test");
  const knowledgeRoot = path.resolve("..", "knowledge");
  for (const [stageId, expectedTasks] of [
    ["q007", ["q007"]],
    ["remaining-forward-validation", REMAINING_TASK_IDS],
  ]) {
    const preparedRoot = path.join(runtimeRoot, "prepared", stageId);
    for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
      const config = buildGeneration004HarborConfig({ protocol, stageId, candidateId, runtimeRoot, preparedRoot, knowledgeRoot });
      assert.equal(config.n_attempts, 1);
      assert.equal(config.retry.max_retries, 0);
      assert.deepEqual(config.datasets[0].task_names, expectedTasks);
      assert.equal(config.environment.mounts[1].source, "/tmp/skill-arena-knowledge-consult-g004-auth");
      assert.equal(config.agents[0].env.PI_CODING_AGENT_DIR, "/root/.pi/agent");
    }
    const operator = buildOperatorAnalysisConfig({
      protocol,
      stageId,
      runtimeRoot,
      preparedRoot,
      operatorInstruction: "Frozen instruction.",
      baselineOnly: false,
    });
    assert.deepEqual(operator.harbor.candidateAttributableDiagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] });
    assert.equal(operator.candidates.length, 2);
    const baselineWrapper = buildRunWrapper({ protocol, stageId, candidateId: BASELINE_ID, runtimeRoot, preparedRoot });
    const candidateWrapper = buildRunWrapper({ protocol, stageId, candidateId: CANDIDATE_ID, runtimeRoot, preparedRoot });
    assert.match(baselineWrapper, /uvx --offline --from harbor==0\.18\.0 harbor run/);
    assert.doesNotMatch(baselineWrapper, /classify-(?:q007|remaining)-baseline/);
    assert.match(candidateWrapper, new RegExp(`classify-${stageId === "q007" ? "q007" : "remaining"}-baseline`));
    assert.match(candidateWrapper, /job already exists; never overwrite it/);
    assert.match(candidateWrapper, /--network none/);
  }
  assert.equal(protocol.callBudget.maximumAdditionalHarborInvocations, 4);
  assert.equal(protocol.callBudget.maximumAdditionalModelExecutions, 8);
});

function operatorTrial({ taskId, score, qualified, available = true, contextLimit = false }) {
  return {
    taskName: `tasks/${taskId}`,
    taskChecksum: `${taskId}-checksum`,
    reportedReward: contextLimit ? null : score,
    score: available ? score : null,
    evaluationAvailable: available,
    qualificationPassed: qualified,
    error: null,
    requiredRewards: {
      evidence_contract_gate: qualified ? 1 : null,
      mechanical_qualification_gate: qualified ? 1 : null,
      minimum_document_gate: qualified ? 1 : null,
    },
    candidateAttributableDiagnostic: contextLimit ? {
      contractId: DIAGNOSTIC_CONTRACT_ID,
      classification: "candidate-failure",
      reason: "absolute-deny-operational-signal",
      retryAuthorized: false,
      score: 0,
      signals: {
        status: "provider-failure",
        failure_domain: "provider",
        terminal_outcome: "provider-context-limit",
        error_code: "context_length_exceeded",
      },
      contractDefinitionDigest: `sha256:${"a".repeat(64)}`,
    } : null,
    candidateAttributableFailure: contextLimit,
  };
}

function evidenceOutputs(taskIds, { unavailableBaseline = false } = {}) {
  return {
    evidence: {
      development: [
        {
          candidateId: BASELINE_ID,
          trials: taskIds.map((taskId) => unavailableBaseline
            ? operatorTrial({ taskId, score: null, qualified: false, available: false })
            : operatorTrial({ taskId, score: 0, qualified: false, contextLimit: true })),
        },
        {
          candidateId: CANDIDATE_ID,
          trials: taskIds.map((taskId) => operatorTrial({ taskId, score: 0.75, qualified: true })),
        },
      ],
    },
  };
}

test("forward gates consume analyzer dispositions: exact context failures are zero/no-retry, external evidence remains null/stop", async () => {
  const protocol = validateGeneration004Protocol(await trackedProtocol());
  const q007Context = { protocol, taskIds: ["q007"] };
  const records = sanitizedRecordsFromOperator({ context: q007Context, outputs: evidenceOutputs(["q007"]) });
  const baseline = records.find((item) => item.candidateId === BASELINE_ID);
  assert.deepEqual(baseline.disposition, {
    classification: "candidate-attributable-operational-failure",
    contractId: DIAGNOSTIC_CONTRACT_ID,
    evaluationAvailable: true,
    score: 0,
    retryAuthorized: false,
  });
  assert.equal(baseline.qualified, false);
  const exactContextTrial = evidenceOutputs(["q007"]).evidence.development[0].trials[0];
  assert.equal(baselineCandidateExecutionGate([exactContextTrial], 1).authorized, true);
  assert.equal(baselineCandidateExecutionGate([{ ...exactContextTrial, error: "AgentError: fixture" }], 1).authorized, false);
  assert.equal(baselineCandidateExecutionGate([{
    ...exactContextTrial,
    candidateAttributableDiagnostic: null,
    candidateAttributableFailure: false,
  }], 1).authorized, false);
  assert.equal(baselineCandidateExecutionGate([{ ...exactContextTrial, evaluationAvailable: false }], 1).authorized, false);
  const passing = evaluateForwardGate({
    stageId: "q007",
    records,
    ranking: {
      baseline: { effectiveFitness: 0 },
      candidate: { effectiveFitness: 0.75, qualified: true, caseRegressions: [] },
    },
  });
  assert.deepEqual(passing, {
    status: "advance",
    passed: true,
    reason: "q007-forward-case-is-available-qualified-and-non-regressing",
    nextStage: "remaining-forward-validation",
  });
  const stoppedPublicationGate = evaluateForwardGate({
    stageId: "q007",
    records,
    ranking: {
      baseline: { effectiveFitness: 0 },
      candidate: { effectiveFitness: 0, qualified: false, caseRegressions: [] },
    },
  });
  assert.deepEqual(stoppedPublicationGate, {
    status: "stopped",
    passed: false,
    reason: "candidate-is-not-fully-qualified",
    nextStage: null,
  });

  const unavailable = sanitizedRecordsFromOperator({
    context: q007Context,
    outputs: evidenceOutputs(["q007"], { unavailableBaseline: true }),
  });
  assert.equal(evaluateForwardGate({
    stageId: "q007",
    records: unavailable,
    ranking: {
      baseline: { effectiveFitness: null },
      candidate: { effectiveFitness: 0.75, qualified: true, caseRegressions: [] },
    },
  }).reason, "external-or-ambiguous-evidence-is-unavailable");

  const remaining = sanitizedRecordsFromOperator({
    context: { protocol, taskIds: REMAINING_TASK_IDS },
    outputs: evidenceOutputs(REMAINING_TASK_IDS),
  });
  assert.equal(evaluateForwardGate({
    stageId: "remaining-forward-validation",
    records: remaining,
    ranking: {
      baseline: { effectiveFitness: 0 },
      candidate: { effectiveFitness: 0.75, qualified: true, caseRegressions: [] },
    },
  }).passed, true);
  assert.equal(evaluateForwardGate({
    stageId: "remaining-forward-validation",
    records: remaining,
    ranking: {
      baseline: { effectiveFitness: 0.75 },
      candidate: { effectiveFitness: 0.75, qualified: true, caseRegressions: [] },
    },
  }).reason, "remaining-forward-aggregate-gain-is-not-strictly-positive");
});

test("a forged self-hashed q007 pass cannot replace recomputed Harbor evidence", () => {
  const body = {
    schemaVersion: 1,
    experimentId: "knowledge-consult-harbor-operator-forward-g004",
    generationId: "generation-004",
    stageId: "q007",
    records: [{ taskId: "q007", candidateId: BASELINE_ID, evaluationAvailable: false }],
    gate: { status: "stopped", passed: false, reason: "external-or-ambiguous-evidence-is-unavailable", nextStage: null },
  };
  const recomputed = { ...body, publicationSha256: objectDigest(body) };
  assert.doesNotThrow(() => assertPublicationMatchesRecomputed(recomputed, recomputed, "q007"));

  const forgedBody = structuredClone(body);
  forgedBody.gate = { status: "advance", passed: true, reason: "forged", nextStage: "remaining-forward-validation" };
  const forged = { ...forgedBody, publicationSha256: objectDigest(forgedBody) };
  assert.equal(forged.publicationSha256, objectDigest(forgedBody));
  assert.throws(
    () => assertPublicationMatchesRecomputed(forged, recomputed, "q007"),
    /does not match recomputed Harbor evidence drift/,
  );
});

function nativeTrialLockProjectionFixture() {
  const locked = {
    environment: {
      type: "docker",
      force_build: false,
      delete: true,
      cpu_enforcement_policy: "auto",
      memory_enforcement_policy: "auto",
      mounts: [],
      kwargs: {},
      extra_docker_compose: [],
      extra_allowed_hosts: [],
    },
    verifier: { disable: false },
  };
  const trial = {
    config: {
      environment: {
        ...structuredClone(locked.environment),
        import_path: null,
        override_cpus: null,
        override_memory_mb: null,
        override_storage_mb: null,
        override_gpus: null,
        override_tpu: null,
      },
      verifier: {
        ...structuredClone(locked.verifier),
        override_timeout_sec: null,
        max_timeout_sec: null,
      },
    },
  };
  return { candidateId: "baseline/q007", locked, trial };
}

test("generation-004 accepts only Harbor 0.18's exact native environment and verifier null projection", () => {
  assert.doesNotThrow(() => validateNativeTrialLockProjection(nativeTrialLockProjectionFixture()));

  const nearMissEnvironmentField = nativeTrialLockProjectionFixture();
  delete nearMissEnvironmentField.trial.config.environment.override_tpu;
  nearMissEnvironmentField.trial.config.environment.override_tpus = null;
  assert.throws(
    () => validateNativeTrialLockProjection(nearMissEnvironmentField),
    /native trial environment keys drift/,
  );

  const nonNullEnvironmentField = nativeTrialLockProjectionFixture();
  nonNullEnvironmentField.trial.config.environment.override_gpus = 0;
  assert.throws(
    () => validateNativeTrialLockProjection(nonNullEnvironmentField),
    /native trial environment\.override_gpus drift/,
  );

  const nearNullEnvironmentField = nativeTrialLockProjectionFixture();
  nearNullEnvironmentField.trial.config.environment.override_memory_mb = undefined;
  assert.throws(
    () => validateNativeTrialLockProjection(nearNullEnvironmentField),
    /native trial environment\.override_memory_mb drift/,
  );

  const extraNullEnvironmentField = nativeTrialLockProjectionFixture();
  extraNullEnvironmentField.trial.config.environment.future_default = null;
  assert.throws(
    () => validateNativeTrialLockProjection(extraNullEnvironmentField),
    /native trial environment keys drift/,
  );

  const environmentProjectionDrift = nativeTrialLockProjectionFixture();
  environmentProjectionDrift.trial.config.environment.delete = false;
  assert.throws(
    () => validateNativeTrialLockProjection(environmentProjectionDrift),
    /native trial\/lock environment projection drift/,
  );

  const nearMissVerifierField = nativeTrialLockProjectionFixture();
  delete nearMissVerifierField.trial.config.verifier.max_timeout_sec;
  nearMissVerifierField.trial.config.verifier.max_timeout_secs = null;
  assert.throws(
    () => validateNativeTrialLockProjection(nearMissVerifierField),
    /native trial verifier keys drift/,
  );

  const nonNullVerifierField = nativeTrialLockProjectionFixture();
  nonNullVerifierField.trial.config.verifier.override_timeout_sec = 0;
  assert.throws(
    () => validateNativeTrialLockProjection(nonNullVerifierField),
    /native trial verifier\.override_timeout_sec drift/,
  );

  const extraNullVerifierField = nativeTrialLockProjectionFixture();
  extraNullVerifierField.trial.config.verifier.future_default = null;
  assert.throws(
    () => validateNativeTrialLockProjection(extraNullVerifierField),
    /native trial verifier keys drift/,
  );

  const verifierProjectionDrift = nativeTrialLockProjectionFixture();
  verifierProjectionDrift.trial.config.verifier.disable = true;
  assert.throws(
    () => validateNativeTrialLockProjection(verifierProjectionDrift),
    /native trial\/lock verifier projection drift/,
  );
});

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function writeSkill(root, marker) {
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  await fs.writeFile(path.join(root, "SKILL.md"), `---\nname: consult-semantic-okf\ndescription: fixture\n---\n\n${marker}\n`, "utf8");
  await fs.writeFile(path.join(root, "scripts", "runtime_smoke.py"), "print('ok')\n", "utf8");
  if (marker !== "baseline") await fs.writeFile(path.join(root, "candidate.txt"), `${marker}\n`, "utf8");
  return treeDigest(root);
}

async function writeTask(root, taskId) {
  await fs.mkdir(path.join(root, "environment"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(path.join(root, "instruction.md"), `Fixture ${taskId}\n`, "utf8");
  await fs.writeFile(path.join(root, "task.toml"), `version = "1"\n`, "utf8");
  await fs.writeFile(path.join(root, "environment", "Dockerfile"), "FROM scratch\n", "utf8");
  await fs.writeFile(path.join(root, "tests", "test.txt"), "fixture\n", "utf8");
  return treeDigest(root);
}

async function writeCompletedQ007Job(directory, name) {
  const trialName = `${FIRST_TASK_ID}__fixture`;
  const trialDirectory = path.join(directory, trialName);
  await fs.mkdir(trialDirectory, { recursive: true });
  await fs.writeFile(path.join(directory, "config.json"), JSON.stringify({
    job_name: name,
    n_attempts: 1,
    retry: { max_retries: 0 },
  }), "utf8");
  await fs.writeFile(path.join(directory, "lock.json"), JSON.stringify({
    harbor: { version: "0.18.0" },
    retry: { max_retries: 0 },
    trials: [{ task: { name: FIRST_TASK_ID } }],
  }), "utf8");
  await fs.writeFile(path.join(directory, "result.json"), JSON.stringify({
    finished_at: "2026-07-19T00:00:00Z",
    n_total_trials: 1,
    stats: { n_retries: 0 },
  }), "utf8");
  await fs.writeFile(path.join(trialDirectory, "result.json"), JSON.stringify({ trial_name: trialName }), "utf8");
}

test("q007 preparation is immutable, freshly auth-sealed, and does not materialize remaining tasks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-g004-"));
  try {
    const repoRoot = path.join(root, "repo");
    const knowledgeRoot = path.join(root, "knowledge");
    const runtimeRoot = path.join(repoRoot, ".tmp", "runtime-g004");
    const protocolPath = path.join(repoRoot, "generation-004-protocol.json");
    const taskRoot = path.join(repoRoot, ".tmp", "tasks");
    const baselineRoot = path.join(knowledgeRoot, "skills", "consult-semantic-okf");
    const candidateRoot = path.join(repoRoot, "candidate", "consult-semantic-okf");
    const baselineDigest = await writeSkill(baselineRoot, "baseline");
    const candidateDigest = await writeSkill(candidateRoot, "candidate");
    await fs.mkdir(path.join(knowledgeRoot, "reference"), { recursive: true });
    await fs.writeFile(path.join(knowledgeRoot, "reference", "bundle.txt"), "bundle\n", "utf8");
    git(knowledgeRoot, ["init", "-q"]);
    git(knowledgeRoot, ["config", "user.email", "fixture@example.test"]);
    git(knowledgeRoot, ["config", "user.name", "Fixture"]);
    git(knowledgeRoot, ["add", "."]);
    git(knowledgeRoot, ["commit", "-qm", "fixture"]);
    const knowledgeCommit = git(knowledgeRoot, ["rev-parse", "HEAD"]);
    const q007Digest = await writeTask(path.join(taskRoot, "q007"), "q007");

    const selectionBody = {
      generationId: "generation-003",
      gate: { passed: true, selectedCandidateId: "child-001" },
    };
    const selection = { ...selectionBody, publicationSha256: objectDigest(selectionBody) };
    const selectionPath = path.join(repoRoot, ".tmp", "selection", "result.json");
    await fs.mkdir(path.dirname(selectionPath), { recursive: true });
    await fs.writeFile(selectionPath, canonicalJson(selection), "utf8");

    const realization = {
      candidateId: CANDIDATE_ID,
      operatorId: "deterministic-terminal-answer-compiler",
      candidateTreeSha256: candidateDigest.sha256,
      instruction: "Freeze and validate this fixture realization.",
    };
    const realizationPath = path.join(
      repoRoot,
      "evaluations",
      "knowledge-consult-evolution",
      "meta-evolution",
      "generation-003",
      "candidates",
      CANDIDATE_ID,
      "operator-realization.json",
    );
    await fs.mkdir(path.dirname(realizationPath), { recursive: true });
    await fs.writeFile(realizationPath, canonicalJson(realization), "utf8");
    const operatorAnalyzerPath = path.join(repoRoot, "skills", "harbor-operator-coevolution", "scripts", "harbor_operator_coevolution.py");
    await fs.mkdir(path.dirname(operatorAnalyzerPath), { recursive: true });
    await fs.writeFile(operatorAnalyzerPath, "# fixture analyzer\n", "utf8");
    await fs.writeFile(path.join(path.dirname(operatorAnalyzerPath), "harbor_candidate_diagnostic.py"), "# fixture single-candidate diagnostic\n", "utf8");

    const protocol = await trackedProtocol();
    protocol.knowledge.commit = knowledgeCommit;
    protocol.knowledge.baselineSkillPath = "skills/consult-semantic-okf";
    protocol.knowledge.referenceBundlePath = "reference";
    protocol.target.baseline = { candidateId: BASELINE_ID, expectedTreeSha256: baselineDigest.sha256, fileCount: baselineDigest.fileCount, totalBytes: baselineDigest.totalBytes };
    protocol.target.candidate.sourcePath = "candidate/consult-semantic-okf";
    Object.assign(protocol.target.candidate, {
      expectedTreeSha256: candidateDigest.sha256,
      fileCount: candidateDigest.fileCount,
      totalBytes: candidateDigest.totalBytes,
      expectedOperatorRealizationSha256: await sha256File(realizationPath),
    });
    protocol.candidateSelectionProvenance.publicationPath = ".tmp/selection/result.json";
    protocol.candidateSelectionProvenance.publicationFileSha256 = await sha256File(selectionPath);
    protocol.candidateSelectionProvenance.publicationRecordSha256 = selection.publicationSha256;
    Object.assign(protocol.tasks.q007, {
      sourcePath: ".tmp/tasks/q007",
      expectedTreeSha256: q007Digest.sha256,
      fileCount: q007Digest.fileCount,
      totalBytes: q007Digest.totalBytes,
    });
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.writeFile(protocolPath, `${JSON.stringify(protocol, null, 2)}\n`, "utf8");

    const authPath = path.join(root, "auth.json");
    await fs.writeFile(authPath, JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "fixture-access",
        refresh: "fixture-refresh",
        accountId: "fixture-account",
        expires: 4_000_000_000_000,
      },
    }), "utf8");
    const options = { repoRoot, runtimeRoot, protocolPath, knowledgeRoot, taskRoot, authSource: authPath };
    await sealGeneration004Authentication(options);
    const prepared = await prepareQ007(options);
    assert.equal(prepared.mode, "prepared");
    await fs.stat(path.join(runtimeRoot, "prepared", "q007", "tasks", "q007", "task.toml"));
    await assert.rejects(fs.stat(path.join(runtimeRoot, "prepared", "remaining-forward-validation")), { code: "ENOENT" });
    const operatorConfig = parseYaml(await fs.readFile(path.join(runtimeRoot, "prepared", "q007", "configs", "operator", "stage.yaml"), "utf8"));
    assert.deepEqual(operatorConfig.harbor.candidateAttributableDiagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] });
    assert.equal((await verifyQ007(options)).mode, "verified");

    const originalReceiptPath = path.join(runtimeRoot, "prepared", "q007", "receipt.json");
    const originalReceiptSha256 = await sha256File(originalReceiptPath);
    const baselineJobName = `${protocol.experimentId}-q007-baseline`;
    const baselineJob = path.join(runtimeRoot, "jobs", "q007", "baseline", baselineJobName);
    await writeCompletedQ007Job(baselineJob, baselineJobName);
    const migration = await sealQ007BaselineDiagnosticMigration(options);
    assert.equal(migration.mode, "sealed");
    assert.equal(migration.migration.callAccounting.additionalHarborInvocations, 0);
    assert.equal(migration.migration.callAccounting.additionalModelExecutions, 0);
    assert.equal(migration.migration.authorization.candidateExecutionAuthorizedByMigrationAlone, false);
    assert.equal(await sha256File(originalReceiptPath), originalReceiptSha256);
    assert.equal((await verifyQ007BaselineDiagnosticMigration(options)).mode, "verified");

    const v3MigrationPath = path.join(runtimeRoot, "migrations", "q007-baseline-diagnostic-v3", "receipt.json");
    const v3FileSha256 = await sha256File(v3MigrationPath);
    const preCandidateDiagnosticRoot = path.join(runtimeRoot, "private", "operator-analysis", "q007-baseline-diagnostic-v2");
    await fs.mkdir(preCandidateDiagnosticRoot, { recursive: true });
    const preCandidateDiagnostic = {
      schemaVersion: 1,
      mode: "single-candidate-diagnostic-only",
      candidateId: BASELINE_ID,
      evidence: {
        candidateId: BASELINE_ID,
        completedTrials: 1,
        fitnessAvailable: true,
        errorCount: 0,
        trials: [{
          evaluationAvailable: true,
          errorPresent: false,
          candidateAttributableFailure: true,
          candidateAttributableDiagnostic: {
            contractId: DIAGNOSTIC_CONTRACT_ID,
            score: 0,
            retryAuthorized: false,
          },
        }],
      },
    };
    await fs.writeFile(path.join(preCandidateDiagnosticRoot, "candidate-diagnostic.json"), canonicalJson(preCandidateDiagnostic));
    const v3Document = JSON.parse(await fs.readFile(v3MigrationPath, "utf8"));
    await fs.writeFile(
      path.join(preCandidateDiagnosticRoot, "generation-004-analysis-provenance.json"),
      canonicalJson({
        schemaVersion: 1,
        kind: "generation-004-private-operator-analysis-binding",
        stageId: FIRST_TASK_ID,
        baselineOnly: true,
        operatorConfigSha256: await sha256File(path.join(runtimeRoot, "prepared", "q007", "configs", "operator", "stage.yaml")),
        operatorToolSha256: v3Document.diagnosticCapability.fileSha256,
        jobTrees: [{ candidateId: BASELINE_ID, tree: await treeDigest(baselineJob) }],
        outputTree: await treeDigest(preCandidateDiagnosticRoot),
      }),
    );
    const candidateJobName = `${protocol.experimentId}-q007-${CANDIDATE_ID}`;
    const candidateJob = path.join(runtimeRoot, "jobs", "q007", CANDIDATE_ID, candidateJobName);
    await writeCompletedQ007Job(candidateJob, candidateJobName);
    const q007AnalysisRoot = path.join(runtimeRoot, "private", "operator-analysis", "q007-stage");
    await fs.mkdir(q007AnalysisRoot, { recursive: true });
    for (const file of ["generation-evidence.json", "candidate-ranking.json", "operator-coevolution-log.json"]) {
      await fs.writeFile(path.join(q007AnalysisRoot, file), canonicalJson({ schemaVersion: 1, fixture: file }));
    }
    const operatorConfigPath = path.join(runtimeRoot, "prepared", "q007", "configs", "operator", "stage.yaml");
    const analysisProvenance = {
      schemaVersion: 1,
      kind: "generation-004-private-operator-analysis-binding",
      stageId: FIRST_TASK_ID,
      baselineOnly: false,
      operatorConfigSha256: await sha256File(operatorConfigPath),
      operatorToolSha256: await sha256File(operatorAnalyzerPath),
      jobTrees: [
        { candidateId: BASELINE_ID, tree: await treeDigest(baselineJob) },
        { candidateId: CANDIDATE_ID, tree: await treeDigest(candidateJob) },
      ],
      outputTree: await treeDigest(q007AnalysisRoot),
    };
    await fs.writeFile(
      path.join(q007AnalysisRoot, "generation-004-analysis-provenance.json"),
      canonicalJson(analysisProvenance),
    );

    await assert.rejects(publishStage(options, FIRST_TASK_ID), /publication-projection migration|ENOENT/);
    const preSealPublicationPath = path.join(runtimeRoot, "publications", "q007", "result.json");
    await fs.mkdir(path.dirname(preSealPublicationPath), { recursive: true });
    await fs.writeFile(preSealPublicationPath, canonicalJson({ schemaVersion: 1 }));
    await assert.rejects(verifyPublishedStage(options, FIRST_TASK_ID), /publication-projection migration|ENOENT/);
    await fs.rm(path.dirname(preSealPublicationPath), { recursive: true, force: true });

    const projectionMigration = await sealQ007PublicationProjectionMigration(options);
    assert.equal(projectionMigration.mode, "sealed");
    assert.equal(projectionMigration.migration.supersedes.fileSha256, v3FileSha256);
    assert.equal(projectionMigration.migration.completedJobs.length, 2);
    assert.equal(
      projectionMigration.migration.historicalCandidateExecutionSequence.officialPreCandidateDiagnostic.evidenceFileSha256,
      await sha256File(path.join(preCandidateDiagnosticRoot, "candidate-diagnostic.json")),
    );
    assert.equal(projectionMigration.migration.historicalCandidateExecutionSequence.authorizationImported, false);
    assert.equal(projectionMigration.migration.publicationProjection.contract.contractId, HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID);
    assert.equal(projectionMigration.migration.callAccounting.additionalHarborInvocations, 0);
    assert.equal(projectionMigration.migration.callAccounting.additionalModelExecutions, 0);
    assert.equal(projectionMigration.migration.callAccounting.retries, 0);
    assert.deepEqual(projectionMigration.migration.authorization, {
      evidenceCompatibilityOnly: true,
      candidateExecutionAuthorized: false,
      harborRerunAuthorized: false,
      retryAuthorized: false,
      publicationAuthorizedByMigrationAlone: false,
    });
    assert.equal(await sha256File(v3MigrationPath), v3FileSha256);
    assert.equal((await verifyQ007PublicationProjectionMigration(options)).mode, "verified");
    assert.equal((await sealQ007PublicationProjectionMigration(options)).mode, "verified-existing");

    const projectionMigrationPath = path.join(runtimeRoot, ...Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH.split("/"));
    const sealedProjectionBytes = await fs.readFile(projectionMigrationPath);
    const forgedProjection = JSON.parse(sealedProjectionBytes.toString("utf8"));
    forgedProjection.publicationProjection.publisherFileSha256 = "0".repeat(64);
    const { migrationSha256: ignoredMigrationSha256, ...forgedProjectionBody } = forgedProjection;
    forgedProjection.migrationSha256 = objectDigest(forgedProjectionBody);
    await fs.writeFile(projectionMigrationPath, canonicalJson(forgedProjection));
    await assert.rejects(verifyQ007PublicationProjectionMigration(options), /publication-projection migration bindings drift/);
    await fs.writeFile(projectionMigrationPath, sealedProjectionBytes);

    const evidencePath = path.join(q007AnalysisRoot, "generation-evidence.json");
    const sealedEvidenceBytes = await fs.readFile(evidencePath);
    await fs.appendFile(evidencePath, "\n");
    await assert.rejects(verifyQ007PublicationProjectionMigration(options), /q007-stage analysis output tree drift/);
    await fs.writeFile(evidencePath, sealedEvidenceBytes);
    assert.equal((await verifyQ007PublicationProjectionMigration(options)).mode, "verified");

    const forgedBody = {
      schemaVersion: 1,
      experimentId: protocol.experimentId,
      generationId: "generation-004",
      stageId: "q007",
      gate: { status: "advance", passed: true, reason: "forged", nextStage: "remaining-forward-validation" },
    };
    const forgedPublication = { ...forgedBody, publicationSha256: objectDigest(forgedBody) };
    const forgedPublicationPath = path.join(runtimeRoot, "publications", "q007", "result.json");
    await fs.mkdir(path.dirname(forgedPublicationPath), { recursive: true });
    await fs.writeFile(forgedPublicationPath, canonicalJson(forgedPublication), "utf8");
    await assert.rejects(prepareRemaining(options));
    await assert.rejects(fs.stat(path.join(runtimeRoot, "prepared", "remaining-forward-validation")), { code: "ENOENT" });

    await fs.appendFile(path.join(runtimeRoot, "prepared", "q007", "run-baseline.sh"), "# drift\n", "utf8");
    await assert.rejects(verifyQ007(options), /q007 immutable payload drift/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
