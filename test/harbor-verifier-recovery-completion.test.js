import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(".");
const caseRoot = path.join(root, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003", "external-resume");
const contractPath = path.join(caseRoot, "post-agent-derivation-v2-contract.json");
const parentContractPath = path.join(caseRoot, "post-agent-recovery-contract.json");
const wrapperPath = path.join(caseRoot, "run-generation-003-verifier-derivation-v2.sh");
const builderPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v2.py");
const resumeRoot = path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003", "resume", "q003", "contrast-matrix-one-shot-answer");
const workRoot = path.join(resumeRoot, "verifier-recovery", ".attempt-001-verifier-work");

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
  const rows = [];
  async function walk(directory, prefix = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `unexpected link in ${relative}`);
      if (entry.isDirectory()) {
        rows.push({ path: `${relative}/`, type: "directory" });
        await walk(absolute, relative);
      } else {
        assert.equal(entry.isFile(), true, `unsupported node in ${relative}`);
        rows.push({ path: relative, type: "file", sha256: sha256(await fs.readFile(absolute)) });
      }
    }
  }
  await walk(target);
  return rows;
}

function runWsl(command, timeout = 180_000) {
  return spawnSync("wsl.exe", ["--", "bash", "-lc", command], {
    cwd: root,
    encoding: "utf8",
    timeout,
  });
}

test("V2 completion is sealed, append-only, and has no call surface", async () => {
  const [source, wrapper, resolver, publisher, contract, parentBytes, parent] = await Promise.all([
    fs.readFile(builderPath, "utf8"),
    fs.readFile(wrapperPath, "utf8"),
    fs.readFile(path.join(caseRoot, "..", "scripts", "evidence-resolution-post-agent-v2.js"), "utf8"),
    fs.readFile(path.join(caseRoot, "..", "scripts", "publish-generation-003-post-agent-v2.js"), "utf8"),
    fs.readFile(contractPath, "utf8").then(JSON.parse),
    fs.readFile(parentContractPath),
    fs.readFile(parentContractPath, "utf8").then(JSON.parse),
  ]);
  assert.equal(sha256(parentBytes), "sha256:ee22424a465941f642548f7eb4020456585bf88cf3e67554452a45b1daa32c0e");
  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.derivationContract, "harbor-0.18.0.completed-verifier-journal.task-overwrite-default-omission.derivation-v2");
  assert.deepEqual(contract.normalization, {
    id: "harbor-taskconfig-overwrite-default-omission-v1",
    scope: "JobConfig.tasks[0].overwrite",
    expected: false,
    observed: "absent",
    artifactMutation: false,
  });
  assert.equal(contract.parentCallJournal.sha256, "sha256:85f14f39ac6bd27f054de92c170489e82e957905b188123c8c1ad52808cf0663");
  assert.equal(contract.parentCallJournal.recordDigest, "sha256:38b962fc4f64cb7ee2e797cf39295c7d923a521f3f23e7c7a398eb34d0f6a2cd");
  assert.equal(contract.sealedFiles.length, 6);
  assert.equal(new Set(contract.sealedFiles.map((row) => row.path)).size, 6);
  for (const row of contract.sealedFiles) {
    assert.equal(row.sha256, sha256(await fs.readFile(path.resolve(caseRoot, row.path))), `stale V2 seal ${row.path}`);
  }
  assert.equal(parent.sealedFiles.length, 8);
  for (const row of parent.sealedFiles) {
    assert.equal(row.sha256, sha256(await fs.readFile(path.resolve(caseRoot, row.path))), `stale V1 seal ${row.path}`);
  }
  assert.equal(parent.sealedFiles.find((row) => row.path.endsWith("recover_verifier_only.py")).sha256,
    "sha256:d8f26d45f5015b4af5196d4bc75c8c7785186397e33aff07e49f54a469ac6692");
  assert.doesNotMatch(source, /v1\.publish_recovery_inputs\s*\(/);
  assert.doesNotMatch(source, /v1\.execute_verifier_runs\s*\(|v1\.run_verifier_container\s*\(/);
  assert.match(source, /"execute_verifier_runs"/);
  assert.match(source, /"run_verifier_container"/);
  assert.match(source, /"recovery_container_exists"/);
  assert.match(source, /"docker_image_id"/);
  assert.match(source, /engine\.run_native_job = forbidden/);
  assert.match(source, /v1\.rename_noreplace\(build, output/);
  assert.match(source, /v1\.rename_noreplace\(staging, final/);
  assert.match(source, /v1\.fsync_tree\(source, "q003 derivation V2 publication build"\)/);
  assert.match(source, /v1\.rename_noreplace\(source, destination, "q003 derivation V2 publication"\)/);
  assert.match(source, /prepare_state\(parent, check_docker=False\)/);
  assert.match(wrapper, /uv run --offline --frozen/);
  assert.match(resolver, /path\.resolve\(GENERATION_ROOT, "\.\.\/\.\.\/\.\.\/\.\."\)/);
  assert.match(publisher, /path\.resolve\(GENERATION_ROOT, "\.\.\/\.\.\/\.\.\/\.\."\)/);
  assert.match(publisher, /--publish-q003-staging/);
  assert.match(publisher, /spawnSync\("wsl\.exe", \["--exec", "wslpath", "-u"/);
  assert.match(publisher, /first q003 V2 publication must execute on the Windows host/);
  assert.match(publisher, /DEFAULT_GENERATION_001_RUNTIME/);
  assert.match(publisher, /DEFAULT_KNOWLEDGE_ROOT/);
  assert.match(publisher, /publicationDirectory: "publications\/q003"/);
  assert.doesNotMatch(publisher, /fs\.rename\(/);
});

test("V2 accepts only an omitted overwrite against explicit false", async () => {
  const harness = String.raw`
import copy, importlib.util, pathlib, sys
path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("v2_normalizer_test", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
expected = {"tasks": [{"path": "/task", "source": "x", "overwrite": False}], "agent": {"name": "a"}}
observed = {"tasks": [{"path": "/task", "source": "x"}], "agent": {"name": "a"}}
raw = {"tasks": [{"path": "/task", "source": "x"}]}
before = copy.deepcopy((expected, observed, raw))
result = module.normalize_exact_retry_profile_pair(expected, observed, raw)
assert result == expected
assert (expected, observed, raw) == before

bad = []
for value in (False, True, None, "false", 0):
    bad.append((expected, {"tasks": [{"path": "/task", "source": "x", "overwrite": value}], "agent": {"name": "a"}}, {"tasks": [{"path": "/task", "source": "x", "overwrite": value}]}))
bad.extend([
    ({"tasks": [{"path": "/task", "source": "x", "overwrite": True}], "agent": {"name": "a"}}, observed, raw),
    (expected, {"tasks": [{"path": "/other", "source": "x"}], "agent": {"name": "a"}}, raw),
    (expected, {"tasks": [{"path": "/task", "source": "y"}], "agent": {"name": "a"}}, raw),
    ({"tasks": [], "agent": {"name": "a"}}, {"tasks": [], "agent": {"name": "a"}}, {"tasks": []}),
    ({"tasks": [expected["tasks"][0], expected["tasks"][0]], "agent": {"name": "a"}}, {"tasks": [observed["tasks"][0], observed["tasks"][0]], "agent": {"name": "a"}}, {"tasks": [raw["tasks"][0], raw["tasks"][0]]}),
])
for case in bad:
    try:
        module.normalize_exact_retry_profile_pair(*case)
    except ValueError:
        pass
    else:
        raise AssertionError(f"accepted invalid case: {case!r}")
print("ok")
`;
  const execution = spawnSync("python", ["-c", harness, builderPath], { cwd: root, encoding: "utf8" });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), "ok");
});

test("V2 doctor and dry-run are zero-call, zero-write, and preserve completed evidence", async (t) => {
  if (runWsl("true", 30_000).status !== 0 || !await exists(workRoot)) {
    t.skip("local completed V1 verifier evidence is unavailable");
    return;
  }
  const workBefore = await snapshotTree(workRoot);
  const workFiles = workBefore.filter((row) => row.type === "file").map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest }));
  const workDirectories = workBefore.filter((row) => row.type === "directory").map((row) => row.path.slice(0, -1));
  assert.equal(pythonDigest(workFiles), "sha256:b09c1d4f80d441eb6f4edd54a77f9d7bbc6df9b7fcd1b4de4929855bc07ab70a");
  assert.equal(pythonDigest(workDirectories), "sha256:de7861836554608e7dff9b22b247a1e0f03624b2b0437a969678757eb0a6ff9b");
  const journalPath = path.join(resumeRoot, "verifier-recovery", "attempt-001-verifier-call-journal.json");
  const stableFiles = [contractPath, parentContractPath, journalPath, path.join(resumeRoot, "resume-lock.json")];
  const stableBefore = await Promise.all(stableFiles.map((file) => fs.readFile(file)));
  const trees = [
    workRoot,
    path.join(resumeRoot, "verifier-recovery", "attempt-001"),
    path.join(resumeRoot, "effective-jobs"),
    path.join(resumeRoot, "verifier-recovery-completion"),
  ];
  const treesBefore = await Promise.all(trees.map(snapshotTree));
  for (const mode of ["--doctor", "--dry-run"]) {
    const execution = runWsl(`cd /mnt/c/Users/villa/dev/skill-arena && bash evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/run-generation-003-verifier-derivation-v2.sh ${mode}`);
    assert.equal(execution.status, 0, execution.stderr);
    const payload = JSON.parse(execution.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.plannedHarborCalls, 0);
    assert.equal(payload.plannedModelCalls, 0);
    assert.equal(payload.plannedVerifierCalls, 0);
    assert.equal(payload.writes, 0);
    assert.equal(payload.journalCompleted, true);
  }
  assert.deepEqual(await Promise.all(stableFiles.map((file) => fs.readFile(file))), stableBefore);
  assert.deepEqual(await Promise.all(trees.map(snapshotTree)), treesBefore);
});

test("completed V2 live reruns verify only and preserve native projection bytes", async (t) => {
  const completion = path.join(resumeRoot, "verifier-recovery-completion", "attempt-001");
  if (runWsl("true", 30_000).status !== 0 || !await exists(completion)) {
    t.skip("local completed V2 derivation is unavailable");
    return;
  }
  const before = await snapshotTree(resumeRoot);
  for (const mode of ["live", "--verify", "live"]) {
    const suffix = mode === "live" ? "" : ` ${mode}`;
    const execution = runWsl(`cd /mnt/c/Users/villa/dev/skill-arena && bash evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/run-generation-003-verifier-derivation-v2.sh${suffix}`);
    assert.equal(execution.status, 0, execution.stderr);
    const payload = JSON.parse(execution.stdout);
    assert.equal(payload.harborCalls, 0);
    assert.equal(payload.modelCalls, 0);
    assert.equal(payload.verifierCalls, 0);
  }
  assert.deepEqual(await snapshotTree(resumeRoot), before);
  const parent = JSON.parse(await fs.readFile(parentContractPath, "utf8"));
  const native = path.resolve(caseRoot, parent.native.retryJobDirectory);
  const recovered = path.join(resumeRoot, "verifier-recovery", "attempt-001", "recovered-job");
  for (const relative of ["config.json", "lock.json", `${parent.native.trialName}/config.json`, `${parent.native.trialName}/lock.json`]) {
    assert.deepEqual(await fs.readFile(path.join(recovered, relative)), await fs.readFile(path.join(native, relative)), relative);
  }
});

test("generation-003 V2 receipt has Python-to-JS parity", async (t) => {
  const completion = path.join(resumeRoot, "verifier-recovery-completion", "attempt-001");
  if (!await exists(completion)) {
    t.skip("local completed V2 derivation is unavailable");
    return;
  }
  const [{ resolveContrastPostAgentEffectiveEvidenceV2 }, protocol] = await Promise.all([
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v2.js"),
    fs.readFile(path.join(root, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003", "protocol.json"), "utf8").then(JSON.parse),
  ]);
  const evidence = await resolveContrastPostAgentEffectiveEvidenceV2({
    protocol,
    runtimeRoot: path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003"),
  });
  assert.equal(evidence.selection.completionMode, "verifier-only-recovery-derivation-v2");
  assert.deepEqual(evidence.provenance.recoveryCalls, { harbor: 0, model: 0, verifier: 2 });
  assert.deepEqual(evidence.provenance.completion.execution, { harbor: 0, model: 0, verifier: 0 });
  assert.match(evidence.provenance.completion.recordDigest, /^sha256:[0-9a-f]{64}$/);
});

test("generation-003 V2 receipt fails closed on mutations", async (t) => {
  const completion = path.join(resumeRoot, "verifier-recovery-completion", "attempt-001");
  if (!await exists(completion)) {
    t.skip("local completed V2 derivation is unavailable");
    return;
  }
  const { verifyPostAgentDerivationV2 } = await import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v2.js");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-v2-receipt-"));
  try {
    const sourceContract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    const tempCompletion = path.join(temporary, "completion");
    const tempEvidence = path.join(tempCompletion, "v1-evidence");
    await fs.mkdir(tempCompletion, { recursive: true });
    await fs.cp(path.join(completion, "v1-evidence"), tempEvidence, { recursive: true, errorOnExist: true });
    const absoluteContract = {
      ...sourceContract,
      parentRecoveryContract: {
        ...sourceContract.parentRecoveryContract,
        path: parentContractPath,
      },
      parentCallJournal: {
        ...sourceContract.parentCallJournal,
        path: path.join(resumeRoot, "verifier-recovery", "attempt-001-verifier-call-journal.json"),
      },
      preservedV1Work: {
        ...sourceContract.preservedV1Work,
        path: workRoot,
      },
      completionDirectory: tempCompletion,
      sealedFiles: sourceContract.sealedFiles.map((row) => ({ ...row, path: path.resolve(caseRoot, row.path) })),
    };
    const tempContract = path.join(temporary, "contract.json");
    await fs.writeFile(tempContract, `${JSON.stringify(absoluteContract, null, 2)}\n`);
    const receipt = JSON.parse(await fs.readFile(path.join(completion, "completion-receipt.json"), "utf8"));
    receipt.completion.contractPath = tempContract;
    receipt.completion.contractSha256 = sha256(await fs.readFile(tempContract));
    receipt.completion.sealedFiles = absoluteContract.sealedFiles;
    receipt.completion.sealedSetDigest = pythonDigest(receipt.completion.sealedFiles);
    receipt.v1Evidence.directory = tempEvidence;
    delete receipt.completionRecordDigest;
    receipt.completionRecordDigest = pythonDigest(receipt);
    const receiptPath = path.join(tempCompletion, "completion-receipt.json");
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await verifyPostAgentDerivationV2({ contractPath: tempContract });

    const cases = [
      {
        label: "unsealed body mutation",
        mutate(value) { value.status = "tampered"; },
        reseal: false,
        error: /self-digest/,
      },
      {
        label: "broader normalization",
        mutate(value) { value.completion.normalization.scope = "TaskConfig"; },
        reseal: true,
        error: /normalization/,
      },
      {
        label: "completion verifier call",
        mutate(value) { value.completion.execution.verifierCalls = 1; },
        reseal: true,
        error: /call accounting/,
      },
      {
        label: "preserved work digest",
        mutate(value) { value.v1Evidence.preservedV1Work.artifactDigest = `sha256:${"0".repeat(64)}`; },
        reseal: true,
        error: /preserved V1 work digest/,
      },
      {
        label: "projection result hash",
        mutate(value) { value.compatibilityProjection.recoveryResultSha256 = `sha256:${"0".repeat(64)}`; },
        reseal: true,
        error: /recovery-result bytes/,
      },
      {
        label: "unknown field",
        mutate(value) { value.unexpected = true; },
        reseal: true,
        error: /keys drifted/,
      },
    ];
    for (const item of cases) {
      const mutated = structuredClone(receipt);
      item.mutate(mutated);
      if (item.reseal) {
        delete mutated.completionRecordDigest;
        mutated.completionRecordDigest = pythonDigest(mutated);
      }
      await fs.writeFile(receiptPath, `${JSON.stringify(mutated, null, 2)}\n`);
      await assert.rejects(verifyPostAgentDerivationV2({ contractPath: tempContract }), item.error, item.label);
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
