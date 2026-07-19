#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  canonicalJson,
  objectDigest,
  treeDigest,
} from "../../scripts/prepare-meta-evolution.js";
import { piAuthDocumentHasRequiredShape } from "../../generation-002/scripts/prepare-generation-002.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const GENERATION_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const STUDY_ROOT = path.resolve(GENERATION_ROOT, "..", "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_PROTOCOL = path.join(GENERATION_ROOT, "protocol.json");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_RUNTIME = path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution", "meta-evolution", "generation-004");

export const BASELINE_ID = "baseline";
export const CANDIDATE_ID = "extractive-one-shot-answer";
export const FIRST_TASK_ID = "q007";
export const REMAINING_TASK_IDS = ["q018", "q024", "q030"];
export const DIAGNOSTIC_CONTRACT_ID = "provider-context-limit.v1";
export const AUTH_SEAL_RELATIVE_PATH = "private/auth-payload-seal.json";
export const OPERATOR_REALIZATION_SHA256 = "67a6d911c541ba2d8bf5a2c5680da02fc59a1c4ce7bf2fe53ed93011d320866b";
export const OPERATOR_ANALYZER_RELATIVE_PATH = "skills/harbor-operator-coevolution/scripts/harbor_operator_coevolution.py";
export const REPORT_ONLY_ANALYZER_RELATIVE_PATH = "skills/harbor-operator-coevolution/scripts/harbor_operator_report_only.py";
export const SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH = "skills/harbor-operator-coevolution/scripts/harbor_candidate_diagnostic.py";
export const Q007_BASELINE_DIAGNOSTIC_MIGRATION_V2_RELATIVE_PATH = "migrations/q007-baseline-diagnostic-v2/receipt.json";
export const Q007_BASELINE_DIAGNOSTIC_MIGRATION_RELATIVE_PATH = "migrations/q007-baseline-diagnostic-v3/receipt.json";
export const Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH = "migrations/q007-publication-projection-v4/receipt.json";
export const REPORT_ONLY_PUBLICATION_MIGRATION_V5_RELATIVE_PATH = "migrations/generation-004-report-only-publication-v5/receipt.json";
export const REPORT_ONLY_PUBLICATION_MIGRATION_RELATIVE_PATH = "migrations/generation-004-report-only-publication-v6/receipt.json";
export const HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID = "harbor-0.18.0.native-trial-lock-exact-null-projection-v1";
export const HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS = Object.freeze([
  "import_path",
  "override_cpus",
  "override_memory_mb",
  "override_storage_mb",
  "override_gpus",
  "override_tpu",
]);
export const HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS = Object.freeze(["override_timeout_sec", "max_timeout_sec"]);

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const IMAGE = "semantic-okf-harbor-runtime:1.0";
const IMAGE_ID = "sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5";
const RETRY_EXCLUSIONS = [
  "ApiUsageLimitError",
  "RewardFileEmptyError",
  "VerifierOutputParseError",
  "AgentTimeoutError",
  "RewardFileNotFoundError",
  "VerifierTimeoutError",
];
const OMITTED_TREE_NAMES = new Set(["__pycache__"]);

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

async function readJson(filePath, label = "JSON") {
  let value;
  try {
    value = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} root must be an object: ${filePath}`);
  }
  return value;
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
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
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
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
  if (!HEX_SHA256.test(digest) || digest === "0".repeat(64)) {
    throw new Error(`${label} must be a sealed lowercase SHA-256 digest`);
  }
  return digest;
}

function assertValue(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
}

function equal(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} drift`);
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

function assertRuntime(runtimeRoot, repoRoot) {
  return assertInside(path.join(repoRoot, ".tmp"), runtimeRoot, "generation-004 runtime", { allowRoot: false });
}

async function assertOrdinaryFile(filePath, label) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be an ordinary file: ${filePath}`);
  return filePath;
}

async function assertOrdinaryDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be an ordinary directory: ${directory}`);
  return directory;
}

async function writeExclusive(filePath, contents, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "wx", ...options });
}

async function copyTree(source, destination) {
  await treeDigest(source);
  await fs.mkdir(destination, { recursive: true });
  async function visit(from, to) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (OMITTED_TREE_NAMES.has(entry.name) || entry.name.endsWith(".pyc")) continue;
      const sourceEntry = path.join(from, entry.name);
      const destinationEntry = path.join(to, entry.name);
      const stat = await fs.lstat(sourceEntry);
      if (stat.isSymbolicLink() || entry.isSymbolicLink()) throw new Error(`Trees cannot contain links: ${sourceEntry}`);
      if (entry.isDirectory()) {
        await fs.mkdir(destinationEntry, { recursive: false });
        await visit(sourceEntry, destinationEntry);
      } else if (entry.isFile()) {
        await fs.copyFile(sourceEntry, destinationEntry, fs.constants.COPYFILE_EXCL);
      } else {
        throw new Error(`Unsupported tree entry: ${sourceEntry}`);
      }
    }
  }
  await visit(path.resolve(source), path.resolve(destination));
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function assertCleanPinnedKnowledge(knowledgeRoot, expectedCommit) {
  assertValue(gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]), expectedCommit, "knowledge commit");
  if (gitOutput(knowledgeRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("Knowledge checkout must remain clean during generation-004 preparation");
  }
  return expectedCommit;
}

function toHarborPath(filePath) {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function yamlDocument(value) {
  return stringifyYaml(value, { indent: 2, lineWidth: 0, sortMapEntries: false });
}

function authContainsShellPath(value) {
  if (Array.isArray(value)) return value.some(authContainsShellPath);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => key.toLowerCase() === "shellpath" || authContainsShellPath(child));
}

function authShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, items: value.map(authShape) };
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return { type: "object", keys, fields: Object.fromEntries(keys.map((key) => [key, authShape(value[key])])) };
  }
  return { type: value === null ? "null" : typeof value };
}

async function resolveAuthJson(authSource) {
  const source = path.resolve(requireString(authSource, "auth source"));
  const sourceStat = await fs.lstat(source);
  if (sourceStat.isSymbolicLink()) throw new Error("auth source cannot be a link");
  const authJson = sourceStat.isDirectory() ? path.join(source, "auth.json") : source;
  await assertOrdinaryFile(authJson, "Pi auth.json");
  const bytes = await fs.readFile(authJson);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`auth.json must be valid JSON: ${error.message}`, { cause: error });
  }
  if (!piAuthDocumentHasRequiredShape(payload) || authContainsShellPath(payload)) {
    throw new Error("auth.json must contain the provider-only Pi credential shape and no shellPath key");
  }
  return {
    authJson,
    payloadSha256: sha256Bytes(bytes),
    byteLength: bytes.length,
    shapeSha256: objectDigest(authShape(payload)),
  };
}

export function validateGeneration004Protocol(protocol) {
  const value = requireObject(protocol, "generation-004 protocol");
  assertValue(value.schemaVersion, 1, "protocol.schemaVersion");
  assertValue(value.status, "sealed-before-forward-task-execution", "protocol.status");
  assertValue(value.generationId, "generation-004", "protocol.generationId");
  assertValue(value.target?.logicalName, "consult-semantic-okf", "target.logicalName");
  assertValue(value.target?.baseline?.candidateId, BASELINE_ID, "baseline candidate ID");
  assertValue(value.target?.candidate?.candidateId, CANDIDATE_ID, "candidate ID");
  assertValue(value.target?.candidate?.parentCandidateId, BASELINE_ID, "candidate parent");
  for (const [label, item] of [["baseline", value.target.baseline], ["candidate", value.target.candidate]]) {
    requireSha(item.expectedTreeSha256, `${label} tree digest`);
    if (!Number.isInteger(item.fileCount) || !Number.isInteger(item.totalBytes)) throw new Error(`${label} tree statistics must be integers`);
  }
  if (value.target.candidate.expectedOperatorRealizationSha256 !== undefined) {
    requireSha(value.target.candidate.expectedOperatorRealizationSha256, "operator realization file digest");
  }
  requireSha(value.candidateSelectionProvenance?.publicationFileSha256, "selection publication file digest");
  requireSha(value.candidateSelectionProvenance?.publicationRecordSha256, "selection publication record digest");
  assertValue(value.candidateSelectionProvenance?.candidateFrozenBeforeForwardTasks, true, "candidate freeze");
  assertValue(value.candidateSelectionProvenance?.comparativeFitnessImported, false, "comparative fitness import");
  assertValue(value.candidateSelectionProvenance?.operatorCreditImported, false, "operator credit import");
  assertValue(value.frozenEvaluationProfile?.attemptsPerCandidateTask, 1, "attempts per candidate/task");
  assertValue(value.frozenEvaluationProfile?.retries, 0, "Harbor retries");
  assertValue(value.diagnosticDisposition?.operatorConfigPath, "harbor.candidateAttributableDiagnosticPolicy.contracts", "diagnostic operator field");
  equal(value.diagnosticDisposition?.contracts, [DIAGNOSTIC_CONTRACT_ID], "diagnostic contracts");
  const diagnostic = value.diagnosticDisposition?.[DIAGNOSTIC_CONTRACT_ID];
  equal(diagnostic?.exactRawSignals, {
    status: "provider-failure",
    failure_domain: "provider",
    terminal_outcome: "provider-context-limit",
    error_code: "context_length_exceeded",
  }, "candidate-attributable exact raw signals");
  for (const field of ["requiresEveryDiagnosticObservationToMatch", "requiresNoHarborException", "requiresPrimaryAndConfiguredRequiredRewardsToBeAbsentOrExactZero", "unconfiguredAuxiliaryAuditMetricsMayBeNonzero", "evaluationAvailable"]) {
    assertValue(diagnostic?.[field], true, `${DIAGNOSTIC_CONTRACT_ID}.${field}`);
  }
  assertValue(diagnostic?.score, 0, "context-limit score");
  assertValue(diagnostic?.qualificationPassed, false, "context-limit qualification");
  assertValue(diagnostic?.retryAuthorized, false, "context-limit retry policy");
  for (const taskId of [FIRST_TASK_ID, ...REMAINING_TASK_IDS]) {
    const task = requireObject(value.tasks?.[taskId], `tasks.${taskId}`);
    requireSha(task.expectedTreeSha256, `${taskId} tree digest`);
    if (!Number.isInteger(task.fileCount) || !Number.isInteger(task.totalBytes)) throw new Error(`${taskId} tree statistics must be integers`);
  }
  equal(value.stages?.[0]?.variants, [BASELINE_ID, CANDIDATE_ID], "q007 variants");
  equal(value.stages?.[1]?.taskIds, REMAINING_TASK_IDS, "remaining task IDs");
  assertValue(value.callBudget?.maximumAdditionalHarborInvocations, 4, "Harbor invocation budget");
  assertValue(value.callBudget?.maximumAdditionalModelExecutions, 8, "model execution budget");
  assertValue(value.callBudget?.harborBuiltInRetries, 0, "built-in retries");
  assertValue(value.callBudget?.automaticExternalRetries, 0, "automatic external retries");
  assertValue(value.authentication?.isolatedMount, "/tmp/skill-arena-knowledge-consult-g004-auth", "isolated auth mount");
  assertValue(value.authentication?.mountTarget, "/root/.pi/agent", "auth target");
  assertValue(value.authentication?.copyOnlyAuthJson, true, "auth projection");
  assertValue(value.authentication?.historicalGeneration003SealReused, false, "historical auth seal reuse");
  return value;
}

function stageSpecification(stageId) {
  if (stageId === FIRST_TASK_ID) return { stageId, taskIds: [FIRST_TASK_ID], maximumModelExecutions: 2 };
  if (stageId === "remaining-forward-validation") return { stageId, taskIds: REMAINING_TASK_IDS, maximumModelExecutions: 6 };
  throw new Error(`Unknown generation-004 stage: ${stageId}`);
}

function stagePreparedRoot(runtimeRoot, stageId) {
  return path.join(runtimeRoot, "prepared", stageId);
}

export function jobName(protocol, stageId, candidateId) {
  if (![BASELINE_ID, CANDIDATE_ID].includes(candidateId)) throw new Error(`Unknown candidate ${candidateId}`);
  stageSpecification(stageId);
  const suffix = stageId === FIRST_TASK_ID ? FIRST_TASK_ID : "remaining";
  return `${protocol.experimentId}-${suffix}-${candidateId}`;
}

export function jobDirectory(runtimeRoot, protocol, stageId, candidateId) {
  return path.join(runtimeRoot, "jobs", stageId, candidateId, jobName(protocol, stageId, candidateId));
}

export function buildGeneration004HarborConfig({ protocol, stageId, candidateId, runtimeRoot, preparedRoot, knowledgeRoot }) {
  validateGeneration004Protocol(protocol);
  const stage = stageSpecification(stageId);
  const profile = protocol.frozenEvaluationProfile;
  const skillRoot = path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName);
  return {
    job_name: jobName(protocol, stageId, candidateId),
    jobs_dir: toHarborPath(path.join(runtimeRoot, "jobs", stageId, candidateId)),
    n_attempts: 1,
    install_only: false,
    timeout_multiplier: 1,
    debug: false,
    n_concurrent_trials: 1,
    quiet: false,
    retry: {
      max_retries: 0,
      exclude_exceptions: RETRY_EXCLUSIONS,
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
          source: toHarborPath(path.join(knowledgeRoot, ...protocol.knowledge.referenceBundlePath.split("/"))),
          target: "/knowledge",
          read_only: true,
          bind: { create_host_path: false },
        },
        {
          type: "bind",
          source: protocol.authentication.isolatedMount,
          target: protocol.authentication.mountTarget,
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
      skills: [toHarborPath(skillRoot)],
      extra_allowed_hosts: [],
      kwargs: { version: profile.agent.version, thinking: profile.agent.thinking },
      env: { PI_CODING_AGENT_DIR: protocol.authentication.mountTarget },
      mcp_servers: [],
    }],
    datasets: [{
      path: toHarborPath(path.join(preparedRoot, "tasks")),
      overwrite: false,
      task_names: stage.taskIds,
    }],
    tasks: [],
    artifacts: [],
    extra_instruction_paths: [],
  };
}

function operatorRealizationPath(repoRoot) {
  return path.join(repoRoot, "evaluations", "knowledge-consult-evolution", "meta-evolution", "generation-003", "candidates", CANDIDATE_ID, "operator-realization.json");
}

export function buildOperatorAnalysisConfig({ protocol, stageId, runtimeRoot, preparedRoot, operatorInstruction, baselineOnly = false }) {
  const baselineJob = toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, BASELINE_ID));
  const candidateJob = baselineOnly ? baselineJob : toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, CANDIDATE_ID));
  const baselineSkill = toHarborPath(path.join(preparedRoot, "inputs", BASELINE_ID, protocol.target.logicalName));
  const candidateSkill = baselineOnly ? baselineSkill : toHarborPath(path.join(preparedRoot, "inputs", CANDIDATE_ID, protocol.target.logicalName));
  const childId = baselineOnly ? "baseline-safety-copy" : CANDIDATE_ID;
  return {
    schemaVersion: 1,
    evolution: {
      id: `${protocol.experimentId}-${stageId}${baselineOnly ? "-baseline-gate" : ""}`,
      generation: 0,
      generationId: `generation-004-${stageId}${baselineOnly ? "-baseline-gate" : ""}`,
      outputDir: "../../../private/operator-analysis/unused-cli-overrides-this",
      baselineCandidateId: BASELINE_ID,
    },
    harbor: {
      rewardKey: protocol.frozenEvaluationProfile.rewardKey,
      passThreshold: protocol.frozenEvaluationProfile.passThreshold,
      requiredRewards: protocol.frozenEvaluationProfile.requiredRewards,
      requireNoErrors: true,
      requiredEnv: [],
      diagnosticChars: 3000,
      candidateAttributableDiagnosticPolicy: { contracts: [DIAGNOSTIC_CONTRACT_ID] },
    },
    coevolution: {
      candidateSurvivors: 2,
      operatorSurvivors: 2,
      nextOperatorCount: 2,
      minimumOperatorTrials: 1,
      allowCaseRegressionsForCredit: false,
      complementaryRepair: false,
    },
    operators: [
      { operatorId: protocol.target.candidate.operatorId, instruction: operatorInstruction, parentOperatorIds: [], origin: "frozen-realization" },
      { operatorId: "forward-validation-control", instruction: "Preserve the frozen forward-validation inputs without mutation.", parentOperatorIds: [], origin: "control" },
    ],
    candidates: [
      { candidateId: BASELINE_ID, skill: baselineSkill, jobDirectory: baselineJob },
      { candidateId: childId, parentCandidateId: BASELINE_ID, operatorId: protocol.target.candidate.operatorId, skill: candidateSkill, jobDirectory: candidateJob },
    ],
    holdout: {
      baseline: { candidateId: BASELINE_ID, jobDirectory: "../../../not-opened/generation-004-holdout-baseline" },
      candidate: { candidateId: childId, jobDirectory: "../../../not-opened/generation-004-holdout-candidate" },
      minimumMeanGain: 0,
      allowTaskRegressions: false,
      requireNoErrors: true,
    },
  };
}

export function buildRunWrapper({ protocol, stageId, candidateId, runtimeRoot, preparedRoot }) {
  const configPath = toHarborPath(path.join(preparedRoot, "configs", "harbor", `${candidateId}.yaml`));
  const selectedSkill = toHarborPath(path.join(preparedRoot, "inputs", candidateId, protocol.target.logicalName));
  const selectedJob = toHarborPath(jobDirectory(runtimeRoot, protocol, stageId, candidateId));
  const prepareScript = toHarborPath(SCRIPT_PATH);
  const publisherScript = toHarborPath(path.join(GENERATION_ROOT, "scripts", "publish-generation-004.js"));
  const runtime = toHarborPath(runtimeRoot);
  const authMount = protocol.authentication.isolatedMount;
  const stageVerify = stageId === FIRST_TASK_ID ? "verify-q007" : "verify-remaining";
  const baselineGate = candidateId === CANDIDATE_ID
    ? `node ${JSON.stringify(publisherScript)} classify-${stageId === FIRST_TASK_ID ? "q007" : "remaining"}-baseline --runtime ${JSON.stringify(runtime)} >/dev/null\n`
    : "";
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/readable/auth.json-or-pi-auth-directory" >&2
  exit 64
fi
auth_source="$1"
if [[ -f "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source"
elif [[ -d "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source/auth.json"
else
  echo "auth source must be an ordinary auth.json file or Pi auth directory" >&2
  exit 65
fi
if [[ ! -f "$auth_json" || -L "$auth_json" ]]; then
  echo "auth.json must be an ordinary readable file" >&2
  exit 65
fi
if [[ -e ${JSON.stringify(selectedJob)} ]]; then
  echo "generation-004 ${stageId} ${candidateId} job already exists; never overwrite it" >&2
  exit 68
fi

# These checks are local and model-free. Candidate wrappers also require the
# analyzer-owned baseline disposition before authorizing another model call.
node ${JSON.stringify(prepareScript)} ${stageVerify} --runtime ${JSON.stringify(runtime)} --auth-source "$auth_json" >/dev/null
${baselineGate}uvx --offline --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor --version >/dev/null

auth_mount=${JSON.stringify(authMount)}
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
mkdir -m 700 -- "$auth_mount"
cleanup() { rm -rf -- "$auth_mount"; }
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
if [[ "$(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\\n' | LC_ALL=C sort)" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
node ${JSON.stringify(prepareScript)} verify-auth --runtime ${JSON.stringify(runtime)} --auth-source "$auth_mount/auth.json" >/dev/null

actual_image_id="$(docker image inspect --format '{{.Id}}' ${IMAGE})"
if [[ "$actual_image_id" != ${JSON.stringify(IMAGE_ID)} ]]; then
  echo "generation-004 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash \\
  --mount "type=bind,source=$auth_mount,target=/root/.pi/agent" \\
  --mount "type=bind,source=${selectedSkill},target=/candidate,readonly" \\
  ${IMAGE} \\
  -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
test -r /candidate/scripts/runtime_smoke.py
python -B /candidate/scripts/runtime_smoke.py >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'shellPath'"'"' /root/.pi/agent
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --offline --from harbor==${protocol.frozenEvaluationProfile.harborVersion} harbor run --config ${JSON.stringify(configPath)} --yes
`;
}

async function validateTaskSource(source, expected, taskId) {
  await assertOrdinaryDirectory(source, `${taskId} source task`);
  for (const entry of ["instruction.md", "task.toml", "environment", "tests"]) {
    if (!await exists(path.join(source, entry))) throw new Error(`${taskId} is not a complete Harbor task: missing ${entry}`);
  }
  const digest = await treeDigest(source);
  equal(digest, { sha256: expected.expectedTreeSha256, fileCount: expected.fileCount, totalBytes: expected.totalBytes }, `${taskId} task tree`);
  return digest;
}

async function validateSkillSource(source, expected, logicalName, label) {
  await assertOrdinaryDirectory(source, `${label} skill`);
  const skill = await fs.readFile(path.join(source, "SKILL.md"), "utf8");
  const frontmatter = skill.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter || parseYaml(frontmatter[1])?.name !== logicalName || path.basename(source) !== logicalName) {
    throw new Error(`${label} must preserve canonical skill name ${logicalName}`);
  }
  const digest = await treeDigest(source);
  equal(digest, { sha256: expected.expectedTreeSha256, fileCount: expected.fileCount, totalBytes: expected.totalBytes }, `${label} skill tree`);
  return digest;
}

async function validateSelectionPublication(repoRoot, protocol) {
  const selectionPath = assertInside(repoRoot, path.join(repoRoot, ...protocol.candidateSelectionProvenance.publicationPath.split("/")), "selection publication");
  await assertOrdinaryFile(selectionPath, "generation-003 selection publication");
  assertValue(await sha256File(selectionPath), protocol.candidateSelectionProvenance.publicationFileSha256, "selection publication file digest");
  const publication = await readJson(selectionPath, "selection publication");
  const { publicationSha256, ...body } = publication;
  assertValue(objectDigest(body), protocol.candidateSelectionProvenance.publicationRecordSha256, "selection publication record digest");
  assertValue(publicationSha256, protocol.candidateSelectionProvenance.publicationRecordSha256, "selection publication self-digest");
  assertValue(publication.generationId, protocol.candidateSelectionProvenance.generationId, "selection generation");
  assertValue(publication.gate?.passed, true, "selection gate");
  assertValue(publication.gate?.selectedCandidateId, protocol.candidateSelectionProvenance.publishedSelectedCandidateId, "selected public candidate");
  return { path: selectionPath, fileSha256: await sha256File(selectionPath), recordSha256: publicationSha256 };
}

async function loadContext(options, { taskIds }) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const protocol = validateGeneration004Protocol(await readJson(protocolPath, "generation-004 protocol"));
  const knowledgeRoot = path.resolve(options.knowledgeRoot ?? DEFAULT_KNOWLEDGE_ROOT);
  const taskRoot = options.taskRoot ? path.resolve(options.taskRoot) : null;
  assertCleanPinnedKnowledge(knowledgeRoot, protocol.knowledge.commit);
  const baselineSource = assertInside(knowledgeRoot, path.join(knowledgeRoot, ...protocol.knowledge.baselineSkillPath.split("/")), "baseline source");
  const candidateSource = assertInside(repoRoot, path.join(repoRoot, ...protocol.target.candidate.sourcePath.split("/")), "candidate source");
  const [baselineDigest, candidateDigest, selection] = await Promise.all([
    validateSkillSource(baselineSource, protocol.target.baseline, protocol.target.logicalName, BASELINE_ID),
    validateSkillSource(candidateSource, protocol.target.candidate, protocol.target.logicalName, CANDIDATE_ID),
    validateSelectionPublication(repoRoot, protocol),
  ]);
  if (baselineDigest.sha256 === candidateDigest.sha256) throw new Error("Forward candidate must differ from the baseline");
  const realizationPath = operatorRealizationPath(repoRoot);
  const expectedRealizationSha256 = protocol.target.candidate.expectedOperatorRealizationSha256 ?? OPERATOR_REALIZATION_SHA256;
  assertValue(await sha256File(realizationPath), expectedRealizationSha256, "operator realization file digest");
  const realization = await readJson(realizationPath, "operator realization");
  assertValue(realization.operatorId, protocol.target.candidate.operatorId, "operator realization ID");
  assertValue(realization.candidateId, CANDIDATE_ID, "operator realization candidate");
  assertValue(realization.candidateTreeSha256, candidateDigest.sha256, "operator realization tree digest");
  const operatorAnalyzerPath = assertInside(
    repoRoot,
    path.join(repoRoot, ...OPERATOR_ANALYZER_RELATIVE_PATH.split("/")),
    "Harbor operator analyzer",
  );
  await assertOrdinaryFile(operatorAnalyzerPath, "Harbor operator analyzer");
  const singleCandidateDiagnosticPath = assertInside(
    repoRoot,
    path.join(repoRoot, ...SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH.split("/")),
    "Harbor single-candidate diagnostic helper",
  );
  await assertOrdinaryFile(singleCandidateDiagnosticPath, "Harbor single-candidate diagnostic helper");
  const tasks = [];
  for (const taskId of taskIds) {
    const source = taskRoot
      ? assertInside(taskRoot, path.join(taskRoot, taskId), `${taskId} task source`)
      : assertInside(repoRoot, path.join(repoRoot, ...protocol.tasks[taskId].sourcePath.split("/")), `${taskId} task source`);
    tasks.push({ taskId, source, digest: await validateTaskSource(source, protocol.tasks[taskId], taskId) });
  }
  return {
    repoRoot,
    runtimeRoot,
    protocolPath,
    protocol,
    protocolSha256: await sha256File(protocolPath),
    profileSha256: objectDigest(protocol.frozenEvaluationProfile),
    knowledgeRoot,
    baselineSource,
    candidateSource,
    candidateDigests: { [BASELINE_ID]: baselineDigest, [CANDIDATE_ID]: candidateDigest },
    selection,
    operatorRealization: { path: realizationPath, fileSha256: expectedRealizationSha256, instruction: requireString(realization.instruction, "operator instruction") },
    operatorAnalyzer: { path: operatorAnalyzerPath, fileSha256: await sha256File(operatorAnalyzerPath) },
    singleCandidateDiagnostic: { path: singleCandidateDiagnosticPath, fileSha256: await sha256File(singleCandidateDiagnosticPath) },
    tasks,
  };
}

export async function sealGeneration004Authentication(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  validateGeneration004Protocol(await readJson(protocolPath, "generation-004 protocol"));
  const sealPath = path.join(runtimeRoot, ...AUTH_SEAL_RELATIVE_PATH.split("/"));
  if (await exists(sealPath)) throw new Error("generation-004 authentication is already sealed; never amend or reuse it");
  if (await exists(path.join(runtimeRoot, "prepared")) || await exists(path.join(runtimeRoot, "jobs"))) {
    throw new Error("Authentication must be freshly sealed before generation-004 preparation or jobs");
  }
  const auth = await resolveAuthJson(options.authSource);
  const body = {
    schemaVersion: 1,
    kind: "generation-004-private-auth-payload-seal",
    generationId: "generation-004",
    freshSealId: randomUUID(),
    protocolSha256: await sha256File(protocolPath),
    mount: { source: "/tmp/skill-arena-knowledge-consult-g004-auth", target: "/root/.pi/agent", projectedEntries: ["auth.json"] },
    payload: { sha256: auth.payloadSha256, byteLength: auth.byteLength, shapeSha256: auth.shapeSha256 },
    publicationPolicy: { publishPayloadDigest: false, publishCredentialMetadata: false },
    historicalGeneration003SealReused: false,
  };
  const seal = { ...body, sealSha256: objectDigest(body) };
  await writeExclusive(sealPath, canonicalJson(seal), { mode: 0o600 });
  return { mode: "sealed", runtimeRoot, sealPath };
}

export async function verifyGeneration004Authentication(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const protocolPath = path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL);
  const protocol = validateGeneration004Protocol(await readJson(protocolPath, "generation-004 protocol"));
  const sealPath = path.join(runtimeRoot, ...AUTH_SEAL_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(sealPath, "generation-004 private auth seal");
  const seal = await readJson(sealPath, "private auth seal");
  const { sealSha256, ...body } = seal;
  assertValue(sealSha256, objectDigest(body), "private auth seal self-digest");
  assertValue(body.kind, "generation-004-private-auth-payload-seal", "private auth seal kind");
  assertValue(body.generationId, "generation-004", "private auth generation");
  assertValue(body.protocolSha256, await sha256File(protocolPath), "private auth protocol binding");
  assertValue(body.mount?.source, protocol.authentication.isolatedMount, "private auth source mount");
  assertValue(body.mount?.target, protocol.authentication.mountTarget, "private auth target mount");
  equal(body.mount?.projectedEntries, ["auth.json"], "private auth projection");
  assertValue(body.historicalGeneration003SealReused, false, "historical auth reuse");
  assertValue(body.publicationPolicy?.publishPayloadDigest, false, "auth digest publication policy");
  const auth = await resolveAuthJson(options.authSource);
  assertValue(auth.payloadSha256, body.payload?.sha256, "sealed auth payload");
  assertValue(auth.byteLength, body.payload?.byteLength, "sealed auth length");
  assertValue(auth.shapeSha256, body.payload?.shapeSha256, "sealed auth shape");
  return { mode: "verified", runtimeRoot, sealPath };
}

async function artifactRecord(root, relativePath, kind, extra = {}) {
  return { kind, path: relativePath, sha256: await sha256File(path.join(root, ...relativePath.split("/"))), ...extra };
}

async function materializeStage(context, stageId, stagingRoot) {
  const preparedRoot = stagePreparedRoot(context.runtimeRoot, stageId);
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    const source = candidateId === BASELINE_ID ? context.baselineSource : context.candidateSource;
    await copyTree(source, path.join(stagingRoot, "inputs", candidateId, context.protocol.target.logicalName));
  }
  for (const task of context.tasks) await copyTree(task.source, path.join(stagingRoot, "tasks", task.taskId));
  const artifacts = [];
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    const relative = `configs/harbor/${candidateId}.yaml`;
    await writeExclusive(path.join(stagingRoot, ...relative.split("/")), yamlDocument(buildGeneration004HarborConfig({
      protocol: context.protocol,
      stageId,
      candidateId,
      runtimeRoot: context.runtimeRoot,
      preparedRoot,
      knowledgeRoot: context.knowledgeRoot,
    })));
    artifacts.push(await artifactRecord(stagingRoot, relative, "harbor-job-config", { candidateId }));
  }
  for (const baselineOnly of [true, false]) {
    const relative = `configs/operator/${baselineOnly ? "baseline-gate" : "stage"}.yaml`;
    const config = buildOperatorAnalysisConfig({
      protocol: context.protocol,
      stageId,
      runtimeRoot: context.runtimeRoot,
      preparedRoot,
      operatorInstruction: context.operatorRealization.instruction,
      baselineOnly,
    });
    await writeExclusive(path.join(stagingRoot, ...relative.split("/")), yamlDocument(config));
    artifacts.push(await artifactRecord(stagingRoot, relative, "operator-analysis-config", { baselineOnly }));
  }
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    const relative = `run-${candidateId}.sh`;
    await writeExclusive(path.join(stagingRoot, relative), buildRunWrapper({
      protocol: context.protocol,
      stageId,
      candidateId,
      runtimeRoot: context.runtimeRoot,
      preparedRoot,
    }), { mode: 0o755 });
    artifacts.push(await artifactRecord(stagingRoot, relative, "wsl-run-wrapper", { candidateId }));
  }
  const copiedCandidates = [];
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    const digest = await treeDigest(path.join(stagingRoot, "inputs", candidateId, context.protocol.target.logicalName));
    equal(digest, context.candidateDigests[candidateId], `copied ${candidateId} tree`);
    copiedCandidates.push({ candidateId, ...digest });
  }
  const copiedTasks = [];
  for (const task of context.tasks) {
    const digest = await treeDigest(path.join(stagingRoot, "tasks", task.taskId));
    equal(digest, task.digest, `copied ${task.taskId} tree`);
    copiedTasks.push({ taskId: task.taskId, ...digest });
  }
  const payload = await treeDigest(stagingRoot);
  const stage = stageSpecification(stageId);
  const receipt = {
    schemaVersion: 1,
    experimentId: context.protocol.experimentId,
    generationId: "generation-004",
    stageId,
    protocolSha256: context.protocolSha256,
    profileSha256: context.profileSha256,
    knowledgeCommit: context.protocol.knowledge.commit,
    candidateSelection: { fileSha256: context.selection.fileSha256, recordSha256: context.selection.recordSha256 },
    operatorRealization: { fileSha256: context.operatorRealization.fileSha256, operatorId: context.protocol.target.candidate.operatorId },
    operatorAnalyzer: { relativePath: OPERATOR_ANALYZER_RELATIVE_PATH, fileSha256: context.operatorAnalyzer.fileSha256 },
    singleCandidateDiagnostic: { relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH, fileSha256: context.singleCandidateDiagnostic.fileSha256 },
    candidates: copiedCandidates,
    tasks: copiedTasks,
    diagnosticPolicy: { contracts: [DIAGNOSTIC_CONTRACT_ID] },
    callBudget: {
      harborInvocationsInStage: 2,
      maximumModelExecutionsInStage: stage.maximumModelExecutions,
      attemptsPerCandidateTask: 1,
      retries: 0,
      automaticExternalRetries: 0,
    },
    artifacts,
    immutablePayload: payload,
  };
  await writeExclusive(path.join(stagingRoot, "receipt.json"), canonicalJson(receipt));
  return receipt;
}

async function verifyStage(context, stageId) {
  const preparedRoot = stagePreparedRoot(context.runtimeRoot, stageId);
  await assertOrdinaryDirectory(preparedRoot, `${stageId} prepared stage`);
  const receiptPath = path.join(preparedRoot, "receipt.json");
  const receipt = await readJson(receiptPath, `${stageId} receipt`);
  assertValue(receipt.protocolSha256, context.protocolSha256, `${stageId} protocol binding`);
  assertValue(receipt.profileSha256, context.profileSha256, `${stageId} profile binding`);
  assertValue(receipt.knowledgeCommit, context.protocol.knowledge.commit, `${stageId} knowledge binding`);
  equal(receipt.candidateSelection, { fileSha256: context.selection.fileSha256, recordSha256: context.selection.recordSha256 }, `${stageId} selection binding`);
  equal(receipt.operatorAnalyzer, { relativePath: OPERATOR_ANALYZER_RELATIVE_PATH, fileSha256: context.operatorAnalyzer.fileSha256 }, `${stageId} operator analyzer binding`);
  if (receipt.singleCandidateDiagnostic !== undefined) {
    equal(receipt.singleCandidateDiagnostic, { relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH, fileSha256: context.singleCandidateDiagnostic.fileSha256 }, `${stageId} single-candidate diagnostic binding`);
  } else if (stageId !== FIRST_TASK_ID) {
    throw new Error(`${stageId} receipt must bind the single-candidate diagnostic helper`);
  }
  equal(receipt.diagnosticPolicy, { contracts: [DIAGNOSTIC_CONTRACT_ID] }, `${stageId} diagnostic policy`);
  const payload = await treeDigest(preparedRoot, { omitRootFiles: ["receipt.json"] });
  equal(payload, receipt.immutablePayload, `${stageId} immutable payload`);
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    equal(await treeDigest(path.join(preparedRoot, "inputs", candidateId, context.protocol.target.logicalName)), context.candidateDigests[candidateId], `${stageId} ${candidateId} tree`);
  }
  for (const task of context.tasks) equal(await treeDigest(path.join(preparedRoot, "tasks", task.taskId)), task.digest, `${stageId} ${task.taskId} tree`);
  for (const artifact of requireArray(receipt.artifacts, `${stageId} artifacts`)) {
    const absolute = assertInside(preparedRoot, path.join(preparedRoot, ...artifact.path.split("/")), `${stageId} artifact`);
    assertValue(await sha256File(absolute), artifact.sha256, `${stageId} artifact ${artifact.path}`);
  }
  return { receipt, receiptPath, receiptSha256: await sha256File(receiptPath) };
}

async function prepareStage(options, stageId, taskIds) {
  await verifyGeneration004Authentication(options);
  const context = await loadContext(options, { taskIds });
  const destination = stagePreparedRoot(context.runtimeRoot, stageId);
  if (await exists(destination)) return { mode: "verified-existing", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, stageId)) };
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const staging = path.join(context.runtimeRoot, `.${stageId}-preparing-${process.pid}-${randomUUID()}`);
  await fs.mkdir(staging, { recursive: false });
  try {
    const receipt = await materializeStage(context, stageId, staging);
    await fs.rename(staging, destination);
    return { mode: "prepared", runtimeRoot: context.runtimeRoot, receipt, receiptPath: path.join(destination, "receipt.json") };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareQ007(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  if (await exists(path.join(runtimeRoot, "jobs"))) throw new Error("q007 must be prepared before any generation-004 Harbor job exists");
  if (await exists(stagePreparedRoot(runtimeRoot, "remaining-forward-validation"))) throw new Error("remaining tasks cannot precede the q007 gate");
  return prepareStage({ ...options, repoRoot, runtimeRoot }, FIRST_TASK_ID, [FIRST_TASK_ID]);
}

export async function verifyQ007(options = {}) {
  await verifyGeneration004Authentication(options);
  const context = await loadContext(options, { taskIds: [FIRST_TASK_ID] });
  if (await exists(stagePreparedRoot(context.runtimeRoot, "remaining-forward-validation"))) {
    const publicationPath = path.join(context.runtimeRoot, "publications", FIRST_TASK_ID, "result.json");
    const publication = await readJson(publicationPath, "q007 publication");
    if (!publication.gate?.passed) throw new Error("remaining tasks were materialized without a passing q007 publication");
  }
  return { mode: "verified", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, FIRST_TASK_ID)) };
}

async function verifyPassingQ007Publication(options, runtimeRoot, protocol) {
  const publisher = await import("./publish-generation-004.js");
  const verified = await publisher.verifyPublishedStage({
    repoRoot: options.repoRoot,
    runtimeRoot,
    protocolPath: options.protocolPath,
    knowledgeRoot: options.knowledgeRoot,
  }, FIRST_TASK_ID);
  const publicationPath = verified.resultPath;
  const publication = verified.publication;
  assertValue(publication.experimentId, protocol.experimentId, "q007 publication experiment");
  assertValue(publication.generationId, "generation-004", "q007 publication generation");
  assertValue(publication.stageId, FIRST_TASK_ID, "q007 publication stage");
  assertValue(publication.gate?.status, "advance", "q007 publication gate status");
  assertValue(publication.gate?.passed, true, "q007 forward gate");
  assertValue(publication.gate?.nextStage, "remaining-forward-validation", "q007 next stage");
  return { path: publicationPath, fileSha256: await sha256File(publicationPath), recordSha256: publication.publicationSha256 };
}

export async function prepareRemaining(options = {}) {
  await verifyQ007(options);
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const protocol = validateGeneration004Protocol(await readJson(path.resolve(options.protocolPath ?? DEFAULT_PROTOCOL), "generation-004 protocol"));
  await verifyPassingQ007Publication(options, runtimeRoot, protocol);
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    if (await exists(jobDirectory(runtimeRoot, protocol, "remaining-forward-validation", candidateId))) {
      throw new Error("remaining tasks must be materialized before their Harbor jobs");
    }
  }
  return prepareStage({ ...options, repoRoot, runtimeRoot }, "remaining-forward-validation", REMAINING_TASK_IDS);
}

export async function verifyRemaining(options = {}) {
  await verifyQ007(options);
  const context = await loadContext(options, { taskIds: REMAINING_TASK_IDS });
  await verifyPassingQ007Publication(options, context.runtimeRoot, context.protocol);
  return { mode: "verified", runtimeRoot: context.runtimeRoot, ...(await verifyStage(context, "remaining-forward-validation")) };
}

async function q007BaselineDiagnosticMigrationBody(options = {}) {
  const context = await loadContext(options, { taskIds: [FIRST_TASK_ID] });
  const verified = await verifyStage(context, FIRST_TASK_ID);
  const baselineDirectory = jobDirectory(context.runtimeRoot, context.protocol, FIRST_TASK_ID, BASELINE_ID);
  await assertOrdinaryDirectory(baselineDirectory, "existing q007 baseline job");
  const candidateDirectory = jobDirectory(context.runtimeRoot, context.protocol, FIRST_TASK_ID, CANDIDATE_ID);
  if (await exists(candidateDirectory)) {
    throw new Error("q007 candidate job already exists; the baseline-diagnostic migration must precede every candidate call");
  }
  const baselineConfigPath = path.join(baselineDirectory, "config.json");
  const baselineLockPath = path.join(baselineDirectory, "lock.json");
  const baselineResultPath = path.join(baselineDirectory, "result.json");
  const [baselineConfig, baselineLock, baselineResult] = await Promise.all([
    readJson(baselineConfigPath, "q007 baseline job config"),
    readJson(baselineLockPath, "q007 baseline job lock"),
    readJson(baselineResultPath, "q007 baseline job result"),
  ]);
  assertValue(baselineConfig.job_name, jobName(context.protocol, FIRST_TASK_ID, BASELINE_ID), "q007 baseline job name");
  assertValue(baselineConfig.retry?.max_retries ?? 0, 0, "q007 baseline configured retries");
  assertValue(baselineLock.harbor?.version, context.protocol.frozenEvaluationProfile.harborVersion, "q007 baseline Harbor version");
  assertValue(baselineLock.retry?.max_retries ?? 0, 0, "q007 baseline locked retries");
  assertValue(baselineResult.n_total_trials, 1, "q007 baseline trial count");
  assertValue(baselineResult.stats?.n_retries ?? 0, 0, "q007 baseline result retries");
  if (!baselineResult.finished_at) throw new Error("q007 baseline job must be complete before diagnostic migration");
  const trials = [];
  for (const entry of await fs.readdir(baselineDirectory, { withFileTypes: true })) {
    const trialResultPath = path.join(baselineDirectory, entry.name, "result.json");
    if (entry.isDirectory() && await exists(trialResultPath)) {
      trials.push({ trialName: entry.name, resultSha256: await sha256File(trialResultPath) });
    }
  }
  if (trials.length !== 1) throw new Error("q007 baseline must preserve exactly one trial result");
  const helperPath = assertInside(
    context.repoRoot,
    path.join(context.repoRoot, ...SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH.split("/")),
    "single-candidate diagnostic helper",
  );
  const publisherPath = path.join(GENERATION_ROOT, "scripts", "publish-generation-004.js");
  await Promise.all([
    assertOrdinaryFile(helperPath, "single-candidate diagnostic helper"),
    assertOrdinaryFile(publisherPath, "generation-004 publisher"),
  ]);
  const stageConfigArtifact = context.protocol && verified.receipt.artifacts.find(
    (artifact) => artifact.kind === "operator-analysis-config" && artifact.baselineOnly === false,
  );
  const legacyConfigArtifact = verified.receipt.artifacts.find(
    (artifact) => artifact.kind === "operator-analysis-config" && artifact.baselineOnly === true,
  );
  if (!stageConfigArtifact || !legacyConfigArtifact) throw new Error("q007 receipt lacks both sealed operator configs");
  const failedDebugRoot = path.join(context.runtimeRoot, "private", "operator-analysis", "debug-q007-baseline");
  const rejectedSharedJobOutput = path.join(context.runtimeRoot, "private", "operator-analysis", "q007-baseline-gate");
  if (await exists(rejectedSharedJobOutput)) {
    throw new Error("The rejected shared-job analyzer output must not be reused or migrated");
  }
  const priorMigrationPath = path.join(context.runtimeRoot, ...Q007_BASELINE_DIAGNOSTIC_MIGRATION_V2_RELATIVE_PATH.split("/"));
  let supersedes = null;
  if (await exists(priorMigrationPath)) {
    const prior = await readJson(priorMigrationPath, "q007 baseline diagnostic v2 migration");
    const { migrationSha256, ...priorBody } = prior;
    assertValue(migrationSha256, objectDigest(priorBody), "q007 baseline diagnostic v2 migration self-digest");
    supersedes = {
      relativePath: Q007_BASELINE_DIAGNOSTIC_MIGRATION_V2_RELATIVE_PATH,
      fileSha256: await sha256File(priorMigrationPath),
      migrationSha256,
      reason: "v2-diagnostic-succeeded-but-publication-gate-rejected-the-prefixed-logical-task-name",
      candidateExecutionAuthorized: false,
    };
  }
  return {
    schemaVersion: 1,
    kind: "generation-004-q007-baseline-diagnostic-migration-v3",
    migrationId: "q007-baseline-diagnostic-v3",
    generationId: "generation-004",
    stageId: FIRST_TASK_ID,
    reason: "replace-rejected-shared-job-baseline-gate-with-single-candidate-diagnostic-only",
    supersedes,
    protocolSha256: context.protocolSha256,
    originalPreparedStage: {
      receiptFileSha256: verified.receiptSha256,
      immutablePayload: verified.receipt.immutablePayload,
      preservedBytewise: true,
      legacyRejectedBaselineConfigSha256: legacyConfigArtifact.sha256,
      reusedDistinctJobStageConfigSha256: stageConfigArtifact.sha256,
      frozenMainAnalyzerSha256: verified.receipt.operatorAnalyzer.fileSha256,
    },
    diagnosticCapability: {
      relativePath: SINGLE_CANDIDATE_DIAGNOSTIC_RELATIVE_PATH,
      fileSha256: await sha256File(helperPath),
      publisherRelativePath: path.relative(context.repoRoot, publisherPath).split(path.sep).join("/"),
      publisherFileSha256: await sha256File(publisherPath),
      selectedCandidateId: BASELINE_ID,
      configPath: stageConfigArtifact.path,
      harborExecution: false,
      otherCandidateJobsOpened: false,
      holdoutOpened: false,
      rankingProduced: false,
      breedingProduced: false,
    },
    preservedBaselineJob: {
      relativeDirectory: path.relative(context.runtimeRoot, baselineDirectory).split(path.sep).join("/"),
      tree: await treeDigest(baselineDirectory),
      configSha256: await sha256File(baselineConfigPath),
      lockSha256: await sha256File(baselineLockPath),
      resultSha256: await sha256File(baselineResultPath),
      trials,
      complete: true,
      retries: 0,
    },
    candidateStateAtSeal: {
      jobAbsent: true,
      modelExecutions: 0,
    },
    priorRejectedAnalysis: {
      reason: "operator-analyzer-forbids-shared-candidate-job-directories",
      reusableEvidence: false,
      debugRoot: await exists(failedDebugRoot)
        ? { relativeDirectory: path.relative(context.runtimeRoot, failedDebugRoot).split(path.sep).join("/"), tree: await treeDigest(failedDebugRoot) }
        : null,
    },
    callAccounting: {
      additionalHarborInvocations: 0,
      additionalModelExecutions: 0,
      retries: 0,
    },
    authorization: {
      permitsOnly: "single-candidate-q007-baseline-diagnostic",
      candidateExecutionAuthorizedByMigrationAlone: false,
    },
  };
}

export async function sealQ007BaselineDiagnosticMigration(options = {}) {
  const body = await q007BaselineDiagnosticMigrationBody(options);
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...Q007_BASELINE_DIAGNOSTIC_MIGRATION_RELATIVE_PATH.split("/"));
  const migration = { ...body, migrationSha256: objectDigest(body) };
  if (await exists(migrationPath)) {
    equal(await readJson(migrationPath, "q007 baseline diagnostic migration"), migration, "existing q007 baseline diagnostic migration");
    return { mode: "verified-existing", runtimeRoot, migrationPath, migration };
  }
  await writeExclusive(migrationPath, canonicalJson(migration));
  return { mode: "sealed", runtimeRoot, migrationPath, migration };
}

export async function verifyQ007BaselineDiagnosticMigration(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...Q007_BASELINE_DIAGNOSTIC_MIGRATION_RELATIVE_PATH.split("/"));
  const actual = await readJson(migrationPath, "q007 baseline diagnostic migration");
  const { migrationSha256, ...actualBody } = actual;
  assertValue(migrationSha256, objectDigest(actualBody), "q007 baseline diagnostic migration self-digest");
  const expectedBody = await q007BaselineDiagnosticMigrationBody(options);
  equal(actualBody, expectedBody, "q007 baseline diagnostic migration bindings");
  return { mode: "verified", runtimeRoot, migrationPath, migration: actual };
}

export function harbor018NativeTrialLockProjectionContract() {
  return {
    contractId: HARBOR_018_NATIVE_TRIAL_LOCK_PROJECTION_CONTRACT_ID,
    harborVersion: "0.18.0",
    artifactShape: "native-trial-result",
    environment: {
      exactAdditionalKeys: [...HARBOR_018_NATIVE_ENVIRONMENT_NULL_FIELDS],
      exactAdditionalValue: null,
      rejectMissingNearMissNonNullAndExtraKeys: true,
      projectedValueMustEqualLock: true,
    },
    verifier: {
      exactAdditionalKeys: [...HARBOR_018_NATIVE_VERIFIER_NULL_FIELDS],
      exactAdditionalValue: null,
      rejectMissingNearMissNonNullAndExtraKeys: true,
      projectedValueMustEqualLock: true,
    },
  };
}

async function completedQ007JobBinding(context, candidateId) {
  const directory = jobDirectory(context.runtimeRoot, context.protocol, FIRST_TASK_ID, candidateId);
  await assertOrdinaryDirectory(directory, `q007 ${candidateId} job`);
  const configPath = path.join(directory, "config.json");
  const lockPath = path.join(directory, "lock.json");
  const resultPath = path.join(directory, "result.json");
  await Promise.all([
    assertOrdinaryFile(configPath, `q007 ${candidateId} config`),
    assertOrdinaryFile(lockPath, `q007 ${candidateId} lock`),
    assertOrdinaryFile(resultPath, `q007 ${candidateId} result`),
  ]);
  const [config, lock, result] = await Promise.all([
    readJson(configPath, `q007 ${candidateId} config`),
    readJson(lockPath, `q007 ${candidateId} lock`),
    readJson(resultPath, `q007 ${candidateId} result`),
  ]);
  assertValue(config.job_name, jobName(context.protocol, FIRST_TASK_ID, candidateId), `q007 ${candidateId} job name`);
  assertValue(config.n_attempts ?? 1, 1, `q007 ${candidateId} attempts`);
  assertValue(config.retry?.max_retries ?? 0, 0, `q007 ${candidateId} configured retries`);
  assertValue(lock.harbor?.version, context.protocol.frozenEvaluationProfile.harborVersion, `q007 ${candidateId} Harbor version`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `q007 ${candidateId} locked retries`);
  const lockedTrials = requireArray(lock.trials, `q007 ${candidateId} locked trials`);
  if (lockedTrials.length !== 1) throw new Error(`q007 ${candidateId} must lock exactly one trial`);
  assertValue(lockedTrials[0].task?.name, FIRST_TASK_ID, `q007 ${candidateId} locked task`);
  assertValue(result.n_total_trials, 1, `q007 ${candidateId} completed trial count`);
  assertValue(result.stats?.n_retries ?? 0, 0, `q007 ${candidateId} completed retries`);
  if (!result.finished_at) throw new Error(`q007 ${candidateId} job must be complete before publication-projection sealing`);

  const trials = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const trialResultPath = path.join(directory, entry.name, "result.json");
    if (!entry.isDirectory() || !await exists(trialResultPath)) continue;
    await assertOrdinaryDirectory(path.dirname(trialResultPath), `q007 ${candidateId} trial directory`);
    await assertOrdinaryFile(trialResultPath, `q007 ${candidateId} trial result`);
    const trial = await readJson(trialResultPath, `q007 ${candidateId} trial result`);
    assertValue(trial.trial_name, entry.name, `q007 ${candidateId} trial name`);
    trials.push({ trialName: entry.name, resultSha256: await sha256File(trialResultPath) });
  }
  if (trials.length !== 1) throw new Error(`q007 ${candidateId} must preserve exactly one completed trial result`);
  trials.sort((left, right) => left.trialName.localeCompare(right.trialName));
  return {
    candidateId,
    relativeDirectory: path.relative(context.runtimeRoot, directory).split(path.sep).join("/"),
    tree: await treeDigest(directory),
    configSha256: await sha256File(configPath),
    lockSha256: await sha256File(lockPath),
    resultSha256: await sha256File(resultPath),
    trials,
    complete: true,
    retries: 0,
  };
}

async function frozenQ007StageAnalysisBinding(context, verifiedStage, jobs) {
  const root = path.join(context.runtimeRoot, "private", "operator-analysis", "q007-stage");
  await assertOrdinaryDirectory(root, "frozen q007-stage operator analysis");
  const provenancePath = path.join(root, "generation-004-analysis-provenance.json");
  await assertOrdinaryFile(provenancePath, "frozen q007-stage analysis provenance");
  const provenance = await readJson(provenancePath, "frozen q007-stage analysis provenance");
  assertValue(provenance.schemaVersion, 1, "q007-stage analysis provenance schema");
  assertValue(provenance.kind, "generation-004-private-operator-analysis-binding", "q007-stage analysis provenance kind");
  assertValue(provenance.stageId, FIRST_TASK_ID, "q007-stage analysis provenance stage");
  assertValue(provenance.baselineOnly, false, "q007-stage analysis provenance scope");
  const configArtifact = requireArray(verifiedStage.receipt.artifacts, "q007 receipt artifacts")
    .find((artifact) => artifact.kind === "operator-analysis-config" && artifact.baselineOnly === false);
  if (!configArtifact) throw new Error("q007 receipt lacks its frozen stage analyzer config");
  const configPath = assertInside(
    path.join(context.runtimeRoot, "prepared", FIRST_TASK_ID),
    path.join(context.runtimeRoot, "prepared", FIRST_TASK_ID, ...configArtifact.path.split("/")),
    "q007-stage analyzer config",
  );
  await assertOrdinaryFile(configPath, "q007-stage analyzer config");
  assertValue(await sha256File(configPath), configArtifact.sha256, "q007-stage analyzer config receipt binding");
  assertValue(provenance.operatorConfigSha256, configArtifact.sha256, "q007-stage analysis config digest");
  assertValue(provenance.operatorToolSha256, verifiedStage.receipt.operatorAnalyzer.fileSha256, "q007-stage analyzer digest");
  equal(
    provenance.jobTrees,
    jobs.map(({ candidateId, tree }) => ({ candidateId, tree })),
    "q007-stage analysis job-tree bindings",
  );
  equal(
    provenance.outputTree,
    await treeDigest(root, { omitRootFiles: ["generation-004-analysis-provenance.json"] }),
    "q007-stage analysis output tree",
  );
  const requiredOutputFiles = [
    "generation-evidence.json",
    "candidate-ranking.json",
    "operator-coevolution-log.json",
  ];
  const outputFiles = {};
  for (const file of requiredOutputFiles) {
    const filePath = path.join(root, file);
    await assertOrdinaryFile(filePath, `q007-stage analyzer output ${file}`);
    outputFiles[file] = await sha256File(filePath);
  }
  return {
    relativeDirectory: path.relative(context.runtimeRoot, root).split(path.sep).join("/"),
    tree: await treeDigest(root),
    outputTree: provenance.outputTree,
    provenanceFileSha256: await sha256File(provenancePath),
    operatorConfigSha256: provenance.operatorConfigSha256,
    operatorToolSha256: provenance.operatorToolSha256,
    outputFiles,
  };
}

async function officialPreCandidateDiagnosticBinding(context, verifiedStage, baselineJob, prior) {
  const root = path.join(context.runtimeRoot, "private", "operator-analysis", "q007-baseline-diagnostic-v2");
  await assertOrdinaryDirectory(root, "official pre-candidate q007 baseline diagnostic");
  const provenancePath = path.join(root, "generation-004-analysis-provenance.json");
  const evidencePath = path.join(root, "candidate-diagnostic.json");
  await Promise.all([
    assertOrdinaryFile(provenancePath, "official pre-candidate q007 diagnostic provenance"),
    assertOrdinaryFile(evidencePath, "official pre-candidate q007 diagnostic evidence"),
  ]);
  const [provenance, evidence] = await Promise.all([
    readJson(provenancePath, "official pre-candidate q007 diagnostic provenance"),
    readJson(evidencePath, "official pre-candidate q007 diagnostic evidence"),
  ]);
  assertValue(provenance.schemaVersion, 1, "pre-candidate diagnostic provenance schema");
  assertValue(provenance.kind, "generation-004-private-operator-analysis-binding", "pre-candidate diagnostic provenance kind");
  assertValue(provenance.stageId, FIRST_TASK_ID, "pre-candidate diagnostic provenance stage");
  assertValue(provenance.baselineOnly, true, "pre-candidate diagnostic provenance scope");
  const configArtifact = requireArray(verifiedStage.receipt.artifacts, "q007 receipt artifacts")
    .find((artifact) => artifact.kind === "operator-analysis-config" && artifact.baselineOnly === false);
  if (!configArtifact) throw new Error("q007 receipt lacks the config used by the pre-candidate diagnostic");
  assertValue(provenance.operatorConfigSha256, configArtifact.sha256, "pre-candidate diagnostic config digest");
  assertValue(provenance.operatorToolSha256, prior.diagnosticCapability?.fileSha256, "pre-candidate diagnostic tool digest");
  equal(provenance.jobTrees, [{ candidateId: BASELINE_ID, tree: baselineJob.tree }], "pre-candidate diagnostic baseline tree");
  equal(
    provenance.outputTree,
    await treeDigest(root, { omitRootFiles: ["generation-004-analysis-provenance.json"] }),
    "pre-candidate diagnostic output tree",
  );
  assertValue(evidence.schemaVersion, 1, "pre-candidate diagnostic evidence schema");
  assertValue(evidence.mode, "single-candidate-diagnostic-only", "pre-candidate diagnostic evidence mode");
  assertValue(evidence.candidateId, BASELINE_ID, "pre-candidate diagnostic evidence candidate");
  assertValue(evidence.evidence?.candidateId, BASELINE_ID, "pre-candidate diagnostic normalized candidate");
  assertValue(evidence.evidence?.completedTrials, 1, "pre-candidate diagnostic completed trials");
  assertValue(evidence.evidence?.fitnessAvailable, true, "pre-candidate diagnostic fitness availability");
  assertValue(evidence.evidence?.errorCount, 0, "pre-candidate diagnostic errors");
  const trials = requireArray(evidence.evidence?.trials, "pre-candidate diagnostic trials");
  if (trials.length !== 1) throw new Error("pre-candidate diagnostic must preserve exactly one q007 trial");
  assertValue(trials[0].evaluationAvailable, true, "pre-candidate diagnostic trial availability");
  assertValue(trials[0].errorPresent, false, "pre-candidate diagnostic trial error");
  assertValue(trials[0].candidateAttributableFailure, true, "pre-candidate diagnostic candidate attribution");
  assertValue(trials[0].candidateAttributableDiagnostic?.contractId, DIAGNOSTIC_CONTRACT_ID, "pre-candidate diagnostic contract");
  assertValue(trials[0].candidateAttributableDiagnostic?.retryAuthorized, false, "pre-candidate diagnostic retry policy");
  assertValue(trials[0].candidateAttributableDiagnostic?.score, 0, "pre-candidate diagnostic score");
  return {
    relativeDirectory: path.relative(context.runtimeRoot, root).split(path.sep).join("/"),
    tree: await treeDigest(root),
    outputTree: provenance.outputTree,
    provenanceFileSha256: await sha256File(provenancePath),
    evidenceFileSha256: await sha256File(evidencePath),
    operatorConfigSha256: provenance.operatorConfigSha256,
    operatorToolSha256: provenance.operatorToolSha256,
    recordedDisposition: {
      evaluationAvailable: true,
      candidateAttributableFailure: true,
      contractId: DIAGNOSTIC_CONTRACT_ID,
      score: 0,
      retryAuthorized: false,
    },
  };
}

async function q007PublicationProjectionMigrationBody(options = {}) {
  const context = await loadContext(options, { taskIds: [FIRST_TASK_ID] });
  const verifiedStage = await verifyStage(context, FIRST_TASK_ID);
  assertValue(
    context.protocol.frozenEvaluationProfile.harborVersion,
    "0.18.0",
    "q007 publication-projection Harbor version",
  );
  const priorMigrationPath = path.join(context.runtimeRoot, ...Q007_BASELINE_DIAGNOSTIC_MIGRATION_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(priorMigrationPath, "q007 baseline diagnostic v3 migration");
  const prior = await readJson(priorMigrationPath, "q007 baseline diagnostic v3 migration");
  const { migrationSha256: priorMigrationSha256, ...priorBody } = prior;
  assertValue(priorMigrationSha256, objectDigest(priorBody), "q007 baseline diagnostic v3 migration self-digest");
  assertValue(prior.kind, "generation-004-q007-baseline-diagnostic-migration-v3", "q007 baseline diagnostic v3 kind");
  assertValue(prior.migrationId, "q007-baseline-diagnostic-v3", "q007 baseline diagnostic v3 ID");
  assertValue(prior.generationId, "generation-004", "q007 baseline diagnostic v3 generation");
  assertValue(prior.stageId, FIRST_TASK_ID, "q007 baseline diagnostic v3 stage");
  assertValue(prior.protocolSha256, context.protocolSha256, "q007 baseline diagnostic v3 protocol");
  assertValue(prior.originalPreparedStage?.receiptFileSha256, verifiedStage.receiptSha256, "q007 baseline diagnostic v3 receipt");
  assertValue(prior.originalPreparedStage?.preservedBytewise, true, "q007 baseline diagnostic v3 receipt preservation");
  assertValue(prior.candidateStateAtSeal?.jobAbsent, true, "q007 baseline diagnostic v3 candidate state");
  assertValue(prior.authorization?.candidateExecutionAuthorizedByMigrationAlone, false, "q007 baseline diagnostic v3 authorization");

  const jobs = [];
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    jobs.push(await completedQ007JobBinding(context, candidateId));
  }
  equal(prior.preservedBaselineJob?.tree, jobs[0].tree, "q007 baseline continuity from v3");
  const preCandidateDiagnostic = await officialPreCandidateDiagnosticBinding(context, verifiedStage, jobs[0], prior);
  const analysis = await frozenQ007StageAnalysisBinding(context, verifiedStage, jobs);
  const publisherPath = path.join(GENERATION_ROOT, "scripts", "publish-generation-004.js");
  await assertOrdinaryFile(publisherPath, "generation-004 publisher");
  const contract = harbor018NativeTrialLockProjectionContract();
  return {
    schemaVersion: 1,
    kind: "generation-004-q007-publication-projection-migration-v4",
    migrationId: "q007-publication-projection-v4",
    generationId: "generation-004",
    stageId: FIRST_TASK_ID,
    reason: "bind-the-audited-harbor-0.18-native-trial-lock-projection-after-both-q007-jobs-and-analysis-completed",
    supersedes: {
      relativePath: Q007_BASELINE_DIAGNOSTIC_MIGRATION_RELATIVE_PATH,
      fileSha256: await sha256File(priorMigrationPath),
      migrationSha256: priorMigrationSha256,
      reason: "v3-sealed-the-pre-candidate-diagnostic-chain-before-the-publication-projection-fix",
      historicalAuthorizationImported: false,
    },
    protocolSha256: context.protocolSha256,
    originalPreparedStage: {
      receiptFileSha256: verifiedStage.receiptSha256,
      immutablePayload: verifiedStage.receipt.immutablePayload,
      preservedBytewise: true,
    },
    historicalCandidateExecutionSequence: {
      v3CandidateJobAbsentAtSeal: true,
      officialPreCandidateDiagnostic: preCandidateDiagnostic,
      candidateJobNowComplete: true,
      authorizationImported: false,
    },
    completedJobs: jobs,
    frozenStageAnalysis: analysis,
    publicationProjection: {
      publisherRelativePath: path.relative(context.repoRoot, publisherPath).split(path.sep).join("/"),
      publisherFileSha256: await sha256File(publisherPath),
      contract,
      contractSha256: objectDigest(contract),
    },
    callAccounting: {
      additionalHarborInvocations: 0,
      additionalModelExecutions: 0,
      retries: 0,
    },
    authorization: {
      evidenceCompatibilityOnly: true,
      candidateExecutionAuthorized: false,
      harborRerunAuthorized: false,
      retryAuthorized: false,
      publicationAuthorizedByMigrationAlone: false,
    },
  };
}

export async function sealQ007PublicationProjectionMigration(options = {}) {
  const body = await q007PublicationProjectionMigrationBody(options);
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH.split("/"));
  const migration = { ...body, migrationSha256: objectDigest(body) };
  if (await exists(migrationPath)) {
    equal(await readJson(migrationPath, "q007 publication-projection migration"), migration, "existing q007 publication-projection migration");
    return { mode: "verified-existing", runtimeRoot, migrationPath, migration };
  }
  await writeExclusive(migrationPath, canonicalJson(migration));
  return { mode: "sealed", runtimeRoot, migrationPath, migration };
}

export async function verifyQ007PublicationProjectionMigration(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...Q007_PUBLICATION_PROJECTION_MIGRATION_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(migrationPath, "q007 publication-projection migration");
  const actual = await readJson(migrationPath, "q007 publication-projection migration");
  const { migrationSha256, ...actualBody } = actual;
  assertValue(migrationSha256, objectDigest(actualBody), "q007 publication-projection migration self-digest");
  const expectedBody = await q007PublicationProjectionMigrationBody(options);
  equal(actualBody, expectedBody, "q007 publication-projection migration bindings");
  return { mode: "verified", runtimeRoot, migrationPath, migration: actual };
}

async function completedRemainingJobBinding(context, candidateId) {
  const directory = jobDirectory(
    context.runtimeRoot,
    context.protocol,
    "remaining-forward-validation",
    candidateId,
  );
  await assertOrdinaryDirectory(directory, `remaining ${candidateId} job`);
  const configPath = path.join(directory, "config.json");
  const lockPath = path.join(directory, "lock.json");
  const resultPath = path.join(directory, "result.json");
  const [config, lock, result] = await Promise.all([
    readJson(configPath, `remaining ${candidateId} config`),
    readJson(lockPath, `remaining ${candidateId} lock`),
    readJson(resultPath, `remaining ${candidateId} result`),
  ]);
  assertValue(
    config.job_name,
    jobName(context.protocol, "remaining-forward-validation", candidateId),
    `remaining ${candidateId} job name`,
  );
  assertValue(config.n_attempts ?? 1, 1, `remaining ${candidateId} attempts`);
  assertValue(config.retry?.max_retries ?? 0, 0, `remaining ${candidateId} configured retries`);
  assertValue(lock.harbor?.version, context.protocol.frozenEvaluationProfile.harborVersion, `remaining ${candidateId} Harbor version`);
  assertValue(lock.retry?.max_retries ?? 0, 0, `remaining ${candidateId} locked retries`);
  const lockedTrials = requireArray(lock.trials, `remaining ${candidateId} locked trials`);
  equal(lockedTrials.map((trial) => trial.task?.name).sort(), [...REMAINING_TASK_IDS].sort(), `remaining ${candidateId} locked tasks`);
  assertValue(result.n_total_trials, REMAINING_TASK_IDS.length, `remaining ${candidateId} completed trial count`);
  assertValue(result.stats?.n_retries ?? 0, 0, `remaining ${candidateId} completed retries`);
  if (!result.finished_at) throw new Error(`remaining ${candidateId} job must be complete before report-only publication migration`);
  return {
    candidateId,
    relativeDirectory: path.relative(context.runtimeRoot, directory).split(path.sep).join("/"),
    tree: await treeDigest(directory),
    configSha256: await sha256File(configPath),
    lockSha256: await sha256File(lockPath),
    resultSha256: await sha256File(resultPath),
    complete: true,
    trials: REMAINING_TASK_IDS.length,
    retries: 0,
  };
}

async function reportOnlyPublicationMigrationBody(options = {}) {
  const context = await loadContext(options, { taskIds: REMAINING_TASK_IDS });
  const verifiedStage = await verifyStage(context, "remaining-forward-validation");
  const priorPath = path.join(context.runtimeRoot, ...REPORT_ONLY_PUBLICATION_MIGRATION_V5_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(priorPath, "report-only publication v5 migration");
  const prior = await readJson(priorPath, "report-only publication v5 migration");
  const { migrationSha256: priorMigrationSha256, ...priorBody } = prior;
  assertValue(priorMigrationSha256, objectDigest(priorBody), "report-only publication v5 migration self-digest");
  assertValue(prior.kind, "generation-004-report-only-publication-migration-v5", "report-only publication v5 kind");
  assertValue(prior.migrationId, "generation-004-report-only-publication-v5", "report-only publication v5 ID");

  const reportToolPath = path.join(context.repoRoot, ...REPORT_ONLY_ANALYZER_RELATIVE_PATH.split("/"));
  const publisherPath = path.join(GENERATION_ROOT, "scripts", "publish-generation-004.js");
  await Promise.all([
    assertOrdinaryFile(reportToolPath, "Harbor report-only analyzer"),
    assertOrdinaryFile(publisherPath, "generation-004 publisher"),
  ]);
  const jobs = [];
  for (const candidateId of [BASELINE_ID, CANDIDATE_ID]) {
    jobs.push(await completedRemainingJobBinding(context, candidateId));
  }
  return {
    schemaVersion: 1,
    kind: "generation-004-report-only-publication-migration-v6",
    migrationId: "generation-004-report-only-publication-v6",
    generationId: "generation-004",
    stageId: "remaining-forward-validation",
    reason: "publish-completed-evaluable-development-evidence-without-evolutionary-selection",
    supersedes: {
      relativePath: REPORT_ONLY_PUBLICATION_MIGRATION_V5_RELATIVE_PATH,
      fileSha256: await sha256File(priorPath),
      migrationSha256: priorMigrationSha256,
      preservedBytewise: true,
    },
    protocolSha256: context.protocolSha256,
    originalPreparedStage: {
      receiptFileSha256: verifiedStage.receiptSha256,
      immutablePayload: verifiedStage.receipt.immutablePayload,
      operatorAnalyzer: verifiedStage.receipt.operatorAnalyzer,
      preservedBytewise: true,
    },
    completedJobs: jobs,
    reportOnlyProjection: {
      analyzerRelativePath: REPORT_ONLY_ANALYZER_RELATIVE_PATH,
      analyzerFileSha256: await sha256File(reportToolPath),
      publisherRelativePath: path.relative(context.repoRoot, publisherPath).split(path.sep).join("/"),
      publisherFileSha256: await sha256File(publisherPath),
      capabilityBoundaries: {
        harborExecution: false,
        modelExecution: false,
        candidateSurvival: false,
        operatorCredit: false,
        breeding: false,
        holdoutOpened: false,
        promotion: false,
      },
    },
    callAccounting: {
      additionalHarborInvocations: 0,
      additionalModelExecutions: 0,
      retries: 0,
    },
    authorization: {
      completedEvidenceAnalysis: true,
      sanitizedStoppedPublication: true,
      harborRerunAuthorized: false,
      retryAuthorized: false,
      candidatePromotionAuthorized: false,
    },
  };
}

export async function sealReportOnlyPublicationMigration(options = {}) {
  const body = await reportOnlyPublicationMigrationBody(options);
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...REPORT_ONLY_PUBLICATION_MIGRATION_RELATIVE_PATH.split("/"));
  const migration = { ...body, migrationSha256: objectDigest(body) };
  if (await exists(migrationPath)) {
    equal(await readJson(migrationPath, "report-only publication migration"), migration, "existing report-only publication migration");
    return { mode: "verified-existing", runtimeRoot, migrationPath, migration };
  }
  await writeExclusive(migrationPath, canonicalJson(migration));
  return { mode: "sealed", runtimeRoot, migrationPath, migration };
}

export async function verifyReportOnlyPublicationMigration(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? REPO_ROOT);
  const runtimeRoot = assertRuntime(path.resolve(options.runtimeRoot ?? options.outputRoot ?? DEFAULT_RUNTIME), repoRoot);
  const migrationPath = path.join(runtimeRoot, ...REPORT_ONLY_PUBLICATION_MIGRATION_RELATIVE_PATH.split("/"));
  await assertOrdinaryFile(migrationPath, "report-only publication migration");
  const actual = await readJson(migrationPath, "report-only publication migration");
  const { migrationSha256, ...actualBody } = actual;
  assertValue(migrationSha256, objectDigest(actualBody), "report-only publication migration self-digest");
  equal(actualBody, await reportOnlyPublicationMigrationBody(options), "report-only publication migration bindings");
  return { mode: "verified", runtimeRoot, migrationPath, migration: actual };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  const options = {};
  const flags = {
    "--repo-root": "repoRoot",
    "--runtime": "runtimeRoot",
    "--output": "runtimeRoot",
    "--protocol": "protocolPath",
    "--knowledge-root": "knowledgeRoot",
    "--task-root": "taskRoot",
    "--auth-source": "authSource",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = flags[argv[index]];
    if (!key) throw new Error(`Unknown option: ${argv[index]}`);
    if (!argv[index + 1]) throw new Error(`Missing value for ${argv[index]}`);
    options[key] = argv[++index];
  }
  return { command, options };
}

function usage() {
  return `Usage:\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-auth --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare-q007 --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-q007 --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-q007-baseline-diagnostic-v3 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-q007-baseline-diagnostic-v3 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-q007-publication-projection-v4 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-q007-publication-projection-v4 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} seal-report-only-publication-v6 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-report-only-publication-v6 [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} prepare-remaining --auth-source <auth.json|dir> [options]\n  node ${path.relative(REPO_ROOT, SCRIPT_PATH)} verify-remaining --auth-source <auth.json|dir> [options]\n\nAll commands are model-free. The append-only migrations preserve the original q007 preparation and bind completed evidence without authorizing reruns or retries. q018/q024/q030 are not read until prepare-remaining verifies a passing immutable q007 publication.\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }
  const handlers = {
    "seal-auth": sealGeneration004Authentication,
    "verify-auth": verifyGeneration004Authentication,
    "prepare-q007": prepareQ007,
    "verify-q007": verifyQ007,
    "prepare-remaining": prepareRemaining,
    "verify-remaining": verifyRemaining,
    "seal-q007-baseline-diagnostic-v3": sealQ007BaselineDiagnosticMigration,
    "verify-q007-baseline-diagnostic-v3": verifyQ007BaselineDiagnosticMigration,
    "seal-q007-publication-projection-v4": sealQ007PublicationProjectionMigration,
    "verify-q007-publication-projection-v4": verifyQ007PublicationProjectionMigration,
    "seal-report-only-publication-v6": sealReportOnlyPublicationMigration,
    "verify-report-only-publication-v6": verifyReportOnlyPublicationMigration,
  };
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command: ${command}`);
  const result = await handler(options);
  process.stdout.write(canonicalJson({ mode: result.mode, runtimeRoot: result.runtimeRoot, receiptPath: result.receiptPath ?? null }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
