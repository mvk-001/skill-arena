import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  POST_AGENT_HARBOR_JSON_BOUNDARY,
  resolveContrastPostAgentEffectiveEvidence,
} from "./evidence-resolution-post-agent-v4-legacy.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../..");
const DEFAULT_CONTRACT = path.join(GENERATION_ROOT, "external-resume", "post-agent-verification-v4-contract.json");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const CONTRACT_ID = "harbor-0.18.0.verifier-recovery-v3.native-harbor-ordinary-json.js-parity-v4";
const COMPLETION_MODE = "verifier-only-recovery-derivation-v4-js-parity";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CROSS_BINDINGS = [
  ["recoveryLockSha256", "recoveryLockSha256"],
  ["recoveryRecordDigest", "recoveryRecordDigest"],
  ["recoveryResultSha256", "recoveryResultSha256"],
  ["recoveryResultDigest", "recoveryResultDigest"],
  ["effectiveJobDigest", "effectiveJobDigest"],
  ["nativeRetryJobArtifactDigest", "nativeRetryJobArtifactDigest"],
  ["recoveredJobArtifactDigest", "recoveredJobArtifactDigest"],
  ["resumeManifestSha256", "resumeManifestSha256"],
];
const CROSS_BINDING_KEYS = CROSS_BINDINGS.map(([projectionKey]) => projectionKey);
const COMPATIBILITY_PROJECTION_KEYS = [
  "effectiveJobDigest",
  "effectiveJobDirectory",
  "nativeRetryJobArtifactDigest",
  "recoveredJobArtifactDigest",
  "recoveryLockSha256",
  "recoveryOutputDirectory",
  "recoveryRecordDigest",
  "recoveryResultDigest",
  "recoveryResultSha256",
  "resumeManifestSha256",
  "schemaCompatibility",
];
const NORMALIZATION = [
  {
    id: "harbor-native-artifact-ordinary-json-boundary-v1",
    scope: ["JobResult", "TrialResult", "lock.json", "source config.json"],
    parser: "ordinary-json",
    byteTrust: "manifest-bound-only",
    pythonCanonicalRecoveryRecordsUnchanged: true,
    artifactMutation: false,
  },
  {
    id: "python-codepoint-manifest-order-v1",
    scope: ["file manifests", "manifest path assertions", "terminal key assertions"],
    ordering: "python-codepoint",
    artifactMutation: false,
  },
  {
    id: "harbor-recovered-trial-lock-default-projection-v1",
    comparisonContract: "harbor-0.18.0.trial-lock-default-projection-v1",
    artifactShapes: {
      nativeTrialResult: {
        environmentPresentNullFields: [
          "import_path", "override_cpus", "override_memory_mb", "override_storage_mb", "override_gpus", "override_tpu",
        ],
        verifierPresentNullFields: ["override_timeout_sec", "max_timeout_sec"],
        resumeProvenance: "forbidden",
      },
      effectiveSourceConfig: {
        environmentExactSourceKeys: ["mounts", "type"],
        environmentOmittedLockDefaults: {
          force_build: false,
          delete: true,
          cpu_enforcement_policy: "auto",
          memory_enforcement_policy: "auto",
          extra_docker_compose: [],
          kwargs: {},
          extra_allowed_hosts: [],
        },
        verifier: "absent",
        lockVerifierEquivalent: { disable: false },
        resumeProvenance: "required-digest-pair",
      },
    },
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

function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error(`unsupported V4 canonical value ${typeof value}`);
  const keys = Object.keys(value).sort(comparePythonStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function valueDigest(value) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
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
  if (canonical(actual) !== canonical(expected)) throw new Error(`${label} drifted`);
}

function assertKeys(value, expected, label) {
  equal(Object.keys(requireObject(value, label)).sort(comparePythonStrings), [...expected].sort(comparePythonStrings), `${label} keys`);
}

async function safeFile(file, label) {
  const resolved = path.resolve(file);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`${label} must be an ordinary single-link file`);
  return resolved;
}

async function readJson(file, label) {
  const safe = await safeFile(file, label);
  try {
    return requireObject(JSON.parse(await fs.readFile(safe, "utf8")), label);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

async function sha256File(file) {
  return `sha256:${createHash("sha256").update(await fs.readFile(await safeFile(file, "V4 sealed file"))).digest("hex")}`;
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

function expectedSeals() {
  return [
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent-v4-legacy.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-v4.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent-v4-legacy.js"),
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent-v4.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent-v4.js"),
    path.join(GENERATION_ROOT, "external-resume", "run-generation-003-baseline-v4.sh"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v4.py"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v4.py.lock"),
    path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "references", "verifier-js-parity-v4.md"),
  ];
}

function expectedSharedFiles() {
  return [
    path.join(GENERATION_ROOT, "scripts", "evidence-resolution.js"),
    path.join(GENERATION_ROOT, "scripts", "prepare-generation-003.js"),
    path.join(GENERATION_ROOT, "scripts", "publish-generation-003.js"),
    path.join(GENERATION_ROOT, "..", "generation-002", "scripts", "prepare-generation-002.js"),
    path.join(GENERATION_ROOT, "..", "scripts", "prepare-meta-evolution.js"),
    path.join(GENERATION_ROOT, "..", "scripts", "publish-meta-evolution.js"),
    path.join(REPO_ROOT, "package.json"),
    path.join(REPO_ROOT, "package-lock.json"),
  ];
}

async function verifySeals(base, rows) {
  const observed = [];
  for (const [index, raw] of requireArray(rows, "V4 sealed files").entries()) {
    const row = requireObject(raw, `V4 sealedFiles[${index}]`);
    assertKeys(row, ["path", "sha256"], `V4 sealedFiles[${index}]`);
    const file = resolveStored(base, requireString(row.path, `V4 sealedFiles[${index}].path`));
    observed.push(file);
    if (await sha256File(file) !== requireDigest(row.sha256, `V4 sealedFiles[${index}].sha256`)) {
      throw new Error(`V4 sealed file hash drifted: ${file}`);
    }
  }
  const expected = new Set(expectedSeals().map((file) => path.resolve(file)));
  if (observed.length !== expected.size || new Set(observed).size !== observed.length || observed.some((file) => !expected.has(file))) {
    throw new Error("V4 sealed files differ from the exact nine-file executable/reference set");
  }
  return rows;
}

async function verifySharedFiles(base, rows) {
  const observed = [];
  for (const [index, raw] of requireArray(rows, "V4 shared TCB files").entries()) {
    const row = requireObject(raw, `V4 sharedFiles[${index}]`);
    assertKeys(row, ["path", "sha256"], `V4 sharedFiles[${index}]`);
    const file = resolveStored(base, requireString(row.path, `V4 sharedFiles[${index}].path`));
    observed.push(file);
    if (await sha256File(file) !== requireDigest(row.sha256, `V4 sharedFiles[${index}].sha256`)) {
      throw new Error(`V4 shared TCB file hash drifted: ${file}`);
    }
  }
  const expected = new Set(expectedSharedFiles().map((file) => path.resolve(file)));
  if (observed.length !== expected.size || new Set(observed).size !== observed.length || observed.some((file) => !expected.has(file))) {
    throw new Error("V4 shared files differ from the exact eight-file transitive TCB set");
  }
  return rows;
}

function toWslPath(file, label) {
  const conversion = spawnSync("wsl.exe", ["--exec", "wslpath", "-u", path.resolve(file).split(path.win32.sep).join("/")], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (conversion.error) throw conversion.error;
  if (conversion.status !== 0 || !conversion.stdout.trim().startsWith("/")) {
    throw new Error(`${label} cannot be converted to a WSL path: ${(conversion.stderr || conversion.stdout).trim()}`);
  }
  return conversion.stdout.trim();
}

function runPythonVerifier(builder, contract) {
  const common = { cwd: REPO_ROOT, encoding: "utf8", timeout: 300_000 };
  const execution = process.platform === "win32"
    ? spawnSync("wsl.exe", [
      "--exec", "bash", "-lc",
      "exec uv run --offline --frozen \"$1\" \"$2\" --verify",
      "skill-arena-v4-python-verify", toWslPath(builder, "V3 builder"), toWslPath(contract, "V3 contract"),
    ], common)
    : spawnSync("uv", ["run", "--offline", "--frozen", builder, contract, "--verify"], common);
  if (execution.error) throw execution.error;
  if (execution.status !== 0) throw new Error(`sealed V3 Python verification failed: ${(execution.stderr || execution.stdout).trim()}`);
  try {
    return requireObject(JSON.parse(execution.stdout), "sealed V3 Python verification result");
  } catch (error) {
    throw new Error(`sealed V3 Python verification returned invalid JSON: ${error.message}`, { cause: error });
  }
}

async function loadContract(contractPath) {
  const file = await safeFile(contractPath, "V4 verification contract");
  const fileSha256 = await sha256File(file);
  const body = await readJson(file, "V4 verification contract");
  assertKeys(body, [
    "schemaVersion", "caseId", "verificationContract", "parentV3", "parentLegacyResolver",
    "pythonVerifier", "normalization", "crossBindings", "sealedFiles", "sharedFiles",
  ], "V4 verification contract");
  if (body.schemaVersion !== 4 || body.verificationContract !== CONTRACT_ID) throw new Error("unsupported V4 verification contract");
  equal(body.normalization, NORMALIZATION, "V4 parser normalization");
  equal(body.crossBindings, CROSS_BINDING_KEYS, "V4 cross-binding declaration");
  await verifySeals(path.dirname(file), body.sealedFiles);
  await verifySharedFiles(path.dirname(file), body.sharedFiles);
  if (await sha256File(file) !== fileSha256) throw new Error("V4 verification contract changed while loading");
  return { file, fileSha256, body };
}

export function verifyV4CrossBindings(projection, evidence) {
  assertKeys(projection, COMPATIBILITY_PROJECTION_KEYS, "V4 compatibility projection");
  const provenance = requireObject(evidence?.provenance, "V4 legacy provenance");
  for (const [projectionKey, evidenceKey] of CROSS_BINDINGS) {
    const projected = requireDigest(projection[projectionKey], `V4 compatibility projection ${projectionKey}`);
    const observed = requireDigest(provenance[evidenceKey], `V4 legacy provenance ${evidenceKey}`);
    if (projected !== observed) throw new Error(`V4/V1 ${projectionKey} drifted`);
  }
  return Object.fromEntries(CROSS_BINDINGS.map(([projectionKey]) => [projectionKey, projection[projectionKey]]));
}

async function verifyBoundState(contract) {
  if (await sha256File(contract.file) !== contract.fileSha256) throw new Error("V4 verification contract changed after loading");
  equal(await readJson(contract.file, "V4 verification contract resnapshot"), contract.body, "V4 verification contract resnapshot");
  await verifySeals(path.dirname(contract.file), contract.body.sealedFiles);
  await verifySharedFiles(path.dirname(contract.file), contract.body.sharedFiles);

  const base = path.dirname(contract.file);
  const parent = requireObject(contract.body.parentV3, "V4 parent V3 binding");
  assertKeys(parent, ["contractPath", "contractSha256", "receiptPath", "receiptSha256", "completionRecordDigest"], "V4 parent V3 binding");
  const parentContract = resolveStored(base, parent.contractPath);
  const parentReceipt = resolveStored(base, parent.receiptPath);
  if (await sha256File(parentContract) !== requireDigest(parent.contractSha256, "V4 parent contract hash")) throw new Error("V4 parent V3 contract hash drifted");
  if (await sha256File(parentReceipt) !== requireDigest(parent.receiptSha256, "V4 parent receipt hash")) throw new Error("V4 parent V3 receipt hash drifted");

  const legacy = requireObject(contract.body.parentLegacyResolver, "V4 parent legacy resolver binding");
  assertKeys(legacy, ["path", "sha256"], "V4 parent legacy resolver binding");
  const legacyResolver = resolveStored(base, legacy.path);
  if (await sha256File(legacyResolver) !== requireDigest(legacy.sha256, "V4 parent legacy resolver hash")) {
    throw new Error("V4 parent legacy resolver hash drifted");
  }

  const python = requireObject(contract.body.pythonVerifier, "V4 Python verifier binding");
  assertKeys(python, ["builderPath", "builderSha256"], "V4 Python verifier binding");
  const builder = resolveStored(base, python.builderPath);
  if (await sha256File(builder) !== requireDigest(python.builderSha256, "V4 Python builder hash")) throw new Error("V4 Python builder hash drifted");
  if (await sha256File(contract.file) !== contract.fileSha256) throw new Error("V4 verification contract changed during resnapshot");
  return { parent, parentContract, parentReceipt, legacyResolver, builder };
}

async function verifyCompletionSnapshot(completion) {
  const before = await verifyBoundState(completion.contract);
  equal(await readJson(before.parentReceipt, "V4 parent V3 completion receipt resnapshot"), completion.receipt, "V4 parent V3 completion receipt resnapshot");
  const after = await verifyBoundState(completion.contract);
  for (const key of ["parentContract", "parentReceipt", "legacyResolver", "builder"]) {
    if (path.resolve(before[key]) !== path.resolve(after[key])) throw new Error(`V4 ${key} path changed during resnapshot`);
  }
}

export async function verifyPostAgentVerificationV4({ contractPath = DEFAULT_CONTRACT } = {}) {
  const contract = await loadContract(contractPath);
  const before = await verifyBoundState(contract);
  const verification = runPythonVerifier(before.builder, before.parentContract);
  assertKeys(verification, ["ok", "mode", "completionRecordDigest", "harborCalls", "modelCalls", "verifierCalls"], "V4 Python verification result");
  equal(verification, {
    ok: true,
    mode: "verify",
    completionRecordDigest: before.parent.completionRecordDigest,
    harborCalls: 0,
    modelCalls: 0,
    verifierCalls: 0,
  }, "V4 Python verification result");
  const receipt = await readJson(before.parentReceipt, "V4 parent V3 completion receipt");
  if (receipt.completionRecordDigest !== before.parent.completionRecordDigest) throw new Error("V4 parent V3 completion record drifted");
  const after = await verifyBoundState(contract);
  for (const key of ["parentContract", "parentReceipt", "legacyResolver", "builder"]) {
    if (path.resolve(before[key]) !== path.resolve(after[key])) throw new Error(`V4 ${key} path changed during Python verification`);
  }
  equal(await readJson(after.parentReceipt, "V4 parent V3 completion receipt final snapshot"), receipt, "V4 parent V3 completion receipt final snapshot");
  return { contract, ...after, receipt, verification };
}

export async function resolveContrastPostAgentEffectiveEvidenceV4(options = {}) {
  const protocol = options.protocol ?? await readJson(path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL), "generation-003 protocol");
  const runtimeRoot = path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME);
  const [completion, evidence] = await Promise.all([
    verifyPostAgentVerificationV4({ contractPath: options.verificationContractPath ?? DEFAULT_CONTRACT }),
    resolveContrastPostAgentEffectiveEvidence({
      protocol,
      runtimeRoot,
      resumeOutputDirectory: options.resumeOutputDirectory,
      originalJobDirectory: options.originalJobDirectory,
    }),
  ]);
  await verifyCompletionSnapshot(completion);
  const crossBindings = verifyV4CrossBindings(completion.receipt.compatibilityProjection, evidence);
  return {
    ...evidence,
    selection: { ...evidence.selection, completionMode: COMPLETION_MODE },
    provenance: {
      ...evidence.provenance,
      completionMode: COMPLETION_MODE,
      completion: {
        contract: CONTRACT_ID,
        contractFileSha256: completion.contract.fileSha256,
        parentV3ContractSha256: completion.parent.contractSha256,
        parentV3ReceiptFileSha256: completion.parent.receiptSha256,
        parentV3CompletionRecordDigest: completion.parent.completionRecordDigest,
        parserBoundary: POST_AGENT_HARBOR_JSON_BOUNDARY,
        normalization: NORMALIZATION,
        crossBindingDigest: valueDigest(crossBindings),
        execution: { harbor: 0, model: 0, verifier: 0 },
      },
    },
  };
}

export const POST_AGENT_VERIFICATION_V4_CONTRACT = CONTRACT_ID;
export const POST_AGENT_COMPLETION_MODE_V4 = COMPLETION_MODE;
