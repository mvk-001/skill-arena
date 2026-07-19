import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse as parseYaml } from "yaml";

import { canonicalJson, objectDigest, treeDigest } from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";
import {
  DIAGNOSTIC_CONTRACT_ID,
  FIRST_STAGE_ID,
  FIRST_TASK_ID,
  PARENT_ID,
  REMAINING_STAGE_ID,
  REMAINING_TASK_IDS,
  SEALED_PROTOCOL_SHA256,
  buildGeneration005HarborConfig,
  buildOperatorAnalysisConfig,
  buildRunWrapper,
  prepareQ016,
  prepareRemaining,
  sealCandidateLock,
  sealGeneration005Authentication,
  sha256File,
  validateGeneration005Protocol,
  verifyCandidateLock,
  verifyQ016,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-005/scripts/prepare-generation-005.js";
import {
  assertPublicationMatchesRecomputed,
  baselineCandidateExecutionGate,
  evaluateForwardGate,
  sanitizedRecordsFromOperator,
  validateNativeTrialLockProjection,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-005/scripts/publish-generation-005.js";

const protocolPath = path.resolve("evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-005", "protocol.json");
const childId = "relevance-first-facet-coverage";

async function trackedProtocol() {
  return JSON.parse(await fs.readFile(protocolPath, "utf8"));
}

test("generation-005 protocol and wrappers freeze the q016-first 4/8/0 staged execution profile", async () => {
  assert.equal(await sha256File(protocolPath), SEALED_PROTOCOL_SHA256);
  const protocol = validateGeneration005Protocol(await trackedProtocol());
  const runtimeRoot = path.resolve(".tmp", "generation-005-contract-test");
  const knowledgeRoot = path.resolve("..", "knowledge");
  for (const [stageId, expectedTasks] of [[FIRST_STAGE_ID, [FIRST_TASK_ID]], [REMAINING_STAGE_ID, REMAINING_TASK_IDS]]) {
    const preparedRoot = path.join(runtimeRoot, "prepared", stageId);
    for (const candidateId of [PARENT_ID, childId]) {
      const config = buildGeneration005HarborConfig({ protocol, stageId, candidateId, lockedCandidateId: childId, runtimeRoot, preparedRoot, knowledgeRoot });
      assert.equal(config.n_attempts, 1);
      assert.equal(config.n_concurrent_trials, 1);
      assert.equal(config.retry.max_retries, 0);
      assert.deepEqual(config.retry.exclude_exceptions, protocol.frozenEvaluationProfile.harbor.retry.excludeExceptions);
      assert.deepEqual(config.datasets[0].task_names, expectedTasks);
      assert.equal(config.environment.mounts[1].source, "/tmp/skill-arena-knowledge-consult-g005-auth");
      assert.equal(config.agents[0].model_name, "openai-codex/gpt-5.3-codex-spark");
      assert.equal(config.agents[0].env.PI_CODING_AGENT_DIR, "/root/.pi/agent");
    }
    const operator = buildOperatorAnalysisConfig({
      protocol,
      stageId,
      candidateId: childId,
      runtimeRoot,
      preparedRoot,
      operatorInstruction: "Frozen q018-only reflection.",
      operatorId: "q018-reflection",
    });
    assert.deepEqual(operator.harbor.candidateAttributableDiagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] });
    assert.equal(operator.candidates[0].candidateId, PARENT_ID);
    assert.equal(operator.candidates[1].candidateId, childId);
    assert.notEqual(operator.candidates[0].jobDirectory, operator.candidates[1].jobDirectory);
    const parentWrapper = buildRunWrapper({ protocol, stageId, candidateId: PARENT_ID, lockedCandidateId: childId, runtimeRoot, preparedRoot });
    const childWrapper = buildRunWrapper({ protocol, stageId, candidateId: childId, lockedCandidateId: childId, runtimeRoot, preparedRoot });
    assert.match(parentWrapper, /uvx --offline --from harbor==0\.18\.0 harbor run/);
    assert.doesNotMatch(parentWrapper, /classify-(?:q016|remaining)-parent/);
    assert.match(childWrapper, new RegExp(stageId === FIRST_STAGE_ID ? "classify-q016-parent" : "classify-remaining-parent"));
    assert.match(childWrapper, /job already exists; never overwrite it/);
    assert.match(childWrapper, /--network none/);
  }
  assert.equal(protocol.callBudget.maximumAdditionalHarborInvocations, 4);
  assert.equal(protocol.callBudget.maximumAdditionalModelExecutions, 8);
  assert.equal(protocol.callBudget.harborBuiltInRetries, 0);
  assert.equal(protocol.callBudget.automaticExternalRetries, 0);
  assert.equal(protocol.callBudget.selectiveExternalResumeAttemptsAuthorized, 0);
});

function operatorTrial({ taskId, score, qualified, available = true, contextLimit = false }) {
  return {
    taskName: `knowledge/task__${taskId}`,
    taskChecksum: `${taskId}-checksum`,
    reportedReward: contextLimit ? null : score,
    score: available ? score : null,
    evaluationAvailable: available,
    qualificationPassed: qualified,
    retryAuthorized: false,
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

function evidence(taskIds, { parentScore = 0, childScore = 0.75, parentContextLimit = false, unavailableParent = false } = {}) {
  return {
    evidence: {
      development: [
        {
          candidateId: PARENT_ID,
          trials: taskIds.map((taskId) => unavailableParent
            ? operatorTrial({ taskId, score: null, qualified: false, available: false })
            : operatorTrial({ taskId, score: parentScore, qualified: parentScore > 0, contextLimit: parentContextLimit })),
        },
        {
          candidateId: childId,
          trials: taskIds.map((taskId) => operatorTrial({ taskId, score: childScore, qualified: true })),
        },
      ],
    },
  };
}

test("report-only retry projection accepts only absent, null, or exact false and diagnostics remain explicit deny", async () => {
  const protocol = validateGeneration005Protocol(await trackedProtocol());
  const context = { protocol, candidateId: childId, taskIds: [FIRST_TASK_ID] };

  for (const projection of ["absent", "null", "false"]) {
    const outputs = evidence([FIRST_TASK_ID]);
    for (const candidate of outputs.evidence.development) {
      if (projection === "absent") delete candidate.trials[0].retryAuthorized;
      else candidate.trials[0].retryAuthorized = projection === "null" ? null : false;
    }
    assert.equal(sanitizedRecordsFromOperator({ context, outputs }).length, 2);
  }

  for (const invalid of [true, 0, 1, "false", {}, []]) {
    const outputs = evidence([FIRST_TASK_ID]);
    outputs.evidence.development[0].trials[0].retryAuthorized = invalid;
    assert.throws(
      () => sanitizedRecordsFromOperator({ context, outputs }),
      /retry authorization must be absent, null, or exactly false/,
    );
  }

  for (const invalid of [undefined, null, true, 0, "false"]) {
    const outputs = evidence([FIRST_TASK_ID], { parentContextLimit: true });
    const diagnostic = outputs.evidence.development[0].trials[0].candidateAttributableDiagnostic;
    if (invalid === undefined) delete diagnostic.retryAuthorized;
    else diagnostic.retryAuthorized = invalid;
    assert.throws(
      () => sanitizedRecordsFromOperator({ context, outputs }),
      /diagnostic retry drift: expected false/,
    );
  }
});

test("analyzer dispositions authorize only available parent evidence and cumulative gates require four-case non-regression plus strict gain", async () => {
  const protocol = validateGeneration005Protocol(await trackedProtocol());
  const firstContext = { protocol, candidateId: childId, taskIds: [FIRST_TASK_ID] };
  const firstRecords = sanitizedRecordsFromOperator({ context: firstContext, outputs: evidence([FIRST_TASK_ID], { parentContextLimit: true }) });
  const parent = firstRecords.find((item) => item.candidateId === PARENT_ID);
  assert.deepEqual(parent.disposition, {
    classification: "candidate-attributable-operational-failure",
    contractId: DIAGNOSTIC_CONTRACT_ID,
    evaluationAvailable: true,
    score: 0,
    retryAuthorized: false,
  });
  const rawContextTrial = evidence([FIRST_TASK_ID], { parentContextLimit: true }).evidence.development[0].trials[0];
  assert.equal(baselineCandidateExecutionGate([rawContextTrial], 1).authorized, true);
  assert.equal(baselineCandidateExecutionGate([{ ...rawContextTrial, error: "fixture" }], 1).authorized, false);
  assert.equal(baselineCandidateExecutionGate([{ ...rawContextTrial, evaluationAvailable: false }], 1).authorized, false);
  assert.equal(evaluateForwardGate({
    stageId: FIRST_STAGE_ID,
    records: firstRecords,
    candidateId: childId,
    requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
  }).passed, true);

  const remainingContext = { protocol, candidateId: childId, taskIds: REMAINING_TASK_IDS };
  const remainingRecords = sanitizedRecordsFromOperator({ context: remainingContext, outputs: evidence(REMAINING_TASK_IDS, { parentScore: 0.25, childScore: 0.5 }) });
  const all = [...firstRecords, ...remainingRecords];
  const complete = evaluateForwardGate({
    stageId: REMAINING_STAGE_ID,
    records: all,
    candidateId: childId,
    requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
  });
  assert.equal(complete.passed, true);
  assert.deepEqual(complete.totals, { parent: 0.75, child: 2.25 });

  const equalRecords = sanitizedRecordsFromOperator({ context: remainingContext, outputs: evidence(REMAINING_TASK_IDS, { parentScore: 0.75, childScore: 0.75 }) });
  const equalFirst = sanitizedRecordsFromOperator({ context: firstContext, outputs: evidence([FIRST_TASK_ID], { parentScore: 0.75, childScore: 0.75 }) });
  assert.equal(evaluateForwardGate({
    stageId: REMAINING_STAGE_ID,
    records: [...equalFirst, ...equalRecords],
    candidateId: childId,
    requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
  }).reason, "four-case-total-gain-is-not-strictly-positive");

  const regression = structuredClone(all);
  regression.find((item) => item.taskId === "q022" && item.candidateId === childId).disposition.score = 0.1;
  assert.equal(evaluateForwardGate({
    stageId: REMAINING_STAGE_ID,
    records: regression,
    candidateId: childId,
    requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
  }).reason, "child-regresses-at-least-one-forward-case");

  const unavailable = sanitizedRecordsFromOperator({ context: firstContext, outputs: evidence([FIRST_TASK_ID], { unavailableParent: true }) });
  assert.equal(evaluateForwardGate({
    stageId: FIRST_STAGE_ID,
    records: unavailable,
    candidateId: childId,
    requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
  }).reason, "external-or-ambiguous-evidence-is-unavailable");
});

function nativeProjectionFixture() {
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
  return {
    candidateId: `${PARENT_ID}/${FIRST_TASK_ID}`,
    locked,
    trial: {
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
        verifier: { ...structuredClone(locked.verifier), override_timeout_sec: null, max_timeout_sec: null },
      },
    },
  };
}

test("generation-005 requires Harbor 0.18's exact native trial/lock null projection", () => {
  assert.doesNotThrow(() => validateNativeTrialLockProjection(nativeProjectionFixture()));
  const missing = nativeProjectionFixture();
  delete missing.trial.config.environment.override_tpu;
  assert.throws(() => validateNativeTrialLockProjection(missing), /native trial environment keys drift/);
  const nonNull = nativeProjectionFixture();
  nonNull.trial.config.verifier.max_timeout_sec = 0;
  assert.throws(() => validateNativeTrialLockProjection(nonNull), /native trial verifier\.max_timeout_sec drift/);
  const drift = nativeProjectionFixture();
  drift.trial.config.environment.delete = false;
  assert.throws(() => validateNativeTrialLockProjection(drift), /native trial\/lock environment projection drift/);
});

test("a forged self-hashed q016 pass cannot unlock remaining task materialization", () => {
  const body = {
    schemaVersion: 1,
    generationId: "generation-005",
    stageId: FIRST_STAGE_ID,
    gate: { status: "stopped", passed: false, reason: "unavailable", nextStage: null },
  };
  const recomputed = { ...body, publicationSha256: objectDigest(body) };
  assert.doesNotThrow(() => assertPublicationMatchesRecomputed(recomputed, recomputed, FIRST_STAGE_ID));
  const forgedBody = structuredClone(body);
  forgedBody.gate = { status: "advance", passed: true, reason: "forged", nextStage: REMAINING_STAGE_ID };
  const forged = { ...forgedBody, publicationSha256: objectDigest(forgedBody) };
  assert.throws(() => assertPublicationMatchesRecomputed(forged, recomputed, FIRST_STAGE_ID), /does not match recomputed Harbor evidence drift/);
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
  if (marker !== "parent") await fs.writeFile(path.join(root, "candidate.txt"), `${marker}\n`, "utf8");
  return treeDigest(root);
}

async function writeTask(root, taskId) {
  await fs.mkdir(path.join(root, "environment"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(path.join(root, "instruction.md"), `Fixture ${taskId}\n`, "utf8");
  await fs.writeFile(path.join(root, "task.toml"), "version = \"1\"\n", "utf8");
  await fs.writeFile(path.join(root, "environment", "Dockerfile"), "FROM scratch\n", "utf8");
  await fs.writeFile(path.join(root, "tests", "test.txt"), "fixture\n", "utf8");
  return treeDigest(root);
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-g005-"));
  const repoRoot = path.join(root, "repo");
  const generationRoot = path.join(repoRoot, "generation-005");
  const knowledgeRoot = path.join(root, "knowledge");
  const runtimeRoot = path.join(repoRoot, ".tmp", "runtime-g005");
  const candidateRoot = path.join(generationRoot, "candidates", childId);
  const parentRoot = path.join(repoRoot, "parent", "consult-semantic-okf");
  const childRoot = path.join(candidateRoot, "consult-semantic-okf");
  const parentTree = await writeSkill(parentRoot, "parent");
  const childTree = await writeSkill(childRoot, "child");
  const distillationRoot = path.join(generationRoot, "distillation");
  await fs.mkdir(distillationRoot, { recursive: true });
  const feedbackPath = path.join(distillationRoot, "q018-feedback-receipt.json");
  await fs.writeFile(feedbackPath, canonicalJson({
    schemaVersion: 1,
    taskId: "q018",
    sanitized: true,
    callAccounting: { harborInvocations: 0, modelExecutions: 0, retries: 0 },
  }));
  const procedurePath = path.join(distillationRoot, "mutation-procedure.md");
  await fs.writeFile(procedurePath, "# Fixture q018-only procedure\n", "utf8");
  const manifest = {
    schemaVersion: 2,
    generationId: "generation-005",
    candidateId: childId,
    operatorId: "q018-reflection",
    parentCandidateId: PARENT_ID,
    feedbackTaskIds: ["q018"],
    selectedTaskIdsObservedByCandidateAuthor: [],
    contaminatedTaskContentsObservedByCandidateAuthor: [],
    holdoutOrHardContentsObservedByCandidateAuthor: false,
    candidateFrozenBeforeSelectedTaskRelease: true,
    skill: { name: "consult-semantic-okf", treeSha256: childTree.sha256, fileCount: childTree.fileCount, totalBytes: childTree.totalBytes },
  };
  const manifestPath = path.join(candidateRoot, "candidate-manifest.json");
  await fs.writeFile(manifestPath, canonicalJson(manifest));
  const realization = {
    schemaVersion: 2,
    generationId: "generation-005",
    candidateId: childId,
    operatorId: "q018-reflection",
    parentCandidateId: PARENT_ID,
    candidateTreeSha256: childTree.sha256,
    instruction: "Apply only the frozen q018 reflection.",
    feedbackReceipts: [{ taskId: "q018", path: "../../distillation/q018-feedback-receipt.json", sha256: await sha256File(feedbackPath) }],
    mutationProcedure: { path: "../../distillation/mutation-procedure.md", sha256: await sha256File(procedurePath) },
  };
  await fs.writeFile(path.join(candidateRoot, "operator-realization.json"), canonicalJson(realization));
  await fs.mkdir(path.join(knowledgeRoot, "reference"), { recursive: true });
  await fs.writeFile(path.join(knowledgeRoot, "reference", "bundle.txt"), "bundle\n", "utf8");
  git(knowledgeRoot, ["init", "-q"]);
  git(knowledgeRoot, ["config", "user.email", "fixture@example.test"]);
  git(knowledgeRoot, ["config", "user.name", "Fixture"]);
  git(knowledgeRoot, ["add", "."]);
  git(knowledgeRoot, ["commit", "-qm", "fixture"]);
  const templateTaskRoot = path.join(root, "template-task", FIRST_TASK_ID);
  const q016Tree = await writeTask(templateTaskRoot, FIRST_TASK_ID);
  const protocol = await trackedProtocol();
  protocol.knowledge.commit = git(knowledgeRoot, ["rev-parse", "HEAD"]);
  protocol.knowledge.referenceBundlePath = "reference";
  protocol.target.parent.sourcePath = "parent/consult-semantic-okf";
  Object.assign(protocol.target.parent, { expectedTreeSha256: parentTree.sha256, fileCount: parentTree.fileCount, totalBytes: parentTree.totalBytes });
  protocol.target.child.candidateLockPath = "generation-005/candidate-lock.json";
  Object.assign(protocol.tasks[FIRST_TASK_ID], { sourcePath: `.tmp/tasks/${FIRST_TASK_ID}`, expectedTreeSha256: q016Tree.sha256, fileCount: q016Tree.fileCount, totalBytes: q016Tree.totalBytes });
  const fixtureProtocolPath = path.join(generationRoot, "protocol.json");
  await fs.mkdir(generationRoot, { recursive: true });
  await fs.writeFile(fixtureProtocolPath, `${JSON.stringify(protocol, null, 2)}\n`, "utf8");
  const operatorRoot = path.join(repoRoot, "skills", "harbor-operator-coevolution", "scripts");
  await fs.mkdir(operatorRoot, { recursive: true });
  await fs.writeFile(path.join(operatorRoot, "harbor_operator_report_only.py"), "# fixture report-only analyzer\n", "utf8");
  await fs.writeFile(path.join(operatorRoot, "harbor_candidate_diagnostic.py"), "# fixture diagnostic\n", "utf8");
  const authPath = path.join(root, "auth.json");
  await fs.writeFile(authPath, JSON.stringify({
    "openai-codex": { type: "oauth", access: "fixture-access", refresh: "fixture-refresh", accountId: "fixture-account", expires: 4_000_000_000_000 },
  }), "utf8");
  return {
    root,
    repoRoot,
    generationRoot,
    knowledgeRoot,
    runtimeRoot,
    candidateRoot,
    childRoot,
    manifestPath,
    manifest,
    fixtureProtocolPath,
    expectedProtocolSha256: await sha256File(fixtureProtocolPath),
    authPath,
    templateTaskRoot,
    taskRoot: path.join(repoRoot, ".tmp", "tasks"),
  };
}

test("candidate lock is exclusive and content-blind; q016 preparation remains isolated and remaining release fails closed", async () => {
  const value = await fixture();
  try {
    const options = {
      repoRoot: value.repoRoot,
      runtimeRoot: value.runtimeRoot,
      protocolPath: value.fixtureProtocolPath,
      expectedProtocolSha256: value.expectedProtocolSha256,
      candidateRoot: value.candidateRoot,
      knowledgeRoot: value.knowledgeRoot,
      taskRoot: value.taskRoot,
      authSource: value.authPath,
    };
    await assert.rejects(sealGeneration005Authentication(options), /candidate[- ]lock/);
    const stale = { ...value.manifest, generationId: "generation-003" };
    await fs.writeFile(value.manifestPath, canonicalJson(stale));
    await assert.rejects(sealCandidateLock(options), /candidate manifest generation drift/);
    await assert.rejects(fs.stat(path.join(value.generationRoot, "candidate-lock.json")), { code: "ENOENT" });
    await fs.writeFile(value.manifestPath, canonicalJson(value.manifest));

    // No selected task exists at the candidate-lock boundary. A successful seal
    // therefore proves the writer did not read q016 or any remaining case.
    await assert.rejects(fs.stat(path.join(value.taskRoot, FIRST_TASK_ID)), { code: "ENOENT" });
    const sealed = await sealCandidateLock(options);
    assert.equal(sealed.lock.provenance.feedbackReceipt.taskId, "q018");
    assert.deepEqual(sealed.lock.provenance.feedbackTaskIds, ["q018"]);
    assert.equal(sealed.lock.authorization.harborOrModelCallsAuthorizedByLockAlone, false);
    assert.equal((await verifyCandidateLock(options)).mode, "verified");
    await assert.rejects(sealCandidateLock(options), /already exists/);

    await sealGeneration005Authentication(options);
    await fs.mkdir(value.taskRoot, { recursive: true });
    await fs.cp(value.templateTaskRoot, path.join(value.taskRoot, FIRST_TASK_ID), { recursive: true });
    const prepared = await prepareQ016(options);
    assert.equal(prepared.mode, "prepared");
    const preparedRoot = path.join(value.runtimeRoot, "prepared", FIRST_STAGE_ID);
    await fs.stat(path.join(preparedRoot, "tasks", FIRST_TASK_ID, "task.toml"));
    await assert.rejects(fs.stat(path.join(value.runtimeRoot, "prepared", REMAINING_STAGE_ID)), { code: "ENOENT" });
    const operator = parseYaml(await fs.readFile(path.join(preparedRoot, "configs", "operator", "stage.yaml"), "utf8"));
    assert.equal(operator.candidates[0].candidateId, PARENT_ID);
    assert.equal(operator.candidates[1].candidateId, childId);
    assert.notEqual(operator.candidates[0].jobDirectory, operator.candidates[1].jobDirectory);
    assert.equal((await verifyQ016(options)).mode, "verified");

    await assert.rejects(prepareRemaining(options), /publication|Cannot read|ENOENT/);
    await assert.rejects(fs.stat(path.join(value.runtimeRoot, "prepared", REMAINING_STAGE_ID)), { code: "ENOENT" });

    await fs.appendFile(path.join(value.childRoot, "candidate.txt"), "drift\n");
    await assert.rejects(verifyCandidateLock(options), /locked candidate skill tree drift|candidate skill tree drift/);
  } finally {
    await fs.rm(value.root, { recursive: true, force: true });
  }
});
