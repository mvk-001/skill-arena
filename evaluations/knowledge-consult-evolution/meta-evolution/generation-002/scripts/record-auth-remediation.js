#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  objectDigest,
  treeDigest,
} from "../../scripts/prepare-meta-evolution.js";
import {
  sha256File,
  verifyGeneration002,
} from "./prepare-generation-002.js";
import {
  inspectChildJob,
} from "./publish-generation-002.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const META_ROOT = path.resolve(GENERATION_ROOT, "..");
const STUDY_ROOT = path.resolve(META_ROOT, "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_SOURCE_PROTOCOL = path.join(STUDY_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_GENERATION_001_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-001",
);
const DEFAULT_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-002",
);
const REMEDIATION_ID = "generation-002-auth-source-001";
const QUARANTINE_SUFFIX = ".external-auth-source-001";
const EXPECTED_EXCEPTION_TYPE = "NonZeroAgentExitCodeError";
const EXPECTED_MESSAGE_SIGNAL = "No API key found for openai-codex";

function sha256Text(value) {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

async function readJson(filePath) {
  let value;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`JSON root must be an object: ${filePath}`);
  }
  return value;
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} drift`);
  }
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function relativePosix(root, absolute) {
  const relative = path.relative(root, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must remain inside ${root}: ${absolute}`);
  }
  return relative.split(path.sep).join("/");
}

function absoluteFromRuntime(runtimeRoot, relative, label) {
  const absolute = path.resolve(runtimeRoot, ...relative.split("/"));
  const back = path.relative(runtimeRoot, absolute);
  if (back === "" || back.startsWith("..") || path.isAbsolute(back)) {
    throw new Error(`${label} escapes runtime root`);
  }
  return absolute;
}

async function contextFromOptions(options) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const sourceProtocolPath = path.resolve(options.sourceProtocolPath ?? DEFAULT_SOURCE_PROTOCOL);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  await verifyGeneration002({
    ...options,
    outputRoot: runtimeRoot,
    protocolPath,
    sourceProtocolPath,
    knowledgeRoot,
    generation001RuntimeRoot,
  });
  const preparedRoot = path.join(runtimeRoot, "prepared");
  const [protocol, preparedReceipt, parentRecord] = await Promise.all([
    readJson(protocolPath),
    readJson(path.join(preparedRoot, "receipt.json")),
    readJson(path.join(preparedRoot, "parent-evidence", "baseline-record.json")),
  ]);
  const outputDirectory = path.resolve(
    options.outputDirectory ?? path.join(runtimeRoot, "remediations", REMEDIATION_ID),
  );
  relativePosix(runtimeRoot, outputDirectory);
  return {
    runtimeRoot,
    protocolPath,
    sourceProtocolPath,
    knowledgeRoot,
    generation001RuntimeRoot,
    preparedRoot,
    protocol,
    preparedReceipt,
    parentRecord,
    outputDirectory,
  };
}

function jobPaths(context, child) {
  const jobName = `${context.protocol.harbor.jobNamePrefix}-q003-${child.candidateId}`;
  const candidateRoot = path.join(context.runtimeRoot, "jobs", "q003", child.candidateId);
  return {
    jobName,
    source: path.join(candidateRoot, jobName),
    destination: path.join(candidateRoot, `${jobName}${QUARANTINE_SUFFIX}`),
  };
}

async function oneTrial(jobDirectory, candidateId) {
  const entries = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (entries.length !== 1) {
    throw new Error(`${candidateId} job must contain exactly one native trial directory`);
  }
  return entries[0].name;
}

function assertZeroTokens(tokens, label) {
  equal(tokens, { input: 0, cache: 0, output: 0 }, `${label} tokens`);
}

async function inspectPiLog(logPath, candidateId) {
  const text = await fs.readFile(logPath, "utf8");
  const events = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value) && typeof value.type === "string") {
        events.push(value.type);
      }
    } catch {
      // Pi also writes human-readable setup/error lines. They are never copied.
    }
  }
  const counts = {
    session: events.filter((type) => type === "session").length,
    message: events.filter((type) => type === "message").length,
    tool: events.filter((type) => type === "tool").length,
    other: events.filter((type) => !["session", "message", "tool"].includes(type)).length,
  };
  equal(counts, { session: 1, message: 0, tool: 0, other: 0 }, `${candidateId} Pi event counts`);
  if (!text.includes(EXPECTED_MESSAGE_SIGNAL)) {
    throw new Error(`${candidateId} Pi log lacks the same missing-provider signal`);
  }
  return {
    sha256: await sha256File(logPath),
    eventCounts: counts,
    exactSignalPresent: true,
  };
}

async function inspectSourceFailure(context, child) {
  const paths = jobPaths(context, child);
  await assertOrdinaryDirectory(paths.source, `${child.candidateId} source failure job`);
  if (await exists(paths.destination)) {
    throw new Error(`${child.candidateId} quarantine destination already exists`);
  }
  const record = await inspectChildJob({
    protocol: context.protocol,
    receipt: context.preparedReceipt,
    runtimeRoot: context.runtimeRoot,
    preparedRoot: context.preparedRoot,
    knowledgeRoot: context.knowledgeRoot,
    generation001RuntimeRoot: context.generation001RuntimeRoot,
    child,
    parentRecord: context.parentRecord,
  });
  assertValue(record.evaluable, false, `${child.candidateId} evaluability`);
  assertValue(record.qualified, false, `${child.candidateId} qualification`);
  assertValue(record.status, "errored", `${child.candidateId} failure status`);
  assertZeroTokens(record.tokens, child.candidateId);
  const trialName = await oneTrial(paths.source, child.candidateId);
  const trialPath = path.join(paths.source, trialName, "result.json");
  const trial = await readJson(trialPath);
  assertValue(trial.exception_info?.exception_type, EXPECTED_EXCEPTION_TYPE, `${child.candidateId} exception type`);
  const message = trial.exception_info?.exception_message;
  if (typeof message !== "string" || !message.includes(EXPECTED_MESSAGE_SIGNAL)) {
    throw new Error(`${child.candidateId} lacks the exact native Pi missing-provider signal`);
  }
  assertZeroTokens({
    input: trial.agent_result?.n_input_tokens,
    cache: trial.agent_result?.n_cache_tokens,
    output: trial.agent_result?.n_output_tokens,
  }, `${child.candidateId} native trial`);
  const piLog = await inspectPiLog(
    path.join(paths.source, trialName, "agent", "pi.txt"),
    child.candidateId,
  );
  const tree = await treeDigest(paths.source);
  return {
    candidateId: child.candidateId,
    taskId: "q003",
    originalJobName: paths.jobName,
    originalJobDirectory: relativePosix(context.runtimeRoot, paths.source),
    quarantinedJobDirectory: relativePosix(context.runtimeRoot, paths.destination),
    trialName,
    classification: {
      domain: "authentication",
      code: "pi-openai-codex-provider-entry-missing",
      agentStarted: true,
      modelCalls: 0,
      strategyEvaluated: false,
      operatorTrialEligible: false,
    },
    nativeEvidence: {
      exceptionType: EXPECTED_EXCEPTION_TYPE,
      exceptionMessageSha256: sha256Text(message),
      exceptionTracebackSha256: sha256Text(String(trial.exception_info?.exception_traceback ?? "")),
      exactSignalPresent: true,
      piLogSha256: piLog.sha256,
      piEventCounts: piLog.eventCounts,
      piLogExactSignalPresent: piLog.exactSignalPresent,
      unstructuredTextCopied: false,
      verifierDiagnosticsRead: false,
    },
    tokens: { input: 0, cache: 0, output: 0 },
    provenance: {
      candidateTreeSha256: record.provenance.candidateTreeSha256,
      profileSha256: record.provenance.profileSha256,
      taskChecksum: record.provenance.taskChecksum,
      lockedSkillDigest: record.provenance.lockedSkillDigest,
      lockedSkillName: record.provenance.lockedSkillName,
      jobTreeSha256: tree.sha256,
      jobTreeFileCount: tree.fileCount,
      jobTreeTotalBytes: tree.totalBytes,
      jobConfigSha256: record.provenance.jobConfigSha256,
      jobLockSha256: record.provenance.jobLockSha256,
      jobResultSha256: record.provenance.jobResultSha256,
      trialResultSha256: record.provenance.trialResultSha256,
    },
  };
}

function receiptBody(context, attempts) {
  return {
    schemaVersion: 1,
    remediationId: REMEDIATION_ID,
    experimentId: context.protocol.experimentId,
    generationId: "generation-002",
    status: "preserved",
    classification: {
      domain: "authentication",
      code: "wrong-auth-source-shape",
      sourceContractRequiredTopLevelEntry: "openai-codex",
      candidateChanged: false,
      taskChanged: false,
      evaluationProfileChanged: false,
    },
    attempts,
    callAccounting: {
      failedHarborAttempts: 2,
      modelCalls: 0,
      tokens: { input: 0, cache: 0, output: 0 },
      chargedToGeneration002DevelopmentModelCalls: 0,
      generation002DevelopmentMaximumModelCallsRemaining: 2,
    },
    operatorEvidence: {
      creditAwarded: false,
      trialsCounted: 0,
      selectionEligible: false,
      chainEligible: false,
    },
    resumeSkill: {
      skillId: "harbor-resume-external-failures",
      eligible: false,
      reasonCode: "generic-agent-exit-plus-unstructured-message-is-not-allowlisted-evidence",
      policyRelaxed: false,
      verifierDiagnosticsFabricated: false,
    },
    remediation: {
      type: "use-pi-auth-source-with-openai-codex-entry",
      correctedSourceShape: "Pi auth directory containing auth.json",
      rerunMode: "fresh-canonical-harbor-jobs-after-quarantine",
      semanticOutcomeRetried: false,
    },
    provenance: {
      metaProtocolSha256: context.preparedReceipt.metaProtocolSha256,
      preparedReceiptSha256: null,
      parentPublicationSha256: context.preparedReceipt.parentEvidence.publicationSha256,
    },
  };
}

async function completeProvenance(context, body) {
  return {
    ...body,
    provenance: {
      ...body.provenance,
      preparedReceiptSha256: await sha256File(path.join(context.preparedRoot, "receipt.json")),
    },
  };
}

async function verifyAttemptAtDestination(context, attempt) {
  const destination = absoluteFromRuntime(context.runtimeRoot, attempt.quarantinedJobDirectory, "quarantined job path");
  await assertOrdinaryDirectory(destination, `${attempt.candidateId} quarantined job`);
  const tree = await treeDigest(destination);
  equal(tree, {
    sha256: attempt.provenance.jobTreeSha256,
    fileCount: attempt.provenance.jobTreeFileCount,
    totalBytes: attempt.provenance.jobTreeTotalBytes,
  }, `${attempt.candidateId} quarantined job tree`);
  const core = {
    jobConfigSha256: await sha256File(path.join(destination, "config.json")),
    jobLockSha256: await sha256File(path.join(destination, "lock.json")),
    jobResultSha256: await sha256File(path.join(destination, "result.json")),
    trialResultSha256: await sha256File(path.join(destination, attempt.trialName, "result.json")),
  };
  for (const [key, digest] of Object.entries(core)) {
    assertValue(digest, attempt.provenance[key], `${attempt.candidateId} ${key}`);
  }
  const trial = await readJson(path.join(destination, attempt.trialName, "result.json"));
  assertValue(trial.exception_info?.exception_type, EXPECTED_EXCEPTION_TYPE, `${attempt.candidateId} preserved exception type`);
  const message = trial.exception_info?.exception_message;
  if (typeof message !== "string" || !message.includes(EXPECTED_MESSAGE_SIGNAL)) {
    throw new Error(`${attempt.candidateId} preserved job lost the native missing-provider signal`);
  }
  assertValue(sha256Text(message), attempt.nativeEvidence.exceptionMessageSha256, `${attempt.candidateId} preserved message digest`);
  assertValue(
    sha256Text(String(trial.exception_info?.exception_traceback ?? "")),
    attempt.nativeEvidence.exceptionTracebackSha256,
    `${attempt.candidateId} preserved traceback digest`,
  );
  assertZeroTokens({
    input: trial.agent_result?.n_input_tokens,
    cache: trial.agent_result?.n_cache_tokens,
    output: trial.agent_result?.n_output_tokens,
  }, `${attempt.candidateId} preserved trial`);
  const piLog = await inspectPiLog(
    path.join(destination, attempt.trialName, "agent", "pi.txt"),
    attempt.candidateId,
  );
  assertValue(piLog.sha256, attempt.nativeEvidence.piLogSha256, `${attempt.candidateId} preserved Pi log digest`);
  equal(piLog.eventCounts, attempt.nativeEvidence.piEventCounts, `${attempt.candidateId} preserved Pi events`);
}

async function verifyReceipt(context, receipt) {
  const { receiptSha256, ...body } = receipt;
  assertValue(receiptSha256, objectDigest(body), "auth remediation receipt digest");
  assertValue(body.remediationId, REMEDIATION_ID, "auth remediation ID");
  assertValue(body.generationId, "generation-002", "auth remediation generation");
  assertValue(body.provenance.metaProtocolSha256, context.preparedReceipt.metaProtocolSha256, "auth remediation protocol digest");
  assertValue(
    body.provenance.preparedReceiptSha256,
    await sha256File(path.join(context.preparedRoot, "receipt.json")),
    "auth remediation prepared receipt digest",
  );
  equal(body.attempts.map((attempt) => attempt.candidateId), context.protocol.target.children.map((child) => child.candidateId), "auth remediation candidate coverage");
  equal(body.callAccounting, {
    failedHarborAttempts: 2,
    modelCalls: 0,
    tokens: { input: 0, cache: 0, output: 0 },
    chargedToGeneration002DevelopmentModelCalls: 0,
    generation002DevelopmentMaximumModelCallsRemaining: 2,
  }, "auth remediation call accounting");
  assertValue(body.resumeSkill.eligible, false, "auth remediation resume eligibility");
  assertValue(body.resumeSkill.policyRelaxed, false, "auth remediation resume policy");
  assertValue(body.resumeSkill.verifierDiagnosticsFabricated, false, "auth remediation diagnostics policy");
  for (const attempt of body.attempts) {
    assertValue(attempt.classification.modelCalls, 0, `${attempt.candidateId} model call count`);
    assertValue(attempt.classification.operatorTrialEligible, false, `${attempt.candidateId} operator eligibility`);
    assertZeroTokens(attempt.tokens, attempt.candidateId);
    await verifyAttemptAtDestination(context, attempt);
  }
  const serialized = canonicalJson(receipt);
  if (serialized.includes(EXPECTED_MESSAGE_SIGNAL) || serialized.includes("exception_message") || serialized.includes("exception_traceback")) {
    throw new Error("Auth remediation receipt copied unstructured native error text");
  }
  return receipt;
}

async function loadReservation(context) {
  const reservationPath = path.join(context.outputDirectory, "reservation.json");
  if (!(await exists(reservationPath))) {
    return null;
  }
  const reservation = await readJson(reservationPath);
  const { reservationSha256, ...body } = reservation;
  assertValue(reservationSha256, objectDigest(body), "auth remediation reservation digest");
  assertValue(body.remediationId, REMEDIATION_ID, "auth remediation reservation ID");
  return body;
}

export async function recordAuthRemediation(options = {}) {
  const context = await contextFromOptions(options);
  const receiptPath = path.join(context.outputDirectory, "receipt.json");
  if (await exists(receiptPath)) {
    return {
      mode: "verified-existing",
      outputDirectory: context.outputDirectory,
      receipt: await verifyReceipt(context, await readJson(receiptPath)),
    };
  }
  let body = await loadReservation(context);
  if (!body) {
    const attempts = [];
    for (const child of context.protocol.target.children) {
      attempts.push(await inspectSourceFailure(context, child));
    }
    body = await completeProvenance(context, receiptBody(context, attempts));
    await fs.mkdir(path.dirname(context.outputDirectory), { recursive: true });
    await assertOrdinaryDirectory(path.dirname(context.outputDirectory), "auth remediation output parent");
    await fs.mkdir(context.outputDirectory, { recursive: false });
    await fs.writeFile(
      path.join(context.outputDirectory, "reservation.json"),
      canonicalJson({ ...body, reservationSha256: objectDigest(body) }),
      { flag: "wx" },
    );
  }
  for (const attempt of body.attempts) {
    const source = absoluteFromRuntime(context.runtimeRoot, attempt.originalJobDirectory, "original job path");
    const destination = absoluteFromRuntime(context.runtimeRoot, attempt.quarantinedJobDirectory, "quarantined job path");
    const sourceExists = await exists(source);
    const destinationExists = await exists(destination);
    if (sourceExists && !destinationExists) {
      await fs.rename(source, destination);
    } else if (!sourceExists && destinationExists) {
      // A prior interrupted invocation already completed this atomic move.
    } else {
      throw new Error(`${attempt.candidateId} source/destination preservation state is ambiguous`);
    }
    await verifyAttemptAtDestination(context, attempt);
  }
  const receipt = { ...body, receiptSha256: objectDigest(body) };
  await fs.writeFile(receiptPath, canonicalJson(receipt), { flag: "wx" });
  await fs.rm(path.join(context.outputDirectory, "reservation.json"));
  return { mode: "recorded", outputDirectory: context.outputDirectory, receipt };
}

export async function verifyAuthRemediation(options = {}) {
  const context = await contextFromOptions(options);
  const receiptPath = path.join(context.outputDirectory, "receipt.json");
  if (!(await exists(receiptPath))) {
    throw new Error(`Auth remediation receipt does not exist: ${receiptPath}`);
  }
  return {
    mode: "verified",
    outputDirectory: context.outputDirectory,
    receipt: await verifyReceipt(context, await readJson(receiptPath)),
  };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--runtime": "runtimeRoot",
    "--output": "outputDirectory",
    "--protocol": "protocolPath",
    "--source-protocol": "sourceProtocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = mapping[argv[index]];
    if (!key) {
      throw new Error(`Unknown option: ${argv[index]}`);
    }
    if (!argv[index + 1]) {
      throw new Error(`Missing value for ${argv[index]}`);
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} record [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify [options]\n\nThis command makes no Harbor or model calls and never reads verifier diagnostics.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const result = command === "record"
    ? await recordAuthRemediation(options)
    : command === "verify"
      ? await verifyAuthRemediation(options)
      : null;
  if (!result) {
    throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(canonicalJson({
    mode: result.mode,
    outputDirectory: result.outputDirectory,
    receiptSha256: result.receipt.receiptSha256,
    modelCalls: result.receipt.callAccounting.modelCalls,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
