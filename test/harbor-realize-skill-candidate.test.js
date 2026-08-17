import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-realize-skill-candidate",
  "scripts",
  "realize_skill_candidate.py",
);
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const pythonAvailable = spawnSync(python, ["--version"], { encoding: "utf8" }).status === 0;

function digestBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

async function fileDigest(filePath) {
  return digestBytes(await fs.readFile(filePath));
}

async function treeRecord(root) {
  const entries = [];
  async function visit(directory) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    children.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      const relative = path.relative(root, childPath).split(path.sep).join("/");
      const metadata = await fs.lstat(childPath);
      if (metadata.isSymbolicLink()) throw new Error(`unsafe fixture link: ${childPath}`);
      if (metadata.isDirectory()) {
        entries.push({ relative, kind: "directory", childPath });
        await visit(childPath);
      } else if (metadata.isFile()) {
        entries.push({ relative, kind: "file", childPath });
      } else {
        throw new Error(`unsupported fixture node: ${childPath}`);
      }
    }
  }
  await visit(root);
  entries.sort((left, right) => {
    const byPath = Buffer.compare(Buffer.from(left.relative), Buffer.from(right.relative));
    return byPath || left.kind.localeCompare(right.kind);
  });
  const hash = crypto.createHash("sha256");
  let fileCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.kind === "directory") {
      hash.update(Buffer.from("D\0"));
      hash.update(Buffer.from(entry.relative));
      hash.update(Buffer.from("\0"));
      directoryCount += 1;
    } else {
      const bytes = await fs.readFile(entry.childPath);
      hash.update(Buffer.from("F\0"));
      hash.update(Buffer.from(entry.relative));
      hash.update(Buffer.from("\0"));
      hash.update(bytes);
      hash.update(Buffer.from("\0"));
      fileCount += 1;
      totalBytes += bytes.length;
    }
  }
  return {
    treeSha256: `sha256:${hash.digest("hex")}`,
    fileCount,
    directoryCount,
    totalBytes,
  };
}

function run(args) {
  return spawnSync(python, [script, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
}

function succeeded(completed) {
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  return JSON.parse(completed.stdout);
}

function failed(completed, pattern) {
  assert.notEqual(completed.status, 0, completed.stdout);
  assert.match(completed.stderr, pattern);
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixture({ validationExit = 0, validationWrites = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-realizer-"));
  const parent = path.join(root, "parent-alias");
  const scripts = path.join(parent, "scripts");
  const evidenceDirectory = path.join(root, "development-evidence");
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(evidenceDirectory, { recursive: true });
  const skillSource = [
    "---",
    "name: demo-skill",
    "description: Deterministic realizer test skill.",
    "---",
    "",
    "# Demo Skill",
    "",
    "Preserve this baseline instruction.",
    "",
  ].join("\n");
  await fs.writeFile(path.join(parent, "SKILL.md"), skillSource, "utf8");
  const validationSource = [
    'import fs from "node:fs";',
    'if (!fs.existsSync("SKILL.md")) process.exit(9);',
    validationWrites ? 'fs.writeFileSync("validation-only.tmp", "disposable");' : "",
    `process.exit(${validationExit});`,
    "",
  ].join("\n");
  await fs.writeFile(path.join(scripts, "validate.mjs"), validationSource, "utf8");
  const evidencePath = path.join(evidenceDirectory, "reflection.json");
  await fs.writeFile(evidencePath, '{"lesson":"tighten the contract"}\n', "utf8");
  const parentTree = await treeRecord(parent);
  const workspace = path.join(root, "workspace");
  const output = path.join(root, "sealed");
  const configPath = path.join(root, "realization.json");
  const config = {
    schemaVersion: 1,
    realization: {
      id: "generation-001-child-a",
      candidateId: "child-a",
      parentSkill: "parent-alias",
      expectedParentTreeSha256: parentTree.treeSha256,
      workspaceDir: "workspace",
      outputDir: "sealed",
      operator: {
        operatorId: "tighten-contract",
        instruction: "Tighten observable output requirements without adding benchmark facts.",
        origin: "operator-coevolution",
        parentOperatorIds: [],
      },
      allowedChanges: ["SKILL.md", "scripts/**", "references/**"],
      developmentEvidence: [
        {
          id: "reflection-plan",
          role: "development",
          path: "development-evidence/reflection.json",
          sha256: await fileDigest(evidencePath),
        },
      ],
      trustedValidationCommands: true,
      validationCommands: [
        {
          id: "candidate-check",
          argv: [process.execPath, "scripts/validate.mjs"],
          timeoutSeconds: 10,
        },
      ],
    },
  };
  await writeJson(configPath, config);
  return {
    root,
    parent,
    parentTree,
    skillSource,
    evidencePath,
    workspace,
    output,
    configPath,
    config,
    candidate: path.join(workspace, "candidate", "skills", "demo-skill"),
  };
}

async function changeCandidate(fixture, suffix = "Require one exact terminal result.\n") {
  const skillPath = path.join(fixture.candidate, "SKILL.md");
  await fs.appendFile(skillPath, `\n${suffix}`, "utf8");
}

test("digest, prepare, seal, and verify produce deterministic provenance without mutating sealed bytes", {
  skip: !pythonAvailable,
}, async () => {
  const fixture = await createFixture();
  try {
    const digest = succeeded(run(["digest", fixture.parent]));
    assert.deepEqual(digest, {
      logicalName: "demo-skill",
      treeSha256: fixture.parentTree.treeSha256,
      fileCount: fixture.parentTree.fileCount,
      directoryCount: fixture.parentTree.directoryCount,
      totalBytes: fixture.parentTree.totalBytes,
    });

    const prepared = succeeded(run(["prepare", fixture.configPath]));
    assert.equal(prepared.mode, "prepared");
    assert.equal(prepared.logicalName, "demo-skill");
    assert.equal((succeeded(run(["prepare", fixture.configPath]))).mode, "existing");
    await changeCandidate(fixture);

    const sealed = succeeded(run(["seal", fixture.configPath]));
    assert.equal(sealed.mode, "sealed");
    assert.equal(sealed.parentTreeSha256, fixture.parentTree.treeSha256);
    assert.notEqual(sealed.candidateTreeSha256, fixture.parentTree.treeSha256);
    assert.equal((succeeded(run(["verify", fixture.configPath]))).mode, "verified");

    assert.equal(await fs.readFile(path.join(fixture.parent, "SKILL.md"), "utf8"), fixture.skillSource);
    await assert.rejects(fs.stat(path.join(fixture.candidate, "validation-only.tmp")), /ENOENT/);
    await assert.rejects(
      fs.stat(path.join(fixture.output, "candidate", "skills", "demo-skill", "validation-only.tmp")),
      /ENOENT/,
    );

    const validation = JSON.parse(await fs.readFile(path.join(fixture.output, "validation.json"), "utf8"));
    assert.equal(validation.environmentPolicy, "sanitized-validation-v1");
    assert.equal(validation.trustedValidationCommands, true);
    assert.equal(validation.validationSandboxed, false);
    assert.equal(validation.boundaries.rawCommandOutputPersisted, false);
    assert.equal(validation.boundaries.semanticDevelopmentEvidenceVerified, false);
    assert.equal(validation.boundaries.timestampsOrDurationsPersisted, false);
    assert.equal(validation.boundaries.coreHarborCalls, 0);
    assert.equal(validation.boundaries.coreModelCalls, 0);
    assert.equal(validation.boundaries.validationHarborCallsVerified, false);
    assert.equal(validation.boundaries.validationModelCallsVerified, false);
    assert.equal(validation.boundaries.validationHoldoutAccessVerified, false);
    assert.equal(validation.boundaries.validationExternalEffectsVerified, false);
    assert.deepEqual(validation.commands, [
      {
        id: "candidate-check",
        argv: [process.execPath, "scripts/validate.mjs"],
        timeoutSeconds: 10,
        exitCode: 0,
        status: "passed",
      },
    ]);
    const manifest = JSON.parse(
      await fs.readFile(path.join(fixture.output, "candidate-manifest.json"), "utf8"),
    );
    assert.equal(manifest.state, "realized-evaluation-status-unverified");
    assert.equal(manifest.boundaries.coreHarborEvaluationPerformed, false);
    assert.equal(manifest.boundaries.validationHarborEvaluationVerified, false);
    const realization = JSON.parse(
      await fs.readFile(path.join(fixture.output, "operator-realization.json"), "utf8"),
    );
    assert.equal(realization.state, "realized-fitness-status-unverified");
    assert.equal(realization.boundaries.coreHarborCalls, 0);
    assert.equal(realization.boundaries.validationHarborCallsVerified, false);

    const before = await treeRecord(fixture.output);
    failed(run(["seal", fixture.configPath]), /refusing to replace existing sealed output/i);
    assert.deepEqual(await treeRecord(fixture.output), before);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("seal rejects source drift, skill-name drift, and out-of-scope edits before publication", {
  skip: !pythonAvailable,
}, async () => {
  const sourceDrift = await createFixture();
  const nameDrift = await createFixture();
  const scopeDrift = await createFixture();
  try {
    succeeded(run(["prepare", sourceDrift.configPath]));
    await changeCandidate(sourceDrift);
    await fs.appendFile(path.join(sourceDrift.parent, "SKILL.md"), "\nsource drift\n", "utf8");
    failed(run(["seal", sourceDrift.configPath]), /parent skill digest/i);
    await assert.rejects(fs.stat(sourceDrift.output), /ENOENT/);

    succeeded(run(["prepare", nameDrift.configPath]));
    const skillPath = path.join(nameDrift.candidate, "SKILL.md");
    const source = await fs.readFile(skillPath, "utf8");
    await fs.writeFile(skillPath, source.replace("name: demo-skill", "name: renamed-skill"), "utf8");
    failed(run(["seal", nameDrift.configPath]), /name drifted/i);
    await assert.rejects(fs.stat(nameDrift.output), /ENOENT/);

    succeeded(run(["prepare", scopeDrift.configPath]));
    await changeCandidate(scopeDrift);
    await fs.mkdir(path.join(scopeDrift.candidate, "assets"));
    await fs.writeFile(path.join(scopeDrift.candidate, "assets", "extra.txt"), "not allowed", "utf8");
    failed(run(["seal", scopeDrift.configPath]), /outside allowedChanges/i);
    await assert.rejects(fs.stat(scopeDrift.output), /ENOENT/);
  } finally {
    await Promise.all(
      [sourceDrift, nameDrift, scopeDrift].map((fixture) =>
        fs.rm(fixture.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("config rejects path escape, untrusted validation, and obvious holdout evidence", {
  skip: !pythonAvailable,
}, async () => {
  const escapeFixture = await createFixture();
  const trustFixture = await createFixture();
  const holdoutFixture = await createFixture();
  try {
    escapeFixture.config.realization.allowedChanges = ["../escape"];
    await writeJson(escapeFixture.configPath, escapeFixture.config);
    failed(run(["prepare", escapeFixture.configPath]), /invalid path segment/i);
    await assert.rejects(fs.stat(escapeFixture.workspace), /ENOENT/);

    trustFixture.config.realization.trustedValidationCommands = false;
    await writeJson(trustFixture.configPath, trustFixture.config);
    failed(run(["prepare", trustFixture.configPath]), /trustedValidationCommands must be true/i);

    const holdoutDirectory = path.join(holdoutFixture.root, "holdout");
    await fs.mkdir(holdoutDirectory);
    const holdoutPath = path.join(holdoutDirectory, "evidence.json");
    await fs.writeFile(holdoutPath, "{}\n", "utf8");
    holdoutFixture.config.realization.developmentEvidence[0] = {
      id: "forbidden-evidence",
      role: "development",
      path: "holdout/evidence.json",
      sha256: await fileDigest(holdoutPath),
    };
    await writeJson(holdoutFixture.configPath, holdoutFixture.config);
    failed(run(["prepare", holdoutFixture.configPath]), /obvious holdout or hard component/i);
  } finally {
    await Promise.all(
      [escapeFixture, trustFixture, holdoutFixture].map((fixture) =>
        fs.rm(fixture.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("config parsing rejects duplicate keys and non-finite numbers", {
  skip: !pythonAvailable,
}, async () => {
  const duplicateFixture = await createFixture();
  const nonFiniteFixture = await createFixture();
  try {
    const duplicateSource = await fs.readFile(duplicateFixture.configPath, "utf8");
    await fs.writeFile(
      duplicateFixture.configPath,
      duplicateSource.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
      "utf8",
    );
    failed(run(["prepare", duplicateFixture.configPath]), /duplicate key is forbidden: schemaVersion/i);

    const nonFiniteSource = await fs.readFile(nonFiniteFixture.configPath, "utf8");
    await fs.writeFile(
      nonFiniteFixture.configPath,
      nonFiniteSource.replace('"timeoutSeconds": 10', '"timeoutSeconds": NaN'),
      "utf8",
    );
    failed(run(["prepare", nonFiniteFixture.configPath]), /non-finite number is forbidden: NaN/i);
  } finally {
    await Promise.all(
      [duplicateFixture, nonFiniteFixture].map((fixture) =>
        fs.rm(fixture.root, { recursive: true, force: true }),
      ),
    );
  }
});

test("digest and seal reject nested symbolic links or reparse points", {
  skip: !pythonAvailable,
}, async (t) => {
  const fixture = await createFixture();
  try {
    const outside = path.join(fixture.root, "outside");
    await fs.mkdir(outside);
    const link = path.join(fixture.parent, "linked-directory");
    try {
      await fs.symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlink or junction creation unavailable: ${error.message}`);
      return;
    }
    failed(run(["digest", fixture.parent]), /symbolic link, junction, or reparse point/i);
    await fs.rm(link, { force: true });

    fixture.config.realization.expectedParentTreeSha256 = (await treeRecord(fixture.parent)).treeSha256;
    await writeJson(fixture.configPath, fixture.config);
    succeeded(run(["prepare", fixture.configPath]));
    await changeCandidate(fixture);
    const candidateLink = path.join(fixture.candidate, "references", "linked-directory");
    await fs.mkdir(path.dirname(candidateLink), { recursive: true });
    await fs.symlink(outside, candidateLink, process.platform === "win32" ? "junction" : "dir");
    failed(run(["seal", fixture.configPath]), /symbolic link, junction, or reparse point/i);
    await assert.rejects(fs.stat(fixture.output), /ENOENT/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("failed validation publishes nothing", { skip: !pythonAvailable }, async () => {
  const fixture = await createFixture({ validationExit: 7, validationWrites: false });
  try {
    succeeded(run(["prepare", fixture.configPath]));
    await changeCandidate(fixture);
    failed(run(["seal", fixture.configPath]), /candidate-check failed with exit code 7/i);
    await assert.rejects(fs.stat(fixture.output), /ENOENT/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("verify fails closed after candidate or receipt tampering", {
  skip: !pythonAvailable,
}, async () => {
  const candidateTamper = await createFixture({ validationWrites: false });
  const receiptTamper = await createFixture({ validationWrites: false });
  try {
    for (const fixture of [candidateTamper, receiptTamper]) {
      succeeded(run(["prepare", fixture.configPath]));
      await changeCandidate(fixture);
      succeeded(run(["seal", fixture.configPath]));
    }
    await fs.appendFile(
      path.join(candidateTamper.output, "candidate", "skills", "demo-skill", "SKILL.md"),
      "\ntampered\n",
      "utf8",
    );
    failed(run(["verify", candidateTamper.configPath]), /validation\.json was modified|manifest/i);

    const realizationPath = path.join(receiptTamper.output, "operator-realization.json");
    const realization = JSON.parse(await fs.readFile(realizationPath, "utf8"));
    realization.state = "promoted";
    await writeJson(realizationPath, realization);
    failed(run(["verify", receiptTamper.configPath]), /operator-realization\.json was modified/i);
  } finally {
    await Promise.all(
      [candidateTamper, receiptTamper].map((fixture) =>
        fs.rm(fixture.root, { recursive: true, force: true }),
      ),
    );
  }
});
