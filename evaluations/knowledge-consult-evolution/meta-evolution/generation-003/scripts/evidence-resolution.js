import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const CONTRAST_ID = "contrast-matrix-one-shot-answer";
const CONTRAST_FAILURE_CONTRACT = "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1";
const PYTHON_SHA256 = /^sha256:[a-f0-9]{64}$/;
const RAW_SHA256 = /^[a-f0-9]{64}$/;
const AUTH_SEAL_KIND = "generation-003-private-auth-payload-seal";
const CHILD_WRAPPER = "prepared/run-q003-clean-pi.sh";
const ANALYSIS_CHILD_WRAPPER = "prepared-v2/evidence/run-q003-clean-pi.sh.disabled";

class PythonJsonNumber {
  constructor(source) {
    this.source = source;
  }
}

function comparePythonStrings(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** Match json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False). */
export function pythonCanonicalJson(value) {
  if (value instanceof PythonJsonNumber) return value.source;
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => pythonCanonicalJson(item)).join(",")}]`;
  if (!value || typeof value !== "object") {
    throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
  }
  const keys = Object.keys(value).sort(comparePythonStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${pythonCanonicalJson(value[key])}`).join(",")}}`;
}

export function pythonDigest(value) {
  return `sha256:${createHash("sha256").update(pythonCanonicalJson(value), "utf8").digest("hex")}`;
}

function metaCanonicalJson(value) {
  function canonicalize(item) {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonicalize(item[key])]));
    }
    return item;
  }
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function metaObjectDigest(value) {
  return createHash("sha256").update(metaCanonicalJson(value), "utf8").digest("hex");
}

function parsePythonJson(text, label) {
  try {
    return JSON.parse(text, (_key, value, context) => (
      typeof value === "number" ? new PythonJsonNumber(context.source) : value
    ));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function plainNumber(value, label, { integer = false, minimum = null } = {}) {
  const raw = value instanceof PythonJsonNumber ? value.source : value;
  const number = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  if (integer && (!Number.isInteger(number) || (typeof raw === "string" && /[.eE]/.test(raw)))) {
    throw new Error(`${label} must be an integer`);
  }
  if (minimum !== null && number < minimum) throw new Error(`${label} must be at least ${minimum}`);
  return number;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof PythonJsonNumber) {
    throw new Error(`${label} must be an object`);
  }
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

function requireDigest(value, label) {
  const digest = requireString(value, label);
  if (!PYTHON_SHA256.test(digest)) throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  return digest;
}

function requireRawDigest(value, label) {
  const digest = requireString(value, label);
  if (!RAW_SHA256.test(digest)) throw new Error(`${label} must be 64 lowercase hex characters`);
  return digest;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift`);
}

function equalPythonJson(actual, expected, label) {
  if (pythonCanonicalJson(actual) !== pythonCanonicalJson(expected)) throw new Error(`${label} drift`);
}

function requireProtocolV2(protocol) {
  const value = requireObject(protocol, "generation-003 protocol");
  assertValue(plainNumber(value.schemaVersion, "protocol.schemaVersion", { integer: true }), 2, "protocol.schemaVersion");
  assertValue(value.generationId, "generation-003", "protocol.generationId");
  return value;
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function sha256HexFile(filePath) {
  return (await sha256File(filePath)).slice("sha256:".length);
}

function hostPath(value) {
  const raw = requireString(value, "stored path");
  if (process.platform === "win32") {
    const match = raw.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (match) return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
  }
  return raw;
}

function assertLexicallyInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if ((!allowRoot && relative === "") || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its declared root`);
  }
  return resolved;
}

async function assertNoLinkChain(root, target, label, expectedType) {
  const resolvedRoot = path.resolve(root);
  const resolved = assertLexicallyInside(resolvedRoot, target, label, { allowRoot: true });
  const relative = path.relative(resolvedRoot, resolved);
  const nodes = [resolvedRoot];
  if (relative) {
    let current = resolvedRoot;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      nodes.push(current);
    }
  }
  for (const node of nodes) {
    let stat;
    try {
      stat = await fs.lstat(node);
    } catch (error) {
      throw new Error(`${label} is missing`, { cause: error });
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} contains a symbolic link or junction`);
  }
  const finalStat = await fs.lstat(resolved);
  if (expectedType === "file" && !finalStat.isFile()) throw new Error(`${label} must be a regular file`);
  if (expectedType === "directory" && !finalStat.isDirectory()) throw new Error(`${label} must be a directory`);
  const [realRoot, realTarget] = await Promise.all([fs.realpath(resolvedRoot), fs.realpath(resolved)]);
  assertLexicallyInside(realRoot, realTarget, `${label} real path`, { allowRoot: true });
  return resolved;
}

async function assertAbsoluteNoLinkChain(target, label, expectedType) {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  return assertNoLinkChain(root, resolved, label, expectedType);
}

async function sameExistingPath(left, right) {
  const [a, b] = await Promise.all([
    fs.realpath(path.resolve(hostPath(left))),
    fs.realpath(path.resolve(hostPath(right))),
  ]);
  return path.relative(a, b) === "" && path.relative(b, a) === "";
}

async function assertStoredDirectoryEquals(root, stored, expected, label) {
  const native = hostPath(requireString(stored, label));
  if (!path.isAbsolute(native)) throw new Error(`${label} must be absolute`);
  const safe = await assertNoLinkChain(root, path.resolve(native), label, "directory");
  if (!(await sameExistingPath(safe, expected))) throw new Error(`${label} drift`);
  return safe;
}

function safeRelativePath(value, label) {
  const relative = requireString(value, label);
  if (
    relative.includes("\\")
    || relative.startsWith("/")
    || /^[A-Za-z]:/.test(relative)
    || path.posix.normalize(relative) !== relative
    || relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} must be a normalized relative POSIX path`);
  return relative;
}

async function readSafePythonJson(root, filePath, label) {
  const safe = await assertNoLinkChain(root, filePath, label, "file");
  return requireObject(parsePythonJson(await fs.readFile(safe, "utf8"), label), label);
}

async function verifyArtifactManifest({ jobDirectory, manifest, expectedDigest, label, required = [] }) {
  const root = await assertAbsoluteNoLinkChain(jobDirectory, `${label} job`, "directory");
  const rows = requireArray(manifest, `${label} artifact manifest`);
  const observedPaths = [];
  const seen = new Set();
  for (const [index, raw] of rows.entries()) {
    const row = requireObject(raw, `${label} artifact manifest[${index}]`);
    const relative = safeRelativePath(row.path, `${label} artifact path`);
    if (seen.has(relative)) throw new Error(`${label} artifact manifest contains a duplicate path`);
    seen.add(relative);
    observedPaths.push(relative);
    const expected = requireDigest(row.sha256, `${label} artifact SHA-256`);
    const filePath = await assertNoLinkChain(root, path.join(root, ...relative.split("/")), `${label} artifact ${relative}`, "file");
    if (await sha256File(filePath) !== expected) throw new Error(`${label} artifact bytes drift`);
  }
  const sorted = [...observedPaths].sort(comparePythonStrings);
  if (observedPaths.some((value, index) => value !== sorted[index])) {
    throw new Error(`${label} artifact manifest must be path-sorted`);
  }
  for (const requiredPath of required) {
    if (!seen.has(requiredPath)) throw new Error(`${label} artifact manifest lacks ${requiredPath}`);
  }
  if (pythonDigest(rows) !== requireDigest(expectedDigest, `${label} artifact digest`)) {
    throw new Error(`${label} artifact manifest digest drift`);
  }
  return { root, rows };
}

async function walkFiles(root, { omit = new Set() } = {}) {
  const safeRoot = await assertAbsoluteNoLinkChain(root, "effective job", "directory");
  const rows = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error("Effective job contains a symbolic link or junction");
      if (entry.isDirectory()) {
        await assertNoLinkChain(safeRoot, absolute, `effective directory ${relative}`, "directory");
        await walk(absolute);
      } else if (entry.isFile()) {
        await assertNoLinkChain(safeRoot, absolute, `effective file ${relative}`, "file");
        if (!omit.has(relative)) rows.push({ path: relative, sha256: await sha256File(absolute) });
      } else {
        throw new Error("Effective job contains a non-file filesystem node");
      }
    }
  }
  await walk(safeRoot);
  rows.sort((left, right) => comparePythonStrings(left.path, right.path));
  return rows;
}

function containsShellPath(value) {
  if (Array.isArray(value)) return value.some(containsShellPath);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => key.toLowerCase() === "shellpath" || containsShellPath(item));
}

function authShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, items: value.map(authShape) };
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return {
      type: "object",
      keys,
      fields: Object.fromEntries(keys.map((key) => [key, authShape(value[key])])),
    };
  }
  return { type: value === null ? "null" : typeof value };
}

function validateAuthDocument(document, protocol) {
  const root = requireObject(document, "auth.json");
  if (containsShellPath(root)) throw new Error("auth.json violates the isolated Pi shape contract");
  const credential = requireObject(root["openai-codex"], "auth.json provider entry");
  const contract = requireObject(protocol.harbor?.authenticationSourceContract, "authentication source contract");
  for (const field of requireArray(contract.requiredNonEmptyStringFields, "required auth string fields")) {
    requireString(credential[field], "required auth credential field");
  }
  const expires = credential[requireString(contract.requiredFiniteNumberField, "required auth numeric field")];
  if (typeof expires !== "number" || !Number.isFinite(expires)) {
    throw new Error("auth.json violates the isolated Pi shape contract");
  }
}

/**
 * Verify the private auth payload binding without returning credential metadata or
 * the payload digest. `authJsonPath` may name auth.json or its containing directory.
 */
export async function verifyPrivateAuthSeal({ protocol, runtimeRoot, authJsonPath, sealPath } = {}) {
  const frozen = requireProtocolV2(protocol);
  const runtime = await assertAbsoluteNoLinkChain(path.resolve(runtimeRoot), "generation-003 runtime", "directory");
  const policy = requireObject(frozen.privateAuthenticationSeal, "privateAuthenticationSeal");
  assertValue(plainNumber(policy.schemaVersion, "privateAuthenticationSeal.schemaVersion", { integer: true }), 1, "privateAuthenticationSeal.schemaVersion");
  assertValue(policy.mountTarget, "/root/.pi/agent", "private auth mount target");
  equalPythonJson(policy.projectedEntries, ["auth.json"], "private auth projected entries");
  assertValue(policy.bindsExistingChildWrapper, true, "private auth wrapper binding policy");
  assertValue(policy.publishPayloadDigest, false, "private auth digest publication policy");
  assertValue(policy.publishCredentialMetadata, false, "private auth metadata publication policy");

  const declaredSeal = assertLexicallyInside(runtime, path.join(runtime, ...safeRelativePath(policy.path, "private auth seal path").split("/")), "private auth seal");
  if (sealPath !== undefined && path.resolve(sealPath) !== declaredSeal) throw new Error("Private auth seal path drift");
  const sealFile = await assertNoLinkChain(runtime, declaredSeal, "private auth seal", "file");
  let seal;
  try {
    seal = requireObject(JSON.parse(await fs.readFile(sealFile, "utf8")), "private auth seal");
  } catch (error) {
    throw new Error(`Private auth seal is not valid JSON: ${error.message}`, { cause: error });
  }
  const sealSha256 = requireRawDigest(seal.sealSha256, "private auth seal digest");
  const sealBody = { ...seal };
  delete sealBody.sealSha256;
  if (metaObjectDigest(sealBody) !== sealSha256) throw new Error("Private auth seal digest does not verify");
  assertValue(plainNumber(seal.schemaVersion, "private auth seal schemaVersion", { integer: true }), 1, "private auth seal schemaVersion");
  assertValue(seal.kind, AUTH_SEAL_KIND, "private auth seal kind");
  const mount = requireObject(seal.mount, "private auth seal mount");
  assertValue(mount.source, frozen.harbor?.authenticationMount?.source, "private auth seal mount source");
  assertValue(mount.target, policy.mountTarget, "private auth seal mount target");
  equalPythonJson(mount.projectedEntries, policy.projectedEntries, "private auth seal projected entries");
  const publication = requireObject(seal.publicationPolicy, "private auth seal publication policy");
  assertValue(publication.publishPayloadDigest, false, "private auth seal payload publication policy");
  assertValue(publication.publishCredentialMetadata, false, "private auth seal metadata publication policy");
  const payload = requireObject(seal.payload, "private auth seal payload");
  const payloadDigest = requireRawDigest(payload.sha256, "private auth seal payload SHA-256");
  const payloadBytes = plainNumber(payload.byteLength, "private auth seal payload bytes", { integer: true, minimum: 1 });
  const payloadMtime = plainNumber(payload.mtimeMs, "private auth seal payload mtime", { integer: true, minimum: 0 });
  const payloadShapeDigest = requireRawDigest(payload.shapeSha256, "private auth seal shape SHA-256");
  assertValue(payload.requiredProviderShape, true, "private auth seal provider shape assertion");
  assertValue(payload.recursiveShellPathAbsent, true, "private auth seal shellPath assertion");
  const execution = requireObject(seal.executionBinding, "private auth seal execution binding");
  assertValue(execution.assertedWrapperInput, "same-auth-json-payload", "private auth wrapper input assertion");
  const wrapperDigest = requireRawDigest(execution.childWrapperSha256, "private auth seal wrapper SHA-256");

  let authCandidate = path.resolve(requireString(authJsonPath, "current auth source"));
  const authStat = await fs.lstat(authCandidate);
  if (authStat.isSymbolicLink()) throw new Error("Current auth source cannot be a link");
  if (authStat.isDirectory()) authCandidate = path.join(authCandidate, "auth.json");
  const authFile = await assertAbsoluteNoLinkChain(authCandidate, "current auth.json", "file");
  const finalAuthStat = await fs.lstat(authFile);
  const authBytes = await fs.readFile(authFile);
  if (
    authBytes.length !== payloadBytes
    || createHash("sha256").update(authBytes).digest("hex") !== payloadDigest
    || Math.trunc(finalAuthStat.mtimeMs) !== payloadMtime
  ) {
    throw new Error("Current auth.json does not match the private payload seal");
  }
  let authDocument;
  try {
    authDocument = JSON.parse(authBytes.toString("utf8"));
  } catch (error) {
    throw new Error("Current auth.json is not valid JSON", { cause: error });
  }
  validateAuthDocument(authDocument, frozen);
  if (metaObjectDigest(authShape(authDocument)) !== payloadShapeDigest) {
    throw new Error("Current auth.json shape does not match the private payload seal");
  }

  let wrapperRelative = CHILD_WRAPPER;
  try {
    await fs.lstat(path.join(runtime, ...CHILD_WRAPPER.split("/")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    wrapperRelative = ANALYSIS_CHILD_WRAPPER;
  }
  const wrapperPath = await assertNoLinkChain(runtime, path.join(runtime, ...wrapperRelative.split("/")), "sealed child wrapper", "file");
  if (await sha256HexFile(wrapperPath) !== wrapperDigest) throw new Error("Existing child wrapper does not match the private auth seal");

  const childIds = requireArray(frozen.target?.children, "protocol target children")
    .map((child, index) => requireString(requireObject(child, `protocol child ${index}`).candidateId, "protocol child candidateId"));
  const bindings = requireArray(execution.preservedOriginalJobs, "private auth preserved original jobs");
  if (bindings.length !== childIds.length) throw new Error("Private auth seal child coverage drift");
  for (const [index, candidateId] of childIds.entries()) {
    const binding = requireObject(bindings[index], `private auth child binding ${index}`);
    assertValue(binding.candidateId, candidateId, "private auth child binding candidate");
    const jobName = `${requireString(frozen.harbor?.jobNamePrefix, "Harbor job prefix")}-q003-${candidateId}`;
    const jobDirectory = await assertNoLinkChain(
      runtime,
      path.join(runtime, "jobs", "q003", candidateId, jobName),
      `${candidateId} preserved original job`,
      "directory",
    );
    assertValue(
      binding.jobDirectorySha256,
      createHash("sha256").update(path.resolve(jobDirectory), "utf8").digest("hex"),
      "private auth child job path binding",
    );
    requireString(binding.startedAt, "private auth child start time");
    for (const [field, name] of [["configSha256", "config.json"], ["lockSha256", "lock.json"], ["resultSha256", "result.json"]]) {
      const filePath = await assertNoLinkChain(jobDirectory, path.join(jobDirectory, name), `${candidateId} sealed ${name}`, "file");
      assertValue(requireRawDigest(binding[field], `private auth child ${field}`), await sha256HexFile(filePath), `private auth child ${field}`);
    }
  }
  return {
    verified: true,
    sealPath: declaredSeal,
    mountTarget: policy.mountTarget,
    projectedEntries: ["auth.json"],
    bindings: {
      currentPayload: true,
      existingChildWrapper: true,
    },
  };
}

function cloneWithout(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

async function discoverOnlyEffectiveJob(resumeOutput, expectedSourceKey) {
  const effectiveRoot = await assertNoLinkChain(
    resumeOutput,
    path.join(resumeOutput, "effective-jobs"),
    "resume effective-jobs root",
    "directory",
  );
  const sourceEntries = await fs.readdir(effectiveRoot, { withFileTypes: true });
  if (sourceEntries.length !== 1 || !sourceEntries[0].isDirectory() || sourceEntries[0].isSymbolicLink()) {
    throw new Error("Resume output must contain exactly one effective source directory");
  }
  if (!/^[a-f0-9]{64}$/.test(sourceEntries[0].name)) throw new Error("Effective source directory name is not canonical");
  if (sourceEntries[0].name !== expectedSourceKey) throw new Error("Effective source directory does not bind the original job");
  const sourceRoot = await assertNoLinkChain(effectiveRoot, path.join(effectiveRoot, sourceEntries[0].name), "effective source directory", "directory");
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  if (entries.length !== 1 || entries[0].name !== "effective-job" || !entries[0].isDirectory() || entries[0].isSymbolicLink()) {
    throw new Error("Resume source directory must contain only effective-job");
  }
  return assertNoLinkChain(sourceRoot, path.join(sourceRoot, "effective-job"), "contrast effective job", "directory");
}

/** Resolve and cryptographically verify only contrast's manifested effective job. */
export async function resolveContrastEffectiveEvidence({ protocol, runtimeRoot, resumeOutputDirectory, originalJobDirectory } = {}) {
  const frozen = requireProtocolV2(protocol);
  const runtime = await assertAbsoluteNoLinkChain(path.resolve(runtimeRoot), "generation-003 runtime", "directory");
  const declaration = requireObject(frozen.effectiveEvidence?.[CONTRAST_ID], "contrast effective evidence declaration");
  assertValue(declaration.mode, "manifested-first-evaluable-retry-effective-job", "contrast effective evidence mode");
  assertValue(declaration.originalJobImmutable, true, "contrast original immutability");
  assertValue(declaration.selectionPolicy, "first-evaluable-retry-never-best-of", "contrast selection policy");
  assertValue(plainNumber(declaration.maximumExternalRetries, "contrast retry cap", { integer: true }), 1, "contrast retry cap");
  assertValue(declaration.requiredSelectedLineage, "retry", "contrast selected lineage");
  assertValue(plainNumber(declaration.requiredAttempt, "contrast required attempt", { integer: true }), 1, "contrast required attempt");
  assertValue(declaration.requiredManifest, "resume-manifest.json", "contrast required manifest");

  const declaredResume = assertLexicallyInside(
    runtime,
    path.join(runtime, ...safeRelativePath(declaration.resumeOutputDirectory, "resume output declaration").split("/")),
    "resume output",
  );
  if (resumeOutputDirectory !== undefined && path.resolve(resumeOutputDirectory) !== declaredResume) {
    throw new Error("Resume output override differs from protocol");
  }
  const resumeOutput = await assertNoLinkChain(runtime, declaredResume, "contrast resume output", "directory");
  const expectedOriginal = path.join(
    runtime,
    "jobs",
    "q003",
    CONTRAST_ID,
    `${requireString(frozen.harbor?.jobNamePrefix, "Harbor job prefix")}-q003-${CONTRAST_ID}`,
  );
  if (originalJobDirectory !== undefined && path.resolve(originalJobDirectory) !== path.resolve(expectedOriginal)) {
    throw new Error("Original contrast job override differs from protocol-derived path");
  }
  const originalJob = await assertNoLinkChain(runtime, expectedOriginal, "original contrast job", "directory");

  const lockPath = path.join(resumeOutput, "resume-lock.json");
  const mergedPath = path.join(resumeOutput, "merged-result.json");
  const [lock, merged] = await Promise.all([
    readSafePythonJson(resumeOutput, lockPath, "resume-lock.json"),
    readSafePythonJson(resumeOutput, mergedPath, "merged-result.json"),
  ]);
  assertValue(plainNumber(lock.schemaVersion, "resume lock schemaVersion", { integer: true }), 1, "resume lock schemaVersion");
  assertValue(plainNumber(merged.schemaVersion, "merged result schemaVersion", { integer: true }), 1, "merged result schemaVersion");
  const policyDigest = requireDigest(lock.policyDigest, "resume policy digest");
  const contractDigest = requireDigest(lock.contractDigest, "resume contract digest");
  const contract = requireObject(lock.contract, "resume source contract");
  if (pythonDigest({ source: contract, policyDigest }) !== contractDigest) throw new Error("Resume contract digest does not verify");
  assertValue(plainNumber(contract.schemaVersion, "resume contract schemaVersion", { integer: true }), 1, "resume contract schemaVersion");
  assertValue(contract.harborVersion, frozen.frozenEvaluationProfile.harborVersion, "resume Harbor version");
  assertValue(contract.rewardKey, frozen.frozenEvaluationProfile.rewardKey, "resume reward key");
  assertValue(merged.policyDigest, policyDigest, "merged policy digest");
  assertValue(merged.contractDigest, contractDigest, "merged contract digest");
  assertValue(merged.selectionPolicy, declaration.selectionPolicy, "merged selection policy");
  assertValue(merged.rewardKey, frozen.frozenEvaluationProfile.rewardKey, "merged reward key");

  const sourceJobs = requireArray(contract.sourceJobs, "resume source jobs");
  if (sourceJobs.length !== 1) throw new Error("Resume contract must bind only the original contrast job");
  const sourceJob = requireObject(sourceJobs[0], "resume source job");
  assertValue(sourceJob.candidateId, CONTRAST_ID, "resume source candidate");
  await assertStoredDirectoryEquals(runtime, sourceJob.directory, originalJob, "resume source job");
  const sourceDigest = requireDigest(sourceJob.artifactDigest, "source job artifact digest");
  const sourceArtifacts = await verifyArtifactManifest({
    jobDirectory: originalJob,
    manifest: sourceJob.artifactManifest,
    expectedDigest: sourceDigest,
    label: "source contrast job",
    required: ["config.json", "lock.json", "result.json"],
  });

  const sourceTrials = requireArray(lock.sourceTrials, "resume source trials");
  if (sourceTrials.length !== 1) throw new Error("Resume lock must bind exactly one contrast source trial");
  const sourceTrial = requireObject(sourceTrials[0], "contrast source trial");
  const sourceTrialKey = requireDigest(sourceTrial.sourceTrialKey, "source trial key");
  assertValue(sourceTrial.candidateId, CONTRAST_ID, "source trial candidate");
  assertValue(sourceTrial.classification, "external", "source trial external classification");
  assertValue(sourceTrial.failureContract, CONTRAST_FAILURE_CONTRACT, "source trial failure contract");
  const remediationAttestationDigest = requireDigest(
    sourceTrial.remediationAttestationDigest,
    "source trial remediation attestation digest",
  );
  assertValue(sourceTrial.originalJobDigest, sourceDigest, "source trial original job digest");
  assertValue(sourceTrial.artifactDigest, sourceDigest, "source trial artifact digest");
  await assertStoredDirectoryEquals(runtime, sourceTrial.sourceJob, originalJob, "source trial job");

  const attempts = requireArray(lock.attempts, "resume attempts");
  if (attempts.length !== 1) throw new Error("Resume lock must contain only first attempt 1");
  const attempt = requireObject(attempts[0], "resume attempt 1");
  const sealedDigest = requireDigest(attempt.attemptRecordDigest, "attempt record digest");
  if (pythonDigest(cloneWithout(attempt, "attemptRecordDigest")) !== sealedDigest) {
    throw new Error("Resume attempt seal does not verify");
  }
  assertValue(attempt.sourceTrialKey, sourceTrialKey, "attempt source trial key");
  assertValue(plainNumber(attempt.attempt, "resume attempt number", { integer: true }), 1, "resume attempt number");
  assertValue(attempt.status, "completed", "resume attempt terminal status");
  assertValue(attempt.evaluable, true, "resume attempt evaluability");
  assertValue(attempt.classification, "semantic", "resume attempt classification");
  plainNumber(attempt.reward, "resume attempt reward", { minimum: 0 });
  const lifecycle = requireArray(attempt.lifecycle, "resume attempt lifecycle");
  if (lifecycle.length < 2) throw new Error("Resume attempt lifecycle is incomplete");
  assertValue(requireObject(lifecycle[0], "resume lifecycle start").status, "reserved", "resume lifecycle start");
  assertValue(requireObject(lifecycle.at(-1), "resume lifecycle end").status, "completed", "resume lifecycle end");
  for (const field of ["taskChecksum", "candidateSkillDigest", "evaluationProfileDigest"]) {
    assertValue(attempt[field], sourceTrial[field], `resume attempt ${field}`);
  }
  await assertStoredDirectoryEquals(runtime, attempt.parentJobDirectory, originalJob, "attempt parent job");
  assertValue(attempt.parentJobArtifactDigest, sourceDigest, "attempt parent job artifact digest");
  assertValue(attempt.parentTrialId, sourceTrial.trialId, "attempt parent trial id");
  assertValue(attempt.parentTrialName, sourceTrial.sourceTrial, "attempt parent trial name");
  assertValue(attempt.failureContract, CONTRAST_FAILURE_CONTRACT, "attempt failure contract");
  assertValue(attempt.remediationAttestationDigest, remediationAttestationDigest, "attempt remediation attestation");
  const parentResultDigest = requireDigest(attempt.parentTrialResultSha256, "attempt parent trial result SHA-256");
  const parentResultRows = sourceArtifacts.rows.filter((row) => (
    requireObject(row, "source artifact row").path.endsWith("/result.json") && row.sha256 === parentResultDigest
  ));
  if (parentResultRows.length !== 1) throw new Error("Attempt parent trial result does not bind one source artifact");
  assertValue(attempt.retryJobDigest, attempt.jobArtifactDigest, "retry artifact digest alias");
  const retryJob = await assertNoLinkChain(runtime, path.resolve(hostPath(attempt.jobDirectory)), "contrast retry job", "directory");
  await verifyArtifactManifest({
    jobDirectory: retryJob,
    manifest: attempt.jobArtifactManifest,
    expectedDigest: attempt.jobArtifactDigest,
    label: "contrast retry job",
    required: ["config.json", "lock.json", "result.json"],
  });

  const mergedTrials = requireArray(merged.trials, "merged trials");
  if (mergedTrials.length !== 1) throw new Error("Merged result must contain exactly one contrast trial");
  const mergedTrial = requireObject(mergedTrials[0], "merged contrast trial");
  assertValue(mergedTrial.sourceTrialKey, sourceTrialKey, "merged source trial key");
  const original = requireObject(mergedTrial.original, "merged original lineage");
  assertValue(original.evaluable, false, "merged original evaluability");
  assertValue(original.classification, "external", "merged original classification");
  assertValue(original.artifactDigest, sourceDigest, "merged original artifact digest");
  await assertStoredDirectoryEquals(runtime, original.jobDirectory, originalJob, "merged original job");
  const mergedRetries = requireArray(mergedTrial.retries, "merged retries");
  if (mergedRetries.length !== 1) throw new Error("Merged result must preserve only retry attempt 1");
  equalPythonJson(mergedRetries[0], attempt, "merged retry ledger copy");
  const selected = requireObject(mergedTrial.selected, "merged selected lineage");
  assertValue(selected.lineage, "retry", "merged selected lineage");
  assertValue(plainNumber(selected.attempt, "merged selected attempt", { integer: true }), 1, "merged selected attempt");
  await assertStoredDirectoryEquals(runtime, selected.jobDirectory, retryJob, "merged selected retry job");
  assertValue(selected.trialId, attempt.trialId, "merged selected retry trial");
  assertValue(mergedTrial.unresolvedRetryableExternal, false, "merged unresolved retryable state");
  assertValue(mergedTrial.nonRetryableUnavailable, false, "merged non-retryable state");
  assertValue(mergedTrial.unresolvedExternal, false, "merged unresolved state");
  plainNumber(mergedTrial.reward, "merged selected reward", { minimum: 0 });
  equalPythonJson(mergedTrial.reward, attempt.reward, "merged selected reward");

  const summary = requireObject(merged.summary, "merged summary");
  for (const [field, expected] of Object.entries({
    sourceTrials: 1,
    selectedOriginal: 0,
    selectedRetry: 1,
    unresolvedRetryableExternal: 0,
    nonRetryableUnavailable: 0,
    unresolvedExternal: 0,
    effectiveJobs: 1,
  })) assertValue(plainNumber(summary[field], `merged summary ${field}`, { integer: true }), expected, `merged summary ${field}`);

  const effectiveSourceKey = pythonDigest({
    directory: sourceJob.directory,
    artifactDigest: sourceDigest,
  }).slice("sha256:".length);
  const effectiveJob = await discoverOnlyEffectiveJob(resumeOutput, effectiveSourceKey);
  const effectiveRows = requireArray(merged.effectiveJobs, "merged effective jobs");
  if (effectiveRows.length !== 1) throw new Error("Merged result must declare one effective contrast job");
  const effectiveRow = requireObject(effectiveRows[0], "merged effective job");
  await assertStoredDirectoryEquals(runtime, effectiveRow.sourceJob, originalJob, "effective row source job");
  await assertStoredDirectoryEquals(runtime, effectiveRow.jobDirectory, effectiveJob, "effective row job");

  const manifestPath = path.join(effectiveJob, declaration.requiredManifest);
  const manifest = await readSafePythonJson(effectiveJob, manifestPath, "resume-manifest.json");
  assertValue(plainNumber(manifest.schemaVersion, "resume manifest schemaVersion", { integer: true }), 1, "resume manifest schemaVersion");
  assertValue(manifest.policyDigest, policyDigest, "resume manifest policy digest");
  assertValue(manifest.contractDigest, contractDigest, "resume manifest contract digest");
  assertValue(manifest.selectionPolicy, declaration.selectionPolicy, "resume manifest selection policy");
  assertValue(manifest.sourceJobArtifactDigest, sourceDigest, "resume manifest source digest");
  await assertStoredDirectoryEquals(runtime, manifest.sourceJob, originalJob, "resume manifest source job");
  const lineage = requireArray(manifest.lineage, "resume manifest lineage");
  if (lineage.length !== 1) throw new Error("Resume manifest must contain exactly one contrast lineage row");
  const lineageRow = requireObject(lineage[0], "resume manifest lineage row");
  assertValue(lineageRow.sourceTrialKey, sourceTrialKey, "manifest source trial key");
  const manifestSource = requireObject(lineageRow.sourceTrial, "manifest source trial");
  assertValue(manifestSource.artifactDigest, sourceDigest, "manifest source trial digest");
  await assertStoredDirectoryEquals(runtime, manifestSource.jobDirectory, originalJob, "manifest source trial job");
  const sourceTrialDirectory = await assertNoLinkChain(
    originalJob,
    path.resolve(hostPath(manifestSource.trialDirectory)),
    "manifest source trial directory",
    "directory",
  );
  const sourceTrialResultPath = `${path.relative(originalJob, sourceTrialDirectory).split(path.sep).join("/")}/result.json`;
  if (!sourceArtifacts.rows.some((row) => row.path === sourceTrialResultPath && row.sha256 === parentResultDigest)) {
    throw new Error("Manifest source trial directory does not bind the sealed parent result");
  }
  const manifestSelected = requireObject(lineageRow.selected, "manifest selected lineage");
  assertValue(manifestSelected.lineage, "retry", "manifest selected lineage");
  assertValue(plainNumber(manifestSelected.attempt, "manifest selected attempt", { integer: true }), 1, "manifest selected attempt");
  assertValue(manifestSelected.retryArtifactDigest, attempt.jobArtifactDigest, "manifest retry artifact digest");
  assertValue(manifestSelected.trialId, attempt.trialId, "manifest selected trial");
  await assertStoredDirectoryEquals(runtime, manifestSelected.jobDirectory, retryJob, "manifest selected retry job");

  const files = await walkFiles(effectiveJob, { omit: new Set([declaration.requiredManifest]) });
  equalPythonJson(manifest.files, files, "effective job file manifest");
  const effectiveDigest = requireDigest(manifest.effectiveJobDigest, "effective job digest");
  if (pythonDigest(files) !== effectiveDigest) throw new Error("Effective job aggregate digest does not verify");
  assertValue(effectiveRow.effectiveJobDigest, effectiveDigest, "merged effective job digest");
  for (const name of ["config.json", "lock.json"]) {
    const [sourceBytes, effectiveBytes] = await Promise.all([
      fs.readFile(await assertNoLinkChain(originalJob, path.join(originalJob, name), `original ${name}`, "file")),
      fs.readFile(await assertNoLinkChain(effectiveJob, path.join(effectiveJob, name), `effective ${name}`, "file")),
    ]);
    if (!sourceBytes.equals(effectiveBytes)) throw new Error(`Effective ${name} is not an exact copy of the original`);
  }

  return {
    candidateId: CONTRAST_ID,
    mode: declaration.mode,
    jobDirectory: effectiveJob,
    originalJobDirectory: originalJob,
    selection: {
      policy: declaration.selectionPolicy,
      lineage: "retry",
      attempt: 1,
    },
    provenance: {
      resumeLockSha256: await sha256File(lockPath),
      mergedResultSha256: await sha256File(mergedPath),
      resumeManifestSha256: await sha256File(manifestPath),
      policyDigest,
      contractDigest,
      sourceTrialKey,
      sourceJobArtifactDigest: sourceDigest,
      retryJobArtifactDigest: requireDigest(attempt.jobArtifactDigest, "retry job artifact digest"),
      attemptRecordDigest: sealedDigest,
      effectiveJobDigest: effectiveDigest,
      failureContract: CONTRAST_FAILURE_CONTRACT,
      remediationAttestationDigest,
    },
  };
}

export const verifyPrivateAuthenticationSeal = verifyPrivateAuthSeal;
export const discoverContrastEffectiveJob = resolveContrastEffectiveEvidence;
