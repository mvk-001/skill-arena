#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, objectDigest } from "../../scripts/prepare-meta-evolution.js";
import {
  analysisPreparedRoot,
  sha256File,
  verifyGeneration003,
} from "./prepare-generation-003.js";
import { resolveContrastPostAgentEffectiveEvidence } from "./evidence-resolution-post-agent.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(GENERATION_ROOT, "../../../../..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const DEFAULT_GENERATION_001_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-001");
const OVERLAY_DIRECTORY = "prepared-v3";
const BASELINE_WRAPPER = "run-q003-baseline-post-agent.sh";
const OLD_RESOLVER = path.join(GENERATION_ROOT, "scripts", "evidence-resolution.js");
const OLD_PUBLISHER = path.join(GENERATION_ROOT, "scripts", "publish-generation-003.js");
const NEW_RESOLVER = path.join(GENERATION_ROOT, "scripts", "evidence-resolution-post-agent.js");
const NEW_PUBLISHER = path.join(GENERATION_ROOT, "scripts", "publish-generation-003-post-agent.js");
const OLD_ADAPTER = path.join(GENERATION_ROOT, "external-resume", "resume-generation-003.mjs");
const OLD_WRAPPER = path.join(GENERATION_ROOT, "external-resume", "run-generation-003-resume.sh");

export function postAgentPreparedRoot(runtimeRoot) {
  return path.join(path.resolve(runtimeRoot), OVERLAY_DIRECTORY);
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
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be sha256:<hex>`);
  return value;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift`);
}

async function readJson(file, label = file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be an ordinary file`);
  return requireObject(JSON.parse(await fs.readFile(file, "utf8")), label);
}

async function assertDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be an ordinary directory`);
  return directory;
}

function buildPostAgentBaselineWrapper(legacyWrapper) {
  const oldReference = "/scripts/publish-generation-003.js\" verify-resume";
  const newReference = "/scripts/publish-generation-003-post-agent.js\" verify-resume";
  if ((legacyWrapper.match(/publish-generation-003\.js" verify-resume/g) ?? []).length !== 1) {
    throw new Error("prepared-v2 baseline wrapper does not contain exactly one frozen publisher precheck");
  }
  const updated = legacyWrapper.replace(oldReference, newReference);
  if (updated === legacyWrapper) throw new Error("prepared-v3 wrapper publisher replacement failed");
  if ((updated.match(/harbor run --config/g) ?? []).length !== 1) throw new Error("prepared-v3 baseline wrapper must contain one Harbor call");
  if (!updated.includes("fresh generation-003 baseline job already exists; never overwrite it")) {
    throw new Error("prepared-v3 baseline wrapper lacks no-overwrite guard");
  }
  return updated;
}

async function verifyFrozenV3Evidence({ runtimeRoot, protocolPath, v3AttestationPath }) {
  const attestationPath = path.resolve(
    v3AttestationPath
      ?? path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer-prepared-v3", "remediation-attestation.json"),
  );
  const attestation = await readJson(attestationPath, "executed v3 remediation attestation");
  const sealed = requireObject(attestation.sealedInputs, "executed v3 sealed inputs");
  const executable = requireObject(sealed.executableContract, "executed v3 executable seals");
  const expected = {
    adapter: OLD_ADAPTER,
    wrapper: OLD_WRAPPER,
    generationEvidenceResolver: OLD_RESOLVER,
    generationPublisher: OLD_PUBLISHER,
  };
  for (const [field, file] of Object.entries(expected)) {
    assertValue(requireDigest(executable[field], `v3 ${field} seal`), `sha256:${await sha256File(file)}`, `frozen v3 ${field}`);
  }
  assertValue(requireDigest(sealed.protocol, "v3 protocol seal"), `sha256:${await sha256File(protocolPath)}`, "frozen v3 protocol");
  const preparedV2Receipt = path.join(analysisPreparedRoot(runtimeRoot), "receipt.json");
  assertValue(
    requireDigest(sealed.preparedOverlayReceipt, "v3 prepared-v2 seal"),
    `sha256:${await sha256File(preparedV2Receipt)}`,
    "frozen prepared-v2 receipt",
  );
  return {
    attestationPath,
    attestationFileSha256: `sha256:${await sha256File(attestationPath)}`,
    executable,
    protocolSha256: sealed.protocol,
    preparedV2Receipt,
    preparedV2ReceiptSha256: sealed.preparedOverlayReceipt,
  };
}

async function expectedOverlay(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const verified = await verifyGeneration003({
    ...options,
    outputRoot: runtimeRoot,
    protocolPath,
    generation001RuntimeRoot,
  });
  const protocol = await readJson(protocolPath, "generation-003 protocol");
  const frozen = await verifyFrozenV3Evidence({
    runtimeRoot,
    protocolPath,
    v3AttestationPath: options.v3AttestationPath,
  });
  const evidence = await resolveContrastPostAgentEffectiveEvidence({ protocol, runtimeRoot });
  assertValue(evidence.selection.completionMode, "verifier-only-recovery", "prepared-v3 recovery mode");
  const preparedV2 = analysisPreparedRoot(runtimeRoot);
  const legacyWrapperPath = path.join(preparedV2, "run-q003-baseline-clean-pi.sh");
  const legacyWrapper = await fs.readFile(legacyWrapperPath, "utf8");
  const wrapperText = buildPostAgentBaselineWrapper(legacyWrapper);
  const baselineConfigPath = path.join(preparedV2, "configs", "harbor", "q003", "baseline.yaml");
  const artifactBody = {
    baselineConfig: {
      path: path.relative(runtimeRoot, baselineConfigPath).split(path.sep).join("/"),
      sha256: `sha256:${await sha256File(baselineConfigPath)}`,
    },
    wrapper: {
      path: BASELINE_WRAPPER,
      sha256: `sha256:${createHash("sha256").update(wrapperText, "utf8").digest("hex")}`,
    },
  };
  const body = {
    schemaVersion: 1,
    kind: "generation-003-post-agent-baseline-overlay",
    generationId: "generation-003",
    taskId: "q003",
    protocolSha256: `sha256:${await sha256File(protocolPath)}`,
    preparedV2ReceiptSha256: `sha256:${await sha256File(path.join(preparedV2, "receipt.json"))}`,
    frozenV3: {
      remediationAttestationFileSha256: frozen.attestationFileSha256,
      resolverSha256: frozen.executable.generationEvidenceResolver,
      publisherSha256: frozen.executable.generationPublisher,
      adapterSha256: frozen.executable.adapter,
      wrapperSha256: frozen.executable.wrapper,
    },
    postAgent: {
      resolverSha256: `sha256:${await sha256File(NEW_RESOLVER)}`,
      publisherSha256: `sha256:${await sha256File(NEW_PUBLISHER)}`,
      preparerSha256: `sha256:${await sha256File(SCRIPT_PATH)}`,
      recoveryLockFileSha256: evidence.provenance.recoveryLockSha256,
      recoveryResultFileSha256: evidence.provenance.recoveryResultSha256,
      resumeManifestFileSha256: evidence.provenance.resumeManifestSha256,
      effectiveJobDigest: evidence.provenance.effectiveJobDigest,
      completionMode: evidence.selection.completionMode,
      calls: evidence.provenance.recoveryCalls,
    },
    artifacts: artifactBody,
    activeShellEntrypoints: [BASELINE_WRAPPER],
    callAccounting: protocol.callAccounting,
    sourcePreparedReceiptSchemaVersion: verified.receipt.schemaVersion,
  };
  const receipt = { ...body, receiptDigest: `sha256:${objectDigest(body)}` };
  return {
    runtimeRoot,
    protocol,
    overlayRoot: postAgentPreparedRoot(runtimeRoot),
    wrapperText,
    receipt,
  };
}

async function verifyExactOverlay(expected) {
  const root = await assertDirectory(expected.overlayRoot, "prepared-v3 overlay");
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (names.join("\n") !== ["receipt.json", BASELINE_WRAPPER].sort().join("\n")) {
    throw new Error("prepared-v3 overlay must contain only receipt.json and the baseline wrapper");
  }
  for (const entry of entries) if (entry.isSymbolicLink() || !entry.isFile()) throw new Error("prepared-v3 overlay contains a non-file entry");
  const receiptText = await fs.readFile(path.join(root, "receipt.json"), "utf8");
  if (receiptText !== canonicalJson(expected.receipt)) throw new Error("prepared-v3 receipt drift");
  const wrapperText = await fs.readFile(path.join(root, BASELINE_WRAPPER), "utf8");
  if (wrapperText !== expected.wrapperText) throw new Error("prepared-v3 baseline wrapper drift");
  return expected;
}

export async function prepareGeneration003PostAgent(options = {}) {
  const expected = await expectedOverlay(options);
  try {
    await fs.lstat(expected.overlayRoot);
    return { mode: "verified-existing", ...(await verifyExactOverlay(expected)) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const staging = path.join(expected.runtimeRoot, `.prepared-v3.tmp-${process.pid}-${randomUUID()}`);
  await fs.mkdir(staging, { recursive: false });
  try {
    await fs.writeFile(path.join(staging, "receipt.json"), canonicalJson(expected.receipt), { flag: "wx", mode: 0o600 });
    await fs.writeFile(path.join(staging, BASELINE_WRAPPER), expected.wrapperText, { flag: "wx", mode: 0o700 });
    await fs.rename(staging, expected.overlayRoot);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { mode: "prepared-v3-overlay", ...expected };
}

export async function verifyGeneration003PostAgent(options = {}) {
  return { mode: "verified-post-agent-overlay", ...(await verifyExactOverlay(await expectedOverlay(options))) };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--runtime": "runtimeRoot",
    "--protocol": "protocolPath",
    "--generation-001-runtime": "generation001RuntimeRoot",
    "--v3-attestation": "v3AttestationPath",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = mapping[argv[index]];
    if (!key) throw new Error(`Unknown option: ${argv[index]}`);
    options[key] = requireString(argv[index + 1], argv[index]);
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify [options]\n`);
    return;
  }
  const result = command === "prepare"
    ? await prepareGeneration003PostAgent(options)
    : command === "verify"
      ? await verifyGeneration003PostAgent(options)
      : (() => { throw new Error(`Unknown command: ${command}`); })();
  process.stdout.write(canonicalJson({
    mode: result.mode,
    overlayRoot: result.overlayRoot,
    receiptDigest: result.receipt.receiptDigest,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export const POST_AGENT_PREPARED_DIRECTORY = OVERLAY_DIRECTORY;
export const POST_AGENT_BASELINE_WRAPPER = BASELINE_WRAPPER;
