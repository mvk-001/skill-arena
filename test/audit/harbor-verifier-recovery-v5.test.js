import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canonicalJson, objectDigest } from "../../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";

const root = path.resolve(".");
const generationRoot = path.join(root, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const caseRoot = path.join(generationRoot, "external-resume");
const runtimeRoot = path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const contractPath = path.join(caseRoot, "q003-publication-v5-contract.json");
const parentV4Path = path.join(caseRoot, "post-agent-verification-v4-contract.json");
const publisherPath = path.join(generationRoot, "scripts", "publish-generation-003-post-agent-v5.js");
const parentPublisherPath = path.join(generationRoot, "scripts", "publish-generation-003-post-agent-v4.js");
const helperPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v5.py");
const parentHelperPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v4.py");
const helperLockPath = `${helperPath}.lock`;
const parentHelperLockPath = `${parentHelperPath}.lock`;
const wrapperPath = path.join(caseRoot, "run-generation-003-q003-publication-v5.sh");
const publicationPath = path.join(runtimeRoot, "publications", "q003");
const parentV4Sha256 = "sha256:0d17825136d07069302e39dac9cc5737fc6adfa7ff06666cf097f052a7591394";
const publicBindings = [
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

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function exists(target) {
  return fs.lstat(target).then(() => true, () => false);
}

async function snapshot(target) {
  if (!await exists(target)) return null;
  const stat = await fs.lstat(target);
  if (stat.isFile()) return { type: "file", sha256: sha256(await fs.readFile(target)) };
  const rows = [];
  async function walk(directory, prefix = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        rows.push({ path: `${relative}/`, type: "directory" });
        await walk(absolute, relative);
      } else {
        assert.equal(entry.isFile(), true, `unsupported watched node ${relative}`);
        rows.push({ path: relative, type: "file", sha256: sha256(await fs.readFile(absolute)) });
      }
    }
  }
  await walk(target);
  return rows;
}

test("V5 is an append-only q003-only child of the exact V4 contract", async () => {
  const [rawContract, publisher, helper, wrapper, parentPublisher, parentHelper] = await Promise.all([
    fs.readFile(contractPath, "utf8"),
    fs.readFile(publisherPath, "utf8"),
    fs.readFile(helperPath, "utf8"),
    fs.readFile(wrapperPath, "utf8"),
    fs.readFile(parentPublisherPath),
    fs.readFile(parentHelperPath),
  ]);
  const contract = JSON.parse(rawContract);
  assert.equal(rawContract, canonicalJson(contract));
  assert.equal(contract.schemaVersion, 5);
  assert.equal(contract.parentV4.contractSha256, parentV4Sha256);
  assert.equal(sha256(await fs.readFile(parentV4Path)), parentV4Sha256);
  assert.equal(sha256(parentPublisher), "sha256:81ba65a64fe7100e85b888a75d766c4789faffbd3d8316dce21296318e9400af");
  assert.equal(sha256(parentHelper), "sha256:2bc6e9f5c6952d5b68c8018c8d5c242e7ad651b749069d0b94009c8dc0f81168");
  assert.deepEqual(contract.publicBindings, publicBindings);
  assert.equal(contract.sealedFiles.length, 5);
  for (const row of contract.sealedFiles) {
    assert.equal(sha256(await fs.readFile(path.resolve(caseRoot, row.path))), row.sha256, `stale V5 binding ${row.path}`);
  }
  assert.equal(await fs.readFile(helperLockPath, "utf8"), await fs.readFile(parentHelperLockPath, "utf8"));
  assert.match(publisher, /from "\.\/evidence-resolution-post-agent-v4\.js"/);
  assert.match(publisher, /from "\.\/publish-generation-003-post-agent-v4-legacy\.js"/);
  assert.match(publisher, /verifyQ003PublicationBindingsV4/);
  assert.match(publisher, /--result-file-sha256/);
  assert.match(publisher, /--report-file-sha256/);
  assert.match(publisher, /--receipt-file-sha256/);
  assert.match(publisher, /timeout: 900_000/);
  assert.doesNotMatch(publisher, /verify-resume|"--output"/);
  assert.match(helper, /javascript_publication_body_digest/);
  assert.match(helper, /destination already exists/);
  assert.match(wrapper, /publish-generation-003-post-agent-v5\.js[\s\S]*\n\s*q003/);
  assert.doesNotMatch(wrapper, /harbor run|verify-resume|run-generation-003-baseline/);
});

test("V5 verifies JavaScript number tokens by exact root-member elision", async () => {
  const body = {
    numbers: { largeExponent: 1e21, smallExponent: 1e-7 },
    records: [{ metrics: { primary: 0.8152783198741896 } }],
    schemaVersion: 1,
    thresholds: { passThreshold: 0.000001 },
  };
  const publication = { ...body, publicationSha256: objectDigest(body) };
  const raw = canonicalJson(publication);
  assert.match(raw, /"largeExponent": 1e\+21/);
  assert.match(raw, /"smallExponent": 1e-7/);
  assert.match(raw, /"passThreshold": 0\.000001/);
  const harness = String.raw`
import base64, importlib.util, json, pathlib, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("q003_v5_elision_test", pathlib.Path(sys.argv[1]))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
raw = base64.b64decode(sys.argv[2]); expected = sys.argv[3]
_raw, result = m.read_strict_json_bytes(raw, "positive JavaScript fixture")
assert m.javascript_publication_body_digest(raw, result) == expected

mutated = raw.replace(b"0.000001", b"0.000002", 1)
_raw, changed = m.read_strict_json_bytes(mutated, "stale-digest fixture")
assert m.javascript_publication_body_digest(mutated, changed) != expected

for label, invalid in {
    "bom": b"\xef\xbb\xbf" + raw,
    "crlf": raw.replace(b"\n", b"\r\n"),
    "tab": raw.replace(b"  \"numbers\"", b"\t\"numbers\"", 1),
    "root-layout": raw.replace(b'  "publicationSha256"', b'    "publicationSha256"', 1),
    "duplicate": raw.replace(b"{\n", b'{\n  "schemaVersion": 1,\n', 1),
    "non-json-constant": raw.replace(b'{\n', b'{\n  "forbidden": NaN,\n', 1),
}.items():
    try:
        _raw, parsed = m.read_strict_json_bytes(invalid, label)
        m.javascript_publication_body_digest(invalid, parsed)
    except ValueError:
        pass
    else:
        raise AssertionError(f"accepted {label}")
print("ok")
`;
  const execution = spawnSync(
    "python",
    ["-B", "-c", harness, helperPath, Buffer.from(raw).toString("base64"), publication.publicationSha256],
    { cwd: root, encoding: "utf8", timeout: 10_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
  );
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), "ok");
});

test("V5 helper requires all three JavaScript-validated file hashes", () => {
  const execution = spawnSync(
    "python",
    ["-B", helperPath, contractPath, "source", "destination"],
    { cwd: root, encoding: "utf8", timeout: 10_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
  );
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /requires source, destination, and all three JavaScript-validated file hashes/);
});

test("V5 parent verification is zero-call and zero-write", { timeout: 650_000 }, async (t) => {
  const v3Receipt = path.join(
    runtimeRoot,
    "resume", "q003", "contrast-matrix-one-shot-answer",
    "verifier-recovery-completion-v3", "attempt-001", "completion-receipt.json",
  );
  if (!await exists(v3Receipt)) {
    t.skip("sealed V3 completion is unavailable");
    return;
  }
  const watched = [contractPath, parentV4Path, v3Receipt, publicationPath];
  const before = await Promise.all(watched.map(snapshot));
  const helperWsl = `/mnt/c/${helperPath.slice(3).replaceAll("\\", "/")}`;
  const contractWsl = `/mnt/c/${contractPath.slice(3).replaceAll("\\", "/")}`;
  const command = `cd /mnt/c/Users/villa/dev/skill-arena && exec uv run --offline --frozen '${helperWsl}' '${contractWsl}' --verify-parent`;
  const execution = spawnSync("wsl.exe", ["--exec", "bash", "-lc", command], { cwd: root, encoding: "utf8", timeout: 630_000 });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const result = JSON.parse(execution.stdout);
  assert.deepEqual(
    { ok: result.ok, mode: result.mode, harborCalls: result.harborCalls, modelCalls: result.modelCalls, verifierCalls: result.verifierCalls },
    { ok: true, mode: "verify-parent-v5", harborCalls: 0, modelCalls: 0, verifierCalls: 0 },
  );
  assert.equal(result.parentV4ContractFileSha256, parentV4Sha256);
  assert.deepEqual(await Promise.all(watched.map(snapshot)), before);
});
