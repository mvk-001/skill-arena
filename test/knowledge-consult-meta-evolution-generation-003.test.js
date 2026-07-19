import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  canonicalJson,
  frozenProfileFromSource,
  objectDigest,
  treeDigest,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/scripts/prepare-meta-evolution.js";
import {
  analysisPreparedRoot,
  buildChildHarborConfig,
  buildGeneration003HarborConfig,
  buildSameSessionWrapper,
  CHILD_IDS,
  OPERATOR_ID,
  prepareGeneration003,
  sealGeneration003Authentication,
  sha256File,
  verifyGeneration003Authentication,
  verifyGeneration003,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js";
import {
  publishGeneration003,
  verifyContrastResume,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003.js";
import {
  pythonDigest,
  resolveContrastEffectiveEvidence,
  verifyPrivateAuthSeal,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution.js";
import {
  resolveContrastPostAgentEffectiveEvidence,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/evidence-resolution-post-agent.js";
import {
  prepareGeneration003PostAgent,
  verifyGeneration003PostAgent,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003-post-agent.js";
import {
  publishGeneration003PostAgent,
  verifyContrastPostAgentResume,
} from "../evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/publish-generation-003-post-agent.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TRACKED_PROTOCOL_PATH = path.join(
  REPO_ROOT,
  "evaluations",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-003",
  "protocol.json",
);
const TRACKED_PROTOCOL = JSON.parse(await fs.readFile(TRACKED_PROTOCOL_PATH, "utf8"));
const temporaryRoots = [];
const wslAvailable = spawnSync("wsl", ["bash", "--version"], {
  encoding: "utf8",
  timeout: 10000,
}).status === 0;

async function write(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function relativePosix(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

async function makeSkill(root, marker) {
  await write(
    path.join(root, "SKILL.md"),
    `---\nname: consult-semantic-okf\ndescription: Synthetic one-shot fixture ${marker}.\n---\n\n# Fixture\n\n${marker}\n`,
  );
  await write(path.join(root, "scripts", "harbor_answer.py"), `MARKER = ${JSON.stringify(marker)}\n`);
  await write(path.join(root, "scripts", "runtime_smoke.py"), "raise SystemExit(0)\n");
}

async function makeFixture({ duplicateChildren = false } = {}) {
  await fs.mkdir(path.join(REPO_ROOT, ".tmp"), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO_ROOT, ".tmp", "meta-g003-test-"));
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
  const baselineDigest = await treeDigest(baselineRoot);

  const generation001RuntimeRoot = path.join(root, "generation-001");
  const generation001Baseline = path.join(
    generation001RuntimeRoot,
    "prepared",
    "inputs",
    "baseline",
    "consult-semantic-okf",
  );
  await makeSkill(generation001Baseline, "baseline");
  const q003Root = path.join(generation001RuntimeRoot, "prepared", "tasks", "q003");
  for (const name of ["environment", "solution", "tests"]) {
    await fs.mkdir(path.join(q003Root, name), { recursive: true });
  }
  await write(path.join(q003Root, "instruction.md"), "public development fixture\n");
  await write(path.join(q003Root, "task.toml"), "version = '1'\n");
  await write(path.join(q003Root, "tests", "test.sh"), "#!/bin/bash\npython /tests/score.py\n");
  await write(path.join(q003Root, "tests", "score.py"), "raise SystemExit(0)\n");
  await write(path.join(q003Root, "tests", "trace_status.py"), "STATUS = 'fixture'\n");
  await write(path.join(q003Root, "tests", "question.json"), canonicalJson({ id: "q003" }));
  await write(path.join(q003Root, "tests", "records.jsonl"), "{}\n");
  await write(path.join(q003Root, "tests", "source-combination.json"), canonicalJson({ records: [] }));
  await write(path.join(q003Root, "tests", "Dockerfile"), "FROM semantic-okf-harbor-runtime:1.0\nCOPY . /tests\n");
  const q003Digest = await treeDigest(q003Root);

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

  const jobName = "knowledge-consult-meta-g001-q003-baseline";
  const baselineJobsRoot = path.join(generation001RuntimeRoot, "jobs", "q003", "baseline");
  const jobDirectory = path.join(baselineJobsRoot, jobName);
  const trialName = "q003__fixture_parent";
  const taskChecksum = "4".repeat(64);
  const lockedSkillDigest = `sha256:${"6".repeat(64)}`;
  const expectedSkill = toHarborPath(generation001Baseline);
  const taskDataset = toHarborPath(path.join(generation001RuntimeRoot, "prepared", "tasks"));
  const agent = {
    name: profile.agent.name,
    model_name: profile.agent.model,
    n_concurrent: 1,
    skills: [expectedSkill],
    kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
    env: { PI_CODING_AGENT_DIR: "/root/.pi/agent" },
  };
  const parentConfig = {
    job_name: jobName,
    n_attempts: 1,
    retry: { max_retries: 0 },
    environment: {
      type: "docker",
      mounts: [
        { type: "bind", source: toHarborPath(path.join(knowledgeRoot, "bundle")), target: "/knowledge", read_only: true },
      ],
    },
    agents: [agent],
    datasets: [{ path: taskDataset, task_names: ["q003"] }],
  };
  const parentLock = {
    harbor: { version: profile.harborVersion },
    trials: [{
      task: { name: "q003" },
      skills: [{ name: "consult-semantic-okf", source: expectedSkill, digest: lockedSkillDigest }],
    }],
  };
  const parentResult = { finished_at: "2026-07-18T00:00:00Z", n_total_trials: 1 };
  const parentTrial = { finished_at: "2026-07-18T00:00:00Z" };
  await write(path.join(jobDirectory, "config.json"), canonicalJson(parentConfig));
  await write(path.join(jobDirectory, "lock.json"), canonicalJson(parentLock));
  await write(path.join(jobDirectory, "result.json"), canonicalJson(parentResult));
  await write(path.join(jobDirectory, trialName, "result.json"), canonicalJson(parentTrial));
  const parentHashes = {
    config: await sha256File(path.join(jobDirectory, "config.json")),
    lock: await sha256File(path.join(jobDirectory, "lock.json")),
    result: await sha256File(path.join(jobDirectory, "result.json")),
    trial: await sha256File(path.join(jobDirectory, trialName, "result.json")),
  };

  const preparationReceipt = {
    generationId: "generation-001",
    frozenEvaluationProfileSha256: objectDigest(frozenProfileFromSource(sourceProtocol)),
    preparationTask: { taskId: "q003", treeSha256: q003Digest.sha256 },
  };
  const preparationReceiptPath = path.join(generation001RuntimeRoot, "prepared", "receipt.json");
  await write(preparationReceiptPath, canonicalJson(preparationReceipt));
  const remediation = {
    classification: { strategyEvaluated: false, modelCalls: 0 },
  };
  const remediationPath = path.join(baselineJobsRoot, "external-resume-receipt.json");
  await write(remediationPath, canonicalJson(remediation));

  const parentRecord = {
    taskId: "q003",
    candidateId: "baseline",
    evaluable: true,
    qualified: false,
    status: "evaluated",
    metrics: { primary: 0 },
    gates: {
      evidence_contract_gate: 0,
      mechanical_qualification_gate: 0,
      minimum_document_gate: 0,
    },
    tokens: { input: 100, cache: 20, output: 10 },
    provenance: {
      candidateTreeSha256: baselineDigest.sha256,
      profileSha256: preparationReceipt.frozenEvaluationProfileSha256,
      taskChecksum,
      jobName,
      jobConfigSha256: parentHashes.config,
      jobLockSha256: parentHashes.lock,
      jobResultSha256: parentHashes.result,
      trialResultSha256: parentHashes.trial,
      lockedSkillDigest,
      lockedSkillName: "consult-semantic-okf",
    },
  };
  const publicationBody = {
    generationId: "generation-001",
    taskId: "q003",
    profile: { sha256: preparationReceipt.frozenEvaluationProfileSha256 },
    records: [parentRecord],
  };
  const publication = { ...publicationBody, publicationSha256: objectDigest(publicationBody) };
  const publicationPath = path.join(generation001RuntimeRoot, "publications", "q003", "result.json");
  await write(publicationPath, canonicalJson(publication));

  const diagnosticDeclared = TRACKED_PROTOCOL.diagnosticOperatorProvenance;
  const diagnosticLog = {
    schemaVersion: diagnosticDeclared.schemaVersion,
    source: diagnosticDeclared.source,
    evolutionId: diagnosticDeclared.evolutionId,
    generation: diagnosticDeclared.generation,
    generationId: diagnosticDeclared.generationId,
    generationSeal: diagnosticDeclared.generationSeal,
    evolutionProfileDigest: diagnosticDeclared.evolutionProfileDigest,
    diagnosticOnly: true,
    chainEligible: false,
    holdoutOpened: false,
    promotion: false,
  };
  const diagnosticLogPath = path.join(generation001RuntimeRoot, ...diagnosticDeclared.path.split("/"));
  await write(diagnosticLogPath, canonicalJson(diagnosticLog));

  const generationRoot = path.join(root, "meta", "generation-003");
  const childData = [];
  for (const [index, candidateId] of CHILD_IDS.entries()) {
    const candidateRoot = path.join(generationRoot, "candidates", candidateId);
    const skillRoot = path.join(candidateRoot, "consult-semantic-okf");
    await makeSkill(skillRoot, duplicateChildren ? "duplicate-child" : `child-${index}`);
    const digest = await treeDigest(skillRoot);
    const manifest = {
      generationId: "generation-003",
      candidateId,
      operatorId: OPERATOR_ID,
      parentCandidateId: "00-baseline",
      parentTreeSha256: baselineDigest.sha256,
      parentSourceCommit: commit,
      skill: { name: "consult-semantic-okf", treeSha256: digest.sha256 },
    };
    const realization = {
      generationId: "generation-003",
      candidateId,
      operatorId: OPERATOR_ID,
      parentCandidateId: "00-baseline",
      candidateTreeSha256: digest.sha256,
      instruction: TRACKED_PROTOCOL.operator.instruction,
      origin: TRACKED_PROTOCOL.operator.historicalCandidateRealizationOrigin,
      parentCandidates: [{ candidateId: "00-baseline", treeSha256: baselineDigest.sha256, sourceCommit: commit }],
    };
    const manifestPath = path.join(candidateRoot, "candidate-manifest.json");
    const realizationPath = path.join(candidateRoot, "operator-realization.json");
    await write(manifestPath, canonicalJson(manifest));
    await write(realizationPath, canonicalJson(realization));
    childData.push({
      candidateId,
      skillRoot,
      digest,
      manifestPath,
      realizationPath,
      manifestSha256: await sha256File(manifestPath),
      realizationSha256: await sha256File(realizationPath),
    });
  }

  const protocol = structuredClone(TRACKED_PROTOCOL);
  protocol.status = "sealed";
  protocol.knowledge.commit = commit;
  protocol.knowledge.baselineSkillPath = "skills/consult-semantic-okf";
  protocol.knowledge.referenceBundlePath = "bundle";
  protocol.target.baseline.expectedTreeSha256 = baselineDigest.sha256;
  protocol.preparationTask.expectedTreeSha256 = q003Digest.sha256;
  protocol.frozenEvaluationProfile = profile;
  protocol.frozenEvaluationProfileSha256 = preparationReceipt.frozenEvaluationProfileSha256;
  protocol.diagnosticOperatorProvenance.fileSha256 = await sha256File(diagnosticLogPath);
  for (const [index, child] of protocol.target.children.entries()) {
    const fixtureChild = childData[index];
    child.sourcePath = relativePosix(fixtureChild.skillRoot);
    child.manifestPath = relativePosix(fixtureChild.manifestPath);
    child.operatorRealizationPath = relativePosix(fixtureChild.realizationPath);
    child.expectedTreeSha256 = fixtureChild.digest.sha256;
    child.expectedManifestSha256 = fixtureChild.manifestSha256;
    child.expectedOperatorRealizationSha256 = fixtureChild.realizationSha256;
  }
  Object.assign(protocol.lineageParentEvidence, {
    preparationReceiptSha256: await sha256File(preparationReceiptPath),
    expectedTreeSha256: baselineDigest.sha256,
  });
  protocol.harbor.authenticationMount.source = `/tmp/meta-g003-test-auth-${path.basename(root)}`;
  const protocolPath = path.join(generationRoot, "protocol.json");
  await write(protocolPath, canonicalJson(protocol));
  return {
    root,
    generationRoot,
    knowledgeRoot,
    generation001RuntimeRoot,
    sourceProtocolPath,
    protocol,
    protocolPath,
    runtimeRoot: path.join(root, "runtime-generation-003"),
    diagnosticLogPath,
    taskChecksum,
  };
}

function prepareOptions(fixture) {
  return {
    repoRoot: REPO_ROOT,
    generationRoot: fixture.generationRoot,
    protocolPath: fixture.protocolPath,
    sourceProtocolPath: fixture.sourceProtocolPath,
    knowledgeRoot: fixture.knowledgeRoot,
    generation001RuntimeRoot: fixture.generation001RuntimeRoot,
    outputRoot: fixture.runtimeRoot,
  };
}

async function createLegacyPreparedV1(fixture) {
  const legacyRoot = path.join(fixture.runtimeRoot, "prepared");
  const analysisRoot = analysisPreparedRoot(fixture.runtimeRoot);
  for (const child of fixture.protocol.target.children) {
    await fs.cp(
      path.join(fixture.generationRoot, "candidates", child.candidateId, fixture.protocol.target.logicalName),
      path.join(legacyRoot, "inputs", child.candidateId, fixture.protocol.target.logicalName),
      { recursive: true },
    );
  }
  const artifacts = [];
  for (const candidateId of CHILD_IDS) {
    const config = buildGeneration003HarborConfig({
      protocol: fixture.protocol,
      candidateId,
      runtimeRoot: fixture.runtimeRoot,
      preparedRoot: analysisRoot,
      knowledgeRoot: fixture.knowledgeRoot,
      generation001RuntimeRoot: fixture.generation001RuntimeRoot,
    });
    const relative = `configs/harbor/q003/${candidateId}.yaml`;
    await write(
      path.join(legacyRoot, ...relative.split("/")),
      stringifyYaml(config, { indent: 2, lineWidth: 0, sortMapEntries: false }),
    );
    artifacts.push({ kind: "harbor-child-job-config", candidateId, path: relative });
  }
  const wrapperRelative = "run-q003-clean-pi.sh";
  await write(
    path.join(legacyRoot, wrapperRelative),
    buildSameSessionWrapper({ protocol: fixture.protocol, preparedRoot: legacyRoot }),
  );
  artifacts.push({ kind: "clean-pi-preflight-wrapper", path: wrapperRelative });
  const operatorRelative = "configs/operator/generation-003.yaml";
  await write(path.join(legacyRoot, operatorRelative), "legacy: true\n");
  artifacts.push({ kind: "operator-development-config", path: operatorRelative });
  for (const artifact of artifacts) artifact.sha256 = await sha256File(path.join(legacyRoot, ...artifact.path.split("/")));
  const immutablePayload = await treeDigest(legacyRoot);
  const legacyProtocolSha256 = "a".repeat(64);
  const receipt = {
    schemaVersion: 1,
    generationId: "generation-003",
    protocolSha256: legacyProtocolSha256,
    artifacts,
    immutablePayload,
  };
  const receiptPath = path.join(legacyRoot, "receipt.json");
  await write(receiptPath, canonicalJson(receipt));
  const protocol = structuredClone(fixture.protocol);
  Object.assign(protocol.preparationUpgrade, {
    legacyProtocolSha256,
    legacyReceiptFileSha256: await sha256File(receiptPath),
    legacyImmutablePayloadSha256: immutablePayload.sha256,
  });
  await write(fixture.protocolPath, canonicalJson(protocol));
  fixture.protocol = protocol;
  return {
    legacyRoot,
    receiptBytes: await fs.readFile(receiptPath),
    immutablePayload,
  };
}

async function artifactManifest(directory, { omit = [] } = {}) {
  const omitted = new Set(omit);
  const rows = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(directory, absolute).split(path.sep).join("/");
        if (!omitted.has(relative)) rows.push({ path: relative, sha256: `sha256:${await sha256File(absolute)}` });
      }
    }
  }
  await walk(directory);
  return rows.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

async function directoryManifest(directory) {
  const rows = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absolute = path.join(current, entry.name);
      rows.push(path.relative(directory, absolute).split(path.sep).join("/"));
      await walk(absolute);
    }
  }
  await walk(directory);
  return rows.sort((left, right) => left.localeCompare(right, "en"));
}

class PythonFloatFixture {
  constructor(source, canonical = source) {
    this.source = source;
    this.canonical = canonical;
  }
}

function fixturePythonJson(value, { canonical = false } = {}) {
  function serialize(item) {
    if (item instanceof PythonFloatFixture) return canonical ? item.canonical : item.source;
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean" || typeof item === "number") {
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(serialize).join(",")}]`;
    const keys = Object.keys(item).sort((left, right) => left.localeCompare(right, "en"));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(item[key])}`).join(",")}}`;
  }
  return `${serialize(value)}\n`;
}

function fixturePythonDigest(value) {
  return `sha256:${createHash("sha256").update(fixturePythonJson(value, { canonical: true }).trimEnd(), "utf8").digest("hex")}`;
}

async function createJobArtifacts({
  fixture,
  candidateId,
  jobDirectory,
  config,
  reward,
  external = false,
  trialSuffix = candidateId,
  digestDigit = "7",
}) {
  const trialName = `q003__fixture_${trialSuffix.replaceAll(/[^a-z0-9]+/gi, "_")}`;
  const lockedSkillDigest = `sha256:${digestDigit.repeat(64)}`;
  const lockedEnvironment = structuredClone(config.environment);
  const lockedVerifier = {};
  const lock = {
    harbor: { version: fixture.protocol.frozenEvaluationProfile.harborVersion },
    retry: structuredClone(config.retry),
    trials: [{
      task: { name: "q003", digest: `sha256:${"a".repeat(64)}` },
      agent: structuredClone(config.agents[0]),
      skills: [{
        name: fixture.protocol.target.logicalName,
        source: config.agents[0].skills[0],
        digest: lockedSkillDigest,
      }],
      environment: lockedEnvironment,
      verifier: lockedVerifier,
    }],
  };
  const result = {
    started_at: "2026-07-18T00:00:00Z",
    finished_at: external ? null : "2026-07-18T00:01:00Z",
    n_total_trials: 1,
    stats: { n_retries: 0 },
  };
  const metric = external ? null : reward;
  const trial = {
    trial_name: trialName,
    task_checksum: fixture.taskChecksum,
    config: {
      trial_name: trialName,
      task: { path: `${config.datasets[0].path}/q003` },
      agent: structuredClone(config.agents[0]),
      environment: lockedEnvironment,
      verifier: lockedVerifier,
    },
    agent_info: {
      name: fixture.protocol.frozenEvaluationProfile.agent.name,
      version: fixture.protocol.frozenEvaluationProfile.agent.version,
      model_info: { provider: "openai-codex", name: "gpt-5.3-codex-spark" },
    },
    agent_result: external ? null : {
      n_input_tokens: 200 + Number(digestDigit),
      n_cache_tokens: 40 + Number(digestDigit),
      n_output_tokens: 20 + Number(digestDigit),
      reasoning: `PRIVATE_G003_TRACE_${trialSuffix}`,
    },
    verifier_result: external ? null : {
      rewards: {
        reward: metric,
        evidence_contract_gate: metric,
        minimum_document_gate: metric,
        mechanical_qualification_gate: metric,
        private_relevance_identity: `PRIVATE_G003_QREL_${trialSuffix}`,
      },
      answer: `PRIVATE_G003_OUTPUT_${trialSuffix}`,
    },
    exception_info: external ? {
      exception_type: "CancelledError",
      exception_message: "fixture pre-agent interruption",
    } : null,
    finished_at: "2026-07-18T00:01:00Z",
  };
  await write(path.join(jobDirectory, "config.json"), canonicalJson(config));
  await write(path.join(jobDirectory, "lock.json"), canonicalJson(lock));
  await write(path.join(jobDirectory, "result.json"), canonicalJson(result));
  await write(path.join(jobDirectory, trialName, "result.json"), canonicalJson(trial));
  return { jobDirectory, config, lock, result, trial, trialName, lockedSkillDigest };
}

async function createNativeCohortEvidence(fixture, { passing = true } = {}) {
  const preparedRoot = analysisPreparedRoot(fixture.runtimeRoot);
  const jobs = {};
  for (const [index, candidateId] of ["baseline", ...CHILD_IDS].entries()) {
    const config = buildGeneration003HarborConfig({
      protocol: fixture.protocol,
      candidateId,
      runtimeRoot: fixture.runtimeRoot,
      preparedRoot,
      knowledgeRoot: fixture.knowledgeRoot,
      generation001RuntimeRoot: fixture.generation001RuntimeRoot,
    });
    const jobDirectory = path.join(fixture.runtimeRoot, "jobs", "q003", candidateId, config.job_name);
    const external = candidateId === CHILD_IDS[1];
    const reward = candidateId === "baseline" ? 0 : passing ? (candidateId === CHILD_IDS[0] ? 1 : 0.5) : 0;
    jobs[candidateId] = await createJobArtifacts({
      fixture,
      candidateId,
      jobDirectory,
      config,
      reward,
      external,
      digestDigit: String(index + 6),
    });
  }

  const authJson = path.join(fixture.root, "pi-auth", "auth.json");
  await write(authJson, canonicalJson({
    "openai-codex": {
      type: "oauth",
      access: "access",
      refresh: "refresh",
      accountId: "account",
      expires: 1893456000000,
    },
  }));
  const authTime = new Date("2026-07-17T00:00:00Z");
  await fs.utimes(authJson, authTime, authTime);
  await sealGeneration003Authentication({ ...prepareOptions(fixture), authSource: authJson });

  const contrastId = CHILD_IDS[1];
  const original = jobs[contrastId];
  const originalTreeBefore = await treeDigest(original.jobDirectory);
  const retryDirectory = path.join(fixture.runtimeRoot, "retry-jobs", "q003", contrastId, "attempt-001");
  const retryConfig = structuredClone(original.config);
  retryConfig.job_name = `${original.config.job_name}-external-retry-001`;
  retryConfig.jobs_dir = toHarborPath(path.dirname(retryDirectory));
  const retry = await createJobArtifacts({
    fixture,
    candidateId: contrastId,
    jobDirectory: retryDirectory,
    config: retryConfig,
    reward: passing ? 0.5 : 0,
    external: false,
    trialSuffix: "contrast_retry_001",
    digestDigit: "9",
  });

  const sourceManifest = await artifactManifest(original.jobDirectory);
  const sourceDigest = pythonDigest(sourceManifest);
  const retryManifest = await artifactManifest(retry.jobDirectory);
  const retryDigest = pythonDigest(retryManifest);
  const policyDigest = pythonDigest({
    maximumExternalRetries: 1,
    selectionPolicy: "first-evaluable-retry-never-best-of",
  });
  const contract = {
    schemaVersion: 1,
    harborVersion: fixture.protocol.frozenEvaluationProfile.harborVersion,
    rewardKey: fixture.protocol.frozenEvaluationProfile.rewardKey,
    sourceJobs: [{
      candidateId: contrastId,
      directory: original.jobDirectory,
      artifactManifest: sourceManifest,
      artifactDigest: sourceDigest,
    }],
  };
  const contractDigest = pythonDigest({ source: contract, policyDigest });
  const sourceTrialKey = pythonDigest({ sourceDigest, trialName: original.trialName });
  const evaluationProfileDigest = `sha256:${fixture.protocol.frozenEvaluationProfileSha256}`;
  const parentTrialResultSha256 = `sha256:${await sha256File(path.join(original.jobDirectory, original.trialName, "result.json"))}`;
  const failureContract = "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1";
  const remediationAttestationDigest = pythonDigest({ sourceTrialKey, remediation: "fixture-external-only" });
  const sourceTrial = {
    sourceTrialKey,
    candidateId: contrastId,
    classification: "external",
    sourceJob: original.jobDirectory,
    artifactDigest: sourceDigest,
    originalJobDigest: sourceDigest,
    taskChecksum: fixture.taskChecksum,
    candidateSkillDigest: original.lockedSkillDigest,
    evaluationProfileDigest,
    trialId: original.trialName,
    sourceTrial: original.trialName,
    failureContract,
    remediationAttestationDigest,
  };
  const attemptBody = {
    sourceTrialKey,
    attempt: 1,
    status: "completed",
    evaluable: true,
    classification: "semantic",
    reward: passing ? 0.5 : 0,
    lifecycle: [
      { status: "reserved", at: "2026-07-18T00:02:00Z" },
      { status: "completed", at: "2026-07-18T00:03:00Z" },
    ],
    taskChecksum: fixture.taskChecksum,
    candidateSkillDigest: original.lockedSkillDigest,
    evaluationProfileDigest,
    parentJobDirectory: original.jobDirectory,
    parentJobArtifactDigest: sourceDigest,
    parentTrialId: original.trialName,
    parentTrialName: original.trialName,
    parentTrialResultSha256,
    failureContract,
    remediationAttestationDigest,
    jobDirectory: retry.jobDirectory,
    trialId: retry.trialName,
    jobArtifactManifest: retryManifest,
    jobArtifactDigest: retryDigest,
    retryJobDigest: retryDigest,
  };
  const attempt = { ...attemptBody, attemptRecordDigest: pythonDigest(attemptBody) };

  const resumeOutput = path.join(fixture.runtimeRoot, "resume", "q003", contrastId);
  const sourceKey = pythonDigest({ directory: original.jobDirectory, artifactDigest: sourceDigest })
    .slice("sha256:".length);
  const effectiveJob = path.join(resumeOutput, "effective-jobs", sourceKey, "effective-job");
  await fs.mkdir(path.dirname(effectiveJob), { recursive: true });
  await fs.mkdir(effectiveJob, { recursive: false });
  await fs.copyFile(path.join(original.jobDirectory, "config.json"), path.join(effectiveJob, "config.json"));
  await fs.copyFile(path.join(original.jobDirectory, "lock.json"), path.join(effectiveJob, "lock.json"));
  await write(path.join(effectiveJob, "result.json"), canonicalJson(retry.result));
  await write(path.join(effectiveJob, retry.trialName, "result.json"), canonicalJson(retry.trial));
  const effectiveFiles = await artifactManifest(effectiveJob);
  const effectiveJobDigest = pythonDigest(effectiveFiles);
  const resumeManifest = {
    schemaVersion: 1,
    policyDigest,
    contractDigest,
    selectionPolicy: "first-evaluable-retry-never-best-of",
    sourceJobArtifactDigest: sourceDigest,
    sourceJob: original.jobDirectory,
    lineage: [{
      sourceTrialKey,
      sourceTrial: {
        artifactDigest: sourceDigest,
        jobDirectory: original.jobDirectory,
        trialDirectory: path.join(original.jobDirectory, original.trialName),
      },
      selected: {
        lineage: "retry",
        attempt: 1,
        retryArtifactDigest: retryDigest,
        trialId: retry.trialName,
        jobDirectory: retry.jobDirectory,
      },
    }],
    files: effectiveFiles,
    effectiveJobDigest,
  };
  await write(path.join(effectiveJob, "resume-manifest.json"), canonicalJson(resumeManifest));

  const lock = {
    schemaVersion: 1,
    policyDigest,
    contractDigest,
    contract,
    sourceTrials: [sourceTrial],
    attempts: [attempt],
  };
  const merged = {
    schemaVersion: 1,
    policyDigest,
    contractDigest,
    selectionPolicy: "first-evaluable-retry-never-best-of",
    rewardKey: fixture.protocol.frozenEvaluationProfile.rewardKey,
    trials: [{
      sourceTrialKey,
      original: {
        evaluable: false,
        classification: "external",
        artifactDigest: sourceDigest,
        jobDirectory: original.jobDirectory,
      },
      retries: [attempt],
      selected: { lineage: "retry", attempt: 1, jobDirectory: retry.jobDirectory, trialId: retry.trialName },
      unresolvedRetryableExternal: false,
      nonRetryableUnavailable: false,
      unresolvedExternal: false,
      reward: passing ? 0.5 : 0,
    }],
    summary: {
      sourceTrials: 1,
      selectedOriginal: 0,
      selectedRetry: 1,
      unresolvedRetryableExternal: 0,
      nonRetryableUnavailable: 0,
      unresolvedExternal: 0,
      effectiveJobs: 1,
    },
    effectiveJobs: [{
      sourceJob: original.jobDirectory,
      jobDirectory: effectiveJob,
      effectiveJobDigest,
    }],
  };
  await write(path.join(resumeOutput, "resume-lock.json"), canonicalJson(lock));
  await write(path.join(resumeOutput, "merged-result.json"), canonicalJson(merged));
  return {
    authJson,
    jobs,
    originalContrastTreeBefore: originalTreeBefore,
    resumeOutput,
    retryDirectory,
    effectiveJob,
    effectiveJobDigest,
  };
}

async function createPostAgentRecoveryEvidence(fixture, {
  nativeFailure = "exact-eio",
  deterministicMismatch = false,
  modelCalls = 0,
  journalMutation = null,
  pythonFloatSpellings = false,
} = {}) {
  await prepareGeneration003(prepareOptions(fixture));
  const preparedRoot = analysisPreparedRoot(fixture.runtimeRoot);
  const jobs = {};
  for (const [index, candidateId] of ["baseline", ...CHILD_IDS].entries()) {
    const config = buildGeneration003HarborConfig({
      protocol: fixture.protocol,
      candidateId,
      runtimeRoot: fixture.runtimeRoot,
      preparedRoot,
      knowledgeRoot: fixture.knowledgeRoot,
      generation001RuntimeRoot: fixture.generation001RuntimeRoot,
    });
    const jobDirectory = path.join(fixture.runtimeRoot, "jobs", "q003", candidateId, config.job_name);
    jobs[candidateId] = await createJobArtifacts({
      fixture,
      candidateId,
      jobDirectory,
      config,
      reward: candidateId === CHILD_IDS[0] ? 1 : 0,
      external: candidateId === CHILD_IDS[1],
      digestDigit: String(index + 6),
    });
  }

  const authJson = path.join(fixture.root, "post-agent-pi-auth", "auth.json");
  await write(authJson, canonicalJson({
    "openai-codex": {
      type: "oauth",
      access: "access",
      refresh: "refresh",
      accountId: "account",
      expires: 1893456000000,
    },
  }));
  const authTime = new Date("2026-07-17T00:00:00Z");
  await fs.utimes(authJson, authTime, authTime);
  await sealGeneration003Authentication({ ...prepareOptions(fixture), authSource: authJson });

  const trackedGenerationRoot = path.dirname(TRACKED_PROTOCOL_PATH);
  const v3AttestationPath = path.join(
    fixture.runtimeRoot,
    "resume",
    "q003",
    "contrast-matrix-one-shot-answer-prepared-v3",
    "remediation-attestation.json",
  );
  const executableFiles = {
    adapter: path.join(trackedGenerationRoot, "external-resume", "resume-generation-003.mjs"),
    wrapper: path.join(trackedGenerationRoot, "external-resume", "run-generation-003-resume.sh"),
    generationEvidenceResolver: path.join(trackedGenerationRoot, "scripts", "evidence-resolution.js"),
    generationPublisher: path.join(trackedGenerationRoot, "scripts", "publish-generation-003.js"),
  };
  const executableContract = {};
  for (const [key, file] of Object.entries(executableFiles)) {
    executableContract[key] = `sha256:${await sha256File(file)}`;
  }
  const v3Attestation = {
    schemaVersion: 1,
    sealedInputs: {
      protocol: `sha256:${await sha256File(fixture.protocolPath)}`,
      preparedOverlayReceipt: `sha256:${await sha256File(path.join(preparedRoot, "receipt.json"))}`,
      executableContract,
    },
  };
  await write(v3AttestationPath, canonicalJson(v3Attestation));

  const contrastId = CHILD_IDS[1];
  const original = jobs[contrastId];
  const sourceManifest = await artifactManifest(original.jobDirectory);
  const sourceDigest = pythonDigest(sourceManifest);
  const policyDigest = pythonDigest({
    maximumExternalRetries: 1,
    selectionPolicy: "first-evaluable-retry-never-best-of",
  });
  const contract = {
    schemaVersion: 1,
    harborVersion: fixture.protocol.frozenEvaluationProfile.harborVersion,
    rewardKey: fixture.protocol.frozenEvaluationProfile.rewardKey,
    sourceJobs: [{
      candidateId: contrastId,
      directory: original.jobDirectory,
      artifactManifest: sourceManifest,
      artifactDigest: sourceDigest,
    }],
  };
  const contractDigest = pythonDigest({ source: contract, policyDigest });
  const sourceTrialKey = pythonDigest({ sourceDigest, trialName: original.trialName });
  const evaluationProfileDigest = `sha256:${fixture.protocol.frozenEvaluationProfileSha256}`;
  const parentTrialResultSha256 = `sha256:${await sha256File(path.join(original.jobDirectory, original.trialName, "result.json"))}`;
  const failureContract = "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1";
  const recoveryContract = "harbor-0.18.0.oserror-eio-during-artifact-collection.post-agent.pre-verifier.v1";
  const completionMode = "verifier-only-recovery";
  const selectionPolicy = "first-evaluable-retry-never-best-of";
  const sourceTrial = {
    sourceTrialKey,
    candidateId: contrastId,
    classification: "external",
    sourceJob: original.jobDirectory,
    artifactDigest: sourceDigest,
    originalJobDigest: sourceDigest,
    taskChecksum: fixture.taskChecksum,
    candidateSkillDigest: original.lockedSkillDigest,
    evaluationProfileDigest,
    trialId: original.trialName,
    sourceTrial: original.trialName,
    failureContract,
    remediationAttestationDigest: `sha256:${await sha256File(v3AttestationPath)}`,
  };

  const resumeOutput = path.join(fixture.runtimeRoot, "resume", "q003", contrastId);
  const retryDirectory = path.join(
    resumeOutput,
    "retries",
    sourceTrialKey.slice("sha256:".length),
    "attempt-001",
    "harbor-jobs",
    "external-retry-fixture-a001",
  );
  const retryConfig = structuredClone(original.config);
  retryConfig.job_name = `${original.config.job_name}-external-retry-fixture-a001`;
  retryConfig.jobs_dir = toHarborPath(path.dirname(retryDirectory));
  const retry = await createJobArtifacts({
    fixture,
    candidateId: contrastId,
    jobDirectory: retryDirectory,
    config: retryConfig,
    reward: 0,
    external: false,
    trialSuffix: "post_agent_retry_a001",
    digestDigit: "8",
  });

  const terminal = { question_id: "q003", answer: null, evidence: [] };
  const terminalText = JSON.stringify(terminal);
  const traceEvents = [
    { type: "session_start" },
    { type: "agent_start" },
    { type: "turn_start" },
    { type: "message_start", message: { role: "user" } },
    { type: "message_end", message: { role: "user", content: [] } },
    ...Array.from({ length: 20 }, (_, index) => ({ type: "tool_execution_update", index })),
    {
      type: "message_end",
      message: {
        role: "assistant",
        stopReason: "stop",
        content: [{ type: "text", text: terminalText }],
        usage: { input: 7711, cacheRead: 5120, output: 4659 },
      },
    },
    { type: "agent_end" },
  ];
  if (nativeFailure === "incomplete-trace") traceEvents.splice(10, 1);
  const traceText = `${traceEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
  const exactArtifactPath = toHarborPath(path.join(retryDirectory, retry.trialName, "artifacts", "logs", "artifacts"));
  const exceptionText = [
    "Traceback (most recent call last):",
    "  File \"single_step.py\", line 45, in _run",
    "    await self._collect_artifacts_phased()",
    "  File \"trial.py\", line 944, in _collect_artifacts_phased",
    "    await self.download_artifacts()",
    "  File \"artifact_handler.py\", line 179, in download_artifacts",
    "    await self._download_artifact()",
    "  File \"artifact_handler.py\", line 297, in _download_artifact",
    "    self._record_mounted_artifacts_dir()",
    "  File \"artifact_handler.py\", line 366, in _record_mounted_artifacts_dir",
    "    has_contents = target.exists() and any(target.iterdir())",
    `OSError: [Errno 5] Input/output error: '${exactArtifactPath}'`,
    "",
  ].join("\n");
  const tokens = { input: 12831, cache: 5120, output: 4659 };
  const nativeTrial = {
    ...retry.trial,
    id: "fixture-native-trial-id",
    task_id: { path: `${retryConfig.datasets[0].path}/q003` },
    agent_result: {
      n_input_tokens: tokens.input,
      n_cache_tokens: tokens.cache,
      n_output_tokens: tokens.output,
      reasoning: "PRIVATE_POST_AGENT_TRACE",
    },
    agent_execution: {
      started_at: "2026-07-18T00:02:00Z",
      finished_at: "2026-07-18T00:03:00Z",
    },
    verifier: nativeFailure === "verifier-started" ? { started_at: "2026-07-18T00:03:01Z" } : null,
    verifier_result: null,
    step_results: null,
    exception_info: {
      exception_type: nativeFailure === "wrong-exception" ? "ValueError" : "OSError",
      exception_message: `[Errno 5] Input/output error: '${exactArtifactPath}'`,
      exception_traceback: nativeFailure === "traceback-newline-drift" ? exceptionText.slice(0, -1) : exceptionText,
    },
  };
  if (nativeFailure === "wrong-model") nativeTrial.config.agent.model_name = "openai-codex/unrelated-model";
  const nativeJobResult = {
    started_at: "2026-07-18T00:01:00Z",
    finished_at: null,
    n_total_trials: 1,
    stats: {
      n_completed_trials: 1,
      n_errored_trials: 1,
      n_running_trials: 0,
      n_pending_trials: 0,
      n_cancelled_trials: 0,
      n_retries: 0,
      n_input_tokens: tokens.input,
      n_cache_tokens: tokens.cache,
      n_output_tokens: tokens.output,
    },
  };
  await write(path.join(retryDirectory, "result.json"), canonicalJson(nativeJobResult));
  await write(path.join(retryDirectory, retry.trialName, "result.json"), canonicalJson(nativeTrial));
  await write(path.join(retryDirectory, retry.trialName, "exception.txt"), exceptionText);
  await write(path.join(retryDirectory, retry.trialName, "agent", "pi.txt"), traceText);
  await fs.mkdir(path.join(retryDirectory, retry.trialName, "agent", "setup"), { recursive: true });
  await fs.mkdir(path.join(retryDirectory, retry.trialName, "artifacts", "logs", "artifacts"), { recursive: true });
  await fs.mkdir(path.join(retryDirectory, retry.trialName, "verifier"), { recursive: true });
  const nativeManifest = await artifactManifest(retryDirectory);
  const nativeDirectoryManifest = await directoryManifest(retryDirectory);
  const nativeDigest = pythonDigest(nativeManifest);

  const attemptBody = {
    sourceTrialKey,
    attempt: 1,
    mode: "live",
    status: "failed-execution",
    evaluable: false,
    classification: "external",
    reward: null,
    lifecycle: [
      { status: "reserved", phase: "durable-before-files", at: "2026-07-18T00:01:00Z" },
      { status: "reserved", phase: "configured-before-harbor-call", at: "2026-07-18T00:01:01Z" },
      { status: "reserved", phase: "harbor-call-starting", at: "2026-07-18T00:01:02Z" },
      { status: "failed-execution", at: "2026-07-18T00:04:00Z" },
    ],
    taskChecksum: fixture.taskChecksum,
    candidateSkillDigest: original.lockedSkillDigest,
    evaluationProfileDigest,
    parentJobDirectory: original.jobDirectory,
    parentJobArtifactDigest: sourceDigest,
    parentTrialId: original.trialName,
    parentTrialName: original.trialName,
    parentTrialResultSha256,
    failureContract,
    remediationAttestationDigest: sourceTrial.remediationAttestationDigest,
    failureType: "ExceptionGroup",
    failureDomain: null,
    jobDirectory: retryDirectory,
    trialId: nativeTrial.id,
    jobArtifactManifest: nativeManifest,
    jobArtifactDigest: nativeDigest,
    retryJobDigest: nativeDigest,
  };
  const attempt = { ...attemptBody, attemptRecordDigest: pythonDigest(attemptBody) };
  const resumeLock = {
    schemaVersion: 1,
    policyDigest,
    contractDigest,
    contract,
    sourceTrials: [sourceTrial],
    attempts: [attempt],
  };
  const resumeLockPath = path.join(resumeOutput, "resume-lock.json");
  await write(resumeLockPath, canonicalJson(resumeLock));

  const recoveryRoot = path.join(resumeOutput, "verifier-recovery", "attempt-001");
  const rewardOne = {
    reward: 0,
    evidence_contract_gate: 1,
    minimum_document_gate: 0,
    mechanical_qualification_gate: 0,
  };
  const rewardTwo = deterministicMismatch ? { ...rewardOne, reward: 0.25 } : structuredClone(rewardOne);
  function storedReward(reward, { exponentGate = false } = {}) {
    if (!pythonFloatSpellings) return reward;
    return Object.fromEntries(Object.entries(reward).map(([key, value]) => {
      const canonical = Number.isInteger(value) ? `${value}.0` : String(value);
      const source = exponentGate && key === "evidence_contract_gate" ? "1e0" : canonical;
      return [key, new PythonFloatFixture(source, canonical)];
    }));
  }
  const storedRewardOne = storedReward(rewardOne, { exponentGate: true });
  const storedRewardTwo = storedReward(rewardTwo, { exponentGate: true });
  const recoveredReward = storedReward(rewardOne);
  const recoveryJson = pythonFloatSpellings ? fixturePythonJson : canonicalJson;
  const recoveryDigest = pythonFloatSpellings ? fixturePythonDigest : pythonDigest;
  const diagnostics = {
    status: "scored-response",
    terminal_outcome: "answer-emitted",
    failure_domain: null,
    question_id: "q003",
  };
  const runs = [];
  const runTimes = [
    { startedAt: "2026-07-18T00:05:01Z", finishedAt: "2026-07-18T00:05:02Z" },
    { startedAt: "2026-07-18T00:05:03Z", finishedAt: "2026-07-18T00:05:04Z" },
  ];
  for (const [index, reward] of [storedRewardOne, storedRewardTwo].entries()) {
    const runNumber = index + 1;
    const relativeDirectory = `verifier-runs/run-${String(runNumber).padStart(3, "0")}`;
    const directory = path.join(recoveryRoot, ...relativeDirectory.split("/"));
    await write(path.join(directory, "reward.json"), recoveryJson(reward));
    await write(path.join(directory, "diagnostics.json"), canonicalJson(diagnostics));
    await write(path.join(directory, "test-stdout.txt"), "deterministic fixture verifier\n");
    runs.push({
      run: runNumber,
      directory: relativeDirectory,
      rewardPath: `${relativeDirectory}/reward.json`,
      rewardSha256: `sha256:${await sha256File(path.join(directory, "reward.json"))}`,
      diagnosticsPath: `${relativeDirectory}/diagnostics.json`,
      diagnosticsSha256: `sha256:${await sha256File(path.join(directory, "diagnostics.json"))}`,
      stdoutPath: `${relativeDirectory}/test-stdout.txt`,
      stdoutSha256: `sha256:${await sha256File(path.join(directory, "test-stdout.txt"))}`,
      exitCode: 0,
      ...runTimes[index],
    });
  }

  const taskRoot = path.join(fixture.generation001RuntimeRoot, "prepared", "tasks", "q003");
  const taskTestsManifest = await artifactManifest(path.join(taskRoot, "tests"));
  const agentTraceEvidence = {
    path: "agent/pi.txt",
    sha256: `sha256:${await sha256File(path.join(retryDirectory, retry.trialName, "agent", "pi.txt"))}`,
    size: (await fs.stat(path.join(retryDirectory, retry.trialName, "agent", "pi.txt"))).size,
    parsedEvents: traceEvents.length,
    terminal: "stop+agent_end",
    terminalOutputSha256: `sha256:${createHash("sha256").update(terminalText, "utf8").digest("hex")}`,
    tokens,
  };
  const taskEvidence = {
    checksum: fixture.taskChecksum,
    treeSha256: fixture.protocol.preparationTask.expectedTreeSha256,
    packagerDigest: `sha256:${"a".repeat(64)}`,
    taskTestsArtifactDigest: pythonDigest(taskTestsManifest),
    taskTestsArtifactManifest: taskTestsManifest,
  };
  const execution = { modelCalls, harborCalls: 0, verifierCalls: 2 };
  const callJournalPath = path.join(path.dirname(recoveryRoot), "attempt-001-verifier-call-journal.json");
  const agentArtifactManifest = [{ path: "pi.txt", sha256: agentTraceEvidence.sha256 }];
  const inputSnapshotRoot = path.join(recoveryRoot, "input-snapshot");
  await fs.mkdir(path.join(inputSnapshotRoot, "agent"), { recursive: true });
  await fs.copyFile(
    path.join(retryDirectory, retry.trialName, "agent", "pi.txt"),
    path.join(inputSnapshotRoot, "agent", "pi.txt"),
  );
  await fs.cp(path.join(taskRoot, "tests"), path.join(inputSnapshotRoot, "tests"), { recursive: true });
  const callJournalBody = {
    schemaVersion: 1,
    kind: "harbor-verifier-only-call-journal",
    caseId: "q003-post-agent-artifact-eio-verifier-only/v1",
    recoveryContract,
    sourceTrialKey,
    attempt: 1,
    status: "completed",
    native: {
      resumeLockSha256: `sha256:${await sha256File(resumeLockPath)}`,
      nativeRetryJobArtifactDigest: nativeDigest,
    },
    inputSnapshot: {
      agentArtifactDigest: pythonDigest(agentArtifactManifest),
      agentArtifactManifest,
      testsArtifactDigest: taskEvidence.taskTestsArtifactDigest,
      testsArtifactManifest: taskTestsManifest,
    },
    runs: runs.map((run, index) => ({
      run: index + 1,
      status: "completed",
      containerName: `fixture-verifier-call-${String(index + 1).padStart(3, "0")}`,
      directory: run.directory,
      rewardPath: run.rewardPath,
      rewardSha256: run.rewardSha256,
      diagnosticsPath: run.diagnosticsPath,
      diagnosticsSha256: run.diagnosticsSha256,
      stdoutPath: run.stdoutPath,
      stdoutSha256: run.stdoutSha256,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    })),
    lifecycle: [
      { status: "reserved", phase: "durable-before-verifier-runs", at: "2026-07-18T00:05:00Z" },
      { status: "reserved", phase: "input-snapshot-sealed", at: "2026-07-18T00:05:00.500Z" },
      { status: "running", phase: "run-001-starting", at: runs[0].startedAt },
      { status: "running", phase: "run-001-completed", at: runs[0].finishedAt },
      { status: "running", phase: "run-002-starting", at: runs[1].startedAt },
      { status: "completed", phase: "verifier-runs-sealed", at: "2026-07-18T00:05:05Z" },
    ],
    execution: { ...execution },
  };
  if (journalMutation === "failed-run") callJournalBody.runs[0].status = "failed";
  if (journalMutation === "input-drift") callJournalBody.inputSnapshot.agentArtifactManifest[0].sha256 = `sha256:${"b".repeat(64)}`;
  if (journalMutation === "model-call") callJournalBody.execution.modelCalls = 1;
  if (journalMutation === "overlap") callJournalBody.runs[1].startedAt = "2026-07-18T00:05:01Z";
  const callJournal = {
    ...callJournalBody,
    journalRecordDigest: pythonDigest(callJournalBody),
  };
  await write(callJournalPath, canonicalJson(callJournal));
  const recoveryLockInputs = {
    schemaVersion: 1,
    kind: "harbor-post-agent-verifier-recovery-lock",
    caseId: "q003-post-agent-artifact-eio-verifier-only/v1",
    recoveryContract,
    sourceTrialKey,
    attempt: 1,
    status: "completed",
    native: {
      resumeLockSha256: `sha256:${await sha256File(resumeLockPath)}`,
      sourceAttemptRecordDigest: attempt.attemptRecordDigest,
      retryJobDirectory: retryDirectory,
      nativeRetryJobArtifactDigest: nativeDigest,
      nativeRetryJobArtifactManifest: nativeManifest,
      nativeRetryJobDirectoryManifest: nativeDirectoryManifest,
      trialId: nativeTrial.id,
      trialName: nativeTrial.trial_name,
      trialResultSha256: `sha256:${await sha256File(path.join(retryDirectory, retry.trialName, "result.json"))}`,
      exceptionSha256: `sha256:${await sha256File(path.join(retryDirectory, retry.trialName, "exception.txt"))}`,
    },
    agentTrace: agentTraceEvidence,
    task: taskEvidence,
    verifier: {
      image: fixture.protocol.harbor.containerPreflight.image,
      imageId: fixture.protocol.harbor.containerPreflight.imageId,
      command: ["/tests/test.sh"],
      network: "none",
      authMounted: false,
      knowledgeMounted: false,
    },
    execution,
    runs,
    callJournal: {
      path: callJournalPath,
      sha256: `sha256:${await sha256File(callJournalPath)}`,
      journalRecordDigest: callJournal.journalRecordDigest,
    },
  };

  const recoveredJob = path.join(recoveryRoot, "recovered-job");
  await fs.mkdir(recoveredJob, { recursive: true });
  await fs.copyFile(path.join(retryDirectory, "config.json"), path.join(recoveredJob, "config.json"));
  await fs.copyFile(path.join(retryDirectory, "lock.json"), path.join(recoveredJob, "lock.json"));
  const recoveredResult = {
    ...nativeJobResult,
    finished_at: "2026-07-18T00:06:00Z",
    stats: { ...nativeJobResult.stats, n_errored_trials: 0 },
  };
  const recoveredTrial = {
    ...nativeTrial,
    exception_info: null,
    verifier: { started_at: "2026-07-18T00:05:00Z", finished_at: "2026-07-18T00:05:01Z" },
    verifier_result: { rewards: recoveredReward },
    step_results: [],
  };
  await write(path.join(recoveredJob, "result.json"), recoveryJson(recoveredResult));
  await write(path.join(recoveredJob, retry.trialName, "result.json"), recoveryJson(recoveredTrial));
  await write(path.join(recoveredJob, retry.trialName, "agent", "pi.txt"), traceText);
  await write(path.join(recoveredJob, retry.trialName, "artifacts", "pi.jsonl"), traceText);
  await write(path.join(recoveredJob, retry.trialName, "artifacts", "manifest.json"), canonicalJson({ files: ["pi.jsonl"] }));
  await fs.mkdir(path.join(recoveredJob, retry.trialName, "artifacts", "logs", "artifacts"), { recursive: true });
  await write(path.join(recoveredJob, retry.trialName, "verifier", "reward.json"), recoveryJson(recoveredReward));
  await write(path.join(recoveredJob, retry.trialName, "verifier", "diagnostics.json"), canonicalJson(diagnostics));
  await write(path.join(recoveredJob, retry.trialName, "verifier", "test-stdout.txt"), "deterministic fixture verifier\n");
  const recoveredManifest = await artifactManifest(recoveredJob);
  const recoveredDirectoryManifest = await directoryManifest(recoveredJob);
  const recoveredDigest = pythonDigest(recoveredManifest);
  const recoveryLockBody = {
    ...recoveryLockInputs,
    recoveredJob: {
      directory: recoveredJob,
      artifactDigest: recoveredDigest,
      artifactManifest: recoveredManifest,
      directoryManifest: recoveredDirectoryManifest,
    },
    lifecycle: [
      { status: "reserved", phase: "durable-before-verifier-runs", at: "2026-07-18T00:05:00Z" },
      { status: "running", phase: "verifier-runs-starting", at: "2026-07-18T00:05:01Z" },
      { status: "completed", phase: "recovered-job-sealed", at: "2026-07-18T00:06:00Z" },
    ],
  };
  const recoveryLock = {
    ...recoveryLockBody,
    recoveryRecordDigest: pythonDigest(recoveryLockBody),
  };
  await write(path.join(recoveryRoot, "recovery-lock.json"), canonicalJson(recoveryLock));

  const sourceKey = pythonDigest({ directory: original.jobDirectory, artifactDigest: sourceDigest }).slice("sha256:".length);
  const effectiveJob = path.join(resumeOutput, "effective-jobs", sourceKey, "effective-job");
  await fs.mkdir(effectiveJob, { recursive: true });
  await fs.copyFile(path.join(original.jobDirectory, "config.json"), path.join(effectiveJob, "config.json"));
  await fs.copyFile(path.join(original.jobDirectory, "lock.json"), path.join(effectiveJob, "lock.json"));
  const effectiveResult = {
    ...recoveredResult,
    started_at: "2026-07-18T00:01:00Z",
    finished_at: "2026-07-18T00:06:00Z",
  };
  const effectiveTrial = {
    ...recoveredTrial,
    id: original.trialName,
    trial_name: original.trialName,
    config: structuredClone(original.trial.config),
    task_id: { path: `${original.config.datasets[0].path}/q003` },
  };
  await write(path.join(effectiveJob, "result.json"), recoveryJson(effectiveResult));
  await write(path.join(effectiveJob, original.trialName, "result.json"), recoveryJson(effectiveTrial));
  const effectiveFiles = await artifactManifest(effectiveJob);
  const effectiveJobDigest = pythonDigest(effectiveFiles);
  const resumeManifest = {
    schemaVersion: 2,
    completionMode,
    recoveryContract,
    selectionPolicy,
    sourceJobArtifactDigest: sourceDigest,
    sourceJob: original.jobDirectory,
    recoveryRecordDigest: recoveryLock.recoveryRecordDigest,
    recovery: {
      completionMode,
      recoveryContract,
      recoveryRecordDigest: recoveryLock.recoveryRecordDigest,
      nativeRetryJobArtifactDigest: nativeDigest,
      recoveredJobArtifactDigest: recoveredDigest,
    },
    lineage: [{
      sourceTrialKey,
      selected: {
        lineage: "retry",
        attempt: 1,
        completionMode,
        nativeRetryJobArtifactDigest: nativeDigest,
        recoveredJobArtifactDigest: recoveredDigest,
        recoveryRecordDigest: recoveryLock.recoveryRecordDigest,
      },
    }],
    files: effectiveFiles,
    effectiveJobDigest,
  };
  const resumeManifestPath = path.join(effectiveJob, "resume-manifest.json");
  await write(resumeManifestPath, canonicalJson(resumeManifest));

  const recoveryResultBody = {
    schemaVersion: 1,
    kind: "harbor-post-agent-verifier-recovery-result",
    caseId: "q003-post-agent-artifact-eio-verifier-only/v1",
    recoveryContract,
    sourceTrialKey,
    attempt: 1,
    status: "evaluable",
    classification: "semantic",
    completionMode,
    selectionPolicy,
    rewardKey: fixture.protocol.frozenEvaluationProfile.rewardKey,
    reward: recoveredReward[fixture.protocol.frozenEvaluationProfile.rewardKey],
    rewards: storedRewardOne,
    recoveryRecordDigest: recoveryLock.recoveryRecordDigest,
    recoveredJobDirectory: recoveredJob,
    recoveredJobArtifactDigest: recoveredDigest,
    recoveredTrialResultSha256: `sha256:${await sha256File(path.join(recoveredJob, retry.trialName, "result.json"))}`,
    recoveredJobResultSha256: `sha256:${await sha256File(path.join(recoveredJob, "result.json"))}`,
    effectiveJobDirectory: effectiveJob,
    effectiveJobDigest,
    resumeManifestSha256: `sha256:${await sha256File(resumeManifestPath)}`,
    modelCalls,
    harborCalls: 0,
    verifierCalls: 2,
  };
  const recoveryResult = {
    ...recoveryResultBody,
    recoveryResultDigest: recoveryDigest(recoveryResultBody),
  };
  await write(path.join(recoveryRoot, "recovery-result.json"), recoveryJson(recoveryResult));
  return {
    authJson,
    jobs,
    v3AttestationPath,
    resumeOutput,
    resumeLockPath,
    retryDirectory,
    recoveryRoot,
    inputSnapshotRoot,
    recoveryLock,
    callJournalPath,
    callJournal,
    recoveredJob,
    trialName: retry.trialName,
    effectiveJob,
    effectiveJobDigest,
  };
}

test.after(async () => {
  for (const root of temporaryRoots) await fs.rm(root, { recursive: true, force: true });
});

test("tracked generation-003 protocol seals both direct-baseline candidates", () => {
  assert.deepEqual(TRACKED_PROTOCOL.target.children.map((child) => child.candidateId), CHILD_IDS);
  assert.equal(TRACKED_PROTOCOL.operator.operatorId, OPERATOR_ID);
  assert.equal(TRACKED_PROTOCOL.status, "sealed");
  for (const child of TRACKED_PROTOCOL.target.children) {
    assert.equal(child.parentCandidateId, "00-baseline");
    assert.notEqual(child.expectedTreeSha256, "0".repeat(64));
    assert.notEqual(child.expectedManifestSha256, "0".repeat(64));
    assert.notEqual(child.expectedOperatorRealizationSha256, "0".repeat(64));
  }
});

test("generation-003 prepares the native three-cell cohort without consuming prior fitness", async () => {
  const fixture = await makeFixture();
  const first = await prepareGeneration003(prepareOptions(fixture));
  assert.equal(first.mode, "prepared");
  const receiptPath = path.join(analysisPreparedRoot(fixture.runtimeRoot), "receipt.json");
  const before = await fs.readFile(receiptPath);
  assert.equal((await prepareGeneration003(prepareOptions(fixture))).mode, "verified-existing");
  assert.deepEqual(await fs.readFile(receiptPath), before);
  await verifyGeneration003(prepareOptions(fixture));

  const preparedRoot = analysisPreparedRoot(fixture.runtimeRoot);
  const harborRoot = path.join(preparedRoot, "configs", "harbor", "q003");
  assert.deepEqual(
    (await fs.readdir(harborRoot)).sort(),
    ["baseline", ...CHILD_IDS].map((id) => `${id}.yaml`).sort(),
  );
  await fs.stat(path.join(preparedRoot, "inputs", "baseline", "consult-semantic-okf", "SKILL.md"));
  await assert.rejects(fs.stat(path.join(preparedRoot, "tasks")), /ENOENT/);
  for (const candidateId of ["baseline", ...CHILD_IDS]) {
    const config = parseYaml(await fs.readFile(path.join(harborRoot, `${candidateId}.yaml`), "utf8"));
    assert.equal(config.retry.max_retries, 0);
    assert.deepEqual(config.datasets[0].task_names, ["q003"]);
    assert.match(config.datasets[0].path, /generation-001/);
    assert.doesNotMatch(config.datasets[0].path, /generation-002/);
    assert.equal(config.environment.mounts[0].read_only, true);
    assert.equal(config.environment.mounts[1].source, fixture.protocol.harbor.authenticationMount.source);
  }
  await assert.rejects(fs.stat(path.join(preparedRoot, "configs", "operator", "generation-003.yaml")), /ENOENT/);

  assert.equal(first.receipt.schemaVersion, 2);
  assert.equal(first.receipt.lineageParentEvidence.generationId, "generation-001");
  assert.equal(first.receipt.lineageParentEvidence.resultImported, false);
  assert.equal(first.receipt.lineageParentEvidence.fitnessImported, false);
  assert.equal(first.receipt.comparisonPolicy.generation002JobsReused, false);
  assert.equal(first.receipt.comparisonPolicy.generation002FitnessImported, false);
  assert.equal(first.receipt.comparisonPolicy.generation002OperatorCreditImported, false);
  assert.equal(first.receipt.comparisonPolicy.generation001ResultImported, false);
  assert.equal(first.receipt.comparisonPolicy.comparisonCohortGeneration, "generation-003");
  assert.equal(first.receipt.operator.generation, 0);
  assert.equal(first.receipt.operator.origin, "seed");
  assert.deepEqual(first.receipt.operator.parentOperatorIds, []);
  assert.equal(first.receipt.operator.previousGenerationLogImported, false);
  assert.equal(first.receipt.operator.resolvedConfigMaterializedDuringPreparation, false);
  assert.equal(first.receipt.callAccounting.generation003HarborInvocations, 4);
  assert.equal(first.receipt.callAccounting.generation003ModelExecutions, 3);
  assert.equal(first.receipt.callAccounting.historicalHarborInvocations, 9);
  assert.equal(first.receipt.callAccounting.historicalModelExecutions, 8);

  const wrapper = await fs.readFile(
    path.join(preparedRoot, "evidence", "run-q003-clean-pi.sh.disabled"),
    "utf8",
  );
  assert.match(wrapper, /install -m 600 -- "\$auth_json" "\$auth_mount\/auth\.json"/);
  assert.doesNotMatch(wrapper, /cp -a/);
  assert.match(wrapper, /isolated Pi directory must contain exactly auth\.json/);
  assert.match(wrapper, /settings\.json or shellPath/);
  assert.match(wrapper, /docker image inspect --format '\{\{\.Id\}\}' semantic-okf-harbor-runtime:1\.0/);
  assert.match(wrapper, /sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5/);
  assert.match(wrapper, /docker run --pull never --rm --network none --entrypoint \/bin\/bash/);
  assert.match(wrapper, /command -v python/);
  assert.match(wrapper, /candidate-extractive\/scripts\/harbor_answer\.py/);
  assert.match(wrapper, /candidate-contrast\/scripts\/harbor_answer\.py/);
  assert.match(wrapper, /python -B \/candidate-extractive\/scripts\/harbor_answer\.py --help/);
  assert.match(wrapper, /python -B \/candidate-contrast\/scripts\/harbor_answer\.py --help/);
  assert.match(wrapper, /mktemp \/tmp\/g003-preflight/);
  assert.equal((wrapper.match(/harbor run --config/g) ?? []).length, 2);
  const inspectAt = wrapper.indexOf("docker image inspect");
  const preflightAt = wrapper.indexOf("docker run --pull never");
  const callAt = wrapper.indexOf("harbor run --config");
  assert.ok(inspectAt < preflightAt && preflightAt < callAt);

  const baselineWrapper = await fs.readFile(path.join(preparedRoot, "run-q003-baseline-clean-pi.sh"), "utf8");
  assert.equal((baselineWrapper.match(/harbor run --config/g) ?? []).length, 1);
  assert.match(baselineWrapper, /verify-resume --runtime/);
  assert.match(baselineWrapper, /verify-auth-source --output/);
  assert.match(baselineWrapper, /fresh generation-003 baseline job already exists; never overwrite it/);
  const resumeAt = baselineWrapper.indexOf("verify-resume --runtime");
  const authAt = baselineWrapper.indexOf("verify-auth-source --output");
  const baselineMountAt = baselineWrapper.indexOf("mkdir -m 700");
  const baselineCallAt = baselineWrapper.indexOf("harbor run --config");
  assert.ok(resumeAt < authAt && authAt < baselineMountAt && baselineMountAt < baselineCallAt);
  assert.deepEqual(
    (await fs.readdir(preparedRoot)).filter((name) => name.endsWith(".sh")),
    ["run-q003-baseline-clean-pi.sh"],
  );
});

test("generation-003 adds prepared-v2 without changing the attested schema-1 prepared root", async () => {
  const fixture = await makeFixture();
  const legacy = await createLegacyPreparedV1(fixture);
  const result = await prepareGeneration003(prepareOptions(fixture));
  assert.equal(result.mode, "prepared-v2-overlay-from-v1");
  assert.deepEqual(await fs.readFile(path.join(legacy.legacyRoot, "receipt.json")), legacy.receiptBytes);
  assert.deepEqual(
    await treeDigest(legacy.legacyRoot, { omitRootFiles: ["receipt.json"] }),
    legacy.immutablePayload,
  );
  await assert.rejects(fs.stat(path.join(fixture.runtimeRoot, "prepared-v1-original")), /ENOENT/);
  await fs.stat(path.join(analysisPreparedRoot(fixture.runtimeRoot), "receipt.json"));
  assert.equal((await verifyGeneration003(prepareOptions(fixture))).mode, "verified");
  assert.equal((await prepareGeneration003(prepareOptions(fixture))).mode, "verified-existing");
});

test("generation-003 rejects generation-002 fitness reuse, diagnostic chaining, and drift", async () => {
  const fitness = await makeFixture();
  const fitnessProtocol = JSON.parse(await fs.readFile(fitness.protocolPath, "utf8"));
  fitnessProtocol.comparisonPolicy.generation002FitnessImported = true;
  await write(fitness.protocolPath, canonicalJson(fitnessProtocol));
  await assert.rejects(prepareGeneration003(prepareOptions(fitness)), /generation002FitnessImported drift/);

  const chain = await makeFixture();
  const chainProtocol = JSON.parse(await fs.readFile(chain.protocolPath, "utf8"));
  chainProtocol.diagnosticOperatorProvenance.importedAsPreviousGeneration = true;
  await write(chain.protocolPath, canonicalJson(chainProtocol));
  await assert.rejects(prepareGeneration003(prepareOptions(chain)), /importedAsPreviousGeneration drift/);

  const drift = await makeFixture();
  await fs.appendFile(drift.diagnosticLogPath, " \n");
  await assert.rejects(prepareGeneration003(prepareOptions(drift)), /diagnostic operator log SHA-256 drift/);

  const environment = await makeFixture();
  await write(path.join(environment.generation001RuntimeRoot, "prepared", "tasks", "q003", "environment", "unexpected.txt"), "drift\n");
  await assert.rejects(prepareGeneration003(prepareOptions(environment)), /q003 task tree drift|environment directory must remain present and empty/);
});

test("generation-003 publication selects a strict qualified improvement and leaks no private material", async () => {
  const fixture = await makeFixture();
  await prepareGeneration003(prepareOptions(fixture));
  const evidence = await createNativeCohortEvidence(fixture);
  const resolved = await resolveContrastEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot });
  assert.equal(resolved.selection.attempt, 1);
  assert.equal(resolved.provenance.effectiveJobDigest, evidence.effectiveJobDigest);
  const additiveResolved = await resolveContrastPostAgentEffectiveEvidence({
    protocol: fixture.protocol,
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(additiveResolved.selection.completionMode, "native-completed-retry");
  assert.deepEqual(additiveResolved.provenance.recoveryCalls, { harbor: 0, model: 0, verifier: 0 });
  assert.equal((await verifyContrastResume({ ...prepareOptions(fixture), runtimeRoot: fixture.runtimeRoot })).mode, "verified-resume");
  const result = await publishGeneration003({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(result.publication.gate.passed, true);
  assert.equal(result.publication.gate.selectedCandidateId, "child-001");
  assert.equal(result.publication.gate.nextStage, "separately-sealed-validation");
  assert.deepEqual(result.publication.records.map((record) => record.candidateId), [
    "baseline",
    "child-001",
    "child-002",
  ]);
  assert.deepEqual(result.publication.records.slice(1).map((record) => record.operatorId), [
    "operator-001",
    "operator-001",
  ]);
  assert.equal(result.publication.comparisonPolicy.generation002JobsReused, false);
  assert.equal(result.publication.comparisonPolicy.generation002FitnessImported, false);
  assert.equal(result.publication.comparisonPolicy.generation001ResultImported, false);
  assert.equal(result.publication.exactNativeComparison.candidateCount, 3);
  assert.equal(result.publication.exactNativeComparison.normalizedMountSources, 0);
  assert.equal(result.publication.callAccounting.generation003HarborInvocations, 4);
  assert.equal(result.publication.callAccounting.generation003ModelExecutions, 3);
  assert.equal(result.publication.callAccounting.generation003ExternalRetries, 1);
  assert.equal(result.publication.callAccounting.historicalHarborInvocations, 9);
  assert.equal(result.publication.callAccounting.historicalModelExecutions, 8);
  assert.equal(result.publication.provenance.authPayloadDigestPublished, false);
  assert.equal(result.publication.provenance.authCredentialMetadataPublished, false);
  assert.equal(result.publication.provenance.contrastResume.selectedAttempt, 1);
  assert.equal(result.publication.provenance.contrastResume.effectiveJobDigest, evidence.effectiveJobDigest);
  await fs.stat(path.join(fixture.runtimeRoot, "operator-inputs", "generation-003", "generation-003.json"));
  assert.deepEqual(await treeDigest(evidence.jobs[CHILD_IDS[1]].jobDirectory), evidence.originalContrastTreeBefore);
  const publicText = `${await fs.readFile(path.join(result.outputDirectory, "result.json"), "utf8")}\n${await fs.readFile(path.join(result.outputDirectory, "report.md"), "utf8")}`;
  assert.doesNotMatch(publicText, /PRIVATE_|reasoning|qrel|verifier_result|agent_result/i);
  assert.doesNotMatch(publicText, new RegExp(CHILD_IDS.join("|"), "i"));
  assert.match(result.publication.publicationSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    publishGeneration003({ ...prepareOptions(fixture), runtimeRoot: fixture.runtimeRoot }),
    /Publication output already exists/,
  );
});

test("generation-003 publication stops on all-zero gates and rejects job drift", async () => {
  const stopped = await makeFixture();
  await prepareGeneration003(prepareOptions(stopped));
  await createNativeCohortEvidence(stopped, { passing: false });
  const publication = await publishGeneration003({
    ...prepareOptions(stopped),
    runtimeRoot: stopped.runtimeRoot,
  });
  assert.equal(publication.publication.gate.passed, false);
  assert.equal(publication.publication.gate.status, "stopped");
  assert.equal(publication.publication.callAccounting.subsequentValidationPermitted, false);

  const drift = await makeFixture();
  await prepareGeneration003(prepareOptions(drift));
  await createNativeCohortEvidence(drift);
  const config = buildGeneration003HarborConfig({
    protocol: drift.protocol,
    candidateId: "baseline",
    runtimeRoot: drift.runtimeRoot,
    preparedRoot: analysisPreparedRoot(drift.runtimeRoot),
    knowledgeRoot: drift.knowledgeRoot,
    generation001RuntimeRoot: drift.generation001RuntimeRoot,
  });
  const jobConfigPath = path.join(
    drift.runtimeRoot,
    "jobs",
    "q003",
    "baseline",
    config.job_name,
    "config.json",
  );
  const changed = JSON.parse(await fs.readFile(jobConfigPath, "utf8"));
  changed.retry.max_retries = 1;
  await write(jobConfigPath, canonicalJson(changed));
  await assert.rejects(
    publishGeneration003({ ...prepareOptions(drift), runtimeRoot: drift.runtimeRoot }),
    /retry\.max_retries|retries drift/,
  );
});

test("generation-003 rejects auth drift, non-external retry contracts, and effective-job tampering", async () => {
  const auth = await makeFixture();
  await prepareGeneration003(prepareOptions(auth));
  const authEvidence = await createNativeCohortEvidence(auth);
  assert.equal((await verifyGeneration003Authentication({ ...prepareOptions(auth), authSource: authEvidence.authJson })).mode, "verified");
  assert.equal((await verifyPrivateAuthSeal({
    protocol: auth.protocol,
    runtimeRoot: auth.runtimeRoot,
    authJsonPath: authEvidence.authJson,
  })).verified, true);
  const changedAuth = JSON.parse(await fs.readFile(authEvidence.authJson, "utf8"));
  changedAuth["openai-codex"].access = "rotated-access";
  await write(authEvidence.authJson, canonicalJson(changedAuth));
  await assert.rejects(
    verifyGeneration003Authentication({ ...prepareOptions(auth), authSource: authEvidence.authJson }),
    /sealed auth payloadSha256|private payload seal/,
  );
  await assert.rejects(
    verifyPrivateAuthSeal({ protocol: auth.protocol, runtimeRoot: auth.runtimeRoot, authJsonPath: authEvidence.authJson }),
    /does not match the private payload seal/,
  );

  const classification = await makeFixture();
  await prepareGeneration003(prepareOptions(classification));
  const classificationEvidence = await createNativeCohortEvidence(classification);
  const lockPath = path.join(classificationEvidence.resumeOutput, "resume-lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  lock.sourceTrials[0].failureContract = "semantic-test-failure.v1";
  lock.attempts[0].failureContract = "semantic-test-failure.v1";
  const { attemptRecordDigest: _oldDigest, ...attemptBody } = lock.attempts[0];
  lock.attempts[0].attemptRecordDigest = pythonDigest(attemptBody);
  await write(lockPath, canonicalJson(lock));
  await assert.rejects(
    resolveContrastEffectiveEvidence({ protocol: classification.protocol, runtimeRoot: classification.runtimeRoot }),
    /source trial failure contract drift/,
  );

  const tamper = await makeFixture();
  await prepareGeneration003(prepareOptions(tamper));
  const tamperEvidence = await createNativeCohortEvidence(tamper);
  await fs.appendFile(path.join(tamperEvidence.effectiveJob, "result.json"), " \n");
  await assert.rejects(
    resolveContrastEffectiveEvidence({ protocol: tamper.protocol, runtimeRoot: tamper.runtimeRoot }),
    /effective job file manifest drift/,
  );
});

test("generation-003 completes the sealed post-agent EIO attempt with verifier-only recovery", async () => {
  const fixture = await makeFixture();
  const evidence = await createPostAgentRecoveryEvidence(fixture);
  const retryTreeBefore = await treeDigest(evidence.retryDirectory);
  const resumeLockBefore = await fs.readFile(evidence.resumeLockPath);
  const callJournalBefore = await fs.readFile(evidence.callJournalPath);

  const resolved = await resolveContrastPostAgentEffectiveEvidence({
    protocol: fixture.protocol,
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(resolved.selection.lineage, "retry");
  assert.equal(resolved.selection.attempt, 1);
  assert.equal(resolved.selection.completionMode, "verifier-only-recovery");
  assert.equal(resolved.provenance.effectiveJobDigest, evidence.effectiveJobDigest);
  assert.deepEqual(resolved.provenance.recoveryCalls, { harbor: 0, model: 0, verifier: 2 });
  assert.equal(resolved.provenance.callJournalSha256, `sha256:${await sha256File(evidence.callJournalPath)}`);
  assert.equal(resolved.provenance.callJournalRecordDigest, evidence.callJournal.journalRecordDigest);

  const firstOverlay = await prepareGeneration003PostAgent({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(firstOverlay.mode, "prepared-v3-overlay");
  assert.deepEqual((await fs.readdir(firstOverlay.overlayRoot)).sort(), [
    "receipt.json",
    "run-q003-baseline-post-agent.sh",
  ]);
  const receiptBefore = await fs.readFile(path.join(firstOverlay.overlayRoot, "receipt.json"));
  assert.equal((await prepareGeneration003PostAgent({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  })).mode, "verified-existing");
  assert.deepEqual(await fs.readFile(path.join(firstOverlay.overlayRoot, "receipt.json")), receiptBefore);
  assert.equal((await verifyGeneration003PostAgent({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  })).mode, "verified-post-agent-overlay");

  const verified = await verifyContrastPostAgentResume({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(verified.mode, "verified-post-agent-resume");
  assert.equal(verified.completionMode, "verifier-only-recovery");
  assert.deepEqual(verified.recoveryCalls, { harbor: 0, model: 0, verifier: 2 });
  assert.equal(verified.recoveryRecordFileSha256, `sha256:${await sha256File(path.join(evidence.recoveryRoot, "recovery-lock.json"))}`);
  assert.equal(verified.recoveryResultFileSha256, `sha256:${await sha256File(path.join(evidence.recoveryRoot, "recovery-result.json"))}`);

  const published = await publishGeneration003PostAgent({
    ...prepareOptions(fixture),
    runtimeRoot: fixture.runtimeRoot,
  });
  assert.equal(published.publication.gate.passed, true);
  assert.equal(published.publication.gate.selectedCandidateId, "child-001");
  assert.equal(published.publication.callAccounting.postAgentRecoveryHarborInvocations, 0);
  assert.equal(published.publication.callAccounting.postAgentRecoveryModelExecutions, 0);
  assert.equal(published.publication.callAccounting.deterministicCheckExecutions, 2);
  assert.equal(published.publication.provenance.contrastResume.completionMode, "verifier-only-recovery");
  assert.equal(
    published.publication.provenance.contrastResume.recoveryResultFileSha256,
    `sha256:${await sha256File(path.join(evidence.recoveryRoot, "recovery-result.json"))}`,
  );
  const publicText = `${await fs.readFile(path.join(published.outputDirectory, "result.json"), "utf8")}\n${await fs.readFile(path.join(published.outputDirectory, "report.md"), "utf8")}`;
  assert.doesNotMatch(publicText, /PRIVATE_|reasoning|qrel|verifier_result|agent_result/i);

  assert.deepEqual(await treeDigest(evidence.retryDirectory), retryTreeBefore);
  assert.deepEqual(await fs.readFile(evidence.resumeLockPath), resumeLockBefore);
  assert.deepEqual(await fs.readFile(evidence.callJournalPath), callJournalBefore);
});

test("post-agent recovery preserves Python float semantics and exact empty-directory topology", async () => {
  const fixture = await makeFixture();
  const evidence = await createPostAgentRecoveryEvidence(fixture, { pythonFloatSpellings: true });
  const firstReward = await fs.readFile(path.join(evidence.recoveryRoot, "verifier-runs", "run-001", "reward.json"), "utf8");
  const secondReward = await fs.readFile(path.join(evidence.recoveryRoot, "verifier-runs", "run-002", "reward.json"), "utf8");
  const recoveredReward = await fs.readFile(path.join(evidence.recoveredJob, evidence.trialName, "verifier", "reward.json"), "utf8");
  const recoveryResult = await fs.readFile(path.join(evidence.recoveryRoot, "recovery-result.json"), "utf8");
  assert.match(firstReward, /"evidence_contract_gate":1e0/);
  assert.match(firstReward, /"reward":0\.0/);
  assert.match(secondReward, /"evidence_contract_gate":1e0/);
  assert.match(recoveredReward, /"evidence_contract_gate":1\.0/);
  assert.match(recoveryResult, /"evidence_contract_gate":1e0/);
  assert.match(recoveryResult, /"reward":0\.0/);

  const recoveryLock = JSON.parse(await fs.readFile(path.join(evidence.recoveryRoot, "recovery-lock.json"), "utf8"));
  assert.deepEqual(recoveryLock.native.nativeRetryJobDirectoryManifest, [
    evidence.trialName,
    `${evidence.trialName}/agent`,
    `${evidence.trialName}/agent/setup`,
    `${evidence.trialName}/artifacts`,
    `${evidence.trialName}/artifacts/logs`,
    `${evidence.trialName}/artifacts/logs/artifacts`,
    `${evidence.trialName}/verifier`,
  ]);
  assert.deepEqual(recoveryLock.recoveredJob.directoryManifest, [
    evidence.trialName,
    `${evidence.trialName}/agent`,
    `${evidence.trialName}/artifacts`,
    `${evidence.trialName}/artifacts/logs`,
    `${evidence.trialName}/artifacts/logs/artifacts`,
    `${evidence.trialName}/verifier`,
  ]);

  await resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot });

  const recoveryResultPath = path.join(evidence.recoveryRoot, "recovery-result.json");
  await write(recoveryResultPath, recoveryResult.replace('"evidence_contract_gate":1e0', '"evidence_contract_gate":1e-1'));
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
    /unsupported Python float exponent/,
  );
  await write(recoveryResultPath, recoveryResult);

  const extraNativeDirectory = path.join(evidence.retryDirectory, evidence.trialName, "unexpected-empty");
  await fs.mkdir(extraNativeDirectory);
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
    /native retry job directory topology differs from its manifest/,
  );
  await fs.rm(extraNativeDirectory, { recursive: true });

  const extraRecoveredDirectory = path.join(evidence.recoveredJob, evidence.trialName, "unexpected-empty");
  await fs.mkdir(extraRecoveredDirectory);
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
    /recovered Harbor job directory topology differs from its manifest/,
  );
});

test("post-agent recovery requires the exact sealed attempt and input namespaces", async () => {
  const fixture = await makeFixture();
  const evidence = await createPostAgentRecoveryEvidence(fixture);
  const resolve = () => resolveContrastPostAgentEffectiveEvidence({
    protocol: fixture.protocol,
    runtimeRoot: fixture.runtimeRoot,
  });

  const extraAttemptFile = path.join(evidence.recoveryRoot, "unexpected.txt");
  await write(extraAttemptFile, "unexpected\n");
  await assert.rejects(resolve(), /verifier recovery attempt root direct children differ/);
  await fs.rm(extraAttemptFile);

  const extraInputChild = path.join(evidence.inputSnapshotRoot, "unexpected");
  await fs.mkdir(extraInputChild);
  await assert.rejects(resolve(), /recovery input snapshot direct children differ/);
  await fs.rmdir(extraInputChild);

  const agentSnapshot = path.join(evidence.inputSnapshotRoot, "agent");
  const extraAgentFile = path.join(agentSnapshot, "unexpected.txt");
  await write(extraAgentFile, "unexpected\n");
  await assert.rejects(resolve(), /recovery agent input snapshot artifact manifest drift/);
  await fs.rm(extraAgentFile);
  const extraAgentDirectory = path.join(agentSnapshot, "unexpected-empty");
  await fs.mkdir(extraAgentDirectory);
  await assert.rejects(resolve(), /recovery agent input snapshot topology directories differ from its file manifest/);
  await fs.rmdir(extraAgentDirectory);

  const testsSnapshot = path.join(evidence.inputSnapshotRoot, "tests");
  const scoreSnapshot = path.join(testsSnapshot, "score.py");
  const scoreBytes = await fs.readFile(scoreSnapshot);
  await fs.appendFile(scoreSnapshot, "# drift\n");
  await assert.rejects(resolve(), /recovery tests input snapshot artifact manifest drift/);
  await fs.writeFile(scoreSnapshot, scoreBytes);
  const extraTestsDirectory = path.join(testsSnapshot, "unexpected-empty");
  await fs.mkdir(extraTestsDirectory);
  await assert.rejects(resolve(), /recovery tests input snapshot topology directories differ from its file manifest/);
  await fs.rmdir(extraTestsDirectory);

  const verifierRuns = path.join(evidence.recoveryRoot, "verifier-runs");
  const extraRunDirectory = path.join(verifierRuns, "run-003");
  await fs.mkdir(extraRunDirectory);
  await assert.rejects(resolve(), /recovery verifier runs direct children differ/);
  await fs.rmdir(extraRunDirectory);
  const extraRunFile = path.join(verifierRuns, "run-001", "unexpected.txt");
  await write(extraRunFile, "unexpected\n");
  await assert.rejects(resolve(), /verifier run 1 direct children differ/);
  await fs.rm(extraRunFile);

  const recoveryResultPath = path.join(evidence.recoveryRoot, "recovery-result.json");
  const externalHardLink = path.join(fixture.root, "recovery-result-hard-link.json");
  await fs.link(recoveryResultPath, externalHardLink);
  await assert.rejects(resolve(), /recovery-result\.json must not be hard linked/);
  await fs.rm(externalHardLink);
});

test("post-agent recovery fails closed outside the exact external failure envelope", async () => {
  for (const [nativeFailure, pattern] of [
    ["wrong-exception", /native retry exception type drift/],
    ["verifier-started", /native retry verifier timing drift/],
    ["incomplete-trace", /q003 native trace event count drift/],
    ["wrong-model", /native retry trial agent model drift/],
    ["traceback-newline-drift", /native retry exception artifact differs from TrialResult traceback bytes/],
  ]) {
    const fixture = await makeFixture();
    await createPostAgentRecoveryEvidence(fixture, { nativeFailure });
    await assert.rejects(
      resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
      pattern,
    );
  }

  const nondeterministic = await makeFixture();
  await createPostAgentRecoveryEvidence(nondeterministic, { deterministicMismatch: true });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: nondeterministic.protocol, runtimeRoot: nondeterministic.runtimeRoot }),
    /deterministic verifier rewards differs/,
  );

  const extraModelCall = await makeFixture();
  await createPostAgentRecoveryEvidence(extraModelCall, { modelCalls: 1 });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: extraModelCall.protocol, runtimeRoot: extraModelCall.runtimeRoot }),
    /recovery model calls drift/,
  );
});

test("post-agent recovery requires a durable self-sealed two-call journal", async () => {
  for (const [journalMutation, pattern] of [
    ["failed-run", /recovery call journal run 1 status drift/],
    ["input-drift", /call journal agent input manifest differs/],
    ["model-call", /recovery call journal model calls drift/],
  ]) {
    const fixture = await makeFixture();
    await createPostAgentRecoveryEvidence(fixture, { journalMutation });
    await assert.rejects(
      resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
      pattern,
    );
  }

  const missing = await makeFixture();
  const missingEvidence = await createPostAgentRecoveryEvidence(missing);
  const missingLockPath = path.join(missingEvidence.recoveryRoot, "recovery-lock.json");
  const missingLock = JSON.parse(await fs.readFile(missingLockPath, "utf8"));
  delete missingLock.callJournal;
  delete missingLock.recoveryRecordDigest;
  missingLock.recoveryRecordDigest = pythonDigest(missingLock);
  await write(missingLockPath, canonicalJson(missingLock));
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: missing.protocol, runtimeRoot: missing.runtimeRoot }),
    /recovery lock lacks callJournal/,
  );

  const tamperedBytes = await makeFixture();
  const tamperedBytesEvidence = await createPostAgentRecoveryEvidence(tamperedBytes);
  await fs.appendFile(tamperedBytesEvidence.callJournalPath, " \n");
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: tamperedBytes.protocol, runtimeRoot: tamperedBytes.runtimeRoot }),
    /recovery call journal file digest drift/,
  );

  async function rewriteJournal(evidence, mutate, { resealJournal }) {
    const journal = JSON.parse(await fs.readFile(evidence.callJournalPath, "utf8"));
    mutate(journal);
    if (resealJournal) {
      delete journal.journalRecordDigest;
      journal.journalRecordDigest = pythonDigest(journal);
    }
    await write(evidence.callJournalPath, canonicalJson(journal));
    const lockPath = path.join(evidence.recoveryRoot, "recovery-lock.json");
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
    lock.callJournal.sha256 = `sha256:${await sha256File(evidence.callJournalPath)}`;
    lock.callJournal.journalRecordDigest = journal.journalRecordDigest;
    delete lock.recoveryRecordDigest;
    lock.recoveryRecordDigest = pythonDigest(lock);
    await write(lockPath, canonicalJson(lock));
  }

  const incompleteRunRecord = await makeFixture();
  const incompleteRunRecordEvidence = await createPostAgentRecoveryEvidence(incompleteRunRecord);
  await rewriteJournal(incompleteRunRecordEvidence, (journal) => {
    delete journal.runs[0].directory;
  }, { resealJournal: true });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: incompleteRunRecord.protocol, runtimeRoot: incompleteRunRecord.runtimeRoot }),
    /recovery call journal run 1 lacks directory/,
  );

  const nonzeroExit = await makeFixture();
  const nonzeroExitEvidence = await createPostAgentRecoveryEvidence(nonzeroExit);
  await rewriteJournal(nonzeroExitEvidence, (journal) => {
    journal.runs[0].exitCode = 1;
  }, { resealJournal: true });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: nonzeroExit.protocol, runtimeRoot: nonzeroExit.runtimeRoot }),
    /recovery call journal run 1 exit code drift/,
  );

  const lifecycleDrift = await makeFixture();
  const lifecycleDriftEvidence = await createPostAgentRecoveryEvidence(lifecycleDrift);
  await rewriteJournal(lifecycleDriftEvidence, (journal) => {
    journal.lifecycle[2].phase = "verifier-runs-starting";
  }, { resealJournal: true });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: lifecycleDrift.protocol, runtimeRoot: lifecycleDrift.runtimeRoot }),
    /recovery call journal lifecycle phases differs/,
  );

  const brokenSeal = await makeFixture();
  const brokenSealEvidence = await createPostAgentRecoveryEvidence(brokenSeal);
  await rewriteJournal(brokenSealEvidence, (journal) => {
    journal.lifecycle[1].at = "2026-07-18T00:05:01.500Z";
  }, { resealJournal: false });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: brokenSeal.protocol, runtimeRoot: brokenSeal.runtimeRoot }),
    /recovery call journal seal drift/,
  );

  const falseRunHash = await makeFixture();
  const falseRunHashEvidence = await createPostAgentRecoveryEvidence(falseRunHash);
  await rewriteJournal(falseRunHashEvidence, (journal) => {
    journal.runs[0].rewardSha256 = `sha256:${"c".repeat(64)}`;
  }, { resealJournal: true });
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: falseRunHash.protocol, runtimeRoot: falseRunHash.runtimeRoot }),
    /recovery call journal run 1 rewardSha256 drift/,
  );

  const wrongPath = await makeFixture();
  const wrongPathEvidence = await createPostAgentRecoveryEvidence(wrongPath);
  const wrongPathLockPath = path.join(wrongPathEvidence.recoveryRoot, "recovery-lock.json");
  const wrongPathLock = JSON.parse(await fs.readFile(wrongPathLockPath, "utf8"));
  wrongPathLock.callJournal.path = wrongPathLockPath;
  delete wrongPathLock.recoveryRecordDigest;
  wrongPathLock.recoveryRecordDigest = pythonDigest(wrongPathLock);
  await write(wrongPathLockPath, canonicalJson(wrongPathLock));
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: wrongPath.protocol, runtimeRoot: wrongPath.runtimeRoot }),
    /recovery call journal differs from its fixed path/,
  );
});

test("post-agent recovery binds the frozen q003 task tree independently of its recovery receipt", async () => {
  const declarationFixture = await makeFixture();
  const declarationEvidence = await createPostAgentRecoveryEvidence(declarationFixture);
  const declarationLockPath = path.join(declarationEvidence.recoveryRoot, "recovery-lock.json");
  const declarationLock = JSON.parse(await fs.readFile(declarationLockPath, "utf8"));
  declarationLock.task.treeSha256 = "0".repeat(64);
  delete declarationLock.recoveryRecordDigest;
  declarationLock.recoveryRecordDigest = pythonDigest(declarationLock);
  await write(declarationLockPath, canonicalJson(declarationLock));
  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({
      protocol: declarationFixture.protocol,
      runtimeRoot: declarationFixture.runtimeRoot,
    }),
    /recovery task frozen tree digest drift/,
  );

  const fixture = await makeFixture();
  const evidence = await createPostAgentRecoveryEvidence(fixture);
  const scorePath = path.join(fixture.generation001RuntimeRoot, "prepared", "tasks", "q003", "tests", "score.py");
  await fs.appendFile(scorePath, "# malicious drift after the model run\n");

  const lockPath = path.join(evidence.recoveryRoot, "recovery-lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  lock.task.taskTestsArtifactManifest = await artifactManifest(path.dirname(scorePath));
  lock.task.taskTestsArtifactDigest = pythonDigest(lock.task.taskTestsArtifactManifest);
  delete lock.recoveryRecordDigest;
  lock.recoveryRecordDigest = pythonDigest(lock);
  await write(lockPath, canonicalJson(lock));

  await assert.rejects(
    resolveContrastPostAgentEffectiveEvidence({ protocol: fixture.protocol, runtimeRoot: fixture.runtimeRoot }),
    /q003 task tree digest drift/,
  );
});

test("generation-003 keeps legacy runner disabled and exposes only the guarded baseline entrypoint", {
  skip: !wslAvailable,
}, async () => {
  const fixture = await makeFixture();
  await prepareGeneration003(prepareOptions(fixture));
  const preparedRoot = analysisPreparedRoot(fixture.runtimeRoot);
  const wrapper = path.join(preparedRoot, "evidence", "run-q003-clean-pi.sh.disabled");
  const syntax = spawnSync("wsl", ["bash", "-n", toHarborPath(wrapper)], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(syntax.status, 0, syntax.stderr);
  const baselineWrapper = path.join(preparedRoot, "run-q003-baseline-clean-pi.sh");
  const baselineSyntax = spawnSync("wsl", ["bash", "-n", toHarborPath(baselineWrapper)], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(baselineSyntax.status, 0, baselineSyntax.stderr);
  assert.equal((await fs.readFile(wrapper, "utf8")).match(/harbor run --config/g)?.length, 2);
  assert.equal((await fs.readFile(baselineWrapper, "utf8")).match(/harbor run --config/g)?.length, 1);
  assert.deepEqual((await fs.readdir(preparedRoot)).filter((name) => name.endsWith(".sh")), [
    "run-q003-baseline-clean-pi.sh",
  ]);
});
