import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(".");
const generationRoot = path.join(root, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const caseRoot = path.join(generationRoot, "external-resume");
const runtimeRoot = path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-003");
const generation001RuntimeRoot = path.join(root, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-001");
const protocolPath = path.join(generationRoot, "protocol.json");
const v4ContractPath = path.join(caseRoot, "post-agent-verification-v4-contract.json");
const v4LegacyResolverPath = path.join(generationRoot, "scripts", "evidence-resolution-post-agent-v4-legacy.js");
const v4ResolverPath = path.join(generationRoot, "scripts", "evidence-resolution-post-agent-v4.js");
const v4InspectorPath = path.join(generationRoot, "scripts", "publish-generation-003-v4.js");
const v4BasePublisherPath = path.join(generationRoot, "scripts", "publish-generation-003-post-agent-v4-legacy.js");
const v4PublisherPath = path.join(generationRoot, "scripts", "publish-generation-003-post-agent-v4.js");
const historicalPublisherPath = path.join(generationRoot, "scripts", "publish-generation-003.js");
const historicalResolverPath = path.join(generationRoot, "scripts", "evidence-resolution-post-agent.js");
const helperPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "publish_q003_verification_v4.py");
const helperLockPath = `${helperPath}.lock`;
const baselineWrapperPath = path.join(caseRoot, "run-generation-003-baseline-v4.sh");
const historicalBaselineWrapperPath = path.join(runtimeRoot, "prepared-v2", "run-q003-baseline-clean-pi.sh");
const v3LockPath = path.join(root, "skills", "harbor-resume-external-failures", "scripts", "complete_verifier_derivation_v3.py.lock");
const v3ReceiptPath = path.join(
  runtimeRoot,
  "resume", "q003", "contrast-matrix-one-shot-answer",
  "verifier-recovery-completion-v3", "attempt-001", "completion-receipt.json",
);
const remediationAttestationPath = path.join(
  runtimeRoot,
  "resume", "q003", "contrast-matrix-one-shot-answer-prepared-v3", "remediation-attestation.json",
);
const CROSS_BINDINGS = [
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

async function snapshotTree(target) {
  if (!await exists(target)) return null;
  const rootStat = await fs.lstat(target);
  if (rootStat.isFile()) return [{ path: ".", sha256: sha256(await fs.readFile(target)), type: "file" }];
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
        rows.push({ path: relative, sha256: sha256(await fs.readFile(absolute)), type: "file" });
      }
    }
  }
  await walk(target);
  return rows;
}

async function loadPrivateHarborReader() {
  let source = await fs.readFile(v4LegacyResolverPath, "utf8");
  source = source
    .replace('"./evidence-resolution.js"', JSON.stringify(pathToFileURL(path.join(generationRoot, "scripts", "evidence-resolution.js")).href))
    .replace('"../../scripts/prepare-meta-evolution.js"', JSON.stringify(pathToFileURL(path.join(generationRoot, "..", "scripts", "prepare-meta-evolution.js")).href));
  source += "\nexport { readHarborJson as __readHarborJson };\n";
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return module.__readHarborJson;
}

test("V4 is append-only and seals its complete local execution boundary", async () => {
  const [contract, basePublisher, resolver, inspector, publisher, helper, historicalPublisher, attestation] = await Promise.all([
    fs.readFile(v4ContractPath, "utf8").then(JSON.parse),
    fs.readFile(v4BasePublisherPath, "utf8"),
    fs.readFile(v4ResolverPath, "utf8"),
    fs.readFile(v4InspectorPath, "utf8"),
    fs.readFile(v4PublisherPath, "utf8"),
    fs.readFile(helperPath, "utf8"),
    fs.readFile(historicalPublisherPath),
    fs.readFile(remediationAttestationPath, "utf8").then(JSON.parse),
  ]);
  const historicalContracts = [
    ["post-agent-recovery-contract.json", "sha256:ee22424a465941f642548f7eb4020456585bf88cf3e67554452a45b1daa32c0e"],
    ["post-agent-derivation-v2-contract.json", "sha256:cfa6c96bcd2324d6f646f18c27c028c469bb7977518fcaf4c4eb651597e54d7f"],
    ["post-agent-derivation-v3-contract.json", "sha256:459515053e87fc63672d537f15c910f665b6501086dbb6c374f746c1909a90e7"],
  ];
  for (const [name, expected] of historicalContracts) {
    assert.equal(sha256(await fs.readFile(path.join(caseRoot, name))), expected, `${name} changed`);
  }
  assert.equal(sha256(await fs.readFile(historicalResolverPath)), "sha256:70b3215c0426ac113f7847ec256011d0067779b222d911076190df750809b38b");
  assert.equal(sha256(historicalPublisher), "sha256:2a6838cabec22affe0d64114cbff44c16524b33fbf7255cc0605a7f5b7108004");
  assert.equal(attestation.sealedInputs?.executableContract?.generationPublisher, "sha256:2a6838cabec22affe0d64114cbff44c16524b33fbf7255cc0605a7f5b7108004");

  assert.equal(contract.schemaVersion, 4);
  assert.deepEqual(contract.crossBindings, CROSS_BINDINGS);
  assert.equal(contract.normalization.length, 3);
  assert.equal(contract.sealedFiles.length, 9);
  assert.equal(contract.sharedFiles.length, 8);
  for (const row of [...contract.sealedFiles, ...contract.sharedFiles]) {
    assert.equal(sha256(await fs.readFile(path.resolve(caseRoot, row.path))), row.sha256, `stale V4 binding ${row.path}`);
  }
  assert.equal(await fs.readFile(helperLockPath, "utf8"), await fs.readFile(v3LockPath, "utf8"));
  assert.match(helper, /^# \/\/\/ script\r?\n# requires-python = ">=3\.12"/);
  assert.match(helper, /--verify-parent/);
  assert.match(helper, /rename_noreplace\(source, destination/);
  assert.match(helper, /Existing q003 V4 publication differs/);
  assert.match(helper, /q003 V4 cross-binding digest drifted/);
  assert.match(basePublisher, /from "\.\/publish-generation-003-v4\.js"/);
  assert.match(basePublisher, /resolveContrastPostAgentEffectiveEvidenceV4/);
  assert.doesNotMatch(basePublisher, /prepare-generation-003-post-agent/);
  assert.doesNotMatch(basePublisher, /from "\.\/publish-generation-003\.js"/);
  assert.doesNotMatch(inspector, /from "\.\/publish-generation-003\.js"/);
  assert.doesNotMatch(resolver, /evidence-resolution-post-agent-v3|publish-generation-003-post-agent-v3/);
  assert.doesNotMatch(publisher, /publish-generation-003-post-agent-v3/);
  assert.equal((await fs.readFile(v4LegacyResolverPath, "utf8")).match(/readHarborJson\(/g)?.length, 5);
  const [baselineWrapper, historicalBaselineWrapper] = await Promise.all([
    fs.readFile(baselineWrapperPath, "utf8"),
    fs.readFile(historicalBaselineWrapperPath, "utf8"),
  ]);
  assert.match(baselineWrapper, /publish-generation-003-post-agent-v4\.js[\s\S]*verify-resume/);
  assert.doesNotMatch(baselineWrapper, /publish-generation-003\.js" verify-resume/);
  const normalizedV4Wrapper = baselineWrapper.replace(
    /"\/mnt\/c\/Program Files\/nodejs\/node\.exe" \\\r?\n\s+'C:\\Users\\villa\\dev\\skill-arena\\evaluations\\knowledge-consult-evolution\\meta-evolution\\generation-003\\scripts\\publish-generation-003-post-agent-v4\.js' \\\r?\n\s+verify-resume \\\r?\n\s+--runtime 'C:\\Users\\villa\\dev\\skill-arena\\\.tmp\\knowledge-consult-evolution\\meta-evolution\\generation-003'/,
    'node "/mnt/c/Users/villa/dev/skill-arena/evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003.js" verify-resume --runtime "/mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003"',
  );
  assert.equal(normalizedV4Wrapper.replaceAll("\r\n", "\n"), historicalBaselineWrapper.replaceAll("\r\n", "\n"));
});

test("ordinary Harbor JSON accepts 60.0 but rejects unsafe files and numbers", async (t) => {
  const readHarborJson = await loadPrivateHarborReader();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-v4-harbor-json-"));
  try {
    const ordinary = path.join(temporary, "ordinary.json");
    await fs.writeFile(ordinary, '{"max_wait_sec":60.0}\n');
    assert.equal((await readHarborJson(temporary, ordinary, "ordinary Harbor fixture")).max_wait_sec, 60);
    assert.match(await fs.readFile(ordinary, "utf8"), /60\.0/);

    const invalid = path.join(temporary, "invalid.json");
    await fs.writeFile(invalid, '{"value":NaN}\n');
    await assert.rejects(readHarborJson(temporary, invalid, "invalid Harbor fixture"), /not valid ordinary Harbor JSON/);

    const unsafe = path.join(temporary, "unsafe.json");
    await fs.writeFile(unsafe, '{"value":9007199254740992}\n');
    await assert.rejects(readHarborJson(temporary, unsafe, "unsafe Harbor fixture"), /unsafe JSON number/);

    const outside = path.join(path.dirname(temporary), `${path.basename(temporary)}-outside.json`);
    await fs.writeFile(outside, "{}\n");
    try {
      await assert.rejects(readHarborJson(temporary, outside, "escaped Harbor fixture"), /escapes its declared root/);
    } finally {
      await fs.rm(outside, { force: true });
    }

    const hard = path.join(temporary, "hard.json");
    await fs.link(ordinary, hard);
    await assert.rejects(readHarborJson(temporary, hard, "hard-linked Harbor fixture"), /must not be hard linked/);

    const target = path.join(temporary, "symlink-target.json");
    const symbolic = path.join(temporary, "symbolic.json");
    await fs.writeFile(target, "{}\n");
    try {
      await fs.symlink(target, symbolic, "file");
      await assert.rejects(readHarborJson(temporary, symbolic, "symbolic Harbor fixture"), /cannot contain symbolic links/);
    } catch (error) {
      if (error.code !== "EPERM") throw error;
      t.diagnostic("Windows symlink privilege is unavailable; hard-link and escape checks still ran");
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("all eight V3/V4 cross-bindings fail closed independently", async (t) => {
  if (!await exists(v3ReceiptPath)) {
    t.skip("local sealed V3 receipt is unavailable");
    return;
  }
  const [{ verifyV4CrossBindings }, receipt] = await Promise.all([
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v4.js"),
    fs.readFile(v3ReceiptPath, "utf8").then(JSON.parse),
  ]);
  const projection = receipt.compatibilityProjection;
  const evidence = { provenance: Object.fromEntries(CROSS_BINDINGS.map((key) => [key, projection[key]])) };
  assert.deepEqual(Object.keys(verifyV4CrossBindings(projection, evidence)), CROSS_BINDINGS);
  for (const key of CROSS_BINDINGS) {
    const mutated = structuredClone(evidence);
    mutated.provenance[key] = `sha256:${"0".repeat(64)}`;
    assert.throws(() => verifyV4CrossBindings(projection, mutated), new RegExp(key));
  }
  const missing = structuredClone(projection);
  delete missing.recoveryLockSha256;
  assert.throws(() => verifyV4CrossBindings(missing, evidence), /compatibility projection keys drifted/);
  assert.throws(() => verifyV4CrossBindings({ ...projection, extra: "forbidden" }, evidence), /compatibility projection keys drifted/);
  const malformed = structuredClone(evidence);
  malformed.provenance.recoveryLockSha256 = "not-a-digest";
  assert.throws(() => verifyV4CrossBindings(projection, malformed), /recoveryLockSha256/);
});

test("the V4 inspector selects native and recovered shapes explicitly", async (t) => {
  if (!await exists(v3ReceiptPath)) {
    t.skip("local generation-003 artifacts are unavailable");
    return;
  }
  const [protocol, verifiedModule, inspectorModule, historicalModule, v3Receipt] = await Promise.all([
    fs.readFile(protocolPath, "utf8").then(JSON.parse),
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js"),
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003-v4.js"),
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003.js"),
    fs.readFile(v3ReceiptPath, "utf8").then(JSON.parse),
  ]);
  const knowledgeRoot = path.resolve(root, "..", "knowledge");
  const verified = await verifiedModule.verifyGeneration003({ outputRoot: runtimeRoot, protocolPath, generation001RuntimeRoot, knowledgeRoot });
  const common = {
    protocol,
    receipt: verified.receipt,
    runtimeRoot,
    preparedRoot: verifiedModule.analysisPreparedRoot(runtimeRoot),
    knowledgeRoot,
    generation001RuntimeRoot,
  };
  const projectionContract = inspectorModule.HARBOR_018_TRIAL_LOCK_DEFAULT_PROJECTION;
  const extractiveId = "extractive-one-shot-answer";
  const extractiveDirectory = path.join(runtimeRoot, "jobs", "q003", extractiveId, `knowledge-consult-meta-g003-q003-${extractiveId}`);
  await assert.rejects(
    historicalModule.inspectGeneration003Job({ ...common, candidateId: extractiveId, jobDirectory: extractiveDirectory }),
    /trial\/lock environment drift/,
  );
  const extractive = await inspectorModule.inspectGeneration003Job({
    ...common,
    candidateId: extractiveId,
    jobDirectory: extractiveDirectory,
    trialLockCompatibility: { contract: projectionContract, artifactShape: "native-trial-result" },
  });
  assert.equal(extractive.record.metrics.primary, 0.8152783198741896);
  assert.deepEqual(extractive.record.gates, {
    evidence_contract_gate: 1,
    mechanical_qualification_gate: 1,
    minimum_document_gate: 1,
  });
  const projection = v3Receipt.compatibilityProjection;
  const effectiveDirectory = projection.effectiveJobDirectory.replace(/^\/mnt\/c\//i, "C:/");
  const resumeProvenance = {
    resumeManifestFileSha256: projection.resumeManifestSha256,
    effectiveJobDigest: projection.effectiveJobDigest,
  };
  const contrast = await inspectorModule.inspectGeneration003Job({
    ...common,
    candidateId: "contrast-matrix-one-shot-answer",
    jobDirectory: effectiveDirectory,
    taskChecksum: extractive.record.provenance.taskChecksum,
    resumeProvenance,
    trialLockCompatibility: { contract: projectionContract, artifactShape: "effective-source-config" },
  });
  assert.equal(contrast.record.evaluable, true);
  assert.equal(contrast.record.metrics.primary, 0);
  await assert.rejects(
    inspectorModule.inspectGeneration003Job({
      ...common,
      candidateId: "contrast-matrix-one-shot-answer",
      jobDirectory: effectiveDirectory,
      resumeProvenance,
      trialLockCompatibility: { contract: projectionContract, artifactShape: "native-trial-result" },
    }),
    /native trial projection forbids resume provenance/,
  );
  await assert.rejects(
    inspectorModule.inspectGeneration003Job({
      ...common,
      candidateId: extractiveId,
      jobDirectory: extractiveDirectory,
      trialLockCompatibility: { contract: projectionContract, artifactShape: "native-trial-result", extra: true },
    }),
    /compatibility keys drift/,
  );
  assert.equal(sha256(await fs.readFile(historicalPublisherPath)), "sha256:2a6838cabec22affe0d64114cbff44c16524b33fbf7255cc0605a7f5b7108004");
});

test("the JavaScript V4 publication verifier rejects all nine public binding mutations", async () => {
  const [{ verifyQ003PublicationBindingsV4 }, publisher] = await Promise.all([
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003-post-agent-v4.js"),
    fs.readFile(v4PublisherPath, "utf8"),
  ]);
  assert.equal(
    publisher.match(/verifyQ003PublicationBindingsV4\(completion, publication\.publication\);/g)?.length,
    2,
    "staging and verify-q003 must both enforce the public bindings",
  );
  const digest = (character) => `sha256:${character.repeat(64)}`;
  const bindings = [
    ["recoveryLockSha256", "recoveryLockFileSha256", "1"],
    ["recoveryRecordDigest", "recoveryRecordDigest", "2"],
    ["recoveryResultSha256", "recoveryResultFileSha256", "3"],
    ["recoveryResultDigest", "recoveryResultDigest", "4"],
    ["effectiveJobDigest", "effectiveJobDigest", "5"],
    ["nativeRetryJobArtifactDigest", "nativeRetryJobArtifactDigest", "6"],
    ["recoveredJobArtifactDigest", "recoveredJobArtifactDigest", "7"],
    ["resumeManifestSha256", "manifestFileSha256", "8"],
  ];
  const completion = {
    provenance: {
      completion: { contractFileSha256: digest("a") },
      ...Object.fromEntries(bindings.map(([completionKey, , character]) => [completionKey, digest(character)])),
    },
  };
  const publication = {
    provenance: {
      postAgentVerificationContractFileSha256: digest("a"),
      contrastResume: Object.fromEntries(bindings.map(([completionKey, publicKey]) => [publicKey, completion.provenance[completionKey]])),
    },
  };

  assert.deepEqual(verifyQ003PublicationBindingsV4(completion, publication), {
    postAgentVerificationContractFileSha256: digest("a"),
    contrastResume: Object.fromEntries(bindings.map(([completionKey]) => [completionKey, completion.provenance[completionKey]])),
  });

  const forgedContract = structuredClone(publication);
  forgedContract.provenance.postAgentVerificationContractFileSha256 = digest("0");
  assert.throws(
    () => verifyQ003PublicationBindingsV4(completion, forgedContract),
    /public contract binding drifted/,
  );
  for (const [completionKey, publicKey] of bindings) {
    const forged = structuredClone(publication);
    forged.provenance.contrastResume[publicKey] = digest("0");
    assert.throws(
      () => verifyQ003PublicationBindingsV4(completion, forged),
      new RegExp(`public cross-binding ${completionKey} drifted`),
    );
  }
});

test("the Python V4 commit validator recomputes receipt and public cross-bindings", async () => {
  const harness = String.raw`
import copy, importlib.util, json, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location("q003_v4_helper_test", pathlib.Path(sys.argv[1]))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
tmp = tempfile.TemporaryDirectory(); root = pathlib.Path(tmp.name)
try:
    contract_file = root / "contract.json"; contract_file.write_text("{}\n", encoding="utf-8")
    digest = lambda char: "sha256:" + char * 64
    parent = {"contractSha256": digest("a"), "receiptSha256": digest("b"), "completionRecordDigest": digest("c")}
    contract = {"path": contract_file, "sha256": m.digest_file(contract_file), "body": {"parentV3": parent, "normalization": m.NORMALIZATION}}
    projection = {
        "effectiveJobDigest": digest("1"), "effectiveJobDirectory": "/tmp/effective",
        "nativeRetryJobArtifactDigest": digest("2"), "recoveredJobArtifactDigest": digest("3"),
        "recoveryLockSha256": digest("4"), "recoveryOutputDirectory": "/tmp/recovery",
        "recoveryRecordDigest": digest("5"), "recoveryResultDigest": digest("6"),
        "recoveryResultSha256": digest("7"), "resumeManifestSha256": digest("8"),
        "schemaCompatibility": {"effectiveManifest": 2, "recoveryLock": 1, "recoveryResult": 1},
    }
    parent_receipt = {"compatibilityProjection": projection}
    public = {
        "recoveryLockSha256": "recoveryLockFileSha256", "recoveryRecordDigest": "recoveryRecordDigest",
        "recoveryResultSha256": "recoveryResultFileSha256", "recoveryResultDigest": "recoveryResultDigest",
        "effectiveJobDigest": "effectiveJobDigest", "nativeRetryJobArtifactDigest": "nativeRetryJobArtifactDigest",
        "recoveredJobArtifactDigest": "recoveredJobArtifactDigest", "resumeManifestSha256": "manifestFileSha256",
    }
    source = root / "publication"; source.mkdir()
    def build():
        (source / "report.md").write_text("report\n", encoding="utf-8")
        result_body = {"schemaVersion": 1, "provenance": {
            "postAgentVerificationContractFileSha256": contract["sha256"],
            "contrastResume": {public[key]: projection[key] for key in m.CROSS_BINDINGS},
        }}
        result = {**result_body, "publicationSha256": m.object_digest(result_body)}
        (source / "result.json").write_bytes(m.canonical_pretty(result))
        cross = {key: projection[key] for key in m.CROSS_BINDINGS}
        receipt_body = {
            "schemaVersion": 4, "kind": m.RECEIPT_KIND, "verificationMode": "sealed-publication-receipt",
            "publicationSha256": result["publicationSha256"], "publicationDirectory": "publications/q003",
            "publicationResultFileSha256": m.digest_file(source / "result.json"),
            "publicationReportFileSha256": m.digest_file(source / "report.md"),
            "completionMode": m.COMPLETION_MODE,
            "completion": {
                "contract": m.CONTRACT_ID, "contractFileSha256": contract["sha256"],
                "parentV3ContractSha256": parent["contractSha256"], "parentV3ReceiptFileSha256": parent["receiptSha256"],
                "parentV3CompletionRecordDigest": parent["completionRecordDigest"],
                "parserBoundary": "native-manifest-bound-ordinary-json+python-codepoint-order/recovery-python-score-json-v4",
                "normalization": m.NORMALIZATION, "crossBindingDigest": m.compact_digest(cross),
                "execution": {"harbor": 0, "model": 0, "verifier": 0},
            },
            "aggregateRecoveryCalls": {"harbor": 0, "model": 0, "verifier": 2},
        }
        receipt = {**receipt_body, "receiptSha256": m.object_digest(receipt_body)}
        (source / "verification-v4-receipt.json").write_bytes(m.canonical_pretty(receipt))
    def reseal_result_and_receipt(result):
        body = copy.deepcopy(result); body.pop("publicationSha256", None); result["publicationSha256"] = m.object_digest(body)
        (source / "result.json").write_bytes(m.canonical_pretty(result))
        receipt = json.loads((source / "verification-v4-receipt.json").read_text())
        receipt["publicationSha256"] = result["publicationSha256"]
        receipt["publicationResultFileSha256"] = m.digest_file(source / "result.json")
        receipt.pop("receiptSha256", None); receipt["receiptSha256"] = m.object_digest(receipt)
        (source / "verification-v4-receipt.json").write_bytes(m.canonical_pretty(receipt))
    build(); m.verify_publication_receipt(contract, source, parent_receipt)
    receipt = json.loads((source / "verification-v4-receipt.json").read_text())
    receipt["completion"]["crossBindingDigest"] = digest("f")
    receipt.pop("receiptSha256"); receipt["receiptSha256"] = m.object_digest(receipt)
    (source / "verification-v4-receipt.json").write_bytes(m.canonical_pretty(receipt))
    try: m.verify_publication_receipt(contract, source, parent_receipt)
    except ValueError as error: assert "cross-binding digest" in str(error)
    else: raise AssertionError("accepted a forged cross-binding digest")
    for projection_key, public_key in public.items():
        build(); result = json.loads((source / "result.json").read_text())
        result["provenance"]["contrastResume"][public_key] = digest("0")
        reseal_result_and_receipt(result)
        try: m.verify_publication_receipt(contract, source, parent_receipt)
        except ValueError as error: assert projection_key in str(error)
        else: raise AssertionError(f"accepted forged public binding {projection_key}")
    build(); result = json.loads((source / "result.json").read_text())
    result["provenance"]["postAgentVerificationContractFileSha256"] = digest("0")
    reseal_result_and_receipt(result)
    try: m.verify_publication_receipt(contract, source, parent_receipt)
    except ValueError as error: assert "public contract binding" in str(error)
    else: raise AssertionError("accepted a forged public contract binding")
    left = root / "left"; right = root / "right"; left.mkdir(); right.mkdir()
    for name in m.PUBLICATION_FILES:
        (left / name).write_bytes((source / name).read_bytes()); (right / name).write_bytes((source / name).read_bytes())
    assert m.publications_equal(left, right)
    (right / "report.md").write_text("different\n", encoding="utf-8")
    assert not m.publications_equal(left, right)
    print("ok")
finally:
    tmp.cleanup()
`;
  const execution = spawnSync("python", ["-c", harness, helperPath], { cwd: root, encoding: "utf8", timeout: 60_000 });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), "ok");
});

test("full V4 evidence verification performs zero calls and zero writes", { timeout: 360_000 }, async (t) => {
  if (!await exists(v3ReceiptPath)) {
    t.skip("local sealed V3 completion is unavailable");
    return;
  }
  const watched = [
    path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer", "verifier-recovery-completion", ".attempt-001.owner.json"),
    path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer", "verifier-recovery-completion", ".attempt-001.build"),
    path.dirname(v3ReceiptPath),
    path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer", "verifier-recovery", "attempt-001"),
    path.join(runtimeRoot, "resume", "q003", "contrast-matrix-one-shot-answer", "effective-jobs"),
    path.join(runtimeRoot, "publications", "q003"),
  ];
  const before = await Promise.all(watched.map(snapshotTree));
  const [{ resolveContrastPostAgentEffectiveEvidenceV4 }, protocol] = await Promise.all([
    import("../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent-v4.js"),
    fs.readFile(protocolPath, "utf8").then(JSON.parse),
  ]);
  const evidence = await resolveContrastPostAgentEffectiveEvidenceV4({ protocol, runtimeRoot });
  assert.equal(evidence.selection.completionMode, "verifier-only-recovery-derivation-v4-js-parity");
  assert.deepEqual(evidence.provenance.recoveryCalls, { harbor: 0, model: 0, verifier: 2 });
  assert.deepEqual(evidence.provenance.completion.execution, { harbor: 0, model: 0, verifier: 0 });
  assert.equal(evidence.provenance.completion.parentV3CompletionRecordDigest, "sha256:2f544570a49fdddbdd4d238cbe9b751344ce8138f942b0aabfe3a69efc0f1580");
  assert.equal(evidence.provenance.completion.contractFileSha256, sha256(await fs.readFile(v4ContractPath)));
  assert.deepEqual(await Promise.all(watched.map(snapshotTree)), before);
  assert.equal(sha256(await fs.readFile(historicalPublisherPath)), "sha256:2a6838cabec22affe0d64114cbff44c16524b33fbf7255cc0605a7f5b7108004");
});
