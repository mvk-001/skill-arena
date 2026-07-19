#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const STUDY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const RESULTS_ROOT = path.join(STUDY_ROOT, "results");
const LOCK_PATH = path.join(RESULTS_ROOT, "q003-evidence.lock.json");
const JSON_PATH = path.join(RESULTS_ROOT, "q003-qualification-pilot.json");
const MARKDOWN_PATH = path.join(RESULTS_ROOT, "q003-qualification-pilot.md");
const PROTOCOL_PATH = path.join(STUDY_ROOT, "protocol.json");
const RECEIPT_PATH = path.join(STUDY_ROOT, "receipt.lock.json");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function deterministicJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveRepoArtifact(relativePath, label) {
  requireCondition(
    typeof relativePath === "string" && relativePath.startsWith(".tmp/knowledge-consult-evolution/"),
    `${label} must stay under .tmp/knowledge-consult-evolution`,
  );
  const absolute = path.resolve(REPO_ROOT, relativePath);
  const relative = path.relative(path.join(REPO_ROOT, ".tmp", "knowledge-consult-evolution"), absolute);
  requireCondition(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} escapes the ignored study tree`,
  );
  return absolute;
}

function assertSha256(value, label) {
  requireCondition(/^[0-9a-f]{64}$/.test(value), `${label} must be a lowercase SHA-256`);
}

export function historicalObservedProfileProjection(profile) {
  return {
    harborVersion: profile.harborVersion,
    agent: profile.agent,
    attemptsPerCandidateTask: profile.attemptsPerCandidateTask,
    retries: profile.retries,
    rewardKey: profile.rewardKey,
    passThreshold: profile.passThreshold,
    requiredRewards: profile.requiredRewards,
    minimumDevelopmentPassRate: profile.minimumDevelopmentPassRate,
  };
}

function historicalQ003ProfileAttestationProjection(profile) {
  // The existing q003 lock attested the complete profile that existed when the
  // pilot was published. Select those historical fields explicitly so later
  // policies do not rewrite the immutable pilot attestation.
  return {
    ...historicalObservedProfileProjection(profile),
    failurePolicy: profile.failurePolicy,
    smokeQualification: profile.smokeQualification,
    promotion: profile.promotion,
  };
}

function validateLock(lock, protocol) {
  requireEqual(lock.schemaVersion, 1, "q003 evidence schema");
  requireEqual(lock.studyId, protocol.studyId, "q003 evidence study ID");
  requireEqual(lock.task.id, "q003", "q003 evidence task ID");
  requireCondition(protocol.benchmark.smoke.taskIds.includes(lock.task.id), "q003 is not in smoke");
  requireEqual(lock.evidenceUse, "exploratory-diagnostic-only", "q003 evidence use");
  requireEqual(lock.promotable, false, "q003 promotability");
  requireEqual(lock.causalComparisonAllowed, false, "q003 causal-comparison policy");
  requireEqual(lock.notStrategyRanking, true, "q003 strategy-ranking policy");
  requireEqual(lock.candidates.length, 8, "q003 candidate count");

  const expectedProfile = historicalObservedProfileProjection(protocol.evaluationProfile);
  requireEqual(
    deterministicJson(lock.observedProfile.profile),
    deterministicJson(expectedProfile),
    "q003 observed profile",
  );
  requireEqual(
    lock.observedProfile.profileSha256,
    sha256Bytes(deterministicJson(
      historicalQ003ProfileAttestationProjection(protocol.evaluationProfile),
    )),
    "q003 profile SHA-256",
  );
  assertSha256(lock.observedProfile.harborAttestation.versionOutputSha256, "Harbor version output");
  assertSha256(
    lock.observedProfile.harborAttestation.distributionMetadataSha256,
    "Harbor distribution metadata",
  );

  const identities = new Set();
  const candidateIds = new Set();
  for (const candidate of lock.candidates) {
    requireCondition(!candidateIds.has(candidate.id), `duplicate candidate ${candidate.id}`);
    candidateIds.add(candidate.id);
    assertSha256(candidate.treeSha256, `${candidate.id} tree`);
    requireEqual(candidate.promotable, false, `${candidate.id} promotability`);
    identities.add(candidate.identity.mode);
    requireEqual(candidate.identity.declaredSkillName, "consult-semantic-okf", `${candidate.id} skill name`);
    requireCondition(
      ["legacy-generic-basename", "candidate-id-basename", "logical-name-basename"].includes(
        candidate.identity.mode,
      ),
      `${candidate.id} has unknown identity mode`,
    );
    requireEqual(
      candidate.fitness === null,
      !candidate.evaluable,
      `${candidate.id} evaluability/fitness nullability`,
    );
    for (const [name, digest] of Object.entries(candidate.artifactLocks.hashes)) {
      assertSha256(digest, `${candidate.id} ${name}`);
    }
    resolveRepoArtifact(candidate.artifactLocks.jobRoot, `${candidate.id} job root`);
  }
  requireCondition(identities.size > 1, "q003 lock must preserve mixed identity provenance");

  for (const [name, artifact] of Object.entries(lock.sourceLocks)) {
    assertSha256(artifact.sha256, `source lock ${name}`);
    if (artifact.path.startsWith(".tmp/")) resolveRepoArtifact(artifact.path, `source lock ${name}`);
  }
}

function publicCandidate(candidate) {
  return {
    id: candidate.id,
    treeSha256: candidate.treeSha256,
    identityMode: candidate.identity.mode,
    installedSkillBasename: candidate.identity.installedBasename,
    promotable: false,
    evaluable: candidate.evaluable,
    qualified: candidate.qualified,
    outcome: candidate.outcome,
    exceptionType: candidate.exceptionType,
    fitness: candidate.fitness,
    reportedReward: candidate.reportedReward,
    reportedRequiredRewards: candidate.reportedRequiredRewards,
    mechanicalUtilityDiagnostic: candidate.mechanicalUtilityDiagnostic,
    citedDocumentCount: candidate.citedDocumentCount,
    coveredQrelCount: candidate.coveredQrelCount,
    inputTokens: candidate.inputTokens,
    cacheTokens: candidate.cacheTokens,
    outputTokens: candidate.outputTokens,
    durationSeconds: candidate.durationSeconds,
  };
}

export function buildPublishedResult(lock, evidenceLockSha256) {
  const candidates = lock.candidates.map(publicCandidate);
  return {
    schemaVersion: 2,
    studyId: lock.studyId,
    resultId: lock.resultId,
    evidenceLayer: lock.evidenceLayer,
    status: "complete-no-winner-exploratory",
    evidenceUse: lock.evidenceUse,
    promotable: false,
    causalComparisonAllowed: false,
    notStrategyRanking: true,
    task: lock.task,
    evaluationProfileRef: "../protocol.json#/evaluationProfile",
    observedProfile: lock.observedProfile.profile,
    runtimeAttestation: lock.observedProfile.harborAttestation,
    provenance: {
      identityConsistent: false,
      promotionBlockers: lock.promotionBlockers,
      evidenceLock: {
        path: "q003-evidence.lock.json",
        sha256: evidenceLockSha256,
      },
      nativeArtifactsCommitted: false,
      nativeArtifactPolicy: "ignored-local-verified-by-checksum",
      nativeVerifierCommand:
        "node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify-native",
    },
    analyzerDiagnostics: lock.analyzerDiagnostics,
    aggregateUsage: {
      candidateTrials: candidates.length,
      evaluableTrials: candidates.filter((candidate) => candidate.evaluable).length,
      inputTokens: candidates.reduce((sum, candidate) => sum + candidate.inputTokens, 0),
      cacheTokens: candidates.reduce((sum, candidate) => sum + candidate.cacheTokens, 0),
      outputTokens: candidates.reduce((sum, candidate) => sum + candidate.outputTokens, 0),
      summedWallClockSeconds: Number(
        candidates.reduce((sum, candidate) => sum + candidate.durationSeconds, 0).toFixed(3),
      ),
      costUsd: null,
    },
    candidates,
    semanticReview: lock.semanticReview,
    limitations: lock.limitations,
  };
}

function displayGate(candidate, key) {
  if (!candidate.evaluable) return "n/a";
  return String(candidate.reportedRequiredRewards[key]);
}

function displayUtility(value) {
  return value === null ? "n/a" : value.toFixed(3);
}

function identityLabel(mode) {
  return {
    "legacy-generic-basename": "legacy `skill`",
    "candidate-id-basename": "candidate ID",
    "logical-name-basename": "canonical logical name",
  }[mode];
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function buildPublishedMarkdown(lock, evidenceLockSha256) {
  const result = buildPublishedResult(lock, evidenceLockSha256);
  const rows = lock.candidates.map((candidate) => (
    `| \`${candidate.id}\` | ${candidate.evaluable ? "yes" : "no"} | ${identityLabel(candidate.identity.mode)} | ${displayGate(candidate, "evidence_contract_gate")} | ${displayGate(candidate, "minimum_document_gate")} | ${displayGate(candidate, "mechanical_qualification_gate")} | ${displayUtility(candidate.mechanicalUtilityDiagnostic)} | ${candidate.coveredQrelCount} / ${candidate.citedDocumentCount} | ${formatInteger(candidate.inputTokens)} / ${formatInteger(candidate.outputTokens)} | ${candidate.outcomeLabel} |`
  ));
  return `# q003 Harbor Qualification Pilot

Status: **complete, no qualified winner; exploratory and non-promotable**. This
is a one-task discovery pilot, not a ranking of the four evolution strategies,
not a causal candidate comparison, and not a substitute for the frozen
five-task smoke or full development budgets.

The observed Pi/model/thinking profile matched \`protocol.json\`. Harbor 0.18.0
is preserved as an operator-captured runtime attestation because Harbor 0.18.0
did not embed its own package version in the native result JSON. Every native
JobConfig, result, diagnostic, reward, and normalized candidate result used here
is bound by SHA-256 in the tracked evidence lock.

All eight rows are diagnostic only. Candidates \`00\`–\`04\` were installed
under the legacy basename \`skill\`, candidate \`05\` under its candidate ID,
and only \`06\`–\`07\` under the canonical logical basename
\`consult-semantic-okf\`. That mixed identity provenance blocks promotion and
prevents causal interpretation even for the canonically staged rows.

| Candidate | Evaluable | Installed identity | Contract | Min docs | Mechanical | Diagnostic utility | Covered qrels / cited docs | Input / output tokens | Outcome |
| --- | :---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join("\n")}

For non-evaluable provider outcomes, gates and utility are shown as \`n/a\`;
the raw verifier zeros remain preserved only as reported values in the evidence
lock. Diagnostic utility behind a failed gate is not reward, qualification,
semantic correctness, causal evidence, or promotion evidence.

## Analyzer diagnostics

- Selected winner: none.
- Holdout: not eligible and not opened.
- Primary-fitness survivors reported by the historical analyzer: \`01\` and
  \`03\`, tied at evaluated zero. This is replayable analyzer state only.
- Complementary repair-parent diagnostics: \`04\` and \`05\`. They preserve
  different public signals, but are not promoted parents or evidence that either
  mutation caused an improvement.
- Semantic review: not performed because no candidate passed mechanical
  qualification.
- Aggregate usage: ${formatInteger(result.aggregateUsage.inputTokens)} input,
  ${formatInteger(result.aggregateUsage.cacheTokens)} cached, and ${formatInteger(result.aggregateUsage.outputTokens)}
  output tokens across eight trials; provider cost was unavailable.

The live traces motivated generic evolver hardening, but this pilot does not
estimate the causal effect of those repairs. The full study must start new
canonical-identity runs under the frozen protocol.

## Reproduce the publication

The sanitized evidence projection is
[\`q003-evidence.lock.json\`](q003-evidence.lock.json), SHA-256
\`${evidenceLockSha256}\`. It contains no agent reasoning, answers, qrel
identities, hidden rubric, oracle data, credentials, or private verifier input.

\`\`\`powershell
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify
# When the ignored native artifacts are still present:
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify-native
\`\`\`

Machine-readable details are in
[\`q003-qualification-pilot.json\`](q003-qualification-pilot.json).
`;
}

async function collectCandidateFiles(root, current = root, files = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await collectCandidateFiles(root, absolute, files);
    else if (entry.isFile()) {
      files.push({
        absolute,
        relative: path.relative(root, absolute).split(path.sep).join("/"),
      });
    } else if (entry.isSymbolicLink()) {
      throw new Error(`candidate tree contains symbolic link: ${absolute}`);
    }
  }
  return files;
}

async function candidateTreeDigest(root) {
  const files = await collectCandidateFiles(root);
  files.sort((left, right) => Buffer.compare(
    Buffer.from(left.relative, "utf8"),
    Buffer.from(right.relative, "utf8"),
  ));
  const digest = createHash("sha256");
  for (const file of files) {
    const bytes = await fs.readFile(file.absolute);
    digest.update(file.relative, "utf8");
    digest.update(Buffer.from([0]));
    digest.update(String(bytes.length), "utf8");
    digest.update(Buffer.from([0]));
    digest.update(bytes);
    digest.update(Buffer.from([0]));
  }
  return digest.digest("hex");
}

async function verifyArtifactHash(filePath, expected, label) {
  requireEqual(await sha256File(filePath), expected, label);
}

export function verifyFinalAnalysisSemantics(finalAnalysisRun, lock) {
  const diagnostics = lock.analyzerDiagnostics;
  const observedProfile = lock.observedProfile.profile;
  requireEqual(diagnostics.selectedWinner, null, "locked analyzer selected winner");
  requireEqual(finalAnalysisRun.selectedWinner, diagnostics.selectedWinner, "final analyzer selected winner");
  requireEqual(diagnostics.holdoutStatus, "not-eligible-not-opened", "locked analyzer holdout status");
  requireEqual(finalAnalysisRun.holdout?.status, "not-eligible", "final analyzer holdout status");
  requireEqual(finalAnalysisRun.holdout?.promoted, false, "final analyzer holdout promotion");
  requireEqual(
    deterministicJson(finalAnalysisRun.survivors),
    deterministicJson(diagnostics.survivorsByPrimaryFitness),
    "final analyzer survivors",
  );
  requireEqual(
    deterministicJson(finalAnalysisRun.repairParents),
    deterministicJson(diagnostics.repairParentsByComplementaryRequiredRewardCoverage),
    "final analyzer repair parents",
  );
  requireEqual(
    finalAnalysisRun.bestEvolvableCandidate,
    diagnostics.bestEvolvableCandidate,
    "final analyzer best evolvable candidate",
  );
  requireEqual(
    finalAnalysisRun.minimumDevelopmentPassRate,
    observedProfile.minimumDevelopmentPassRate,
    "final analyzer minimum development pass rate",
  );
  requireEqual(
    finalAnalysisRun.holdout?.minimumDevelopmentPassRate,
    observedProfile.minimumDevelopmentPassRate,
    "final analyzer holdout minimum development pass rate",
  );
  requireEqual(
    deterministicJson(finalAnalysisRun.requiredRewardThresholds),
    deterministicJson(observedProfile.requiredRewards),
    "final analyzer required reward thresholds",
  );
}

export async function verifyNativeEvidence(lock, protocol) {
  validateLock(lock, protocol);
  for (const [name, artifact] of Object.entries(lock.sourceLocks)) {
    const absolute = artifact.path.startsWith(".tmp/")
      ? resolveRepoArtifact(artifact.path, `source lock ${name}`)
      : path.resolve(STUDY_ROOT, artifact.path);
    await verifyArtifactHash(absolute, artifact.sha256, `source lock ${name}`);
  }
  const finalAnalysisRun = JSON.parse(await fs.readFile(
    resolveRepoArtifact(lock.sourceLocks.finalAnalysisRun.path, "final analysis run"),
    "utf8",
  ));
  verifyFinalAnalysisSemantics(finalAnalysisRun, lock);

  const candidateManifest = JSON.parse(await fs.readFile(
    resolveRepoArtifact(lock.sourceLocks.candidateManifest.path, "candidate manifest"),
    "utf8",
  ));
  const manifestCandidates = new Map(candidateManifest.candidates.map((candidate) => [candidate.id, candidate]));
  const candidateRoot = path.dirname(resolveRepoArtifact(
    lock.sourceLocks.candidateManifest.path,
    "candidate manifest",
  ));

  for (const candidate of lock.candidates) {
    const manifestCandidate = manifestCandidates.get(candidate.id);
    requireCondition(manifestCandidate, `candidate manifest lacks ${candidate.id}`);
    requireEqual(manifestCandidate.tree_sha256, candidate.treeSha256, `${candidate.id} manifest tree`);
    requireEqual(
      await candidateTreeDigest(path.join(candidateRoot, manifestCandidate.path)),
      candidate.treeSha256,
      `${candidate.id} materialized tree`,
    );

    const jobRoot = resolveRepoArtifact(candidate.artifactLocks.jobRoot, `${candidate.id} job root`);
    const trialRoot = path.join(jobRoot, candidate.artifactLocks.trialName);
    const candidateResultPath = path.join(
      resolveRepoArtifact(lock.sourceLocks.finalAnalysisRun.path, "final analysis run"),
      "..",
      "generation-000",
      "candidates",
      candidate.id,
      "candidate-result.json",
    );
    const files = {
      jobConfigSha256: path.join(jobRoot, "config.json"),
      jobResultSha256: path.join(jobRoot, "result.json"),
      trialConfigSha256: path.join(trialRoot, "config.json"),
      trialResultSha256: path.join(trialRoot, "result.json"),
      diagnosticsSha256: path.join(trialRoot, "verifier", "diagnostics.json"),
      rewardSha256: path.join(trialRoot, "verifier", "reward.json"),
      candidateResultSha256: candidateResultPath,
    };
    for (const [name, filePath] of Object.entries(files)) {
      await verifyArtifactHash(filePath, candidate.artifactLocks.hashes[name], `${candidate.id} ${name}`);
    }

    const [jobConfig, jobResult, trialResult, diagnostics, rewards, candidateResult] = await Promise.all([
      fs.readFile(files.jobConfigSha256, "utf8").then(JSON.parse),
      fs.readFile(files.jobResultSha256, "utf8").then(JSON.parse),
      fs.readFile(files.trialResultSha256, "utf8").then(JSON.parse),
      fs.readFile(files.diagnosticsSha256, "utf8").then(JSON.parse),
      fs.readFile(files.rewardSha256, "utf8").then(JSON.parse),
      fs.readFile(files.candidateResultSha256, "utf8").then(JSON.parse),
    ]);
    const agent = jobConfig.agents?.[0];
    requireEqual(agent?.name, protocol.evaluationProfile.agent.name, `${candidate.id} agent`);
    requireEqual(agent?.model_name, protocol.evaluationProfile.agent.model, `${candidate.id} model`);
    requireEqual(agent?.kwargs?.version, protocol.evaluationProfile.agent.version, `${candidate.id} Pi version`);
    requireEqual(agent?.kwargs?.thinking, protocol.evaluationProfile.agent.thinking, `${candidate.id} thinking`);
    requireEqual(
      agent.skills[0].replaceAll("\\", "/").split("/").at(-1),
      candidate.identity.installedBasename,
      `${candidate.id} installed basename`,
    );
    const knowledgeMount = jobConfig.environment?.mounts?.find((mount) => mount.target === "/knowledge");
    requireEqual(knowledgeMount?.read_only, true, `${candidate.id} knowledge mount`);
    requireEqual(jobResult.n_total_trials, 1, `${candidate.id} total trials`);
    requireEqual(jobResult.stats?.n_retries, protocol.evaluationProfile.retries, `${candidate.id} retries`);
    requireEqual(trialResult.task_checksum, lock.task.taskChecksum, `${candidate.id} task checksum`);
    requireEqual(trialResult.agent_info?.version, protocol.evaluationProfile.agent.version, `${candidate.id} result Pi version`);
    requireEqual(
      `${trialResult.agent_info?.model_info?.provider}/${trialResult.agent_info?.model_info?.name}`,
      protocol.evaluationProfile.agent.model,
      `${candidate.id} result model`,
    );
    requireEqual(diagnostics.status, candidate.diagnostics.status, `${candidate.id} diagnostic status`);
    requireEqual(diagnostics.failure_domain, candidate.diagnostics.failureDomain, `${candidate.id} failure domain`);
    requireEqual(diagnostics.terminal_outcome, candidate.diagnostics.terminalOutcome, `${candidate.id} terminal outcome`);
    requireEqual(diagnostics.error_code, candidate.diagnostics.errorCode, `${candidate.id} error code`);
    requireEqual(diagnostics.invalid_evidence_indices.length, candidate.diagnostics.invalidEvidenceCount, `${candidate.id} invalid evidence count`);
    requireEqual(deterministicJson(diagnostics.contract_errors), deterministicJson(candidate.diagnostics.contractErrors), `${candidate.id} contract errors`);
    requireEqual(rewards.reward, candidate.reportedReward, `${candidate.id} reported reward`);
    for (const [key, value] of Object.entries(candidate.reportedRequiredRewards)) {
      requireEqual(rewards[key], value, `${candidate.id} ${key}`);
    }
    requireEqual(
      candidate.evaluable ? rewards.mechanical_utility : null,
      candidate.mechanicalUtilityDiagnostic,
      `${candidate.id} utility diagnostic`,
    );
    requireEqual(diagnostics.cited_document_count, candidate.citedDocumentCount, `${candidate.id} cited documents`);
    requireEqual(diagnostics.covered_qrel_count, candidate.coveredQrelCount, `${candidate.id} covered qrel count`);
    requireEqual(trialResult.agent_result?.n_input_tokens, candidate.inputTokens, `${candidate.id} input tokens`);
    requireEqual(trialResult.agent_result?.n_cache_tokens, candidate.cacheTokens, `${candidate.id} cache tokens`);
    requireEqual(trialResult.agent_result?.n_output_tokens, candidate.outputTokens, `${candidate.id} output tokens`);
    const durationSeconds = Number((
      (Date.parse(trialResult.finished_at) - Date.parse(trialResult.started_at)) / 1000
    ).toFixed(3));
    requireEqual(durationSeconds, candidate.durationSeconds, `${candidate.id} wall-clock duration`);
    requireEqual(trialResult.exception_info?.exception_type ?? null, candidate.exceptionType, `${candidate.id} exception`);
    requireEqual(candidateResult.fitness, candidate.fitness, `${candidate.id} fitness`);
    requireEqual(candidateResult.qualification?.passed, candidate.qualified, `${candidate.id} qualification`);
    requireEqual(candidateResult.summary?.evaluableTrials > 0, candidate.evaluable, `${candidate.id} evaluability`);
  }
}

async function readInputs() {
  const [lockText, protocolText] = await Promise.all([
    fs.readFile(LOCK_PATH, "utf8"),
    fs.readFile(PROTOCOL_PATH, "utf8"),
  ]);
  return {
    lock: JSON.parse(lockText),
    protocol: JSON.parse(protocolText),
    lockSha256: sha256Bytes(Buffer.from(lockText, "utf8")),
  };
}

export async function verifyPublishedArtifacts() {
  const { lock, protocol, lockSha256 } = await readInputs();
  validateLock(lock, protocol);
  requireEqual(
    lock.sourceLocks.receiptLock.sha256,
    await sha256File(RECEIPT_PATH),
    "receipt lock SHA-256",
  );
  const expectedJson = prettyJson(buildPublishedResult(lock, lockSha256));
  const expectedMarkdown = buildPublishedMarkdown(lock, lockSha256);
  requireEqual(await fs.readFile(JSON_PATH, "utf8"), expectedJson, "published q003 JSON");
  requireEqual(await fs.readFile(MARKDOWN_PATH, "utf8"), expectedMarkdown, "published q003 Markdown");
  return { lock, protocol, lockSha256 };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  requireCondition(["render", "verify", "verify-native"].includes(command), `unknown command ${command}`);
  const { lock, protocol, lockSha256 } = await readInputs();
  validateLock(lock, protocol);
  if (command === "render") {
    await fs.writeFile(JSON_PATH, prettyJson(buildPublishedResult(lock, lockSha256)), "utf8");
    await fs.writeFile(MARKDOWN_PATH, buildPublishedMarkdown(lock, lockSha256), "utf8");
  } else {
    await verifyPublishedArtifacts();
  }
  if (command === "verify-native") await verifyNativeEvidence(lock, protocol);
  process.stdout.write(`${command} passed: ${lockSha256}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
