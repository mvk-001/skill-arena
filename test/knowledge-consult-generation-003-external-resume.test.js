import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(".");
const adapter = path.join(
  root,
  "evaluations",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "external-resume",
  "resume-generation-003.mjs",
);
const wrapper = path.join(path.dirname(adapter), "run-generation-003-resume.sh");
const diagnosticCaseContract = path.join(path.dirname(adapter), "case-contract.json");
const diagnosticCaseContractV2 = path.join(path.dirname(adapter), "case-contract-v2.json");
const caseContract = path.join(path.dirname(adapter), "case-contract-v3.json");
const runtime = path.join(
  root,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "resume",
  "q003",
  "contrast-matrix-one-shot-answer-prepared-v3",
);
const resumeOutput = path.join(
  root,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "resume",
  "q003",
  "contrast-matrix-one-shot-answer",
);
const authSource = "C:\\Users\\villa\\.pi\\agent\\auth.json";
const jobsRoot = path.join(
  root,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "jobs",
  "q003",
);

function runAdapter(command, ...args) {
  return spawnSync(process.execPath, [adapter, command, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
}

async function exists(file) {
  return fs.stat(file).then(() => true, () => false);
}

test("generation-003 resume adapter exposes one narrow new-job path and no direct Harbor command", async () => {
  const contract = JSON.parse(await fs.readFile(caseContract, "utf8"));
  const diagnostic = JSON.parse(await fs.readFile(diagnosticCaseContract, "utf8"));
  const diagnosticV2 = JSON.parse(await fs.readFile(diagnosticCaseContractV2, "utf8"));
  assert.equal(diagnostic.schemaVersion, 1);
  assert.equal(diagnosticV2.schemaVersion, 2);
  assert.equal(contract.schemaVersion, 3);
  assert.equal(contract.supersedesDiagnosticPreparations.length, 2);
  assert.ok(contract.supersedesDiagnosticPreparations.every((item) => item.status === "zero-call-never-live"));
  assert.equal(
    contract.failureContract,
    "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1",
  );
  assert.equal(contract.retryPolicy.maxExternalRetriesPerTrial, 1);
  assert.equal(contract.retryPolicy.selection, "first-evaluable-no-best-of");
  assert.equal(contract.sourceCandidates.settled, "extractive-one-shot-answer");
  assert.equal(contract.sourceCandidates.retryTarget, "contrast-matrix-one-shot-answer");
  const shell = await fs.readFile(wrapper, "utf8");
  assert.doesNotMatch(shell, /\buvx\b|\bharbor\s+run\b/);
  assert.equal((shell.match(/uv run "\$engine" "\$config"/g) ?? []).length, 1);
  assert.match(shell, /cp --preserve=timestamps/);
  assert.match(shell, /verify-auth --auth "\$auth_source"/);
  assert.match(shell, /verify-auth --auth "\$auth_mount\/auth\.json"/);
  assert.doesNotMatch(shell, /--preflight-only\)\s*\n\s*exec node/);
  assert.ok(
    shell.indexOf('cp --preserve=timestamps') < shell.indexOf('node "$adapter" preflight'),
    "preflight-only must stage and verify the sealed auth mount before Docker checks",
  );
  assert.ok(
    shell.indexOf('node "$adapter" preflight') < shell.indexOf('uv run "$engine" "$config"'),
    "preflight-only must exit before the only live resume engine call",
  );
  const syntax = spawnSync(process.execPath, ["--check", adapter], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("generation-003 private preparation seals auth metadata and doctor/dry-run stay zero-call", async (t) => {
  const available =
    await exists(authSource)
    && await exists(path.join(jobsRoot, "extractive-one-shot-answer"))
    && await exists(path.join(jobsRoot, "contrast-matrix-one-shot-answer"));
  if (!available) {
    t.skip("local ignored generation-003 native evidence is unavailable");
    return;
  }

  const resumeLockPath = path.join(resumeOutput, "resume-lock.json");
  const alreadyAttempted = await exists(resumeLockPath);
  const resumeLockBefore = alreadyAttempted ? await fs.readFile(resumeLockPath) : null;
  if (!alreadyAttempted) {
    const prepared = runAdapter("prepare");
    assert.equal(prepared.status, 0, prepared.stderr);
    const verified = runAdapter("verify");
    assert.equal(verified.status, 0, verified.stderr);
  }
  const attestationPath = path.join(runtime, "remediation-attestation.json");
  const configPath = path.join(runtime, "resume-config.json");
  const attestation = JSON.parse(await fs.readFile(attestationPath, "utf8"));
  const authBytes = await fs.readFile(authSource);
  const authStats = await fs.stat(authSource, { bigint: true });
  if (!alreadyAttempted) {
    assert.equal(
      attestation.hostAuthentication.sha256,
      `sha256:${createHash("sha256").update(authBytes).digest("hex")}`,
    );
    assert.equal(attestation.hostAuthentication.size, Number(authStats.size));
    assert.equal(attestation.hostAuthentication.mtimeNs, authStats.mtimeNs.toString());
  } else {
    assert.match(attestation.hostAuthentication.sha256, /^sha256:[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(attestation.hostAuthentication.size));
    assert.match(attestation.hostAuthentication.mtimeNs, /^\d+$/);
  }
  assert.equal(attestation.hostAuthentication.mtimePrecedesOriginalLiveJob, true);
  const executableContract = attestation.sealedInputs.executableContract;
  for (const digest of Object.values(executableContract)) {
    assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  }
  assert.equal(
    attestation.sealedInputs.preparedOverlayReceipt,
    `sha256:${createHash("sha256").update(await fs.readFile(path.resolve(runtime, "../../..", "prepared-v2", "receipt.json"))).digest("hex")}`,
  );
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.deepEqual(config.policy.optInFailureContracts, [attestation.failureContract]);
  assert.equal(config.policy.maxExternalRetriesPerTrial, 1);
  assert.equal(config.sourceJobs.length, 1);
  assert.equal(config.sourceJobs[0].candidateId, "contrast-matrix-one-shot-answer");
  assert.equal(path.resolve(runtime, config.outputDirectory), resumeOutput);
  assert.equal(config.retryJobs.length, 0);

  if (alreadyAttempted) {
    const settledLock = JSON.parse(resumeLockBefore);
    assert.equal(settledLock.attempts.length, 1);
    assert.equal(settledLock.attempts[0].attempt, 1);
    assert.equal(settledLock.attempts[0].status, "failed-execution");
    assert.equal(settledLock.attempts[0].evaluable, false);
    assert.equal(settledLock.attempts[0].reward, null);
    assert.match(settledLock.attempts[0].attemptRecordDigest, /^sha256:[0-9a-f]{64}$/);
  } else {
    const doctor = runAdapter("doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorPayload = JSON.parse(await fs.readFile(path.join(runtime, "doctor.json"), "utf8"));
    assert.equal(doctorPayload.externalCalls, 0);
    assert.equal(doctorPayload.writes, 0);
    assert.equal(doctorPayload.eligibleTrials, 1);
    assert.equal(doctorPayload.excludedTrials, 0);
    const dry = runAdapter("dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const dryPayload = JSON.parse(await fs.readFile(path.join(runtime, "dry-run.json"), "utf8"));
    assert.equal(dryPayload.externalCalls, 0);
    assert.equal(dryPayload.writes, 0);
    assert.equal(dryPayload.trials.filter((row) => row.eligible).length, 1);
    assert.equal(dryPayload.trials.find((row) => row.eligible).candidateId, "contrast-matrix-one-shot-answer");
    assert.equal(
      dryPayload.trials.some((row) => row.candidateId === "extractive-one-shot-answer"),
      false,
    );
  }
  assert.equal(await exists(resumeOutput), alreadyAttempted);
  if (alreadyAttempted) {
    assert.deepEqual(await fs.readFile(resumeLockPath), resumeLockBefore);
  }

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "g003-auth-drift-"));
  try {
    const driftedAuth = path.join(temporary, "auth.json");
    await fs.writeFile(driftedAuth, Buffer.concat([authBytes, Buffer.from("\n")]));
    const rejected = runAdapter(
      "verify-auth",
      "--auth",
      driftedAuth,
      "--attestation",
      attestationPath,
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /auth\.json (sha256|size|mtimeNs) drift/);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
