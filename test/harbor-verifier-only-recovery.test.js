import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(".");
const caseRoot = path.join(
  root,
  "evaluations",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "external-resume",
);
const contractPath = path.join(caseRoot, "post-agent-recovery-contract.json");
const v2ContractPath = path.join(caseRoot, "post-agent-derivation-v2-contract.json");
const v3ContractPath = path.join(caseRoot, "post-agent-derivation-v3-contract.json");
const wrapperPath = path.join(caseRoot, "run-generation-003-verifier-recovery.sh");
const builderPath = path.join(
  root,
  "skills",
  "harbor-resume-external-failures",
  "scripts",
  "recover_verifier_only.py",
);
const resumeRoot = path.join(
  root,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "resume",
  "q003",
  "contrast-matrix-one-shot-answer",
);
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
    entries.sort((left, right) => left.name.localeCompare(right.name));
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

test("verifier-only recovery is a sealed zero-model append-only path", async () => {
  const [source, wrapper, contract] = await Promise.all([
    fs.readFile(builderPath, "utf8"),
    fs.readFile(wrapperPath, "utf8"),
    fs.readFile(contractPath, "utf8").then(JSON.parse),
  ]);

  assert.equal(
    contract.recoveryContract,
    "harbor-0.18.0.oserror-eio-during-artifact-collection.post-agent.pre-verifier.v1",
  );
  assert.equal(contract.attempt, 1);
  assert.equal(contract.verifier.network, "none");
  assert.equal(contract.verifier.repeat, 2);
  assert.deepEqual(contract.verifier.command, ["/tests/test.sh"]);
  assert.doesNotMatch(source, /\bJob\.create\b|\bAgentFactory\s*\(|\bharbor\s+run\b/);
  assert.doesNotMatch(source, /auth\.json|dst=\/knowledge|docker\.sock/);
  assert.match(source, /"--network",\s*\n\s*"none"/);
  assert.match(source, /"--pull",\s*\n\s*"never"/);
  assert.match(source, /"--read-only"/);
  assert.match(source, /"--cap-drop",\s*\n\s*"ALL"/);
  assert.match(source, /"no-new-privileges"/);
  assert.match(source, /"--memory",\s*\n\s*"4096m"/);
  assert.match(source, /"--entrypoint",\s*\n\s*"python"/);
  assert.match(source, /\["docker", "exec", container_id, \*contract\["verifier"\]\["command"\]\]/);
  assert.match(source, /contract\["verifier"\]\["imageId"\]/);
  assert.match(source, /timeout=180/);
  assert.match(source, /tmpfs-size=4194304/);
  assert.match(source, /def run_bounded_process\(/);
  assert.doesNotMatch(source, /"docker",\s*"cp"/);
  assert.match(source, /JOURNAL_KIND = "harbor-verifier-only-call-journal"/);
  assert.match(source, /os\.O_CREAT \| os\.O_EXCL \| os\.O_WRONLY \| os\.O_NOFOLLOW/);
  assert.match(source, /os\.fsync\(descriptor\)/);
  assert.match(source, /automatic replay is forbidden/);
  assert.match(source, /remove_recovery_container/);
  assert.match(source, /exception_text != traceback/);
  assert.match(source, /def publish_expected_json\(/);
  assert.match(source, /verify_effective_namespace/);
  assert.match(source, /move_method = "Directory" if source_is_directory else "File"/);
  assert.match(source, /SKILL_ARENA_MOVE_SOURCE/);
  assert.match(source, /Effective-jobs namespace exists before verifier recovery publication/);
  assert.doesNotMatch(wrapper, /auth\.json|\/knowledge|\bharbor\s+run\b|resume_external_failures/);
  assert.match(wrapper, /uv run --offline --frozen/);

  const executeStart = source.indexOf("def execute_verifier_runs(");
  const durableStarting = source.indexOf("journal = write_journal(journal_path(contract), body)", executeStart);
  const verifierCall = source.indexOf("result = run_verifier_container(", executeStart);
  assert.ok(executeStart >= 0 && durableStarting > executeStart && verifierCall > durableStarting,
    "the starting receipt must be durable before the verifier call");

  assert.equal(contract.task.treeSha256, "877c9335300ce055ace37103bf4bd9a574927d740fb96503471c406151ef6566");
  assert.deepEqual(contract.native.nativeRetryJobDirectoryManifest, [
    "q003__dUW9ioV",
    "q003__dUW9ioV/agent",
    "q003__dUW9ioV/agent/setup",
    "q003__dUW9ioV/artifacts",
    "q003__dUW9ioV/artifacts/logs",
    "q003__dUW9ioV/artifacts/logs/artifacts",
    "q003__dUW9ioV/verifier",
  ]);
  assert.equal(contract.sealedFiles.length, 8);
  assert.equal(new Set(contract.sealedFiles.map((item) => item.path)).size, 8);
  for (const item of contract.sealedFiles) {
    const absolute = path.resolve(caseRoot, item.path);
    assert.equal(item.sha256, sha256(await fs.readFile(absolute)), `stale executable seal: ${item.path}`);
  }

  const declaredBuilder = contract.sealedFiles.find((item) =>
    item.path.endsWith("scripts/recover_verifier_only.py"));
  assert.ok(declaredBuilder);
  assert.equal(declaredBuilder.sha256, sha256(await fs.readFile(builderPath)));
  assert.ok(contract.sealedFiles.some((item) =>
    item.path.endsWith("scripts/recover_verifier_only.py.lock")));
});

test("q003 verifier-only doctor and dry-run make no writes or calls", async (t) => {
  const wsl = runWsl("true", 30_000);
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  const nativeJob = path.resolve(caseRoot, contract.native.retryJobDirectory);
  const resumeLock = path.join(resumeRoot, "resume-lock.json");
  if (wsl.status !== 0 || !await exists(nativeJob) || !await exists(resumeLock)) {
    t.skip("local WSL q003 recovery evidence is unavailable");
    return;
  }
  const image = runWsl(
    `docker image inspect --format '{{.Id}}' ${contract.verifier.image}`,
    30_000,
  );
  if (image.status !== 0 || image.stdout.trim() !== contract.verifier.imageId) {
    t.skip("the sealed local verifier image is unavailable");
    return;
  }

  const nativeBefore = await snapshotTree(nativeJob);
  const resumeLockBefore = await fs.readFile(resumeLock);
  const recoveryBefore = await snapshotTree(path.join(resumeRoot, "verifier-recovery"));
  const effectiveBefore = await snapshotTree(path.join(resumeRoot, "effective-jobs"));
  let downstreamPreservedWork = false;
  if (await exists(workRoot)) {
    const [v1Bytes, v2Bytes, v2, v3, work] = await Promise.all([
      fs.readFile(contractPath),
      fs.readFile(v2ContractPath),
      fs.readFile(v2ContractPath, "utf8").then(JSON.parse),
      fs.readFile(v3ContractPath, "utf8").then(JSON.parse),
      snapshotTree(workRoot),
    ]);
    assert.equal(v2.parentRecoveryContract.sha256, sha256(v1Bytes), "V2 must seal the V1 recovery contract");
    assert.equal(v3.parentDerivationContract.sha256, sha256(v2Bytes), "V3 must seal the V2 derivation contract");
    assert.equal(path.resolve(caseRoot, v2.preservedV1Work.path), workRoot, "V2 preserved-work path drift");
    const files = work.filter((row) => row.type === "file")
      .map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest }))
      .sort((left, right) => comparePythonStrings(left.path, right.path));
    const directories = work.filter((row) => row.type === "directory")
      .map((row) => row.path.slice(0, -1))
      .sort(comparePythonStrings);
    assert.equal(pythonDigest(files), v2.preservedV1Work.artifactDigest, "V2 preserved-work artifact drift");
    assert.equal(pythonDigest(directories), v2.preservedV1Work.directoryManifestDigest, "V2 preserved-work topology drift");
    downstreamPreservedWork = true;
  }
  for (const mode of ["--doctor", "--dry-run"]) {
    const execution = runWsl(
      `cd /mnt/c/Users/villa/dev/skill-arena && bash evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/run-generation-003-verifier-recovery.sh ${mode}`,
    );
    if (downstreamPreservedWork) {
      assert.equal(execution.status, 2, execution.stderr);
      assert.match(
        execution.stderr,
        /published verifier recovery namespace direct children drifted[\s\S]*\.attempt-001-verifier-work/,
        "the inherited V1 reader must fail closed on V2/V3 preserved work",
      );
      assert.equal(execution.stdout, "");
    } else {
      assert.equal(execution.status, 0, execution.stderr);
      const payload = JSON.parse(execution.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.harborCalls, 0);
      assert.equal(payload.modelCalls, 0);
      assert.equal(payload.externalCalls, 0);
      assert.equal(payload.writes, 0);
      assert.equal(payload.nativeRetryImmutable, true);
    }
  }
  assert.deepEqual(await snapshotTree(nativeJob), nativeBefore);
  assert.deepEqual(await fs.readFile(resumeLock), resumeLockBefore);
  assert.deepEqual(await snapshotTree(path.join(resumeRoot, "verifier-recovery")), recoveryBefore);
  assert.deepEqual(await snapshotTree(path.join(resumeRoot, "effective-jobs")), effectiveBefore);
});

test("q003 verifier-only builder rejects a one-byte trace seal mutation", async (t) => {
  const wsl = runWsl("true", 30_000);
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  const nativeJob = path.resolve(caseRoot, contract.native.retryJobDirectory);
  if (wsl.status !== 0 || !await exists(nativeJob)) {
    t.skip("local WSL q003 recovery evidence is unavailable");
    return;
  }

  const filename = `.post-agent-recovery-mutated-${randomUUID()}.json`;
  const temporary = path.join(caseRoot, filename);
  contract.agentTrace.sha256 = `sha256:${"0".repeat(64)}`;
  await fs.writeFile(temporary, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  try {
    const execution = runWsl(
      `cd /mnt/c/Users/villa/dev/skill-arena && uv run --offline --frozen skills/harbor-resume-external-failures/scripts/recover_verifier_only.py evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/${filename} --doctor`,
    );
    assert.equal(execution.status, 2);
    assert.match(execution.stderr, /Native Pi trace bytes drifted/);
  } finally {
    await fs.rm(temporary, { force: true });
  }
});
