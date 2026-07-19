import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContrastPostAgentEffectiveEvidence } from "./evidence-resolution-post-agent.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../..");
const CONTRACT_ID = "harbor-0.18.0.completed-verifier-journal.task-overwrite-default-omission.derivation-v2";
const RECEIPT_KIND = "harbor-verifier-recovery-derivation-v2-receipt";
const NORMALIZATION = {
  id: "harbor-taskconfig-overwrite-default-omission-v1",
  scope: "JobConfig.tasks[0].overwrite",
  expected: false,
  observed: "absent",
  artifactMutation: false,
};
const DEFAULT_CONTRACT = path.join(GENERATION_ROOT, "external-resume", "post-agent-derivation-v2-contract.json");
const DIGEST = /^sha256:[0-9a-f]{64}$/;

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

function assertEqual(actual, expected, label) {
  if (canonicalPython(actual) !== canonicalPython(expected)) throw new Error(`${label} drifted`);
}

function assertKeys(value, expected, label) {
  const actual = Object.keys(requireObject(value, label)).sort(comparePythonStrings);
  const wanted = [...expected].sort(comparePythonStrings);
  assertEqual(actual, wanted, `${label} keys`);
}

function hostPath(value) {
  const text = requireString(value, "stored path").replaceAll("\\", "/");
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

async function walkFiles(root) {
  const safeRoot = await safeDirectory(root, "V2 evidence root");
  const rows = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`V2 evidence contains link ${relative}`);
      if (entry.isDirectory()) await visit(await safeDirectory(absolute, `V2 evidence ${relative}`));
      else if (entry.isFile()) rows.push({ path: relative, sha256: await sha256File(await safeFile(absolute, `V2 evidence ${relative}`)) });
      else throw new Error(`V2 evidence contains unsupported node ${relative}`);
    }
  }
  await visit(safeRoot);
  return rows;
}

async function walkDirectories(root) {
  const safeRoot = await safeDirectory(root, "V2 directory-manifest root");
  const rows = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`V2 directory manifest contains link ${relative}`);
      if (entry.isDirectory()) {
        rows.push(relative);
        await visit(await safeDirectory(absolute, `V2 directory ${relative}`));
      } else if (!entry.isFile()) throw new Error(`V2 directory manifest contains unsupported node ${relative}`);
    }
  }
  await visit(safeRoot);
  return rows.sort(comparePythonStrings);
}

async function verifySealedRows(base, rows, label) {
  for (const [index, raw] of requireArray(rows, label).entries()) {
    const row = requireObject(raw, `${label}[${index}]`);
    assertKeys(row, ["path", "sha256"], `${label}[${index}]`);
    const file = resolveStored(base, requireString(row.path, `${label}[${index}].path`));
    if (await sha256File(await safeFile(file, `${label}[${index}]`)) !== requireDigest(row.sha256, `${label}[${index}].sha256`)) {
      throw new Error(`${label}[${index}] hash drifted`);
    }
  }
}

export async function verifyPostAgentDerivationV2({ contractPath = DEFAULT_CONTRACT } = {}) {
  const contractFile = await safeFile(contractPath, "derivation V2 contract");
  const contract = await readJson(contractFile, "derivation V2 contract");
  assertKeys(contract, [
    "schemaVersion", "caseId", "derivationContract", "parentRecoveryContract",
    "parentCallJournal", "preservedV1Work", "completionDirectory", "normalization", "sealedFiles",
  ], "derivation V2 contract");
  if (contract.schemaVersion !== 2 || contract.derivationContract !== CONTRACT_ID) throw new Error("unsupported derivation V2 contract");
  assertEqual(contract.normalization, NORMALIZATION, "derivation V2 normalization");
  const contractBase = path.dirname(contractFile);
  const expectedSealed = new Set([
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v2.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v2.py.lock"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "references", "verifier-only-derivation-v2.md"),
    path.join(GENERATION_ROOT, "external-resume", "run-generation-003-verifier-derivation-v2.sh"),
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent-v2.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent-v2.js"),
  ].map((file) => path.resolve(file)));
  const observedSealed = requireArray(contract.sealedFiles, "derivation V2 sealed files")
    .map((row) => resolveStored(contractBase, requireObject(row, "derivation V2 sealed row").path));
  if (observedSealed.length !== expectedSealed.size || new Set(observedSealed).size !== observedSealed.length
    || observedSealed.some((file) => !expectedSealed.has(file))) {
    throw new Error("derivation V2 sealed files differ from the exact executable set");
  }
  await verifySealedRows(contractBase, contract.sealedFiles, "derivation V2 sealed files");

  const parentBinding = requireObject(contract.parentRecoveryContract, "parent recovery contract binding");
  assertKeys(parentBinding, ["path", "sha256"], "parent recovery contract binding");
  const parentContractPath = resolveStored(contractBase, parentBinding.path);
  if (await sha256File(await safeFile(parentContractPath, "parent recovery contract")) !== requireDigest(parentBinding.sha256, "parent contract hash")) {
    throw new Error("parent recovery contract hash drifted");
  }
  const parentContract = await readJson(parentContractPath, "parent recovery contract");
  const journalBinding = requireObject(contract.parentCallJournal, "parent journal binding");
  assertKeys(journalBinding, ["path", "sha256", "recordDigest"], "parent journal binding");
  const journalPath = resolveStored(contractBase, journalBinding.path);
  if (await sha256File(await safeFile(journalPath, "parent call journal")) !== requireDigest(journalBinding.sha256, "parent journal hash")) {
    throw new Error("parent call journal hash drifted");
  }
  const journal = await readJson(journalPath, "parent call journal");
  if (journal.journalRecordDigest !== requireDigest(journalBinding.recordDigest, "parent journal record digest")) {
    throw new Error("parent journal record digest drifted");
  }
  const preservedBinding = requireObject(contract.preservedV1Work, "preserved V1 work binding");
  assertKeys(preservedBinding, ["path", "artifactDigest", "directoryManifestDigest"], "preserved V1 work binding");
  const boundWork = await safeDirectory(resolveStored(contractBase, preservedBinding.path), "contract-preserved V1 work");
  const boundWorkFiles = await walkFiles(boundWork);
  if (pythonDigest(boundWorkFiles) !== requireDigest(preservedBinding.artifactDigest, "bound V1 work digest")) throw new Error("contract-preserved V1 work bytes drifted");
  const boundWorkDirectories = await walkDirectories(boundWork);
  if (pythonDigest(boundWorkDirectories) !== requireDigest(preservedBinding.directoryManifestDigest, "bound V1 work topology digest")) throw new Error("contract-preserved V1 work topology drifted");

  const completionRoot = await safeDirectory(resolveStored(contractBase, contract.completionDirectory), "V2 completion root");
  const children = (await fs.readdir(completionRoot, { withFileTypes: true })).map((entry) => `${entry.isDirectory() ? "d" : "f"}:${entry.name}`).sort();
  assertEqual(children, ["d:v1-evidence", "f:completion-receipt.json"], "V2 completion namespace");
  const receiptPath = path.join(completionRoot, "completion-receipt.json");
  const receipt = await readJson(receiptPath, "V2 completion receipt");
  assertKeys(receipt, [
    "schemaVersion", "kind", "caseId", "derivationContract", "status", "parent",
    "completion", "aggregateExecution", "native", "v1Evidence", "compatibilityProjection",
    "completionRecordDigest",
  ], "V2 completion receipt");
  const completionRecordDigest = requireDigest(receipt.completionRecordDigest, "completion record digest");
  const body = { ...receipt };
  delete body.completionRecordDigest;
  if (pythonDigest(body) !== completionRecordDigest) throw new Error("V2 completion receipt self-digest drifted");
  if (body.schemaVersion !== 2 || body.kind !== RECEIPT_KIND || body.caseId !== contract.caseId
    || body.derivationContract !== CONTRACT_ID || body.status !== "completed") {
    throw new Error("unsupported V2 completion receipt");
  }

  const completion = requireObject(body.completion, "receipt completion");
  assertKeys(completion, ["contractPath", "contractSha256", "sealedFiles", "sealedSetDigest", "normalization", "execution"], "receipt completion");
  if (resolveStored(contractBase, completion.contractPath) !== path.resolve(contractFile)) throw new Error("receipt completion contract path drifted");
  if (completion.contractSha256 !== await sha256File(contractFile)) throw new Error("receipt completion contract hash drifted");
  assertEqual(completion.normalization, NORMALIZATION, "receipt normalization");
  assertEqual(completion.execution, { harborCalls: 0, modelCalls: 0, verifierCalls: 0 }, "completion call accounting");
  assertEqual(body.aggregateExecution, { harborCalls: 0, modelCalls: 0, verifierCalls: 2 }, "aggregate call accounting");
  assertEqual(completion.sealedFiles, contract.sealedFiles, "receipt V2 seals");
  if (completion.sealedSetDigest !== pythonDigest(completion.sealedFiles)) throw new Error("V2 sealed-set digest drifted");

  const parent = requireObject(body.parent, "receipt parent");
  assertKeys(parent, [
    "recoveryContractPath", "recoveryContractSha256", "sealedFiles", "sealedSetDigest",
    "callJournalPath", "callJournalSha256", "callJournalRecordDigest", "execution",
  ], "receipt parent");
  if (resolveStored(contractBase, parent.recoveryContractPath) !== path.resolve(parentContractPath)) throw new Error("receipt parent contract path drifted");
  if (parent.recoveryContractSha256 !== parentBinding.sha256) throw new Error("receipt parent contract hash drifted");
  if (resolveStored(contractBase, parent.callJournalPath) !== path.resolve(journalPath)) throw new Error("receipt journal path drifted");
  if (parent.callJournalSha256 !== journalBinding.sha256 || parent.callJournalRecordDigest !== journalBinding.recordDigest) {
    throw new Error("receipt journal binding drifted");
  }
  assertEqual(parent.execution, { harborCalls: 0, modelCalls: 0, verifierCalls: 2 }, "parent call accounting");
  if (parent.sealedSetDigest !== pythonDigest(parent.sealedFiles)) throw new Error("parent sealed-set digest drifted");
  const receiptParentSeals = requireArray(parent.sealedFiles, "parent seals");
  const declaredParentSeals = requireArray(parentContract.sealedFiles, "declared parent seals");
  if (receiptParentSeals.length !== declaredParentSeals.length) throw new Error("parent seal count drifted");
  for (const [index, row] of receiptParentSeals.entries()) {
    assertKeys(row, ["path", "sha256"], `parent seal ${index}`);
    const declared = requireObject(declaredParentSeals[index], `declared parent seal ${index}`);
    const receiptFile = resolveStored(contractBase, row.path);
    const declaredFile = resolveStored(path.dirname(parentContractPath), declared.path);
    if (receiptFile !== declaredFile || row.sha256 !== declared.sha256) throw new Error(`parent seal ${index} differs from its call contract`);
    if (await sha256File(await safeFile(receiptFile, `parent seal ${index}`)) !== row.sha256) throw new Error(`parent seal ${index} drifted`);
  }

  const evidence = requireObject(body.v1Evidence, "receipt V1 evidence");
  const evidenceRoot = path.join(completionRoot, "v1-evidence");
  assertKeys(evidence, [
    "directory", "artifactManifest", "artifactDigest", "directoryManifest", "sealedFiles",
    "partialStagingTrust", "preservedV1Work",
  ], "receipt V1 evidence");
  if (resolveStored(contractBase, evidence.directory) !== path.resolve(evidenceRoot)) throw new Error("V1 evidence directory binding drifted");
  const evidenceFiles = await walkFiles(evidenceRoot);
  assertEqual(evidenceFiles, evidence.artifactManifest, "V1 evidence file manifest");
  if (pythonDigest(evidenceFiles) !== evidence.artifactDigest) throw new Error("V1 evidence aggregate digest drifted");
  const evidenceDirectories = await walkDirectories(evidenceRoot);
  assertEqual(evidenceDirectories, evidence.directoryManifest, "V1 evidence directory manifest");
  if (await sha256File(path.join(evidenceRoot, "call-contract.json")) !== parentBinding.sha256) throw new Error("copied V1 call contract drifted");
  if (await sha256File(path.join(evidenceRoot, "call-journal.json")) !== journalBinding.sha256) throw new Error("copied V1 call journal drifted");
  if (evidence.partialStagingTrust !== "unsealed-evidence-only") throw new Error("partial V1 staging was promoted to trusted input");
  const copiedSeals = requireArray(evidence.sealedFiles, "copied V1 seals");
  if (copiedSeals.length !== receiptParentSeals.length) throw new Error("copied V1 seal count drifted");
  for (const [index, row] of copiedSeals.entries()) {
    assertKeys(row, ["sourcePath", "copiedPath", "sha256"], `copied V1 seal ${index}`);
    const parentSeal = receiptParentSeals[index];
    if (resolveStored(contractBase, row.sourcePath) !== resolveStored(contractBase, parentSeal.path)
      || row.sha256 !== parentSeal.sha256) throw new Error(`copied V1 seal ${index} source binding drifted`);
    const expectedCopiedPath = `sealed-files/${String(index + 1).padStart(3, "0")}-${path.basename(resolveStored(contractBase, parentSeal.path))}`;
    if (row.copiedPath !== expectedCopiedPath) throw new Error(`copied V1 seal ${index} path drifted`);
    if (await sha256File(path.join(evidenceRoot, ...row.copiedPath.split("/"))) !== row.sha256) throw new Error(`copied V1 seal ${index} bytes drifted`);
  }
  const preserved = requireObject(evidence.preservedV1Work, "preserved V1 work");
  assertKeys(preserved, ["directory", "artifactManifest", "artifactDigest", "directoryManifest", "directoryManifestDigest"], "preserved V1 work");
  const originalWork = resolveStored(contractBase, preserved.directory);
  if (originalWork !== path.resolve(boundWork)) throw new Error("receipt preserved V1 work path drifted");
  const workFiles = await walkFiles(originalWork);
  assertEqual(workFiles, preserved.artifactManifest, "preserved V1 work manifest");
  if (pythonDigest(workFiles) !== preserved.artifactDigest) throw new Error("preserved V1 work digest drifted");
  const workDirectories = await walkDirectories(originalWork);
  assertEqual(workDirectories, preserved.directoryManifest, "preserved V1 work directory manifest");
  if (pythonDigest(workDirectories) !== preserved.directoryManifestDigest) throw new Error("preserved V1 work directory digest drifted");
  if (preserved.artifactDigest !== preservedBinding.artifactDigest || preserved.directoryManifestDigest !== preservedBinding.directoryManifestDigest) {
    throw new Error("receipt preserved V1 work differs from its contract binding");
  }

  const projection = requireObject(body.compatibilityProjection, "compatibility projection");
  assertKeys(projection, [
    "recoveryOutputDirectory", "recoveryLockSha256", "recoveryRecordDigest",
    "recoveryResultSha256", "recoveryResultDigest", "effectiveJobDirectory",
    "resumeManifestSha256", "effectiveJobDigest", "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest", "schemaCompatibility",
  ], "compatibility projection");
  assertEqual(projection.schemaCompatibility, { recoveryLock: 1, recoveryResult: 1, effectiveManifest: 2 }, "projection schemas");
  const receiptNative = requireObject(body.native, "receipt native binding");
  assertKeys(receiptNative, ["resumeLockSha256", "nativeRetryJobArtifactDigest", "sourceAttemptRecordDigest"], "receipt native binding");
  if (receiptNative.resumeLockSha256 !== parentContract.native.resumeLockSha256
    || receiptNative.nativeRetryJobArtifactDigest !== parentContract.native.nativeRetryJobArtifactDigest
    || receiptNative.sourceAttemptRecordDigest !== parentContract.native.sourceAttemptRecordDigest) {
    throw new Error("receipt native binding differs from the parent contract");
  }
  if (projection.nativeRetryJobArtifactDigest !== receiptNative.nativeRetryJobArtifactDigest) throw new Error("projection native retry digest drifted");
  const expectedRecoveryRoot = resolveStored(path.dirname(parentContractPath), parentContract.outputDirectory);
  const expectedEffectiveRoot = resolveStored(path.dirname(parentContractPath), parentContract.effectiveJobDirectory);
  if (resolveStored(contractBase, projection.recoveryOutputDirectory) !== expectedRecoveryRoot) throw new Error("projection recovery output path drifted");
  if (resolveStored(contractBase, projection.effectiveJobDirectory) !== expectedEffectiveRoot) throw new Error("projection effective output path drifted");
  const recoveryRoot = await safeDirectory(resolveStored(contractBase, projection.recoveryOutputDirectory), "projection recovery root");
  const recoveryLockPath = path.join(recoveryRoot, "recovery-lock.json");
  const recoveryResultPath = path.join(recoveryRoot, "recovery-result.json");
  if (await sha256File(recoveryLockPath) !== requireDigest(projection.recoveryLockSha256, "projection recovery lock hash")) throw new Error("projection recovery-lock bytes drifted");
  if (await sha256File(recoveryResultPath) !== requireDigest(projection.recoveryResultSha256, "projection recovery result hash")) throw new Error("projection recovery-result bytes drifted");
  const [recoveryLock, recoveryResult] = await Promise.all([
    readJson(recoveryLockPath, "projection recovery lock"),
    readJson(recoveryResultPath, "projection recovery result"),
  ]);
  if (recoveryLock.recoveryRecordDigest !== projection.recoveryRecordDigest) throw new Error("projection recovery record digest drifted");
  if (recoveryResult.recoveryResultDigest !== projection.recoveryResultDigest) throw new Error("projection recovery result digest drifted");
  if (recoveryResult.recoveredJobArtifactDigest !== projection.recoveredJobArtifactDigest) throw new Error("projection recovered-job digest drifted");
  if (recoveryResult.resumeManifestSha256 !== projection.resumeManifestSha256) throw new Error("projection result/manifest hash drifted");
  const effectiveRoot = await safeDirectory(resolveStored(contractBase, projection.effectiveJobDirectory), "projection effective job");
  const manifestPath = path.join(effectiveRoot, "resume-manifest.json");
  if (await sha256File(manifestPath) !== requireDigest(projection.resumeManifestSha256, "projection manifest hash")) throw new Error("projection manifest bytes drifted");
  const manifest = await readJson(manifestPath, "projection effective manifest");
  if (manifest.effectiveJobDigest !== projection.effectiveJobDigest) throw new Error("projection effective digest drifted");

  return {
    contract,
    receipt,
    receiptPath,
    completionRecordDigest,
    projection,
  };
}

export async function resolveContrastPostAgentEffectiveEvidenceV2(options = {}) {
  const [completion, evidence] = await Promise.all([
    verifyPostAgentDerivationV2({ contractPath: options.derivationContractPath ?? DEFAULT_CONTRACT }),
    resolveContrastPostAgentEffectiveEvidence(options),
  ]);
  const projection = completion.projection;
  if (projection.recoveryLockSha256 !== evidence.provenance.recoveryLockSha256) throw new Error("V2/V1 recovery-lock hash drifted");
  if (projection.recoveryResultSha256 !== evidence.provenance.recoveryResultSha256) throw new Error("V2/V1 recovery-result hash drifted");
  if (projection.recoveryRecordDigest !== evidence.provenance.recoveryRecordDigest) throw new Error("V2/V1 recovery record drifted");
  if (projection.recoveryResultDigest !== evidence.provenance.recoveryResultDigest) throw new Error("V2/V1 recovery result drifted");
  if (projection.effectiveJobDigest !== evidence.provenance.effectiveJobDigest) throw new Error("V2/V1 effective digest drifted");
  if (projection.nativeRetryJobArtifactDigest !== evidence.provenance.nativeRetryJobArtifactDigest) throw new Error("V2/V1 native retry digest drifted");
  if (projection.recoveredJobArtifactDigest !== evidence.provenance.recoveredJobArtifactDigest) throw new Error("V2/V1 recovered-job digest drifted");
  if (projection.resumeManifestSha256 !== evidence.provenance.resumeManifestSha256) throw new Error("V2/V1 manifest hash drifted");
  return {
    ...evidence,
    selection: { ...evidence.selection, completionMode: "verifier-only-recovery-derivation-v2" },
    provenance: {
      ...evidence.provenance,
      completionMode: "verifier-only-recovery-derivation-v2",
      completion: {
        contract: CONTRACT_ID,
        receiptFileSha256: await sha256File(completion.receiptPath),
        recordDigest: completion.completionRecordDigest,
        execution: { harbor: 0, model: 0, verifier: 0 },
      },
    },
  };
}

export const POST_AGENT_DERIVATION_V2_CONTRACT = CONTRACT_ID;
