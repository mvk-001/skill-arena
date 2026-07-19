#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { canonicalJson, objectDigest, treeDigest } from "../../scripts/prepare-meta-evolution.js";
import { piAuthDocumentHasRequiredShape } from "../../generation-002/scripts/prepare-generation-002.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(GENERATION_ROOT, "..", "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-005");

export const SEALED_PROTOCOL_SHA256 = "cb4c0c78d2de4ba40ce71cb61f61f85d371b80cb05167b6cc7a3b495e64e58ca";
export const PARENT_ID = "extractive-one-shot-answer";
export const FIRST_STAGE_ID = "q016-first-gate";
export const FIRST_TASK_ID = "q016";
export const REMAINING_STAGE_ID = "remaining-forward-validation";
export const REMAINING_TASK_IDS = Object.freeze(["q022", "q019", "q001"]);
export const DIAGNOSTIC_CONTRACT_ID = "provider-context-limit.v1";
export const AUTH_SEAL_RELATIVE_PATH = "private/auth-payload-seal.json";
export const OPERATOR_ANALYZER_RELATIVE_PATH = "skills/harbor-operator-coevolution/scripts/harbor_operator_report_only.py";
export const SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH = "skills/harbor-operator-coevolution/scripts/harbor_candidate_diagnostic.py";
export const HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS = Object.freeze([
  "import_path",
  "override_cpus",
  "override_memory_mb",
  "override_storage_mb",
  "override_gpus",
  "override_tpu",
]);
export const HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS = Object.freeze(["override_timeout_sec", "max_timeout_sec"]);

const IMAGE = "semantic-okf-harbor-runtime:1.0";
const IMAGE_ID = "sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5";
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PORTABLE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RETRY_EXCLUSIONS = [
  "ApiUsageLimitError",
  "RewardFileEmptyError",
  "VerifierOutputParseError",
  "AgentTimeoutError",
  "RewardFileNotFoundError",
  "VerifierTimeoutError",
];

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

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

function requireSha(value, label) {
  const digest = requireString(value, label);
  if (!HEX_SHA256.test(digest) || digest === "0".repeat(64)) throw new Error(`${label} must be a sealed lowercase SHA-256 digest`);
  return digest;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} drift`);
}

function posixRelative(root, value) {
  return path.relative(root, value).split(path.sep).join("/");
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

function assertRuntime(runtimeRoot, repoRoot) {
  return assertInside(path.join(repoRoot, ".tmp"), runtimeRoot, "generation-005 runtime");
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

async function writeExclusive(filePath, contents, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "wx", ...options });
}

async function copyTree(source, destination) {
  await treeDigest(source);
  await fs.mkdir(destination, { recursive: true });
  async function visit(from, to) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
      const sourceEntry = path.join(from, entry.name);
      const destinationEntry = path.join(to, entry.name);
      const stat = await fs.lstat(sourceEntry);
      if (stat.isSymbolicLink() || entry.isSymbolicLink()) throw new Error(`Trees cannot contain links: ${sourceEntry}`);
      if (entry.isDirectory()) {
        await fs.mkdir(destinationEntry, { recursive: false });
        await visit(sourceEntry, destinationEntry);
      } else if (entry.isFile()) {
        await fs.copyFile(sourceEntry, destinationEntry, fs.constants.COPYFILE_EXCL);
      } else {
        throw new Error(`Unsupported tree entry: ${sourceEntry}`);
      }
    }
  }
  await visit(path.resolve(source), path.resolve(destination));
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function assertCleanPinnedKnowledge(knowledgeRoot, expectedCommit) {
  assertValue(gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]), expectedCommit, "knowledge commit");
  if (gitOutput(knowledgeRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("Knowledge checkout must remain clean during generation-005 preparation");
  }
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function yamlDocument(value) {
  return stringifyYaml(value, { indent: 2, lineWidth: 0, sortMapEntries: false });
}

function authContainsShellPath(value) {
  if (Array.isArray(value)) return value.some(authContainsShellPath);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => key.toLowerCase() === "shellpath" || authContainsShellPath(child));
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
  if (sourceStat.isSymbolicLink()) throw new Error("auth source cannot be a link");
  const authJson = sourceStat.isDirectory() ? path.join(source, "auth.json") : source;
  await assertOrdinaryFile(authJson, "Pi auth.json");
  const bytes = await fs.readFile(authJson);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`auth.json must be valid JSON: ${error.message}`, { cause: error });
  }
  if (!piAuthDocumentHasRequiredShape(payload) || authContainsShellPath(payload)) {
    throw new Error("auth.json must contain the provider-only Pi credential shape and no shellPath key");
  }
  return { authJson, payloadSha256: sha256Bytes(bytes), byteLength: bytes.length, shapeSha256: objectDigest(authShape(payload)) };
}

export function validateGeneration005Protocol(protocol) {
  const value = requireObject(protocol, "generation-005 protocol");
  assertValue(value.schemaVersion, 1, "protocol.schemaVersion");
  assertValue(value.status, "cohort-sealed-before-candidate-lock-and-before-selected-task-release", "protocol.status");
  assertValue(value.generationId, "generation-005", "protocol.generationId");
  assertValue(value.target?.logicalName, "consult-semantic-okf", "target.logicalName");
  assertValue(value.target?.parent?.candidateId, PARENT_ID, "parent candidate ID");
  requireSha(value.target?.parent?.expectedTreeSha256, "parent tree digest");
  assertValue(value.target?.child?.candidateDataIntentionallyAbsent, true, "candidate absence at protocol seal");
  assertValue(value.target?.child?.protocolMustNotBeEditedToInsertCandidateData, true, "protocol immutability");
  assertValue(value.candidateLockContract?.writeMode, "exclusive-create-once", "candidate lock write mode");
  equal(value.candidateLockContract?.requiredExactValues?.feedbackTaskIds, ["q018"], "candidate feedback task IDs");
  equal(value.candidateLockContract?.requiredExactValues?.selectedTaskIdsObservedByCandidateAuthor, [], "candidate selected-task observations");
  equal(value.candidateLockContract?.requiredExactValues?.contaminatedTaskContentsObservedByCandidateAuthor, [], "candidate contamination observations");
  assertValue(value.candidateLockContract?.requiredExactValues?.holdoutOrHardContentsObservedByCandidateAuthor, false, "candidate holdout/hard observation");
  equal(value.discoverySelection?.selectedTaskIds, [FIRST_TASK_ID, ...REMAINING_TASK_IDS], "selected task IDs");
  equal(value.stages?.[0]?.taskIds, [FIRST_TASK_ID], "first stage tasks");
  equal(value.stages?.[1]?.taskIds, REMAINING_TASK_IDS, "remaining stage tasks");
  for (const taskId of [FIRST_TASK_ID, ...REMAINING_TASK_IDS]) {
    const task = requireObject(value.tasks?.[taskId], `tasks.${taskId}`);
    requireSha(task.expectedTreeSha256, `${taskId} tree digest`);
    if (!Number.isInteger(task.fileCount) || !Number.isInteger(task.totalBytes)) throw new Error(`${taskId} tree statistics must be integers`);
  }
  const profile = requireObject(value.frozenEvaluationProfile, "frozen evaluation profile");
  assertValue(profile.harbor?.version, "0.18.0", "Harbor version");
  assertValue(profile.harbor?.command, "uvx --offline --from harbor==0.18.0 harbor", "Harbor command");
  assertValue(profile.harbor?.nAttempts, 1, "Harbor attempts");
  assertValue(profile.harbor?.retry?.maxRetries, 0, "Harbor retries");
  assertValue(profile.environment?.image, IMAGE, "runtime image");
  assertValue(profile.environment?.imageId, IMAGE_ID, "runtime image ID");
  assertValue(profile.agent?.model, "openai-codex/gpt-5.3-codex-spark", "agent model");
  assertValue(profile.rewardKey, "reward", "reward key");
  equal(Object.keys(profile.requiredRewards ?? {}).sort(), ["evidence_contract_gate", "mechanical_qualification_gate", "minimum_document_gate"], "required reward keys");
  assertValue(value.diagnosticDisposition?.operatorConfigPath, "harbor.candidateAttributableDiagnosticPolicy.contracts", "diagnostic policy path");
  equal(value.diagnosticDisposition?.contracts, [DIAGNOSTIC_CONTRACT_ID], "diagnostic contracts");
  equal(value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID]?.exactRawSignals, {
    status: "provider-failure",
    failure_domain: "provider",
    terminal_outcome: "provider-context-limit",
    error_code: "context_length_exceeded",
  }, "context-limit raw signals");
  assertValue(value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID]?.evaluationAvailable, true, "context-limit availability");
  assertValue(value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID]?.score, 0, "context-limit score");
  assertValue(value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID]?.qualificationPassed, false, "context-limit qualification");
  assertValue(value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID]?.retryAuthorized, false, "context-limit retry");
  assertValue(value.diagnosticDisposition?.externalResumeAuthorizedByThisProtocol, false, "external resume authorization");
  assertValue(value.callBudget?.maximumAdditionalHarborInvocations, 4, "Harbor invocation ceiling");
  assertValue(value.callBudget?.maximumAdditionalModelExecutions, 8, "model execution ceiling");
  assertValue(value.callBudget?.harborBuiltInRetries, 0, "built-in retries");
  assertValue(value.callBudget?.automaticExternalRetries, 0, "automatic external retries");
  assertValue(value.callBudget?.selectiveExternalResumeAttemptsAuthorized, 0, "selective resume attempts");
  assertValue(value.authentication?.isolatedMount, "/tmp/skill-arena-knowledge-consult-g005-auth", "isolated auth mount");
  assertValue(value.authentication?.mountTarget, "/root/.pi/agent", "auth target");
  assertValue(value.authentication?.historicalSealReused, false, "historical auth reuse");
  assertValue(value.executionAuthorization?.protocolAloneAuthorizesLiveCalls, false, "protocol-only execution authorization");
  return value;
}

async function loadProtocol(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const expectedSha256 = options.expectedProtocolSha256 ?? SEALED_PROTOCOL_SHA256;
  assertValue(await sha256File(protocolPath), expectedSha256, "sealed generation-005 protocol file digest");
  const protocol = validateGeneration005Protocol(await readJson(protocolPath, "generation-005 protocol"));
  return { repoRoot, protocolPath, protocol, protocolSha256: expectedSha256, generationRoot: path.dirname(protocolPath) };
}

function candidateLockPath(context) {
  return assertInside(context.repoRoot, path.join(context.repoRoot, ...context.protocol.target.child.candidateLockPath.split("/")), "candidate lock path");
}

async function discoverCandidateRoot(context, requested) {
  if (requested) return assertInside(path.join(context.generationRoot, "candidates"), path.resolve(requested), "candidate root");
  const candidatesRoot = path.join(context.generationRoot, "candidates");
  await assertOrdinaryDirectory(candidatesRoot, "generation-005 candidates root");
  const entries = [];
  for (const entry of await fs.readdir(candidatesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) entries.push(path.join(candidatesRoot, entry.name));
  }
  if (entries.length !== 1) throw new Error("seal-candidate requires exactly one completed candidate directory or --candidate-root");
  return entries[0];
}

function candidateIdCheck(value) {
  const candidateId = requireString(value, "candidate ID");
  if (!PORTABLE_BASENAME.test(candidateId) || candidateId === "baseline" || candidateId === PARENT_ID) {
    throw new Error("candidate ID must be a nonempty portable basename distinct from baseline and the parent");
  }
  return candidateId;
}

async function validateCanonicalSkill(source, logicalName, expected, label) {
  await assertOrdinaryDirectory(source, `${label} skill`);
  const skill = await fs.readFile(path.join(source, "SKILL.md"), "utf8");
  const frontmatter = skill.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter || parseYaml(frontmatter[1])?.name !== logicalName || path.basename(source) !== logicalName) {
    throw new Error(`${label} must preserve canonical skill name ${logicalName}`);
  }
  const digest = await treeDigest(source);
  if (expected) equal(digest, expected, `${label} skill tree`);
  return digest;
}

function resolveBoundArtifact(realizationPath, relativePath, repoRoot, label) {
  const raw = requireString(relativePath, `${label} path`);
  const absolute = path.resolve(path.dirname(realizationPath), ...raw.split("/"));
  return assertInside(repoRoot, absolute, label);
}

async function validateCandidateArtifacts(context, options = {}) {
  const root = await discoverCandidateRoot(context, options.candidateRoot);
  await assertOrdinaryDirectory(root, "candidate root");
  const candidateId = candidateIdCheck(path.basename(root));
  const manifestPath = path.join(root, "candidate-manifest.json");
  const realizationPath = path.join(root, "operator-realization.json");
  await Promise.all([
    assertOrdinaryFile(manifestPath, "candidate manifest"),
    assertOrdinaryFile(realizationPath, "operator realization"),
  ]);
  const [manifest, realization] = await Promise.all([
    readJson(manifestPath, "candidate manifest"),
    readJson(realizationPath, "operator realization"),
  ]);
  for (const [label, document] of [["candidate manifest", manifest], ["operator realization", realization]]) {
    assertValue(document.schemaVersion, 2, `${label} schema`);
    assertValue(document.generationId, "generation-005", `${label} generation`);
    assertValue(document.candidateId, candidateId, `${label} candidate ID`);
    assertValue(document.parentCandidateId, PARENT_ID, `${label} parent candidate ID`);
  }
  equal(manifest.feedbackTaskIds, ["q018"], "candidate manifest feedback tasks");
  equal(manifest.selectedTaskIdsObservedByCandidateAuthor, [], "candidate-author selected-task observations");
  equal(manifest.contaminatedTaskContentsObservedByCandidateAuthor, [], "candidate-author contaminated observations");
  assertValue(manifest.holdoutOrHardContentsObservedByCandidateAuthor, false, "candidate-author holdout/hard observations");
  assertValue(manifest.candidateFrozenBeforeSelectedTaskRelease, true, "candidate freeze attestation");
  const skillRoot = path.join(root, context.protocol.target.logicalName);
  const skillRecord = requireObject(manifest.skill, "candidate manifest skill");
  assertValue(skillRecord.name, context.protocol.target.logicalName, "candidate logical skill name");
  const expectedCandidateTree = {
    sha256: requireSha(skillRecord.treeSha256, "candidate manifest tree digest"),
    fileCount: skillRecord.fileCount,
    totalBytes: skillRecord.totalBytes,
  };
  if (!Number.isInteger(expectedCandidateTree.fileCount) || !Number.isInteger(expectedCandidateTree.totalBytes)) {
    throw new Error("candidate manifest tree statistics must be integers");
  }
  const candidateTree = await validateCanonicalSkill(skillRoot, context.protocol.target.logicalName, expectedCandidateTree, "candidate");
  if (realization.candidateTreeSha256 !== undefined) assertValue(realization.candidateTreeSha256, candidateTree.sha256, "operator realization candidate tree");
  const operatorInstruction = requireString(realization.instruction, "operator realization instruction");
  const operatorId = requireString(realization.operatorId ?? realization.mutationProcedureId, "operator realization operator ID");
  const feedbackReceipts = requireArray(realization.feedbackReceipts, "operator realization feedback receipts");
  if (feedbackReceipts.length !== 1) throw new Error("operator realization must bind exactly one q018 feedback receipt");
  const feedback = feedbackReceipts[0];
  assertValue(feedback.taskId, "q018", "feedback receipt task ID");
  const feedbackPath = resolveBoundArtifact(realizationPath, feedback.path, context.repoRoot, "q018 feedback receipt");
  await assertOrdinaryFile(feedbackPath, "q018 feedback receipt");
  const feedbackSha256 = await sha256File(feedbackPath);
  assertValue(feedbackSha256, requireSha(feedback.sha256, "q018 feedback receipt digest"), "q018 feedback receipt file digest");
  const feedbackDocument = await readJson(feedbackPath, "q018 feedback receipt");
  assertValue(feedbackDocument.taskId, "q018", "q018 feedback document task ID");
  assertValue(feedbackDocument.sanitized, true, "q018 feedback sanitization");
  const feedbackCalls = requireObject(feedbackDocument.callAccounting, "q018 feedback call accounting");
  assertValue(feedbackCalls.harborInvocations, 0, "q018 feedback Harbor calls");
  assertValue(feedbackCalls.modelExecutions, 0, "q018 feedback model calls");
  assertValue(feedbackCalls.retries, 0, "q018 feedback retries");
  const procedure = requireObject(realization.mutationProcedure, "mutation procedure binding");
  const procedurePath = resolveBoundArtifact(realizationPath, procedure.path, context.repoRoot, "mutation procedure");
  await assertOrdinaryFile(procedurePath, "mutation procedure");
  const procedureSha256 = await sha256File(procedurePath);
  assertValue(procedureSha256, requireSha(procedure.sha256, "mutation procedure digest"), "mutation procedure file digest");
  const parentSource = assertInside(context.repoRoot, path.join(context.repoRoot, ...context.protocol.target.parent.sourcePath.split("/")), "parent source");
  const parentExpected = {
    sha256: context.protocol.target.parent.expectedTreeSha256,
    fileCount: context.protocol.target.parent.fileCount,
    totalBytes: context.protocol.target.parent.totalBytes,
  };
  const parentTree = await validateCanonicalSkill(parentSource, context.protocol.target.logicalName, parentExpected, "parent");
  return {
    root,
    candidateId,
    skillRoot,
    candidateTree,
    parentSource,
    parentTree,
    operatorId,
    operatorInstruction,
    manifest: { path: manifestPath, fileSha256: await sha256File(manifestPath) },
    realization: { path: realizationPath, fileSha256: await sha256File(realizationPath) },
    feedback: { taskId: "q018", path: feedbackPath, fileSha256: feedbackSha256 },
    mutationProcedure: { path: procedurePath, fileSha256: procedureSha256 },
  };
}

function assertNoRuntimeRelease(runtimeRoot) {
  return Promise.all(["prepared", "jobs", "publications", "private"].map(async (entry) => {
    if (await exists(path.join(runtimeRoot, entry))) throw new Error("candidate lock must precede every selected-task release, authentication seal, Harbor job, and publication");
  }));
}

export async function sealCandidateLock(options = {}) {
  const context = await loadProtocol(options);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME), context.repoRoot);
  const lockPath = candidateLockPath(context);
  if (await exists(lockPath)) throw new Error("generation-005 candidate lock already exists; never amend or overwrite it");
  await assertNoRuntimeRelease(runtimeRoot);
  const artifacts = await validateCandidateArtifacts(context, options);
  const body = {
    schemaVersion: 1,
    kind: "generation-005-candidate-lock",
    generationId: "generation-005",
    protocol: { relativePath: posixRelative(context.repoRoot, context.protocolPath), sha256: context.protocolSha256 },
    candidate: {
      candidateId: artifacts.candidateId,
      logicalName: context.protocol.target.logicalName,
      sourcePath: posixRelative(context.repoRoot, artifacts.skillRoot),
      tree: artifacts.candidateTree,
    },
    parent: {
      candidateId: PARENT_ID,
      sourcePath: context.protocol.target.parent.sourcePath,
      tree: artifacts.parentTree,
    },
    provenance: {
      candidateManifest: { relativePath: posixRelative(context.repoRoot, artifacts.manifest.path), fileSha256: artifacts.manifest.fileSha256 },
      operatorRealization: { relativePath: posixRelative(context.repoRoot, artifacts.realization.path), fileSha256: artifacts.realization.fileSha256, operatorId: artifacts.operatorId },
      feedbackReceipt: { taskId: "q018", relativePath: posixRelative(context.repoRoot, artifacts.feedback.path), fileSha256: artifacts.feedback.fileSha256 },
      mutationProcedure: { relativePath: posixRelative(context.repoRoot, artifacts.mutationProcedure.path), fileSha256: artifacts.mutationProcedure.fileSha256 },
      feedbackTaskIds: ["q018"],
    },
    attestations: {
      candidateFrozenBeforeSelectedTaskRelease: true,
      selectedTaskIdsObservedByCandidateAuthor: [],
      contaminatedTaskContentsObservedByCandidateAuthor: [],
      holdoutOrHardContentsObservedByCandidateAuthor: false,
    },
    authorization: {
      selectedTaskMaterializationRequiresFreshAuthSeal: true,
      harborOrModelCallsAuthorizedByLockAlone: false,
      holdoutOrHardReleaseAuthorized: false,
    },
  };
  const lock = { ...body, candidateLockSha256: objectDigest(body) };
  await writeExclusive(lockPath, canonicalJson(lock));
  return { mode: "sealed", runtimeRoot, lockPath, lock };
}

export async function verifyCandidateLock(options = {}) {
  const context = await loadProtocol(options);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME), context.repoRoot);
  const lockPath = candidateLockPath(context);
  await assertOrdinaryFile(lockPath, "generation-005 candidate lock");
  const lock = await readJson(lockPath, "generation-005 candidate lock");
  const { candidateLockSha256, ...body } = lock;
  assertValue(candidateLockSha256, objectDigest(body), "candidate lock self-seal");
  assertValue(body.kind, "generation-005-candidate-lock", "candidate lock kind");
  assertValue(body.generationId, "generation-005", "candidate lock generation");
  equal(body.protocol, { relativePath: posixRelative(context.repoRoot, context.protocolPath), sha256: context.protocolSha256 }, "candidate lock protocol binding");
  const candidateId = candidateIdCheck(body.candidate?.candidateId);
  assertValue(body.candidate?.logicalName, context.protocol.target.logicalName, "candidate lock logical name");
  const candidateSource = assertInside(context.repoRoot, path.join(context.repoRoot, ...requireString(body.candidate?.sourcePath, "locked candidate source").split("/")), "locked candidate source");
  const candidateTree = await validateCanonicalSkill(candidateSource, context.protocol.target.logicalName, requireObject(body.candidate?.tree, "locked candidate tree"), "locked candidate");
  const parentSource = assertInside(context.repoRoot, path.join(context.repoRoot, ...requireString(body.parent?.sourcePath, "locked parent source").split("/")), "locked parent source");
  assertValue(body.parent?.candidateId, PARENT_ID, "locked parent candidate");
  equal(body.parent?.tree, {
    sha256: context.protocol.target.parent.expectedTreeSha256,
    fileCount: context.protocol.target.parent.fileCount,
    totalBytes: context.protocol.target.parent.totalBytes,
  }, "locked parent protocol tree");
  const parentTree = await validateCanonicalSkill(parentSource, context.protocol.target.logicalName, body.parent.tree, "locked parent");
  equal(body.provenance?.feedbackTaskIds, ["q018"], "locked feedback task IDs");
  equal(body.attestations, {
    candidateFrozenBeforeSelectedTaskRelease: true,
    selectedTaskIdsObservedByCandidateAuthor: [],
    contaminatedTaskContentsObservedByCandidateAuthor: [],
    holdoutOrHardContentsObservedByCandidateAuthor: false,
  }, "candidate lock contamination attestations");
  equal(body.authorization, {
    selectedTaskMaterializationRequiresFreshAuthSeal: true,
    harborOrModelCallsAuthorizedByLockAlone: false,
    holdoutOrHardReleaseAuthorized: false,
  }, "candidate lock authorization boundary");
  for (const [key, label] of [["candidateManifest", "candidate manifest"], ["operatorRealization", "operator realization"], ["feedbackReceipt", "q018 feedback receipt"], ["mutationProcedure", "mutation procedure"]]) {
    const binding = requireObject(body.provenance?.[key], `locked ${label}`);
    const absolute = assertInside(context.repoRoot, path.join(context.repoRoot, ...requireString(binding.relativePath, `${label} relative path`).split("/")), `locked ${label}`);
    await assertOrdinaryFile(absolute, `locked ${label}`);
    assertValue(await sha256File(absolute), requireSha(binding.fileSha256, `${label} digest`), `locked ${label} file digest`);
  }
  const artifacts = await validateCandidateArtifacts(context, { candidateRoot: path.dirname(candidateSource) });
  assertValue(artifacts.candidateId, candidateId, "locked candidate artifact ID");
  equal(artifacts.candidateTree, candidateTree, "locked candidate artifact tree");
  equal(artifacts.parentTree, parentTree, "locked parent artifact tree");
  assertValue(body.provenance.operatorRealization.operatorId, artifacts.operatorId, "locked operator ID");
  return { mode: "verified", ...context, runtimeRoot, lockPath, lock, candidateId, candidateSource, candidateTree, parentSource, parentTree, operatorInstruction: artifacts.operatorInstruction, operatorId: artifacts.operatorId, candidateLockFileSha256: await sha256File(lockPath) };
}

export async function sealGeneration005Authentication(options = {}) {
  const locked = await verifyCandidateLock(options);
  await assertNoRuntimeRelease(locked.runtimeRoot);
  const sealPath = path.join(locked.runtimeRoot, ...AUTH_SEAL_RELATIVE_PATH.split("/"));
  const auth = await resolveAuthJson(options.authSource);
  const body = {
    schemaVersion: 1,
    kind: "generation-005-private-auth-payload-seal",
    generationId: "generation-005",
    freshSealId: randomUUID(),
    protocolSha256: locked.protocolSha256,
    candidateLock: { fileSha256: locked.candidateLockFileSha256, candidateLockSha256: locked.lock.candidateLockSha256 },
    mount: { source: locked.protocol.authentication.isolatedMount, target: locked.protocol.authentication.mountTarget, projectedEntries: ["auth.json"] },
    payload: { sha256: auth.payloadSha256, byteLength: auth.byteLength, shapeSha256: auth.shapeSha256 },
    publicationPolicy: { publishPayloadDigest: false, publishCredentialMetadata: false },
    historicalSealReused: false,
  };
  const seal = { ...body, sealSha256: objectDigest(body) };
  await writeExclusive(sealPath, canonicalJson(seal), { mode: 0o600 });
  return { mode: "sealed", runtimeRoot: locked.runtimeRoot, sealPath };
}

export async function verifyGeneration005Authentication(options = {}) {
  const locked = await verifyCandidateLock(options);
  const sealPath = path.join(locked.runtimeRoot, ...AUTH_SEAL_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(sealPath, "generation-005 private auth seal");
  const seal = await readJson(sealPath, "generation-005 private auth seal");
  const { sealSha256, ...body } = seal;
  assertValue(sealSha256, objectDigest(body), "private auth seal self-digest");
  assertValue(body.kind, "generation-005-private-auth-payload-seal", "private auth seal kind");
  assertValue(body.generationId, "generation-005", "private auth generation");
  assertValue(body.protocolSha256, locked.protocolSha256, "private auth protocol binding");
  equal(body.candidateLock, { fileSha256: locked.candidateLockFileSha256, candidateLockSha256: locked.lock.candidateLockSha256 }, "private auth candidate-lock binding");
  assertValue(body.mount?.source, locked.protocol.authentication.isolatedMount, "private auth source mount");
  assertValue(body.mount?.target, locked.protocol.authentication.mountTarget, "private auth target mount");
  equal(body.mount?.projectedEntries, ["auth.json"], "private auth projection");
  assertValue(body.historicalSealReused, false, "historical auth reuse");
  assertValue(body.publicationPolicy?.publishPayloadDigest, false, "auth digest publication policy");
  assertValue(body.publicationPolicy?.publishCredentialMetadata, false, "auth metadata publication policy");
  const auth = await resolveAuthJson(options.authSource);
  assertValue(auth.payloadSha256, body.payload?.sha256, "sealed auth payload");
  assertValue(auth.byteLength, body.payload?.byteLength, "sealed auth length");
  assertValue(auth.shapeSha256, body.payload?.shapeSha256, "sealed auth shape");
  return { mode: "verified", ...locked, sealPath, seal, authSealFileSha256: await sha256File(sealPath) };
}

export function stageSpecification(stageId) {
  if (stageId === FIRST_STAGE_ID) return { stageId, taskIds: [FIRST_TASK_ID], maximumModelExecutions: 2 };
  if (stageId === REMAINING_STAGE_ID) return { stageId, taskIds: [...REMAINING_TASK_IDS], maximumModelExecutions: 6 };
  throw new Error(`Unknown generation-005 stage: ${stageId}`);
}

function stagePreparedRoot(runtimeRoot, stageId) {
  return path.join(runtimeRoot, "prepared", stageId);
}

export function jobName(protocol, stageId, candidateId, lockedCandidateId) {
  if (![PARENT_ID, lockedCandidateId].includes(candidateId)) throw new Error(`Unknown candidate ${candidateId}`);
  const stage = stageSpecification(stageId);
  const suffix = stage.stageId === FIRST_STAGE_ID ? FIRST_TASK_ID : "remaining";
  const role = candidateId === PARENT_ID ? "parent" : "child";
  return `${protocol.experimentId}-${suffix}-${role}-${candidateId}`;
}

export function jobDirectory(runtimeRoot, protocol, stageId, candidateId, lockedCandidateId) {
  return path.join(runtimeRoot, "jobs", stageId, candidateId, jobName(protocol, stageId, candidateId, lockedCandidateId));
}

export function buildGeneration005HarborConfig({ protocol, stageId, candidateId, lockedCandidateId, runtimeRoot, preparedRoot, knowledgeRoot }) {
  validateGeneration005Protocol(protocol);
  const stage = stageSpecification(stageId);
  const profile = protocol.frozenEvaluationProfile;
  const harbor = profile.harbor;
  const skillRoot = path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName);
  return {
    job_name: jobName(protocol, stageId, candidateId, lockedCandidateId),
    jobs_dir: toHarborPath(path.join(runtimeRoot, "jobs", stageId, candidateId)),
    n_attempts: harbor.nAttempts,
    install_only: harbor.installOnly,
    timeout_multiplier: harbor.timeoutMultiplier,
    debug: harbor.debug,
    n_concurrent_trials: harbor.nConcurrentTrials,
    quiet: harbor.quiet,
    retry: {
      max_retries: harbor.retry.maxRetries,
      exclude_exceptions: harbor.retry.excludeExceptions,
      wait_multiplier: harbor.retry.waitMultiplier,
      min_wait_sec: harbor.retry.minWaitSec,
      max_wait_sec: harbor.retry.maxWaitSec,
    },
    environment: {
      type: profile.environment.type,
      force_build: profile.environment.forceBuild,
      delete: profile.environment.delete,
      cpu_enforcement_policy: profile.environment.cpuEnforcementPolicy,
      memory_enforcement_policy: profile.environment.memoryEnforcementPolicy,
      mounts: [
        {
          type: "bind",
          source: toHarborPath(path.join(knowledgeRoot, ...protocol.knowledge.referenceBundlePath.split("/"))),
          target: profile.environment.knowledgeMountTarget,
          read_only: profile.environment.knowledgeMountReadOnly,
          bind: { create_host_path: false },
        },
        {
          type: "bind",
          source: protocol.authentication.isolatedMount,
          target: protocol.authentication.mountTarget,
          bind: { create_host_path: false },
        },
      ],
      extra_docker_compose: profile.environment.extraDockerCompose,
      kwargs: profile.environment.kwargs,
      extra_allowed_hosts: profile.environment.extraAllowedHosts,
    },
    verifier: { disable: profile.verifier.disable },
    metrics: profile.metrics,
    agents: [{
      name: profile.agent.name,
      model_name: profile.agent.model,
      n_concurrent: profile.agent.nConcurrent,
      skills: [toHarborPath(skillRoot)],
      extra_allowed_hosts: profile.agent.extraAllowedHosts,
      kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
      env: { PI_CODING_AGENT_DIR: protocol.authentication.mountTarget },
      mcp_servers: profile.agent.mcpServers,
    }],
    datasets: [{
      path: toHarborPath(path.join(preparedRoot, "tasks")),
      overwrite: profile.datasetOverwrite,
      task_names: stage.taskIds,
    }],
    tasks: [],
    artifacts: profile.artifacts,
    extra_instruction_paths: profile.extraInstructionPaths,
  };
}

export function buildOperatorAnalysisConfig({ protocol, stageId, candidateId, runtimeRoot, preparedRoot, operatorInstruction, operatorId }) {
  const parentJob = toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, PARENT_ID, candidateId));
  const candidateJob = toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, candidateId, candidateId));
  return {
    schemaVersion: 1,
    evolution: {
      id: `${protocol.experimentId}-${stageId}`,
      generation: 0,
      generationId: `generation-005-${stageId}`,
      outputDir: "../../../private/operator-analysis/unused-cli-overrides-this",
      baselineCandidateId: PARENT_ID,
    },
    harbor: {
      rewardKey: protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: protocol.frozenEvaluationProfile.passThreshold,
      requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
      requireNoErrors: true,
      requiredEnv: [],
      diagnosticChars: 0,
      candidateAttributableDiagnosticPolicy: { contracts: [DIAGNOSTIC_CONTRACT_ID] },
    },
    coevolution: {
      candidateSurvivors: 2,
      operatorSurvivors: 2,
      nextOperatorCount: 2,
      minimumOperatorTrials: 1,
      allowCaseRegressionsForCredit: false,
      complementaryRepair: false,
    },
    operators: [
      { operatorId, instruction: operatorInstruction, parentOperatorIds: [], origin: "frozen-q018-reflection" },
      { operatorId: "forward-validation-control", instruction: "Preserve immutable forward-validation inputs without mutation.", parentOperatorIds: [], origin: "control" },
    ],
    candidates: [
      { candidateId: PARENT_ID, skill: toHarborPath(path.join(preparedRoot, "inputs", PARENT_ID, protocol.target.logicalName)), jobDirectory: parentJob },
      { candidateId, parentCandidateId: PARENT_ID, operatorId, skill: toHarborPath(path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName)), jobDirectory: candidateJob },
    ],
    holdout: {
      baseline: { candidateId: PARENT_ID, jobDirectory: "../../../not-opened/generation-005-holdout-parent" },
      candidate: { candidateId, jobDirectory: "../../../not-opened/generation-005-holdout-child" },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

export function buildRunWrapper({ protocol, stageId, candidateId, lockedCandidateId, runtimeRoot, preparedRoot }) {
  const configPath = toHarborPath(path.join(preparedRoot, "configs", "harbor", `${candidateId}.yaml`));
  const selectedSkill = toHarborPath(path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName));
  const selectedJob = toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, candidateId, lockedCandidateId));
  const prepareScript = toHarborPath(SCRIPT_PATH);
  const publisherScript = toHarborPath(path.join(GENERATION_ROOT, "scripts", "publish-generation-005.js"));
  const runtime = toHarborPath(runtimeRoot);
  const verifyStage = stageId === FIRST_STAGE_ID ? "verify-q016" : "verify-remaining";
  const classify = stageId === FIRST_STAGE_ID ? "classify-q016-parent" : "classify-remaining-parent";
  const parentGate = candidateId === lockedCandidateId
    ? `node ${JSON.stringify(publisherScript)} ${classify} --runtime ${JSON.stringify(runtime)} >/dev/null\n`
    : "";
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
if [[ -e ${JSON.stringify(selectedJob)} ]]; then
  echo "generation-005 ${stageId} ${candidateId} job already exists; never overwrite it" >&2
  exit 68
fi

node ${JSON.stringify(prepareScript)} ${verifyStage} --runtime ${JSON.stringify(runtime)} --auth-source "$auth_json" >/dev/null
${parentGate}uvx --offline --from harbor==${protocol.frozenEvaluationProfile.harbor.version} harbor --version >/dev/null

auth_mount=${JSON.stringify(protocol.authentication.isolatedMount)}
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
mkdir -m 700 -- "$auth_mount"
cleanup() { rm -rf -- "$auth_mount"; }
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
if [[ "$(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\\n' | LC_ALL=C sort)" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
node ${JSON.stringify(prepareScript)} verify-auth --runtime ${JSON.stringify(runtime)} --auth-source "$auth_mount/auth.json" >/dev/null

actual_image_id="$(docker image inspect --format '{{.Id}}' ${IMAGE})"
if [[ "$actual_image_id" != ${JSON.stringify(IMAGE_ID)} ]]; then
  echo "generation-005 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash \\
  --mount "type=bind,source=$auth_mount,target=/root/.pi/agent" \\
  --mount "type=bind,source=${selectedSkill},target=/candidate,readonly" \\
  ${IMAGE} \\
  -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
test -r /candidate/scripts/runtime_smoke.py
python -B /candidate/scripts/runtime_smoke.py >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'shellPath'"'"' /root/.pi/agent
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --offline --from harbor==${protocol.frozenEvaluationProfile.harbor.version} harbor run --config ${JSON.stringify(configPath)} --yes
`;
}

async function validateTaskSource(source, expected, taskId) {
  await assertOrdinaryDirectory(source, `${taskId} source task`);
  for (const entry of ["instruction.md", "task.toml", "environment", "tests"]) {
    if (!await exists(path.join(source, entry))) throw new Error(`${taskId} is not a complete Harbor task: missing ${entry}`);
  }
  const digest = await treeDigest(source);
  equal(digest, { sha256: expected.expectedTreeSha256, fileCount: expected.fileCount, totalBytes: expected.totalBytes }, `${taskId} task tree`);
  return digest;
}

async function loadPreparationContext(options, taskIds) {
  const authenticated = await verifyGeneration005Authentication(options);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  assertCleanPinnedKnowledge(knowledgeRoot, authenticated.protocol.knowledge.commit);
  const operatorAnalyzerPath = assertInside(authenticated.repoRoot, path.join(authenticated.repoRoot, ...OPERATOR_ANALYZER_RELATIVE_PATH.split("/")), "report-only Harbor analyzer");
  const diagnosticPath = assertInside(authenticated.repoRoot, path.join(authenticated.repoRoot, ...SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH.split("/")), "single-candidate Harbor diagnostic");
  await Promise.all([
    assertOrdinaryFile(operatorAnalyzerPath, "report-only Harbor analyzer"),
    assertOrdinaryFile(diagnosticPath, "single-candidate Harbor diagnostic"),
  ]);
  const taskRoot = options.taskRoot ? path.resolve(options.taskRoot) : null;
  const tasks = [];
  for (const taskId of taskIds) {
    const source = taskRoot
      ? assertInside(taskRoot, path.join(taskRoot, taskId), `${taskId} task source`)
      : assertInside(authenticated.repoRoot, path.join(authenticated.repoRoot, ...authenticated.protocol.tasks[taskId].sourcePath.split("/")), `${taskId} task source`);
    tasks.push({ taskId, source, digest: await validateTaskSource(source, authenticated.protocol.tasks[taskId], taskId) });
  }
  return {
    ...authenticated,
    knowledgeRoot,
    tasks,
    profileSha256: objectDigest(authenticated.protocol.frozenEvaluationProfile),
    operatorAnalyzer: { relativePath: OPERATOR_ANALYZER_RELATIVE_PATH, fileSha256: await sha256File(operatorAnalyzerPath) },
    singleCandidateDiagnostic: { relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH, fileSha256: await sha256File(diagnosticPath) },
  };
}

async function artifactRecord(root, relativePath, kind, extra = {}) {
  return { kind, path: relativePath, sha256: await sha256File(path.join(root, ...relativePath.split("/"))), ...extra };
}

async function materializeStage(context, stageId, stagingRoot) {
  const preparedRoot = stagePreparedRoot(context.runtimeRoot, stageId);
  for (const [candidateId, source] of [[PARENT_ID, context.parentSource], [context.candidateId, context.candidateSource]]) {
    await copyTree(source, path.join(stagingRoot, "inputs", candidateId, context.protocol.target.logicalName));
  }
  for (const task of context.tasks) await copyTree(task.source, path.join(stagingRoot, "tasks", task.taskId));
  const artifacts = [];
  for (const candidateId of [PARENT_ID, context.candidateId]) {
    const relative = `configs/harbor/${candidateId}.yaml`;
    await writeExclusive(path.join(stagingRoot, ...relative.split("/")), yamlDocument(buildGeneration005HarborConfig({
      protocol: context.protocol,
      stageId,
      candidateId,
      lockedCandidateId: context.candidateId,
      runtimeRoot: context.runtimeRoot,
      preparedRoot,
      knowledgeRoot: context.knowledgeRoot,
    })));
    artifacts.push(await artifactRecord(stagingRoot, relative, "harbor-job-config", { candidateId }));
  }
  const operatorRelative = "configs/operator/stage.yaml";
  await writeExclusive(path.join(stagingRoot, ...operatorRelative.split("/")), yamlDocument(buildOperatorAnalysisConfig({
    protocol: context.protocol,
    stageId,
    candidateId: context.candidateId,
    runtimeRoot: context.runtimeRoot,
    preparedRoot,
    operatorInstruction: context.operatorInstruction,
    operatorId: context.operatorId,
  })));
  artifacts.push(await artifactRecord(stagingRoot, operatorRelative, "operator-analysis-config"));
  for (const candidateId of [PARENT_ID, context.candidateId]) {
    const relative = `run-${candidateId}.sh`;
    await writeExclusive(path.join(stagingRoot, relative), buildRunWrapper({
      protocol: context.protocol,
      stageId,
      candidateId,
      lockedCandidateId: context.candidateId,
      runtimeRoot: context.runtimeRoot,
      preparedRoot,
    }), { mode: 0o755 });
    artifacts.push(await artifactRecord(stagingRoot, relative, "wsl-run-wrapper", { candidateId }));
  }
  const candidates = [];
  for (const [candidateId, expected] of [[PARENT_ID, context.parentTree], [context.candidateId, context.candidateTree]]) {
    const actual = await treeDigest(path.join(stagingRoot, "inputs", candidateId, context.protocol.target.logicalName));
    equal(actual, expected, `copied ${candidateId} tree`);
    candidates.push({ candidateId, ...actual });
  }
  const tasks = [];
  for (const task of context.tasks) {
    const actual = await treeDigest(path.join(stagingRoot, "tasks", task.taskId));
    equal(actual, task.digest, `copied ${task.taskId} tree`);
    tasks.push({ taskId: task.taskId, ...actual });
  }
  const stage = stageSpecification(stageId);
  const receipt = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: "generation-005",
    stageId,
    protocolSha256: context.protocolSha256,
    candidateLock: { relativePath: posixRelative(context.repoRoot, context.lockPath), fileSha256: context.candidateLockFileSha256, candidateLockSha256: context.lock.candidateLockSha256 },
    profileSha256: context.profileSha256,
    knowledgeCommit: context.protocol.knowledge.commit,
    privateAuthSealFileSha256: context.authSealFileSha256,
    operatorAnalyzer: context.operatorAnalyzer,
    singleCandidateDiagnostic: context.singleCandidateDiagnostic,
    candidates,
    tasks,
    diagnosticPolicy: { contracts: [DIAGNOSTIC_CONTRACT_ID] },
    callBudget: {
      harborInvocationsInStage: 2,
      maximumModelExecutionsInStage: stage.maximumModelExecutions,
      attemptsPerCandidateTask: 1,
      retries: 0,
      automaticExternalRetries: 0,
      selectiveExternalResumeAttempts: 0,
    },
    artifacts,
    immutablePayload: await treeDigest(stagingRoot),
  };
  await writeExclusive(path.join(stagingRoot, "receipt.json"), canonicalJson(receipt));
  return receipt;
}

async function verifyStage(context, stageId) {
  const root = stagePreparedRoot(context.runtimeRoot, stageId);
  await assertOrdinaryDirectory(root, `${stageId} prepared stage`);
  const receiptPath = path.join(root, "receipt.json");
  const receipt = await readJson(receiptPath, `${stageId} prepared receipt`);
  assertValue(receipt.stageId, stageId, `${stageId} receipt stage`);
  assertValue(receipt.protocolSha256, context.protocolSha256, `${stageId} protocol binding`);
  equal(receipt.candidateLock, { relativePath: posixRelative(context.repoRoot, context.lockPath), fileSha256: context.candidateLockFileSha256, candidateLockSha256: context.lock.candidateLockSha256 }, `${stageId} candidate-lock binding`);
  assertValue(receipt.profileSha256, context.profileSha256, `${stageId} profile binding`);
  assertValue(receipt.knowledgeCommit, context.protocol.knowledge.commit, `${stageId} knowledge binding`);
  assertValue(receipt.privateAuthSealFileSha256, context.authSealFileSha256, `${stageId} private auth seal binding`);
  equal(receipt.operatorAnalyzer, context.operatorAnalyzer, `${stageId} operator analyzer binding`);
  equal(receipt.singleCandidateDiagnostic, context.singleCandidateDiagnostic, `${stageId} diagnostic helper binding`);
  equal(receipt.diagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] }, `${stageId} diagnostic policy`);
  equal(receipt.callBudget, {
    harborInvocationsInStage: 2,
    maximumModelExecutionsInStage: stageSpecification(stageId).maximumModelExecutions,
    attemptsPerCandidateTask: 1,
    retries: 0,
    automaticExternalRetries: 0,
    selectiveExternalResumeAttempts: 0,
  }, `${stageId} call budget`);
  equal(await treeDigest(root, { omitRootFiles: ["receipt.json"] }), receipt.immutablePayload, `${stageId} immutable payload`);
  equal(receipt.tasks.map((item) => item.taskId), context.tasks.map((item) => item.taskId), `${stageId} task coverage`);
  for (const [candidateId, expected] of [[PARENT_ID, context.parentTree], [context.candidateId, context.candidateTree]]) {
    const recorded = receipt.candidates.find((item) => item.candidateId === candidateId);
    equal(recorded, { candidateId, ...expected }, `${stageId} ${candidateId} receipt tree`);
    equal(await treeDigest(path.join(root, "inputs", candidateId, context.protocol.target.logicalName)), expected, `${stageId} ${candidateId} copied tree`);
  }
  for (const task of context.tasks) {
    const recorded = receipt.tasks.find((item) => item.taskId === task.taskId);
    equal(recorded, { taskId: task.taskId, ...task.digest }, `${stageId} ${task.taskId} receipt tree`);
    equal(await treeDigest(path.join(root, "tasks", task.taskId)), task.digest, `${stageId} ${task.taskId} copied tree`);
  }
  for (const artifact of requireArray(receipt.artifacts, `${stageId} artifacts`)) {
    const absolute = assertInside(root, path.join(root, ...artifact.path.split("/")), `${stageId} artifact`);
    assertValue(await sha256File(absolute), artifact.sha256, `${stageId} artifact ${artifact.path}`);
  }
  return { receipt, receiptPath, receiptSha256: await sha256File(receiptPath), preparedRoot: root };
}

async function prepareStage(options, stageId, taskIds) {
  const context = await loadPreparationContext(options, taskIds);
  const destination = stagePreparedRoot(context.runtimeRoot, stageId);
  if (await exists(destination)) return { mode: "verified-existing", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, stageId)) };
  for (const candidateId of [PARENT_ID, context.candidateId]) {
    if (await exists(jobDirectory(context.runtimeRoot, context.protocol, stageId, candidateId, context.candidateId))) {
      throw new Error(`${stageId} must be materialized before any Harbor job in that stage`);
    }
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const staging = path.join(context.runtimeRoot, `.${stageId}-preparing-${process.pid}-${randomUUID()}`);
  await fs.mkdir(staging, { recursive: false });
  try {
    const receipt = await materializeStage(context, stageId, staging);
    await fs.rename(staging, destination);
    return { mode: "prepared", runtimeRoot: context.runtimeRoot, receipt, receiptPath: path.join(destination, "receipt.json") };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareQ016(options = {}) {
  const locked = await verifyCandidateLock(options);
  if (await exists(path.join(locked.runtimeRoot, "jobs"))) throw new Error("q016 must be prepared before every generation-005 Harbor job");
  if (await exists(stagePreparedRoot(locked.runtimeRoot, REMAINING_STAGE_ID))) throw new Error("remaining tasks cannot precede the immutable q016 pass");
  return prepareStage(options, FIRST_STAGE_ID, [FIRST_TASK_ID]);
}

export async function verifyQ016(options = {}) {
  const context = await loadPreparationContext(options, [FIRST_TASK_ID]);
  if (await exists(stagePreparedRoot(context.runtimeRoot, REMAINING_STAGE_ID))) {
    const publisher = await import("./publish-generation-005.js");
    const verified = await publisher.verifyPublishedStage(options, FIRST_STAGE_ID);
    if (!verified.publication.gate?.passed) throw new Error("remaining tasks were materialized without a passing q016 publication");
  }
  return { mode: "verified", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, FIRST_STAGE_ID)) };
}

async function verifyPassingQ016Publication(options, protocol) {
  const publisher = await import("./publish-generation-005.js");
  const verified = await publisher.verifyPublishedStage(options, FIRST_STAGE_ID);
  const publication = verified.publication;
  assertValue(publication.experimentId, protocol.experimentId, "q016 publication experiment");
  assertValue(publication.generationId, "generation-005", "q016 publication generation");
  assertValue(publication.stageId, FIRST_STAGE_ID, "q016 publication stage");
  assertValue(publication.gate?.status, "advance", "q016 publication gate status");
  assertValue(publication.gate?.passed, true, "q016 publication pass");
  assertValue(publication.gate?.nextStage, REMAINING_STAGE_ID, "q016 next stage");
  return { path: verified.resultPath, fileSha256: await sha256File(verified.resultPath), recordSha256: publication.publicationSha256 };
}

export async function prepareRemaining(options = {}) {
  await verifyQ016(options);
  const locked = await verifyCandidateLock(options);
  await verifyPassingQ016Publication(options, locked.protocol);
  return prepareStage(options, REMAINING_STAGE_ID, REMAINING_TASK_IDS);
}

export async function verifyRemaining(options = {}) {
  await verifyQ016(options);
  const context = await loadPreparationContext(options, REMAINING_TASK_IDS);
  await verifyPassingQ016Publication(options, context.protocol);
  return { mode: "verified", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, REMAINING_STAGE_ID)) };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const flags = {
    "--repo-root": "repoRoot",
    "--runtime": "runtimeRoot",
    "--protocol": "protocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--task-root": "taskRoot",
    "--candidate-root": "candidateRoot",
    "--auth-source": "authSource",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Unknown option: ${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argv[index]}`);
    options[key] = argv[++index];
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-candidate [--candidate-root <dir>] [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-candidate [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-auth --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-auth --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare-q016 --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-q016 --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare-remaining --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-remaining --auth-source <auth.json|dir> [options]\n\nAll preparation commands are model-free. Candidate locking reads no selected task content; remaining task materialization requires a recomputed immutable q016 pass.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const handlers = {
    "seal-candidate": sealCandidateLock,
    "verify-candidate": verifyCandidateLock,
    "seal-auth": sealGeneration005Authentication,
    "verify-auth": verifyGeneration005Authentication,
    "prepare-q016": prepareQ016,
    "verify-q016": verifyQ016,
    "prepare-remaining": prepareRemaining,
    "verify-remaining": verifyRemaining,
  };
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command ${command}\n${usage()}`);
  const result = await handler(options);
  process.stdout.write(canonicalJson({ mode: result.mode, runtimeRoot: result.runtimeRoot ?? null, receiptPath: result.receiptPath ?? null, lockPath: result.lockPath ?? null, sealPath: result.sealPath ?? null }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
