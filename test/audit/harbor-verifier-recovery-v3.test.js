import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(".");
const generationRoot = path.join(root, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const caseRoot = path.join(generationRoot, "external-resume");
const contractPath = path.join(caseRoot, "post-agent-derivation-v3-contract.json");
const parentV2Path = path.join(caseRoot, "post-agent-derivation-v2-contract.json");
const parentV1Path = path.join(caseRoot, "post-agent-recovery-contract.json");
const builderPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v3.py");
const wrapperPath = path.join(caseRoot, "run-generation-003-verifier-derivation-v3.sh");
const resolverPath = path.join(generationRoot, "scripts", "evidence-resolution-post-agent-v3.js");
const publisherPath = path.join(generationRoot, "scripts", "publish-generation-003-post-agent-v3.js");
const runtimeRoot = path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const resumeRoot = path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer");
const failedV2Staging = path.join(resumeRoot, "verifier-recovery-completion", ".attempt-001.build");
const failedV2Owner = path.join(resumeRoot, "verifier-recovery-completion", ".attempt-001.owner.json");
const completionRoot = path.join(resumeRoot, "verifier-recovery-completion-v3", "attempt-001");

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function comparePythonStrings(left, right) {
  const a = Array.from(left, (value) => value.codePointAt(0));
  const b = Array.from(right, (value) => value.codePointAt(0));
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
  const keys = Object.keys(value).sort(comparePythonStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalPython(value[key])}`).join(",")}}`;
}

function pythonDigest(value) {
  return sha256(Buffer.from(canonicalPython(value), "utf8"));
}

async function exists(target) {
  return fs.lstat(target).then(() => true, () => false);
}

async function snapshotTree(target) {
  if (!await exists(target)) return null;
  const stat = await fs.lstat(target);
  if (stat.isFile()) return [{ path: ".", type: "file", sha256: sha256(await fs.readFile(target)) }];
  const rows = [];
  async function walk(directory, prefix = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `unexpected link ${relative}`);
      if (entry.isDirectory()) {
        rows.push({ path: `${relative}/`, type: "directory" });
        await walk(absolute, relative);
      } else {
        assert.equal(entry.isFile(), true, `unsupported node ${relative}`);
        rows.push({ path: relative, type: "file", sha256: sha256(await fs.readFile(absolute)) });
      }
    }
  }
  await walk(target);
  return rows;
}

function runWsl(mode, timeout = 240_000) {
  const suffix = mode ? ` ${mode}` : "";
  return spawnSync("wsl.exe", ["--exec", "bash", "-lc",
    `cd /mnt/c/Users/villa/dev/skill-arena && bash evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/run-generation-003-verifier-derivation-v3.sh${suffix}`,
  ], { cwd: root, encoding: "utf8", timeout });
}

test("V3 is append-only, sealed, and admits exactly two default omissions", async () => {
  const [source, wrapper, resolver, publisher, contract, parentV2Bytes, parentV1Bytes] = await Promise.all([
    fs.readFile(builderPath, "utf8"),
    fs.readFile(wrapperPath, "utf8"),
    fs.readFile(resolverPath, "utf8"),
    fs.readFile(publisherPath, "utf8"),
    fs.readFile(contractPath, "utf8").then(JSON.parse),
    fs.readFile(parentV2Path),
    fs.readFile(parentV1Path),
  ]);
  assert.equal(sha256(parentV2Bytes), "sha256:cfa6c96bcd2324d6f646f18c27c028c469bb7977518fcaf4c4eb651597e54d7f");
  assert.equal(sha256(parentV1Bytes), "sha256:ee22424a465941f642548f7eb4020456585bf88cf3e67554452a45b1daa32c0e");
  assert.equal(contract.schemaVersion, 3);
  assert.deepEqual(contract.normalizations.map((row) => [row.scope, row.expected, row.observed, row.artifactMutation]), [
    ["JobConfig.tasks[0].overwrite", false, "absent", false],
    ["JobConfig.n_attempts", 1, "absent", false],
  ]);
  assert.equal(contract.failedParentAttempt.artifactDigest, "sha256:ec67d1bb6c16f1e07153be2392ea4e5df8c16fdf173f2af4f4fcd2a69c34e7b6");
  assert.equal(contract.failedParentAttempt.directoryManifestDigest, "sha256:90f9672927fbfa6c950307498fdf59d49a6f187d2d2d706e7f40a87a6f5bc816");
  assert.equal(contract.sealedFiles.length, 6);
  for (const row of contract.sealedFiles) {
    assert.equal(row.sha256, sha256(await fs.readFile(path.resolve(caseRoot, row.path))), `stale V3 seal ${row.path}`);
  }
  assert.match(source, /with install_v3_adapter\(v2\):\s*\n\s*v2\.complete_projection/);
  assert.match(source, /v1\.writer_lock\(v1\.writer_lock_path\(parent_v1\)/);
  assert.match(source, /v1\.rename_noreplace\(staging, final, "derivation V3 receipt publication"\)/);
  assert.match(source, /v1\.rename_noreplace\(source, destination, "q003 derivation V3 publication"\)/);
  assert.match(source, /reconcile_staging\(contract, v1, staging, final, owner\)\s*\n\s*# Another invocation may have published[\s\S]*?if final\.exists\(\) or final\.is_symlink\(\):[\s\S]*?live-idempotent-after-lock[\s\S]*?write_new_json\(owner/);
  assert.doesNotMatch(source, /run_native_job\s*\(|execute_verifier_runs\s*\(|run_verifier_container\s*\(/);
  assert.match(wrapper, /uv run --offline --frozen/);
  assert.match(resolver, /process\.platform !== "win32"/);
  assert.match(publisher, /spawnSync\("wsl\.exe", \["--exec", "wslpath", "-u"/);
  assert.doesNotMatch(publisher, /fs\.rename\(/);
});

test("V3 doctor and dry-run preserve the failed V2 attempt and plan zero calls", async (t) => {
  if (!await exists(failedV2Staging) || runWsl("--doctor", 30_000).error?.code === "ENOENT") {
    t.skip("local failed V2 staging or WSL is unavailable");
    return;
  }
  const journal = path.join(resumeRoot, "verifier-recovery", "attempt-001-verifier-call-journal.json");
  const watched = [failedV2Staging, failedV2Owner, journal, completionRoot,
    path.join(resumeRoot, "verifier-recovery", "attempt-001"), path.join(resumeRoot, "effective-jobs")];
  const before = await Promise.all(watched.map(snapshotTree));
  for (const mode of ["--doctor", "--dry-run"]) {
    const execution = runWsl(mode);
    assert.equal(execution.status, 0, execution.stderr);
    const payload = JSON.parse(execution.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.parentV2Failed, true);
    assert.equal(payload.plannedHarborCalls, 0);
    assert.equal(payload.plannedModelCalls, 0);
    assert.equal(payload.plannedVerifierCalls, 0);
    assert.equal(payload.writes, 0);
  }
  assert.deepEqual(await Promise.all(watched.map(snapshotTree)), before);
});

test("V3 n_attempts adapter is in-memory and restricted to native-byte recovered copies", async () => {
  const harness = String.raw`
import contextlib, copy, importlib.util, json, pathlib, tempfile, sys
spec = importlib.util.spec_from_file_location("v3_adapter_test", pathlib.Path(sys.argv[1]))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
root = pathlib.Path(tempfile.mkdtemp())
try:
    native = root / "native"; recovered = root / "recovered"; unrelated = root / "unrelated"
    trial = "trial-001"
    raw = {"n_concurrent_trials": 1, "tasks": [{"path": "/task", "source": "tasks"}]}
    for directory in (native, recovered, unrelated):
        (directory / trial).mkdir(parents=True)
        (directory / "config.json").write_text(json.dumps(raw), encoding="utf-8")
        (directory / "lock.json").write_text("{}", encoding="utf-8")
        (directory / trial / "config.json").write_text("{}", encoding="utf-8")
        (directory / trial / "lock.json").write_text("{}", encoding="utf-8")
    (unrelated / "lock.json").write_text('{"different":true}', encoding="utf-8")
    class Config:
        @classmethod
        def model_validate(cls, value): return copy.deepcopy(value)
    class V1: JobConfig = Config
    class Engine:
        def model_json(self, value): return {**copy.deepcopy(value), "n_attempts": 1}
        def load_harbor_job(self, directory, *args, **kwargs):
            return {"trials": [{"jobConfig": json.loads((pathlib.Path(directory) / "config.json").read_text())}]}
    engine = Engine()
    state = {"engine": engine, "nativeJobDirectory": native, "nativeTrialName": trial}
    @contextlib.contextmanager
    def parent_adapter(state, v1): yield
    original = (recovered / "config.json").read_bytes()
    module.validate_n_attempts_omission(state, V1)
    with module.exact_two_default_adapter(parent_adapter, state, V1):
        assert engine.load_harbor_job(recovered)["trials"][0]["jobConfig"]["n_attempts"] == 1
        assert "n_attempts" not in engine.load_harbor_job(native)["trials"][0]["jobConfig"]
        assert "n_attempts" not in engine.load_harbor_job(unrelated)["trials"][0]["jobConfig"]
    assert (recovered / "config.json").read_bytes() == original
    for value in (1, True, None, 1.0, "1", 0, 2):
        bad = copy.deepcopy(raw); bad["n_attempts"] = value
        (native / "config.json").write_text(json.dumps(bad), encoding="utf-8")
        try: module.validate_n_attempts_omission(state, V1)
        except ValueError: pass
        else: raise AssertionError(f"accepted explicit n_attempts={value!r}")
    for value in (True, 1.0, "1", 0, 2):
        bad = copy.deepcopy(raw); bad["n_concurrent_trials"] = value
        (native / "config.json").write_text(json.dumps(bad), encoding="utf-8")
        try: module.validate_n_attempts_omission(state, V1)
        except ValueError: pass
        else: raise AssertionError(f"accepted invalid n_concurrent_trials={value!r}")
    print("ok")
finally:
    import shutil; shutil.rmtree(root)
`;
  const execution = spawnSync("python", ["-c", harness, builderPath], { cwd: root, encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), "ok");
});

test("completed V3 is Python-authoritative and legacy JS fails closed on Harbor 60.0", async (t) => {
  if (!await exists(completionRoot)) {
    t.skip("local V3 completion is unavailable");
    return;
  }
  const beforeParent = await snapshotTree(failedV2Staging);
  const beforeAll = await snapshotTree(resumeRoot);
  for (const mode of ["--verify", ""]) {
    const execution = runWsl(mode);
    assert.equal(execution.status, 0, execution.stderr);
    const payload = JSON.parse(execution.stdout);
    assert.equal(payload.harborCalls, 0);
    assert.equal(payload.modelCalls, 0);
    assert.equal(payload.verifierCalls, 0);
  }
  assert.deepEqual(await snapshotTree(failedV2Staging), beforeParent);
  assert.deepEqual(await snapshotTree(resumeRoot), beforeAll);
  const [{ resolveContrastPostAgentEffectiveEvidenceV3 }, protocol] = await Promise.all([
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v3.js"),
    fs.readFile(path.join(generationRoot, "protocol.json"), "utf8").then(JSON.parse),
  ]);
  const parentV1 = JSON.parse(await fs.readFile(parentV1Path, "utf8"));
  const nativeLock = path.join(path.resolve(caseRoot, parentV1.native.retryJobDirectory), "lock.json");
  assert.match(await fs.readFile(nativeLock, "utf8"), /"max_wait_sec"\s*:\s*60\.0/);
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidenceV3({ protocol, runtimeRoot }),
    /native retry lock is not valid JSON: Python float 60\.0 is outside the recovery score subset/,
  );
});

test("V3 JavaScript receipt verifier fails closed on Harbor 60.0 or receipt mutations", async (t) => {
  if (!await exists(completionRoot)) {
    t.skip("local V3 completion is unavailable");
    return;
  }
  const { verifyPostAgentDerivationV3 } = await import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v3.js");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-v3-receipt-"));
  try {
    const sourceContract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    const tempCompletion = path.join(temporary, "completion");
    await fs.cp(completionRoot, tempCompletion, { recursive: true, errorOnExist: true });
    const absoluteContract = {
      ...sourceContract,
      parentDerivationContract: { ...sourceContract.parentDerivationContract, path: parentV2Path },
      failedParentAttempt: {
        ...sourceContract.failedParentAttempt,
        ownerPath: failedV2Owner,
        stagingPath: failedV2Staging,
      },
      completionDirectory: tempCompletion,
      sealedFiles: sourceContract.sealedFiles.map((row) => ({ ...row, path: path.resolve(caseRoot, row.path) })),
    };
    const tempContract = path.join(temporary, "contract.json");
    await fs.writeFile(tempContract, `${JSON.stringify(absoluteContract, null, 2)}\n`);
    const receiptPath = path.join(tempCompletion, "completion-receipt.json");
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    receipt.completion.contractPath = tempContract;
    receipt.completion.contractSha256 = sha256(await fs.readFile(tempContract));
    receipt.completion.sealedFiles = absoluteContract.sealedFiles;
    receipt.completion.sealedSetDigest = pythonDigest(receipt.completion.sealedFiles);
    receipt.v2FailureEvidence.directory = path.join(tempCompletion, "v2-failed-attempt");
    delete receipt.completionRecordDigest;
    receipt.completionRecordDigest = pythonDigest(receipt);
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    const parentV1 = JSON.parse(await fs.readFile(parentV1Path, "utf8"));
    const nativeLock = path.join(path.resolve(caseRoot, parentV1.native.retryJobDirectory), "lock.json");
    const nativeLockText = await fs.readFile(nativeLock, "utf8");
    let baselineError = null;
    try {
      await verifyPostAgentDerivationV3({ contractPath: tempContract });
    } catch (error) {
      baselineError = error;
    }
    if (/"max_wait_sec"\s*:\s*60\.0/.test(nativeLockText)) {
      assert.ok(baselineError, "legacy V3 JS unexpectedly accepted Harbor 60.0");
      assert.match(
        baselineError.message,
        /native retry lock is not valid JSON: Python float 60\.0 is outside the recovery score subset/,
      );
      return;
    }
    assert.equal(baselineError, null, baselineError?.message);
    const cases = [
      { label: "normalization", mutate(value) { value.completion.normalizations[1].expected = 2; }, error: /normalizations/ },
      { label: "completion call", mutate(value) { value.completion.execution.verifierCalls = 1; }, error: /completion calls|differs/ },
      { label: "failed parent digest", mutate(value) { value.parentV2.failedStagingArtifactDigest = `sha256:${"0".repeat(64)}`; }, error: /parent binding|differs/ },
      {
        label: "native retry digest",
        mutate(value) {
          value.native.nativeRetryJobArtifactDigest = `sha256:${"0".repeat(64)}`;
          value.compatibilityProjection.nativeRetryJobArtifactDigest = `sha256:${"0".repeat(64)}`;
        },
        error: /native binding|native retry job artifact digest/,
      },
      { label: "projection digest", mutate(value) { value.compatibilityProjection.recoveryResultSha256 = `sha256:${"0".repeat(64)}`; }, error: /recovery result bytes/ },
      { label: "unknown field", mutate(value) { value.unexpected = true; }, error: /keys/ },
    ];
    for (const item of cases) {
      const mutated = structuredClone(receipt);
      item.mutate(mutated);
      delete mutated.completionRecordDigest;
      mutated.completionRecordDigest = pythonDigest(mutated);
      await fs.writeFile(receiptPath, `${JSON.stringify(mutated, null, 2)}\n`);
      await assert.rejects(verifyPostAgentDerivationV3({ contractPath: tempContract }), item.error, item.label);
    }
    const extraEvidence = path.join(tempCompletion, "v2-failed-attempt", "unexpected.txt");
    await fs.writeFile(extraEvidence, "resealed but forbidden\n");
    const resealed = structuredClone(receipt);
    resealed.v2FailureEvidence.artifactManifest.push({
      path: "unexpected.txt",
      sha256: sha256(await fs.readFile(extraEvidence)),
    });
    resealed.v2FailureEvidence.artifactManifest.sort((left, right) => comparePythonStrings(left.path, right.path));
    resealed.v2FailureEvidence.artifactDigest = pythonDigest(resealed.v2FailureEvidence.artifactManifest);
    delete resealed.completionRecordDigest;
    resealed.completionRecordDigest = pythonDigest(resealed);
    await fs.writeFile(receiptPath, `${JSON.stringify(resealed, null, 2)}\n`);
    await assert.rejects(
      verifyPostAgentDerivationV3({ contractPath: tempContract }),
      /failure evidence direct topology/,
      "resealed extra failure-evidence child",
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
