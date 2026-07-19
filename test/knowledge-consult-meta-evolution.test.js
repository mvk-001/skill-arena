import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  canonicalJson,
  frozenProfileFromSource,
  objectDigest,
  prepareExperiment,
  treeDigest,
  verifyExperiment,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";
import {
  evaluateStopGate,
  publishQ003,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/publish-meta-evolution.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TRACKED_PROTOCOL = JSON.parse(await fs.readFile(
  path.join(REPO_ROOT, "evaluations/knowledge-consult-evolution/meta-evolution/protocol.json"),
  "utf8",
));
const temporaryRoots = [];

async function write(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

function relativePosix(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

async function makeSkill(root, marker) {
  await write(path.join(root, "SKILL.md"), `---\nname: consult-semantic-okf\ndescription: Synthetic fixture ${marker}.\n---\n\n# Fixture\n\n${marker}\n`);
  await write(path.join(root, "scripts", "tool.py"), `MARKER = ${JSON.stringify(marker)}\n`);
}

async function makeFixture({ duplicateChildren = false } = {}) {
  const tmpBase = path.join(REPO_ROOT, ".tmp");
  await fs.mkdir(tmpBase, { recursive: true });
  const root = await fs.mkdtemp(path.join(tmpBase, "meta-evolution-test-"));
  temporaryRoots.push(root);
  const knowledgeRoot = path.join(root, "knowledge");
  const baselineRoot = path.join(knowledgeRoot, "skills", "consult-semantic-okf");
  await makeSkill(baselineRoot, "baseline");
  await write(path.join(knowledgeRoot, "bundle", "semantic", "records.jsonl"), "{}\n");
  git(knowledgeRoot, ["init", "--quiet"]);
  git(knowledgeRoot, ["config", "user.name", "Fixture"]);
  git(knowledgeRoot, ["config", "user.email", "fixture@example.invalid"]);
  git(knowledgeRoot, ["add", "."]);
  git(knowledgeRoot, ["commit", "--quiet", "-m", "fixture"]);
  const commit = git(knowledgeRoot, ["rev-parse", "HEAD"]);

  const preparedStudyRoot = path.join(root, "study-prepared");
  for (const directory of ["environment", "solution", "tests"]) {
    await fs.mkdir(
      path.join(preparedStudyRoot, "tasks", "discovery", "q003", directory),
      { recursive: true },
    );
  }
  await write(path.join(preparedStudyRoot, "tasks", "discovery", "q003", "instruction.md"), "public q003 fixture\n");
  await write(path.join(preparedStudyRoot, "tasks", "discovery", "q003", "task.toml"), "version = '1'\n");
  await write(path.join(preparedStudyRoot, "tasks", "discovery", "q007", "DO-NOT-READ.txt"), "Q007_PRIVATE_CANARY_71c1\n");
  await write(path.join(preparedStudyRoot, "tasks", "holdout", "q005", "DO-NOT-READ.txt"), "HOLDOUT_PRIVATE_CANARY_862c\n");

  const metaRoot = path.join(root, "meta");
  const children = ["bounded-verified-breadth", "state-machine-verified-breadth"];
  const baselineDigest = await treeDigest(baselineRoot);
  const candidateData = [];
  for (const [index, candidateId] of children.entries()) {
    const candidateRoot = path.join(metaRoot, "generation-001", "candidates", candidateId);
    const skillRoot = path.join(candidateRoot, "consult-semantic-okf");
    await makeSkill(skillRoot, duplicateChildren ? "same-child" : `child-${index}`);
    const digest = await treeDigest(skillRoot);
    const manifest = {
      schemaVersion: 1,
      generationId: "generation-001",
      candidateId,
      operatorId: TRACKED_PROTOCOL.operator.operatorId,
      parentCandidateId: "00-baseline",
      parentTreeSha256: baselineDigest.sha256,
      parentSourceCommit: commit,
      skill: {
        name: "consult-semantic-okf",
        basename: "consult-semantic-okf",
        treeSha256: digest.sha256,
      },
    };
    const realization = {
      schemaVersion: 1,
      generationId: "generation-001",
      candidateId,
      operatorId: TRACKED_PROTOCOL.operator.operatorId,
      parentCandidateId: "00-baseline",
      candidateTreeSha256: digest.sha256,
      parentCandidates: [{
        candidateId: "00-baseline",
        treeSha256: baselineDigest.sha256,
        sourceCommit: commit,
      }],
    };
    await write(path.join(candidateRoot, "candidate-manifest.json"), canonicalJson(manifest));
    await write(path.join(candidateRoot, "operator-realization.json"), canonicalJson(realization));
    candidateData.push({ candidateId, candidateRoot, skillRoot, digest });
  }

  const profile = structuredClone(TRACKED_PROTOCOL.frozenEvaluationProfile);
  const sourceProtocol = {
    sourceFreeze: {
      repository: { commit },
      dataset: {
        baselineSkillPath: "skills/consult-semantic-okf",
        referenceBundlePath: "bundle",
      },
    },
    evaluationProfile: profile,
  };
  const sourceProtocolPath = path.join(root, "source-protocol.json");
  await write(sourceProtocolPath, canonicalJson(sourceProtocol));
  const q003Digest = await treeDigest(path.join(preparedStudyRoot, "tasks", "discovery", "q003"));
  const protocol = structuredClone(TRACKED_PROTOCOL);
  protocol.knowledge.commit = commit;
  protocol.knowledge.baselineSkillPath = "skills/consult-semantic-okf";
  protocol.knowledge.referenceBundlePath = "bundle";
  protocol.target.baseline.expectedTreeSha256 = baselineDigest.sha256;
  protocol.preparationTask.expectedTreeSha256 = q003Digest.sha256;
  protocol.frozenEvaluationProfile = profile;
  protocol.frozenEvaluationProfileSha256 = objectDigest(frozenProfileFromSource(sourceProtocol));
  for (const [index, child] of protocol.target.children.entries()) {
    const fixture = candidateData[index];
    child.sourcePath = relativePosix(fixture.skillRoot);
    child.manifestPath = relativePosix(path.join(fixture.candidateRoot, "candidate-manifest.json"));
    child.operatorRealizationPath = relativePosix(path.join(fixture.candidateRoot, "operator-realization.json"));
    child.expectedTreeSha256 = fixture.digest.sha256;
  }
  const protocolPath = path.join(metaRoot, "protocol.json");
  await write(protocolPath, canonicalJson(protocol));
  return {
    root,
    metaRoot,
    knowledgeRoot,
    preparedStudyRoot,
    protocol,
    protocolPath,
    sourceProtocolPath,
    runtimeRoot: path.join(root, "runtime"),
  };
}

async function prepareFixture(fixture) {
  return prepareExperiment({
    repoRoot: REPO_ROOT,
    metaRoot: fixture.metaRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
    outputRoot: fixture.runtimeRoot,
  });
}

async function createSyntheticJobs(fixture) {
  const allCandidates = [fixture.protocol.target.baseline, ...fixture.protocol.target.children];
  for (const [index, candidate] of allCandidates.entries()) {
    const configPath = path.join(
      fixture.runtimeRoot,
      "prepared",
      "configs",
      "harbor",
      "q003",
      `${candidate.candidateId}.yaml`,
    );
    const config = parseYaml(await fs.readFile(configPath, "utf8"));
    const jobDirectory = path.join(
      fixture.runtimeRoot,
      "jobs",
      "q003",
      candidate.candidateId,
      config.job_name,
    );
    const trialName = `q003__fixture_${index}`;
    const skillDigest = `sha256:${String(index + 1).repeat(64).slice(0, 64)}`;
    await write(path.join(jobDirectory, "config.json"), canonicalJson(config));
    await write(path.join(jobDirectory, "lock.json"), canonicalJson({
      harbor: { version: fixture.protocol.frozenEvaluationProfile.harborVersion },
      retry: { max_retries: 0 },
      trials: [{
        task: { name: "q003", digest: "sha256:shared-task" },
        agent: config.agents[0],
        skills: [{
          name: "consult-semantic-okf",
          source: config.agents[0].skills[0],
          digest: skillDigest,
        }],
      }],
    }));
    await write(path.join(jobDirectory, "result.json"), canonicalJson({
      finished_at: "2026-07-18T00:00:00Z",
      n_total_trials: 1,
      stats: { n_retries: 0 },
    }));
    const reward = index === 0 ? 0.25 : index === 1 ? 0.75 : 0.5;
    await write(path.join(jobDirectory, trialName, "result.json"), canonicalJson({
      task_name: "fixture/q003",
      trial_name: trialName,
      task_checksum: "shared-q003-checksum",
      config: {
        trial_name: trialName,
        task: { path: `${config.datasets[0].path}/q003` },
        agent: config.agents[0],
      },
      agent_info: {
        name: "pi",
        version: "0.73.1",
        model_info: { provider: "openai-codex", name: "gpt-5.3-codex-spark" },
      },
      agent_result: {
        n_input_tokens: 100 + index,
        n_cache_tokens: 20 + index,
        n_output_tokens: 10 + index,
        reasoning: "PRIVATE_REASONING_CANARY_4e93",
      },
      verifier_result: {
        rewards: {
          reward,
          evidence_contract_gate: 1,
          minimum_document_gate: 1,
          mechanical_qualification_gate: 1,
          qrel_identity: "PRIVATE_QREL_CANARY_98f2",
        },
        answer: "PRIVATE_ANSWER_CANARY_b91d",
      },
      exception_info: null,
      finished_at: "2026-07-18T00:00:00Z",
    }));
    await write(
      path.join(jobDirectory, trialName, "verifier", "private", "diagnostics.json"),
      canonicalJson({ private_diagnostic: "PRIVATE_DIAGNOSTIC_CANARY_3a17" }),
    );
  }
}

function qualified(taskId, candidateId, primary) {
  return { taskId, candidateId, evaluable: true, qualified: true, metrics: { primary } };
}

test.after(async () => {
  for (const root of temporaryRoots) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("prepare copies only q003, seals three distinct canonical bundles, and is byte-idempotent", async () => {
  const fixture = await makeFixture();
  const first = await prepareFixture(fixture);
  const copiedEnvironment = await fs.stat(path.join(
    fixture.runtimeRoot,
    "prepared",
    "tasks",
    "q003",
    "environment",
  ));
  assert.equal(copiedEnvironment.isDirectory(), true);
  assert.equal(first.mode, "prepared");
  assert.equal(await fs.stat(path.join(fixture.runtimeRoot, "prepared", "tasks", "q003")).then((item) => item.isDirectory()), true);
  await assert.rejects(fs.stat(path.join(fixture.runtimeRoot, "prepared", "tasks", "q007")), /ENOENT/);
  const preparedText = await fs.readFile(path.join(fixture.runtimeRoot, "prepared", "receipt.json"), "utf8");
  assert.doesNotMatch(preparedText, /Q007_PRIVATE_CANARY|HOLDOUT_PRIVATE_CANARY/);
  const receiptBefore = Buffer.from(preparedText);
  const second = await prepareFixture(fixture);
  assert.equal(second.mode, "verified-existing");
  assert.deepEqual(await fs.readFile(path.join(fixture.runtimeRoot, "prepared", "receipt.json")), receiptBefore);
  await verifyExperiment({
    repoRoot: REPO_ROOT,
    metaRoot: fixture.metaRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
    outputRoot: fixture.runtimeRoot,
  });
  const configFiles = await fs.readdir(path.join(fixture.runtimeRoot, "prepared", "configs", "harbor", "q003"));
  assert.deepEqual(configFiles.sort(), ["baseline.yaml", "bounded-verified-breadth.yaml", "state-machine-verified-breadth.yaml"]);
  for (const name of configFiles) {
    const config = parseYaml(await fs.readFile(path.join(fixture.runtimeRoot, "prepared", "configs", "harbor", "q003", name), "utf8"));
    assert.equal(config.retry.max_retries, 0);
    assert.deepEqual(config.datasets[0].task_names, ["q003"]);
    assert.equal(path.posix.basename(config.agents[0].skills[0]), "consult-semantic-okf");
    assert.equal(config.environment.mounts[0].read_only, true);
    assert.equal(config.environment.mounts[0].target, "/knowledge");
    assert.equal(config.environment.mounts[1].read_only, undefined);
  }
  const operator = parseYaml(await fs.readFile(path.join(fixture.runtimeRoot, "prepared", "configs", "operator", "generation-001.yaml"), "utf8"));
  assert.equal(operator.coevolution.complementaryRepair, true);
  assert.equal(operator.coevolution.minimumOperatorTrials, 2);
  assert.equal(operator.operators[0].operatorId, "bounded-verified-breadth-crossover");
  assert.equal(operator.candidates.filter((candidate) => candidate.operatorId === "bounded-verified-breadth-crossover").length, 2);
  assert.match(operator.holdout.baseline.jobDirectory, /not-opened/);
});

test("prepare fails closed when the two children are byte-identical", async () => {
  const fixture = await makeFixture({ duplicateChildren: true });
  await assert.rejects(prepareFixture(fixture), /three distinct tree digests/);
});

test("q003 publisher rejects identity, profile, and task drift then emits an anti-leak projection", async () => {
  const fixture = await makeFixture();
  await prepareFixture(fixture);
  await createSyntheticJobs(fixture);
  const childId = "bounded-verified-breadth";
  const jobName = `${fixture.protocol.harbor.jobNamePrefix}-q003-${childId}`;
  const jobRoot = path.join(fixture.runtimeRoot, "jobs", "q003", childId, jobName);
  const configPath = path.join(jobRoot, "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.agents[0].skills = ["/wrong/skill-name"];
  await fs.writeFile(configPath, canonicalJson(config));
  await assert.rejects(publishQ003({
    runtimeRoot: fixture.runtimeRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
  }), /config\.agent\.skills drift/);
  const generated = parseYaml(await fs.readFile(
    path.join(fixture.runtimeRoot, "prepared", "configs", "harbor", "q003", `${childId}.yaml`),
    "utf8",
  ));
  await fs.writeFile(configPath, canonicalJson(generated));

  const trialDirectory = path.join(jobRoot, "q003__fixture_1");
  const trialPath = path.join(trialDirectory, "result.json");
  const trial = JSON.parse(await fs.readFile(trialPath, "utf8"));
  trial.agent_info.version = "0.74.0";
  await fs.writeFile(trialPath, canonicalJson(trial));
  await assert.rejects(publishQ003({
    runtimeRoot: fixture.runtimeRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
  }), /observed agent version drift/);
  trial.agent_info.version = "0.73.1";
  trial.config.task.path = `${generated.datasets[0].path}/q007`;
  await fs.writeFile(trialPath, canonicalJson(trial));
  await assert.rejects(publishQ003({
    runtimeRoot: fixture.runtimeRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
  }), /trial task path drift/);
  trial.config.task.path = `${generated.datasets[0].path}/q003`;
  await fs.writeFile(trialPath, canonicalJson(trial));

  const published = await publishQ003({
    runtimeRoot: fixture.runtimeRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    preparedStudyRoot: fixture.preparedStudyRoot,
  });
  assert.equal(published.publication.gate.passed, true);
  assert.equal(published.publication.gate.selectedCandidateId, childId);
  const publicBytes = await fs.readFile(path.join(published.outputDirectory, "result.json"), "utf8");
  assert.doesNotMatch(publicBytes, /PRIVATE_|answer|qrel|reasoning|diagnostic|trajectory/i);
  assert.deepEqual(Object.keys(published.publication.records[0].gates).sort(), [
    "evidence_contract_gate",
    "mechanical_qualification_gate",
    "minimum_document_gate",
  ]);
});

test("stop gates enforce q003 selection, q007 no-regression, and positive remaining-smoke gain", () => {
  const q003 = evaluateStopGate({
    protocol: TRACKED_PROTOCOL,
    stageId: "q003",
    records: [
      { ...qualified("q003", "baseline", 0.9), qualified: false },
      qualified("q003", "bounded-verified-breadth", 0.8),
      qualified("q003", "state-machine-verified-breadth", 0.5),
    ],
  });
  assert.deepEqual(
    { passed: q003.passed, next: q003.nextStage, selected: q003.selectedCandidateId },
    { passed: true, next: "q007", selected: "bounded-verified-breadth" },
  );
  const q007 = evaluateStopGate({
    protocol: TRACKED_PROTOCOL,
    stageId: "q007",
    priorPublication: { gate: q003 },
    records: [
      qualified("q007", "baseline", 0.4),
      qualified("q007", "bounded-verified-breadth", 0.4),
    ],
  });
  assert.equal(q007.nextStage, "remaining-smoke");
  const remaining = evaluateStopGate({
    protocol: TRACKED_PROTOCOL,
    stageId: "remaining-smoke",
    priorPublication: { gate: q007 },
    records: [
      qualified("q018", "baseline", 0.4),
      qualified("q018", "bounded-verified-breadth", 0.4),
      qualified("q024", "baseline", 0.3),
      qualified("q024", "bounded-verified-breadth", 0.6),
      qualified("q030", "baseline", 0.5),
      qualified("q030", "bounded-verified-breadth", 0.5),
    ],
  });
  assert.equal(remaining.status, "complete-smoke");
  const regression = evaluateStopGate({
    protocol: TRACKED_PROTOCOL,
    stageId: "q007",
    priorPublication: { gate: q003 },
    records: [
      qualified("q007", "baseline", 0.4),
      qualified("q007", "bounded-verified-breadth", 0.3),
    ],
  });
  assert.equal(regression.reason, "selected-child-regresses-q007");
});
