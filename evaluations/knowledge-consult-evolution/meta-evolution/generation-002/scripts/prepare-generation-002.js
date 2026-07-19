#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  canonicalJson,
  frozenProfileFromSource,
  objectDigest,
  treeDigest,
} from "../../scripts/prepare-meta-evolution.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const META_ROOT = path.resolve(GENERATION_ROOT, "..");
const STUDY_ROOT = path.resolve(META_ROOT, "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_SOURCE_PROTOCOL = path.join(STUDY_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_GENERATION_001_RUNTIME = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-001",
);
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "meta-evolution",
  "generation-002",
);

const CHILD_IDS = [
  "explicit-floor-terminal-finalize",
  "canonical-floor-terminal-finalize",
];
const OPERATOR_ID = "explicit-floor-terminal-finalize";
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const OMITTED_TREE_NAMES = new Set(["__pycache__"]);
const CANDIDATE_LEAK_PATTERN = /\bq(?:003|007|018|024|030)\b|\bqrels?\b|oracle-pi|gpt-5\.3-codex-spark|graphrag-papers-40|evidence_contract_gate|minimum_document_gate|mechanical_qualification_gate|489934516868c0b8bcd5469c2b7c0439ddae30eea36a0419735c3c00ccda37b0/i;
const PI_AUTH_STRING_FIELDS = ["type", "access", "refresh", "accountId"];

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function piAuthDocumentHasRequiredShape(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const credential = payload["openai-codex"];
  return Boolean(
    credential
    && typeof credential === "object"
    && !Array.isArray(credential)
    && PI_AUTH_STRING_FIELDS.every(
      (field) => typeof credential[field] === "string" && credential[field].trim() !== "",
    )
    && typeof credential.expires === "number"
    && Number.isFinite(credential.expires),
  );
}

export async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

async function readJson(filePath) {
  let value;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`JSON root must be an object: ${filePath}`);
  }
  return value;
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
  const digest = requireString(value, label);
  if (!HEX_SHA256.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
}

function requirePinnedSha(value, label) {
  const digest = requireSha(value, label);
  if (digest === "0".repeat(64)) {
    throw new Error(`${label} must be sealed; the all-zero placeholder is forbidden`);
  }
  return digest;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} drift`);
  }
}

function assertInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if ((!allowRoot && relative === "") || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside ${resolvedRoot}: ${resolved}`);
  }
  return resolved;
}

function assertRuntimeOutput(outputRoot, repoRoot) {
  return assertInside(path.join(repoRoot, ".tmp"), outputRoot, "Runtime output");
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function assertCleanPinnedKnowledge(knowledgeRoot, expectedCommit) {
  assertValue(gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]), expectedCommit, "Knowledge commit");
  const status = gitOutput(knowledgeRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("Knowledge checkout must be clean and read-only input");
  }
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

async function copyTree(source, destination) {
  await treeDigest(source);
  await fs.cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: false,
  });
  await treeDigest(destination);
}

async function writeExclusive(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "wx" });
}

function yamlDocument(value) {
  return stringifyYaml(value, { indent: 2, lineWidth: 0, sortMapEntries: false });
}

async function skillName(skillRoot) {
  const text = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    throw new Error(`Skill has no YAML frontmatter: ${skillRoot}`);
  }
  const parsed = parseYaml(frontmatter[1]);
  return requireString(parsed?.name, `${skillRoot} skill name`);
}

async function assertCandidateHasNoTaskIds(skillRoot, candidateId) {
  const files = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (OMITTED_TREE_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) {
        continue;
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  await walk(skillRoot);
  for (const filePath of files) {
    const bytes = await fs.readFile(filePath);
    if (bytes.includes(0)) {
      continue;
    }
    if (CANDIDATE_LEAK_PATTERN.test(bytes.toString("utf8"))) {
      throw new Error(`Candidate ${candidateId} contains a sealed task, corpus, profile, or evaluator constant: ${path.relative(skillRoot, filePath)}`);
    }
  }
}

function validateProtocol(protocol, sourceProtocol) {
  assertValue(protocol.schemaVersion, 1, "protocol.schemaVersion");
  assertValue(protocol.generationId, "generation-002", "protocol.generationId");
  assertValue(protocol.target?.logicalName, "consult-semantic-okf", "protocol.target.logicalName");
  assertValue(protocol.target?.baseline?.candidateId, "baseline", "protocol.target.baseline.candidateId");
  assertValue(protocol.target?.baseline?.lineageCandidateId, "00-baseline", "protocol.target.baseline.lineageCandidateId");
  requireSha(protocol.target?.baseline?.expectedTreeSha256, "protocol.target.baseline.expectedTreeSha256");
  assertValue(protocol.operator?.operatorId, OPERATOR_ID, "protocol.operator.operatorId");
  requireString(protocol.operator?.instruction, "protocol.operator.instruction");
  requireString(protocol.operator?.controlOperatorId, "protocol.operator.controlOperatorId");
  const diagnostic = requireObject(protocol.diagnosticRepairSource, "protocol.diagnosticRepairSource");
  assertValue(diagnostic.generationId, "generation-001", "diagnostic repair generation ID");
  requireString(diagnostic.path, "diagnostic repair path");
  requirePinnedSha(diagnostic.fileSha256, "diagnostic repair file digest");
  assertValue(diagnostic.schemaVersion, 1, "diagnostic repair schema");
  assertValue(diagnostic.source, "harbor-operator-coevolution", "diagnostic repair source");
  requireString(diagnostic.evolutionId, "diagnostic repair evolution ID");
  assertValue(diagnostic.generation, 0, "diagnostic repair generation");
  requireString(diagnostic.generationSeal, "diagnostic repair generation seal");
  requireString(diagnostic.evolutionProfileDigest, "diagnostic repair profile digest");
  assertValue(diagnostic.diagnosticOnly, true, "diagnostic repair classification");
  assertValue(diagnostic.chainEligible, false, "diagnostic repair chain eligibility");
  assertValue(diagnostic.holdoutOpened, false, "diagnostic repair holdout state");
  assertValue(diagnostic.promotion, false, "diagnostic repair promotion state");
  assertValue(diagnostic.breedingOperatorCount, 0, "diagnostic repair breeding operator count");
  requireString(diagnostic.repairReason, "diagnostic repair reason");
  assertValue(diagnostic.fitnessAwarded, false, "diagnostic repair fitness state");
  assertValue(diagnostic.operatorCreditAwarded, false, "diagnostic repair operator-credit state");
  assertValue(diagnostic.usedAsPreviousGenerationLog, false, "diagnostic repair chaining policy");
  const children = requireArray(protocol.target?.children, "protocol.target.children");
  equal(children.map((child) => child.candidateId), CHILD_IDS, "generation-002 child IDs");
  for (const child of children) {
    assertValue(child.parentCandidateId, "00-baseline", `${child.candidateId} parentCandidateId`);
    assertValue(child.operatorId, OPERATOR_ID, `${child.candidateId} operatorId`);
    requireString(child.sourcePath, `${child.candidateId} sourcePath`);
    requireString(child.manifestPath, `${child.candidateId} manifestPath`);
    requireString(child.operatorRealizationPath, `${child.candidateId} operatorRealizationPath`);
    requirePinnedSha(child.expectedTreeSha256, `${child.candidateId} expectedTreeSha256`);
    requirePinnedSha(child.expectedManifestSha256, `${child.candidateId} expectedManifestSha256`);
    requirePinnedSha(child.expectedOperatorRealizationSha256, `${child.candidateId} expectedOperatorRealizationSha256`);
  }
  const sourceProfile = frozenProfileFromSource(sourceProtocol);
  equal(protocol.frozenEvaluationProfile, sourceProfile, "frozen evaluation profile");
  assertValue(
    protocol.frozenEvaluationProfileSha256,
    objectDigest(sourceProfile),
    "frozen evaluation profile digest",
  );
  assertValue(protocol.frozenEvaluationProfile.retries, 0, "Harbor retries");
  assertValue(protocol.frozenEvaluationProfile.attemptsPerCandidateTask, 1, "attempts per task");
  assertValue(protocol.preparationTask?.taskId, "q003", "preparation task");
  requireSha(protocol.preparationTask?.expectedTreeSha256, "q003 tree digest");
  assertValue(protocol.callAccounting?.generation001CompletedModelCalls, 3, "generation-001 call count");
  assertValue(protocol.callAccounting?.generation002DevelopmentMaximumModelCalls, 2, "generation-002 call cap");
  assertValue(protocol.callAccounting?.externalBaselineRemediationModelCalls, 0, "external remediation calls");
  assertValue(protocol.callAccounting?.cumulativeDevelopmentMaximumModelCalls, 5, "cumulative development calls");
  assertValue(protocol.operatorAnalysis?.phase, "development", "operator phase");
  assertValue(protocol.operatorAnalysis?.analyzeOnly, true, "operator analyze-only");
  assertValue(protocol.operatorAnalysis?.minimumOperatorTrials, 2, "minimum operator trials");
  assertValue(protocol.operatorAnalysis?.holdoutPathsMustRemainUnresolved, true, "unopened holdout policy");
  assertValue(protocol.harbor?.authenticationBindPreflight?.image, "semantic-okf-harbor-runtime:1.0", "auth preflight image");
  assertValue(protocol.harbor?.authenticationBindPreflight?.imageId, "sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5", "auth preflight image ID");
  assertValue(protocol.harbor?.authenticationBindPreflight?.network, "none", "auth preflight network");
  assertValue(protocol.harbor?.authenticationBindPreflight?.mustPassBeforeAnyHarborCall, true, "auth preflight ordering");
  assertValue(protocol.harbor?.authenticationBindPreflight?.sameSessionAsHarbor, true, "auth preflight session policy");
  assertValue(protocol.harbor?.authenticationSourceContract?.jsonRootType, "object", "auth source JSON root");
  assertValue(protocol.harbor?.authenticationSourceContract?.requiredTopLevelEntry, "openai-codex", "auth source provider entry");
  assertValue(protocol.harbor?.authenticationSourceContract?.requiredEntryType, "object", "auth source provider type");
  equal(protocol.harbor?.authenticationSourceContract?.requiredNonEmptyStringFields, PI_AUTH_STRING_FIELDS, "auth source string fields");
  assertValue(protocol.harbor?.authenticationSourceContract?.requiredFiniteNumberField, "expires", "auth source finite-number field");
  assertValue(protocol.harbor?.authenticationSourceContract?.validateBeforeDockerOrHarbor, true, "auth source validation ordering");
  assertValue(protocol.harbor?.authenticationSourceContract?.projectCredentialValues, false, "auth source projection policy");
  assertValue(protocol.preModelAuthenticationRemediation?.attemptCount, 2, "pre-model auth attempt count");
  assertValue(protocol.preModelAuthenticationRemediation?.expectedModelCalls, 0, "pre-model auth model calls");
  equal(protocol.preModelAuthenticationRemediation?.expectedTokensPerAttempt, { input: 0, cache: 0, output: 0 }, "pre-model auth tokens");
  assertValue(protocol.preModelAuthenticationRemediation?.operatorTrialEligible, false, "pre-model auth operator eligibility");
  assertValue(protocol.preModelAuthenticationRemediation?.preserveBeforeCorrectedRun, true, "pre-model auth preservation policy");
  const parent = requireObject(protocol.parentEvidence, "protocol.parentEvidence");
  assertValue(parent.generationId, "generation-001", "parent generation");
  assertValue(parent.taskId, "q003", "parent task");
  assertValue(parent.candidateId, "baseline", "parent candidate");
  requireSha(parent.publicationFileSha256, "parent publication file digest");
  requireSha(parent.publicationSha256, "parent publication content digest");
  requireSha(parent.preparationReceiptSha256, "parent preparation receipt digest");
  requireSha(parent.externalRemediationReceiptSha256, "parent remediation receipt digest");
  requireSha(parent.taskChecksum, "parent task checksum");
  requireSha(parent.jobConfigSha256, "parent job config digest");
  requireSha(parent.jobLockSha256, "parent job lock digest");
  requireSha(parent.jobResultSha256, "parent job result digest");
  requireSha(parent.trialResultSha256, "parent trial result digest");
  requireString(parent.lockedSkillDigest, "parent locked skill digest");
  assertValue(parent.jobName, "knowledge-consult-meta-g001-q003-baseline", "parent job name");
}

function sanitizeParentRecord(record) {
  return {
    taskId: record.taskId,
    candidateId: record.candidateId,
    parentCandidateId: null,
    operatorId: null,
    evaluable: record.evaluable,
    qualified: record.qualified,
    status: record.status,
    metrics: { primary: record.metrics.primary },
    gates: Object.fromEntries(Object.entries(record.gates).sort()),
    tokens: {
      input: record.tokens.input,
      cache: record.tokens.cache,
      output: record.tokens.output,
    },
    provenance: {
      candidateTreeSha256: record.provenance.candidateTreeSha256,
      profileSha256: record.provenance.profileSha256,
      taskChecksum: record.provenance.taskChecksum,
      jobName: record.provenance.jobName,
      jobConfigSha256: record.provenance.jobConfigSha256,
      jobLockSha256: record.provenance.jobLockSha256,
      jobResultSha256: record.provenance.jobResultSha256,
      trialResultSha256: record.provenance.trialResultSha256,
      lockedSkillDigest: record.provenance.lockedSkillDigest,
      lockedSkillName: record.provenance.lockedSkillName,
    },
  };
}

async function verifyParentEvidence({ protocol, generation001RuntimeRoot }) {
  const parent = protocol.parentEvidence;
  const publicationPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.publicationPath.split("/")),
    "generation-001 publication",
  );
  const receiptPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.preparationReceiptPath.split("/")),
    "generation-001 preparation receipt",
  );
  const remediationPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.externalRemediationReceiptPath.split("/")),
    "generation-001 external remediation receipt",
  );
  const jobDirectory = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...parent.jobDirectory.split("/")),
    "generation-001 baseline job",
  );
  const diagnosticLogPath = assertInside(
    generation001RuntimeRoot,
    path.join(generation001RuntimeRoot, ...protocol.diagnosticRepairSource.path.split("/")),
    "generation-001 diagnostic operator log",
  );
  await assertOrdinaryDirectory(jobDirectory, "generation-001 baseline job");
  assertValue(await sha256File(publicationPath), parent.publicationFileSha256, "parent publication file SHA-256");
  assertValue(await sha256File(receiptPath), parent.preparationReceiptSha256, "parent preparation receipt SHA-256");
  assertValue(await sha256File(remediationPath), parent.externalRemediationReceiptSha256, "parent remediation receipt SHA-256");
  assertValue(
    await sha256File(diagnosticLogPath),
    protocol.diagnosticRepairSource.fileSha256,
    "diagnostic operator log SHA-256",
  );

  const [publication, receipt, remediation, diagnosticLog] = await Promise.all([
    readJson(publicationPath),
    readJson(receiptPath),
    readJson(remediationPath),
    readJson(diagnosticLogPath),
  ]);
  const expectedDiagnostic = protocol.diagnosticRepairSource;
  assertValue(diagnosticLog.schemaVersion, expectedDiagnostic.schemaVersion, "diagnostic log schema");
  assertValue(diagnosticLog.source, expectedDiagnostic.source, "diagnostic log source");
  assertValue(diagnosticLog.evolutionId, expectedDiagnostic.evolutionId, "diagnostic log evolution ID");
  assertValue(diagnosticLog.generation, expectedDiagnostic.generation, "diagnostic log generation");
  assertValue(diagnosticLog.generationId, expectedDiagnostic.generationId, "diagnostic log generation ID");
  assertValue(diagnosticLog.generationSeal, expectedDiagnostic.generationSeal, "diagnostic log generation seal");
  assertValue(
    diagnosticLog.evolutionProfileDigest,
    expectedDiagnostic.evolutionProfileDigest,
    "diagnostic log evolution profile digest",
  );
  assertValue(diagnosticLog.diagnosticOnly, true, "diagnostic log classification");
  assertValue(diagnosticLog.chainEligible, false, "diagnostic log chain eligibility");
  assertValue(diagnosticLog.holdoutOpened, false, "diagnostic log holdout state");
  assertValue(diagnosticLog.promotion, false, "diagnostic log promotion state");
  assertValue(
    requireArray(diagnosticLog.breedingPlan?.operators, "diagnostic log breeding operators").length,
    expectedDiagnostic.breedingOperatorCount,
    "diagnostic log breeding operator count",
  );
  assertValue(diagnosticLog.repairPlan?.reason, expectedDiagnostic.repairReason, "diagnostic repair reason");
  assertValue(diagnosticLog.repairPlan?.fitnessAwarded, false, "diagnostic repair fitness state");
  assertValue(diagnosticLog.repairPlan?.operatorCreditAwarded, false, "diagnostic repair operator-credit state");
  const diagnosticProvenance = {
    generationId: expectedDiagnostic.generationId,
    path: expectedDiagnostic.path,
    fileSha256: expectedDiagnostic.fileSha256,
    schemaVersion: expectedDiagnostic.schemaVersion,
    source: expectedDiagnostic.source,
    evolutionId: expectedDiagnostic.evolutionId,
    generation: expectedDiagnostic.generation,
    generationSeal: expectedDiagnostic.generationSeal,
    evolutionProfileDigest: expectedDiagnostic.evolutionProfileDigest,
    diagnosticOnly: true,
    chainEligible: false,
    holdoutOpened: false,
    promotion: false,
    breedingOperatorCount: expectedDiagnostic.breedingOperatorCount,
    repairReason: expectedDiagnostic.repairReason,
    fitnessAwarded: false,
    operatorCreditAwarded: false,
    usedAsPreviousGenerationLog: false,
  };
  assertValue(publication.generationId, "generation-001", "parent publication generation");
  assertValue(publication.taskId, "q003", "parent publication task");
  assertValue(publication.publicationSha256, parent.publicationSha256, "parent publication content digest");
  assertValue(publication.profile?.sha256, protocol.frozenEvaluationProfileSha256, "parent profile digest");
  assertValue(publication.profile?.harborVersion, protocol.frozenEvaluationProfile.harborVersion, "parent Harbor version");
  assertValue(publication.profile?.agent, protocol.frozenEvaluationProfile.agent.name, "parent agent");
  assertValue(publication.profile?.agentVersion, protocol.frozenEvaluationProfile.agent.version, "parent agent version");
  assertValue(publication.profile?.model, protocol.frozenEvaluationProfile.agent.model, "parent model");
  assertValue(publication.profile?.thinking, protocol.frozenEvaluationProfile.agent.thinking, "parent thinking");
  assertValue(publication.profile?.attempts, 1, "parent attempts");
  assertValue(publication.profile?.retries, 0, "parent retries");
  assertValue(publication.provenance?.taskTreeSha256, protocol.preparationTask.expectedTreeSha256, "parent task tree digest");
  assertValue(publication.provenance?.preparationReceiptSha256, parent.preparationReceiptSha256, "published parent receipt digest");
  const records = requireArray(publication.records, "parent publication records");
  const baselineRecords = records.filter((record) => record.candidateId === "baseline" && record.taskId === "q003");
  if (baselineRecords.length !== 1) {
    throw new Error("generation-001 publication must contain exactly one canonical q003 baseline record");
  }
  const record = sanitizeParentRecord(baselineRecords[0]);
  assertValue(record.evaluable, true, "parent baseline evaluability");
  assertValue(record.provenance.candidateTreeSha256, protocol.target.baseline.expectedTreeSha256, "parent candidate tree digest");
  assertValue(record.provenance.profileSha256, protocol.frozenEvaluationProfileSha256, "parent record profile digest");
  for (const [field, expected] of [
    ["taskChecksum", parent.taskChecksum],
    ["jobName", parent.jobName],
    ["jobConfigSha256", parent.jobConfigSha256],
    ["jobLockSha256", parent.jobLockSha256],
    ["jobResultSha256", parent.jobResultSha256],
    ["trialResultSha256", parent.trialResultSha256],
    ["lockedSkillDigest", parent.lockedSkillDigest],
  ]) {
    assertValue(record.provenance[field], expected, `parent record ${field}`);
  }
  assertValue(record.provenance.lockedSkillName, protocol.target.logicalName, "parent locked skill name");

  assertValue(receipt.generationId, "generation-001", "parent receipt generation");
  assertValue(receipt.knowledgeCommit, protocol.knowledge.commit, "parent receipt Knowledge commit");
  assertValue(receipt.frozenEvaluationProfileSha256, protocol.frozenEvaluationProfileSha256, "parent receipt profile");
  assertValue(receipt.preparationTask?.taskId, "q003", "parent receipt task ID");
  assertValue(receipt.preparationTask?.treeSha256, protocol.preparationTask.expectedTreeSha256, "parent receipt task tree");
  const receiptBaseline = requireArray(receipt.candidates, "parent receipt candidates")
    .filter((candidate) => candidate.candidateId === "baseline");
  if (receiptBaseline.length !== 1) {
    throw new Error("generation-001 receipt must contain exactly one baseline bundle");
  }
  assertValue(receiptBaseline[0].treeSha256, protocol.target.baseline.expectedTreeSha256, "parent receipt baseline tree");

  const configPath = path.join(jobDirectory, "config.json");
  const lockPath = path.join(jobDirectory, "lock.json");
  const resultPath = path.join(jobDirectory, "result.json");
  assertValue(await sha256File(configPath), parent.jobConfigSha256, "parent job config bytes");
  assertValue(await sha256File(lockPath), parent.jobLockSha256, "parent job lock bytes");
  assertValue(await sha256File(resultPath), parent.jobResultSha256, "parent job result bytes");
  const trialDirectories = (await fs.readdir(jobDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (trialDirectories.length !== 1) {
    throw new Error("generation-001 canonical baseline job must contain exactly one trial directory");
  }
  const trialResultPath = path.join(jobDirectory, trialDirectories[0].name, "result.json");
  assertValue(await sha256File(trialResultPath), parent.trialResultSha256, "parent trial result bytes");
  const [config, lock, result] = await Promise.all([
    readJson(configPath),
    readJson(lockPath),
    readJson(resultPath),
  ]);
  assertValue(config.job_name, parent.jobName, "parent config job name");
  assertValue(config.n_attempts ?? 1, 1, "parent config attempts");
  assertValue(config.retry?.max_retries ?? 0, 0, "parent config retries");
  assertValue(result.n_total_trials, 1, "parent completed trial count");
  assertValue(result.stats?.n_retries ?? 0, 0, "parent completed retries");
  if (!result.finished_at) {
    throw new Error("generation-001 baseline job is not complete");
  }
  const configuredAgent = requireArray(config.agents, "parent config agents")[0];
  assertValue(configuredAgent.name, protocol.frozenEvaluationProfile.agent.name, "parent config agent");
  assertValue(configuredAgent.model_name, protocol.frozenEvaluationProfile.agent.model, "parent config model");
  assertValue(configuredAgent.kwargs?.version, protocol.frozenEvaluationProfile.agent.version, "parent config agent version");
  assertValue(configuredAgent.kwargs?.thinking, protocol.frozenEvaluationProfile.agent.thinking, "parent config thinking");
  const expectedBaselineSkill = toHarborPath(path.join(
    generation001RuntimeRoot,
    "prepared",
    "inputs",
    "baseline",
    protocol.target.logicalName,
  ));
  equal(configuredAgent.skills, [expectedBaselineSkill], "parent configured skill source");
  const mounts = requireArray(config.environment?.mounts, "parent config mounts");
  const knowledgeMount = mounts.find((mount) => mount.target === "/knowledge");
  assertValue(knowledgeMount?.read_only, true, "parent Knowledge mount read-only");
  const dataset = requireArray(config.datasets, "parent config datasets")[0];
  equal(dataset.task_names, ["q003"], "parent configured task");
  assertValue(dataset.path, toHarborPath(path.join(generation001RuntimeRoot, "prepared", "tasks")), "parent task source");
  assertValue(lock.harbor?.version, protocol.frozenEvaluationProfile.harborVersion, "parent locked Harbor version");
  assertValue(lock.retry?.max_retries ?? 0, 0, "parent locked retries");
  const lockedTrial = requireArray(lock.trials, "parent lock trials")[0];
  assertValue(lockedTrial.task?.name, "q003", "parent locked task");
  const lockedSkill = requireArray(lockedTrial.skills, "parent locked skills")[0];
  assertValue(lockedSkill.name, protocol.target.logicalName, "parent locked skill identity");
  assertValue(lockedSkill.source, expectedBaselineSkill, "parent locked skill source");
  assertValue(lockedSkill.digest, parent.lockedSkillDigest, "parent locked skill digest");

  const q003Root = path.join(generation001RuntimeRoot, "prepared", "tasks", "q003");
  const baselineRoot = path.join(generation001RuntimeRoot, "prepared", "inputs", "baseline", protocol.target.logicalName);
  assertValue((await treeDigest(q003Root)).sha256, protocol.preparationTask.expectedTreeSha256, "reused q003 task tree");
  assertValue((await treeDigest(baselineRoot)).sha256, protocol.target.baseline.expectedTreeSha256, "reused baseline tree");
  const environmentRoot = path.join(q003Root, "environment");
  await assertOrdinaryDirectory(environmentRoot, "reused q003 environment directory");
  if ((await fs.readdir(environmentRoot)).length !== 0) {
    throw new Error("reused q003 environment directory must remain present and empty");
  }

  assertValue(remediation.schemaVersion, 1, "remediation receipt schema");
  assertValue(remediation.candidateId, "baseline", "remediation candidate");
  assertValue(remediation.taskId, "q003", "remediation task");
  assertValue(remediation.classification?.strategyEvaluated, false, "remediation strategy-evaluated flag");
  assertValue(remediation.classification?.agentStarted, false, "remediation agent-started flag");
  assertValue(remediation.classification?.modelCalls, 0, "remediation model calls");
  assertValue(remediation.classification?.retryEligible, true, "remediation retry eligibility");
  assertValue(remediation.remediation?.changesCandidate, false, "remediation candidate immutability");
  assertValue(remediation.remediation?.changesTask, false, "remediation task immutability");
  assertValue(remediation.remediation?.changesEvaluationProfile, false, "remediation profile immutability");
  assertValue(remediation.evidence?.configSha256, parent.jobConfigSha256, "remediation config provenance");
  const quarantinedRoot = path.join(path.dirname(jobDirectory), remediation.evidence?.quarantinedJob ?? "");
  await assertOrdinaryDirectory(quarantinedRoot, "quarantined pre-agent baseline job");
  assertValue((await treeDigest(quarantinedRoot)).sha256, remediation.evidence.jobTreeSha256, "quarantined baseline job tree");

  return {
    publicationPath,
    receiptPath,
    remediationPath,
    jobDirectory,
    record,
    remediation,
    publicationFileSha256: parent.publicationFileSha256,
    publicationSha256: parent.publicationSha256,
    preparationReceiptSha256: parent.preparationReceiptSha256,
    externalRemediationReceiptSha256: parent.externalRemediationReceiptSha256,
    diagnosticProvenance,
  };
}

async function validateChildLineage({ child, protocol, repoRoot, digest }) {
  const manifestPath = assertInside(
    repoRoot,
    path.join(repoRoot, ...child.manifestPath.split("/")),
    `${child.candidateId} manifest`,
  );
  const realizationPath = assertInside(
    repoRoot,
    path.join(repoRoot, ...child.operatorRealizationPath.split("/")),
    `${child.candidateId} operator realization`,
  );
  assertValue(await sha256File(manifestPath), child.expectedManifestSha256, `${child.candidateId} manifest bytes`);
  assertValue(await sha256File(realizationPath), child.expectedOperatorRealizationSha256, `${child.candidateId} realization bytes`);
  const [manifest, realization] = await Promise.all([readJson(manifestPath), readJson(realizationPath)]);
  const expected = {
    generationId: "generation-002",
    candidateId: child.candidateId,
    operatorId: OPERATOR_ID,
    parentCandidateId: "00-baseline",
    parentTreeSha256: protocol.target.baseline.expectedTreeSha256,
    sourceCommit: protocol.knowledge.commit,
  };
  for (const document of [manifest, realization]) {
    assertValue(document.generationId, expected.generationId, `${child.candidateId} lineage generation`);
    assertValue(document.candidateId, expected.candidateId, `${child.candidateId} lineage identity`);
    assertValue(document.operatorId, expected.operatorId, `${child.candidateId} lineage operator`);
    assertValue(document.parentCandidateId, expected.parentCandidateId, `${child.candidateId} lineage parent`);
  }
  assertValue(manifest.parentTreeSha256, expected.parentTreeSha256, `${child.candidateId} manifest parent tree`);
  assertValue(manifest.parentSourceCommit, expected.sourceCommit, `${child.candidateId} manifest source commit`);
  assertValue(manifest.skill?.name, protocol.target.logicalName, `${child.candidateId} manifest skill name`);
  assertValue(manifest.skill?.basename ?? manifest.skill?.bundle, protocol.target.logicalName, `${child.candidateId} manifest basename`);
  assertValue(manifest.skill?.treeSha256, digest.sha256, `${child.candidateId} manifest tree`);
  assertValue(realization.candidateTreeSha256, digest.sha256, `${child.candidateId} realization tree`);
  assertValue(realization.instruction, protocol.operator.instruction, `${child.candidateId} realization instruction`);
  assertValue(realization.origin, protocol.operator.origin, `${child.candidateId} realization origin`);
  const parents = requireArray(realization.parentCandidates, `${child.candidateId} realization parents`);
  if (parents.length !== 1) {
    throw new Error(`${child.candidateId} must have exactly one true parent`);
  }
  assertValue(parents[0].candidateId, "00-baseline", `${child.candidateId} realization parent ID`);
  assertValue(parents[0].treeSha256, expected.parentTreeSha256, `${child.candidateId} realization parent tree`);
  assertValue(parents[0].sourceCommit, expected.sourceCommit, `${child.candidateId} realization parent commit`);
  return {
    manifestSha256: child.expectedManifestSha256,
    operatorRealizationSha256: child.expectedOperatorRealizationSha256,
  };
}

async function validateInputs(options) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const generationRoot = path.resolve(options.generationRoot ?? GENERATION_ROOT);
  const protocolPath = path.resolve(options.protocolPath ?? path.join(generationRoot, "protocol.json"));
  const sourceProtocolPath = path.resolve(options.sourceProtocolPath ?? DEFAULT_SOURCE_PROTOCOL);
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const generation001RuntimeRoot = path.resolve(options.generation001RuntimeRoot ?? DEFAULT_GENERATION_001_RUNTIME);
  const [protocol, sourceProtocol] = await Promise.all([readJson(protocolPath), readJson(sourceProtocolPath)]);
  validateProtocol(protocol, sourceProtocol);
  assertValue(protocol.knowledge.commit, sourceProtocol.sourceFreeze?.repository?.commit, "Knowledge source commit");
  assertValue(protocol.knowledge.baselineSkillPath, sourceProtocol.sourceFreeze?.dataset?.baselineSkillPath, "baseline source path");
  assertValue(protocol.knowledge.referenceBundlePath, sourceProtocol.sourceFreeze?.dataset?.referenceBundlePath, "Knowledge bundle path");
  assertCleanPinnedKnowledge(knowledgeRoot, protocol.knowledge.commit);

  const baselineSource = assertInside(
    knowledgeRoot,
    path.join(knowledgeRoot, ...protocol.knowledge.baselineSkillPath.split("/")),
    "Knowledge baseline skill",
  );
  const baselineDigest = await treeDigest(baselineSource);
  assertValue(baselineDigest.sha256, protocol.target.baseline.expectedTreeSha256, "Knowledge baseline tree");
  const parentEvidence = await verifyParentEvidence({ protocol, generation001RuntimeRoot });

  const children = [];
  for (const child of protocol.target.children) {
    const source = assertInside(
      repoRoot,
      path.join(repoRoot, ...child.sourcePath.split("/")),
      `${child.candidateId} source`,
    );
    await assertOrdinaryDirectory(source, `${child.candidateId} source`);
    assertValue(path.basename(source), protocol.target.logicalName, `${child.candidateId} canonical basename`);
    assertValue(await skillName(source), protocol.target.logicalName, `${child.candidateId} logical skill name`);
    await assertCandidateHasNoTaskIds(source, child.candidateId);
    const digest = await treeDigest(source);
    assertValue(digest.sha256, child.expectedTreeSha256, `${child.candidateId} tree digest`);
    const lineage = await validateChildLineage({ child, protocol, repoRoot, digest });
    children.push({ ...child, source, digest, lineage });
  }
  const distinct = new Set([baselineDigest.sha256, ...children.map((child) => child.digest.sha256)]);
  if (distinct.size !== 3) {
    throw new Error("Baseline and both generation-002 children must have three distinct tree digests");
  }
  return {
    repoRoot,
    generationRoot,
    protocolPath,
    sourceProtocolPath,
    knowledgeRoot,
    generation001RuntimeRoot,
    protocol,
    sourceProtocol,
    baselineDigest,
    parentEvidence,
    children,
    protocolSha256: await sha256File(protocolPath),
    sourceProfileSha256: objectDigest(frozenProfileFromSource(sourceProtocol)),
  };
}

function childJobName(protocol, candidateId) {
  return `${protocol.harbor.jobNamePrefix}-q003-${candidateId}`;
}

export function buildChildHarborConfig({ protocol, candidateId, runtimeRoot, preparedRoot, knowledgeRoot, generation001RuntimeRoot }) {
  const profile = protocol.frozenEvaluationProfile;
  const childSkill = path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName);
  const tasksRoot = path.join(generation001RuntimeRoot, "prepared", "tasks");
  const referenceBundle = path.join(knowledgeRoot, ...protocol.knowledge.referenceBundlePath.split("/"));
  return {
    job_name: childJobName(protocol, candidateId),
    jobs_dir: toHarborPath(path.join(runtimeRoot, "jobs", "q003", candidateId)),
    n_attempts: 1,
    install_only: false,
    timeout_multiplier: 1,
    debug: false,
    n_concurrent_trials: 1,
    quiet: false,
    retry: {
      max_retries: 0,
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
    agents: [{
      name: profile.agent.name,
      model_name: profile.agent.model,
      n_concurrent: 1,
      skills: [toHarborPath(childSkill)],
      extra_allowed_hosts: [],
      kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
      env: { PI_CODING_AGENT_DIR: protocol.harbor.authenticationMount.target },
      mcp_servers: [],
    }],
    datasets: [{
      path: toHarborPath(tasksRoot),
      overwrite: false,
      task_names: ["q003"],
    }],
    tasks: [],
    artifacts: [],
    extra_instruction_paths: [],
  };
}

export function buildDevelopmentOperatorConfig({ protocol, runtimeRoot, preparedRoot, generation001RuntimeRoot }) {
  const baselineSkill = toHarborPath(path.join(
    generation001RuntimeRoot,
    "prepared",
    "inputs",
    "baseline",
    protocol.target.logicalName,
  ));
  const baselineJob = toHarborPath(path.join(
    generation001RuntimeRoot,
    ...protocol.parentEvidence.jobDirectory.split("/"),
  ));
  const candidates = [{
    candidateId: "baseline",
    skill: baselineSkill,
    jobDirectory: baselineJob,
  }, ...protocol.target.children.map((child) => ({
    candidateId: child.candidateId,
    parentCandidateId: "baseline",
    operatorId: OPERATOR_ID,
    skill: path.posix.join("../..", "inputs", child.candidateId, protocol.target.logicalName),
    jobDirectory: path.posix.join("../../..", "jobs", "q003", child.candidateId, childJobName(protocol, child.candidateId)),
  }))];
  return {
    schemaVersion: 1,
    evolution: {
      id: protocol.experimentId,
      generation: 0,
      generationId: "generation-002",
      outputDir: "../../../operator-analysis/generation-002",
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
        operatorId: OPERATOR_ID,
        instruction: protocol.operator.instruction,
        parentOperatorIds: protocol.operator.parentOperatorIds,
        origin: protocol.operator.origin,
      },
      {
        operatorId: protocol.operator.controlOperatorId,
        instruction: protocol.operator.controlInstruction,
        parentOperatorIds: [],
        origin: "control",
      },
    ],
    candidates,
    holdout: {
      baseline: {
        candidateId: "baseline",
        jobDirectory: "../../../not-opened/generation-002-holdout-baseline",
      },
      candidate: {
        candidateId: CHILD_IDS[0],
        jobDirectory: "../../../not-opened/generation-002-holdout-candidate",
      },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

function buildSameSessionWrapper({ protocol, preparedRoot }) {
  const configs = CHILD_IDS.map((candidateId) => (
    toHarborPath(path.join(preparedRoot, "configs", "harbor", "q003", `${candidateId}.yaml`))
  ));
  const preflightImage = protocol.harbor.authenticationBindPreflight.image;
  const preflightImageId = protocol.harbor.authenticationBindPreflight.imageId;
  const compilerRoots = CHILD_IDS.map((candidateId) => toHarborPath(path.join(
    preparedRoot,
    "inputs",
    candidateId,
    protocol.target.logicalName,
  )));
  const authStringFields = protocol.harbor.authenticationSourceContract.requiredNonEmptyStringFields;
  const runtimeRoot = path.resolve(preparedRoot, "..");
  const jobDirectories = CHILD_IDS.map((candidateId) => toHarborPath(path.join(
    runtimeRoot,
    "jobs",
    "q003",
    candidateId,
    childJobName(protocol, candidateId),
  )));
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/readable/auth.json-or-pi-auth-directory" >&2
  exit 64
fi

auth_source="$1"
auth_mount=${JSON.stringify(protocol.harbor.authenticationMount.source)}
if [[ -f "$auth_source" ]]; then
  auth_json="$auth_source"
elif [[ -d "$auth_source" ]]; then
  auth_json="$auth_source/auth.json"
else
  echo "auth source must be an auth.json file or Pi auth directory" >&2
  exit 65
fi

auth_has_openai_codex() {
  python3 - "$1" <<'PY'
import json
import math
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as stream:
        payload = json.load(stream)
except (OSError, UnicodeError, json.JSONDecodeError):
    raise SystemExit(1)
credential = payload.get("openai-codex") if isinstance(payload, dict) else None
required_strings = ${JSON.stringify(authStringFields)}
def contains_shell_path(value):
    if isinstance(value, dict):
        return any(str(key).casefold() == "shellpath" or contains_shell_path(item) for key, item in value.items())
    if isinstance(value, list):
        return any(contains_shell_path(item) for item in value)
    return False
valid = (
    isinstance(credential, dict)
    and all(isinstance(credential.get(field), str) and credential[field].strip() for field in required_strings)
    and isinstance(credential.get("expires"), (int, float))
    and not isinstance(credential.get("expires"), bool)
    and math.isfinite(credential["expires"])
    and not contains_shell_path(payload)
)
raise SystemExit(0 if valid else 1)
PY
}

if ! auth_has_openai_codex "$auth_json"; then
  echo "auth.json must contain a complete openai-codex credential entry" >&2
  exit 66
fi
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
for job_directory in ${jobDirectories.map((item) => JSON.stringify(item)).join(" ")}; do
  if [[ -e "$job_directory" ]]; then
    echo "canonical child job output already exists; preserve or remediate it before rerun" >&2
    exit 68
  fi
done

mkdir -m 700 -- "$auth_mount"
cleanup() {
  rm -rf -- "$auth_mount"
}
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
find "$auth_mount" -type d -exec chmod 700 {} +
find "$auth_mount" -type f -exec chmod 600 {} +
mapfile -t isolated_auth_entries < <(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
if [[ \${#isolated_auth_entries[@]} -ne 1 || "\${isolated_auth_entries[0]}" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
if [[ -e "$auth_mount/settings.json" ]] || grep -R -i -F -q '"shellPath"' "$auth_mount"; then
  echo "isolated Pi directory must not contain settings.json or shellPath" >&2
  exit 69
fi
if ! auth_has_openai_codex "$auth_mount/auth.json"; then
  echo "isolated auth.json failed the required provider contract" >&2
  exit 69
fi

actual_image_id="$(docker image inspect --format '{{.Id}}' ${preflightImage})"
if [[ "$actual_image_id" != ${JSON.stringify(preflightImageId)} ]]; then
  echo "q003 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash \
  --mount "type=bind,source=$auth_mount,target=/root/.pi/agent" \
  --mount "type=bind,source=${compilerRoots[0]},target=/candidate-explicit,readonly" \
  --mount "type=bind,source=${compilerRoots[1]},target=/candidate-canonical,readonly" \
  ${preflightImage} \
  -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
test -r /candidate-explicit/scripts/harbor_answer.py
test -r /candidate-canonical/scripts/harbor_answer.py
python -B /candidate-explicit/scripts/harbor_answer.py --help >/dev/null
python -B /candidate-canonical/scripts/harbor_answer.py --help >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'"shellPath"'"'"' /root/.pi/agent
tmp_probe="$(mktemp /tmp/g002-preflight.XXXXXX)"
rm -f "$tmp_probe"
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(configs[0])} --yes
uvx --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(configs[1])} --yes
`;
}

async function materializePrepared({ context, runtimeRoot, stagingRoot }) {
  const preparedRoot = path.join(runtimeRoot, "prepared");
  for (const child of context.children) {
    await copyTree(
      child.source,
      path.join(stagingRoot, "inputs", child.candidateId, context.protocol.target.logicalName),
    );
  }
  await writeExclusive(
    path.join(stagingRoot, "parent-evidence", "baseline-record.json"),
    canonicalJson(context.parentEvidence.record),
  );
  await writeExclusive(
    path.join(stagingRoot, "parent-evidence", "external-remediation-receipt.json"),
    canonicalJson(context.parentEvidence.remediation),
  );
  await writeExclusive(
    path.join(stagingRoot, "parent-evidence", "generation-001-diagnostic-operator-provenance.json"),
    canonicalJson(context.parentEvidence.diagnosticProvenance),
  );

  const artifacts = [];
  for (const child of context.children) {
    const config = buildChildHarborConfig({
      protocol: context.protocol,
      candidateId: child.candidateId,
      runtimeRoot,
      preparedRoot,
      knowledgeRoot: context.knowledgeRoot,
      generation001RuntimeRoot: context.generation001RuntimeRoot,
    });
    const relative = `configs/harbor/q003/${child.candidateId}.yaml`;
    await writeExclusive(path.join(stagingRoot, ...relative.split("/")), yamlDocument(config));
    artifacts.push({ kind: "harbor-child-job-config", candidateId: child.candidateId, path: relative });
  }
  const operatorRelative = "configs/operator/generation-002.yaml";
  await writeExclusive(
    path.join(stagingRoot, ...operatorRelative.split("/")),
    yamlDocument(buildDevelopmentOperatorConfig({
      protocol: context.protocol,
      runtimeRoot,
      preparedRoot,
      generation001RuntimeRoot: context.generation001RuntimeRoot,
    })),
  );
  artifacts.push({ kind: "operator-development-config", path: operatorRelative });
  const wrapperRelative = "run-q003-same-session.sh";
  await writeExclusive(
    path.join(stagingRoot, wrapperRelative),
    buildSameSessionWrapper({ protocol: context.protocol, preparedRoot }),
  );
  artifacts.push({ kind: "same-session-auth-wrapper", path: wrapperRelative });
  for (const artifact of artifacts) {
    artifact.sha256 = await sha256File(path.join(stagingRoot, ...artifact.path.split("/")));
  }

  const candidates = [];
  for (const child of context.children) {
    const copied = await treeDigest(path.join(stagingRoot, "inputs", child.candidateId, context.protocol.target.logicalName));
    equal(copied, child.digest, `${child.candidateId} copied tree`);
    candidates.push({
      candidateId: child.candidateId,
      treeSha256: copied.sha256,
      fileCount: copied.fileCount,
      totalBytes: copied.totalBytes,
      ...child.lineage,
    });
  }
  const immutablePayload = await treeDigest(stagingRoot);
  const receipt = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: "generation-002",
    knowledgeCommit: context.protocol.knowledge.commit,
    metaProtocolSha256: context.protocolSha256,
    frozenEvaluationProfileSha256: context.sourceProfileSha256,
    logicalSkillName: context.protocol.target.logicalName,
    q003Task: {
      reuseGenerationId: "generation-001",
      treeSha256: context.protocol.preparationTask.expectedTreeSha256,
      source: "generation-001/prepared/tasks/q003",
      copied: false,
    },
    parentEvidence: {
      candidateId: "baseline",
      generationId: "generation-001",
      reused: true,
      rerunConfigured: false,
      treeSha256: context.protocol.target.baseline.expectedTreeSha256,
      publicationFileSha256: context.parentEvidence.publicationFileSha256,
      publicationSha256: context.parentEvidence.publicationSha256,
      preparationReceiptSha256: context.parentEvidence.preparationReceiptSha256,
      externalRemediationReceiptSha256: context.parentEvidence.externalRemediationReceiptSha256,
      taskChecksum: context.parentEvidence.record.provenance.taskChecksum,
      jobConfigSha256: context.parentEvidence.record.provenance.jobConfigSha256,
      jobLockSha256: context.parentEvidence.record.provenance.jobLockSha256,
      jobResultSha256: context.parentEvidence.record.provenance.jobResultSha256,
      trialResultSha256: context.parentEvidence.record.provenance.trialResultSha256,
      externalRemediationModelCalls: 0,
    },
    diagnosticRepairSource: context.parentEvidence.diagnosticProvenance,
    candidates,
    operator: {
      operatorId: OPERATOR_ID,
      instructionSha256: sha256Bytes(Buffer.from(context.protocol.operator.instruction, "utf8")),
      parentCandidateId: "00-baseline",
      parentTreeSha256: context.protocol.target.baseline.expectedTreeSha256,
      minimumOperatorTrials: 2,
    },
    callAccounting: context.protocol.callAccounting,
    stopPolicy: context.protocol.stopPolicy,
    artifacts,
    immutablePayload,
  };
  await writeExclusive(path.join(stagingRoot, "receipt.json"), canonicalJson(receipt));
  return receipt;
}

async function verifyPrepared({ context, runtimeRoot }) {
  const preparedRoot = path.join(runtimeRoot, "prepared");
  await assertOrdinaryDirectory(preparedRoot, "generation-002 prepared experiment");
  const receipt = await readJson(path.join(preparedRoot, "receipt.json"));
  assertValue(receipt.generationId, "generation-002", "prepared generation");
  assertValue(receipt.metaProtocolSha256, context.protocolSha256, "prepared protocol digest");
  assertValue(receipt.knowledgeCommit, context.protocol.knowledge.commit, "prepared Knowledge commit");
  assertValue(receipt.frozenEvaluationProfileSha256, context.sourceProfileSha256, "prepared profile digest");
  equal(receipt.q003Task, {
    reuseGenerationId: "generation-001",
    treeSha256: context.protocol.preparationTask.expectedTreeSha256,
    source: "generation-001/prepared/tasks/q003",
    copied: false,
  }, "prepared q003 reuse receipt");
  equal(receipt.parentEvidence, {
    candidateId: "baseline",
    generationId: "generation-001",
    reused: true,
    rerunConfigured: false,
    treeSha256: context.protocol.target.baseline.expectedTreeSha256,
    publicationFileSha256: context.parentEvidence.publicationFileSha256,
    publicationSha256: context.parentEvidence.publicationSha256,
    preparationReceiptSha256: context.parentEvidence.preparationReceiptSha256,
    externalRemediationReceiptSha256: context.parentEvidence.externalRemediationReceiptSha256,
    taskChecksum: context.parentEvidence.record.provenance.taskChecksum,
    jobConfigSha256: context.parentEvidence.record.provenance.jobConfigSha256,
    jobLockSha256: context.parentEvidence.record.provenance.jobLockSha256,
    jobResultSha256: context.parentEvidence.record.provenance.jobResultSha256,
    trialResultSha256: context.parentEvidence.record.provenance.trialResultSha256,
    externalRemediationModelCalls: 0,
  }, "prepared parent evidence receipt");
  equal(
    receipt.diagnosticRepairSource,
    context.parentEvidence.diagnosticProvenance,
    "prepared diagnostic repair provenance",
  );
  equal(receipt.candidates, context.children.map((child) => ({
    candidateId: child.candidateId,
    treeSha256: child.digest.sha256,
    fileCount: child.digest.fileCount,
    totalBytes: child.digest.totalBytes,
    ...child.lineage,
  })), "prepared candidate receipt");
  equal(receipt.operator, {
    operatorId: OPERATOR_ID,
    instructionSha256: sha256Bytes(Buffer.from(context.protocol.operator.instruction, "utf8")),
    parentCandidateId: "00-baseline",
    parentTreeSha256: context.protocol.target.baseline.expectedTreeSha256,
    minimumOperatorTrials: 2,
  }, "prepared operator receipt");
  equal(receipt.callAccounting, context.protocol.callAccounting, "prepared call accounting");
  equal(receipt.stopPolicy, context.protocol.stopPolicy, "prepared stop policy");
  equal(
    await treeDigest(preparedRoot, { omitRootFiles: ["receipt.json"] }),
    receipt.immutablePayload,
    "prepared immutable payload",
  );
  if (await exists(path.join(preparedRoot, "configs", "harbor", "q003", "baseline.yaml"))) {
    throw new Error("generation-002 must reuse the parent; baseline.yaml is forbidden");
  }
  if (await exists(path.join(preparedRoot, "inputs", "baseline"))) {
    throw new Error("generation-002 must not copy a baseline input");
  }
  if (await exists(path.join(preparedRoot, "tasks"))) {
    throw new Error("generation-002 must reference the sealed q003 task instead of copying task material");
  }
  const configNames = (await fs.readdir(path.join(preparedRoot, "configs", "harbor", "q003"))).sort();
  equal(configNames, CHILD_IDS.map((id) => `${id}.yaml`).sort(), "generation-002 Harbor config set");
  for (const child of context.children) {
    equal(
      await treeDigest(path.join(preparedRoot, "inputs", child.candidateId, context.protocol.target.logicalName)),
      child.digest,
      `${child.candidateId} prepared tree`,
    );
  }
  equal(
    await readJson(path.join(preparedRoot, "parent-evidence", "baseline-record.json")),
    context.parentEvidence.record,
    "prepared parent record",
  );
  equal(
    await readJson(path.join(preparedRoot, "parent-evidence", "external-remediation-receipt.json")),
    context.parentEvidence.remediation,
    "prepared remediation receipt",
  );
  equal(
    await readJson(path.join(preparedRoot, "parent-evidence", "generation-001-diagnostic-operator-provenance.json")),
    context.parentEvidence.diagnosticProvenance,
    "prepared diagnostic operator provenance",
  );
  equal(receipt.artifacts.map(({ kind, candidateId, path: artifactPath }) => ({
    kind,
    ...(candidateId ? { candidateId } : {}),
    path: artifactPath,
  })), [
    ...context.children.map((child) => ({
      kind: "harbor-child-job-config",
      candidateId: child.candidateId,
      path: `configs/harbor/q003/${child.candidateId}.yaml`,
    })),
    { kind: "operator-development-config", path: "configs/operator/generation-002.yaml" },
    { kind: "same-session-auth-wrapper", path: "run-q003-same-session.sh" },
  ], "prepared artifact inventory");
  for (const artifact of receipt.artifacts) {
    const absolute = assertInside(
      preparedRoot,
      path.join(preparedRoot, ...artifact.path.split("/")),
      `prepared artifact ${artifact.path}`,
    );
    assertValue(await sha256File(absolute), artifact.sha256, `prepared artifact ${artifact.path}`);
    let expected;
    if (artifact.kind === "harbor-child-job-config") {
      expected = buildChildHarborConfig({
        protocol: context.protocol,
        candidateId: artifact.candidateId,
        runtimeRoot,
        preparedRoot,
        knowledgeRoot: context.knowledgeRoot,
        generation001RuntimeRoot: context.generation001RuntimeRoot,
      });
      equal(parseYaml(await fs.readFile(absolute, "utf8")), expected, `prepared config ${artifact.candidateId}`);
    } else if (artifact.kind === "operator-development-config") {
      expected = buildDevelopmentOperatorConfig({
        protocol: context.protocol,
        runtimeRoot,
        preparedRoot,
        generation001RuntimeRoot: context.generation001RuntimeRoot,
      });
      equal(parseYaml(await fs.readFile(absolute, "utf8")), expected, "prepared operator config");
    } else if (artifact.kind === "same-session-auth-wrapper") {
      assertValue(
        await fs.readFile(absolute, "utf8"),
        buildSameSessionWrapper({ protocol: context.protocol, preparedRoot }),
        "prepared same-session wrapper",
      );
    } else {
      throw new Error(`Unknown generation-002 artifact kind: ${artifact.kind}`);
    }
  }
  return receipt;
}

export async function prepareGeneration002(options = {}) {
  const context = await validateInputs(options);
  const runtimeRoot = assertRuntimeOutput(
    path.resolve(options.outputRoot ?? DEFAULT_OUTPUT),
    context.repoRoot,
  );
  const preparedRoot = path.join(runtimeRoot, "prepared");
  if (await exists(preparedRoot)) {
    return {
      mode: "verified-existing",
      runtimeRoot,
      receipt: await verifyPrepared({ context, runtimeRoot }),
    };
  }
  await fs.mkdir(runtimeRoot, { recursive: true });
  const stagingRoot = path.join(runtimeRoot, `.prepared.tmp-${process.pid}-${randomUUID()}`);
  await fs.mkdir(stagingRoot, { recursive: false });
  try {
    const receipt = await materializePrepared({ context, runtimeRoot, stagingRoot });
    await fs.rename(stagingRoot, preparedRoot);
    return { mode: "prepared", runtimeRoot, receipt };
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyGeneration002(options = {}) {
  const context = await validateInputs(options);
  const runtimeRoot = assertRuntimeOutput(
    path.resolve(options.outputRoot ?? DEFAULT_OUTPUT),
    context.repoRoot,
  );
  return {
    mode: "verified",
    runtimeRoot,
    receipt: await verifyPrepared({ context, runtimeRoot }),
  };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const mapping = {
    "--output": "outputRoot",
    "--protocol": "protocolPath",
    "--source-protocol": "sourceProtocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--generation-001-runtime": "generation001RuntimeRoot",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const key = mapping[flag];
    if (!key) {
      throw new Error(`Unknown option: ${flag}`);
    }
    if (!argv[index + 1]) {
      throw new Error(`Missing value for ${flag}`);
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify [options]\n\nPreparation makes no Harbor or model calls.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const result = command === "prepare"
    ? await prepareGeneration002(options)
    : command === "verify"
      ? await verifyGeneration002(options)
      : null;
  if (!result) {
    throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(canonicalJson({
    mode: result.mode,
    runtimeRoot: result.runtimeRoot,
    receipt: path.join(result.runtimeRoot, "prepared", "receipt.json"),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
