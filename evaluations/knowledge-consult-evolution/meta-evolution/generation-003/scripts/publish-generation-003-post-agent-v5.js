#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, objectDigest } from "../../scripts/prepare-meta-evolution.js";
import { resolveContrastPostAgentEffectiveEvidenceV4 } from "./evidence-resolution-post-agent-v4.js";
import { publishGeneration003PostAgent as publishGeneration003PostAgentLegacyV4 } from "./publish-generation-003-post-agent-v4-legacy.js";
import { verifyQ003PublicationBindingsV4 } from "./publish-generation-003-post-agent-v4.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const DEFAULT_GENERATION_001_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-001");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_PUBLICATION_CONTRACT = path.join(GENERATION_ROOT, "external-resume", "q003-publication-v5-contract.json");
const V5_PUBLISH_HELPER = path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v5.py");
const RECEIPT_NAME = "verification-v5-receipt.json";
const CONTRACT_ID = "harbor-0.18.0.q003-publication-javascript-number-token-parity-v5";
const PARENT_V4_ID = "harbor-0.18.0.verifier-recovery-v3.native-harbor-ordinary-json.js-parity-v4";
const PARENT_V4_SHA256 = "sha256:0d17825136d07069302e39dac9cc5737fc6adfa7ff06666cf097f052a7591394";
const RECEIPT_KIND = "generation-003-q003-publication-v5-receipt";
const VERIFICATION_MODE = "sealed-v4-publication+javascript-number-token-parity-v5";
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUBLIC_BINDINGS = [
  "postAgentVerificationContractFileSha256",
  "recoveryLockSha256",
  "recoveryRecordDigest",
  "recoveryResultSha256",
  "recoveryResultDigest",
  "effectiveJobDigest",
  "nativeRetryJobArtifactDigest",
  "recoveredJobArtifactDigest",
  "resumeManifestSha256",
];
const SERIALIZATION_BOUNDARY = {
  id: "javascript-canonical-root-member-elision-v1",
  scope: "result.json root publicationSha256",
  parser: "strict-utf8-json-no-bom-no-duplicate-keys",
  layout: "LF-only-two-space-JavaScript-canonical-pretty",
  rootMember: "publicationSha256",
  memberLineCount: 1,
  bodyDigest: "sha256(exact-result-bytes-after-root-member-line-elision)",
  javascriptNumberTokens: "preserved-verbatim",
  artifactMutation: false,
};
const FAILURE_REPRODUCTION = {
  error: "q003 V4 publication result self-digest drifted.",
  jsonPointer: "/thresholds/passThreshold",
  storedJavaScriptObjectDigest: "sha256:31ff94e2b9088d7896c6504a3b2499a4eeeb174818a741aa1dcfe5dddcb5b2b3",
  pythonObjectDigest: "sha256:3f52311e63f8e0259251fd4de0f9d4c11cd8194c47d5b6062bf70418f04676d2",
  javascriptCanonicalLength: 10764,
  pythonCanonicalLength: 10761,
  firstDifferenceLine: 224,
  firstDifferenceColumn: 22,
};
const SEALED_RELATIVE_PATHS = new Set([
  "../scripts/publish-generation-003-post-agent-v5.js",
  "run-generation-003-q003-publication-v5.sh",
  "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v5.py",
  "../../../../../skills/harbor-resume-external-failures/scripts/publish_q003_verification_v5.py.lock",
  "../../../../../skills/harbor-resume-external-failures/references/q003-publication-number-parity-v5.md",
]);

async function exists(target) {
  return fs.lstat(target).then(() => true, () => false);
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

async function sha256File(file, label) {
  const safe = await safeFile(file, label);
  return `sha256:${createHash("sha256").update(await fs.readFile(safe)).digest("hex")}`;
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) throw new Error(`${label} must be sha256:<lowercase hex>`);
  return value;
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} drifted`);
}

function assertKeys(value, expected, label) {
  equal(Object.keys(requireObject(value, label)).sort(), [...expected].sort(), `${label} keys`);
}

async function readJson(file, label, { canonical = false } = {}) {
  const safe = await safeFile(file, label);
  const raw = await fs.readFile(safe, "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (canonical && raw !== canonicalJson(value)) throw new Error(`${label} is not canonical JavaScript JSON`);
  return value;
}

function resolveStored(base, value) {
  return path.resolve(base, requireString(value, "stored V5 path"));
}

async function loadPublicationContract(contractPath = DEFAULT_PUBLICATION_CONTRACT) {
  const file = await safeFile(contractPath, "V5 publication contract");
  const fileSha256 = await sha256File(file, "V5 publication contract");
  const body = await readJson(file, "V5 publication contract", { canonical: true });
  assertKeys(body, [
    "schemaVersion", "caseId", "publicationContract", "parentV4", "failureReproduction",
    "serializationBoundary", "publicBindings", "sealedFiles",
  ], "V5 publication contract");
  if (body.schemaVersion !== 5 || body.publicationContract !== CONTRACT_ID) throw new Error("unsupported V5 publication contract");
  equal(body.failureReproduction, FAILURE_REPRODUCTION, "V5 failure reproduction declaration");
  equal(body.serializationBoundary, SERIALIZATION_BOUNDARY, "V5 serialization boundary");
  equal(body.publicBindings, PUBLIC_BINDINGS, "V5 public bindings");

  const parent = requireObject(body.parentV4, "V5 parent V4 binding");
  assertKeys(parent, ["contractPath", "contractSha256", "verificationContract"], "V5 parent V4 binding");
  if (parent.contractSha256 !== PARENT_V4_SHA256 || parent.verificationContract !== PARENT_V4_ID) throw new Error("V5 parent V4 declaration drifted");
  const parentPath = await safeFile(resolveStored(path.dirname(file), parent.contractPath), "V5 parent V4 contract");
  if (await sha256File(parentPath, "V5 parent V4 contract") !== PARENT_V4_SHA256) throw new Error("V5 parent V4 contract hash drifted");
  const parentBody = await readJson(parentPath, "V5 parent V4 contract");
  if (parentBody.verificationContract !== PARENT_V4_ID) throw new Error("V5 parent V4 identity drifted");

  if (!Array.isArray(body.sealedFiles) || body.sealedFiles.length !== SEALED_RELATIVE_PATHS.size) throw new Error("V5 contract must seal exactly five delta files");
  const observed = new Set();
  for (const [index, raw] of body.sealedFiles.entries()) {
    const row = requireObject(raw, `V5 sealedFiles[${index}]`);
    assertKeys(row, ["path", "sha256"], `V5 sealedFiles[${index}]`);
    const relative = requireString(row.path, `V5 sealedFiles[${index}].path`);
    const target = await safeFile(resolveStored(path.dirname(file), relative), `V5 sealed file ${relative}`);
    if (observed.has(relative) || await sha256File(target, `V5 sealed file ${relative}`) !== requireDigest(row.sha256, `V5 sealedFiles[${index}].sha256`)) {
      throw new Error(`V5 sealed file is duplicate or drifted: ${relative}`);
    }
    observed.add(relative);
  }
  if (observed.size !== SEALED_RELATIVE_PATHS.size || [...observed].some((item) => !SEALED_RELATIVE_PATHS.has(item))) {
    throw new Error("V5 sealed files differ from the exact q003-only delta set");
  }
  if (await sha256File(file, "V5 publication contract resnapshot") !== fileSha256) throw new Error("V5 publication contract changed while loading");
  equal(await readJson(file, "V5 publication contract resnapshot", { canonical: true }), body, "V5 publication contract resnapshot");
  return { file, fileSha256, body, parentPath };
}

function runtimeRoot(options) {
  return path.resolve(options.runtimeRoot ?? DEFAULT_RUNTIME);
}

function normalizedLegacyOptions(options) {
  return {
    ...options,
    runtimeRoot: runtimeRoot(options),
    protocolPath: path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL),
    generation001RuntimeRoot: path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME),
    knowledgeRoot: path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT),
  };
}

function outputDirectory(options) {
  return path.join(runtimeRoot(options), "publications", "q003");
}

async function v5State(options) {
  const contract = await loadPublicationContract(options.publicationContractPath);
  const normalized = normalizedLegacyOptions(options);
  const protocol = await readJson(normalized.protocolPath, "generation-003 protocol");
  const completion = await resolveContrastPostAgentEffectiveEvidenceV4({
    ...normalized,
    protocol,
    verificationContractPath: contract.parentPath,
  });
  if (completion.provenance?.completion?.contractFileSha256 !== PARENT_V4_SHA256) throw new Error("V5 evidence is not bound to the sealed parent V4 contract");
  const resnapshot = await loadPublicationContract(contract.file);
  if (resnapshot.fileSha256 !== contract.fileSha256) throw new Error("V5 publication contract changed during parent verification");
  equal(resnapshot.body, contract.body, "V5 publication contract after parent verification");
  return { contract, completion };
}

async function readVerifiedPublicationAt(directory, { completed }) {
  const root = await safeDirectory(directory, "q003 V5 publication");
  const expected = completed ? [RECEIPT_NAME, "report.md", "result.json"] : ["report.md", "result.json"];
  const entries = (await fs.readdir(root, { withFileTypes: true }))
    .map((entry) => `${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "x"}:${entry.name}`)
    .sort();
  if (entries.join("\n") !== expected.map((name) => `f:${name}`).sort().join("\n")) throw new Error("q003 V5 publication topology drifted");
  const resultPath = path.join(root, "result.json");
  const reportPath = path.join(root, "report.md");
  const publication = await readJson(resultPath, "q003 V5 publication result", { canonical: true });
  const body = { ...publication };
  delete body.publicationSha256;
  if (publication.publicationSha256 !== objectDigest(body)) throw new Error("q003 V5 publication JavaScript self-digest drifted");
  const result = {
    publication,
    outputDirectory: root,
    resultFileSha256: await sha256File(resultPath, "q003 V5 result"),
    reportFileSha256: await sha256File(reportPath, "q003 V5 report"),
  };
  if (completed) result.receiptFileSha256 = await sha256File(path.join(root, RECEIPT_NAME), "q003 V5 receipt");
  return result;
}

function publicationReceiptBody(state, publication) {
  return {
    schemaVersion: 5,
    kind: RECEIPT_KIND,
    verificationMode: VERIFICATION_MODE,
    publicationSha256: publication.publication.publicationSha256,
    publicationDirectory: "publications/q003",
    publicationResultFileSha256: publication.resultFileSha256,
    publicationReportFileSha256: publication.reportFileSha256,
    publicationContractFileSha256: state.contract.fileSha256,
    parentV4ContractFileSha256: PARENT_V4_SHA256,
    serializationBoundary: SERIALIZATION_BOUNDARY,
    publicBindings: PUBLIC_BINDINGS,
    completionMode: state.completion.selection.completionMode,
    completion: state.completion.provenance.completion,
    aggregateRecoveryCalls: state.completion.provenance.recoveryCalls,
  };
}

async function writeDurableNew(file, payload) {
  const handle = await fs.open(file, "wx", 0o600);
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function toWslPath(file, label) {
  const resolved = path.resolve(file);
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(resolved);
  if (!match) throw new Error(`${label} must be an absolute Windows path`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

async function publishStagedDirectoryNoReplace(build, final, state, publication) {
  if (process.platform !== "win32") throw new Error("first q003 V5 publication must execute on the Windows host with WSL available");
  const args = [
    "--exec", "bash", "-lc",
    "exec uv run --offline --frozen \"$1\" \"$2\" \"$3\" \"$4\" --result-file-sha256 \"$5\" --report-file-sha256 \"$6\" --receipt-file-sha256 \"$7\"",
    "skill-arena-q003-publish-v5",
    toWslPath(V5_PUBLISH_HELPER, "V5 atomic publication helper"),
    toWslPath(state.contract.file, "V5 publication contract"),
    toWslPath(build, "q003 V5 staging"),
    toWslPath(final, "q003 V5 destination"),
    publication.resultFileSha256,
    publication.reportFileSha256,
    publication.receiptFileSha256,
  ];
  const execution = spawnSync("wsl.exe", args, { encoding: "utf8", timeout: 900_000 });
  if (execution.error) throw execution.error;
  if (execution.status !== 0) throw new Error(`q003 V5 atomic no-replace helper failed: ${(execution.stderr || execution.stdout || "unknown error").trim()}`);
  let result;
  try {
    result = JSON.parse(execution.stdout);
  } catch (error) {
    throw new Error(`q003 V5 atomic helper returned invalid JSON: ${error.message}`, { cause: error });
  }
  if (
    result?.ok !== true
    || result.mode !== "publish-q003-verification-v5"
    || typeof result.published !== "boolean"
    || result.harborCalls !== 0
    || result.modelCalls !== 0
    || result.verifierCalls !== 0
  ) throw new Error("q003 V5 atomic helper result drifted");
  if (!await exists(final)) throw new Error("q003 V5 atomic helper did not leave a final publication");
  if (result.published === await exists(build)) throw new Error("q003 V5 atomic helper staging state disagrees with its result");
  return result.published;
}

async function buildUniquePublication(options, state) {
  const final = outputDirectory(options);
  await fs.mkdir(path.dirname(final), { recursive: true });
  const build = path.join(path.dirname(final), `.q003.verification-v5-${randomUUID()}`);
  try {
    const generated = await publishGeneration003PostAgentLegacyV4({
      ...normalizedLegacyOptions(options),
      verificationContractPath: state.contract.parentPath,
      outputDirectory: build,
    });
    const publication = await readVerifiedPublicationAt(build, { completed: false });
    if (generated.publication.publicationSha256 !== publication.publication.publicationSha256) throw new Error("V4 publisher return differs from staged q003 V5 result");
    verifyQ003PublicationBindingsV4(state.completion, publication.publication);
    const body = publicationReceiptBody(state, publication);
    const receipt = { ...body, receiptSha256: objectDigest(body) };
    await writeDurableNew(path.join(build, RECEIPT_NAME), canonicalJson(receipt));
    const completed = await readVerifiedPublicationAt(build, { completed: true });
    await publishStagedDirectoryNoReplace(build, final, state, completed);
    return { build: await exists(build) ? build : null, final };
  } finally {
    if (await exists(build)) {
      const safe = await safeDirectory(build, "current invocation q003 V5 build");
      await fs.rm(safe, { recursive: true, force: false });
    }
  }
}

export async function verifyGeneration003PostAgentPublicationV5(options = {}) {
  const [state, publication] = await Promise.all([
    v5State(options),
    readVerifiedPublicationAt(outputDirectory(options), { completed: true }),
  ]);
  verifyQ003PublicationBindingsV4(state.completion, publication.publication);
  const receiptPath = path.join(publication.outputDirectory, RECEIPT_NAME);
  const receipt = await readJson(receiptPath, "q003 V5 receipt", { canonical: true });
  const body = { ...receipt };
  delete body.receiptSha256;
  if (receipt.receiptSha256 !== objectDigest(body)) throw new Error("q003 V5 receipt self-digest drifted");
  equal(body, publicationReceiptBody(state, publication), "q003 V5 receipt versus sealed evidence");
  return {
    publication: publication.publication,
    outputDirectory: publication.outputDirectory,
    completionReceiptPath: receiptPath,
    completionReceipt: receipt,
    verificationMode: VERIFICATION_MODE,
  };
}

export async function auditGeneration003PostAgentPublicationV5(options = {}) {
  if (!await exists(outputDirectory(options))) throw new Error("q003 V5 publication does not exist");
  const state = await v5State(options);
  await buildUniquePublication(options, state);
  return { ...(await verifyGeneration003PostAgentPublicationV5(options)), verificationMode: "fresh-zero-call-recomputation-v5" };
}

export async function publishGeneration003PostAgentV5(options = {}) {
  if (await exists(outputDirectory(options))) return verifyGeneration003PostAgentPublicationV5(options);
  const state = await v5State(options);
  await buildUniquePublication(options, state);
  return verifyGeneration003PostAgentPublicationV5(options);
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--runtime": "runtimeRoot",
    "--protocol": "protocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
    "--publication-contract": "publicationContractPath",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const field = mapping[argv[index]];
    if (!field || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${argv[index]}`);
    options[field] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write("Usage: publish-generation-003-post-agent-v5.js verify-q003|audit-q003|q003 [options]\n");
    return;
  }
  if (command === "verify-q003" || command === "audit-q003") {
    const result = command === "audit-q003"
      ? await auditGeneration003PostAgentPublicationV5(options)
      : await verifyGeneration003PostAgentPublicationV5(options);
    process.stdout.write(canonicalJson({
      publicationSha256: result.publication.publicationSha256,
      completionReceiptPath: result.completionReceiptPath,
      verificationMode: result.verificationMode,
      gate: result.publication.gate,
    }));
    return;
  }
  if (command !== "q003") throw new Error(`Unknown command: ${command}`);
  const result = await publishGeneration003PostAgentV5(options);
  process.stdout.write(canonicalJson({
    publicationSha256: result.publication.publicationSha256,
    completionReceiptPath: result.completionReceiptPath,
    verificationMode: result.verificationMode,
    gate: result.publication.gate,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
