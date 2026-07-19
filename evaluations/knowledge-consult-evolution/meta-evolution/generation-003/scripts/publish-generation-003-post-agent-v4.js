#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, objectDigest } from "../../scripts/prepare-meta-evolution.js";
import { resolveContrastPostAgentEffectiveEvidenceV4 } from "./evidence-resolution-post-agent-v4.js";
import {
  publishGeneration003PostAgent as publishGeneration003PostAgentLegacyV4,
  verifyContrastPostAgentResume as verifyContrastPostAgentResumeLegacyV4,
} from "./publish-generation-003-post-agent-v4-legacy.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const DEFAULT_GENERATION_001_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-001");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const V4_PUBLISH_HELPER = path.join(REPO_ROOT, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v4.py");
const VERIFICATION_CONTRACT = path.join(GENERATION_ROOT, "external-resume", "post-agent-verification-v4-contract.json");
const RECEIPT_NAME = "verification-v4-receipt.json";
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUBLIC_CONTRAST_BINDINGS = [
  ["recoveryLockSha256", "recoveryLockFileSha256"],
  ["recoveryRecordDigest", "recoveryRecordDigest"],
  ["recoveryResultSha256", "recoveryResultFileSha256"],
  ["recoveryResultDigest", "recoveryResultDigest"],
  ["effectiveJobDigest", "effectiveJobDigest"],
  ["nativeRetryJobArtifactDigest", "nativeRetryJobArtifactDigest"],
  ["recoveredJobArtifactDigest", "recoveredJobArtifactDigest"],
  ["resumeManifestSha256", "manifestFileSha256"],
];

async function exists(file) {
  return fs.lstat(file).then(() => true, () => false);
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

async function readJson(file, label) {
  const safe = await safeFile(file, label);
  try {
    return JSON.parse(await fs.readFile(safe, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

async function sha256File(file, label) {
  const safe = await safeFile(file, label);
  return `sha256:${createHash("sha256").update(await fs.readFile(safe)).digest("hex")}`;
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
  const expected = path.join(runtimeRoot(options), "publications", "q003");
  const output = path.resolve(options.outputDirectory ?? expected);
  if (output !== expected) throw new Error("q003 V4 publication output must be the fixed generation runtime publications/q003 namespace");
  return output;
}

async function v4Evidence(options) {
  const normalized = normalizedLegacyOptions(options);
  const protocol = await readJson(normalized.protocolPath, "generation-003 protocol");
  return resolveContrastPostAgentEffectiveEvidenceV4({
    ...normalized,
    protocol,
    verificationContractPath: options.verificationContractPath,
  });
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) throw new Error(`${label} must be sha256:<lowercase hex>`);
  return value;
}

export function verifyQ003PublicationBindingsV4(completion, publication) {
  const completionProvenance = requireObject(completion?.provenance, "q003 V4 completion provenance");
  const completionRecord = requireObject(completionProvenance.completion, "q003 V4 completion record");
  const publicationProvenance = requireObject(publication?.provenance, "q003 V4 publication provenance");
  const expectedContract = requireDigest(completionRecord.contractFileSha256, "q003 V4 completion contract binding");
  const publicContract = requireDigest(
    publicationProvenance.postAgentVerificationContractFileSha256,
    "q003 V4 public contract binding",
  );
  if (publicContract !== expectedContract) throw new Error("q003 V4 public contract binding drifted");

  const contrastResume = requireObject(publicationProvenance.contrastResume, "q003 V4 public contrast-resume provenance");
  const verified = {};
  for (const [completionKey, publicKey] of PUBLIC_CONTRAST_BINDINGS) {
    const expected = requireDigest(completionProvenance[completionKey], `q003 V4 completion ${completionKey}`);
    const observed = requireDigest(contrastResume[publicKey], `q003 V4 public cross-binding ${completionKey}`);
    if (observed !== expected) throw new Error(`q003 V4 public cross-binding ${completionKey} drifted`);
    verified[completionKey] = observed;
  }
  return { postAgentVerificationContractFileSha256: publicContract, contrastResume: verified };
}

async function readVerifiedPublicationAt(directory, { completed }) {
  const root = await safeDirectory(directory, "q003 V4 publication");
  const expected = completed ? [RECEIPT_NAME, "report.md", "result.json"] : ["report.md", "result.json"];
  const entries = (await fs.readdir(root, { withFileTypes: true }))
    .map((entry) => `${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "x"}:${entry.name}`)
    .sort();
  if (entries.join("\n") !== expected.map((name) => `f:${name}`).sort().join("\n")) throw new Error("q003 V4 publication topology drifted");
  const resultPath = path.join(root, "result.json");
  const reportPath = path.join(root, "report.md");
  const publication = await readJson(resultPath, "q003 publication result");
  const body = { ...publication };
  delete body.publicationSha256;
  if (publication.publicationSha256 !== objectDigest(body)) throw new Error("q003 publication self-digest drifted");
  return {
    publication,
    outputDirectory: root,
    resultFileSha256: await sha256File(resultPath, "q003 result"),
    reportFileSha256: await sha256File(reportPath, "q003 report"),
  };
}

function publicationReceiptBody(completion, publication) {
  return {
    schemaVersion: 4,
    kind: "generation-003-q003-verification-v4-publication-receipt",
    verificationMode: "sealed-publication-receipt",
    publicationSha256: publication.publication.publicationSha256,
    publicationDirectory: "publications/q003",
    publicationResultFileSha256: publication.resultFileSha256,
    publicationReportFileSha256: publication.reportFileSha256,
    completionMode: completion.selection.completionMode,
    completion: completion.provenance.completion,
    aggregateRecoveryCalls: completion.provenance.recoveryCalls,
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

async function comparePublicationFiles(leftRoot, rightRoot) {
  for (const name of ["result.json", "report.md", RECEIPT_NAME]) {
    const [left, right] = await Promise.all([
      fs.readFile(await safeFile(path.join(leftRoot, name), `existing q003 ${name}`)),
      fs.readFile(await safeFile(path.join(rightRoot, name), `recomputed q003 ${name}`)),
    ]);
    if (!left.equals(right)) throw new Error(`q003 ${name} differs from a fresh zero-call derivation`);
  }
}

function toWslPath(file, label) {
  const windowsPath = path.resolve(file).split(path.win32.sep).join("/");
  const conversion = spawnSync("wsl.exe", ["--exec", "wslpath", "-u", windowsPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (conversion.error) throw conversion.error;
  const converted = conversion.stdout.trim();
  if (conversion.status !== 0 || !converted.startsWith("/")) {
    throw new Error(`${label} cannot be converted to an absolute WSL path: ${(conversion.stderr || conversion.stdout).trim()}`);
  }
  return converted;
}

async function publishStagedDirectoryNoReplace(build, final, options) {
  if (process.platform !== "win32") throw new Error("first q003 V4 publication must execute on the Windows host with WSL available");
  const execution = spawnSync("wsl.exe", [
    "--exec",
    "bash",
    "-lc",
    "exec uv run --offline --frozen \"$1\" \"$2\" \"$3\" \"$4\"",
    "skill-arena-q003-publish-v4",
    toWslPath(V4_PUBLISH_HELPER, "V4 atomic publication helper"),
    toWslPath(options.verificationContractPath ?? VERIFICATION_CONTRACT, "V4 verification contract"),
    toWslPath(build, "q003 V4 staging"),
    toWslPath(final, "q003 V4 destination"),
  ], { cwd: REPO_ROOT, encoding: "utf8", timeout: 300_000 });
  if (execution.error) throw execution.error;
  if (execution.status !== 0) {
    throw new Error(`q003 V4 atomic no-replace helper failed: ${(execution.stderr || execution.stdout || "unknown error").trim()}`);
  }
  let result;
  try {
    result = JSON.parse(execution.stdout);
  } catch (error) {
    throw new Error(`q003 V4 atomic helper returned invalid JSON: ${error.message}`, { cause: error });
  }
  if (
    result?.ok !== true
    || result.mode !== "publish-q003-verification-v4"
    || typeof result.published !== "boolean"
    || result.harborCalls !== 0
    || result.modelCalls !== 0
    || result.verifierCalls !== 0
  ) throw new Error("q003 V4 atomic helper result drifted");
  if (!await exists(final)) throw new Error("q003 V4 atomic helper did not leave a final publication");
  if (result.published === await exists(build)) throw new Error("q003 V4 atomic helper staging state disagrees with its result");
  return result.published;
}

async function buildUniquePublication(options, completion) {
  const final = outputDirectory(options);
  await fs.mkdir(path.dirname(final), { recursive: true });
  const build = path.join(path.dirname(final), `.${path.basename(final)}.verification-v4-${randomUUID()}`);
  try {
    const generated = await publishGeneration003PostAgentLegacyV4({
      ...normalizedLegacyOptions(options),
      outputDirectory: build,
    });
    const publication = await readVerifiedPublicationAt(build, { completed: false });
    if (generated.publication.publicationSha256 !== publication.publication.publicationSha256) throw new Error("V1 publisher return differs from staged q003 result");
    verifyQ003PublicationBindingsV4(completion, publication.publication);
    const body = publicationReceiptBody(completion, publication);
    const receipt = { ...body, receiptSha256: objectDigest(body) };
    await writeDurableNew(path.join(build, RECEIPT_NAME), canonicalJson(receipt));
    await readVerifiedPublicationAt(build, { completed: true });
    if (await exists(final)) {
      await comparePublicationFiles(final, build);
      return { published: false, build, final };
    }
    if (!await publishStagedDirectoryNoReplace(build, final, options)) {
      await comparePublicationFiles(final, build);
      return { published: false, build, final };
    }
    return { published: true, build: null, final };
  } finally {
    if (await exists(build)) {
      const safe = await safeDirectory(build, "current invocation q003 V4 build");
      await fs.rm(safe, { recursive: true, force: false });
    }
  }
}

export async function verifyContrastPostAgentResumeV4(options = {}) {
  const normalized = normalizedLegacyOptions(options);
  return verifyContrastPostAgentResumeLegacyV4(normalized);
}

export async function verifyGeneration003PostAgentPublicationV4(options = {}) {
  const final = outputDirectory(options);
  const [completion, publication] = await Promise.all([
    v4Evidence(options),
    readVerifiedPublicationAt(final, { completed: true }),
  ]);
  verifyQ003PublicationBindingsV4(completion, publication.publication);
  const receiptPath = path.join(final, RECEIPT_NAME);
  const receipt = await readJson(receiptPath, "q003 V4 receipt");
  const body = { ...receipt };
  delete body.receiptSha256;
  if (receipt.receiptSha256 !== objectDigest(body)) throw new Error("q003 V4 receipt self-digest drifted");
  if (canonicalJson(body) !== canonicalJson(publicationReceiptBody(completion, publication))) throw new Error("q003 V4 receipt differs from sealed evidence");
  return {
    publication: publication.publication,
    outputDirectory: final,
    completionReceiptPath: receiptPath,
    completionReceipt: receipt,
    verificationMode: "sealed-publication-receipt",
  };
}

export async function auditGeneration003PostAgentPublicationV4(options = {}) {
  const completion = await v4Evidence(options);
  if (!await exists(outputDirectory(options))) throw new Error("q003 V4 publication does not exist");
  const built = await buildUniquePublication(options, completion);
  if (built.published) throw new Error("audit unexpectedly published a missing q003 result");
  return { ...(await verifyGeneration003PostAgentPublicationV4(options)), verificationMode: "fresh-zero-call-recomputation" };
}

export async function publishGeneration003PostAgentV4(options = {}) {
  if (await exists(outputDirectory(options))) return verifyGeneration003PostAgentPublicationV4(options);
  const completion = await v4Evidence(options);
  await buildUniquePublication(options, completion);
  return verifyGeneration003PostAgentPublicationV4(options);
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--runtime": "runtimeRoot",
    "--output": "outputDirectory",
    "--protocol": "protocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
    "--verification-contract": "verificationContractPath",
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
    process.stdout.write("Usage: publish-generation-003-post-agent-v4.js verify-resume|verify-q003|audit-q003|q003 [options]\n");
    return;
  }
  if (command === "verify-resume") {
    process.stdout.write(canonicalJson(await verifyContrastPostAgentResumeV4(options)));
    return;
  }
  if (command === "verify-q003" || command === "audit-q003") {
    const result = command === "audit-q003"
      ? await auditGeneration003PostAgentPublicationV4(options)
      : await verifyGeneration003PostAgentPublicationV4(options);
    process.stdout.write(canonicalJson({
      publicationSha256: result.publication.publicationSha256,
      completionReceiptPath: result.completionReceiptPath,
      verificationMode: result.verificationMode,
      gate: result.publication.gate,
    }));
    return;
  }
  if (command !== "q003") throw new Error(`Unknown command: ${command}`);
  const result = await publishGeneration003PostAgentV4(options);
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
