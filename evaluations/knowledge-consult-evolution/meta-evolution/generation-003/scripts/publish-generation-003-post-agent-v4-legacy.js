#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSanitizedPublication } from "../../scripts/publish-meta-evolution.js";
import { canonicalJson, objectDigest } from "../../scripts/prepare-meta-evolution.js";
import {
  analysisPreparedRoot,
  buildDevelopmentOperatorConfig,
  buildGeneration003HarborConfig,
  sha256File,
  verifyGeneration003,
} from "./prepare-generation-003.js";
import {
  evaluateDevelopmentGate,
  HARBOR_018_TRIAL_LOCK_DEFAULT_PROJECTION,
  inspectGeneration003Job,
  validateExactNativeGeneration003Comparisons,
} from "./publish-generation-003-v4.js";
import {
  POST_AGENT_COMPLETION_MODE_V4,
  resolveContrastPostAgentEffectiveEvidenceV4,
} from "./evidence-resolution-post-agent-v4.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../../..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const DEFAULT_GENERATION_001_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-001");

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift`);
}

function equal(actual, expected, label) {
  if (objectDigest(actual) !== objectDigest(expected)) throw new Error(`${label} drift`);
}

async function readJson(file, label = file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be an ordinary file`);
  return requireObject(JSON.parse(await fs.readFile(file, "utf8")), label);
}

async function exists(target) {
  return fs.lstat(target).then(() => true, () => false);
}

function sumTokens(records) {
  const total = { input: 0, cache: 0, output: 0 };
  for (const record of records) {
    for (const key of Object.keys(total)) if (record.tokens[key] !== null) total[key] += record.tokens[key];
  }
  return total;
}

function publicRecordsAndGate(records, gate, protocol) {
  const aliases = new Map(protocol.target.children.map((child, index) => [
    child.candidateId,
    `child-${String(index + 1).padStart(3, "0")}`,
  ]));
  const publicRecords = records.map((record) => ({
    taskId: record.taskId,
    candidateId: aliases.get(record.candidateId) ?? "baseline",
    parentCandidateId: record.parentCandidateId === null ? null : "baseline",
    operatorId: record.operatorId === null ? null : "operator-001",
    evaluable: record.evaluable,
    qualified: record.qualified,
    status: record.status,
    metrics: { primary: record.metrics.primary },
    gates: Object.fromEntries(Object.entries(record.gates).sort()),
    tokens: { ...record.tokens },
    provenance: {
      candidateTreeSha256: record.provenance.candidateTreeSha256,
      profileSha256: record.provenance.profileSha256,
      taskChecksum: record.provenance.taskChecksum,
      jobConfigSha256: record.provenance.jobConfigSha256,
      jobLockSha256: record.provenance.jobLockSha256,
      jobResultSha256: record.provenance.jobResultSha256,
      trialResultSha256: record.provenance.trialResultSha256,
      lockedSkillDigest: record.provenance.lockedSkillDigest,
      lockedSkillName: record.provenance.lockedSkillName,
      evidenceMode: record.provenance.evidenceMode,
      resumeManifestFileSha256: record.provenance.resumeManifestFileSha256,
      effectiveJobDigest: record.provenance.effectiveJobDigest,
      completionMode: record.provenance.completionMode ?? null,
      recoveryRecordFileSha256: record.provenance.recoveryRecordFileSha256 ?? null,
    },
  }));
  return {
    records: publicRecords,
    gate: {
      status: gate.status,
      passed: gate.passed,
      reason: gate.reason,
      nextStage: gate.nextStage,
      selectedCandidateId: gate.selectedCandidateId === null ? null : aliases.get(gate.selectedCandidateId),
    },
  };
}

function renderMarkdown(publication) {
  const lines = [
    "# Generation 003 q003 development result",
    "",
    "The exact generation-003 cohort contains a fresh baseline, the preserved extractive job, and contrast attempt 1 completed by a sealed verifier-only recovery of its first terminal model output.",
    "",
    `Gate: **${publication.gate.status}** (${publication.gate.reason})`,
    "",
    "| Candidate | Evidence | Evaluable | Qualified | Reward | Required gates | Input / cache / output tokens |",
    "| --- | --- | :---: | :---: | ---: | --- | ---: |",
  ];
  for (const record of publication.records) {
    const gates = Object.entries(record.gates).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ");
    lines.push(`| ${record.candidateId} | ${record.provenance.evidenceMode} | ${record.evaluable ? "yes" : "no"} | ${record.qualified ? "yes" : "no"} | ${record.metrics.primary ?? "null"} | ${gates} | ${record.tokens.input ?? "null"} / ${record.tokens.cache ?? "null"} / ${record.tokens.output ?? "null"} |`);
  }
  lines.push("", `Publication SHA-256: \`${publication.publicationSha256}\``, "");
  return lines.join("\n");
}

async function writePublication(outputDirectory, publication) {
  if (await exists(outputDirectory)) throw new Error(`Publication output already exists: ${outputDirectory}`);
  await fs.mkdir(path.dirname(outputDirectory), { recursive: true });
  const staging = `${outputDirectory}.tmp-${process.pid}-${randomUUID()}`;
  await fs.mkdir(staging, { recursive: false });
  try {
    await fs.writeFile(path.join(staging, "result.json"), canonicalJson(publication), { flag: "wx" });
    await fs.writeFile(path.join(staging, "report.md"), renderMarkdown(publication), { flag: "wx" });
    await fs.rename(staging, outputDirectory);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function materializeOperatorInput({ protocol, runtimeRoot, preparedRoot, resolvedJobs, inspections, evidence }) {
  const directory = path.join(runtimeRoot, "operator-inputs", "generation-003-post-agent");
  const configPath = path.join(directory, "generation-003.json");
  const receiptPath = path.join(directory, "receipt.json");
  const config = buildDevelopmentOperatorConfig({
    protocol,
    runtimeRoot,
    preparedRoot,
    resolvedJobDirectories: Object.fromEntries(Object.entries(resolvedJobs).map(([candidateId, item]) => [candidateId, item.jobDirectory])),
  });
  const configText = canonicalJson(config);
  const body = {
    schemaVersion: 1,
    generationId: "generation-003",
    completionMode: evidence.selection.completionMode,
    configSha256: objectDigest(config),
    candidateEvidence: Object.fromEntries(Object.entries(resolvedJobs).map(([candidateId, item]) => [
      candidateId,
      {
        mode: item.mode,
        jobDirectorySha256: objectDigest(path.resolve(item.jobDirectory)),
        resumeManifestFileSha256: item.resumeProvenance?.resumeManifestFileSha256 ?? null,
        effectiveJobDigest: item.resumeProvenance?.effectiveJobDigest ?? null,
        recoveryRecordFileSha256: item.resumeProvenance?.recoveryRecordFileSha256 ?? null,
      },
    ])),
    exactNativeComparison: {
      evaluationProfileSha256: inspections[0].comparison.evaluationProfileSha256,
      developmentLockSha256: inspections[0].comparison.lockSha256,
      candidateCount: inspections.length,
    },
    recoveryCalls: evidence.provenance.recoveryCalls,
    generation001ResultImported: false,
    generation002ResultImported: false,
  };
  const receipt = { ...body, receiptSha256: objectDigest(body) };
  if (await exists(directory)) {
    assertValue(await fs.readFile(configPath, "utf8"), configText, "post-agent operator config bytes");
    equal(await readJson(receiptPath), receipt, "post-agent operator receipt");
    return { configSha256: body.configSha256, receiptFileSha256: await sha256File(receiptPath) };
  }
  await fs.mkdir(path.dirname(directory), { recursive: true });
  const staging = `${directory}.tmp-${process.pid}-${randomUUID()}`;
  await fs.mkdir(staging, { recursive: false });
  try {
    await fs.writeFile(path.join(staging, "generation-003.json"), configText, { flag: "wx" });
    await fs.writeFile(path.join(staging, "receipt.json"), canonicalJson(receipt), { flag: "wx" });
    await fs.rename(staging, directory);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { configSha256: body.configSha256, receiptFileSha256: await sha256File(receiptPath) };
}

async function context(options) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const [verified, protocol] = await Promise.all([
    verifyGeneration003({ ...options, outputRoot: runtimeRoot, protocolPath, generation001RuntimeRoot }),
    readJson(protocolPath, "generation-003 protocol"),
  ]);
  const preparedRoot = analysisPreparedRoot(runtimeRoot);
  const evidence = await resolveContrastPostAgentEffectiveEvidenceV4({
    protocol,
    runtimeRoot,
    verificationContractPath: options.verificationContractPath,
  });
  assertValue(evidence.selection.completionMode, POST_AGENT_COMPLETION_MODE_V4, "post-agent evidence completion mode");
  assertValue(evidence.provenance.recoveryCalls.harbor, 0, "post-agent recovery Harbor calls");
  assertValue(evidence.provenance.recoveryCalls.model, 0, "post-agent recovery model calls");
  assertValue(evidence.provenance.recoveryCalls.verifier, 2, "post-agent recovery verifier calls");
  return { runtimeRoot, protocolPath, generation001RuntimeRoot, verified, protocol, preparedRoot, evidence };
}

function originalJobDirectory({ protocol, runtimeRoot, preparedRoot, knowledgeRoot, generation001RuntimeRoot, candidateId }) {
  const config = buildGeneration003HarborConfig({ protocol, candidateId, runtimeRoot, preparedRoot, knowledgeRoot, generation001RuntimeRoot });
  return path.join(runtimeRoot, "jobs", "q003", candidateId, config.job_name);
}

export async function verifyContrastPostAgentResume(options = {}) {
  const state = await context(options);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const inspection = await inspectGeneration003Job({
    protocol: state.protocol,
    receipt: state.verified.receipt,
    runtimeRoot: state.runtimeRoot,
    preparedRoot: state.preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot: state.generation001RuntimeRoot,
    candidateId: state.evidence.candidateId,
    jobDirectory: state.evidence.jobDirectory,
    resumeProvenance: {
      resumeManifestFileSha256: state.evidence.provenance.resumeManifestSha256,
      effectiveJobDigest: state.evidence.provenance.effectiveJobDigest,
    },
    trialLockCompatibility: {
      contract: HARBOR_018_TRIAL_LOCK_DEFAULT_PROJECTION,
      artifactShape: "effective-source-config",
    },
  });
  if (!inspection.record.evaluable) throw new Error("post-agent contrast effective job is not evaluable");
  return {
    mode: "verified-post-agent-resume",
    selectionPolicy: state.evidence.selection.policy,
    selectedLineage: state.evidence.selection.lineage,
    selectedAttempt: state.evidence.selection.attempt,
    completionMode: state.evidence.selection.completionMode,
    completion: state.evidence.provenance.completion,
    effectiveJobDigest: state.evidence.provenance.effectiveJobDigest,
    recoveryRecordFileSha256: state.evidence.provenance.recoveryLockSha256,
    recoveryResultFileSha256: state.evidence.provenance.recoveryResultSha256,
    evaluationProfileSha256: inspection.comparison.evaluationProfileSha256,
    developmentLockSha256: inspection.comparison.lockSha256,
    recoveryCalls: state.evidence.provenance.recoveryCalls,
  };
}

export async function publishGeneration003PostAgent(options = {}) {
  const state = await context(options);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const resolvedJobs = {
    baseline: {
      mode: state.protocol.effectiveEvidence.baseline.mode,
      jobDirectory: originalJobDirectory({ ...state, knowledgeRoot, candidateId: "baseline" }),
      resumeProvenance: null,
    },
    [state.protocol.target.children[0].candidateId]: {
      mode: state.protocol.effectiveEvidence[state.protocol.target.children[0].candidateId].mode,
      jobDirectory: originalJobDirectory({ ...state, knowledgeRoot, candidateId: state.protocol.target.children[0].candidateId }),
      resumeProvenance: null,
    },
    [state.protocol.target.children[1].candidateId]: {
      mode: state.evidence.mode,
      jobDirectory: state.evidence.jobDirectory,
      resumeProvenance: {
        resumeManifestFileSha256: state.evidence.provenance.resumeManifestSha256,
        effectiveJobDigest: state.evidence.provenance.effectiveJobDigest,
        recoveryRecordFileSha256: state.evidence.provenance.recoveryLockSha256,
      },
    },
  };
  assertValue(
    path.resolve(resolvedJobs.baseline.jobDirectory),
    path.resolve(state.runtimeRoot, ...state.protocol.effectiveEvidence.baseline.jobDirectory.split("/")),
    "fresh baseline effective job declaration",
  );
  const baselineInspection = await inspectGeneration003Job({
    protocol: state.protocol,
    receipt: state.verified.receipt,
    runtimeRoot: state.runtimeRoot,
    preparedRoot: state.preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot: state.generation001RuntimeRoot,
    candidateId: "baseline",
    jobDirectory: resolvedJobs.baseline.jobDirectory,
    trialLockCompatibility: {
      contract: HARBOR_018_TRIAL_LOCK_DEFAULT_PROJECTION,
      artifactShape: "native-trial-result",
    },
  });
  const inspections = [baselineInspection];
  for (const child of state.protocol.target.children) {
    const resolved = resolvedJobs[child.candidateId];
    const inspection = await inspectGeneration003Job({
      protocol: state.protocol,
      receipt: state.verified.receipt,
      runtimeRoot: state.runtimeRoot,
      preparedRoot: state.preparedRoot,
      knowledgeRoot,
      generation001RuntimeRoot: state.generation001RuntimeRoot,
      candidateId: child.candidateId,
      jobDirectory: resolved.jobDirectory,
      taskChecksum: baselineInspection.record.provenance.taskChecksum,
      resumeProvenance: resolved.resumeProvenance === null ? null : {
        resumeManifestFileSha256: resolved.resumeProvenance.resumeManifestFileSha256,
        effectiveJobDigest: resolved.resumeProvenance.effectiveJobDigest,
      },
      trialLockCompatibility: {
        contract: HARBOR_018_TRIAL_LOCK_DEFAULT_PROJECTION,
        artifactShape: child.candidateId === state.evidence.candidateId
          ? "effective-source-config"
          : "native-trial-result",
      },
    });
    if (child.candidateId === state.evidence.candidateId) {
      inspection.record.provenance.completionMode = state.evidence.selection.completionMode;
      inspection.record.provenance.recoveryRecordFileSha256 = state.evidence.provenance.recoveryLockSha256;
    }
    inspections.push(inspection);
  }
  const records = inspections.map((inspection) => inspection.record);
  if (new Set(records.map((record) => record.provenance.taskChecksum)).size !== 1) throw new Error("q003 checksum drift in post-agent cohort");
  if (records.some((record) => !record.evaluable)) throw new Error("post-agent cohort contains non-evaluable evidence");
  const exactNativeComparison = validateExactNativeGeneration003Comparisons(inspections);
  const gate = evaluateDevelopmentGate({ protocol: state.protocol, records });
  const operatorInput = await materializeOperatorInput({
    protocol: state.protocol,
    runtimeRoot: state.runtimeRoot,
    preparedRoot: state.preparedRoot,
    resolvedJobs,
    inspections,
    evidence: state.evidence,
  });
  assertValue(records.length, state.protocol.callAccounting.effectiveComparableEvaluations, "effective comparison accounting");
  assertValue(state.evidence.selection.attempt, state.protocol.callAccounting.generation003ExternalRetries, "external retry accounting");
  const publicEvidence = publicRecordsAndGate(records, gate, state.protocol);
  const receipt = state.verified.receipt;
  const privateAuthSeal = path.join(state.runtimeRoot, ...state.protocol.privateAuthenticationSeal.path.split("/"));
  const body = {
    schemaVersion: 1,
    experimentId: state.protocol.experimentId,
    generationId: "generation-003",
    evidenceLayer: state.protocol.evidenceLayer,
    taskId: "q003",
    profile: {
      sha256: receipt.frozenEvaluationProfileSha256,
      harborVersion: state.protocol.frozenEvaluationProfile.harborVersion,
      agent: state.protocol.frozenEvaluationProfile.agent.name,
      agentVersion: state.protocol.frozenEvaluationProfile.agent.version,
      model: state.protocol.frozenEvaluationProfile.agent.model,
      thinking: state.protocol.frozenEvaluationProfile.agent.thinking,
      attempts: 1,
      retries: 0,
    },
    thresholds: {
      primaryMetric: state.protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: state.protocol.frozenEvaluationProfile.passThreshold,
      requiredGates: state.protocol.frozenEvaluationProfile.requiredRewards,
    },
    records: publicEvidence.records,
    tokenTotals: sumTokens(records),
    gate: publicEvidence.gate,
    comparisonPolicy: { ...receipt.comparisonPolicy },
    exactNativeComparison,
    callAccounting: {
      ...state.protocol.callAccounting,
      postAgentRecoveryHarborInvocations: 0,
      postAgentRecoveryModelExecutions: 0,
      deterministicCheckExecutions: 2,
      subsequentValidationPermitted: gate.passed,
    },
    provenance: {
      preparationReceiptFileSha256: await sha256File(path.join(state.preparedRoot, "receipt.json")),
      postAgentVerificationContractFileSha256: state.evidence.provenance.completion.contractFileSha256,
      protocolSha256: receipt.protocolSha256,
      q003TaskTreeSha256: receipt.q003Task.treeSha256,
      lineageParentPreparationReceiptSha256: receipt.lineageParentEvidence.preparationReceiptSha256,
      lineageOperatorFileSha256: receipt.diagnosticOperatorProvenance.fileSha256,
      lineageOperatorGenerationSeal: receipt.diagnosticOperatorProvenance.generationSeal,
      donorTreeSha256: receipt.diagnosticDonorTrace.candidateTreeSha256,
      privateAuthSealFileSha256: await sha256File(privateAuthSeal),
      authPayloadDigestPublished: false,
      authCredentialMetadataPublished: false,
      contrastResume: {
        selectionPolicy: state.evidence.selection.policy,
        selectedLineage: state.evidence.selection.lineage,
        selectedAttempt: state.evidence.selection.attempt,
        completionMode: state.evidence.selection.completionMode,
        resumeLockFileSha256: state.evidence.provenance.resumeLockSha256,
        recoveryLockFileSha256: state.evidence.provenance.recoveryLockSha256,
        recoveryResultFileSha256: state.evidence.provenance.recoveryResultSha256,
        manifestFileSha256: state.evidence.provenance.resumeManifestSha256,
        effectiveJobDigest: state.evidence.provenance.effectiveJobDigest,
        nativeRetryJobArtifactDigest: state.evidence.provenance.nativeRetryJobArtifactDigest,
        recoveredJobArtifactDigest: state.evidence.provenance.recoveredJobArtifactDigest,
        attemptRecordDigest: state.evidence.provenance.attemptRecordDigest,
        recoveryRecordDigest: state.evidence.provenance.recoveryRecordDigest,
        recoveryResultDigest: state.evidence.provenance.recoveryResultDigest,
        failureContract: state.evidence.provenance.failureContract,
        recoveryContract: state.evidence.provenance.recoveryContract,
        remediationAttestationDigest: state.evidence.provenance.remediationAttestationDigest,
        calls: state.evidence.provenance.recoveryCalls,
      },
      resolvedOperatorInput: {
        configSha256: operatorInput.configSha256,
        receiptFileSha256: operatorInput.receiptFileSha256,
      },
    },
  };
  const publication = { ...body, publicationSha256: objectDigest(body) };
  assertSanitizedPublication(publication);
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(state.runtimeRoot, "publications", "q003"));
  if (path.relative(state.runtimeRoot, outputDirectory).startsWith("..")) throw new Error("publication output escapes generation-003 runtime");
  await writePublication(outputDirectory, publication);
  return { publication, outputDirectory };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--runtime": "runtimeRoot",
    "--output": "outputDirectory",
    "--protocol": "protocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
    "--verification-contract": "verificationContractPath",
    "--v3-attestation": "v3AttestationPath",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const field = mapping[argv[index]];
    if (!field) throw new Error(`Unknown option: ${argv[index]}`);
    options[field] = requireString(argv[index + 1], argv[index]);
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-resume [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} q003 [options]\n\nBoth commands perform zero Harbor and model calls.\n`);
    return;
  }
  if (command === "verify-resume") {
    if (options.outputDirectory !== undefined) throw new Error("--output is valid only for q003 publication");
    process.stdout.write(canonicalJson(await verifyContrastPostAgentResume(options)));
    return;
  }
  if (command !== "q003") throw new Error(`Unknown command: ${command}`);
  const result = await publishGeneration003PostAgent(options);
  process.stdout.write(canonicalJson({
    outputDirectory: result.outputDirectory,
    gate: result.publication.gate,
    publicationSha256: result.publication.publicationSha256,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
