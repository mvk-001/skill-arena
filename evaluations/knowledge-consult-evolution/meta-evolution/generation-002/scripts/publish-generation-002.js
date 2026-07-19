#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSanitizedPublication,
  evaluateStopGate,
} from "../../scripts/publish-meta-evolution.js";
import {
  buildChildHarborConfig,
  sha256File,
  verifyGeneration002,
} from "./prepare-generation-002.js";
import {
  canonicalJson,
  objectDigest,
} from "../../scripts/prepare-meta-evolution.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const META_ROOT = path.resolve(GENERATION_ROOT, "..");
const STUDY_ROOT = path.resolve(META_ROOT, "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-002",
);
const DEFAULT_GENERATION_001_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-001",
);

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

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
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

function expectedAgent(profile) {
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

function normalizedModel(agentInfo) {
  const model = requireObject(agentInfo?.model_info, "trial.agent_info.model_info");
  return `${requireString(model.provider, "model provider")}/${requireString(model.name, "model name")}`;
}

function selectedMetrics(trial, profile) {
  const rewards = trial.verifier_result?.rewards;
  if (rewards === null || rewards === undefined) {
    return {
      primary: null,
      gates: Object.fromEntries(Object.keys(profile.requiredRewards).sort().map((key) => [key, null])),
    };
  }
  requireObject(rewards, "trial verifier rewards");
  return {
    primary: requireFinite(rewards[profile.rewardKey], `reward ${profile.rewardKey}`, { nullable: true }),
    gates: Object.fromEntries(Object.keys(profile.requiredRewards).sort().map((key) => [
      key,
      requireFinite(rewards[key], `required reward ${key}`, { nullable: true }),
    ])),
  };
}

function selectedTokens(agentResult) {
  if (agentResult === null || agentResult === undefined) {
    return { input: null, cache: null, output: null };
  }
  const result = requireObject(agentResult, "trial agent result");
  return {
    input: requireFinite(result.n_input_tokens, "input tokens", { nullable: true, integer: true }),
    cache: requireFinite(result.n_cache_tokens, "cache tokens", { nullable: true, integer: true }),
    output: requireFinite(result.n_output_tokens, "output tokens", { nullable: true, integer: true }),
  };
}

function qualifies(record, profile) {
  return record.evaluable
    && record.metrics.primary !== null
    && record.metrics.primary >= profile.passThreshold
    && Object.entries(profile.requiredRewards).every(
      ([key, threshold]) => record.gates[key] === threshold,
    );
}

export async function inspectChildJob({ protocol, receipt, runtimeRoot, preparedRoot, knowledgeRoot, generation001RuntimeRoot, child, parentRecord }) {
  const expectedConfig = buildChildHarborConfig({
    protocol,
    candidateId: child.candidateId,
    runtimeRoot,
    preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot,
  });
  const jobDirectory = path.join(
    runtimeRoot,
    "jobs",
    "q003",
    child.candidateId,
    expectedConfig.job_name,
  );
  await assertOrdinaryDirectory(jobDirectory, `${child.candidateId} Harbor job`);
  const configPath = path.join(jobDirectory, "config.json");
  const lockPath = path.join(jobDirectory, "lock.json");
  const jobResultPath = path.join(jobDirectory, "result.json");
  const [config, lock, jobResult] = await Promise.all([
    readJson(configPath),
    readJson(lockPath),
    readJson(jobResultPath),
  ]);
  assertValue(config.job_name, expectedConfig.job_name, `${child.candidateId} job name`);
  assertValue(config.n_attempts ?? 1, 1, `${child.candidateId} attempts`);
  assertValue(config.n_concurrent_trials ?? 1, 1, `${child.candidateId} concurrency`);
  assertValue(config.retry?.max_retries ?? 0, 0, `${child.candidateId} retries`);
  assertValue(config.environment?.type, "docker", `${child.candidateId} environment`);
  const mounts = requireArray(config.environment?.mounts, `${child.candidateId} mounts`);
  if (mounts.length !== 2) {
    throw new Error(`${child.candidateId} must have exactly two mounts`);
  }
  for (const [index, expectedMount] of expectedConfig.environment.mounts.entries()) {
    for (const key of ["type", "source", "target", "read_only"]) {
      assertValue(mounts[index][key], expectedMount[key], `${child.candidateId} mount ${index} ${key}`);
    }
  }
  const expectedAgentShape = expectedAgent(protocol.frozenEvaluationProfile);
  const expectedSkill = expectedConfig.agents[0].skills[0];
  const configAgents = requireArray(config.agents, `${child.candidateId} configured agents`);
  if (configAgents.length !== 1) {
    throw new Error(`${child.candidateId} must configure exactly one agent`);
  }
  assertAgent(configAgents[0], expectedAgentShape, expectedSkill, `${child.candidateId} configured agent`);
  const datasets = requireArray(config.datasets, `${child.candidateId} datasets`);
  if (datasets.length !== 1) {
    throw new Error(`${child.candidateId} must configure exactly one dataset`);
  }
  equal(datasets[0].task_names, ["q003"], `${child.candidateId} task selection`);
  assertValue(datasets[0].path, expectedConfig.datasets[0].path, `${child.candidateId} task source`);

  assertValue(lock.harbor?.version, protocol.frozenEvaluationProfile.harborVersion, `${child.candidateId} Harbor lock`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `${child.candidateId} retry lock`);
  const lockedTrials = requireArray(lock.trials, `${child.candidateId} locked trials`);
  if (lockedTrials.length !== 1) {
    throw new Error(`${child.candidateId} must lock exactly one trial`);
  }
  const locked = lockedTrials[0];
  assertValue(locked.task?.name, "q003", `${child.candidateId} locked task`);
  assertAgent(locked.agent, expectedAgentShape, expectedSkill, `${child.candidateId} locked agent`);
  const lockedSkills = requireArray(locked.skills, `${child.candidateId} locked skills`);
  if (lockedSkills.length !== 1) {
    throw new Error(`${child.candidateId} must lock exactly one skill`);
  }
  assertValue(lockedSkills[0].name, protocol.target.logicalName, `${child.candidateId} locked skill name`);
  assertValue(lockedSkills[0].source, expectedSkill, `${child.candidateId} locked skill source`);
  const lockedSkillDigest = requireString(lockedSkills[0].digest, `${child.candidateId} locked skill digest`);

  if (!jobResult.finished_at) {
    throw new Error(`${child.candidateId} Harbor job is incomplete`);
  }
  assertValue(jobResult.n_total_trials, 1, `${child.candidateId} completed trials`);
  assertValue(jobResult.stats?.n_retries ?? 0, 0, `${child.candidateId} completed retries`);
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (trialDirectories.length !== 1) {
    throw new Error(`${child.candidateId} must contain exactly one trial directory`);
  }
  const trialPath = path.join(jobDirectory, trialDirectories[0].name, "result.json");
  const trial = await readJson(trialPath);
  assertValue(trial.trial_name, trialDirectories[0].name, `${child.candidateId} trial name`);
  assertValue(trial.config?.trial_name, trial.trial_name, `${child.candidateId} trial config name`);
  assertValue(trial.config?.task?.path, `${expectedConfig.datasets[0].path}/q003`, `${child.candidateId} trial task source`);
  assertAgent(trial.config?.agent, expectedAgentShape, expectedSkill, `${child.candidateId} trial agent`);
  assertValue(trial.agent_info?.name, protocol.frozenEvaluationProfile.agent.name, `${child.candidateId} observed agent`);
  assertValue(trial.agent_info?.version, protocol.frozenEvaluationProfile.agent.version, `${child.candidateId} observed version`);
  assertValue(normalizedModel(trial.agent_info), protocol.frozenEvaluationProfile.agent.model, `${child.candidateId} observed model`);
  assertValue(trial.task_checksum, parentRecord.provenance.taskChecksum, `${child.candidateId} q003 checksum`);
  const metrics = selectedMetrics(trial, protocol.frozenEvaluationProfile);
  const exception = trial.exception_info !== null && trial.exception_info !== undefined;
  const candidateReceipt = requireArray(receipt.candidates, "prepared candidates")
    .find((candidate) => candidate.candidateId === child.candidateId);
  if (!candidateReceipt) {
    throw new Error(`Prepared receipt lacks ${child.candidateId}`);
  }
  const record = {
    taskId: "q003",
    candidateId: child.candidateId,
    parentCandidateId: "00-baseline",
    operatorId: child.operatorId,
    evaluable: !exception && metrics.primary !== null,
    qualified: false,
    status: exception ? "errored" : metrics.primary === null ? "missing-primary-metric" : "evaluated",
    metrics: { primary: metrics.primary },
    gates: metrics.gates,
    tokens: selectedTokens(trial.agent_result),
    provenance: {
      candidateTreeSha256: candidateReceipt.treeSha256,
      profileSha256: receipt.frozenEvaluationProfileSha256,
      taskChecksum: trial.task_checksum,
      jobName: expectedConfig.job_name,
      jobConfigSha256: await sha256File(configPath),
      jobLockSha256: await sha256File(lockPath),
      jobResultSha256: await sha256File(jobResultPath),
      trialResultSha256: await sha256File(trialPath),
      lockedSkillDigest,
      lockedSkillName: lockedSkills[0].name,
    },
  };
  record.qualified = qualifies(record, protocol.frozenEvaluationProfile);
  return record;
}

function sumTokens(records) {
  const total = { input: 0, cache: 0, output: 0 };
  for (const record of records) {
    for (const key of Object.keys(total)) {
      if (record.tokens[key] !== null) {
        total[key] += record.tokens[key];
      }
    }
  }
  return total;
}

function renderMarkdown(publication) {
  const lines = [
    "# Generation 002 q003 development result",
    "",
    "The exact generation-001 baseline record is reused; only the two generation-002 children incurred fresh development trials.",
    "",
    `Gate: **${publication.gate.status}** (${publication.gate.reason})`,
    "",
    "| Candidate | Evidence | Evaluable | Qualified | Reward | Required gates | Input / cache / output tokens |",
    "| --- | --- | :---: | :---: | ---: | --- | ---: |",
  ];
  for (const record of publication.records) {
    const gates = Object.entries(record.gates).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ");
    lines.push(`| ${record.candidateId} | ${record.candidateId === "baseline" ? "reused generation-001" : "fresh generation-002"} | ${record.evaluable ? "yes" : "no"} | ${record.qualified ? "yes" : "no"} | ${record.metrics.primary ?? "null"} | ${gates} | ${record.tokens.input ?? "null"} / ${record.tokens.cache ?? "null"} / ${record.tokens.output ?? "null"} |`);
  }
  lines.push("", `Publication SHA-256: \`${publication.publicationSha256}\``, "");
  return lines.join("\n");
}

async function writePublication(outputDirectory, publication) {
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

export async function publishGeneration002(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const verifyOptions = {
    ...options,
    outputRoot: runtimeRoot,
    protocolPath,
    generation001RuntimeRoot,
  };
  await verifyGeneration002(verifyOptions);
  const [protocol, receipt, parentRecord] = await Promise.all([
    readJson(protocolPath),
    readJson(path.join(runtimeRoot, "prepared", "receipt.json")),
    readJson(path.join(runtimeRoot, "prepared", "parent-evidence", "baseline-record.json")),
  ]);
  const preparedRoot = path.join(runtimeRoot, "prepared");
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const records = [parentRecord];
  for (const child of protocol.target.children) {
    records.push(await inspectChildJob({
      protocol,
      receipt,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot,
      generation001RuntimeRoot,
      child,
      parentRecord,
    }));
  }
  if (new Set(records.map((record) => record.provenance.taskChecksum)).size !== 1) {
    throw new Error("q003 checksum drift between reused parent and generation-002 children");
  }
  if (new Set(records.map((record) => record.provenance.candidateTreeSha256)).size !== 3) {
    throw new Error("Parent and generation-002 children must remain byte-distinct");
  }
  if (new Set(records.map((record) => record.provenance.lockedSkillDigest)).size !== 3) {
    throw new Error("Parent and generation-002 children must lock three distinct skill digests");
  }
  const gate = evaluateStopGate({ protocol, stageId: "q003", records });
  const body = {
    schemaVersion: 1,
    experimentId: protocol.experimentId,
    generationId: "generation-002",
    evidenceLayer: "live-q003-development-with-reused-parent",
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
    callAccounting: {
      generation001CompletedModelCalls: 3,
      externalBaselineRemediationModelCalls: 0,
      generation002CompletedChildTrials: 2,
      generation002DevelopmentMaximumModelCalls: 2,
      cumulativeDevelopmentMaximumModelCalls: 5,
      subsequentValidationPermitted: gate.passed,
    },
    provenance: {
      preparationReceiptSha256: await sha256File(path.join(preparedRoot, "receipt.json")),
      metaProtocolSha256: receipt.metaProtocolSha256,
      q003TaskTreeSha256: receipt.q003Task.treeSha256,
      reusedParentPublicationFileSha256: receipt.parentEvidence.publicationFileSha256,
      reusedParentPublicationSha256: receipt.parentEvidence.publicationSha256,
      reusedParentPreparationReceiptSha256: receipt.parentEvidence.preparationReceiptSha256,
      externalRemediationReceiptSha256: receipt.parentEvidence.externalRemediationReceiptSha256,
    },
  };
  const publication = { ...body, publicationSha256: objectDigest(body) };
  assertSanitizedPublication(publication);
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(runtimeRoot, "publications", "q003"));
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
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} q003 [options]\n\nPublication performs no Harbor or model calls and emits only metrics, gates, tokens, and cryptographic provenance.\n`;
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
  const result = await publishGeneration002(options);
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
