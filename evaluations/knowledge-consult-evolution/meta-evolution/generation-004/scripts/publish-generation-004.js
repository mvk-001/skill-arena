#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, objectDigest, treeDigest } from "../../scripts/prepare-meta-evolution.js";
import {
  canonicalGeneration003EvaluationProfile,
  canonicalGeneration003Lock,
} from "../../generation-003/scripts/publish-generation-003.js";
import {
  BASELINE_ID,
  CANDIDATE_ID,
  DIAGNOSTIC_CONTRACT_ID,
  FIRST_TASK_ID,
  HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS,
  HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS,
  HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID,
  OPERATOR_ANALYZER_RELATIVE_PATH,
  REPORT_ONLY_ANALYZER_RELATIVE_PATH,
  Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH,
  REPORT_ONLY_PUBLICATION_MIGRATION_RELATIVE_PATH,
  REMAINING_TASK_IDS,
  SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH,
  buildGeneration004HarborConfig,
  jobDirectory,
  sha256File,
  validateGeneration004Protocol,
  verifyQ007BaselineDiagnosticMigration,
  verifyQ007PublicationProjectionMigration,
  verifyReportOnlyPublicationMigration,
} from "./prepare-generation-004.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(GENERATION_ROOT, "..", "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-004");

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

export function validateNativeTrialLockProjection({ candidateId, locked, trial }) {
  const trialConfig = requireObject(trial.config, `${candidateId} trial config`);
  const trialEnvironment = requireObject(trialConfig.environment, `${candidateId} trial environment`);
  const lockEnvironment = requireObject(locked.environment, `${candidateId} lock environment`);
  assertExactKeys(
    trialEnvironment,
    [...Object.keys(lockEnvironment), ...HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS],
    `${candidateId} native trial environment`,
  );
  for (const field of HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS) {
    assertValue(trialEnvironment[field], null, `${candidateId} native trial environment.${field}`);
  }
  equal(
    withoutKeys(trialEnvironment, HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS),
    lockEnvironment,
    `${candidateId} native trial/lock environment projection`,
  );

  const trialVerifier = requireObject(trialConfig.verifier, `${candidateId} native trial verifier`);
  const lockVerifier = requireObject(locked.verifier, `${candidateId} lock verifier`);
  assertExactKeys(
    trialVerifier,
    [...Object.keys(lockVerifier), ...HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS],
    `${candidateId} native trial verifier`,
  );
  for (const field of HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS) {
    assertValue(trialVerifier[field], null, `${candidateId} native trial verifier.${field}`);
  }
  equal(
    withoutKeys(trialVerifier, HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS),
    lockVerifier,
    `${candidateId} native trial/lock verifier projection`,
  );
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

function toWslPath(value) {
  const resolved = path.resolve(value);
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(resolved);
  if (!match) throw new Error(`Cannot translate host path to WSL: ${resolved}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
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

function stageTaskIds(stageId) {
  if (stageId === FIRST_TASK_ID) return [FIRST_TASK_ID];
  if (stageId === "remaining-forward-validation") return REMAINING_TASK_IDS;
  throw new Error(`Unknown generation-004 stage: ${stageId}`);
}

function preparedRoot(runtimeRoot, stageId) {
  return path.join(runtimeRoot, "prepared", stageId);
}

function analysisId(stageId, baselineOnly) {
  return `${stageId}-${baselineOnly ? "baseline-diagnostic-v2" : "stage"}`;
}

function operatorConfigPath(runtimeRoot, stageId, baselineOnly) {
  return path.join(preparedRoot(runtimeRoot, stageId), "configs", "operator", "stage.yaml");
}

function analysisToolPath(context, baselineOnly) {
  const relative = baselineOnly ? SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH : REPORT_ONLY_ANALYZER_RELATIVE_PATH;
  return path.join(context.repoRoot, ...relative.split("/"));
}

async function stageContext(options, stageId) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertInside(path.join(repoRoot, ".tmp"), path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME), "generation-004 runtime");
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const protocol = validateGeneration004Protocol(await readJson(protocolPath, "generation-004 protocol"));
  const root = preparedRoot(runtimeRoot, stageId);
  await assertOrdinaryDirectory(root, `${stageId} prepared stage`);
  const receiptPath = path.join(root, "receipt.json");
  const receipt = await readJson(receiptPath, `${stageId} receipt`);
  assertValue(receipt.stageId, stageId, `${stageId} receipt stage`);
  assertValue(receipt.protocolSha256, await sha256File(protocolPath), `${stageId} protocol binding`);
  assertValue(receipt.profileSha256, objectDigest(protocol.frozenEvaluationProfile), `${stageId} profile binding`);
  assertValue(receipt.knowledgeCommit, protocol.knowledge.commit, `${stageId} knowledge commit binding`);
  equal(receipt.candidateSelection, {
    fileSha256: protocol.candidateSelectionProvenance.publicationFileSha256,
    recordSha256: protocol.candidateSelectionProvenance.publicationRecordSha256,
  }, `${stageId} candidate-selection binding`);
  equal(receipt.diagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] }, `${stageId} diagnostic policy`);
  equal(receipt.operatorAnalyzer, {
    relativePath: OPERATOR_ANALYZER_RELATIVE_PATH,
    fileSha256: await sha256File(path.join(repoRoot, ...OPERATOR_ANALYZER_RELATIVE_PATH.split("/"))),
  }, `${stageId} frozen operator analyzer`);
  if (stageId !== FIRST_TASK_ID) {
    equal(receipt.singleCandidateDiagnostic, {
      relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH,
      fileSha256: await sha256File(path.join(repoRoot, ...SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH.split("/"))),
    }, `${stageId} frozen single-candidate diagnostic helper`);
  }
  equal(await treeDigest(root, { omitRootFiles: ["receipt.json"] }), receipt.immutablePayload, `${stageId} immutable prepared payload`);
  const expectedTasks = stageTaskIds(stageId);
  equal(receipt.tasks.map((item) => item.taskId), expectedTasks, `${stageId} receipt tasks`);
  for (const [candidateId, expected] of [
    [BASELINE_ID, protocol.target.baseline],
    [CANDIDATE_ID, protocol.target.candidate],
  ]) {
    const actual = receipt.candidates.find((item) => item.candidateId === candidateId);
    if (!actual) throw new Error(`${stageId} receipt lacks ${candidateId}`);
    equal({ sha256: actual.sha256, fileCount: actual.fileCount, totalBytes: actual.totalBytes }, {
      sha256: expected.expectedTreeSha256,
      fileCount: expected.fileCount,
      totalBytes: expected.totalBytes,
    }, `${stageId} ${candidateId} source binding`);
    equal(await treeDigest(path.join(root, "inputs", candidateId, protocol.target.logicalName)), {
      sha256: expected.expectedTreeSha256,
      fileCount: expected.fileCount,
      totalBytes: expected.totalBytes,
    }, `${stageId} ${candidateId} prepared tree`);
  }
  for (const taskId of expectedTasks) {
    const actual = receipt.tasks.find((item) => item.taskId === taskId);
    const expected = protocol.tasks[taskId];
    equal({ sha256: actual.sha256, fileCount: actual.fileCount, totalBytes: actual.totalBytes }, {
      sha256: expected.expectedTreeSha256,
      fileCount: expected.fileCount,
      totalBytes: expected.totalBytes,
    }, `${stageId} ${taskId} source binding`);
    equal(await treeDigest(path.join(root, "tasks", taskId)), {
      sha256: expected.expectedTreeSha256,
      fileCount: expected.fileCount,
      totalBytes: expected.totalBytes,
    }, `${stageId} ${taskId} prepared tree`);
  }
  return {
    repoRoot,
    runtimeRoot,
    protocolPath,
    protocol,
    knowledgeRoot: path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT),
    preparedRoot: root,
    receipt,
    receiptPath,
    receiptSha256: await sha256File(receiptPath),
    taskIds: expectedTasks,
  };
}

async function jobTreeBindings(context, baselineOnly) {
  const candidates = baselineOnly ? [BASELINE_ID] : [BASELINE_ID, CANDIDATE_ID];
  const bindings = [];
  for (const candidateId of candidates) {
    const directory = jobDirectory(context.runtimeRoot, context.protocol, context.stageId, candidateId);
    await assertOrdinaryDirectory(directory, `${context.stageId} ${candidateId} job`);
    bindings.push({ candidateId, tree: await treeDigest(directory) });
  }
  return bindings;
}

async function verifyAnalysisProvenance(context, root, baselineOnly) {
  const provenancePath = path.join(root, "generation-004-analysis-provenance.json");
  const provenance = await readJson(provenancePath, "operator analysis provenance");
  const configPath = operatorConfigPath(context.runtimeRoot, context.stageId, baselineOnly);
  const toolPath = analysisToolPath(context, baselineOnly);
  assertValue(provenance.stageId, context.stageId, "analysis stage");
  assertValue(provenance.baselineOnly, baselineOnly, "analysis scope");
  assertValue(provenance.operatorConfigSha256, await sha256File(configPath), "analysis config digest");
  assertValue(provenance.operatorToolSha256, await sha256File(toolPath), "operator tool digest");
  equal(provenance.jobTrees, await jobTreeBindings(context, baselineOnly), "analysis job-tree bindings");
  equal(provenance.outputTree, await treeDigest(root, { omitRootFiles: ["generation-004-analysis-provenance.json"] }), "operator analysis output tree");
  return { root, provenancePath, provenance, provenanceFileSha256: await sha256File(provenancePath) };
}

async function runOperatorAnalysis(context, baselineOnly, options = {}) {
  if (options.operatorOutputRoot) {
    const root = path.resolve(options.operatorOutputRoot);
    await assertOrdinaryDirectory(root, "supplied operator output");
    return { root, provenance: null, provenancePath: null, provenanceFileSha256: null, suppliedForTest: true };
  }
  if (baselineOnly && context.stageId === FIRST_TASK_ID) {
    await verifyQ007BaselineDiagnosticMigration({
      repoRoot: context.repoRoot,
      runtimeRoot: context.runtimeRoot,
      protocolPath: context.protocolPath,
    });
  }
  const id = analysisId(context.stageId, baselineOnly);
  const destination = path.join(context.runtimeRoot, "private", "operator-analysis", id);
  if (await exists(destination)) return verifyAnalysisProvenance(context, destination, baselineOnly);
  const configPath = operatorConfigPath(context.runtimeRoot, context.stageId, baselineOnly);
  await assertOrdinaryFile(configPath, "operator analysis config");
  const toolPath = analysisToolPath(context, baselineOnly);
  await assertOrdinaryFile(toolPath, "operator analyzer");
  const staging = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (baselineOnly) await fs.mkdir(staging, { recursive: false });
  const args = baselineOnly
    ? [
      "run",
      toolPath,
      configPath,
      "--candidate-id",
      BASELINE_ID,
      "--output-file",
      path.join(staging, "candidate-diagnostic.json"),
    ]
    : [
      "run",
      toolPath,
      configPath,
      "--output-dir",
      staging,
    ];
  const executable = process.platform === "win32" ? "wsl.exe" : "uv";
  const processArgs = process.platform === "win32"
    ? [
      "-e",
      "bash",
      "-lc",
      baselineOnly
        ? "exec uv run \"$1\" \"$2\" --candidate-id \"$3\" --output-file \"$4\""
        : "exec uv run \"$1\" \"$2\" --output-dir \"$3\"",
      "bash",
      toWslPath(toolPath),
      toWslPath(configPath),
      ...(baselineOnly
        ? [BASELINE_ID, toWslPath(path.join(staging, "candidate-diagnostic.json"))]
        : [toWslPath(staging)]),
    ]
    : args;
  const completed = spawnSync(executable, processArgs, {
    cwd: context.repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (completed.status !== 0) {
    if (await exists(staging)) await fs.rm(staging, { recursive: true, force: true });
    throw new Error("The private Harbor operator analysis failed closed; no candidate call or publication is authorized");
  }
  await assertOrdinaryDirectory(staging, "operator analysis staging output");
  const requiredOutputs = baselineOnly
    ? ["candidate-diagnostic.json"]
    : ["generation-evidence.json", "candidate-ranking.json", "operator-coevolution-log.json"];
  for (const file of requiredOutputs) {
    await assertOrdinaryFile(path.join(staging, file), `operator output ${file}`);
  }
  const provenance = {
    schemaVersion: 1,
    kind: "generation-004-private-operator-analysis-binding",
    stageId: context.stageId,
    baselineOnly,
    operatorConfigSha256: await sha256File(configPath),
    operatorToolSha256: await sha256File(toolPath),
    jobTrees: await jobTreeBindings(context, baselineOnly),
    outputTree: await treeDigest(staging),
  };
  await fs.writeFile(path.join(staging, "generation-004-analysis-provenance.json"), canonicalJson(provenance), { encoding: "utf8", flag: "wx" });
  await fs.rename(staging, destination);
  return verifyAnalysisProvenance(context, destination, baselineOnly);
}

function contractPolicyFromLog(log) {
  const policy = log.evolutionProfile?.harborPolicy?.candidateAttributableDiagnosticPolicy;
  requireObject(policy, "operator diagnostic policy");
  equal(policy.contracts, [DIAGNOSTIC_CONTRACT_ID], "operator diagnostic contracts");
  const digest = requireString(policy.contractDefinitionsDigest, "operator diagnostic contract-definition digest");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("operator diagnostic contract-definition digest is malformed");
  return { contracts: [DIAGNOSTIC_CONTRACT_ID], contractDefinitionsDigest: digest };
}

function contractPolicyFromDiagnostic(document) {
  const policy = requireObject(document.diagnosticPolicy, "single-candidate diagnostic policy");
  equal(policy.contracts, [DIAGNOSTIC_CONTRACT_ID], "single-candidate diagnostic contracts");
  const digest = requireString(policy.contractDefinitionsDigest, "single-candidate diagnostic contract-definition digest");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("single-candidate diagnostic contract-definition digest is malformed");
  return { contracts: [DIAGNOSTIC_CONTRACT_ID], contractDefinitionsDigest: digest };
}

async function loadSingleCandidateDiagnostic(analysis, context) {
  const diagnosticPath = path.join(analysis.root, "candidate-diagnostic.json");
  const document = await readJson(diagnosticPath, "single-candidate diagnostic");
  assertValue(document.mode, "single-candidate-diagnostic-only", "single-candidate diagnostic mode");
  assertValue(document.source, "harbor-operator-coevolution", "single-candidate diagnostic source");
  assertValue(document.candidateId, BASELINE_ID, "single-candidate diagnostic candidate");
  equal(document.capabilityBoundaries, {
    harborExecution: false,
    otherCandidateJobsOpened: false,
    holdoutOpened: false,
    rankingProduced: false,
    breedingProduced: false,
  }, "single-candidate diagnostic boundaries");
  const evidence = requireObject(document.evidence, "single-candidate evidence");
  assertValue(evidence.candidateId, BASELINE_ID, "single-candidate evidence candidate");
  const trials = requireArray(evidence.trials, "single-candidate trials");
  if (trials.length !== context.taskIds.length) throw new Error("single-candidate diagnostic task coverage drift");
  equal(trials.map((trial) => taskTail(trial.taskName)).sort(), [...context.taskIds].sort(), "single-candidate diagnostic tasks");
  for (const trial of trials) {
    const taskId = taskTail(trial.taskName);
    const diagnostic = trial.candidateAttributableDiagnostic ?? null;
    assertValue(trial.retryAuthorized, false, `${taskId} baseline retry authorization`);
    if (diagnostic !== null) {
      assertValue(diagnostic.contractId, DIAGNOSTIC_CONTRACT_ID, `${taskId} baseline diagnostic contract`);
      assertValue(diagnostic.classification, "candidate-failure", `${taskId} baseline diagnostic classification`);
      assertValue(diagnostic.reason, "absolute-deny-operational-signal", `${taskId} baseline diagnostic reason`);
      assertValue(diagnostic.retryAuthorized, false, `${taskId} baseline diagnostic retry`);
      assertValue(diagnostic.score, 0, `${taskId} baseline diagnostic score`);
      equal(diagnostic.signals, context.protocol.diagnosticDisposition[DIAGNOSTIC_CONTRACT_ID].exactRawSignals, `${taskId} baseline diagnostic raw signals`);
      if (!/^sha256:[a-f0-9]{64}$/.test(requireString(diagnostic.contractDefinitionDigest, `${taskId} baseline diagnostic definition digest`))) {
        throw new Error(`${taskId} baseline diagnostic definition digest is malformed`);
      }
      const configured = [trial.reportedReward, ...Object.values(trial.requiredRewards ?? {})];
      if (configured.some((value) => value !== null && value !== 0)) throw new Error(`${taskId} baseline diagnostic conflicts with a configured score`);
    }
  }
  return {
    document,
    evidence,
    trials,
    policy: contractPolicyFromDiagnostic(document),
    fileSha256: await sha256File(diagnosticPath),
    outputTree: analysis.provenance?.outputTree ?? await treeDigest(analysis.root),
    toolSha256: analysis.provenance?.operatorToolSha256 ?? null,
    configSha256: analysis.provenance?.operatorConfigSha256 ?? null,
  };
}

async function loadOperatorOutputs(analysis) {
  const [evidence, ranking, log] = await Promise.all([
    readJson(path.join(analysis.root, "generation-evidence.json"), "operator generation evidence"),
    readJson(path.join(analysis.root, "candidate-ranking.json"), "operator candidate ranking"),
    readJson(path.join(analysis.root, "operator-coevolution-log.json"), "operator log"),
  ]);
  return {
    evidence,
    ranking,
    log,
    policy: contractPolicyFromLog(log),
    fileDigests: {
      evidenceSha256: await sha256File(path.join(analysis.root, "generation-evidence.json")),
      rankingSha256: await sha256File(path.join(analysis.root, "candidate-ranking.json")),
      logSha256: await sha256File(path.join(analysis.root, "operator-coevolution-log.json")),
    },
    outputTree: analysis.provenance?.outputTree ?? await treeDigest(analysis.root),
    toolSha256: analysis.provenance?.operatorToolSha256 ?? null,
    configSha256: analysis.provenance?.operatorConfigSha256 ?? null,
  };
}

function taskTail(value) {
  const tail = requireString(value, "operator task name").replaceAll("\\", "/").split("/").at(-1);
  return tail.includes("__") ? tail.split("__").at(-1) : tail;
}

export function sanitizedRecordsFromOperator({ context, outputs }) {
  const development = requireArray(outputs.evidence.development, "operator development evidence");
  const byCandidate = new Map(development.map((item) => [item.candidateId, item]));
  equal([...byCandidate.keys()].sort(), [BASELINE_ID, CANDIDATE_ID].sort(), "operator candidate coverage");
  const records = [];
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    const candidate = requireObject(byCandidate.get(candidateId), `operator evidence ${candidateId}`);
    const trials = requireArray(candidate.trials, `${candidateId} operator trials`);
    if (trials.length !== context.taskIds.length) throw new Error(`${candidateId} operator trial coverage drift`);
    for (const trial of trials) {
      const taskId = taskTail(trial.taskName);
      if (!context.taskIds.includes(taskId)) throw new Error(`Unexpected operator task ${taskId}`);
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
      } else if (trial.evaluationAvailable) {
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
        const configuredScores = [trial.reportedReward, ...Object.values(gates)];
        if (configuredScores.some((value) => value !== null && value !== 0)) {
          throw new Error(`${candidateId}/${taskId} candidate-attributable diagnostic conflicts with a configured nonzero score`);
        }
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
  const expected = [BASELINE_ID, CANDIDATE_ID].flatMap((candidateId) => context.taskIds.map((taskId) => `${candidateId}/${taskId}`)).sort();
  equal(coverage, expected, "sanitized operator record coverage");
  return records.sort((left, right) => left.taskId.localeCompare(right.taskId) || left.candidateId.localeCompare(right.candidateId));
}

function rankingRows(outputs) {
  const rows = requireArray(outputs.ranking.ranking, "operator candidate ranking");
  const baseline = rows.find((item) => item.candidateId === BASELINE_ID);
  const candidate = rows.find((item) => item.candidateId === CANDIDATE_ID);
  if (!baseline || !candidate) throw new Error("operator ranking lacks the exact baseline/candidate pair");
  return { baseline, candidate };
}

export function evaluateForwardGate({ stageId, records, ranking }) {
  stageTaskIds(stageId);
  if (records.some((record) => !record.evaluationAvailable)) {
    return { status: "stopped", passed: false, reason: "external-or-ambiguous-evidence-is-unavailable", nextStage: null };
  }
  if (!ranking.candidate.qualified || records.some((record) => record.candidateId === CANDIDATE_ID && !record.qualified)) {
    return { status: "stopped", passed: false, reason: "candidate-is-not-fully-qualified", nextStage: null };
  }
  const regressions = requireArray(ranking.candidate.caseRegressions, "candidate case regressions");
  if (regressions.length !== 0) {
    return { status: "stopped", passed: false, reason: "candidate-regresses-at-least-one-forward-case", nextStage: null };
  }
  const baselineFitness = requireFinite(ranking.baseline.effectiveFitness, "baseline effective fitness");
  const candidateFitness = requireFinite(ranking.candidate.effectiveFitness, "candidate effective fitness");
  if (candidateFitness < baselineFitness) {
    return { status: "stopped", passed: false, reason: "candidate-effective-fitness-regresses", nextStage: null };
  }
  if (stageId === "remaining-forward-validation" && candidateFitness <= baselineFitness) {
    return { status: "stopped", passed: false, reason: "remaining-forward-aggregate-gain-is-not-strictly-positive", nextStage: null };
  }
  return stageId === FIRST_TASK_ID
    ? { status: "advance", passed: true, reason: "q007-forward-case-is-available-qualified-and-non-regressing", nextStage: "remaining-forward-validation" }
    : { status: "complete", passed: true, reason: "all-forward-cases-are-available-qualified-non-regressing-with-positive-aggregate-gain", nextStage: null };
}

export function baselineCandidateExecutionGate(trials, expectedTaskCount) {
  const rows = requireArray(trials, "baseline gate trials");
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
      ? "baseline-task-coverage-drift"
      : unsafe
        ? "baseline-evidence-unavailable-ambiguous-conflicting-or-exceptional"
        : "baseline-evidence-available",
  };
}

function expectedAgent(profile) {
  return { name: profile.agent.name, model_name: profile.agent.model, n_concurrent: 1, kwargs: { version: profile.agent.version, thinking: profile.agent.thinking } };
}

function assertAgent(actual, expected, skillPath, label) {
  assertValue(actual?.name, expected.name, `${label}.name`);
  assertValue(actual?.model_name, expected.model_name, `${label}.model_name`);
  assertValue(actual?.n_concurrent ?? 1, 1, `${label}.n_concurrent`);
  equal(actual?.kwargs, expected.kwargs, `${label}.kwargs`);
  equal(actual?.skills, [skillPath], `${label}.skills`);
}

function normalizedModel(agentInfo) {
  return `${requireString(agentInfo?.model_info?.provider, "observed model provider")}/${requireString(agentInfo?.model_info?.name, "observed model name")}`;
}

async function inspectJob(context, candidateId, sanitized) {
  const expectedConfig = buildGeneration004HarborConfig({
    protocol: context.protocol,
    stageId: context.stageId,
    candidateId,
    runtimeRoot: context.runtimeRoot,
    preparedRoot: context.preparedRoot,
    knowledgeRoot: context.knowledgeRoot,
  });
  const directory = jobDirectory(context.runtimeRoot, context.protocol, context.stageId, candidateId);
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
  assertValue(config.retry?.max_retries ?? 0, 0, `${candidateId} retries`);
  assertValue(lock.harbor?.version, context.protocol.frozenEvaluationProfile.harborVersion, `${candidateId} locked Harbor version`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `${candidateId} locked retries`);
  const lockedTrials = requireArray(lock.trials, `${candidateId} locked trials`);
  if (lockedTrials.length !== context.taskIds.length) throw new Error(`${candidateId} locked trial count drift`);
  equal(lockedTrials.map((item) => item.task?.name).sort(), [...context.taskIds].sort(), `${candidateId} locked tasks`);
  const expectedSkill = expectedConfig.agents[0].skills[0];
  const agent = expectedAgent(context.protocol.frozenEvaluationProfile);
  const lockedByTask = new Map();
  for (const locked of lockedTrials) {
    assertAgent(locked.agent, agent, expectedSkill, `${candidateId}/${locked.task.name} locked agent`);
    if (locked.skills?.length !== 1) throw new Error(`${candidateId}/${locked.task.name} must lock one skill`);
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

async function publicationProjectionMigrationBinding(context, options) {
  if (context.stageId === "remaining-forward-validation") {
    const verified = await verifyReportOnlyPublicationMigration({
      ...options,
      repoRoot: context.repoRoot,
      runtimeRoot: context.runtimeRoot,
      protocolPath: context.protocolPath,
      knowledgeRoot: context.knowledgeRoot,
    });
    const projection = requireObject(
      verified.migration.reportOnlyProjection,
      "report-only publication projection",
    );
    assertValue(
      projection.analyzerRelativePath,
      REPORT_ONLY_ANALYZER_RELATIVE_PATH,
      "report-only analyzer path",
    );
    return {
      relativePath: REPORT_ONLY_PUBLICATION_MIGRATION_RELATIVE_PATH,
      fileSha256: await sha256File(verified.migrationPath),
      migrationSha256: verified.migration.migrationSha256,
      analyzerFileSha256: projection.analyzerFileSha256,
      publisherFileSha256: projection.publisherFileSha256,
      supersedes: verified.migration.supersedes,
    };
  }
  const verified = await verifyQ007PublicationProjectionMigration({
    ...options,
    repoRoot: context.repoRoot,
    runtimeRoot: context.runtimeRoot,
    protocolPath: context.protocolPath,
    knowledgeRoot: context.knowledgeRoot,
  });
  const contract = requireObject(
    verified.migration.publicationProjection?.contract,
    "q007 publication-projection contract",
  );
  assertValue(
    contract.contractId,
    HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID,
    "q007 publication-projection contract ID",
  );
  assertValue(
    verified.migration.publicationProjection?.contractSha256,
    objectDigest(contract),
    "q007 publication-projection contract digest",
  );
  return {
    relativePath: Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH,
    fileSha256: await sha256File(verified.migrationPath),
    migrationSha256: verified.migration.migrationSha256,
    contractId: contract.contractId,
    contractSha256: verified.migration.publicationProjection.contractSha256,
  };
}

function receiptRecord(context, candidateId) {
  const item = context.receipt.candidates.find((candidate) => candidate.candidateId === candidateId);
  if (!item) throw new Error(`Prepared receipt lacks ${candidateId}`);
  return item;
}

function taskReceipt(context, taskId) {
  const item = context.receipt.tasks.find((task) => task.taskId === taskId);
  if (!item) throw new Error(`Prepared receipt lacks ${taskId}`);
  return item;
}

async function buildPublication(context, outputs, records, gate, publicationProjectionMigration) {
  const jobs = {};
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) jobs[candidateId] = await inspectJob(context, candidateId, records);
  assertValue(jobs[BASELINE_ID].profileSha256, jobs[CANDIDATE_ID].profileSha256, "baseline/candidate profile digest");
  assertValue(jobs[BASELINE_ID].canonicalLockSha256, jobs[CANDIDATE_ID].canonicalLockSha256, "baseline/candidate canonical lock digest");
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
        candidateTreeSha256: receiptRecord(context, record.candidateId).sha256,
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
  const totals = { input: 0, cache: 0, output: 0 };
  for (const record of publicRecords) for (const key of Object.keys(totals)) if (record.tokens[key] !== null) totals[key] += record.tokens[key];
  const body = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: "generation-004",
    stageId: context.stageId,
    evidenceLayer: context.protocol.evidenceLayer,
    profile: {
      harborVersion: context.protocol.frozenEvaluationProfile.harborVersion,
      agent: context.protocol.frozenEvaluationProfile.agent,
      attemptsPerCandidateTask: 1,
      retries: 0,
      frozenProfileSha256: context.receipt.profileSha256,
    },
    diagnosticPolicy: outputs.policy,
    records: publicRecords,
    gate,
    tokenTotals: totals,
    callAccounting: {
      additionalHarborInvocationsInStage: 2,
      modelExecutionsInStage: publicRecords.length,
      automaticRetries: 0,
      maximumCumulativeHarborInvocations: context.stageId === FIRST_TASK_ID ? 2 : 4,
      maximumCumulativeModelExecutions: context.stageId === FIRST_TASK_ID ? 2 : 8,
    },
    analyzerProvenance: {
      operatorToolSha256: outputs.toolSha256,
      operatorConfigSha256: outputs.configSha256,
      privateOutputTreeSha256: outputs.outputTree.sha256,
      generationEvidenceSha256: outputs.fileDigests.evidenceSha256,
      candidateRankingSha256: outputs.fileDigests.rankingSha256,
      operatorLogSha256: outputs.fileDigests.logSha256,
    },
    publicationProjectionMigration,
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

export function assertPublicationMatchesRecomputed(publication, recomputed, stageId = "generation-004") {
  assertSanitizedPublication(publication);
  equal(publication, recomputed, `${stageId} publication does not match recomputed Harbor evidence`);
  return publication;
}

function renderMarkdown(publication) {
  const lines = [
    `# Generation 004 ${publication.stageId} result`,
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

export async function classifyBaseline(options = {}, stageId = FIRST_TASK_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const analysis = await runOperatorAnalysis(context, true, options);
  const diagnostic = await loadSingleCandidateDiagnostic(analysis, context);
  const trials = diagnostic.trials;
  if (!baselineCandidateExecutionGate(trials, context.taskIds.length).authorized) {
    throw new Error("Baseline evidence is transient-external, ambiguous, conflicting, or otherwise unavailable; candidate execution is not authorized");
  }
  return {
    schemaVersion: 1,
    stageId,
    candidateExecutionAuthorized: true,
    taskCount: trials.length,
    diagnosticPolicy: diagnostic.policy,
    analyzerEvidenceSha256: diagnostic.fileSha256,
  };
}

export async function publishStage(options = {}, stageId = FIRST_TASK_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const publicationProjectionMigration = await publicationProjectionMigrationBinding(context, options);
  const analysis = await runOperatorAnalysis(context, false, options);
  const outputs = await loadOperatorOutputs(analysis);
  const records = sanitizedRecordsFromOperator({ context, outputs });
  const ranking = rankingRows(outputs);
  const gate = evaluateForwardGate({ stageId, records, ranking });
  const publication = await buildPublication(context, outputs, records, gate, publicationProjectionMigration);
  return writePublication(context, publication);
}

export async function verifyPublishedStage(options = {}, stageId = FIRST_TASK_ID) {
  const context = { ...(await stageContext(options, stageId)), stageId };
  const publicationProjectionMigration = await publicationProjectionMigrationBinding(context, options);
  const resultPath = path.join(context.runtimeRoot, "publications", stageId, "result.json");
  await assertOrdinaryFile(resultPath, `${stageId} publication`);
  const publication = await readJson(resultPath, `${stageId} publication`);
  const analysis = await runOperatorAnalysis(context, false, options);
  const outputs = await loadOperatorOutputs(analysis);
  const records = sanitizedRecordsFromOperator({ context, outputs });
  const ranking = rankingRows(outputs);
  const gate = evaluateForwardGate({ stageId, records, ranking });
  const recomputed = await buildPublication(context, outputs, records, gate, publicationProjectionMigration);
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
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} classify-q007-baseline [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} publish-q007 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} classify-remaining-baseline [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} publish-remaining [options]\n\nClassification and publication consume the Harbor operator analyzer's exact candidate-attributable disposition. They never retry a trial or expose diagnostic text.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const handlers = {
    "classify-q007-baseline": () => classifyBaseline(options, FIRST_TASK_ID),
    "publish-q007": () => publishStage(options, FIRST_TASK_ID),
    "classify-remaining-baseline": () => classifyBaseline(options, "remaining-forward-validation"),
    "publish-remaining": () => publishStage(options, "remaining-forward-validation"),
  };
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command: ${command}`);
  const result = await handler();
  process.stdout.write(canonicalJson(result.publication ? {
    stageId: result.publication.stageId,
    gate: result.publication.gate,
    publicationSha256: result.publication.publicationSha256,
    resultPath: result.resultPath,
  } : result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
