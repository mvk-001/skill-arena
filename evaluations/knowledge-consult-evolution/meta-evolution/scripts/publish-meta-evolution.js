#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHarborJobConfig,
  canonicalJson,
  objectDigest,
  verifyExperiment,
} from "./prepare-meta-evolution.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const META_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(META_ROOT, "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(META_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-001",
);
const FORBIDDEN_PUBLIC_TERMS = [
  "answer",
  "claim",
  "diagnostic",
  "ground-truth",
  "instruction",
  "oracle",
  "qrel",
  "reasoning",
  "response",
  "rubric",
  "solution",
  "trajectory",
  "verifier-input",
];

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
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

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireFinite(value, label, { nullable = false, integer = false } = {}) {
  if (nullable && (value === null || value === undefined)) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${nullable ? "null or " : ""}a finite ${integer ? "integer" : "number"}`);
  }
  if (value < 0) {
    throw new Error(`${label} must not be negative`);
  }
  return value;
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} drift`);
  }
}

function assertValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

async function assertRealDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function profileAgentExpected(profile) {
  return {
    name: profile.agent.name,
    model_name: profile.agent.model,
    n_concurrent: 1,
    kwargs: {
      version: profile.agent.version,
      thinking: profile.agent.thinking,
    },
  };
}

function assertAgent(actual, expected, expectedSkill, label) {
  const agent = requireObject(actual, label);
  assertValue(agent.name, expected.name, `${label}.name`);
  assertValue(agent.model_name, expected.model_name, `${label}.model_name`);
  assertValue(agent.n_concurrent ?? 1, 1, `${label}.n_concurrent`);
  assertValue(agent.kwargs?.version, expected.kwargs.version, `${label}.kwargs.version`);
  assertValue(agent.kwargs?.thinking, expected.kwargs.thinking, `${label}.kwargs.thinking`);
  equal(agent.skills, [expectedSkill], `${label}.skills`);
}

function assertMounts(actual, expected) {
  const mounts = requireArray(actual, "config.environment.mounts");
  if (mounts.length !== expected.length) {
    throw new Error("config.environment.mounts count drift");
  }
  for (const [index, expectedMount] of expected.entries()) {
    const mount = requireObject(mounts[index], `config.environment.mounts[${index}]`);
    for (const key of ["type", "source", "target", "read_only"]) {
      assertValue(mount[key], expectedMount[key], `config.environment.mounts[${index}].${key}`);
    }
  }
}

function normalizedObservedModel(agentInfo) {
  const model = requireObject(agentInfo.model_info, "trial.agent_info.model_info");
  return `${requireString(model.provider, "trial.agent_info.model_info.provider")}/${requireString(model.name, "trial.agent_info.model_info.name")}`;
}

function extractTokens(agentResult) {
  if (agentResult === null || agentResult === undefined) {
    return { input: null, cache: null, output: null };
  }
  const result = requireObject(agentResult, "trial.agent_result");
  return {
    input: requireFinite(result.n_input_tokens, "trial.agent_result.n_input_tokens", { nullable: true, integer: true }),
    cache: requireFinite(result.n_cache_tokens, "trial.agent_result.n_cache_tokens", { nullable: true, integer: true }),
    output: requireFinite(result.n_output_tokens, "trial.agent_result.n_output_tokens", { nullable: true, integer: true }),
  };
}

function selectedRewards(trial, profile) {
  const rewards = trial.verifier_result?.rewards;
  if (rewards === null || rewards === undefined) {
    return {
      primary: null,
      gates: Object.fromEntries(Object.keys(profile.requiredRewards).map((key) => [key, null])),
    };
  }
  requireObject(rewards, "trial.verifier_result.rewards");
  const primary = requireFinite(rewards[profile.rewardKey], `reward ${profile.rewardKey}`, { nullable: true });
  const gates = {};
  for (const key of Object.keys(profile.requiredRewards).sort()) {
    gates[key] = requireFinite(rewards[key], `required reward ${key}`, { nullable: true });
  }
  return { primary, gates };
}

function qualifies(record, profile) {
  return record.evaluable
    && record.metrics.primary !== null
    && record.metrics.primary >= profile.passThreshold
    && Object.entries(profile.requiredRewards).every(
      ([key, threshold]) => record.gates[key] !== null && record.gates[key] >= threshold,
    );
}

function expectedJobDirectory(runtimeRoot, config) {
  return path.join(runtimeRoot, "jobs", "q003", config.candidateId, config.jobName);
}

async function inspectJob({ runtimeRoot, preparedRoot, knowledgeRoot, protocol, receipt, candidate }) {
  const expectedConfig = buildHarborJobConfig({
    protocol,
    candidateId: candidate.candidateId,
    runtimeRoot,
    preparedRoot,
    knowledgeRoot,
  });
  const expected = {
    candidateId: candidate.candidateId,
    jobName: expectedConfig.job_name,
  };
  const jobDirectory = expectedJobDirectory(runtimeRoot, expected);
  await assertRealDirectory(jobDirectory, `Harbor job ${candidate.candidateId}`);
  const configPath = path.join(jobDirectory, "config.json");
  const lockPath = path.join(jobDirectory, "lock.json");
  const resultPath = path.join(jobDirectory, "result.json");
  const [config, lock, result] = await Promise.all([
    readJson(configPath),
    readJson(lockPath),
    readJson(resultPath),
  ]);

  assertValue(config.job_name, expectedConfig.job_name, `${candidate.candidateId} job_name`);
  assertValue(config.n_attempts ?? 1, 1, `${candidate.candidateId} n_attempts`);
  assertValue(config.n_concurrent_trials ?? 1, 1, `${candidate.candidateId} n_concurrent_trials`);
  assertValue(config.retry?.max_retries ?? 0, 0, `${candidate.candidateId} retry.max_retries`);
  assertValue(config.environment?.type, "docker", `${candidate.candidateId} environment.type`);
  assertMounts(config.environment?.mounts, expectedConfig.environment.mounts);
  const expectedSkill = expectedConfig.agents[0].skills[0];
  const expectedAgent = profileAgentExpected(protocol.frozenEvaluationProfile);
  const configAgents = requireArray(config.agents, `${candidate.candidateId} config.agents`);
  if (configAgents.length !== 1) {
    throw new Error(`${candidate.candidateId} must have exactly one configured agent`);
  }
  assertAgent(configAgents[0], expectedAgent, expectedSkill, `${candidate.candidateId} config.agent`);
  const datasets = requireArray(config.datasets, `${candidate.candidateId} config.datasets`);
  if (datasets.length !== 1) {
    throw new Error(`${candidate.candidateId} must have exactly one dataset`);
  }
  equal(datasets[0].task_names, ["q003"], `${candidate.candidateId} task_names`);
  assertValue(datasets[0].path, expectedConfig.datasets[0].path, `${candidate.candidateId} dataset path`);

  assertValue(lock.harbor?.version, protocol.frozenEvaluationProfile.harborVersion, `${candidate.candidateId} Harbor version`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `${candidate.candidateId} lock retry`);
  const lockedTrials = requireArray(lock.trials, `${candidate.candidateId} lock.trials`);
  if (lockedTrials.length !== 1) {
    throw new Error(`${candidate.candidateId} lock must plan exactly one q003 trial`);
  }
  const locked = lockedTrials[0];
  assertValue(locked.task?.name, "q003", `${candidate.candidateId} locked task name`);
  assertAgent(locked.agent, expectedAgent, expectedSkill, `${candidate.candidateId} locked agent`);
  const lockedSkills = requireArray(locked.skills, `${candidate.candidateId} locked skills`);
  if (lockedSkills.length !== 1) {
    throw new Error(`${candidate.candidateId} must lock exactly one skill`);
  }
  assertValue(lockedSkills[0].name, protocol.target.logicalName, `${candidate.candidateId} locked skill name`);
  assertValue(lockedSkills[0].source, expectedSkill, `${candidate.candidateId} locked skill source`);
  const lockedSkillDigest = requireString(lockedSkills[0].digest, `${candidate.candidateId} locked skill digest`);

  if (!result.finished_at) {
    throw new Error(`${candidate.candidateId} Harbor job is not finished`);
  }
  assertValue(result.n_total_trials, 1, `${candidate.candidateId} result trial count`);
  assertValue(result.stats?.n_retries ?? 0, 0, `${candidate.candidateId} result retries`);
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(jobDirectory, entry.name));
  if (trialDirectories.length !== 1) {
    throw new Error(`${candidate.candidateId} must contain exactly one trial directory`);
  }
  await assertRealDirectory(trialDirectories[0], `${candidate.candidateId} trial`);
  const trialPath = path.join(trialDirectories[0], "result.json");
  const trial = await readJson(trialPath);
  assertValue(trial.trial_name, path.basename(trialDirectories[0]), `${candidate.candidateId} trial name`);
  assertValue(trial.config?.trial_name, trial.trial_name, `${candidate.candidateId} trial config name`);
  assertValue(trial.config?.task?.path, `${expectedConfig.datasets[0].path}/q003`, `${candidate.candidateId} trial task path`);
  assertAgent(trial.config?.agent, expectedAgent, expectedSkill, `${candidate.candidateId} trial agent`);
  assertValue(trial.agent_info?.name, protocol.frozenEvaluationProfile.agent.name, `${candidate.candidateId} observed agent`);
  assertValue(trial.agent_info?.version, protocol.frozenEvaluationProfile.agent.version, `${candidate.candidateId} observed agent version`);
  assertValue(normalizedObservedModel(trial.agent_info), protocol.frozenEvaluationProfile.agent.model, `${candidate.candidateId} observed model`);
  const taskChecksum = requireString(trial.task_checksum, `${candidate.candidateId} task checksum`);
  const exception = trial.exception_info !== null && trial.exception_info !== undefined;
  const settled = Boolean(trial.finished_at);
  if (!settled) {
    throw new Error(`${candidate.candidateId} trial is not settled`);
  }
  const metrics = selectedRewards(trial, protocol.frozenEvaluationProfile);
  const tokens = extractTokens(trial.agent_result);
  const evaluable = !exception && metrics.primary !== null;
  const candidateReceipt = receipt.candidates.find((entry) => entry.candidateId === candidate.candidateId);
  if (!candidateReceipt) {
    throw new Error(`Receipt lacks candidate ${candidate.candidateId}`);
  }
  const record = {
    taskId: "q003",
    candidateId: candidate.candidateId,
    parentCandidateId: candidate.candidateId === "baseline" ? null : candidate.parentCandidateId,
    operatorId: candidate.candidateId === "baseline" ? null : candidate.operatorId,
    evaluable,
    qualified: false,
    status: exception ? "errored" : evaluable ? "evaluated" : "missing-primary-metric",
    metrics: { primary: metrics.primary },
    gates: metrics.gates,
    tokens,
    provenance: {
      candidateTreeSha256: candidateReceipt.treeSha256,
      profileSha256: receipt.frozenEvaluationProfileSha256,
      taskChecksum,
      jobName: expectedConfig.job_name,
      jobConfigSha256: await sha256File(configPath),
      jobLockSha256: await sha256File(lockPath),
      jobResultSha256: await sha256File(resultPath),
      trialResultSha256: await sha256File(trialPath),
      lockedSkillDigest,
      lockedSkillName: lockedSkills[0].name,
    },
  };
  record.qualified = qualifies(record, protocol.frozenEvaluationProfile);
  return record;
}

function requireComparable(records, expectedIds, taskIds, label) {
  const expectedKeys = expectedIds.flatMap((candidateId) => taskIds.map((taskId) => `${taskId}:${candidateId}`)).sort();
  const actualKeys = records.map((record) => `${record.taskId}:${record.candidateId}`).sort();
  equal(actualKeys, expectedKeys, `${label} record coverage`);
  if (records.some((record) => !record.evaluable)) {
    return { pass: false, reason: `${label}-contains-non-evaluable-record` };
  }
  return { pass: true };
}

function recordFor(records, taskId, candidateId) {
  return records.find((record) => record.taskId === taskId && record.candidateId === candidateId);
}

function effectiveFitness(record) {
  return record.qualified ? record.metrics.primary : 0;
}

export function evaluateStopGate({ protocol, stageId, records, priorPublication = null }) {
  if (stageId === "q003") {
    const childIds = protocol.target.children.map((child) => child.candidateId);
    const coverage = requireComparable(records, ["baseline", ...childIds], ["q003"], "q003");
    if (!coverage.pass) {
      return { status: "stopped", passed: false, reason: coverage.reason, nextStage: null, selectedCandidateId: null };
    }
    const baseline = recordFor(records, "q003", "baseline");
    const baselineFitness = effectiveFitness(baseline);
    const improved = childIds
      .map((candidateId) => recordFor(records, "q003", candidateId))
      .filter((record) => record.qualified && effectiveFitness(record) > baselineFitness)
      .sort((left, right) => effectiveFitness(right) - effectiveFitness(left) || left.candidateId.localeCompare(right.candidateId));
    if (improved.length === 0) {
      return { status: "stopped", passed: false, reason: "no-qualified-child-strictly-improves-hard-gated-q003-fitness", nextStage: null, selectedCandidateId: null };
    }
    return {
      status: "advance",
      passed: true,
      reason: "strict-hard-gated-q003-improvement-with-comparable-evidence",
      nextStage: "q007",
      selectedCandidateId: improved[0].candidateId,
    };
  }

  const priorGate = priorPublication?.gate;
  if (!priorGate?.passed || !priorGate.selectedCandidateId) {
    throw new Error(`${stageId} requires a passed prior publication with one selected child`);
  }
  const selected = priorGate.selectedCandidateId;
  if (stageId === "q007") {
    const coverage = requireComparable(records, ["baseline", selected], ["q007"], "q007");
    if (!coverage.pass) {
      return { status: "stopped", passed: false, reason: coverage.reason, nextStage: null, selectedCandidateId: selected };
    }
    const baseline = recordFor(records, "q007", "baseline");
    const child = recordFor(records, "q007", selected);
    if (!child.qualified) {
      return { status: "stopped", passed: false, reason: "selected-child-unqualified-q007", nextStage: null, selectedCandidateId: selected };
    }
    if (effectiveFitness(child) < effectiveFitness(baseline)) {
      return { status: "stopped", passed: false, reason: "selected-child-regresses-q007", nextStage: null, selectedCandidateId: selected };
    }
    return {
      status: "advance",
      passed: true,
      reason: "q007-validation-no-regression",
      nextStage: "remaining-smoke",
      selectedCandidateId: selected,
    };
  }
  if (stageId === "remaining-smoke") {
    const tasks = ["q018", "q024", "q030"];
    const coverage = requireComparable(records, ["baseline", selected], tasks, "remaining-smoke");
    if (!coverage.pass) {
      return { status: "stopped", passed: false, reason: coverage.reason, nextStage: null, selectedCandidateId: selected };
    }
    const selectedRecords = tasks.map((taskId) => recordFor(records, taskId, selected));
    if (selectedRecords.some((record) => !record.qualified)) {
      return { status: "stopped", passed: false, reason: "selected-child-unqualified-remaining-smoke", nextStage: null, selectedCandidateId: selected };
    }
    const gains = tasks.map((taskId) => (
      effectiveFitness(recordFor(records, taskId, selected))
      - effectiveFitness(recordFor(records, taskId, "baseline"))
    ));
    if (gains.some((gain) => gain < 0)) {
      return { status: "stopped", passed: false, reason: "selected-child-regresses-remaining-smoke", nextStage: null, selectedCandidateId: selected };
    }
    if (gains.reduce((sum, gain) => sum + gain, 0) <= 0) {
      return { status: "stopped", passed: false, reason: "no-strict-validation-gain", nextStage: null, selectedCandidateId: selected };
    }
    return {
      status: "complete-smoke",
      passed: true,
      reason: "validation-smoke-gain-without-regressions",
      nextStage: null,
      selectedCandidateId: selected,
    };
  }
  throw new Error(`Unsupported stop-gate stage: ${stageId}`);
}

function sumTokens(records) {
  const result = { input: 0, cache: 0, output: 0 };
  for (const record of records) {
    for (const key of Object.keys(result)) {
      if (record.tokens[key] !== null) {
        result[key] += record.tokens[key];
      }
    }
  }
  return result;
}

export function assertSanitizedPublication(publication) {
  const serialized = canonicalJson(publication).toLowerCase();
  for (const term of FORBIDDEN_PUBLIC_TERMS) {
    if (serialized.includes(term)) {
      throw new Error(`Sanitized publication contains forbidden term: ${term}`);
    }
  }
}

function renderMarkdown(publication) {
  const lines = [
    "# Meta-evolution q003 qualification",
    "",
    "This report contains only frozen metrics, required gates, token counts, and cryptographic provenance.",
    "It contains no model text or private evaluator material.",
    "",
    `Gate: **${publication.gate.status}** (${publication.gate.reason})`,
    "",
    "| Candidate | Evaluable | Qualified | Reward | Gates | Input / cache / output tokens |",
    "| --- | :---: | :---: | ---: | --- | ---: |",
  ];
  for (const record of publication.records) {
    const gates = Object.entries(record.gates).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ");
    lines.push(`| ${record.candidateId} | ${record.evaluable ? "yes" : "no"} | ${record.qualified ? "yes" : "no"} | ${record.metrics.primary ?? "null"} | ${gates} | ${record.tokens.input ?? "null"} / ${record.tokens.cache ?? "null"} / ${record.tokens.output ?? "null"} |`);
  }
  lines.push("", `Publication SHA-256: \`${publication.publicationSha256}\``, "");
  return lines.join("\n");
}

async function writePublicationAtomically(outputDirectory, publication) {
  if (await exists(outputDirectory)) {
    throw new Error(`Publication output already exists: ${outputDirectory}`);
  }
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

export async function publishQ003(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const verified = await verifyExperiment({
    outputRoot: runtimeRoot,
    protocolPath,
    sourceProtocolPath: options.sourceProtocolPath,
    knowledgeRoot,
    preparedStudyRoot: options.preparedStudyRoot,
  });
  const [protocol, receipt] = await Promise.all([
    readJson(protocolPath),
    readJson(path.join(runtimeRoot, "prepared", "receipt.json")),
  ]);
  const preparedRoot = path.join(runtimeRoot, "prepared");
  const candidates = [protocol.target.baseline, ...protocol.target.children];
  const records = [];
  for (const candidate of candidates) {
    records.push(await inspectJob({
      runtimeRoot,
      preparedRoot,
      knowledgeRoot,
      protocol,
      receipt,
      candidate,
    }));
  }
  if (new Set(records.map((record) => record.provenance.taskChecksum)).size !== 1) {
    throw new Error("q003 task checksum drift across candidates");
  }
  if (new Set(records.map((record) => record.provenance.candidateTreeSha256)).size !== 3) {
    throw new Error("Baseline and both children must remain distinct");
  }
  const gate = evaluateStopGate({ protocol, stageId: "q003", records });
  const body = {
    schemaVersion: 1,
    experimentId: protocol.experimentId,
    generationId: protocol.generationId,
    evidenceLayer: "live-q003-development-qualification",
    taskId: "q003",
    profile: {
      sha256: receipt.frozenEvaluationProfileSha256,
      harborVersion: protocol.frozenEvaluationProfile.harborVersion,
      agent: protocol.frozenEvaluationProfile.agent.name,
      agentVersion: protocol.frozenEvaluationProfile.agent.version,
      model: protocol.frozenEvaluationProfile.agent.model,
      thinking: protocol.frozenEvaluationProfile.agent.thinking,
      attempts: 1,
      retries: 0,
    },
    thresholds: {
      primaryMetric: protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: protocol.frozenEvaluationProfile.passThreshold,
      requiredGates: protocol.frozenEvaluationProfile.requiredRewards,
    },
    records,
    tokenTotals: sumTokens(records),
    gate,
    provenance: {
      preparationReceiptSha256: await sha256File(path.join(preparedRoot, "receipt.json")),
      metaProtocolSha256: receipt.metaProtocolSha256,
      taskTreeSha256: receipt.preparationTask.treeSha256,
    },
  };
  const publication = { ...body, publicationSha256: objectDigest(body) };
  assertSanitizedPublication(publication);
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(runtimeRoot, "publications", "q003"));
  await writePublicationAtomically(outputDirectory, publication);
  return { publication, outputDirectory, verified: verified.mode };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--runtime", "--output", "--protocol", "--source-protocol", "--knowledge-root", "--prepared-study"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    if (!value) {
      throw new Error(`Missing value for ${flag}`);
    }
    index += 1;
    options[{
      "--runtime": "runtimeRoot",
      "--output": "outputDirectory",
      "--protocol": "protocolPath",
      "--source-protocol": "sourceProtocolPath",
      "--knowledge-root": "knowledgeRoot",
      "--prepared-study": "preparedStudyRoot",
    }[flag]] = value;
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} q003 [options]\n\nThe publisher reads completed native Harbor jobs but emits only metrics, gates, tokens, and cryptographic provenance.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  if (command !== "q003") {
    throw new Error(`Unknown command: ${command}`);
  }
  const result = await publishQ003(options);
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
