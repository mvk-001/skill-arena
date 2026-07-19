import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContrastPostAgentEffectiveEvidence } from "./evidence-resolution-post-agent.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../..");
const DEFAULT_CONTRACT = path.join(GENERATION_ROOT, "external-resume", "post-agent-derivation-v3-contract.json");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const CONTRACT_ID = "harbor-0.18.0.completed-verifier-journal.task-overwrite-and-job-attempts-default-omission.derivation-v3";
const RECEIPT_KIND = "harbor-verifier-recovery-derivation-v3-receipt";
const EXPECTED_FAILURE = "Each external retry JobConfig must contain exactly one attempt and one trial.";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const NORMALIZATIONS = [
  {
    id: "harbor-taskconfig-overwrite-default-omission-v1",
    scope: "JobConfig.tasks[0].overwrite",
    expected: false,
    observed: "absent",
    artifactMutation: false,
  },
  {
    id: "harbor-jobconfig-n-attempts-default-omission-v1",
    scope: "JobConfig.n_attempts",
    expected: 1,
    observed: "absent",
    artifactMutation: false,
  },
];

function comparePythonStrings(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function canonicalPython(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPython).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error(`unsupported receipt value ${typeof value}`);
  const keys = Object.keys(value).sort(comparePythonStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalPython(value[key])}`).join(",")}}`;
}

function pythonDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalPython(value), "utf8").digest("hex")}`;
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) throw new Error(`${label} must be sha256:<lowercase hex>`);
  return value;
}

function equal(actual, expected, label) {
  if (canonicalPython(actual) !== canonicalPython(expected)) throw new Error(`${label} drifted`);
}

function assertKeys(value, expected, label) {
  equal(Object.keys(requireObject(value, label)).sort(comparePythonStrings), [...expected].sort(comparePythonStrings), `${label} keys`);
}

function hostPath(value) {
  const text = requireString(value, "stored path").replaceAll("\\", "/");
  if (process.platform !== "win32") return text;
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(text);
  return match ? `${match[1].toUpperCase()}:/${match[2] ?? ""}` : text;
}

function resolveStored(base, value) {
  const translated = hostPath(value);
  return path.resolve(path.isAbsolute(translated) ? translated : path.join(base, translated));
}

async function safeFile(file, label) {
  const resolved = path.resolve(file);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`${label} must be an ordinary single-link file`);
  return resolved;
}

async function safeDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary directory`);
  return resolved;
}

async function sha256File(file) {
  return `sha256:${createHash("sha256").update(await fs.readFile(file)).digest("hex")}`;
}

async function readJson(file, label) {
  await safeFile(file, label);
  try {
    return requireObject(JSON.parse(await fs.readFile(file, "utf8")), label);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

async function exists(target) {
  return fs.lstat(target).then(() => true, () => false);
}

async function walkFiles(root) {
  const safeRoot = await safeDirectory(root, "V3 manifest root");
  const rows = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`V3 manifest contains link ${relative}`);
      if (entry.isDirectory()) await visit(await safeDirectory(absolute, `V3 directory ${relative}`));
      else if (entry.isFile()) rows.push({ path: relative, sha256: await sha256File(await safeFile(absolute, `V3 file ${relative}`)) });
      else throw new Error(`V3 manifest contains unsupported node ${relative}`);
    }
  }
  await visit(safeRoot);
  return rows;
}

async function walkDirectories(root) {
  const safeRoot = await safeDirectory(root, "V3 topology root");
  const rows = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`V3 topology contains link ${relative}`);
      if (entry.isDirectory()) {
        rows.push(relative);
        await visit(await safeDirectory(absolute, `V3 directory ${relative}`));
      } else if (!entry.isFile()) throw new Error(`V3 topology contains unsupported node ${relative}`);
    }
  }
  await visit(safeRoot);
  return rows.sort(comparePythonStrings);
}

async function verifySealedRows(base, rows, expectedPaths, label) {
  const observed = [];
  for (const [index, raw] of requireArray(rows, label).entries()) {
    const row = requireObject(raw, `${label}[${index}]`);
    assertKeys(row, ["path", "sha256"], `${label}[${index}]`);
    const file = resolveStored(base, row.path);
    observed.push(file);
    if (await sha256File(await safeFile(file, `${label}[${index}]`)) !== requireDigest(row.sha256, `${label}[${index}].sha256`)) {
      throw new Error(`${label}[${index}] hash drifted`);
    }
  }
  const expected = new Set(expectedPaths.map((file) => path.resolve(file)));
  if (observed.length !== expected.size || new Set(observed).size !== observed.length || observed.some((file) => !expected.has(file))) {
    throw new Error(`${label} differs from the exact executable set`);
  }
}

function expectedV3Seals() {
  return [
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v3.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v3.py.lock"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "references", "verifier-only-derivation-v3.md"),
    path.join(GENERATION_ROOT, "external-resume", "run-generation-003-verifier-derivation-v3.sh"),
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent-v3.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent-v3.js"),
  ];
}

function expectedV2Seals() {
  return [
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v2.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v2.py.lock"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "references", "verifier-only-derivation-v2.md"),
    path.join(GENERATION_ROOT, "external-resume", "run-generation-003-verifier-derivation-v2.sh"),
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent-v2.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent-v2.js"),
  ];
}

function expectedV1Seals() {
  return [
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "recover_verifier_only.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "recover_verifier_only.py.lock"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "resume_external_failures.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "references", "verifier-only-recovery.md"),
    path.join(GENERATION_ROOT, "external-resume", "run-generation-003-verifier-recovery.sh"),
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent.js"),
    path.join(GENERATION_ROOT, "scripts", "prepare-generation-003-post-agent.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent.js"),
  ];
}

async function verifyProjection(contractBase, projection, parentV1) {
  assertKeys(projection, [
    "recoveryOutputDirectory", "recoveryLockSha256", "recoveryRecordDigest",
    "recoveryResultSha256", "recoveryResultDigest", "effectiveJobDirectory",
    "resumeManifestSha256", "effectiveJobDigest", "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest", "schemaCompatibility",
  ], "V3 compatibility projection");
  equal(projection.schemaCompatibility, { recoveryLock: 1, recoveryResult: 1, effectiveManifest: 2 }, "V3 projection schemas");
  const expectedRecovery = resolveStored(path.dirname(parentV1.path), parentV1.body.outputDirectory);
  const expectedEffective = resolveStored(path.dirname(parentV1.path), parentV1.body.effectiveJobDirectory);
  if (resolveStored(contractBase, projection.recoveryOutputDirectory) !== expectedRecovery) throw new Error("V3 projection recovery path drifted");
  if (resolveStored(contractBase, projection.effectiveJobDirectory) !== expectedEffective) throw new Error("V3 projection effective path drifted");
  if (projection.nativeRetryJobArtifactDigest !== parentV1.body.native.nativeRetryJobArtifactDigest) {
    throw new Error("V3 native retry job artifact digest drifted");
  }
  const lockPath = path.join(expectedRecovery, "recovery-lock.json");
  const resultPath = path.join(expectedRecovery, "recovery-result.json");
  const manifestPath = path.join(expectedEffective, "resume-manifest.json");
  if (await sha256File(await safeFile(lockPath, "V3 recovery lock")) !== projection.recoveryLockSha256) throw new Error("V3 recovery lock bytes drifted");
  if (await sha256File(await safeFile(resultPath, "V3 recovery result")) !== projection.recoveryResultSha256) throw new Error("V3 recovery result bytes drifted");
  if (await sha256File(await safeFile(manifestPath, "V3 effective manifest")) !== projection.resumeManifestSha256) throw new Error("V3 effective manifest bytes drifted");
  const [lock, result, manifest] = await Promise.all([
    readJson(lockPath, "V3 recovery lock"),
    readJson(resultPath, "V3 recovery result"),
    readJson(manifestPath, "V3 effective manifest"),
  ]);
  if (lock.recoveryRecordDigest !== projection.recoveryRecordDigest
    || result.recoveryResultDigest !== projection.recoveryResultDigest
    || result.recoveredJobArtifactDigest !== projection.recoveredJobArtifactDigest
    || manifest.effectiveJobDigest !== projection.effectiveJobDigest) {
    throw new Error("V3 projection record binding drifted");
  }
}

async function verifyPostAgentDerivationV3Structure({ contractPath = DEFAULT_CONTRACT } = {}) {
  const contractFile = await safeFile(contractPath, "derivation V3 contract");
  const contract = await readJson(contractFile, "derivation V3 contract");
  assertKeys(contract, [
    "schemaVersion", "caseId", "derivationContract", "parentDerivationContract",
    "failedParentAttempt", "completionDirectory", "normalizations", "sealedFiles",
  ], "derivation V3 contract");
  if (contract.schemaVersion !== 3 || contract.derivationContract !== CONTRACT_ID) throw new Error("unsupported derivation V3 contract");
  equal(contract.normalizations, NORMALIZATIONS, "V3 normalizations");
  const contractBase = path.dirname(contractFile);
  await verifySealedRows(contractBase, contract.sealedFiles, expectedV3Seals(), "V3 sealed files");

  const parentBinding = requireObject(contract.parentDerivationContract, "parent V2 binding");
  assertKeys(parentBinding, ["path", "sha256"], "parent V2 binding");
  const parentV2Path = resolveStored(contractBase, parentBinding.path);
  if (await sha256File(await safeFile(parentV2Path, "parent V2 contract")) !== parentBinding.sha256) throw new Error("parent V2 contract hash drifted");
  const parentV2 = await readJson(parentV2Path, "parent V2 contract");
  await verifySealedRows(path.dirname(parentV2Path), parentV2.sealedFiles, expectedV2Seals(), "parent V2 sealed files");
  const parentV1Binding = requireObject(parentV2.parentRecoveryContract, "parent V1 binding");
  const parentV1Path = resolveStored(path.dirname(parentV2Path), parentV1Binding.path);
  if (await sha256File(await safeFile(parentV1Path, "parent V1 contract")) !== parentV1Binding.sha256) throw new Error("parent V1 contract hash drifted");
  const parentV1Body = await readJson(parentV1Path, "parent V1 contract");
  await verifySealedRows(path.dirname(parentV1Path), parentV1Body.sealedFiles, expectedV1Seals(), "parent V1 sealed files");
  const parentV1 = { path: parentV1Path, body: parentV1Body };

  const failed = requireObject(contract.failedParentAttempt, "failed V2 attempt binding");
  assertKeys(failed, [
    "ownerPath", "ownerSha256", "ownerRecordDigest", "stagingPath", "artifactDigest",
    "directoryManifestDigest", "expectedFailure", "failurePhase",
  ], "failed V2 attempt binding");
  if (failed.expectedFailure !== EXPECTED_FAILURE || failed.failurePhase !== "recovered-job-built-before-recovery-lock") throw new Error("failed V2 fingerprint drifted");
  const ownerPath = resolveStored(contractBase, failed.ownerPath);
  const stagingPath = resolveStored(contractBase, failed.stagingPath);
  if (await sha256File(await safeFile(ownerPath, "failed V2 owner")) !== failed.ownerSha256) throw new Error("failed V2 owner bytes drifted");
  const owner = await readJson(ownerPath, "failed V2 owner");
  const ownerBody = { ...owner };
  delete ownerBody.ownerRecordDigest;
  if (pythonDigest(ownerBody) !== failed.ownerRecordDigest || owner.contractSha256 !== parentBinding.sha256) throw new Error("failed V2 owner record drifted");
  const parentV2Completion = resolveStored(path.dirname(parentV2Path), parentV2.completionDirectory);
  if (await exists(parentV2Completion)) throw new Error("parent V2 completion unexpectedly exists");
  const failedFiles = await walkFiles(stagingPath);
  const failedDirectories = await walkDirectories(stagingPath);
  if (pythonDigest(failedFiles) !== failed.artifactDigest || pythonDigest(failedDirectories) !== failed.directoryManifestDigest) throw new Error("failed V2 staging drifted");
  const failedChildren = (await fs.readdir(stagingPath, { withFileTypes: true })).map((entry) => `${entry.isDirectory() ? "d" : "f"}:${entry.name}`).sort();
  equal(failedChildren, ["d:compatibility-projection-build", "d:v1-evidence"], "failed V2 staging topology");

  const completionRoot = await safeDirectory(resolveStored(contractBase, contract.completionDirectory), "V3 completion root");
  const completionChildren = (await fs.readdir(completionRoot, { withFileTypes: true })).map((entry) => `${entry.isDirectory() ? "d" : "f"}:${entry.name}`).sort();
  equal(completionChildren, ["d:v2-failed-attempt", "f:completion-receipt.json"], "V3 completion topology");
  const receiptPath = path.join(completionRoot, "completion-receipt.json");
  const receipt = await readJson(receiptPath, "V3 completion receipt");
  assertKeys(receipt, [
    "schemaVersion", "kind", "caseId", "derivationContract", "status", "parentV2",
    "baseRecovery", "completion", "aggregateExecution", "native", "v2FailureEvidence",
    "compatibilityProjection", "completionRecordDigest",
  ], "V3 completion receipt");
  const recordDigest = requireDigest(receipt.completionRecordDigest, "V3 completion record digest");
  const body = { ...receipt };
  delete body.completionRecordDigest;
  if (pythonDigest(body) !== recordDigest) throw new Error("V3 completion receipt self-digest drifted");
  if (body.schemaVersion !== 3 || body.kind !== RECEIPT_KIND || body.caseId !== contract.caseId
    || body.derivationContract !== CONTRACT_ID || body.status !== "completed") throw new Error("unsupported V3 completion receipt");
  equal(body.aggregateExecution, { harborCalls: 0, modelCalls: 0, verifierCalls: 2 }, "V3 aggregate calls");

  const completion = requireObject(body.completion, "V3 receipt completion");
  assertKeys(completion, ["contractPath", "contractSha256", "sealedFiles", "sealedSetDigest", "normalizations", "execution"], "V3 receipt completion");
  if (resolveStored(contractBase, completion.contractPath) !== path.resolve(contractFile)
    || completion.contractSha256 !== await sha256File(contractFile)) throw new Error("V3 completion contract binding drifted");
  equal(completion.sealedFiles, contract.sealedFiles, "V3 receipt seals");
  if (completion.sealedSetDigest !== pythonDigest(completion.sealedFiles)) throw new Error("V3 sealed-set digest drifted");
  equal(completion.normalizations, NORMALIZATIONS, "V3 receipt normalizations");
  equal(completion.execution, { harborCalls: 0, modelCalls: 0, verifierCalls: 0 }, "V3 completion calls");

  const receiptParent = requireObject(body.parentV2, "V3 receipt parent");
  assertKeys(receiptParent, [
    "contractPath", "contractSha256", "sealedFiles", "sealedSetDigest", "failedOwnerPath",
    "failedOwnerSha256", "failedOwnerRecordDigest", "failedStagingPath",
    "failedStagingArtifactDigest", "failedStagingDirectoryManifestDigest", "failure",
    "failurePhase", "execution",
  ], "V3 receipt parent");
  if (resolveStored(contractBase, receiptParent.contractPath) !== parentV2Path
    || receiptParent.contractSha256 !== parentBinding.sha256
    || receiptParent.failedOwnerSha256 !== failed.ownerSha256
    || receiptParent.failedOwnerRecordDigest !== failed.ownerRecordDigest
    || receiptParent.failedStagingArtifactDigest !== failed.artifactDigest
    || receiptParent.failedStagingDirectoryManifestDigest !== failed.directoryManifestDigest
    || receiptParent.failure !== EXPECTED_FAILURE
    || receiptParent.failurePhase !== failed.failurePhase) throw new Error("V3 receipt parent binding drifted");
  if (resolveStored(contractBase, receiptParent.failedOwnerPath) !== ownerPath
    || resolveStored(contractBase, receiptParent.failedStagingPath) !== stagingPath) throw new Error("V3 receipt parent paths drifted");
  equal(receiptParent.sealedFiles, parentV2.sealedFiles, "V3 receipt parent seals");
  if (receiptParent.sealedSetDigest !== pythonDigest(receiptParent.sealedFiles)) throw new Error("V3 parent sealed-set digest drifted");
  equal(receiptParent.execution, { harborCalls: 0, modelCalls: 0, verifierCalls: 0 }, "V2 failed attempt calls");

  const journalBinding = parentV2.parentCallJournal;
  const journalPath = resolveStored(path.dirname(parentV2Path), journalBinding.path);
  if (await sha256File(await safeFile(journalPath, "V1 call journal")) !== journalBinding.sha256) throw new Error("V1 call journal bytes drifted");
  const journal = await readJson(journalPath, "V1 call journal");
  const baseRecovery = requireObject(body.baseRecovery, "V3 base recovery");
  assertKeys(baseRecovery, ["callJournalPath", "callJournalSha256", "callJournalRecordDigest", "execution"], "V3 base recovery");
  equal(body.baseRecovery, {
    callJournalPath: receipt.baseRecovery.callJournalPath,
    callJournalSha256: journalBinding.sha256,
    callJournalRecordDigest: journalBinding.recordDigest,
    execution: { harborCalls: 0, modelCalls: 0, verifierCalls: 2 },
  }, "V3 base recovery");
  if (resolveStored(contractBase, body.baseRecovery.callJournalPath) !== journalPath
    || journal.journalRecordDigest !== journalBinding.recordDigest) throw new Error("V3 base journal binding drifted");

  const native = requireObject(body.native, "V3 native binding");
  assertKeys(native, ["resumeLockSha256", "nativeRetryJobArtifactDigest", "sourceAttemptRecordDigest"], "V3 native binding");
  equal(native, {
    resumeLockSha256: parentV1Body.native.resumeLockSha256,
    nativeRetryJobArtifactDigest: parentV1Body.native.nativeRetryJobArtifactDigest,
    sourceAttemptRecordDigest: parentV1Body.native.sourceAttemptRecordDigest,
  }, "V3 native binding");

  const evidence = requireObject(body.v2FailureEvidence, "V3 failure evidence");
  assertKeys(evidence, [
    "directory", "artifactManifest", "artifactDigest", "directoryManifest", "directoryManifestDigest",
    "trust", "originalOwnerPath", "originalOwnerSha256", "originalStagingPath",
    "originalStagingArtifactDigest", "originalStagingDirectoryManifestDigest",
  ], "V3 failure evidence");
  const evidenceRoot = await safeDirectory(resolveStored(contractBase, evidence.directory), "V3 failure evidence root");
  if (evidenceRoot !== path.join(completionRoot, "v2-failed-attempt") || evidence.trust !== "failed-derived-evidence-only") throw new Error("V3 failure evidence trust/path drifted");
  const evidenceChildren = (await fs.readdir(evidenceRoot, { withFileTypes: true }))
    .map((entry) => `${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "x"}:${entry.name}`)
    .sort(comparePythonStrings);
  equal(evidenceChildren, ["d:staging", "f:owner.json", "f:parent-v2-contract.json"], "V3 failure evidence direct topology");
  const evidenceFiles = await walkFiles(evidenceRoot);
  const evidenceDirectories = await walkDirectories(evidenceRoot);
  equal(evidenceFiles, evidence.artifactManifest, "V3 failure evidence manifest");
  equal(evidenceDirectories, evidence.directoryManifest, "V3 failure evidence topology");
  if (pythonDigest(evidenceFiles) !== evidence.artifactDigest || pythonDigest(evidenceDirectories) !== evidence.directoryManifestDigest) throw new Error("V3 failure evidence digest drifted");
  if (resolveStored(contractBase, evidence.originalOwnerPath) !== ownerPath || evidence.originalOwnerSha256 !== failed.ownerSha256
    || resolveStored(contractBase, evidence.originalStagingPath) !== stagingPath
    || evidence.originalStagingArtifactDigest !== failed.artifactDigest
    || evidence.originalStagingDirectoryManifestDigest !== failed.directoryManifestDigest) throw new Error("V3 original failure evidence binding drifted");
  if (await sha256File(path.join(evidenceRoot, "owner.json")) !== failed.ownerSha256
    || await sha256File(path.join(evidenceRoot, "parent-v2-contract.json")) !== parentBinding.sha256) throw new Error("V3 copied parent evidence drifted");
  const copiedFiles = await walkFiles(path.join(evidenceRoot, "staging"));
  const copiedDirectories = await walkDirectories(path.join(evidenceRoot, "staging"));
  equal(copiedFiles, failedFiles, "V3 copied failed staging files");
  equal(copiedDirectories, failedDirectories, "V3 copied failed staging topology");

  await verifyProjection(contractBase, body.compatibilityProjection, parentV1);
  return { contract, receipt, receiptPath, completionRecordDigest: recordDigest, projection: body.compatibilityProjection };
}

function verifyLegacyCrossBindings(projection, evidence) {
  for (const [projectionKey, evidenceKey] of [
    ["recoveryLockSha256", "recoveryLockSha256"],
    ["recoveryRecordDigest", "recoveryRecordDigest"],
    ["recoveryResultSha256", "recoveryResultSha256"],
    ["recoveryResultDigest", "recoveryResultDigest"],
    ["effectiveJobDigest", "effectiveJobDigest"],
    ["nativeRetryJobArtifactDigest", "nativeRetryJobArtifactDigest"],
    ["recoveredJobArtifactDigest", "recoveredJobArtifactDigest"],
    ["resumeManifestSha256", "resumeManifestSha256"],
  ]) {
    if (projection[projectionKey] !== evidence.provenance[evidenceKey]) throw new Error(`V3/V1 ${projectionKey} drifted`);
  }
}

export async function verifyPostAgentDerivationV3({
  contractPath = DEFAULT_CONTRACT,
  protocol,
  runtimeRoot = DEFAULT_RUNTIME,
  resumeOutputDirectory,
  originalJobDirectory,
} = {}) {
  const [completion, legacyEvidence] = await Promise.all([
    verifyPostAgentDerivationV3Structure({ contractPath }),
    resolveContrastPostAgentEffectiveEvidence({
      protocol: protocol ?? await readJson(DEFAULT_PROTOCOL, "generation-003 protocol"),
      runtimeRoot,
      resumeOutputDirectory,
      originalJobDirectory,
    }),
  ]);
  verifyLegacyCrossBindings(completion.projection, legacyEvidence);
  return { ...completion, legacyEvidence };
}

export async function resolveContrastPostAgentEffectiveEvidenceV3(options = {}) {
  const completion = await verifyPostAgentDerivationV3({
    ...options,
    contractPath: options.derivationContractPath ?? DEFAULT_CONTRACT,
  });
  const evidence = completion.legacyEvidence;
  const projection = completion.projection;
  return {
    ...evidence,
    selection: { ...evidence.selection, completionMode: "verifier-only-recovery-derivation-v3" },
    provenance: {
      ...evidence.provenance,
      completionMode: "verifier-only-recovery-derivation-v3",
      completion: {
        contract: CONTRACT_ID,
        receiptFileSha256: await sha256File(completion.receiptPath),
        recordDigest: completion.completionRecordDigest,
        execution: { harbor: 0, model: 0, verifier: 0 },
      },
    },
  };
}

export const POST_AGENT_DERIVATION_V3_CONTRACT = CONTRACT_ID;
