#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, objectDigest, treeDigest } from "../../scripts/prepare-meta-evolution.js";
import { canonicalGeneration003EvaluationProfile, canonicalGeneration003Lock } from "../../generation-003/scripts/publish-generation-003.js";
import {
  AUTH_SEAL_RELATIVE_PATH,
  DIAGNOSTIC_CONTRACT_ID,
  FIRST_STAGE_ID,
  FIRST_TASK_ID,
  HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS,
  HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS,
  OPERATOR_ANALYZER_RELATIVE_PATH,
  PARENT_ID,
  REMAINING_STAGE_ID,
  REMAINING_TASK_IDS,
  SEALED_PROTOCOL_SHA256,
  SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH,
  buildGeneration005HarborConfig,
  jobDirectory,
  sha256File,
  stageSpecification,
  validateGeneration005Protocol,
  verifyCandidateLock,
} from "./prepare-generation-005.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(GENERATION_ROOT, "..", "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-005");

async function readJson(filePath, label = "JSON") {
  let value;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} root must be an object: ${filePath}`);
  return value;
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireFinite(value, label, { nullable = false, integer = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${nullable ? "null or " : ""}a finite${integer ? " integer" : " number"}`);
  }
  return value;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
}

function assertNoRetryAuthorizedProjection(value, label) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`${label} must be absent, null, or exactly false`);
  }
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} drift`);
}

function assertExactKeys(value, expected, label) {
  equal(Object.keys(requireObject(value, label)).sort(), [...expected].sort(), `${label} keys`);
}

function withoutKeys(value, keys) {
  const projected = structuredClone(value);
  for (const key of keys) delete projected[key];
  return projected;
}

function assertInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if ((!allowRoot && relative === "") || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside ${resolvedRoot}: ${resolved}`);
  }
  return resolved;
}

async function assertOrdinaryFile(filePath, label) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be an ordinary file: ${filePath}`);
  return filePath;
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be an ordinary directory: ${directory}`);
  return directory;
}

export function validateNativeTrialLockProjection({ candidateId, locked, trial }) {
  const trialEnvironment = requireObject(trial.config?.environment, `${candidateId} trial environment`);
  const lockEnvironment = requireObject(locked.environment, `${candidateId} lock environment`);
  assertExactKeys(trialEnvironment, [...Object.keys(lockEnvironment), ...HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS], `${candidateId} native trial environment`);
  for (const field of HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS) assertValue(trialEnvironment[field], null, `${candidateId} native trial environment.${field}`);
  equal(withoutKeys(trialEnvironment, HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS), lockEnvironment, `${candidateId} native trial/lock environment projection`);
  const trialVerifier = requireObject(trial.config?.verifier, `${candidateId} trial verifier`);
  const lockVerifier = requireObject(locked.verifier, `${candidateId} lock verifier`);
  assertExactKeys(trialVerifier, [...Object.keys(lockVerifier), ...HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS], `${candidateId} native trial verifier`);
  for (const field of HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS) assertValue(trialVerifier[field], null, `${candidateId} native trial verifier.${field}`);
  equal(withoutKeys(trialVerifier, HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS), lockVerifier, `${candidateId} native trial/lock verifier projection`);
}

function stageTaskIds(stageId) {
  return stageSpecification(stageId).taskIds;
}

function preparedRoot(runtimeRoot, stageId) {
  return path.join(runtimeRoot, "prepared", stageId);
}

function taskTail(value) {
  const tail = requireString(value, "operator task name").replaceAll("\\", "/").split("/").at(-1);
  return tail.includes("__") ? tail.split("__").at(-1) : tail;
}

async function stageContext(options, stageId) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertInside(path.join(repoRoot, ".tmp"), path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME), "generation-005 runtime");
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const expectedProtocolSha256 = options.expectedProtocolSha256 ?? SEALED_PROTOCOL_SHA256;
  assertValue(await sha256File(protocolPath), expectedProtocolSha256, "sealed generation-005 protocol file digest");
  const protocol = validateGeneration005Protocol(await readJson(protocolPath, "generation-005 protocol"));
  const locked = await verifyCandidateLock({ ...options, repoRoot, runtimeRoot, protocolPath, expectedProtocolSha256 });
  const root = preparedRoot(runtimeRoot, stageId);
  await assertOrdinaryDirectory(root, `${stageId} prepared stage`);
  const receiptPath = path.join(root, "receipt.json");
  const receipt = await readJson(receiptPath, `${stageId} prepared receipt`);
  assertValue(receipt.stageId, stageId, `${stageId} receipt stage`);
  assertValue(receipt.protocolSha256, expectedProtocolSha256, `${stageId} protocol binding`);
  equal(receipt.candidateLock, {
    relativePath: path.relative(repoRoot, locked.lockPath).split(path.sep).join("/"),
    fileSha256: locked.candidateLockFileSha256,
    candidateLockSha256: locked.lock.candidateLockSha256,
  }, `${stageId} candidate-lock binding`);
  assertValue(receipt.profileSha256, objectDigest(protocol.frozenEvaluationProfile), `${stageId} profile binding`);
  assertValue(receipt.knowledgeCommit, protocol.knowledge.commit, `${stageId} knowledge binding`);
  const authSealPath = path.join(runtimeRoot, ...AUTH_SEAL_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(authSealPath, "private authentication seal");
  assertValue(receipt.privateAuthSealFileSha256, await sha256File(authSealPath), `${stageId} authentication-seal binding`);
  equal(receipt.operatorAnalyzer, {
    relativePath: OPERATOR_ANALYZER_RELATIVE_PATH,
    fileSha256: await sha256File(path.join(repoRoot, ...OPERATOR_ANALYZER_RELATIVE_PATH.split("/"))),
  }, `${stageId} report-only analyzer binding`);
  equal(receipt.singleCandidateDiagnostic, {
    relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH,
    fileSha256: await sha256File(path.join(repoRoot, ...SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH.split("/"))),
  }, `${stageId} diagnostic helper binding`);
  equal(receipt.diagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] }, `${stageId} diagnostic policy`);
  equal(await treeDigest(root, { omitRootFiles: ["receipt.json"] }), receipt.immutablePayload, `${stageId} immutable prepared payload`);
  const taskIds = stageTaskIds(stageId);
  equal(receipt.tasks.map((item) => item.taskId), taskIds, `${stageId} receipt task coverage`);
  for (const [candidateId, tree] of [[PARENT_ID, locked.parentTree], [locked.candidateId, locked.candidateTree]]) {
    const recorded = receipt.candidates.find((item) => item.candidateId === candidateId);
    equal(recorded, { candidateId, ...tree }, `${stageId} ${candidateId} receipt tree`);
    equal(await treeDigest(path.join(root, "inputs", candidateId, protocol.target.logicalName)), tree, `${stageId} ${candidateId} prepared tree`);
  }
  for (const taskId of taskIds) {
    const expected = protocol.tasks[taskId];
    const tree = { sha256: expected.expectedTreeSha256, fileCount: expected.fileCount, totalBytes: expected.totalBytes };
    equal(receipt.tasks.find((item) => item.taskId === taskId), { taskId, ...tree }, `${stageId} ${taskId} receipt tree`);
    equal(await treeDigest(path.join(root, "tasks", taskId)), tree, `${stageId} ${taskId} prepared tree`);
  }
  return {
    repoRoot,
    runtimeRoot,
    protocolPath,
    protocol,
    preparedRoot: root,
    receipt,
    receiptPath,
    receiptSha256: await sha256File(receiptPath),
    taskIds,
    candidateId: locked.candidateId,
    candidateLock: locked.lock,
    candidateLockPath: locked.lockPath,
    candidateLockFileSha256: locked.candidateLockFileSha256,
    knowledgeRoot: path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT),
  };
}

function analysisId(stageId, baselineOnly) {
  return `${stageId}-${baselineOnly ? "parent-diagnostic" : "report-only"}`;
}

function analysisToolPath(context, baselineOnly) {
  const relative = baselineOnly ? SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH : OPERATOR_ANALYZER_RELATIVE_PATH;
  return path.join(context.repoRoot, ...relative.split("/"));
}

function operatorConfigPath(context) {
  return path.join(context.preparedRoot, "configs", "operator", "stage.yaml");
}

async function jobTreeBindings(context, baselineOnly) {
  const candidateIds = baselineOnly ? [PARENT_ID] : [PARENT_ID, context.candidateId];
  const bindings = [];
  for (const candidateId of candidateIds) {
    const directory = jobDirectory(context.runtimeRoot, context.protocol, context.stageId, candidateId, context.candidateId);
    await assertOrdinaryDirectory(directory, `${context.stageId} ${candidateId} job`);
    bindings.push({ candidateId, tree: await treeDigest(directory) });
  }
  return bindings;
}

async function verifyAnalysisProvenance(context, root, baselineOnly) {
  const provenancePath = path.join(root, "generation-005-analysis-provenance.json");
  const provenance = await readJson(provenancePath, "generation-005 analysis provenance");
  assertValue(provenance.kind, "generation-005-private-analysis-binding", "analysis provenance kind");
  assertValue(provenance.stageId, context.stageId, "analysis stage");
  assertValue(provenance.baselineOnly, baselineOnly, "analysis scope");
  assertValue(provenance.candidateLockSha256, context.candidateLock.candidateLockSha256, "analysis candidate-lock binding");
  assertValue(provenance.operatorConfigSha256, await sha256File(operatorConfigPath(context)), "analysis config digest");
  assertValue(provenance.operatorToolSha256, await sha256File(analysisToolPath(context, baselineOnly)), "analysis tool digest");
  equal(provenance.jobTrees, await jobTreeBindings(context, baselineOnly), "analysis job-tree bindings");
  equal(provenance.outputTree, await treeDigest(root, { omitRootFiles: ["generation-005-analysis-provenance.json"] }), "analysis output-tree binding");
  return { root, provenance, provenancePath, provenanceFileSha256: await sha256File(provenancePath) };
}

async function runAnalysis(context, baselineOnly, options = {}) {
  if (options.operatorOutputRoot) {
    const root = path.resolve(options.operatorOutputRoot);
    await assertOrdinaryDirectory(root, "supplied operator output");
    return { root, provenance: null, suppliedForTest: true };
  }
  const destination = path.join(context.runtimeRoot, "private", "operator-analysis", analysisId(context.stageId, baselineOnly));
  if (await exists(destination)) return verifyAnalysisProvenance(context, destination, baselineOnly);
  const configPath = operatorConfigPath(context);
  const toolPath = analysisToolPath(context, baselineOnly);
  await Promise.all([assertOrdinaryFile(configPath, "operator config"), assertOrdinaryFile(toolPath, "operator tool")]);
  const staging = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (baselineOnly) await fs.mkdir(staging, { recursive: false });
  const args = baselineOnly
    ? ["run", toolPath, configPath, "--candidate-id", PARENT_ID, "--output-file", path.join(staging, "candidate-diagnostic.json")]
    : ["run", toolPath, configPath, "--output-dir", staging];
  const completed = spawnSync("uv", args, { cwd: context.repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
  if (completed.status !== 0) {
    if (await exists(staging)) await fs.rm(staging, { recursive: true, force: true });
    throw new Error("Private analyzer classification failed closed; no child call or publication is authorized");
  }
  await assertOrdinaryDirectory(staging, "analysis staging output");
  const required = baselineOnly
    ? ["candidate-diagnostic.json"]
    : ["generation-evidence.json", "candidate-ranking.json", "operator-ranking.json", "breeding-plan.json", "holdout-promotion.json", "operator-coevolution-log.json", "report.md"];
  for (const file of required) await assertOrdinaryFile(path.join(staging, file), `analysis output ${file}`);
  const provenance = {
    schemaVersion: 1,
    kind: "generation-005-private-analysis-binding",
    stageId: context.stageId,
    baselineOnly,
    candidateLockSha256: context.candidateLock.candidateLockSha256,
    operatorConfigSha256: await sha256File(configPath),
    operatorToolSha256: await sha256File(toolPath),
    jobTrees: await jobTreeBindings(context, baselineOnly),
    outputTree: await treeDigest(staging),
  };
  await fs.writeFile(path.join(staging, "generation-005-analysis-provenance.json"), canonicalJson(provenance), { encoding: "utf8", flag: "wx" });
  await fs.rename(staging, destination);
  return verifyAnalysisProvenance(context, destination, baselineOnly);
}

function diagnosticPolicy(value, label) {
  const policy = requireObject(value, label);
  equal(policy.contracts, [DIAGNOSTIC_CONTRACT_ID], `${label} contracts`);
  const digest = requireString(policy.contractDefinitionsDigest, `${label} contract-definition digest`);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} contract-definition digest is malformed`);
  return { contracts: [DIAGNOSTIC_CONTRACT_ID], contractDefinitionsDigest: digest };
}

async function loadSingleCandidateDiagnostic(analysis, context) {
  const diagnosticPath = path.join(analysis.root, "candidate-diagnostic.json");
  const document = await readJson(diagnosticPath, "single-candidate diagnostic");
  assertValue(document.mode, "single-candidate-diagnostic-only", "single-candidate diagnostic mode");
  assertValue(document.source, "harbor-operator-coevolution", "single-candidate diagnostic source");
  assertValue(document.candidateId, PARENT_ID, "single-candidate diagnostic candidate");
  equal(document.capabilityBoundaries, {
    harborExecution: false,
    otherCandidateJobsOpened: false,
    holdoutOpened: false,
    rankingProduced: false,
    breedingProduced: false,
  }, "single-candidate diagnostic capability boundaries");
  const evidence = requireObject(document.evidence, "single-candidate evidence");
  assertValue(evidence.candidateId, PARENT_ID, "single-candidate evidence candidate");
  const trials = requireArray(evidence.trials, "single-candidate trials");
  if (trials.length !== context.taskIds.length) throw new Error("single-candidate diagnostic task coverage drift");
  equal(trials.map((trial) => taskTail(trial.taskName)).sort(), [...context.taskIds].sort(), "single-candidate diagnostic tasks");
  for (const trial of trials) {
    const taskId = taskTail(trial.taskName);
    assertNoRetryAuthorizedProjection(trial.retryAuthorized, `${taskId} parent retry authorization`);
    const diagnostic = trial.candidateAttributableDiagnostic ?? null;
    if (diagnostic !== null) {
      assertValue(diagnostic.contractId, DIAGNOSTIC_CONTRACT_ID, `${taskId} parent diagnostic contract`);
      assertValue(diagnostic.classification, "candidate-failure", `${taskId} parent diagnostic classification`);
      assertValue(diagnostic.reason, "absolute-deny-operational-signal", `${taskId} parent diagnostic reason`);
      assertValue(diagnostic.retryAuthorized, false, `${taskId} parent diagnostic retry`);
      assertValue(diagnostic.score, 0, `${taskId} parent diagnostic score`);
      equal(diagnostic.signals, context.protocol.diagnosticDisposition[DIAGNOSTIC_CONTRACT_ID].exactRawSignals, `${taskId} parent diagnostic raw signals`);
      const configured = [trial.reportedReward, ...Object.values(trial.requiredRewards ?? {})];
      if (configured.some((value) => value !== null && value !== 0)) throw new Error(`${taskId} diagnostic conflicts with a configured score`);
    }
  }
  return {
    trials,
    policy: diagnosticPolicy(document.diagnosticPolicy, "single-candidate diagnostic policy"),
    fileSha256: await sha256File(diagnosticPath),
  };
}

async function loadReportOnlyOutputs(analysis) {
  const names = {
    evidence: "generation-evidence.json",
    ranking: "candidate-ranking.json",
    operators: "operator-ranking.json",
    breeding: "breeding-plan.json",
    holdout: "holdout-promotion.json",
    log: "operator-coevolution-log.json",
  };
  const entries = await Promise.all(Object.entries(names).map(async ([key, name]) => [key, await readJson(path.join(analysis.root, name), `report-only ${key}`)]));
  const outputs = Object.fromEntries(entries);
  assertValue(outputs.evidence.diagnosticOnly, true, "report-only evidence diagnostic flag");
  assertValue(outputs.evidence.reportOnly, true, "report-only evidence flag");
  assertValue(outputs.evidence.holdoutOpened, false, "report-only evidence holdout boundary");
  assertValue(outputs.ranking.diagnosticOnly, true, "report-only ranking diagnostic flag");
  assertValue(outputs.ranking.reportOnly, true, "report-only ranking flag");
  equal(outputs.ranking.survivors, [], "report-only candidate survivors");
  assertValue(outputs.ranking.fitnessAwarded, false, "report-only fitness award");
  assertValue(outputs.operators.diagnosticOnly, true, "report-only operator ranking diagnostic flag");
  assertValue(outputs.operators.reportOnly, true, "report-only operator ranking flag");
  equal(outputs.operators.survivors, [], "report-only operator survivors");
  assertValue(outputs.operators.creditAwarded, false, "report-only operator credit");
  assertValue(outputs.breeding.diagnosticOnly, true, "report-only breeding diagnostic flag");
  assertValue(outputs.breeding.reportOnly, true, "report-only breeding flag");
  assertValue(outputs.breeding.chainEligible, false, "report-only breeding chain boundary");
  assertValue(outputs.breeding.operatorCount, 0, "report-only breeding operator count");
  equal(outputs.breeding.operators, [], "report-only breeding operators");
  assertValue(outputs.holdout.opened, false, "report-only holdout opened");
  assertValue(outputs.log.diagnosticOnly, true, "report-only log diagnostic flag");
  assertValue(outputs.log.reportOnly, true, "report-only log flag");
  assertValue(outputs.log.chainEligible, false, "report-only log chain boundary");
  assertValue(outputs.log.holdoutOpened, false, "report-only log holdout boundary");
  assertValue(outputs.log.promotion, false, "report-only log promotion boundary");
  const policy = diagnosticPolicy(outputs.log.evolutionProfile?.harborPolicy?.candidateAttributableDiagnosticPolicy, "report-only diagnostic policy");
  const fileDigests = {};
  for (const [key, name] of Object.entries(names)) fileDigests[`${key}Sha256`] = await sha256File(path.join(analysis.root, name));
  return {
    ...outputs,
    policy,
    fileDigests,
    outputTree: analysis.provenance?.outputTree ?? await treeDigest(analysis.root),
    toolSha256: analysis.provenance?.operatorToolSha256 ?? null,
    configSha256: analysis.provenance?.operatorConfigSha256 ?? null,
  };
}

export function sanitizedRecordsFromOperator({ context, outputs }) {
  const development = requireArray(outputs.evidence.development, "operator development evidence");
  const byCandidate = new Map(development.map((item) => [item.candidateId, item]));
  equal([...byCandidate.keys()].sort(), [PARENT_ID, context.candidateId].sort(), "operator candidate coverage");
  const records = [];
  for (const candidateId of [PARENT_ID, context.candidateId]) {
    const candidate = requireObject(byCandidate.get(candidateId), `operator evidence ${candidateId}`);
    const trials = requireArray(candidate.trials, `${candidateId} operator trials`);
    if (trials.length !== context.taskIds.length) throw new Error(`${candidateId} operator trial coverage drift`);
    for (const trial of trials) {
      const taskId = taskTail(trial.taskName);
      if (!context.taskIds.includes(taskId)) throw new Error(`Unexpected operator task ${taskId}`);
      assertNoRetryAuthorizedProjection(trial.retryAuthorized, `${candidateId}/${taskId} retry authorization`);
      const candidateDiagnostic = trial.candidateAttributableDiagnostic ?? null;
      let disposition;
      if (candidateDiagnostic !== null) {
        assertValue(candidateDiagnostic.contractId, DIAGNOSTIC_CONTRACT_ID, `${candidateId}/${taskId} diagnostic contract`);
        assertValue(candidateDiagnostic.classification, "candidate-failure", `${candidateId}/${taskId} diagnostic classification`);
        assertValue(candidateDiagnostic.reason, "absolute-deny-operational-signal", `${candidateId}/${taskId} diagnostic reason`);
        assertValue(candidateDiagnostic.retryAuthorized, false, `${candidateId}/${taskId} diagnostic retry`);
        assertValue(candidateDiagnostic.score, 0, `${candidateId}/${taskId} diagnostic score`);
        equal(candidateDiagnostic.signals, context.protocol.diagnosticDisposition[DIAGNOSTIC_CONTRACT_ID].exactRawSignals, `${candidateId}/${taskId} diagnostic raw signals`);
        if (!/^sha256:[a-f0-9]{64}$/.test(requireString(candidateDiagnostic.contractDefinitionDigest, `${candidateId}/${taskId} diagnostic definition digest`))) {
          throw new Error(`${candidateId}/${taskId} diagnostic definition digest is malformed`);
        }
        assertValue(trial.candidateAttributableFailure, true, `${candidateId}/${taskId} candidate attribution`);
        assertValue(trial.evaluationAvailable, true, `${candidateId}/${taskId} diagnostic availability`);
        assertValue(trial.qualificationPassed, false, `${candidateId}/${taskId} diagnostic qualification`);
        disposition = { classification: "candidate-attributable-operational-failure", contractId: DIAGNOSTIC_CONTRACT_ID, evaluationAvailable: true, score: 0, retryAuthorized: false };
      } else if (trial.evaluationAvailable === true) {
        requireFinite(trial.score, `${candidateId}/${taskId} score`);
        if (trial.error !== null) throw new Error(`${candidateId}/${taskId} cannot be available with a Harbor exception`);
        disposition = { classification: "evaluated", contractId: null, evaluationAvailable: true, score: trial.score, retryAuthorized: false };
      } else {
        assertValue(trial.score, null, `${candidateId}/${taskId} unavailable score`);
        disposition = { classification: "unavailable-external-or-ambiguous", contractId: null, evaluationAvailable: false, score: null, retryAuthorized: false };
      }
      const gates = Object.fromEntries(Object.keys(context.protocol.frozenEvaluationProfile.requiredRewards).sort().map((key) => [
        key,
        trial.requiredRewards?.[key] === null ? null : requireFinite(trial.requiredRewards?.[key], `${candidateId}/${taskId} ${key}`),
      ]));
      if (candidateDiagnostic !== null) {
        const configured = [trial.reportedReward, ...Object.values(gates)];
        if (configured.some((value) => value !== null && value !== 0)) throw new Error(`${candidateId}/${taskId} diagnostic conflicts with a configured nonzero score`);
      }
      records.push({
        taskId,
        candidateId,
        evaluationAvailable: disposition.evaluationAvailable,
        qualified: Boolean(trial.qualificationPassed),
        status: disposition.classification,
        metrics: { primary: trial.reportedReward === null ? null : requireFinite(trial.reportedReward, `${candidateId}/${taskId} reported reward`) },
        gates,
        disposition,
        taskChecksum: requireString(trial.taskChecksum, `${candidateId}/${taskId} task checksum`),
      });
    }
  }
  const coverage = records.map((item) => `${item.candidateId}/${item.taskId}`).sort();
  const expected = [PARENT_ID, context.candidateId].flatMap((candidateId) => context.taskIds.map((taskId) => `${candidateId}/${taskId}`)).sort();
  equal(coverage, expected, "sanitized operator record coverage");
  return records.sort((left, right) => left.taskId.localeCompare(right.taskId) || left.candidateId.localeCompare(right.candidateId));
}

export function baselineCandidateExecutionGate(trials, expectedTaskCount) {
  const rows = requireArray(trials, "parent gate trials");
  const unsafe = rows.some((trial) => (
    trial.evaluationAvailable !== true
    || (trial.error !== null && trial.error !== undefined && trial.error !== false)
    || trial.errorPresent === true
    || trial.infrastructureFailure === true
    || (
      (trial.candidateAttributableDiagnostic === null || trial.candidateAttributableDiagnostic === undefined)
      && trial.reportedReward === null
    )
  ));
  return {
    authorized: rows.length === expectedTaskCount && !unsafe,
    reason: rows.length !== expectedTaskCount
      ? "parent-task-coverage-drift"
      : unsafe
        ? "parent-evidence-unavailable-ambiguous-conflicting-or-exceptional"
        : "parent-evidence-available",
  };
}

function pairedRecords(records, taskIds, candidateId) {
  const pairs = [];
  for (const taskId of taskIds) {
    const parent = records.find((item) => item.taskId === taskId && item.candidateId === PARENT_ID);
    const child = records.find((item) => item.taskId === taskId && item.candidateId === candidateId);
    if (!parent || !child) throw new Error(`Missing exact parent/child pair for ${taskId}`);
    pairs.push({ taskId, parent, child });
  }
  if (records.length !== taskIds.length * 2) throw new Error("Forward record coverage drift");
  return pairs;
}

export function evaluateForwardGate({ stageId, records, candidateId, requiredRewards }) {
  const taskIds = stageId === FIRST_STAGE_ID ? [FIRST_TASK_ID] : [FIRST_TASK_ID, ...REMAINING_TASK_IDS];
  const pairs = pairedRecords(records, taskIds, candidateId);
  if (pairs.some(({ parent, child }) => !parent.evaluationAvailable || !child.evaluationAvailable)) {
    return { status: "stopped", passed: false, reason: "external-or-ambiguous-evidence-is-unavailable", nextStage: null };
  }
  const childUnqualified = pairs.some(({ child }) => (
    !child.qualified
    || Object.entries(requiredRewards).some(([key, threshold]) => child.gates[key] === null || child.gates[key] < threshold)
  ));
  if (childUnqualified) return { status: "stopped", passed: false, reason: "child-is-not-fully-qualified", nextStage: null };
  if (pairs.some(({ parent, child }) => child.disposition.score < parent.disposition.score)) {
    return { status: "stopped", passed: false, reason: "child-regresses-at-least-one-forward-case", nextStage: null };
  }
  const parentTotal = pairs.reduce((sum, pair) => sum + pair.parent.disposition.score, 0);
  const childTotal = pairs.reduce((sum, pair) => sum + pair.child.disposition.score, 0);
  if (stageId === REMAINING_STAGE_ID && childTotal <= parentTotal) {
    return { status: "stopped", passed: false, reason: "four-case-total-gain-is-not-strictly-positive", nextStage: null, totals: { parent: parentTotal, child: childTotal } };
  }
  return stageId === FIRST_STAGE_ID
    ? { status: "advance", passed: true, reason: "q016-is-available-qualified-and-non-regressing", nextStage: REMAINING_STAGE_ID, totals: { parent: parentTotal, child: childTotal } }
    : { status: "complete", passed: true, reason: "all-four-forward-cases-are-available-qualified-non-regressing-with-positive-total-gain", nextStage: null, totals: { parent: parentTotal, child: childTotal } };
}

function expectedAgent(profile) {
  return { name: profile.agent.name, model_name: profile.agent.model, n_concurrent: profile.agent.nConcurrent, kwargs: { version: profile.agent.version, thinking: profile.agent.thinking } };
}

function assertAgent(actual, expected, skillPath, label) {
  assertValue(actual?.name, expected.name, `${label}.name`);
  assertValue(actual?.model_name, expected.model_name, `${label}.model_name`);
  assertValue(actual?.n_concurrent ?? 1, expected.n_concurrent, `${label}.n_concurrent`);
  equal(actual?.kwargs, expected.kwargs, `${label}.kwargs`);
  equal(actual?.skills, [skillPath], `${label}.skills`);
}

function normalizedModel(agentInfo) {
  return `${requireString(agentInfo?.model_info?.provider, "observed model provider")}/${requireString(agentInfo?.model_info?.name, "observed model name")}`;
}

async function inspectJob(context, candidateId, sanitized) {
  const expectedConfig = buildGeneration005HarborConfig({
    protocol: context.protocol,
    stageId: context.stageId,
    candidateId,
    lockedCandidateId: context.candidateId,
    runtimeRoot: context.runtimeRoot,
    preparedRoot: context.preparedRoot,
    knowledgeRoot: context.knowledgeRoot,
  });
  const directory = jobDirectory(context.runtimeRoot, context.protocol, context.stageId, candidateId, context.candidateId);
  await assertOrdinaryDirectory(directory, `${candidateId} Harbor job`);
  const configPath = path.join(directory, "config.json");
  const lockPath = path.join(directory, "lock.json");
  const resultPath = path.join(directory, "result.json");
  const [config, lock, result] = await Promise.all([
    readJson(configPath, `${candidateId} Harbor config`),
    readJson(lockPath, `${candidateId} Harbor lock`),
    readJson(resultPath, `${candidateId} Harbor result`),
  ]);
  const canonicalProfile = canonicalGeneration003EvaluationProfile(config, expectedConfig);
  assertValue(config.job_name, expectedConfig.job_name, `${candidateId} job name`);
  assertValue(config.n_attempts ?? 1, 1, `${candidateId} attempts`);
  assertValue(config.retry?.max_retries ?? 0, 0, `${candidateId} configured retries`);
  assertValue(lock.harbor?.version, context.protocol.frozenEvaluationProfile.harbor.version, `${candidateId} locked Harbor version`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `${candidateId} locked retries`);
  const lockedTrials = requireArray(lock.trials, `${candidateId} locked trials`);
  if (lockedTrials.length !== context.taskIds.length) throw new Error(`${candidateId} locked trial count drift`);
  equal(lockedTrials.map((item) => item.task?.name).sort(), [...context.taskIds].sort(), `${candidateId} locked task coverage`);
  const expectedSkill = expectedConfig.agents[0].skills[0];
  const agent = expectedAgent(context.protocol.frozenEvaluationProfile);
  const lockedByTask = new Map();
  for (const locked of lockedTrials) {
    assertAgent(locked.agent, agent, expectedSkill, `${candidateId}/${locked.task.name} locked agent`);
    if (locked.skills?.length !== 1) throw new Error(`${candidateId}/${locked.task.name} must lock exactly one skill`);
    assertValue(locked.skills[0].name, context.protocol.target.logicalName, `${candidateId}/${locked.task.name} locked skill name`);
    assertValue(locked.skills[0].source, expectedSkill, `${candidateId}/${locked.task.name} locked skill source`);
    lockedByTask.set(locked.task.name, locked);
  }
  if (!result.finished_at) throw new Error(`${candidateId} Harbor job is incomplete`);
  assertValue(result.n_total_trials, context.taskIds.length, `${candidateId} total trials`);
  assertValue(result.stats?.n_retries ?? 0, 0, `${candidateId} result retries`);
  const trialDirectories = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(path.join(directory, entry.name, "result.json"))) trialDirectories.push(entry.name);
  }
  if (trialDirectories.length !== context.taskIds.length) throw new Error(`${candidateId} trial directory count drift`);
  const publicTrials = {};
  for (const trialDirectory of trialDirectories) {
    const trialPath = path.join(directory, trialDirectory, "result.json");
    const trial = await readJson(trialPath, `${candidateId} trial result`);
    assertValue(trial.trial_name, trialDirectory, `${candidateId} trial name`);
    const taskId = path.basename(requireString(trial.config?.task?.path, `${candidateId} trial task path`));
    if (!context.taskIds.includes(taskId) || publicTrials[taskId]) throw new Error(`${candidateId} trial task coverage drift: ${taskId}`);
    const locked = lockedByTask.get(taskId);
    if (!locked) throw new Error(`${candidateId}/${taskId} has no matching lock cell`);
    assertAgent(trial.config?.agent, agent, expectedSkill, `${candidateId}/${taskId} trial agent`);
    assertValue(trial.agent_info?.name, agent.name, `${candidateId}/${taskId} observed agent`);
    assertValue(trial.agent_info?.version, context.protocol.frozenEvaluationProfile.agent.version, `${candidateId}/${taskId} observed agent version`);
    assertValue(normalizedModel(trial.agent_info), context.protocol.frozenEvaluationProfile.agent.model, `${candidateId}/${taskId} observed model`);
    validateNativeTrialLockProjection({ candidateId: `${candidateId}/${taskId}`, locked, trial });
    const operatorRecord = sanitized.find((item) => item.candidateId === candidateId && item.taskId === taskId);
    if (!operatorRecord) throw new Error(`${candidateId}/${taskId} lacks analyzer disposition`);
    assertValue(trial.task_checksum, operatorRecord.taskChecksum, `${candidateId}/${taskId} analyzer task checksum`);
    const tokens = trial.agent_result === null || trial.agent_result === undefined
      ? { input: null, cache: null, output: null }
      : {
        input: requireFinite(trial.agent_result.n_input_tokens, `${candidateId}/${taskId} input tokens`, { nullable: true, integer: true }),
        cache: requireFinite(trial.agent_result.n_cache_tokens, `${candidateId}/${taskId} cache tokens`, { nullable: true, integer: true }),
        output: requireFinite(trial.agent_result.n_output_tokens, `${candidateId}/${taskId} output tokens`, { nullable: true, integer: true }),
      };
    publicTrials[taskId] = {
      tokens,
      provenance: {
        taskChecksum: trial.task_checksum,
        taskLockDigest: requireString(locked.task.digest, `${candidateId}/${taskId} lock task digest`),
        lockedSkillDigest: requireString(locked.skills[0].digest, `${candidateId}/${taskId} locked skill digest`),
        trialResultSha256: await sha256File(trialPath),
      },
    };
  }
  return {
    profileSha256: objectDigest(canonicalProfile),
    canonicalLockSha256: objectDigest(canonicalGeneration003Lock(lock)),
    jobTree: await treeDigest(directory),
    jobConfigSha256: await sha256File(configPath),
    jobLockSha256: await sha256File(lockPath),
    jobResultSha256: await sha256File(resultPath),
    publicTrials,
  };
}

function candidateReceipt(context, candidateId) {
  const item = context.receipt.candidates.find((candidate) => candidate.candidateId === candidateId);
  if (!item) throw new Error(`Prepared receipt lacks candidate ${candidateId}`);
  return item;
}

function taskReceipt(context, taskId) {
  const item = context.receipt.tasks.find((task) => task.taskId === taskId);
  if (!item) throw new Error(`Prepared receipt lacks task ${taskId}`);
  return item;
}

async function currentPublicRecords(context, outputs, records) {
  const jobs = {};
  for (const candidateId of [PARENT_ID, context.candidateId]) jobs[candidateId] = await inspectJob(context, candidateId, records);
  assertValue(jobs[PARENT_ID].profileSha256, jobs[context.candidateId].profileSha256, "parent/child canonical profile digest");
  assertValue(jobs[PARENT_ID].canonicalLockSha256, jobs[context.candidateId].canonicalLockSha256, "parent/child canonical lock digest");
  const publicRecords = records.map((record) => {
    const job = jobs[record.candidateId];
    const trial = job.publicTrials[record.taskId];
    return {
      taskId: record.taskId,
      candidateId: record.candidateId,
      evaluationAvailable: record.evaluationAvailable,
      qualified: record.qualified,
      status: record.status,
      metrics: record.metrics,
      gates: record.gates,
      disposition: record.disposition,
      tokens: trial.tokens,
      provenance: {
        candidateTreeSha256: candidateReceipt(context, record.candidateId).sha256,
        taskTreeSha256: taskReceipt(context, record.taskId).sha256,
        frozenProfileSha256: context.receipt.profileSha256,
        canonicalHarborProfileSha256: job.profileSha256,
        canonicalHarborLockSha256: job.canonicalLockSha256,
        preparedReceiptSha256: context.receiptSha256,
        jobTreeSha256: job.jobTree.sha256,
        jobConfigSha256: job.jobConfigSha256,
        jobLockSha256: job.jobLockSha256,
        jobResultSha256: job.jobResultSha256,
        ...trial.provenance,
      },
    };
  });
  const jobBindings = Object.fromEntries([PARENT_ID, context.candidateId].map((candidateId) => [candidateId, {
    treeSha256: jobs[candidateId].jobTree.sha256,
    configSha256: jobs[candidateId].jobConfigSha256,
    lockSha256: jobs[candidateId].jobLockSha256,
    resultSha256: jobs[candidateId].jobResultSha256,
  }]));
  return { publicRecords, jobs, jobBindings };
}

async function verifiedPriorQ016(options, context) {
  if (context.stageId === FIRST_STAGE_ID) return null;
  const verified = await verifyPublishedStage(options, FIRST_STAGE_ID);
  assertValue(verified.publication.candidate?.candidateId, context.candidateId, "q016 publication candidate ID");
  assertValue(verified.publication.candidateLock?.candidateLockSha256, context.candidateLock.candidateLockSha256, "q016 publication candidate lock");
  assertValue(verified.publication.gate?.passed, true, "q016 publication pass");
  return {
    publication: verified.publication,
    binding: {
      relativePath: path.relative(context.runtimeRoot, verified.resultPath).split(path.sep).join("/"),
      fileSha256: await sha256File(verified.resultPath),
      publicationSha256: verified.publication.publicationSha256,
    },
  };
}

async function buildPublication(context, outputs, currentRecords, options) {
  const current = await currentPublicRecords(context, outputs, currentRecords);
  const prior = await verifiedPriorQ016(options, context);
  const records = prior ? [...prior.publication.records, ...current.publicRecords] : current.publicRecords;
  const expectedTaskIds = context.stageId === FIRST_STAGE_ID ? [FIRST_TASK_ID] : [FIRST_TASK_ID, ...REMAINING_TASK_IDS];
  const gate = evaluateForwardGate({
    stageId: context.stageId,
    records,
    candidateId: context.candidateId,
    requiredRewards: context.protocol.frozenEvaluationProfile.requiredRewards,
  });
  const tokenTotals = { input: 0, cache: 0, output: 0 };
  for (const record of records) for (const key of Object.keys(tokenTotals)) if (record.tokens[key] !== null) tokenTotals[key] += record.tokens[key];
  const body = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: "generation-005",
    stageId: context.stageId,
    evidenceLayer: context.protocol.evidenceLayer,
    protocolSha256: context.receipt.protocolSha256,
    candidate: { candidateId: context.candidateId, parentCandidateId: PARENT_ID },
    candidateLock: {
      fileSha256: context.candidateLockFileSha256,
      candidateLockSha256: context.candidateLock.candidateLockSha256,
      candidateTreeSha256: context.candidateLock.candidate.tree.sha256,
      parentTreeSha256: context.candidateLock.parent.tree.sha256,
      feedbackReceiptSha256: context.candidateLock.provenance.feedbackReceipt.fileSha256,
      mutationProcedureSha256: context.candidateLock.provenance.mutationProcedure.fileSha256,
      feedbackTaskIds: ["q018"],
    },
    profile: {
      harborVersion: context.protocol.frozenEvaluationProfile.harbor.version,
      agent: context.protocol.frozenEvaluationProfile.agent,
      attemptsPerCandidateTask: 1,
      retries: 0,
      frozenProfileSha256: context.receipt.profileSha256,
    },
    diagnosticPolicy: outputs.policy,
    reportOnlyCapability: {
      diagnosticOnly: true,
      fitnessAwarded: false,
      operatorCreditAwarded: false,
      breedingProduced: false,
      holdoutOpened: false,
      promotionProduced: false,
    },
    currentStageTaskIds: context.taskIds,
    cumulativeTaskIds: expectedTaskIds,
    records,
    gate,
    tokenTotals,
    callAccounting: {
      additionalHarborInvocationsInStage: 2,
      modelExecutionsInStage: context.taskIds.length * 2,
      automaticRetries: 0,
      selectiveExternalResumeAttempts: 0,
      cumulativeHarborInvocations: context.stageId === FIRST_STAGE_ID ? 2 : 4,
      cumulativeModelExecutions: context.stageId === FIRST_STAGE_ID ? 2 : 8,
      maximumHarborInvocations: 4,
      maximumModelExecutions: 8,
    },
    preparedReceipt: { fileSha256: context.receiptSha256, immutablePayloadSha256: context.receipt.immutablePayload.sha256 },
    currentStageJobs: current.jobBindings,
    priorQ016Publication: prior?.binding ?? null,
    analyzerProvenance: {
      operatorToolSha256: outputs.toolSha256,
      operatorConfigSha256: outputs.configSha256,
      privateOutputTreeSha256: outputs.outputTree.sha256,
      generationEvidenceSha256: outputs.fileDigests.evidenceSha256,
      candidateRankingSha256: outputs.fileDigests.rankingSha256,
      operatorRankingSha256: outputs.fileDigests.operatorsSha256,
      breedingPlanSha256: outputs.fileDigests.breedingSha256,
      holdoutProjectionSha256: outputs.fileDigests.holdoutSha256,
      operatorLogSha256: outputs.fileDigests.logSha256,
    },
  };
  return { ...body, publicationSha256: objectDigest(body) };
}

function assertSanitizedPublication(publication) {
  const forbiddenKeys = new Set(["answer", "qrel", "trajectory", "reasoning", "auth", "credential", "diagnostics", "rollout_details", "metadata", "exception_message"]);
  function visit(value, location = "publication") {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${location}[${index}]`));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) throw new Error(`Forbidden publication field: ${location}.${key}`);
      visit(child, `${location}.${key}`);
    }
  }
  visit(publication);
}

export function assertPublicationMatchesRecomputed(publication, recomputed, stageId = "generation-005") {
  assertSanitizedPublication(publication);
  equal(publication, recomputed, `${stageId} publication does not match recomputed Harbor evidence`);
  return publication;
}

function renderMarkdown(publication) {
  const lines = [
    `# Generation 005 ${publication.stageId} result`,
    "",
    `Gate: **${publication.gate.status}** (${publication.gate.reason})`,
    "",
    "| Task | Candidate | Available | Qualified | Reward | Disposition | Required gates | Tokens (input/cache/output) |",
    "| --- | --- | :---: | :---: | ---: | --- | --- | ---: |",
  ];
  for (const record of publication.records) {
    const gates = Object.entries(record.gates).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ");
    lines.push(`| ${record.taskId} | ${record.candidateId} | ${record.evaluationAvailable ? "yes" : "no"} | ${record.qualified ? "yes" : "no"} | ${record.metrics.primary ?? "null"} | ${record.status} | ${gates} | ${record.tokens.input ?? "null"}/${record.tokens.cache ?? "null"}/${record.tokens.output ?? "null"} |`);
  }
  lines.push("", `Publication SHA-256: \`${publication.publicationSha256}\``, "");
  return lines.join("\n");
}

async function writePublication(context, publication) {
  assertSanitizedPublication(publication);
  const destination = path.join(context.runtimeRoot, "publications", context.stageId);
  if (await exists(destination)) throw new Error(`Publication already exists and cannot be overwritten: ${destination}`);
  const staging = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await fs.mkdir(staging, { recursive: true });
  try {
    await fs.writeFile(path.join(staging, "result.json"), canonicalJson(publication), { encoding: "utf8", flag: "wx" });
    await fs.writeFile(path.join(staging, "report.md"), renderMarkdown(publication), { encoding: "utf8", flag: "wx" });
    await fs.rename(staging, destination);
  } catch (error) {
    if (await exists(staging)) await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { destination, resultPath: path.join(destination, "result.json"), publication };
}

export async function classifyParent(options = {}, stageId = FIRST_STAGE_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const analysis = await runAnalysis(context, true, options);
  const diagnostic = await loadSingleCandidateDiagnostic(analysis, context);
  const gate = baselineCandidateExecutionGate(diagnostic.trials, context.taskIds.length);
  if (!gate.authorized) throw new Error("Parent evidence is external, ambiguous, conflicting, or otherwise unavailable; child execution is not authorized");
  return {
    schemaVersion: 1,
    stageId,
    childExecutionAuthorized: true,
    candidateId: context.candidateId,
    taskCount: diagnostic.trials.length,
    diagnosticPolicy: diagnostic.policy,
    analyzerEvidenceSha256: diagnostic.fileSha256,
    candidateLockSha256: context.candidateLock.candidateLockSha256,
  };
}

export async function publishStage(options = {}, stageId = FIRST_STAGE_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const analysis = await runAnalysis(context, false, options);
  const outputs = await loadReportOnlyOutputs(analysis);
  const records = sanitizedRecordsFromOperator({ context, outputs });
  const publication = await buildPublication(context, outputs, records, options);
  return writePublication(context, publication);
}

export async function verifyPublishedStage(options = {}, stageId = FIRST_STAGE_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const resultPath = path.join(context.runtimeRoot, "publications", stageId, "result.json");
  await assertOrdinaryFile(resultPath, `${stageId} publication`);
  const publication = await readJson(resultPath, `${stageId} publication`);
  const analysis = await runAnalysis(context, false, options);
  const outputs = await loadReportOnlyOutputs(analysis);
  const records = sanitizedRecordsFromOperator({ context, outputs });
  const recomputed = await buildPublication(context, outputs, records, options);
  assertPublicationMatchesRecomputed(publication, recomputed, stageId);
  return { resultPath, publication };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const flags = { "--repo-root": "repoRoot", "--runtime": "runtimeRoot", "--protocol": "protocolPath", "--knowledge-root": "knowledgeRoot" };
  for (let index = 1; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Unknown option: ${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argv[index]}`);
    options[key] = argv[++index];
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} classify-q016-parent [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} publish-q016 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-q016 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} classify-remaining-parent [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} publish-remaining [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-remaining [options]\n\nClassification is model-free and opens exactly one existing parent job. Publication is exclusive, sanitized, and recomputed from immutable Harbor 0.18 jobs and report-only analyzer evidence.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const handlers = {
    "classify-q016-parent": () => classifyParent(options, FIRST_STAGE_ID),
    "publish-q016": () => publishStage(options, FIRST_STAGE_ID),
    "verify-q016": () => verifyPublishedStage(options, FIRST_STAGE_ID),
    "classify-remaining-parent": () => classifyParent(options, REMAINING_STAGE_ID),
    "publish-remaining": () => publishStage(options, REMAINING_STAGE_ID),
    "verify-remaining": () => verifyPublishedStage(options, REMAINING_STAGE_ID),
  };
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command ${command}\n${usage()}`);
  const result = await handler();
  process.stdout.write(canonicalJson(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
