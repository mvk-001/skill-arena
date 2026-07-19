#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  canonicalJson,
  frozenProfileFromSource,
  objectDigest,
  treeDigest,
} from "../../scripts/prepare-meta-evolution.js";
import {
  piAuthDocumentHasRequiredShape,
  sha256File,
} from "../../generation-002/scripts/prepare-generation-002.js";

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
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
);

export const CHILD_IDS = [
  "extractive-one-shot-answer",
  "contrast-matrix-one-shot-answer",
];
export const OPERATOR_ID = "deterministic-terminal-answer-compiler";
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const OMITTED_TREE_NAMES = new Set(["__pycache__"]);
const CANDIDATE_LEAK_PATTERN = /\bq(?:003|007|018|024|030)\b|\bqrels?\b|oracle-pi|gpt-5\.3-codex-spark|graphrag-papers-40|evidence_contract_gate|minimum_document_gate|mechanical_qualification_gate|489934516868c0b8bcd5469c2b7c0439ddae30eea36a0419735c3c00ccda37b0/i;
const PI_AUTH_STRING_FIELDS = ["type", "access", "refresh", "accountId"];
export const LEGACY_PREPARED_DIRECTORY = "prepared";
export const ANALYSIS_PREPARED_DIRECTORY = "prepared-v2";

export function legacyPreparedRoot(runtimeRoot) {
  return path.join(path.resolve(runtimeRoot), LEGACY_PREPARED_DIRECTORY);
}

export function analysisPreparedRoot(runtimeRoot) {
  return path.join(path.resolve(runtimeRoot), ANALYSIS_PREPARED_DIRECTORY);
}

export { piAuthDocumentHasRequiredShape, sha256File };

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
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

function requireSha(value, label, { pinned = false } = {}) {
  const digest = requireString(value, label);
  if (!HEX_SHA256.test(digest)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  if (pinned && digest === "0".repeat(64)) {
    throw new Error(`${label} must be sealed; the all-zero placeholder is forbidden`);
  }
  return digest;
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
    throw new Error(`${label} must be inside ${resolvedRoot}: ${resolved}`);
  }
  return resolved;
}

function assertRuntimeOutput(outputRoot, repoRoot) {
  return assertInside(path.join(repoRoot, ".tmp"), outputRoot, "Runtime output");
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function assertCleanPinnedKnowledge(knowledgeRoot, expectedCommit) {
  assertValue(gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]), expectedCommit, "Knowledge commit");
  if (gitOutput(knowledgeRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("Knowledge checkout must be clean and read-only input");
  }
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

async function copyTree(source, destination) {
  await treeDigest(source);
  await fs.cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: false,
  });
  await treeDigest(destination);
}

async function writeExclusive(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "wx" });
}

function yamlDocument(value) {
  return stringifyYaml(value, { indent: 2, lineWidth: 0, sortMapEntries: false });
}

async function skillName(skillRoot) {
  const text = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error(`Skill has no YAML frontmatter: ${skillRoot}`);
  return requireString(parseYaml(frontmatter[1])?.name, `${skillRoot} skill name`);
}

function authContainsShellPath(value) {
  if (Array.isArray(value)) return value.some(authContainsShellPath);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => key.toLocaleLowerCase("en-US") === "shellpath" || authContainsShellPath(child),
  );
}

function authShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, items: value.map(authShape) };
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return { type: "object", keys, fields: Object.fromEntries(keys.map((key) => [key, authShape(value[key])])) };
  }
  return { type: value === null ? "null" : typeof value };
}

async function resolveAuthJson(authSource) {
  const source = path.resolve(requireString(authSource, "auth source"));
  const sourceStat = await fs.lstat(source);
  if (sourceStat.isSymbolicLink()) throw new Error("auth source must not be a link");
  const authJson = sourceStat.isDirectory() ? path.join(source, "auth.json") : source;
  const stat = await fs.lstat(authJson);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("auth.json must be an ordinary file");
  const bytes = await fs.readFile(authJson);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`auth.json must be valid JSON: ${error.message}`, { cause: error });
  }
  if (!piAuthDocumentHasRequiredShape(payload) || authContainsShellPath(payload)) {
    throw new Error("auth.json violates the sealed Pi provider-only shape");
  }
  return {
    authJson,
    payloadSha256: sha256Bytes(bytes),
    byteLength: bytes.length,
    mtimeMs: Math.trunc(stat.mtimeMs),
    shapeSha256: objectDigest(authShape(payload)),
  };
}

async function originalChildJobBindings({ protocol, runtimeRoot }) {
  const bindings = [];
  for (const candidateId of CHILD_IDS) {
    const jobDirectory = path.join(runtimeRoot, "jobs", "q003", candidateId, childJobName(protocol, candidateId));
    await assertOrdinaryDirectory(jobDirectory, `${candidateId} preserved original job`);
    const [config, result] = await Promise.all([
      readJson(path.join(jobDirectory, "config.json")),
      readJson(path.join(jobDirectory, "result.json")),
    ]);
    assertValue(config.job_name, childJobName(protocol, candidateId), `${candidateId} original job name`);
    const authMounts = requireArray(config.environment?.mounts, `${candidateId} original mounts`)
      .filter((mount) => mount.target === protocol.privateAuthenticationSeal.mountTarget);
    if (authMounts.length !== 1) throw new Error(`${candidateId} must contain exactly one sealed auth mount`);
    assertValue(authMounts[0].type, "bind", `${candidateId} auth mount type`);
    assertValue(authMounts[0].source, protocol.harbor.authenticationMount.source, `${candidateId} auth mount source`);
    if (!result.started_at || result.n_total_trials !== 1) {
      throw new Error(`${candidateId} original job must bind one started trial before auth sealing`);
    }
    if (candidateId === CHILD_IDS[0] && !result.finished_at) {
      throw new Error(`${candidateId} settled original job must be complete before auth sealing`);
    }
    if (candidateId === CHILD_IDS[1] && result.finished_at !== null) {
      throw new Error(`${candidateId} original job must remain the unfinished pre-agent failure root`);
    }
    bindings.push({
      candidateId,
      jobDirectory,
      startedAt: result.started_at,
      configSha256: await sha256File(path.join(jobDirectory, "config.json")),
      lockSha256: await sha256File(path.join(jobDirectory, "lock.json")),
      resultSha256: await sha256File(path.join(jobDirectory, "result.json")),
    });
  }
  return bindings;
}

export async function sealGeneration003Authentication(options = {}) {
  const runtimeRoot = assertRuntimeOutput(path.resolve(options.outputRoot ?? DEFAULT_OUTPUT), path.resolve(options.repoRoot ?? REPO_ROOT));
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const protocol = await readJson(protocolPath);
  const auth = await resolveAuthJson(options.authSource);
  const bindings = await originalChildJobBindings({ protocol, runtimeRoot });
  const earliestStartMs = Math.min(...bindings.map((binding) => Date.parse(binding.startedAt)));
  if (!Number.isFinite(earliestStartMs) || auth.mtimeMs > earliestStartMs) {
    throw new Error("auth.json mtime is not earlier than the preserved generation-003 child executions");
  }
  const legacyWrapperPath = path.join(legacyPreparedRoot(runtimeRoot), "run-q003-clean-pi.sh");
  const wrapperPath = await exists(legacyWrapperPath)
    ? legacyWrapperPath
    : path.join(analysisPreparedRoot(runtimeRoot), "evidence", "run-q003-clean-pi.sh.disabled");
  const body = {
    schemaVersion: 1,
    kind: "generation-003-private-auth-payload-seal",
    mount: {
      source: protocol.harbor.authenticationMount.source,
      target: protocol.privateAuthenticationSeal.mountTarget,
      projectedEntries: protocol.privateAuthenticationSeal.projectedEntries,
    },
    payload: {
      sha256: auth.payloadSha256,
      byteLength: auth.byteLength,
      mtimeMs: auth.mtimeMs,
      shapeSha256: auth.shapeSha256,
      requiredProviderShape: true,
      recursiveShellPathAbsent: true,
    },
    executionBinding: {
      childWrapperSha256: await sha256File(wrapperPath),
      preservedOriginalJobs: bindings.map(({ jobDirectory, ...binding }) => ({
        ...binding,
        jobDirectorySha256: sha256Bytes(Buffer.from(path.resolve(jobDirectory), "utf8")),
      })),
      assertedWrapperInput: "same-auth-json-payload",
    },
    publicationPolicy: {
      publishPayloadDigest: false,
      publishCredentialMetadata: false,
    },
  };
  const seal = { ...body, sealSha256: objectDigest(body) };
  const sealPath = path.join(runtimeRoot, ...protocol.privateAuthenticationSeal.path.split("/"));
  await fs.mkdir(path.dirname(sealPath), { recursive: true });
  if (await exists(sealPath)) {
    equal(await readJson(sealPath), seal, "existing private auth seal");
    return { mode: "verified-existing", sealPath, sealFileSha256: await sha256File(sealPath) };
  }
  await writeExclusive(sealPath, canonicalJson(seal));
  return { mode: "sealed", sealPath, sealFileSha256: await sha256File(sealPath) };
}

export async function verifyGeneration003Authentication(options = {}) {
  const runtimeRoot = assertRuntimeOutput(path.resolve(options.outputRoot ?? DEFAULT_OUTPUT), path.resolve(options.repoRoot ?? REPO_ROOT));
  const protocol = await readJson(path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL));
  const sealPath = path.join(runtimeRoot, ...protocol.privateAuthenticationSeal.path.split("/"));
  const seal = await readJson(sealPath);
  const { sealSha256, ...body } = seal;
  assertValue(sealSha256, objectDigest(body), "private auth seal digest");
  assertValue(body.kind, "generation-003-private-auth-payload-seal", "private auth seal kind");
  assertValue(body.mount?.source, protocol.harbor.authenticationMount.source, "private auth mount source");
  assertValue(body.mount?.target, protocol.privateAuthenticationSeal.mountTarget, "private auth mount target");
  equal(body.mount?.projectedEntries, ["auth.json"], "private auth projected entries");
  assertValue(body.publicationPolicy?.publishPayloadDigest, false, "private auth digest publication policy");
  const auth = await resolveAuthJson(options.authSource);
  for (const field of ["payloadSha256", "byteLength", "mtimeMs", "shapeSha256"]) {
    const sealedField = field === "payloadSha256" ? "sha256" : field;
    assertValue(auth[field], body.payload?.[sealedField], `sealed auth ${field}`);
  }
  return { mode: "verified", sealPath, sealFileSha256: await sha256File(sealPath) };
}

async function assertCandidateHasNoSealedConstants(skillRoot, candidateId) {
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (OMITTED_TREE_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await walk(skillRoot);
  for (const filePath of files) {
    const bytes = await fs.readFile(filePath);
    if (!bytes.includes(0) && CANDIDATE_LEAK_PATTERN.test(bytes.toString("utf8"))) {
      throw new Error(`Candidate ${candidateId} contains a sealed task, corpus, profile, or evaluator constant: ${path.relative(skillRoot, filePath)}`);
    }
  }
}

function validateProtocol(protocol, sourceProtocol) {
  assertValue(protocol.schemaVersion, 2, "protocol.schemaVersion");
  if (protocol.status !== "sealed") {
    throw new Error("generation-003 protocol is not sealed; candidate digests and operator instruction must be finalized first");
  }
  assertValue(protocol.generationId, "generation-003", "protocol.generationId");
  assertValue(protocol.target?.logicalName, "consult-semantic-okf", "protocol.target.logicalName");
  assertValue(protocol.target?.baseline?.candidateId, "baseline", "baseline candidate ID");
  assertValue(protocol.target?.baseline?.lineageCandidateId, "00-baseline", "baseline lineage ID");
  requireSha(protocol.target?.baseline?.expectedTreeSha256, "baseline tree digest", { pinned: true });
  assertValue(protocol.operator?.operatorId, OPERATOR_ID, "operator ID");
  equal(protocol.operator?.parentOperatorIds, [], "generation-zero operator parents");
  assertValue(protocol.operator?.origin, "seed", "generation-zero operator origin");
  const instruction = requireString(protocol.operator?.instruction, "operator instruction");
  if (/^PENDING\b/i.test(instruction)) throw new Error("operator instruction is not sealed");
  const children = requireArray(protocol.target?.children, "protocol.target.children");
  equal(children.map((child) => child.candidateId), CHILD_IDS, "generation-003 child IDs");
  for (const child of children) {
    assertValue(child.parentCandidateId, "00-baseline", `${child.candidateId} lineage parent`);
    assertValue(child.operatorId, OPERATOR_ID, `${child.candidateId} operator`);
    requireString(child.sourcePath, `${child.candidateId} source path`);
    requireString(child.manifestPath, `${child.candidateId} manifest path`);
    requireString(child.operatorRealizationPath, `${child.candidateId} realization path`);
    requireSha(child.expectedTreeSha256, `${child.candidateId} tree digest`, { pinned: true });
    requireSha(child.expectedManifestSha256, `${child.candidateId} manifest digest`, { pinned: true });
    requireSha(child.expectedOperatorRealizationSha256, `${child.candidateId} realization digest`, { pinned: true });
  }
  const sourceProfile = frozenProfileFromSource(sourceProtocol);
  equal(protocol.frozenEvaluationProfile, sourceProfile, "frozen evaluation profile");
  assertValue(protocol.frozenEvaluationProfileSha256, objectDigest(sourceProfile), "frozen profile digest");
  assertValue(protocol.frozenEvaluationProfile.retries, 0, "Harbor retries");
  assertValue(protocol.frozenEvaluationProfile.attemptsPerCandidateTask, 1, "attempts per task");
  assertValue(protocol.preparationTask?.taskId, "q003", "development task");
  requireSha(protocol.preparationTask?.expectedTreeSha256, "q003 tree digest", { pinned: true });
  const upgrade = requireObject(protocol.preparationUpgrade, "preparationUpgrade");
  assertValue(upgrade.legacySchemaVersion, 1, "legacy prepared schema");
  requireSha(upgrade.legacyProtocolSha256, "legacy protocol digest", { pinned: true });
  requireSha(upgrade.legacyReceiptFileSha256, "legacy receipt file digest", { pinned: true });
  requireSha(upgrade.legacyImmutablePayloadSha256, "legacy immutable payload digest", { pinned: true });
  for (const field of [
    "preserveExistingArtifactsBytewise",
  ]) assertValue(upgrade[field], true, `preparationUpgrade.${field}`);
  for (const field of [
    "legacyGeneration001BaselineRecordFitnessImported",
    "legacyOperatorConfigConsumed",
    "liveJobDirectoriesMutable",
  ]) assertValue(upgrade[field], false, `preparationUpgrade.${field}`);

  const comparison = requireObject(protocol.comparisonPolicy, "comparisonPolicy");
  assertValue(comparison.lineageParentGeneration, "generation-001", "lineage parent generation");
  assertValue(comparison.comparisonCohortGeneration, "generation-003", "comparison cohort generation");
  for (const field of [
    "generation001ResultImported",
    "generation001FitnessImported",
    "generation001OperatorCreditImported",
  ]) assertValue(comparison[field], false, `comparisonPolicy.${field}`);
  equal(comparison.excludedFitnessGenerationIds, ["generation-002"], "excluded fitness generations");
  for (const field of [
    "generation002JobsReused",
    "generation002FitnessImported",
    "generation002OperatorCreditImported",
    "generation002ParentageImported",
  ]) assertValue(comparison[field], false, `comparisonPolicy.${field}`);
  const donor = requireObject(protocol.diagnosticDonorTrace, "diagnosticDonorTrace");
  assertValue(donor.generationId, "generation-002", "donor trace generation");
  requireSha(donor.candidateTreeSha256, "donor trace candidate digest", { pinned: true });
  for (const field of [
    "parentageImported",
    "jobEvidenceImported",
    "fitnessImported",
    "operatorCreditImported",
    "modelOutputImported",
  ]) assertValue(donor[field], false, `diagnosticDonorTrace.${field}`);

  const diagnostic = requireObject(protocol.diagnosticOperatorProvenance, "diagnosticOperatorProvenance");
  assertValue(diagnostic.generationId, "generation-001", "diagnostic generation");
  requireString(diagnostic.path, "diagnostic log path");
  requireSha(diagnostic.fileSha256, "diagnostic log file digest", { pinned: true });
  assertValue(diagnostic.diagnosticOnly, true, "diagnostic log classification");
  assertValue(diagnostic.chainEligible, false, "diagnostic log chain eligibility");
  assertValue(diagnostic.holdoutOpened, false, "diagnostic log holdout state");
  for (const field of ["importedAsPreviousGeneration", "fitnessImported", "operatorCreditImported"]) {
    assertValue(diagnostic[field], false, `diagnosticOperatorProvenance.${field}`);
  }
  assertValue(protocol.operatorAnalysis?.generation, 0, "operator analysis generation");
  assertValue(protocol.operatorAnalysis?.previousGenerationLog, null, "operator previous generation log");
  assertValue(protocol.operatorAnalysis?.holdoutPathsMustRemainUnresolved, true, "unopened holdout policy");
  assertValue(protocol.harbor?.containerPreflight?.image, "semantic-okf-harbor-runtime:1.0", "preflight image");
  assertValue(protocol.harbor?.containerPreflight?.imageId, "sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5", "preflight image ID");
  assertValue(protocol.harbor?.containerPreflight?.pull, "never", "preflight pull policy");
  assertValue(protocol.harbor?.containerPreflight?.network, "none", "preflight network");
  assertValue(protocol.harbor?.containerPreflight?.entrypoint, "/bin/bash", "preflight entrypoint");
  assertValue(protocol.harbor?.containerPreflight?.mustPassBeforeAnyHarborCall, true, "preflight ordering");
  assertValue(protocol.harbor?.authenticationSourceContract?.copyOnlyAuthJson, true, "auth projection policy");
  assertValue(protocol.harbor?.authenticationSourceContract?.copySettings, false, "settings projection policy");
  equal(protocol.harbor?.authenticationSourceContract?.requiredNonEmptyStringFields, PI_AUTH_STRING_FIELDS, "auth string fields");
  const effective = requireObject(protocol.effectiveEvidence, "effectiveEvidence");
  assertValue(effective.baseline?.mode, "fresh-generation-003-original-job", "fresh baseline evidence mode");
  assertValue(effective[CHILD_IDS[0]]?.mode, "preserved-generation-003-original-job", "extractive evidence mode");
  const resumed = requireObject(effective[CHILD_IDS[1]], "contrast effective evidence");
  assertValue(resumed.mode, "manifested-first-evaluable-retry-effective-job", "contrast evidence mode");
  assertValue(resumed.originalJobImmutable, true, "contrast original immutability");
  assertValue(resumed.selectionPolicy, "first-evaluable-retry-never-best-of", "contrast selection policy");
  assertValue(resumed.maximumExternalRetries, 1, "contrast retry cap");
  assertValue(resumed.requiredSelectedLineage, "retry", "contrast selected lineage");
  assertValue(resumed.requiredAttempt, 1, "contrast selected attempt");
  const authSeal = requireObject(protocol.privateAuthenticationSeal, "privateAuthenticationSeal");
  assertValue(authSeal.mountTarget, "/root/.pi/agent", "private auth seal target");
  equal(authSeal.projectedEntries, ["auth.json"], "private auth seal projection");
  assertValue(authSeal.publishPayloadDigest, false, "auth payload publication policy");
  assertValue(authSeal.publishCredentialMetadata, false, "auth metadata publication policy");
  const accounting = requireObject(protocol.callAccounting, "callAccounting");
  assertValue(accounting.generation001HistoricalHarborInvocations, 3, "generation-001 historical Harbor invocations");
  assertValue(accounting.generation001HistoricalModelExecutions, 3, "generation-001 historical model executions");
  assertValue(accounting.generation002HistoricalHarborInvocations, 2, "generation-002 historical Harbor invocations");
  assertValue(accounting.generation002HistoricalModelExecutions, 2, "generation-002 historical model executions");
  assertValue(accounting.generation001ComparableResultsImported, 0, "generation-001 comparable result imports");
  assertValue(accounting.generation002ComparableResultsImported, 0, "generation-002 comparable result imports");
  assertValue(accounting.generation003HarborInvocations, 4, "generation-003 Harbor invocations");
  assertValue(accounting.generation003ModelExecutions, 3, "generation-003 model executions");
  assertValue(accounting.generation003PreAgentExternalFailures, 1, "generation-003 pre-agent failures");
  assertValue(accounting.generation003ExternalRetries, 1, "generation-003 external retries");
  assertValue(accounting.effectiveComparableEvaluations, 3, "effective comparable evaluations");
  assertValue(accounting.historicalHarborInvocations, 9, "historical Harbor invocations");
  assertValue(accounting.historicalModelExecutions, 8, "historical model executions");
  assertValue(
    accounting.generation001HistoricalHarborInvocations
      + accounting.generation002HistoricalHarborInvocations
      + accounting.generation003HarborInvocations,
    accounting.historicalHarborInvocations,
    "historical Harbor invocation arithmetic",
  );
  assertValue(
    accounting.generation001HistoricalModelExecutions
      + accounting.generation002HistoricalModelExecutions
      + accounting.generation003ModelExecutions,
    accounting.historicalModelExecutions,
    "historical model execution arithmetic",
  );
}

function sanitizeParentRecord(record) {
  return {
    taskId: record.taskId,
    candidateId: record.candidateId,
    parentCandidateId: null,
    operatorId: null,
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
      jobName: record.provenance.jobName,
      jobConfigSha256: record.provenance.jobConfigSha256,
      jobLockSha256: record.provenance.jobLockSha256,
      jobResultSha256: record.provenance.jobResultSha256,
      trialResultSha256: record.provenance.trialResultSha256,
      lockedSkillDigest: record.provenance.lockedSkillDigest,
      lockedSkillName: record.provenance.lockedSkillName,
    },
  };
}

async function verifyDiagnosticProvenance({ protocol, generation001RuntimeRoot }) {
  const declared = protocol.diagnosticOperatorProvenance;
  const logPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...declared.path.split("/")),
    "generation-001 diagnostic operator log",
  );
  assertValue(await sha256File(logPath), declared.fileSha256, "diagnostic operator log SHA-256");
  const log = await readJson(logPath);
  for (const field of ["schemaVersion", "source", "evolutionId", "generation", "generationId", "generationSeal", "evolutionProfileDigest"]) {
    assertValue(log[field], declared[field], `diagnostic operator log ${field}`);
  }
  assertValue(log.diagnosticOnly, true, "diagnostic operator log classification");
  assertValue(log.chainEligible, false, "diagnostic operator log chain eligibility");
  assertValue(log.holdoutOpened, false, "diagnostic operator log holdout state");
  assertValue(log.promotion, false, "diagnostic operator log promotion state");
  return structuredClone(declared);
}

async function verifyLineageParentEvidence({ protocol, generation001RuntimeRoot }) {
  const parent = requireObject(protocol.lineageParentEvidence, "lineageParentEvidence");
  for (const field of ["resultImported", "fitnessImported", "operatorCreditImported"]) {
    assertValue(parent[field], false, `lineageParentEvidence.${field}`);
  }
  const receiptPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.preparationReceiptPath.split("/")),
    "generation-001 preparation receipt",
  );
  assertValue(await sha256File(receiptPath), parent.preparationReceiptSha256, "lineage parent receipt bytes");
  const receipt = await readJson(receiptPath);
  assertValue(receipt.generationId, "generation-001", "lineage parent receipt generation");
  assertValue(receipt.preparationTask?.taskId, "q003", "lineage parent task");
  assertValue(receipt.preparationTask?.treeSha256, protocol.preparationTask.expectedTreeSha256, "lineage parent task tree");

  const q003Root = path.join(generation001RuntimeRoot, "prepared", "tasks", "q003");
  const baselineRoot = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.baselinePreparedPath.split("/")),
    "generation-001 lineage baseline",
  );
  assertValue((await treeDigest(q003Root)).sha256, protocol.preparationTask.expectedTreeSha256, "reused q003 task tree");
  assertValue((await treeDigest(baselineRoot)).sha256, parent.expectedTreeSha256, "lineage baseline tree");
  assertValue(parent.expectedTreeSha256, protocol.target.baseline.expectedTreeSha256, "lineage baseline protocol tree");
  const environmentRoot = path.join(q003Root, "environment");
  await assertOrdinaryDirectory(environmentRoot, "reused q003 environment directory");
  if ((await fs.readdir(environmentRoot)).length !== 0) {
    throw new Error("reused q003 environment directory must remain present and empty");
  }
  return {
    baselineRoot,
    preparationReceiptSha256: parent.preparationReceiptSha256,
    diagnosticProvenance: await verifyDiagnosticProvenance({ protocol, generation001RuntimeRoot }),
  };
}

async function validateChildLineage({ child, protocol, repoRoot, digest }) {
  const manifestPath = assertInside(repoRoot, path.join(repoRoot, ...child.manifestPath.split("/")), `${child.candidateId} manifest`);
  const realizationPath = assertInside(repoRoot, path.join(repoRoot, ...child.operatorRealizationPath.split("/")), `${child.candidateId} realization`);
  assertValue(await sha256File(manifestPath), child.expectedManifestSha256, `${child.candidateId} manifest bytes`);
  assertValue(await sha256File(realizationPath), child.expectedOperatorRealizationSha256, `${child.candidateId} realization bytes`);
  const [manifest, realization] = await Promise.all([readJson(manifestPath), readJson(realizationPath)]);
  for (const document of [manifest, realization]) {
    assertValue(document.generationId, "generation-003", `${child.candidateId} lineage generation`);
    assertValue(document.candidateId, child.candidateId, `${child.candidateId} lineage identity`);
    assertValue(document.operatorId, OPERATOR_ID, `${child.candidateId} lineage operator`);
    assertValue(document.parentCandidateId, "00-baseline", `${child.candidateId} lineage parent`);
  }
  assertValue(manifest.parentTreeSha256, protocol.target.baseline.expectedTreeSha256, `${child.candidateId} manifest parent tree`);
  assertValue(manifest.parentSourceCommit, protocol.knowledge.commit, `${child.candidateId} manifest parent commit`);
  assertValue(manifest.skill?.name, protocol.target.logicalName, `${child.candidateId} manifest skill name`);
  assertValue(manifest.skill?.treeSha256, digest.sha256, `${child.candidateId} manifest tree`);
  assertValue(realization.candidateTreeSha256, digest.sha256, `${child.candidateId} realization tree`);
  assertValue(realization.instruction, protocol.operator.instruction, `${child.candidateId} realization instruction`);
  assertValue(
    realization.origin,
    protocol.operator.historicalCandidateRealizationOrigin,
    `${child.candidateId} historical realization origin`,
  );
  const parents = requireArray(realization.parentCandidates, `${child.candidateId} realization parents`);
  if (parents.length !== 1) throw new Error(`${child.candidateId} must have one true parent`);
  assertValue(parents[0].candidateId, "00-baseline", `${child.candidateId} realization parent ID`);
  assertValue(parents[0].treeSha256, protocol.target.baseline.expectedTreeSha256, `${child.candidateId} realization parent tree`);
  assertValue(parents[0].sourceCommit, protocol.knowledge.commit, `${child.candidateId} realization parent commit`);
  return {
    manifestSha256: child.expectedManifestSha256,
    operatorRealizationSha256: child.expectedOperatorRealizationSha256,
  };
}

async function validateInputs(options) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const generationRoot = path.resolve(options.generationRoot ?? GENERATION_ROOT);
  const protocolPath = path.resolve(options.protocolPath ?? path.join(generationRoot, "protocol.json"));
  const sourceProtocolPath = path.resolve(options.sourceProtocolPath ?? DEFAULT_SOURCE_PROTOCOL);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const [protocol, sourceProtocol] = await Promise.all([readJson(protocolPath), readJson(sourceProtocolPath)]);
  validateProtocol(protocol, sourceProtocol);
  assertValue(protocol.knowledge.commit, sourceProtocol.sourceFreeze?.repository?.commit, "Knowledge source commit");
  assertValue(protocol.knowledge.baselineSkillPath, sourceProtocol.sourceFreeze?.dataset?.baselineSkillPath, "baseline source path");
  assertValue(protocol.knowledge.referenceBundlePath, sourceProtocol.sourceFreeze?.dataset?.referenceBundlePath, "reference bundle path");
  assertCleanPinnedKnowledge(knowledgeRoot, protocol.knowledge.commit);
  const baselineSource = assertInside(knowledgeRoot, path.join(knowledgeRoot, ...protocol.knowledge.baselineSkillPath.split("/")), "Knowledge baseline skill");
  const baselineDigest = await treeDigest(baselineSource);
  assertValue(baselineDigest.sha256, protocol.target.baseline.expectedTreeSha256, "Knowledge baseline tree");
  const lineageParentEvidence = await verifyLineageParentEvidence({ protocol, generation001RuntimeRoot });
  const children = [];
  for (const child of protocol.target.children) {
    const source = assertInside(repoRoot, path.join(repoRoot, ...child.sourcePath.split("/")), `${child.candidateId} source`);
    await assertOrdinaryDirectory(source, `${child.candidateId} source`);
    assertValue(path.basename(source), protocol.target.logicalName, `${child.candidateId} basename`);
    assertValue(await skillName(source), protocol.target.logicalName, `${child.candidateId} skill name`);
    await assertCandidateHasNoSealedConstants(source, child.candidateId);
    const digest = await treeDigest(source);
    assertValue(digest.sha256, child.expectedTreeSha256, `${child.candidateId} tree digest`);
    const lineage = await validateChildLineage({ child, protocol, repoRoot, digest });
    children.push({ ...child, source, digest, lineage });
  }
  if (new Set([baselineDigest.sha256, ...children.map((child) => child.digest.sha256)]).size !== 3) {
    throw new Error("Baseline and both generation-003 children must have three distinct tree digests");
  }
  return {
    repoRoot,
    generationRoot,
    protocolPath,
    sourceProtocolPath,
    knowledgeRoot,
    generation001RuntimeRoot,
    protocol,
    sourceProtocol,
    baselineDigest,
    lineageParentEvidence,
    children,
    protocolSha256: await sha256File(protocolPath),
    sourceProfileSha256: objectDigest(frozenProfileFromSource(sourceProtocol)),
  };
}

function childJobName(protocol, candidateId) {
  return `${protocol.harbor.jobNamePrefix}-q003-${candidateId}`;
}

export function buildGeneration003HarborConfig({ protocol, candidateId, runtimeRoot, preparedRoot, knowledgeRoot, generation001RuntimeRoot }) {
  const validIds = new Set(["baseline", ...CHILD_IDS]);
  if (!validIds.has(candidateId)) throw new Error(`Unknown generation-003 candidate: ${candidateId}`);
  const profile = protocol.frozenEvaluationProfile;
  const candidatePreparedRoot = candidateId === "baseline"
    ? preparedRoot
    : legacyPreparedRoot(runtimeRoot);
  return {
    job_name: childJobName(protocol, candidateId),
    jobs_dir: toHarborPath(path.join(runtimeRoot, "jobs", "q003", candidateId)),
    n_attempts: 1,
    install_only: false,
    timeout_multiplier: 1,
    debug: false,
    n_concurrent_trials: 1,
    quiet: false,
    retry: {
      max_retries: 0,
      exclude_exceptions: protocol.harbor.retryExcludeExceptions,
      wait_multiplier: 1,
      min_wait_sec: 1,
      max_wait_sec: 60,
    },
    environment: {
      type: "docker",
      force_build: false,
      delete: true,
      cpu_enforcement_policy: "auto",
      memory_enforcement_policy: "auto",
      mounts: [
        {
          type: "bind",
          source: toHarborPath(path.join(knowledgeRoot, ...protocol.knowledge.referenceBundlePath.split("/"))),
          target: "/knowledge",
          read_only: true,
          bind: { create_host_path: false },
        },
        {
          type: "bind",
          source: protocol.harbor.authenticationMount.source,
          target: protocol.harbor.authenticationMount.target,
          bind: { create_host_path: false },
        },
      ],
      extra_docker_compose: [],
      kwargs: {},
      extra_allowed_hosts: [],
    },
    verifier: { disable: false },
    metrics: [],
    agents: [{
      name: profile.agent.name,
      model_name: profile.agent.model,
      n_concurrent: 1,
      skills: [toHarborPath(path.join(candidatePreparedRoot, "inputs", candidateId, protocol.target.logicalName))],
      extra_allowed_hosts: [],
      kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
      env: { PI_CODING_AGENT_DIR: protocol.harbor.authenticationMount.target },
      mcp_servers: [],
    }],
    datasets: [{
      path: toHarborPath(path.join(generation001RuntimeRoot, "prepared", "tasks")),
      overwrite: false,
      task_names: ["q003"],
    }],
    tasks: [],
    artifacts: [],
    extra_instruction_paths: [],
  };
}

export function buildChildHarborConfig(options) {
  if (!CHILD_IDS.includes(options.candidateId)) {
    throw new Error(`Child Harbor config cannot target ${options.candidateId}`);
  }
  return buildGeneration003HarborConfig(options);
}

export function buildDevelopmentOperatorConfig({ protocol, runtimeRoot, preparedRoot, resolvedJobDirectories }) {
  const requiredIds = ["baseline", ...CHILD_IDS];
  const resolved = requireObject(resolvedJobDirectories, "resolved generation-003 job directories");
  for (const candidateId of requiredIds) {
    requireString(resolved[candidateId], `resolved job directory ${candidateId}`);
  }
  const candidates = [{
    candidateId: "baseline",
    skill: toHarborPath(path.join(preparedRoot, "inputs", "baseline", protocol.target.logicalName)),
    jobDirectory: toHarborPath(resolved.baseline),
  }, ...protocol.target.children.map((child) => ({
    candidateId: child.candidateId,
    parentCandidateId: "baseline",
    operatorId: OPERATOR_ID,
    skill: toHarborPath(path.join(preparedRoot, "inputs", child.candidateId, protocol.target.logicalName)),
    jobDirectory: toHarborPath(resolved[child.candidateId]),
  }))];
  return {
    schemaVersion: 1,
    evolution: {
      id: protocol.experimentId,
      generation: 0,
      generationId: "generation-003",
      outputDir: "../../../operator-analysis/generation-003",
      baselineCandidateId: "baseline",
    },
    harbor: {
      rewardKey: protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: protocol.frozenEvaluationProfile.passThreshold,
      requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
      requireNoErrors: true,
      requiredEnv: [],
      diagnosticChars: 3000,
    },
    coevolution: {
      candidateSurvivors: 2,
      operatorSurvivors: 2,
      nextOperatorCount: 2,
      minimumOperatorTrials: 2,
      allowCaseRegressionsForCredit: false,
      complementaryRepair: true,
    },
    operators: [
      {
        operatorId: OPERATOR_ID,
        instruction: protocol.operator.instruction,
        parentOperatorIds: protocol.operator.parentOperatorIds,
        origin: protocol.operator.origin,
      },
      {
        operatorId: protocol.operator.controlOperatorId,
        instruction: protocol.operator.controlInstruction,
        parentOperatorIds: [],
        origin: "control",
      },
    ],
    candidates,
    holdout: {
      baseline: { candidateId: "baseline", jobDirectory: "../../../not-opened/generation-003-holdout-baseline" },
      candidate: { candidateId: CHILD_IDS[0], jobDirectory: "../../../not-opened/generation-003-holdout-candidate" },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

export function buildSameSessionWrapper({ protocol, preparedRoot }) {
  const configs = CHILD_IDS.map((candidateId) => toHarborPath(path.join(preparedRoot, "configs", "harbor", "q003", `${candidateId}.yaml`)));
  const compilerRoots = CHILD_IDS.map((candidateId) => toHarborPath(path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName)));
  const runtimeRoot = path.resolve(preparedRoot, "..");
  const jobDirectories = CHILD_IDS.map((candidateId) => toHarborPath(path.join(runtimeRoot, "jobs", "q003", candidateId, childJobName(protocol, candidateId))));
  const authStringFields = protocol.harbor.authenticationSourceContract.requiredNonEmptyStringFields;
  const image = protocol.harbor.containerPreflight.image;
  const imageId = protocol.harbor.containerPreflight.imageId;
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/readable/auth.json-or-pi-auth-directory" >&2
  exit 64
fi

auth_source="$1"
auth_mount=${JSON.stringify(protocol.harbor.authenticationMount.source)}
if [[ -f "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source"
elif [[ -d "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source/auth.json"
else
  echo "auth source must be an ordinary auth.json file or Pi auth directory" >&2
  exit 65
fi
if [[ ! -f "$auth_json" || -L "$auth_json" ]]; then
  echo "auth.json must be an ordinary readable file" >&2
  exit 65
fi

auth_has_openai_codex() {
  python3 - "$1" <<'PY'
import json
import math
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as stream:
        payload = json.load(stream)
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit(1)
credential = payload.get("openai-codex") if isinstance(payload, dict) else None
required_strings = ${JSON.stringify(authStringFields)}
def contains_shell_path(value):
    if isinstance(value, dict):
        return any(str(key).casefold() == "shellpath" or contains_shell_path(item) for key, item in value.items())
    if isinstance(value, list):
        return any(contains_shell_path(item) for item in value)
    return False
valid = (
    isinstance(credential, dict)
    and all(isinstance(credential.get(field), str) and credential[field].strip() for field in required_strings)
    and isinstance(credential.get("expires"), (int, float))
    and not isinstance(credential.get("expires"), bool)
    and math.isfinite(credential["expires"])
    and not contains_shell_path(payload)
)
raise SystemExit(0 if valid else 1)
PY
}

if ! auth_has_openai_codex "$auth_json"; then
  echo "auth.json must contain a complete openai-codex credential and no shellPath setting" >&2
  exit 66
fi
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
for job_directory in ${jobDirectories.map((item) => JSON.stringify(item)).join(" ")}; do
  if [[ -e "$job_directory" ]]; then
    echo "canonical child job output already exists; preserve or remediate it before rerun" >&2
    exit 68
  fi
done

mkdir -m 700 -- "$auth_mount"
cleanup() { rm -rf -- "$auth_mount"; }
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
mapfile -t isolated_auth_entries < <(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
if [[ \${#isolated_auth_entries[@]} -ne 1 || "\${isolated_auth_entries[0]}" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
if [[ -e "$auth_mount/settings.json" ]] || grep -R -i -F -q '"shellPath"' "$auth_mount"; then
  echo "isolated Pi directory must not contain settings.json or shellPath" >&2
  exit 69
fi
if ! auth_has_openai_codex "$auth_mount/auth.json"; then
  echo "isolated auth.json failed the required provider contract" >&2
  exit 69
fi

actual_image_id="$(docker image inspect --format '{{.Id}}' ${image})"
if [[ "$actual_image_id" != ${JSON.stringify(imageId)} ]]; then
  echo "q003 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash \
  --mount "type=bind,source=$auth_mount,target=/root/.pi/agent" \
  --mount "type=bind,source=${compilerRoots[0]},target=/candidate-extractive,readonly" \
  --mount "type=bind,source=${compilerRoots[1]},target=/candidate-contrast,readonly" \
  ${image} \
  -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
test -r /candidate-extractive/scripts/harbor_answer.py
test -r /candidate-contrast/scripts/harbor_answer.py
python -B /candidate-extractive/scripts/harbor_answer.py --help >/dev/null
python -B /candidate-contrast/scripts/harbor_answer.py --help >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'"shellPath"'"'"' /root/.pi/agent
tmp_probe="$(mktemp /tmp/g003-preflight.XXXXXX)"
rm -f "$tmp_probe"
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(configs[0])} --yes
uvx --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(configs[1])} --yes
`;
}

export function buildFreshBaselineWrapper({ protocol, preparedRoot }) {
  const runtimeRoot = path.resolve(preparedRoot, "..");
  const config = toHarborPath(path.join(preparedRoot, "configs", "harbor", "q003", "baseline.yaml"));
  const skillRoot = toHarborPath(path.join(preparedRoot, "inputs", "baseline", protocol.target.logicalName));
  const jobDirectory = toHarborPath(path.join(runtimeRoot, "jobs", "q003", "baseline", childJobName(protocol, "baseline")));
  const prepareScript = toHarborPath(SCRIPT_PATH);
  const publishScript = toHarborPath(path.join(GENERATION_ROOT, "scripts", "publish-generation-003.js"));
  const runtime = toHarborPath(runtimeRoot);
  const authMount = protocol.harbor.authenticationMount.source;
  const image = protocol.harbor.containerPreflight.image;
  const imageId = protocol.harbor.containerPreflight.imageId;
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/readable/auth.json-or-pi-auth-directory" >&2
  exit 64
fi
auth_source="$1"
if [[ -f "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source"
elif [[ -d "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source/auth.json"
else
  echo "auth source must be an ordinary auth.json file or Pi auth directory" >&2
  exit 65
fi
if [[ ! -f "$auth_json" || -L "$auth_json" ]]; then
  echo "auth.json must be an ordinary readable file" >&2
  exit 65
fi
if [[ -e ${JSON.stringify(jobDirectory)} ]]; then
  echo "fresh generation-003 baseline job already exists; never overwrite it" >&2
  exit 68
fi

# Both checks are model-free and must pass before the auth mount or Harbor call.
node ${JSON.stringify(publishScript)} verify-resume --runtime ${JSON.stringify(runtime)}
node ${JSON.stringify(prepareScript)} verify-auth-source --output ${JSON.stringify(runtime)} --auth-source "$auth_json"

auth_mount=${JSON.stringify(authMount)}
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
mkdir -m 700 -- "$auth_mount"
cleanup() { rm -rf -- "$auth_mount"; }
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
if [[ "$(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
actual_image_id="$(docker image inspect --format '{{.Id}}' ${image})"
if [[ "$actual_image_id" != ${JSON.stringify(imageId)} ]]; then
  echo "q003 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash \
  --mount "type=bind,source=$auth_mount,target=/root/.pi/agent" \
  --mount "type=bind,source=${skillRoot},target=/candidate-baseline,readonly" \
  ${image} \
  -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
test -r /candidate-baseline/scripts/runtime_smoke.py
python -B /candidate-baseline/scripts/runtime_smoke.py >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'shellPath'"'"' /root/.pi/agent
tmp_probe="$(mktemp /tmp/g003-baseline-preflight.XXXXXX)"
rm -f "$tmp_probe"
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(config)} --yes
`;
}

async function materializePrepared({ context, runtimeRoot, stagingRoot, legacyPreparation = null }) {
  const preparedRoot = analysisPreparedRoot(runtimeRoot);
  const preservedPreparedRoot = legacyPreparedRoot(runtimeRoot);
  await copyTree(
    context.lineageParentEvidence.baselineRoot,
    path.join(stagingRoot, "inputs", "baseline", context.protocol.target.logicalName),
  );
  for (const child of context.children) {
    await copyTree(child.source, path.join(stagingRoot, "inputs", child.candidateId, context.protocol.target.logicalName));
  }
  const lineageParent = {
    generationId: "generation-001",
    candidateId: "00-baseline",
    treeSha256: context.protocol.target.baseline.expectedTreeSha256,
    preparationReceiptSha256: context.lineageParentEvidence.preparationReceiptSha256,
    resultImported: false,
    fitnessImported: false,
    operatorCreditImported: false,
  };
  await writeExclusive(path.join(stagingRoot, "lineage-parent", "generation-001.json"), canonicalJson(lineageParent));
  await writeExclusive(path.join(stagingRoot, "lineage-parent", "generation-001-diagnostic-operator-provenance.json"), canonicalJson(context.lineageParentEvidence.diagnosticProvenance));
  await writeExclusive(path.join(stagingRoot, "diagnostics", "generation-002-donor-trace.json"), canonicalJson(context.protocol.diagnosticDonorTrace));
  await writeExclusive(path.join(stagingRoot, "comparison-policy-v2.json"), canonicalJson(context.protocol.comparisonPolicy));

  const artifacts = [];
  for (const candidateId of ["baseline", ...CHILD_IDS]) {
    const relative = `configs/harbor/q003/${candidateId}.yaml`;
    await writeExclusive(path.join(stagingRoot, ...relative.split("/")), yamlDocument(buildGeneration003HarborConfig({
      protocol: context.protocol,
      candidateId,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot: context.knowledgeRoot,
      generation001RuntimeRoot: context.generation001RuntimeRoot,
    })));
    artifacts.push({ kind: candidateId === "baseline" ? "harbor-fresh-baseline-job-config" : "harbor-child-job-config", candidateId, path: relative });
  }
  const wrapperRelative = "evidence/run-q003-clean-pi.sh.disabled";
  await writeExclusive(
    path.join(stagingRoot, wrapperRelative),
    buildSameSessionWrapper({ protocol: context.protocol, preparedRoot: preservedPreparedRoot }),
  );
  artifacts.push({ kind: "disabled-legacy-child-wrapper-evidence", path: wrapperRelative });
  const baselineWrapperRelative = "run-q003-baseline-clean-pi.sh";
  await writeExclusive(
    path.join(stagingRoot, baselineWrapperRelative),
    buildFreshBaselineWrapper({ protocol: context.protocol, preparedRoot }),
  );
  artifacts.push({ kind: "fresh-baseline-after-resume-wrapper", path: baselineWrapperRelative });
  for (const artifact of artifacts) artifact.sha256 = await sha256File(path.join(stagingRoot, ...artifact.path.split("/")));

  const baselineCopied = await treeDigest(path.join(stagingRoot, "inputs", "baseline", context.protocol.target.logicalName));
  equal(baselineCopied, context.baselineDigest, "fresh generation-003 baseline tree");
  const candidates = [{
    candidateId: "baseline",
    treeSha256: baselineCopied.sha256,
    fileCount: baselineCopied.fileCount,
    totalBytes: baselineCopied.totalBytes,
    evidenceMode: "fresh-generation-003-original-job",
  }];
  for (const child of context.children) {
    const copied = await treeDigest(path.join(stagingRoot, "inputs", child.candidateId, context.protocol.target.logicalName));
    equal(copied, child.digest, `${child.candidateId} copied tree`);
    candidates.push({
      candidateId: child.candidateId,
      treeSha256: copied.sha256,
      fileCount: copied.fileCount,
      totalBytes: copied.totalBytes,
      ...child.lineage,
      evidenceMode: context.protocol.effectiveEvidence[child.candidateId].mode,
    });
  }
  const immutablePayload = await treeDigest(stagingRoot);
  const receipt = {
    schemaVersion: 2,
    experimentId: context.protocol.experimentId,
    generationId: "generation-003",
    preparationRoots: {
      analysisDirectory: ANALYSIS_PREPARED_DIRECTORY,
      preservedLegacyDirectory: LEGACY_PREPARED_DIRECTORY,
      preservedLegacyDirectoryMutated: false,
      externalResumeAttestationAmended: false,
    },
    knowledgeCommit: context.protocol.knowledge.commit,
    protocolSha256: context.protocolSha256,
    frozenEvaluationProfileSha256: context.sourceProfileSha256,
    logicalSkillName: context.protocol.target.logicalName,
    q003Task: {
      reuseGenerationId: "generation-001",
      treeSha256: context.protocol.preparationTask.expectedTreeSha256,
      source: "generation-001/prepared/tasks/q003",
      copied: false,
    },
    lineageParentEvidence: {
      candidateId: "00-baseline",
      generationId: "generation-001",
      treeSha256: context.protocol.target.baseline.expectedTreeSha256,
      preparationReceiptSha256: context.lineageParentEvidence.preparationReceiptSha256,
      resultImported: false,
      fitnessImported: false,
      operatorCreditImported: false,
    },
    comparisonPolicy: context.protocol.comparisonPolicy,
    effectiveEvidence: context.protocol.effectiveEvidence,
    privateAuthenticationSeal: {
      path: context.protocol.privateAuthenticationSeal.path,
      requiredBeforeContrastRetry: true,
      requiredBeforeFreshBaseline: true,
      payloadDigestPublished: false,
    },
    diagnosticOperatorProvenance: context.lineageParentEvidence.diagnosticProvenance,
    diagnosticDonorTrace: context.protocol.diagnosticDonorTrace,
    candidates,
    operator: {
      operatorId: OPERATOR_ID,
      instructionSha256: sha256Bytes(Buffer.from(context.protocol.operator.instruction, "utf8")),
      parentOperatorIds: [],
      origin: "seed",
      historicalCandidateRealizationOrigin: context.protocol.operator.historicalCandidateRealizationOrigin,
      parentCandidateId: "00-baseline",
      parentTreeSha256: context.protocol.target.baseline.expectedTreeSha256,
      generation: 0,
      previousGenerationLogImported: false,
      minimumOperatorTrials: 2,
      resolvedConfigMaterializedDuringPreparation: false,
    },
    callAccounting: context.protocol.callAccounting,
    artifacts,
    immutablePayload,
    legacyPreparation,
  };
  await writeExclusive(path.join(stagingRoot, "receipt.json"), canonicalJson(receipt));
  return receipt;
}

async function verifyPrepared({ context, runtimeRoot }) {
  const preparedRoot = analysisPreparedRoot(runtimeRoot);
  await assertOrdinaryDirectory(preparedRoot, "generation-003 prepared-v2 overlay");
  const receipt = await readJson(path.join(preparedRoot, "receipt.json"));
  assertValue(receipt.schemaVersion, 2, "prepared receipt schema");
  assertValue(receipt.generationId, "generation-003", "prepared generation");
  equal(receipt.preparationRoots, {
    analysisDirectory: ANALYSIS_PREPARED_DIRECTORY,
    preservedLegacyDirectory: LEGACY_PREPARED_DIRECTORY,
    preservedLegacyDirectoryMutated: false,
    externalResumeAttestationAmended: false,
  }, "prepared root isolation policy");
  assertValue(receipt.protocolSha256, context.protocolSha256, "prepared protocol digest");
  equal(receipt.comparisonPolicy, context.protocol.comparisonPolicy, "prepared comparison policy");
  equal(receipt.effectiveEvidence, context.protocol.effectiveEvidence, "prepared effective evidence policy");
  equal(receipt.diagnosticOperatorProvenance, context.lineageParentEvidence.diagnosticProvenance, "prepared diagnostic provenance");
  equal(receipt.diagnosticDonorTrace, context.protocol.diagnosticDonorTrace, "prepared donor trace");
  const expectedCandidates = [{
    candidateId: "baseline",
    treeSha256: context.baselineDigest.sha256,
    fileCount: context.baselineDigest.fileCount,
    totalBytes: context.baselineDigest.totalBytes,
    evidenceMode: "fresh-generation-003-original-job",
  }, ...context.children.map((child) => ({
    candidateId: child.candidateId,
    treeSha256: child.digest.sha256,
    fileCount: child.digest.fileCount,
    totalBytes: child.digest.totalBytes,
    ...child.lineage,
    evidenceMode: context.protocol.effectiveEvidence[child.candidateId].mode,
  }))];
  equal(receipt.candidates, expectedCandidates, "prepared candidates");
  equal(receipt.callAccounting, context.protocol.callAccounting, "prepared call accounting");
  equal(await treeDigest(preparedRoot, { omitRootFiles: ["receipt.json"] }), receipt.immutablePayload, "prepared immutable payload");
  if (receipt.legacyPreparation !== null && receipt.legacyPreparation !== undefined) {
    const preservedRoot = assertInside(
      runtimeRoot,
      path.join(runtimeRoot, receipt.legacyPreparation.preservedDirectory),
      "preserved legacy prepared root",
    );
    await assertOrdinaryDirectory(preservedRoot, "preserved legacy prepared root");
    assertValue(
      await sha256File(path.join(preservedRoot, "receipt.json")),
      receipt.legacyPreparation.receiptFileSha256,
      "preserved legacy receipt bytes",
    );
    equal(
      await treeDigest(preservedRoot, { omitRootFiles: ["receipt.json"] }),
      receipt.legacyPreparation.immutablePayload,
      "preserved legacy immutable payload",
    );
    assertValue(receipt.legacyPreparation.preservedDirectoryMutated, false, "legacy prepared mutation policy");
    assertValue(receipt.legacyPreparation.externalResumeAttestationAmended, false, "external resume attestation amendment policy");
    assertValue(receipt.legacyPreparation.legacyOperatorConfigConsumed, false, "legacy operator config consumption");
    assertValue(receipt.legacyPreparation.legacyGeneration001BaselineRecordFitnessImported, false, "legacy baseline fitness import");
  }
  for (const forbidden of [
    path.join(preparedRoot, "tasks"),
  ]) if (await exists(forbidden)) throw new Error(`generation-003 forbidden prepared path exists: ${forbidden}`);
  equal(
    (await fs.readdir(path.join(preparedRoot, "configs", "harbor", "q003"))).sort(),
    ["baseline", ...CHILD_IDS].map((id) => `${id}.yaml`).sort(),
    "generation-003 Harbor config set",
  );
  equal(
    await treeDigest(path.join(preparedRoot, "inputs", "baseline", context.protocol.target.logicalName)),
    context.baselineDigest,
    "fresh generation-003 baseline prepared tree",
  );
  for (const child of context.children) {
    equal(await treeDigest(path.join(preparedRoot, "inputs", child.candidateId, context.protocol.target.logicalName)), child.digest, `${child.candidateId} prepared tree`);
  }
  const lineageParent = await readJson(path.join(preparedRoot, "lineage-parent", "generation-001.json"));
  assertValue(lineageParent.resultImported, false, "prepared lineage result import");
  assertValue(lineageParent.fitnessImported, false, "prepared lineage fitness import");
  assertValue(lineageParent.treeSha256, context.protocol.target.baseline.expectedTreeSha256, "prepared lineage tree");
  equal(await readJson(path.join(preparedRoot, "lineage-parent", "generation-001-diagnostic-operator-provenance.json")), context.lineageParentEvidence.diagnosticProvenance, "prepared diagnostic provenance file");
  equal(await readJson(path.join(preparedRoot, "diagnostics", "generation-002-donor-trace.json")), context.protocol.diagnosticDonorTrace, "prepared donor trace file");
  equal(await readJson(path.join(preparedRoot, "comparison-policy-v2.json")), context.protocol.comparisonPolicy, "prepared comparison policy file");
  for (const artifact of receipt.artifacts) {
    const absolute = assertInside(preparedRoot, path.join(preparedRoot, ...artifact.path.split("/")), `prepared artifact ${artifact.path}`);
    assertValue(await sha256File(absolute), artifact.sha256, `prepared artifact ${artifact.path}`);
    if (["harbor-child-job-config", "harbor-fresh-baseline-job-config"].includes(artifact.kind)) {
      equal(parseYaml(await fs.readFile(absolute, "utf8")), buildGeneration003HarborConfig({
        protocol: context.protocol,
        candidateId: artifact.candidateId,
        runtimeRoot,
        preparedRoot,
        knowledgeRoot: context.knowledgeRoot,
        generation001RuntimeRoot: context.generation001RuntimeRoot,
      }), `prepared Harbor config ${artifact.candidateId}`);
    } else if (artifact.kind === "disabled-legacy-child-wrapper-evidence") {
      assertValue(
        await fs.readFile(absolute, "utf8"),
        buildSameSessionWrapper({ protocol: context.protocol, preparedRoot: legacyPreparedRoot(runtimeRoot) }),
        "disabled legacy-bound wrapper evidence",
      );
    } else if (artifact.kind === "fresh-baseline-after-resume-wrapper") {
      assertValue(await fs.readFile(absolute, "utf8"), buildFreshBaselineWrapper({ protocol: context.protocol, preparedRoot }), "prepared fresh baseline wrapper");
    } else throw new Error(`Unknown generation-003 artifact kind: ${artifact.kind}`);
  }
  return receipt;
}

async function upgradeLegacyPrepared({ context, runtimeRoot, legacyRoot, analysisRoot, legacyReceipt }) {
  const upgrade = context.protocol.preparationUpgrade;
  assertValue(legacyReceipt.schemaVersion, upgrade.legacySchemaVersion, "legacy prepared receipt schema");
  assertValue(legacyReceipt.protocolSha256, upgrade.legacyProtocolSha256, "legacy prepared protocol digest");
  assertValue(await sha256File(path.join(legacyRoot, "receipt.json")), upgrade.legacyReceiptFileSha256, "legacy prepared receipt bytes");
  assertValue(legacyReceipt.immutablePayload?.sha256, upgrade.legacyImmutablePayloadSha256, "legacy immutable payload declaration");
  equal(
    await treeDigest(legacyRoot, { omitRootFiles: ["receipt.json"] }),
    legacyReceipt.immutablePayload,
    "legacy prepared immutable payload",
  );
  if (await exists(analysisRoot)) throw new Error(`Prepared-v2 overlay already exists: ${analysisRoot}`);
  const stagingRoot = path.join(runtimeRoot, `.prepared-v2.tmp-${process.pid}-${randomUUID()}`);
  await fs.mkdir(stagingRoot, { recursive: false });
  const legacyPreparation = {
    schemaVersion: 1,
    preservedDirectory: LEGACY_PREPARED_DIRECTORY,
    receiptFileSha256: upgrade.legacyReceiptFileSha256,
    protocolSha256: upgrade.legacyProtocolSha256,
    immutablePayload: legacyReceipt.immutablePayload,
    existingArtifactsPreservedBytewise: true,
    preservedDirectoryMutated: false,
    externalResumeAttestationAmended: false,
    legacyOperatorConfigConsumed: false,
    legacyGeneration001BaselineRecordFitnessImported: false,
  };
  try {
    const receipt = await materializePrepared({
      context,
      runtimeRoot,
      stagingRoot,
      legacyPreparation,
    });
    for (const legacyArtifact of legacyReceipt.artifacts) {
      if (legacyArtifact.kind === "operator-development-config") continue;
      const replacement = legacyArtifact.kind === "clean-pi-preflight-wrapper"
        ? receipt.artifacts.find((artifact) => artifact.kind === "disabled-legacy-child-wrapper-evidence")
        : receipt.artifacts.find(
          (artifact) => artifact.path === legacyArtifact.path && artifact.candidateId === legacyArtifact.candidateId,
        );
      if (!replacement) throw new Error(`Prepared v2 omits preserved legacy artifact ${legacyArtifact.path}`);
      assertValue(replacement.sha256, legacyArtifact.sha256, `preserved legacy artifact ${legacyArtifact.path}`);
    }
    assertValue(await sha256File(path.join(legacyRoot, "receipt.json")), upgrade.legacyReceiptFileSha256, "post-overlay legacy receipt bytes");
    equal(
      await treeDigest(legacyRoot, { omitRootFiles: ["receipt.json"] }),
      legacyReceipt.immutablePayload,
      "post-overlay legacy prepared payload",
    );
    await fs.rename(stagingRoot, analysisRoot);
    return { mode: "prepared-v2-overlay-from-v1", runtimeRoot, receipt };
  } catch (error) {
    if (await exists(stagingRoot)) await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareGeneration003(options = {}) {
  const context = await validateInputs(options);
  const runtimeRoot = assertRuntimeOutput(path.resolve(options.outputRoot ?? DEFAULT_OUTPUT), context.repoRoot);
  const analysisRoot = analysisPreparedRoot(runtimeRoot);
  const legacyRoot = legacyPreparedRoot(runtimeRoot);
  if (await exists(analysisRoot)) {
    return { mode: "verified-existing", runtimeRoot, receipt: await verifyPrepared({ context, runtimeRoot }) };
  }
  if (await exists(legacyRoot)) {
    const legacyReceipt = await readJson(path.join(legacyRoot, "receipt.json"));
    if (legacyReceipt.schemaVersion !== 1) {
      throw new Error("Existing legacy prepared root must remain the pinned schema-1 payload");
    }
    return upgradeLegacyPrepared({ context, runtimeRoot, legacyRoot, analysisRoot, legacyReceipt });
  }
  await fs.mkdir(runtimeRoot, { recursive: true });
  const stagingRoot = path.join(runtimeRoot, `.prepared-v2.tmp-${process.pid}-${randomUUID()}`);
  await fs.mkdir(stagingRoot, { recursive: false });
  try {
    const receipt = await materializePrepared({ context, runtimeRoot, stagingRoot });
    await fs.rename(stagingRoot, analysisRoot);
    return { mode: "prepared", runtimeRoot, receipt };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyGeneration003(options = {}) {
  const context = await validateInputs(options);
  const runtimeRoot = assertRuntimeOutput(path.resolve(options.outputRoot ?? DEFAULT_OUTPUT), context.repoRoot);
  return { mode: "verified", runtimeRoot, receipt: await verifyPrepared({ context, runtimeRoot }) };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--output": "outputRoot",
    "--protocol": "protocolPath",
    "--source-protocol": "sourceProtocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
    "--auth-source": "authSource",
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
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-auth --auth-source PATH [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-auth-source --auth-source PATH [options]\n\nThese commands perform no Harbor or model calls. Auth commands never print credential contents or payload digests.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const result = command === "prepare"
    ? await prepareGeneration003(options)
    : command === "verify"
      ? await verifyGeneration003(options)
      : command === "seal-auth"
        ? await sealGeneration003Authentication(options)
        : command === "verify-auth-source"
          ? await verifyGeneration003Authentication(options)
          : null;
  if (!result) throw new Error(`Unknown command: ${command}`);
  process.stdout.write(canonicalJson({
    mode: result.mode,
    runtimeRoot: result.runtimeRoot,
    receipt: result.runtimeRoot ? path.join(analysisPreparedRoot(result.runtimeRoot), "receipt.json") : undefined,
    sealFileSha256: result.sealFileSha256,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
