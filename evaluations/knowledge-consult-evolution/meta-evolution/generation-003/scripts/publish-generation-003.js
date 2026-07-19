#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSanitizedPublication } from "../../scripts/publish-meta-evolution.js";
import { canonicalJson, objectDigest } from "../../scripts/prepare-meta-evolution.js";
import {
  analysisPreparedRoot,
  buildChildHarborConfig,
  buildDevelopmentOperatorConfig,
  buildGeneration003HarborConfig,
  legacyPreparedRoot,
  sha256File,
  verifyGeneration003,
} from "./prepare-generation-003.js";
import { resolveContrastEffectiveEvidence } from "./evidence-resolution.js";

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
  "generation-003",
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
    if (error.code === "ENOENT") return false;
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
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireFinite(value, label, { nullable = false, integer = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < 0) {
    throw new Error(`${label} must be ${nullable ? "null or " : ""}a non-negative finite ${integer ? "integer" : "number"}`);
  }
  return value;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} drift`);
}

function assertInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if ((!allowRoot && relative === "") || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the generation-003 runtime`);
  }
  return resolved;
}

async function verifyPrivateAuthenticationSeal({ protocol, runtimeRoot, preparedRoot }) {
  assertValue(protocol.privateAuthenticationSeal.schemaVersion, 1, "private authentication policy schema");
  assertValue(protocol.privateAuthenticationSeal.requiredBeforeContrastRetry, true, "contrast retry authentication policy");
  assertValue(protocol.privateAuthenticationSeal.requiredBeforeFreshBaseline, true, "fresh baseline authentication policy");
  const sealPath = path.join(runtimeRoot, ...protocol.privateAuthenticationSeal.path.split("/"));
  const sealStat = await fs.lstat(sealPath);
  if (sealStat.isSymbolicLink() || !sealStat.isFile()) {
    throw new Error("Private authentication seal must be an ordinary file");
  }
  const seal = await readJson(sealPath);
  const { sealSha256, ...body } = seal;
  assertValue(sealSha256, objectDigest(body), "private authentication seal digest");
  assertValue(body.schemaVersion, 1, "private authentication seal schema");
  assertValue(body.kind, "generation-003-private-auth-payload-seal", "private authentication seal kind");
  assertValue(body.mount?.source, protocol.harbor.authenticationMount.source, "private authentication mount source");
  assertValue(body.mount?.target, protocol.privateAuthenticationSeal.mountTarget, "private authentication mount target");
  equal(body.mount?.projectedEntries, ["auth.json"], "private authentication projected entries");
  assertValue(body.publicationPolicy?.publishPayloadDigest, false, "private authentication payload policy");
  assertValue(body.publicationPolicy?.publishCredentialMetadata, false, "private authentication metadata policy");
  if (!/^[a-f0-9]{64}$/.test(body.payload?.sha256 ?? "") || body.payload?.byteLength < 1) {
    throw new Error("Private authentication seal lacks a valid internal payload binding");
  }
  assertValue(
    body.executionBinding?.childWrapperSha256,
    await sha256File(await assertOrdinaryFile(
      await exists(path.join(legacyPreparedRoot(runtimeRoot), "run-q003-clean-pi.sh"))
        ? path.join(legacyPreparedRoot(runtimeRoot), "run-q003-clean-pi.sh")
        : path.join(preparedRoot, "evidence", "run-q003-clean-pi.sh.disabled"),
      "private authentication child wrapper",
    )),
    "private authentication child wrapper binding",
  );
  const bindings = requireArray(body.executionBinding?.preservedOriginalJobs, "private authentication original job bindings");
  equal(bindings.map((binding) => binding.candidateId), protocol.target.children.map((child) => child.candidateId), "private authentication candidate coverage");
  for (const binding of bindings) {
    const jobName = `${protocol.harbor.jobNamePrefix}-q003-${binding.candidateId}`;
    const jobDirectory = path.join(runtimeRoot, "jobs", "q003", binding.candidateId, jobName);
    assertValue(
      binding.jobDirectorySha256,
      createHash("sha256").update(path.resolve(jobDirectory), "utf8").digest("hex"),
      `${binding.candidateId} private auth job binding`,
    );
    for (const [field, file] of [["configSha256", "config.json"], ["lockSha256", "lock.json"], ["resultSha256", "result.json"]]) {
      assertValue(
        binding[field],
        await sha256File(await assertOrdinaryFile(path.join(jobDirectory, file), `${binding.candidateId} sealed ${file}`)),
        `${binding.candidateId} private auth ${field}`,
      );
    }
  }
  return { sealFileSha256: await sha256File(sealPath) };
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

async function assertOrdinaryFile(filePath, label) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be an ordinary file: ${filePath}`);
  }
  return filePath;
}

const OMITTABLE_HARBOR_DEFAULT_PATHS = [
  /^n_attempts$/,
  /^install_only$/,
  /^timeout_multiplier$/,
  /^debug$/,
  /^quiet$/,
  /^retry$/,
  /^verifier$/,
  /^metrics$/,
  /^tasks$/,
  /^artifacts$/,
  /^extra_instruction_paths$/,
  /^environment\.(?:force_build|delete|cpu_enforcement_policy|memory_enforcement_policy|extra_docker_compose|kwargs|extra_allowed_hosts)$/,
  /^agents\.\d+\.(?:extra_allowed_hosts|mcp_servers)$/,
  /^datasets\.\d+\.overwrite$/,
];

function omittedHarborDefaultAllowed(fieldPath) {
  return OMITTABLE_HARBOR_DEFAULT_PATHS.some((pattern) => pattern.test(fieldPath));
}

function hydrateAndVerifyConfig(actual, expected, fieldPath = "") {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`Harbor config array drift at ${fieldPath}`);
    }
    return expected.map((item, index) => hydrateAndVerifyConfig(actual[index], item, `${fieldPath}.${index}`.replace(/^\./, "")));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      throw new Error(`Harbor config object drift at ${fieldPath}`);
    }
    for (const key of Object.keys(actual)) {
      if (!(key in expected)) throw new Error(`Unknown Harbor config field at ${fieldPath ? `${fieldPath}.` : ""}${key}`);
    }
    const hydrated = {};
    for (const [key, expectedValue] of Object.entries(expected)) {
      const childPath = `${fieldPath ? `${fieldPath}.` : ""}${key}`;
      if (!(key in actual)) {
        if (!omittedHarborDefaultAllowed(childPath)) throw new Error(`Required Harbor config field missing at ${childPath}`);
        hydrated[key] = structuredClone(expectedValue);
      } else {
        hydrated[key] = hydrateAndVerifyConfig(actual[key], expectedValue, childPath);
      }
    }
    return hydrated;
  }
  if (actual !== expected) throw new Error(`Harbor config value drift at ${fieldPath}`);
  return actual;
}

export function canonicalGeneration003EvaluationProfile(actual, expected) {
  const value = hydrateAndVerifyConfig(actual, expected);
  value.job_name = "<job>";
  value.jobs_dir = "<jobs>";
  value.quiet = false;
  value.tasks = [];
  value.datasets = [];
  for (const agent of value.agents) agent.skills = ["<candidate-skill>"];
  for (const key of ["include_exceptions", "exclude_exceptions"]) {
    if (Array.isArray(value.retry?.[key])) value.retry[key].sort();
  }
  return value;
}

export function canonicalGeneration003Lock(rawLock) {
  const value = structuredClone(requireObject(rawLock, "Harbor lock"));
  delete value.created_at;
  for (const key of ["include_exceptions", "exclude_exceptions"]) {
    if (Array.isArray(value.retry?.[key])) value.retry[key].sort();
  }
  const trials = requireArray(value.trials, "Harbor lock trials");
  for (const trial of trials) {
    delete trial.skills;
    if (trial.agent && typeof trial.agent === "object") delete trial.agent.skills;
  }
  value.trials = trials.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  return value;
}

function expectedAgent(profile) {
  return {
    name: profile.agent.name,
    model_name: profile.agent.model,
    n_concurrent: 1,
    kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
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
  if (agentResult === null || agentResult === undefined) return { input: null, cache: null, output: null };
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
      ([key, threshold]) => record.gates[key] !== null && record.gates[key] >= threshold,
    );
}

export async function inspectGeneration003Job({
  protocol,
  receipt,
  runtimeRoot,
  preparedRoot,
  knowledgeRoot,
  generation001RuntimeRoot,
  candidateId,
  jobDirectory: selectedJobDirectory,
  taskChecksum,
  resumeProvenance = null,
}) {
  const child = protocol.target.children.find((item) => item.candidateId === candidateId) ?? null;
  if (candidateId !== "baseline" && child === null) throw new Error(`Unknown generation-003 candidate ${candidateId}`);
  const expectedConfig = buildGeneration003HarborConfig({
    protocol,
    candidateId,
    runtimeRoot,
    preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot,
  });
  const jobDirectory = path.resolve(selectedJobDirectory);
  await assertOrdinaryDirectory(jobDirectory, `${candidateId} Harbor job`);
  const configPath = path.join(jobDirectory, "config.json");
  const lockPath = path.join(jobDirectory, "lock.json");
  const jobResultPath = path.join(jobDirectory, "result.json");
  await Promise.all([
    assertOrdinaryFile(configPath, `${candidateId} Harbor config`),
    assertOrdinaryFile(lockPath, `${candidateId} Harbor lock`),
    assertOrdinaryFile(jobResultPath, `${candidateId} Harbor result`),
  ]);
  const [config, lock, jobResult] = await Promise.all([
    readJson(configPath), readJson(lockPath), readJson(jobResultPath),
  ]);
  const comparisonProfile = canonicalGeneration003EvaluationProfile(config, expectedConfig);
  assertValue(config.job_name, expectedConfig.job_name, `${candidateId} job name`);
  assertValue(config.n_attempts ?? 1, 1, `${candidateId} attempts`);
  assertValue(config.n_concurrent_trials ?? 1, 1, `${candidateId} concurrency`);
  assertValue(config.retry?.max_retries ?? 0, 0, `${candidateId} retries`);
  const mounts = requireArray(config.environment?.mounts, `${candidateId} mounts`);
  if (mounts.length !== 2) throw new Error(`${candidateId} must have exactly two mounts`);
  for (const [index, expectedMount] of expectedConfig.environment.mounts.entries()) {
    for (const key of ["type", "source", "target", "read_only"]) {
      assertValue(mounts[index][key], expectedMount[key], `${candidateId} mount ${index} ${key}`);
    }
  }
  const agentShape = expectedAgent(protocol.frozenEvaluationProfile);
  const expectedSkill = expectedConfig.agents[0].skills[0];
  const configAgents = requireArray(config.agents, `${candidateId} configured agents`);
  if (configAgents.length !== 1) throw new Error(`${candidateId} must configure one agent`);
  assertAgent(configAgents[0], agentShape, expectedSkill, `${candidateId} configured agent`);
  const datasets = requireArray(config.datasets, `${candidateId} datasets`);
  if (datasets.length !== 1) throw new Error(`${candidateId} must configure one dataset`);
  equal(datasets[0].task_names, ["q003"], `${candidateId} task selection`);
  assertValue(datasets[0].path, expectedConfig.datasets[0].path, `${candidateId} task source`);

  assertValue(lock.harbor?.version, protocol.frozenEvaluationProfile.harborVersion, `${candidateId} Harbor lock`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `${candidateId} retry lock`);
  const lockedTrials = requireArray(lock.trials, `${candidateId} locked trials`);
  if (lockedTrials.length !== 1) throw new Error(`${candidateId} must lock one trial`);
  const locked = lockedTrials[0];
  assertValue(locked.task?.name, "q003", `${candidateId} locked task`);
  assertAgent(locked.agent, agentShape, expectedSkill, `${candidateId} locked agent`);
  const lockedSkills = requireArray(locked.skills, `${candidateId} locked skills`);
  if (lockedSkills.length !== 1) throw new Error(`${candidateId} must lock one skill`);
  assertValue(lockedSkills[0].name, protocol.target.logicalName, `${candidateId} locked skill name`);
  assertValue(lockedSkills[0].source, expectedSkill, `${candidateId} locked skill source`);
  const lockedSkillDigest = requireString(lockedSkills[0].digest, `${candidateId} locked skill digest`);
  const comparisonLock = canonicalGeneration003Lock(lock);

  if (!jobResult.finished_at) throw new Error(`${candidateId} Harbor job is incomplete`);
  assertValue(jobResult.n_total_trials, 1, `${candidateId} completed trials`);
  assertValue(jobResult.stats?.n_retries ?? 0, 0, `${candidateId} completed retries`);
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (trialDirectories.length !== 1) throw new Error(`${candidateId} must contain one trial directory`);
  if (trialDirectories[0].isSymbolicLink()) throw new Error(`${candidateId} trial directory cannot be a link`);
  const trialPath = path.join(jobDirectory, trialDirectories[0].name, "result.json");
  await assertOrdinaryDirectory(path.dirname(trialPath), `${candidateId} trial directory`);
  await assertOrdinaryFile(trialPath, `${candidateId} trial result`);
  const trial = await readJson(trialPath);
  assertValue(trial.trial_name, trialDirectories[0].name, `${candidateId} trial name`);
  assertValue(trial.config?.trial_name, trial.trial_name, `${candidateId} trial config name`);
  assertValue(trial.config?.task?.path, `${expectedConfig.datasets[0].path}/q003`, `${candidateId} trial task source`);
  assertAgent(trial.config?.agent, agentShape, expectedSkill, `${candidateId} trial agent`);
  equal(trial.config?.environment, locked.environment, `${candidateId} trial/lock environment`);
  equal(trial.config?.verifier, locked.verifier, `${candidateId} trial/lock verifier`);
  assertValue(trial.agent_info?.name, protocol.frozenEvaluationProfile.agent.name, `${candidateId} observed agent`);
  assertValue(trial.agent_info?.version, protocol.frozenEvaluationProfile.agent.version, `${candidateId} observed version`);
  assertValue(normalizedModel(trial.agent_info), protocol.frozenEvaluationProfile.agent.model, `${candidateId} observed model`);
  if (taskChecksum !== undefined && taskChecksum !== null) {
    assertValue(trial.task_checksum, taskChecksum, `${candidateId} q003 checksum`);
  }
  const metrics = selectedMetrics(trial, protocol.frozenEvaluationProfile);
  const exception = trial.exception_info !== null && trial.exception_info !== undefined;
  const candidateReceipt = requireArray(receipt.candidates, "prepared candidates")
    .find((candidate) => candidate.candidateId === candidateId);
  if (!candidateReceipt) throw new Error(`Prepared receipt lacks ${candidateId}`);
  const record = {
    taskId: "q003",
    candidateId,
    parentCandidateId: candidateId === "baseline" ? null : "00-baseline",
    operatorId: candidateId === "baseline" ? null : child.operatorId,
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
      evidenceMode: protocol.effectiveEvidence[candidateId].mode,
      resumeManifestFileSha256: resumeProvenance?.resumeManifestFileSha256 ?? null,
      effectiveJobDigest: resumeProvenance?.effectiveJobDigest ?? null,
    },
  };
  record.qualified = qualifies(record, protocol.frozenEvaluationProfile);
  return {
    record,
    comparison: {
      evaluationProfile: comparisonProfile,
      lock: comparisonLock,
      evaluationProfileSha256: objectDigest(comparisonProfile),
      lockSha256: objectDigest(comparisonLock),
    },
    jobDirectory,
    trialName: trial.trial_name,
  };
}

export async function inspectChildJob(options) {
  const expectedConfig = buildChildHarborConfig({
    protocol: options.protocol,
    candidateId: options.child.candidateId,
    runtimeRoot: options.runtimeRoot,
    preparedRoot: options.preparedRoot,
    knowledgeRoot: options.knowledgeRoot,
    generation001RuntimeRoot: options.generation001RuntimeRoot,
  });
  const inspected = await inspectGeneration003Job({
    ...options,
    candidateId: options.child.candidateId,
    jobDirectory: path.join(options.runtimeRoot, "jobs", "q003", options.child.candidateId, expectedConfig.job_name),
    taskChecksum: options.parentRecord?.provenance?.taskChecksum,
  });
  return inspected.record;
}

function effectiveFitness(record) {
  return record.qualified ? record.metrics.primary : 0;
}

export function evaluateDevelopmentGate({ protocol, records }) {
  const expected = ["baseline", ...protocol.target.children.map((child) => child.candidateId)].sort();
  const actual = records.filter((record) => record.taskId === "q003").map((record) => record.candidateId).sort();
  equal(actual, expected, "q003 comparable record coverage");
  if (records.some((record) => !record.evaluable)) {
    return { status: "stopped", passed: false, reason: "q003-contains-non-evaluable-record", nextStage: null, selectedCandidateId: null };
  }
  const baseline = records.find((record) => record.candidateId === "baseline");
  const improved = records
    .filter((record) => record.candidateId !== "baseline")
    .filter((record) => record.qualified && effectiveFitness(record) > effectiveFitness(baseline))
    .sort((left, right) => effectiveFitness(right) - effectiveFitness(left) || left.candidateId.localeCompare(right.candidateId));
  if (improved.length === 0) {
    return { status: "stopped", passed: false, reason: "no-qualified-child-strictly-improves-hard-gated-q003-fitness", nextStage: null, selectedCandidateId: null };
  }
  return {
    status: "advance",
    passed: true,
    reason: "strict-hard-gated-q003-improvement-with-exact-native-generation-003-cohort",
    nextStage: "separately-sealed-validation",
    selectedCandidateId: improved[0].candidateId,
  };
}

function sumTokens(records) {
  const total = { input: 0, cache: 0, output: 0 };
  for (const record of records) {
    for (const key of Object.keys(total)) if (record.tokens[key] !== null) total[key] += record.tokens[key];
  }
  return total;
}

export function validateExactNativeGeneration003Comparisons(inspections) {
  if (!Array.isArray(inspections) || inspections.length !== 3) {
    throw new Error("Exact generation-003 comparison requires baseline plus exactly two children");
  }
  const reference = inspections[0];
  for (const inspected of inspections.slice(1)) {
    equal(
      inspected.comparison.evaluationProfile,
      reference.comparison.evaluationProfile,
      `native generation-003 evaluation profile ${inspected.record.candidateId}`,
    );
    equal(
      inspected.comparison.lock,
      reference.comparison.lock,
      `native generation-003 development lock ${inspected.record.candidateId}`,
    );
  }
  return {
    schemaVersion: 1,
    mode: "exact-native-harbor-profile-and-lock",
    cohortGeneration: "generation-003",
    candidateCount: 3,
    evaluationProfileSha256: reference.comparison.evaluationProfileSha256,
    developmentLockSha256: reference.comparison.lockSha256,
    normalizedMountSources: 0,
  };
}

function publicRecordsAndGate(records, gate, protocol) {
  const candidateIds = new Map(
    protocol.target.children.map((child, index) => [child.candidateId, `child-${String(index + 1).padStart(3, "0")}`]),
  );
  const replaceCandidateIds = (value) => {
    let text = value;
    for (const [candidateId, publicId] of candidateIds) text = text.replaceAll(candidateId, publicId);
    return text;
  };
  const publicRecords = records.map((record) => ({
    taskId: record.taskId,
    candidateId: candidateIds.get(record.candidateId) ?? "baseline",
    parentCandidateId: record.parentCandidateId === null ? null : "baseline",
    operatorId: record.operatorId === null ? null : "operator-001",
    evaluable: record.evaluable,
    qualified: record.qualified,
    status: record.status,
    metrics: { primary: record.metrics.primary },
    gates: Object.fromEntries(Object.entries(record.gates).sort()),
    tokens: {
      input: record.tokens.input,
      cache: record.tokens.cache,
      output: record.tokens.output,
    },
    provenance: {
      candidateTreeSha256: record.provenance.candidateTreeSha256,
      profileSha256: record.provenance.profileSha256,
      taskChecksum: record.provenance.taskChecksum,
      jobName: replaceCandidateIds(record.provenance.jobName),
      jobConfigSha256: record.provenance.jobConfigSha256,
      jobLockSha256: record.provenance.jobLockSha256,
      jobResultSha256: record.provenance.jobResultSha256,
      trialResultSha256: record.provenance.trialResultSha256,
      lockedSkillDigest: record.provenance.lockedSkillDigest,
      lockedSkillName: record.provenance.lockedSkillName,
      evidenceMode: record.provenance.evidenceMode,
      resumeManifestFileSha256: record.provenance.resumeManifestFileSha256,
      effectiveJobDigest: record.provenance.effectiveJobDigest,
    },
  }));
  return {
    records: publicRecords,
    gate: {
      status: gate.status,
      passed: gate.passed,
      reason: gate.reason,
      nextStage: gate.nextStage,
      selectedCandidateId: gate.selectedCandidateId === null
        ? null
        : candidateIds.get(gate.selectedCandidateId),
    },
  };
}

function renderMarkdown(publication) {
  const lines = [
    "# Generation 003 q003 development result",
    "",
    "All three comparable records come from the exact native generation-003 profile: a fresh baseline, the preserved extractive job, and the first-evaluable contrast retry through its sealed effective job. Generation-001 is lineage/task provenance only.",
    "",
    `Gate: **${publication.gate.status}** (${publication.gate.reason})`,
    "",
    "| Candidate | Evidence | Evaluable | Qualified | Reward | Required gates | Input / cache / output tokens |",
    "| --- | --- | :---: | :---: | ---: | --- | ---: |",
  ];
  for (const record of publication.records) {
    const gates = Object.entries(record.gates).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ");
    const evidence = record.provenance.evidenceMode;
    lines.push(`| ${record.candidateId} | ${evidence} | ${record.evaluable ? "yes" : "no"} | ${record.qualified ? "yes" : "no"} | ${record.metrics.primary ?? "null"} | ${gates} | ${record.tokens.input ?? "null"} / ${record.tokens.cache ?? "null"} / ${record.tokens.output ?? "null"} |`);
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

async function materializeResolvedOperatorInput({ protocol, runtimeRoot, preparedRoot, resolvedJobs, comparisons }) {
  const directory = path.join(runtimeRoot, "operator-inputs", "generation-003");
  const configPath = path.join(directory, "generation-003.json");
  const receiptPath = path.join(directory, "receipt.json");
  const config = buildDevelopmentOperatorConfig({
    protocol,
    runtimeRoot,
    preparedRoot,
    resolvedJobDirectories: Object.fromEntries(
      Object.entries(resolvedJobs).map(([candidateId, item]) => [candidateId, item.jobDirectory]),
    ),
  });
  const configText = canonicalJson(config);
  const body = {
    schemaVersion: 1,
    generationId: "generation-003",
    comparisonCohortGeneration: "generation-003",
    configSha256: objectDigest(config),
    candidateEvidence: Object.fromEntries(Object.entries(resolvedJobs).map(([candidateId, item]) => [
      candidateId,
      {
        mode: item.mode,
        jobDirectorySha256: objectDigest(path.resolve(item.jobDirectory)),
        resumeManifestFileSha256: item.resumeProvenance?.resumeManifestFileSha256 ?? null,
        effectiveJobDigest: item.resumeProvenance?.effectiveJobDigest ?? null,
      },
    ])),
    exactNativeComparison: {
      evaluationProfileSha256: comparisons[0].comparison.evaluationProfileSha256,
      developmentLockSha256: comparisons[0].comparison.lockSha256,
      candidateCount: comparisons.length,
    },
    generation001ResultImported: false,
    generation002ResultImported: false,
  };
  const receipt = { ...body, receiptSha256: objectDigest(body) };
  if (await exists(directory)) {
    assertValue(await fs.readFile(configPath, "utf8"), configText, "resolved operator config bytes");
    equal(await readJson(receiptPath), receipt, "resolved operator receipt");
    return { configPath, receiptPath, configSha256: body.configSha256, receiptFileSha256: await sha256File(receiptPath) };
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
  return { configPath, receiptPath, configSha256: body.configSha256, receiptFileSha256: await sha256File(receiptPath) };
}

export async function publishGeneration003(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  await verifyGeneration003({
    ...options,
    outputRoot: runtimeRoot,
    protocolPath,
    generation001RuntimeRoot,
  });
  const preparedRoot = analysisPreparedRoot(runtimeRoot);
  const [protocol, receipt] = await Promise.all([
    readJson(protocolPath),
    readJson(path.join(preparedRoot, "receipt.json")),
  ]);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const authentication = await verifyPrivateAuthenticationSeal({ protocol, runtimeRoot, preparedRoot });
  const contrastEvidence = await resolveContrastEffectiveEvidence({ protocol, runtimeRoot });
  const originalJobDirectory = (candidateId) => {
    const config = buildGeneration003HarborConfig({
      protocol,
      candidateId,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot,
      generation001RuntimeRoot,
    });
    return path.join(runtimeRoot, "jobs", "q003", candidateId, config.job_name);
  };
  assertValue(
    path.resolve(originalJobDirectory("baseline")),
    path.resolve(runtimeRoot, ...protocol.effectiveEvidence.baseline.jobDirectory.split("/")),
    "fresh baseline effective job declaration",
  );
  const resolvedJobs = {
    baseline: {
      mode: protocol.effectiveEvidence.baseline.mode,
      jobDirectory: originalJobDirectory("baseline"),
      resumeProvenance: null,
    },
    [protocol.target.children[0].candidateId]: {
      mode: protocol.effectiveEvidence[protocol.target.children[0].candidateId].mode,
      jobDirectory: originalJobDirectory(protocol.target.children[0].candidateId),
      resumeProvenance: null,
    },
    [protocol.target.children[1].candidateId]: {
      mode: contrastEvidence.mode,
      jobDirectory: contrastEvidence.jobDirectory,
      resumeProvenance: {
        resumeManifestFileSha256: contrastEvidence.provenance.resumeManifestSha256,
        effectiveJobDigest: contrastEvidence.provenance.effectiveJobDigest,
      },
    },
  };
  const baselineInspection = await inspectGeneration003Job({
    protocol,
    receipt,
    runtimeRoot,
    preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot,
    candidateId: "baseline",
    jobDirectory: resolvedJobs.baseline.jobDirectory,
  });
  const inspections = [baselineInspection];
  for (const child of protocol.target.children) {
    const resolved = resolvedJobs[child.candidateId];
    inspections.push(await inspectGeneration003Job({
      protocol,
      receipt,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot,
      generation001RuntimeRoot,
      candidateId: child.candidateId,
      jobDirectory: resolved.jobDirectory,
      taskChecksum: baselineInspection.record.provenance.taskChecksum,
      resumeProvenance: resolved.resumeProvenance,
    }));
  }
  const records = inspections.map((inspection) => inspection.record);
  if (new Set(records.map((record) => record.provenance.taskChecksum)).size !== 1) {
    throw new Error("q003 checksum drift inside the native generation-003 cohort");
  }
  if (new Set(records.map((record) => record.provenance.candidateTreeSha256)).size !== 3) {
    throw new Error("Fresh baseline and generation-003 children must remain byte-distinct");
  }
  if (new Set(records.map((record) => record.provenance.lockedSkillDigest)).size !== 3) {
    throw new Error("Native generation-003 cohort must lock three distinct skill digests");
  }
  const exactNativeComparison = validateExactNativeGeneration003Comparisons(inspections);
  const gate = evaluateDevelopmentGate({ protocol, records });
  const operatorInput = await materializeResolvedOperatorInput({
    protocol,
    runtimeRoot,
    preparedRoot,
    resolvedJobs,
    comparisons: inspections,
  });
  assertValue(records.length, protocol.callAccounting.effectiveComparableEvaluations, "effective comparison accounting");
  assertValue(contrastEvidence.selection.attempt, protocol.callAccounting.generation003ExternalRetries, "external retry accounting");
  assertValue(protocol.callAccounting.generation003PreAgentExternalFailures, 1, "pre-agent external failure accounting");
  const publicEvidence = publicRecordsAndGate(records, gate, protocol);
  const body = {
    schemaVersion: 1,
    experimentId: protocol.experimentId,
    generationId: "generation-003",
    evidenceLayer: protocol.evidenceLayer,
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
    records: publicEvidence.records,
    tokenTotals: sumTokens(records),
    gate: publicEvidence.gate,
    comparisonPolicy: {
      lineageParentGeneration: receipt.comparisonPolicy.lineageParentGeneration,
      comparisonCohortGeneration: receipt.comparisonPolicy.comparisonCohortGeneration,
      generation001ResultImported: receipt.comparisonPolicy.generation001ResultImported,
      generation001FitnessImported: receipt.comparisonPolicy.generation001FitnessImported,
      generation001OperatorCreditImported: receipt.comparisonPolicy.generation001OperatorCreditImported,
      excludedFitnessGenerationIds: [...receipt.comparisonPolicy.excludedFitnessGenerationIds],
      generation002JobsReused: receipt.comparisonPolicy.generation002JobsReused,
      generation002FitnessImported: receipt.comparisonPolicy.generation002FitnessImported,
      generation002OperatorCreditImported: receipt.comparisonPolicy.generation002OperatorCreditImported,
      generation002ParentageImported: receipt.comparisonPolicy.generation002ParentageImported,
    },
    exactNativeComparison,
    callAccounting: {
      generation001HistoricalHarborInvocations: protocol.callAccounting.generation001HistoricalHarborInvocations,
      generation001HistoricalModelExecutions: protocol.callAccounting.generation001HistoricalModelExecutions,
      generation002HistoricalHarborInvocations: protocol.callAccounting.generation002HistoricalHarborInvocations,
      generation002HistoricalModelExecutions: protocol.callAccounting.generation002HistoricalModelExecutions,
      generation001ComparableResultsImported: protocol.callAccounting.generation001ComparableResultsImported,
      generation002ComparableResultsImported: protocol.callAccounting.generation002ComparableResultsImported,
      generation003HarborInvocations: protocol.callAccounting.generation003HarborInvocations,
      generation003ModelExecutions: protocol.callAccounting.generation003ModelExecutions,
      generation003PreAgentExternalFailures: protocol.callAccounting.generation003PreAgentExternalFailures,
      generation003ExternalRetries: protocol.callAccounting.generation003ExternalRetries,
      effectiveComparableEvaluations: protocol.callAccounting.effectiveComparableEvaluations,
      historicalHarborInvocations: protocol.callAccounting.historicalHarborInvocations,
      historicalModelExecutions: protocol.callAccounting.historicalModelExecutions,
      subsequentValidationPermitted: gate.passed,
    },
    provenance: {
      preparationReceiptFileSha256: await sha256File(path.join(preparedRoot, "receipt.json")),
      protocolSha256: receipt.protocolSha256,
      q003TaskTreeSha256: receipt.q003Task.treeSha256,
      lineageParentPreparationReceiptSha256: receipt.lineageParentEvidence.preparationReceiptSha256,
      lineageOperatorFileSha256: receipt.diagnosticOperatorProvenance.fileSha256,
      lineageOperatorGenerationSeal: receipt.diagnosticOperatorProvenance.generationSeal,
      donorTreeSha256: receipt.diagnosticDonorTrace.candidateTreeSha256,
      privateAuthSealFileSha256: authentication.sealFileSha256,
      authPayloadDigestPublished: false,
      authCredentialMetadataPublished: false,
      contrastResume: {
        selectionPolicy: contrastEvidence.selection.policy,
        selectedLineage: contrastEvidence.selection.lineage,
        selectedAttempt: contrastEvidence.selection.attempt,
        resumeLockFileSha256: contrastEvidence.provenance.resumeLockSha256,
        mergedFileSha256: contrastEvidence.provenance.mergedResultSha256,
        manifestFileSha256: contrastEvidence.provenance.resumeManifestSha256,
        effectiveJobDigest: contrastEvidence.provenance.effectiveJobDigest,
        attemptRecordDigest: contrastEvidence.provenance.attemptRecordDigest,
        failureContract: contrastEvidence.provenance.failureContract,
        remediationAttestationDigest: contrastEvidence.provenance.remediationAttestationDigest,
      },
      resolvedOperatorInput: {
        configSha256: operatorInput.configSha256,
        receiptFileSha256: operatorInput.receiptFileSha256,
      },
    },
  };
  const publication = { ...body, publicationSha256: objectDigest(body) };
  assertSanitizedPublication(publication);
  const outputDirectory = assertInside(
    runtimeRoot,
    path.resolve(options.outputDirectory ?? path.join(runtimeRoot, "publications", "q003")),
    "publication output",
  );
  await writePublication(outputDirectory, publication);
  return { publication, outputDirectory };
}

export async function verifyContrastResume(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const verified = await verifyGeneration003({
    ...options,
    outputRoot: runtimeRoot,
    protocolPath,
    generation001RuntimeRoot,
  });
  const protocol = await readJson(protocolPath);
  const preparedRoot = analysisPreparedRoot(runtimeRoot);
  await verifyPrivateAuthenticationSeal({ protocol, runtimeRoot, preparedRoot });
  const evidence = await resolveContrastEffectiveEvidence({ protocol, runtimeRoot });
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? path.join(REPO_ROOT, "..", "knowledge"));
  const inspection = await inspectGeneration003Job({
    protocol,
    receipt: verified.receipt,
    runtimeRoot,
    preparedRoot,
    knowledgeRoot,
    generation001RuntimeRoot,
    candidateId: evidence.candidateId,
    jobDirectory: evidence.jobDirectory,
    resumeProvenance: {
      resumeManifestFileSha256: evidence.provenance.resumeManifestSha256,
      effectiveJobDigest: evidence.provenance.effectiveJobDigest,
    },
  });
  if (!inspection.record.evaluable) throw new Error("Contrast effective retry is not evaluable");
  return {
    mode: "verified-resume",
    selectionPolicy: evidence.selection.policy,
    selectedLineage: evidence.selection.lineage,
    selectedAttempt: evidence.selection.attempt,
    effectiveJobDigest: evidence.provenance.effectiveJobDigest,
    evaluationProfileSha256: inspection.comparison.evaluationProfileSha256,
    developmentLockSha256: inspection.comparison.lockSha256,
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
    if (!key) throw new Error(`Unknown option: ${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argv[index]}`);
    options[key] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} q003 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-resume [options]\n\nBoth commands perform no Harbor or model calls. Publication emits only metrics, gates, tokens, policies, and cryptographic provenance.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  if (command === "verify-resume") {
    if (options.outputDirectory !== undefined) throw new Error("--output is valid only for q003 publication");
    process.stdout.write(canonicalJson(await verifyContrastResume(options)));
    return;
  }
  if (command !== "q003") throw new Error(`Unknown command: ${command}`);
  const result = await publishGeneration003(options);
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
