#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const META_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(META_ROOT, "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(META_ROOT, "protocol.json");
const DEFAULT_SOURCE_PROTOCOL = path.join(STUDY_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_PREPARED_STUDY = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "prepared",
);
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-001",
);

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PORTABLE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const OMITTED_TREE_NAMES = new Set(["__pycache__"]);

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function objectDigest(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

async function readJson(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`, { cause: error });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`JSON root must be an object: ${filePath}`);
  }
  return parsed;
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

function assertInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    (!allowRoot && relative === "")
    || relative.startsWith("..")
    || path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must be inside ${resolvedRoot}: ${resolved}`);
  }
  return resolved;
}

function assertRuntimeOutput(outputRoot, repoRoot = REPO_ROOT) {
  return assertInside(path.join(repoRoot, ".tmp"), outputRoot, "Runtime output");
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

async function collectTreeFiles(root, current = root, files = []) {
  await assertOrdinaryDirectory(current, "Tree entry");
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (OMITTED_TREE_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    const stat = await fs.lstat(absolute);
    if (entry.isSymbolicLink() || stat.isSymbolicLink()) {
      throw new Error(`Trees must not contain links or junctions: ${absolute}`);
    }
    if (entry.isDirectory()) {
      await collectTreeFiles(root, absolute, files);
    } else if (entry.isFile()) {
      files.push({
        absolute,
        relative: path.relative(root, absolute).split(path.sep).join("/"),
      });
    } else {
      throw new Error(`Unsupported tree entry: ${absolute}`);
    }
  }
  return files;
}

export async function treeDigest(root, { omitRootFiles = [] } = {}) {
  const omitted = new Set(omitRootFiles);
  const files = (await collectTreeFiles(path.resolve(root))).filter(
    (entry) => !omitted.has(entry.relative),
  );
  files.sort((left, right) => Buffer.compare(
    Buffer.from(left.relative, "utf8"),
    Buffer.from(right.relative, "utf8"),
  ));
  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const entry of files) {
    const bytes = await fs.readFile(entry.absolute);
    totalBytes += bytes.length;
    hash.update(Buffer.from(entry.relative, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return { sha256: hash.digest("hex"), fileCount: files.length, totalBytes };
}

async function copyTree(source, destination) {
  const sourceRoot = path.resolve(source);
  await collectTreeFiles(sourceRoot);
  await fs.mkdir(destination, { recursive: true });

  async function copyDirectory(currentSource, currentDestination) {
    const entries = await fs.readdir(currentSource, { withFileTypes: true });
    for (const entry of entries) {
      if (OMITTED_TREE_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) {
        continue;
      }
      const sourceEntry = path.join(currentSource, entry.name);
      const destinationEntry = path.join(currentDestination, entry.name);
      const stat = await fs.lstat(sourceEntry);
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) {
        throw new Error(`Trees must not contain links or junctions: ${sourceEntry}`);
      }
      if (entry.isDirectory()) {
        await fs.mkdir(destinationEntry, { recursive: false });
        await copyDirectory(sourceEntry, destinationEntry);
      } else if (entry.isFile()) {
        await fs.copyFile(sourceEntry, destinationEntry, fs.constants.COPYFILE_EXCL);
      } else {
        throw new Error(`Unsupported tree entry: ${sourceEntry}`);
      }
    }
  }
  await copyDirectory(sourceRoot, destination);
}

async function assertHarborTaskShape(taskRoot, label) {
  await assertOrdinaryDirectory(taskRoot, label);
  for (const directory of ["environment", "solution", "tests"]) {
    await assertOrdinaryDirectory(path.join(taskRoot, directory), `${label} ${directory}`);
  }
  for (const file of ["instruction.md", "task.toml"]) {
    const stat = await fs.lstat(path.join(taskRoot, file));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${label} ${file} must be an ordinary file`);
    }
  }
}

function gitOutput(root, args) {
  const completed = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (completed.error) {
    throw completed.error;
  }
  if (completed.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${completed.stderr.trim()}`);
  }
  return completed.stdout.trim();
}

export function assertCleanPinnedKnowledge(knowledgeRoot, expectedCommit) {
  const commit = gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]);
  if (commit !== expectedCommit) {
    throw new Error(`knowledge commit drift: expected ${expectedCommit}, found ${commit}`);
  }
  const status = gitOutput(knowledgeRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("knowledge repository must be completely clean before preparation");
  }
  return commit;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSha(value, label) {
  if (!HEX_SHA256.test(requireString(value, label))) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requirePortableId(value, label) {
  if (!PORTABLE_ID.test(requireString(value, label))) {
    throw new Error(`${label} must be a portable lowercase identifier`);
  }
  return value;
}

function deepEqual(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} drift`);
  }
}

function assertValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

export function frozenProfileFromSource(sourceProtocol) {
  const profile = requireObject(sourceProtocol.evaluationProfile, "source evaluationProfile");
  return {
    harborVersion: profile.harborVersion,
    agent: profile.agent,
    attemptsPerCandidateTask: profile.attemptsPerCandidateTask,
    retries: profile.retries,
    rewardKey: profile.rewardKey,
    passThreshold: profile.passThreshold,
    requiredRewards: profile.requiredRewards,
  };
}

function validateMetaProtocol(metaProtocol, sourceProtocol) {
  if (metaProtocol.schemaVersion !== 1) {
    throw new Error("meta protocol schemaVersion must be 1");
  }
  requireString(metaProtocol.experimentId, "experimentId");
  const target = requireObject(metaProtocol.target, "target");
  const logicalName = requirePortableId(target.logicalName, "target.logicalName");
  if (target.baseline.candidateId !== "baseline") {
    throw new Error("target baseline candidateId must be baseline");
  }
  requirePortableId(target.baseline.lineageCandidateId, "target.baseline.lineageCandidateId");
  requireSha(target.baseline.expectedTreeSha256, "target.baseline.expectedTreeSha256");
  const children = requireArray(target.children, "target.children");
  if (children.length !== 2) {
    throw new Error("target.children must contain exactly two children");
  }
  const childIds = new Set();
  for (const [index, child] of children.entries()) {
    requirePortableId(child.candidateId, `target.children[${index}].candidateId`);
    requireString(child.sourcePath, `target.children[${index}].sourcePath`);
    requireSha(child.expectedTreeSha256, `target.children[${index}].expectedTreeSha256`);
    if (child.parentCandidateId !== target.baseline.lineageCandidateId) {
      throw new Error(`target.children[${index}] must descend from the sealed baseline lineage`);
    }
    if (child.operatorId !== metaProtocol.operator.operatorId) {
      throw new Error(`target.children[${index}] operatorId drift`);
    }
    if (childIds.has(child.candidateId)) {
      throw new Error("child candidate IDs must be distinct");
    }
    childIds.add(child.candidateId);
  }
  const task = requireObject(metaProtocol.preparationTask, "preparationTask");
  if (task.taskId !== "q003" || task.stage !== "design-development") {
    throw new Error("preparationTask must be q003 design-development only");
  }
  requireSha(task.expectedTreeSha256, "preparationTask.expectedTreeSha256");
  const stages = requireArray(metaProtocol.stopPolicy?.stages, "stopPolicy.stages");
  deepEqual(
    stages.map((stage) => stage.taskIds),
    [["q003"], ["q007"], ["q018", "q024", "q030"]],
    "stopPolicy stage tasks",
  );
  if (metaProtocol.callBudget?.maximumAgentCalls !== 11) {
    throw new Error("callBudget.maximumAgentCalls must be 11");
  }
  if (
    metaProtocol.harbor?.knowledgeMountReadOnly !== true
    || metaProtocol.harbor?.authenticationMountReadOnly !== false
    || metaProtocol.harbor?.authenticationMount?.readOnly !== false
  ) {
    throw new Error("Harbor mount policy must keep /knowledge read-only and isolated authentication writable");
  }
  if (metaProtocol.harbor?.modelCallsDuringPreparation !== 0) {
    throw new Error("Preparation model-call budget must remain zero");
  }
  const sourceProfile = frozenProfileFromSource(sourceProtocol);
  deepEqual(metaProtocol.frozenEvaluationProfile, sourceProfile, "frozen evaluation profile");
  if (objectDigest(sourceProfile) !== metaProtocol.frozenEvaluationProfileSha256) {
    throw new Error("frozen evaluation profile digest drift");
  }
  if (logicalName !== "consult-semantic-okf") {
    throw new Error("this frozen experiment requires consult-semantic-okf");
  }
}

async function readSkillName(skillRoot) {
  const contents = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const match = contents.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new Error(`SKILL.md has no YAML frontmatter: ${skillRoot}`);
  }
  const frontmatter = parseYaml(match[1]);
  return requirePortableId(frontmatter?.name, `${skillRoot} frontmatter.name`);
}

async function validateChildLineage({ child, protocol, repoRoot, actualTreeSha256 }) {
  const candidateRoot = path.resolve(repoRoot, ...child.sourcePath.split("/").slice(0, -1));
  const manifestPath = assertInside(
    candidateRoot,
    path.join(repoRoot, ...child.manifestPath.split("/")),
    `Candidate ${child.candidateId} manifest`,
  );
  const realizationPath = assertInside(
    candidateRoot,
    path.join(repoRoot, ...child.operatorRealizationPath.split("/")),
    `Candidate ${child.candidateId} operator realization`,
  );
  const [manifest, realization] = await Promise.all([
    readJson(manifestPath),
    readJson(realizationPath),
  ]);
  const expected = {
    generationId: protocol.generationId,
    candidateId: child.candidateId,
    operatorId: protocol.operator.operatorId,
    parentCandidateId: protocol.target.baseline.lineageCandidateId,
    parentTreeSha256: protocol.target.baseline.expectedTreeSha256,
    parentSourceCommit: protocol.knowledge.commit,
    skillName: protocol.target.logicalName,
    skillTreeSha256: actualTreeSha256,
  };
  assertValue(manifest.generationId, expected.generationId, `${child.candidateId} manifest generationId`);
  assertValue(manifest.candidateId, expected.candidateId, `${child.candidateId} manifest candidateId`);
  assertValue(manifest.operatorId, expected.operatorId, `${child.candidateId} manifest operatorId`);
  assertValue(manifest.parentCandidateId, expected.parentCandidateId, `${child.candidateId} manifest parentCandidateId`);
  assertValue(manifest.parentTreeSha256, expected.parentTreeSha256, `${child.candidateId} manifest parentTreeSha256`);
  assertValue(manifest.parentSourceCommit, expected.parentSourceCommit, `${child.candidateId} manifest parentSourceCommit`);
  assertValue(manifest.skill?.name, expected.skillName, `${child.candidateId} manifest skill.name`);
  assertValue(manifest.skill?.basename, expected.skillName, `${child.candidateId} manifest skill.basename`);
  assertValue(manifest.skill?.treeSha256, expected.skillTreeSha256, `${child.candidateId} manifest skill.treeSha256`);
  assertValue(realization.generationId, expected.generationId, `${child.candidateId} realization generationId`);
  assertValue(realization.candidateId, expected.candidateId, `${child.candidateId} realization candidateId`);
  assertValue(realization.operatorId, expected.operatorId, `${child.candidateId} realization operatorId`);
  assertValue(realization.parentCandidateId, expected.parentCandidateId, `${child.candidateId} realization parentCandidateId`);
  assertValue(realization.candidateTreeSha256, expected.skillTreeSha256, `${child.candidateId} realization candidateTreeSha256`);
  const parents = requireArray(realization.parentCandidates, `${child.candidateId} realization parentCandidates`);
  if (parents.length !== 1) {
    throw new Error(`${child.candidateId} realization must seal exactly one parent`);
  }
  assertValue(parents[0].candidateId, expected.parentCandidateId, `${child.candidateId} realization parent candidateId`);
  assertValue(parents[0].treeSha256, expected.parentTreeSha256, `${child.candidateId} realization parent treeSha256`);
  assertValue(parents[0].sourceCommit, expected.parentSourceCommit, `${child.candidateId} realization parent sourceCommit`);
  return {
    manifestSha256: await sha256File(manifestPath),
    operatorRealizationSha256: await sha256File(realizationPath),
  };
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (match) {
    return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
  }
  return normalized;
}

function jobName(protocol, candidateId) {
  return `${protocol.harbor.jobNamePrefix}-q003-${candidateId}`;
}

export function buildHarborJobConfig({
  protocol,
  candidateId,
  runtimeRoot,
  preparedRoot,
  knowledgeRoot,
}) {
  const profile = protocol.frozenEvaluationProfile;
  const agent = profile.agent;
  const skillPath = path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName);
  const jobsDir = path.join(runtimeRoot, "jobs", "q003", candidateId);
  const taskRoot = path.join(preparedRoot, "tasks");
  const referenceBundle = path.join(
    knowledgeRoot,
    ...protocol.knowledge.referenceBundlePath.split("/"),
  );
  return {
    job_name: jobName(protocol, candidateId),
    jobs_dir: toHarborPath(jobsDir),
    n_attempts: profile.attemptsPerCandidateTask,
    install_only: false,
    timeout_multiplier: 1,
    debug: false,
    n_concurrent_trials: 1,
    quiet: false,
    retry: {
      max_retries: profile.retries,
      exclude_exceptions: protocol.harbor.retryExcludeExceptions,
      wait_multiplier: 1,
      min_wait_sec: 1,
      max_wait_sec: 60,
    },
    environment: {
      type: "docker",
      force_build: false,
      delete: true,
      cpu_enforcement_policy: "auto",
      memory_enforcement_policy: "auto",
      mounts: [
        {
          type: "bind",
          source: toHarborPath(referenceBundle),
          target: "/knowledge",
          read_only: true,
          bind: { create_host_path: false },
        },
        {
          type: "bind",
          source: protocol.harbor.authenticationMount.source,
          target: protocol.harbor.authenticationMount.target,
          bind: { create_host_path: false },
        },
      ],
      extra_docker_compose: [],
      kwargs: {},
      extra_allowed_hosts: [],
    },
    verifier: { disable: false },
    metrics: [],
    agents: [
      {
        name: agent.name,
        model_name: agent.model,
        n_concurrent: 1,
        skills: [toHarborPath(skillPath)],
        extra_allowed_hosts: [],
        kwargs: { version: agent.version, thinking: agent.thinking },
        env: { PI_CODING_AGENT_DIR: protocol.harbor.authenticationMount.target },
        mcp_servers: [],
      },
    ],
    datasets: [
      {
        path: toHarborPath(taskRoot),
        overwrite: false,
        task_names: ["q003"],
      },
    ],
    tasks: [],
    artifacts: [],
    extra_instruction_paths: [],
  };
}

export function buildOperatorConfig({ protocol, runtimeRoot, preparedRoot }) {
  const operator = protocol.operator;
  const allCandidates = [protocol.target.baseline, ...protocol.target.children];
  const relativeSkill = (candidateId) => path.posix.join(
    "../..",
    "inputs",
    candidateId,
    protocol.target.logicalName,
  );
  const relativeJob = (candidateId) => path.posix.join(
    "../../..",
    "jobs",
    "q003",
    candidateId,
    jobName(protocol, candidateId),
  );
  const candidates = allCandidates.map((candidate) => {
    const record = {
      candidateId: candidate.candidateId,
      skill: relativeSkill(candidate.candidateId),
      jobDirectory: relativeJob(candidate.candidateId),
    };
    if (candidate.candidateId !== "baseline") {
      record.parentCandidateId = "baseline";
      record.operatorId = candidate.operatorId;
    }
    return record;
  });
  return {
    schemaVersion: 1,
    evolution: {
      id: protocol.experimentId,
      generation: 0,
      generationId: protocol.generationId,
      outputDir: "../../../operator-analysis/generation-001",
      baselineCandidateId: "baseline",
    },
    harbor: {
      rewardKey: protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: protocol.frozenEvaluationProfile.passThreshold,
      requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
      requireNoErrors: true,
      requiredEnv: [],
      diagnosticChars: 3000,
    },
    coevolution: {
      candidateSurvivors: 2,
      operatorSurvivors: 2,
      nextOperatorCount: 2,
      minimumOperatorTrials: 2,
      allowCaseRegressionsForCredit: false,
      complementaryRepair: true,
    },
    operators: [
      {
        operatorId: operator.operatorId,
        instruction: operator.instruction,
        parentOperatorIds: [],
        origin: "seed",
      },
      {
        operatorId: operator.controlOperatorId,
        instruction: operator.controlInstruction,
        parentOperatorIds: [],
        origin: "seed",
      },
    ],
    candidates,
    holdout: {
      baseline: {
        candidateId: "baseline",
        jobDirectory: "../../../not-opened/holdout-baseline",
      },
      candidate: {
        candidateId: protocol.target.children[0].candidateId,
        jobDirectory: "../../../not-opened/holdout-candidate",
      },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

function yamlDocument(value) {
  return stringifyYaml(value, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  });
}

async function writeExclusive(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "wx" });
}

async function validateInputs({
  repoRoot,
  metaRoot,
  protocolPath,
  sourceProtocolPath,
  knowledgeRoot,
  preparedStudyRoot,
}) {
  const [protocol, sourceProtocol] = await Promise.all([
    readJson(protocolPath),
    readJson(sourceProtocolPath),
  ]);
  validateMetaProtocol(protocol, sourceProtocol);
  if (protocol.knowledge.commit !== sourceProtocol.sourceFreeze.repository.commit) {
    throw new Error("meta protocol knowledge commit differs from the source study");
  }
  if (protocol.knowledge.baselineSkillPath !== sourceProtocol.sourceFreeze.dataset.baselineSkillPath) {
    throw new Error("meta protocol baseline path differs from the source study");
  }
  if (protocol.knowledge.referenceBundlePath !== sourceProtocol.sourceFreeze.dataset.referenceBundlePath) {
    throw new Error("meta protocol reference bundle differs from the source study");
  }
  const knowledgeCommit = assertCleanPinnedKnowledge(knowledgeRoot, protocol.knowledge.commit);
  const baselineSource = assertInside(
    knowledgeRoot,
    path.join(knowledgeRoot, ...protocol.knowledge.baselineSkillPath.split("/")),
    "Baseline skill",
  );
  const q003Source = assertInside(
    preparedStudyRoot,
    path.join(preparedStudyRoot, "tasks", "discovery", "q003"),
    "q003 task",
  );
  await assertHarborTaskShape(q003Source, "q003 source task");
  const sources = [
    { ...protocol.target.baseline, source: baselineSource },
    ...protocol.target.children.map((candidate) => ({
      ...candidate,
      source: assertInside(
        repoRoot,
        path.join(repoRoot, ...candidate.sourcePath.split("/")),
        `Candidate ${candidate.candidateId}`,
      ),
    })),
  ];
  const sourceDigests = [];
  for (const candidate of sources) {
    await assertOrdinaryDirectory(candidate.source, `Candidate ${candidate.candidateId}`);
    const name = await readSkillName(candidate.source);
    if (name !== protocol.target.logicalName || path.basename(candidate.source) !== name) {
      throw new Error(`Candidate ${candidate.candidateId} must use canonical basename ${name}`);
    }
    const digest = await treeDigest(candidate.source);
    if (digest.sha256 !== candidate.expectedTreeSha256) {
      throw new Error(`Candidate ${candidate.candidateId} digest drift: expected ${candidate.expectedTreeSha256}, found ${digest.sha256}`);
    }
    sourceDigests.push({ candidateId: candidate.candidateId, ...digest, source: candidate.source });
  }
  if (new Set(sourceDigests.map((item) => item.sha256)).size !== sourceDigests.length) {
    throw new Error("Baseline and both children must have three distinct tree digests");
  }
  const taskDigest = await treeDigest(q003Source);
  if (taskDigest.sha256 !== protocol.preparationTask.expectedTreeSha256) {
    throw new Error(`q003 task digest drift: expected ${protocol.preparationTask.expectedTreeSha256}, found ${taskDigest.sha256}`);
  }
  const lineageLocks = {};
  for (const child of protocol.target.children) {
    const digest = sourceDigests.find((entry) => entry.candidateId === child.candidateId);
    lineageLocks[child.candidateId] = await validateChildLineage({
      child,
      protocol,
      repoRoot,
      actualTreeSha256: digest.sha256,
    });
  }
  return {
    protocol,
    sourceProtocol,
    knowledgeCommit,
    sources,
    sourceDigests,
    q003Source,
    taskDigest,
    lineageLocks,
    protocolSha256: await sha256File(protocolPath),
    sourceProfileSha256: objectDigest(frozenProfileFromSource(sourceProtocol)),
    metaRoot,
  };
}

async function materializePrepared({ context, runtimeRoot, stagingRoot }) {
  const preparedRoot = path.join(runtimeRoot, "prepared");
  for (const candidate of context.sources) {
    const destination = path.join(
      stagingRoot,
      "inputs",
      candidate.candidateId,
      context.protocol.target.logicalName,
    );
    await copyTree(candidate.source, destination);
  }
  await copyTree(context.q003Source, path.join(stagingRoot, "tasks", "q003"));
  await assertHarborTaskShape(
    path.join(stagingRoot, "tasks", "q003"),
    "Prepared q003 task",
  );

  const artifacts = [];
  for (const candidate of context.sources) {
    const config = buildHarborJobConfig({
      protocol: context.protocol,
      candidateId: candidate.candidateId,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot: context.knowledgeRoot,
    });
    const relative = path.posix.join("configs", "harbor", "q003", `${candidate.candidateId}.yaml`);
    const output = path.join(stagingRoot, ...relative.split("/"));
    await writeExclusive(output, yamlDocument(config));
    artifacts.push({ kind: "harbor-job-config", candidateId: candidate.candidateId, path: relative });
  }
  const operatorConfig = buildOperatorConfig({
    protocol: context.protocol,
    runtimeRoot,
    preparedRoot,
  });
  const operatorRelative = "configs/operator/generation-001.yaml";
  await writeExclusive(
    path.join(stagingRoot, ...operatorRelative.split("/")),
    yamlDocument(operatorConfig),
  );
  artifacts.push({ kind: "operator-development-config", path: operatorRelative });

  for (const artifact of artifacts) {
    artifact.sha256 = await sha256File(path.join(stagingRoot, ...artifact.path.split("/")));
  }
  const copiedCandidates = [];
  for (const source of context.sourceDigests) {
    const copy = await treeDigest(path.join(
      stagingRoot,
      "inputs",
      source.candidateId,
      context.protocol.target.logicalName,
    ));
    if (copy.sha256 !== source.sha256) {
      throw new Error(`Copied candidate ${source.candidateId} digest mismatch`);
    }
    copiedCandidates.push({
      candidateId: source.candidateId,
      treeSha256: copy.sha256,
      fileCount: copy.fileCount,
      totalBytes: copy.totalBytes,
      ...(context.lineageLocks[source.candidateId] ?? {}),
    });
  }
  const copiedTask = await treeDigest(path.join(stagingRoot, "tasks", "q003"));
  if (copiedTask.sha256 !== context.taskDigest.sha256) {
    throw new Error("Copied q003 task digest mismatch");
  }
  const payload = await treeDigest(stagingRoot);
  const receipt = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: context.protocol.generationId,
    knowledgeCommit: context.knowledgeCommit,
    metaProtocolSha256: context.protocolSha256,
    frozenEvaluationProfileSha256: context.sourceProfileSha256,
    logicalSkillName: context.protocol.target.logicalName,
    preparationTask: {
      taskId: "q003",
      treeSha256: copiedTask.sha256,
      fileCount: copiedTask.fileCount,
      totalBytes: copiedTask.totalBytes,
    },
    candidates: copiedCandidates,
    operator: {
      operatorId: context.protocol.operator.operatorId,
      instructionSha256: sha256Bytes(Buffer.from(context.protocol.operator.instruction, "utf8")),
      parentCandidateId: context.protocol.target.baseline.lineageCandidateId,
      parentTreeSha256: context.protocol.target.baseline.expectedTreeSha256,
    },
    callBudget: context.protocol.callBudget,
    stopPolicy: context.protocol.stopPolicy,
    artifacts,
    immutablePayload: payload,
  };
  await writeExclusive(path.join(stagingRoot, "receipt.json"), canonicalJson(receipt));
  return receipt;
}

async function verifyPrepared({ context, runtimeRoot }) {
  const preparedRoot = path.join(runtimeRoot, "prepared");
  await assertOrdinaryDirectory(preparedRoot, "Prepared experiment");
  const receipt = await readJson(path.join(preparedRoot, "receipt.json"));
  if (receipt.metaProtocolSha256 !== context.protocolSha256) {
    throw new Error("Prepared receipt meta protocol digest drift");
  }
  if (receipt.knowledgeCommit !== context.knowledgeCommit) {
    throw new Error("Prepared receipt knowledge commit drift");
  }
  if (receipt.frozenEvaluationProfileSha256 !== context.sourceProfileSha256) {
    throw new Error("Prepared receipt profile digest drift");
  }
  const payload = await treeDigest(preparedRoot, { omitRootFiles: ["receipt.json"] });
  deepEqual(payload, receipt.immutablePayload, "Prepared immutable payload");
  for (const source of context.sourceDigests) {
    const copy = await treeDigest(path.join(
      preparedRoot,
      "inputs",
      source.candidateId,
      context.protocol.target.logicalName,
    ));
    if (copy.sha256 !== source.sha256) {
      throw new Error(`Prepared candidate ${source.candidateId} digest drift`);
    }
  }
  const task = await treeDigest(path.join(preparedRoot, "tasks", "q003"));
  if (task.sha256 !== context.taskDigest.sha256) {
    throw new Error("Prepared q003 task digest drift");
  }
  await assertHarborTaskShape(
    path.join(preparedRoot, "tasks", "q003"),
    "Prepared q003 task",
  );
  for (const artifact of receipt.artifacts) {
    const absolute = assertInside(preparedRoot, path.join(preparedRoot, ...artifact.path.split("/")), "Prepared artifact");
    if (await sha256File(absolute) !== artifact.sha256) {
      throw new Error(`Prepared artifact digest drift: ${artifact.path}`);
    }
    const actualDocument = parseYaml(await fs.readFile(absolute, "utf8"));
    const expectedDocument = artifact.kind === "harbor-job-config"
      ? buildHarborJobConfig({
        protocol: context.protocol,
        candidateId: artifact.candidateId,
        runtimeRoot,
        preparedRoot,
        knowledgeRoot: context.knowledgeRoot,
      })
      : artifact.kind === "operator-development-config"
        ? buildOperatorConfig({
          protocol: context.protocol,
          runtimeRoot,
          preparedRoot,
        })
        : null;
    if (!expectedDocument) {
      throw new Error(`Unknown prepared artifact kind: ${artifact.kind}`);
    }
    deepEqual(actualDocument, expectedDocument, `Prepared artifact semantics ${artifact.path}`);
  }
  return receipt;
}

export async function prepareExperiment(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const metaRoot = path.resolve(options.metaRoot ?? META_ROOT);
  const protocolPath = path.resolve(options.protocolPath ?? path.join(metaRoot, "protocol.json"));
  const sourceProtocolPath = path.resolve(options.sourceProtocolPath ?? DEFAULT_SOURCE_PROTOCOL);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const preparedStudyRoot = path.resolve(options.preparedStudyRoot ?? DEFAULT_PREPARED_STUDY);
  const runtimeRoot = assertRuntimeOutput(options.outputRoot ?? DEFAULT_OUTPUT, repoRoot);
  const context = await validateInputs({
    repoRoot,
    metaRoot,
    protocolPath,
    sourceProtocolPath,
    knowledgeRoot,
    preparedStudyRoot,
  });
  context.knowledgeRoot = knowledgeRoot;
  if (await exists(path.join(runtimeRoot, "prepared"))) {
    return { mode: "verified-existing", runtimeRoot, receipt: await verifyPrepared({ context, runtimeRoot }) };
  }
  if (await exists(path.join(runtimeRoot, "jobs"))) {
    throw new Error("Refusing to prepare around pre-existing Harbor jobs");
  }
  await fs.mkdir(runtimeRoot, { recursive: true });
  const stagingRoot = path.join(runtimeRoot, `.prepared-${process.pid}-${randomUUID()}`);
  await fs.mkdir(stagingRoot, { recursive: false });
  try {
    const receipt = await materializePrepared({ context, runtimeRoot, stagingRoot });
    await fs.rename(stagingRoot, path.join(runtimeRoot, "prepared"));
    return { mode: "prepared", runtimeRoot, receipt };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyExperiment(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const metaRoot = path.resolve(options.metaRoot ?? META_ROOT);
  const runtimeRoot = assertRuntimeOutput(options.outputRoot ?? DEFAULT_OUTPUT, repoRoot);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const context = await validateInputs({
    repoRoot,
    metaRoot,
    protocolPath: path.resolve(options.protocolPath ?? path.join(metaRoot, "protocol.json")),
    sourceProtocolPath: path.resolve(options.sourceProtocolPath ?? DEFAULT_SOURCE_PROTOCOL),
    knowledgeRoot,
    preparedStudyRoot: path.resolve(options.preparedStudyRoot ?? DEFAULT_PREPARED_STUDY),
  });
  context.knowledgeRoot = knowledgeRoot;
  return { mode: "verified", runtimeRoot, receipt: await verifyPrepared({ context, runtimeRoot }) };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--knowledge-root", "--prepared-study", "--output", "--protocol", "--source-protocol"].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    if (!value) {
      throw new Error(`Missing value for ${flag}`);
    }
    index += 1;
    const key = {
      "--knowledge-root": "knowledgeRoot",
      "--prepared-study": "preparedStudyRoot",
      "--output": "outputRoot",
      "--protocol": "protocolPath",
      "--source-protocol": "sourceProtocolPath",
    }[flag];
    options[key] = value;
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify [options]\n\nPreparation performs no Harbor or model calls and reads only the q003 prepared task.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  const result = command === "prepare"
    ? await prepareExperiment(options)
    : command === "verify"
      ? await verifyExperiment(options)
      : null;
  if (!result) {
    throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(`${canonicalJson({
    mode: result.mode,
    runtimeRoot: result.runtimeRoot,
    receipt: path.join(result.runtimeRoot, "prepared", "receipt.json"),
  })}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
