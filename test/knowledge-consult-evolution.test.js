import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertOutputWithinTmp,
  compareReceipts,
  treeDigest,
  verifySourceFreeze,
} from "../evaluations/knowledge-consult-evolution/scripts/prepare-study.js";
import {
  buildPublishedMarkdown,
  buildPublishedResult,
  historicalObservedProfileProjection,
  verifyFinalAnalysisSemantics,
  verifyPublishedArtifacts,
} from "../evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js";

const repoRoot = path.resolve(".");

function expectedTreeDigest(entries) {
  const digest = createHash("sha256");
  for (const [relative, contents] of entries) {
    digest.update(relative, "utf8");
    digest.update(Buffer.from([0]));
    digest.update(contents);
    digest.update(Buffer.from([0]));
  }
  return digest.digest("hex");
}

test("knowledge consult tree digest matches the external cross-platform algorithm", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-consult-tree-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "nested"), { recursive: true });
  await fs.mkdir(path.join(root, "__pycache__"), { recursive: true });
  await fs.writeFile(path.join(root, "a.txt"), "alpha", "utf8");
  await fs.writeFile(path.join(root, "nested", "b.bin"), Buffer.from([0, 1, 2]));
  await fs.writeFile(path.join(root, "__pycache__", "ignored.pyc"), "ignored", "utf8");

  const actual = await treeDigest(root);
  assert.deepEqual(actual, {
    sha256: expectedTreeDigest([
      ["a.txt", Buffer.from("alpha")],
      ["nested/b.bin", Buffer.from([0, 1, 2])],
    ]),
    fileCount: 2,
    totalBytes: 8,
  });
});

test("knowledge consult output guard only permits descendants of Skill Arena .tmp", () => {
  const repo = path.resolve(os.tmpdir(), "skill-arena-output-guard");
  const accepted = path.join(repo, ".tmp", "knowledge-consult-evolution", "prepared");
  assert.equal(assertOutputWithinTmp(accepted, repo), path.resolve(accepted));
  assert.throws(() => assertOutputWithinTmp(repo, repo), /Output must be a child/);
  assert.throws(
    () => assertOutputWithinTmp(path.join(repo, "evaluations", "generated"), repo),
    /Output must be a child/,
  );
});

test("Harbor evolvers stay self-contained while target skill and dataset remain external", async () => {
  const protocol = JSON.parse(await fs.readFile(
    path.join(repoRoot, "evaluations", "knowledge-consult-evolution", "protocol.json"),
    "utf8",
  ));
  assert.equal(protocol.evolutionContract.evolverOwnership, "self-contained-generic-bundles");
  assert.equal(protocol.evolutionContract.targetSkillOwnership, "external-input");
  assert.equal(protocol.evolutionContract.datasetOwnership, "external-input");
  assert.equal(protocol.evolutionContract.targetSpecificContentAllowedInsideEvolver, false);
  assert.doesNotMatch(
    protocol.evolutionContract.evolverBundles.join("\n"),
    /harbor-resume-external-failures/,
    "external resume is study orchestration, not an evolution strategy bundle",
  );

  const forbidden = /graphrag-papers-40|consult-semantic-okf|knowledge-consult-evolution|harbor-resume-external-failures/;
  for (const relative of protocol.evolutionContract.evolverBundles) {
    const directory = path.join(repoRoot, relative);
    const pending = [directory];
    let skillFiles = 0;
    while (pending.length) {
      const current = pending.pop();
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.isFile()) {
          const text = await fs.readFile(absolute, "utf8");
          assert.doesNotMatch(text, forbidden, `${relative}/${entry.name} leaked target content`);
          skillFiles += entry.name === "SKILL.md" ? 1 : 0;
        }
      }
    }
    assert.equal(skillFiles, 1, `${relative} must remain one atomic skill bundle`);
  }
});

test("knowledge consult protocol freezes one shared non-compensating evaluation profile", async () => {
  const protocol = JSON.parse(await fs.readFile(
    path.join(repoRoot, "evaluations", "knowledge-consult-evolution", "protocol.json"),
    "utf8",
  ));
  const profile = protocol.evaluationProfile;
  assert.deepEqual(profile.agent, {
    name: "pi",
    version: "0.73.1",
    model: "openai-codex/gpt-5.3-codex-spark",
    thinking: "high",
  });
  assert.equal(profile.harborVersion, "0.18.0");
  assert.equal(profile.attemptsPerCandidateTask, 1);
  assert.equal(profile.retries, 0);
  assert.equal(profile.rewardKey, "reward");
  assert.equal(profile.passThreshold, 0.000001);
  assert.equal(profile.minimumDevelopmentPassRate, 1);
  assert.equal(protocol.benchmark.development.taskCount, 24);
  assert.equal(
    protocol.strategyBudgets.traceDistillation.fullDevelopmentTaskAttemptsIfAllQualify,
    48,
  );
  assert.deepEqual(profile.requiredRewards, {
    evidence_contract_gate: 1,
    minimum_document_gate: 1,
    mechanical_qualification_gate: 1,
  });
  assert.deepEqual(profile.externalResumePolicy, {
    strategy: "harbor-resume-external-failures",
    harborBuiltInRetries: 0,
    maximumExternalRetriesPerTrial: 1,
    eligibleFailureDomains: [
      "authentication",
      "environment",
      "evaluator",
      "infrastructure",
      "provider",
    ],
    requirements: {
      canonicalSkillIdentity: true,
      candidateTaskProfileAndJobLocks: true,
      verifiableFailureEvidence: true,
      unstructuredFailureTextAllowed: false,
      missingRewardAloneSufficient: false,
    },
    requiredLockFields: {
      sourceTrials: [
        "taskChecksum",
        "candidateSkillDigest",
        "evaluationProfileDigest",
        "originalJobDigest",
      ],
      completedRetryAttempts: ["retryJobDigest"],
    },
    failureEvidence: {
      verifierOwnedStructuredDiagnostic: {
        eligibleFields: ["failureDomain", "status", "terminalOutcome", "errorCode"],
        minimumExactAllowlistedSignals: 1,
      },
      exactHarborException: {
        eligibleFields: ["exceptionType", "errorCode"],
        mustBeAllowlisted: true,
      },
    },
    conditionalRemediationAttestation: {
      requiredForFailureDomains: ["authentication", "environment"],
      requiredLockFields: ["remediationAttestationDigest"],
      requiredFields: ["remediationType", "evidencePath", "remediationEvidenceSha256"],
      evidenceContentsCopied: false,
      successfulLivePreflightRequired: true,
    },
    providerEligibility: {
      structuredTransientSignals: [
        "api-overloaded",
        "http-5xx",
        "provider-5xx",
        "provider-unavailable",
        "rate-limit",
        "rate-limit-exceeded",
        "service-unavailable",
      ],
      exactTransientExceptionTypes: [
        "ApiUsageLimitError",
        "ProviderUnavailableError",
        "RateLimitError",
      ],
      genericProviderLabelSufficient: false,
      absoluteDenylistTakesPrecedence: true,
    },
    absoluteDenylist: [
      "context-length",
      "context-budget",
      "agent-timeout",
      "token-budget",
      "tool-budget",
      "semantic-reward",
      "required-reward-gate",
      "invalid-response-contract",
      "ambiguous-or-conflicting-failure-attestation",
    ],
    retryJob: {
      mode: "new-immutable-harbor-job",
      mutateOriginalJob: false,
      reuseOriginalJobDirectory: false,
      candidateTaskAndProfileMustMatchLocks: true,
    },
    attemptLedger: {
      singleWriterLock: "sibling-o-excl-fail-closed",
      automaticStaleLockRemoval: false,
      reservationPersistedBeforeAttemptWritesOrCalls: true,
      reservedOrFailedAttemptConsumesCap: true,
      firstEvaluableStopsFurtherAttempts: true,
      analyzeOnlyNoop: {
        condition: "empty-retry-jobs-and-complete-existing-outputs",
        byteIdempotent: true,
      },
    },
    effectiveJob: {
      materializationCondition: "all-source-trials-have-effective-results",
      incompleteJobAllowed: false,
      publicationMode: "atomic-new-directory",
      manifest: "resume-manifest.json",
      sealSourceAndDestinationChecksums: true,
      downstreamConsumption: "analyze-only-job-directory",
      selectionPolicy: "first-evaluable-no-best-of",
    },
    mergePolicy: "first-evaluable-no-best-of",
    bestOfSelectionAllowed: false,
  });
  assert.equal(profile.externalResumePolicy.harborBuiltInRetries, profile.retries);
  assert.deepEqual(
    profile.smokeQualification.requiredTaskIds,
    protocol.benchmark.smoke.taskIds,
  );
  assert.equal(profile.smokeQualification.allTasksMustBeEvaluable, true);
  assert.equal(profile.smokeQualification.allTasksMustMeetPassThreshold, true);
  assert.equal(profile.smokeQualification.allTasksMustMeetEveryRequiredReward, true);
  assert.equal(
    profile.failurePolicy.providerAuthenticationEnvironmentEvaluatorInfrastructure,
    "non-evaluable-null-not-zero",
  );
  assert.equal(profile.failurePolicy.missingPrimaryReward, "non-evaluable-null-not-zero");
  assert.equal(profile.promotion.allowTaskRegressions, false);
  assert.equal(profile.promotion.requireNoErrors, true);
  assert.equal(profile.promotion.requireInfrastructureFree, true);
  assert.deepEqual(protocol.publishedEvidence.q003QualificationPilot, {
    resultPath: "results/q003-qualification-pilot.json",
    reportPath: "results/q003-qualification-pilot.md",
    evidenceLockPath: "results/q003-evidence.lock.json",
    publisherPath: "scripts/publish-q003-pilot.js",
    evidenceUse: "exploratory-diagnostic-only",
    promotable: false,
    causalComparisonAllowed: false,
    notStrategyRanking: true,
    nativeArtifactsCommitted: false,
    nativeArtifactPolicy: "ignored-local-verified-by-checksum",
    requiredIdentityModeForNewRuns: "logical-name-basename",
  });
});

test("q003 evidence lock is sanitized, checksum-complete, and non-promotable", async () => {
  const lockPath = path.join(
    repoRoot,
    "evaluations",
    "knowledge-consult-evolution",
    "results",
    "q003-evidence.lock.json",
  );
  const lockText = await fs.readFile(lockPath, "utf8");
  const lock = JSON.parse(lockText);
  assert.equal(lock.evidenceUse, "exploratory-diagnostic-only");
  assert.equal(lock.promotable, false);
  assert.equal(lock.causalComparisonAllowed, false);
  assert.equal(lock.notStrategyRanking, true);
  assert.equal(lock.candidates.length, 8);
  assert.deepEqual(
    Object.fromEntries(
      ["legacy-generic-basename", "candidate-id-basename", "logical-name-basename"]
        .map((mode) => [mode, lock.candidates.filter((candidate) => candidate.identity.mode === mode).length]),
    ),
    {
      "legacy-generic-basename": 5,
      "candidate-id-basename": 1,
      "logical-name-basename": 2,
    },
  );
  const requiredHashes = [
    "jobConfigSha256",
    "jobResultSha256",
    "trialConfigSha256",
    "trialResultSha256",
    "diagnosticsSha256",
    "rewardSha256",
    "candidateResultSha256",
  ];
  for (const candidate of lock.candidates) {
    assert.equal(candidate.promotable, false, candidate.id);
    assert.match(candidate.treeSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(candidate.artifactLocks.hashes), requiredHashes);
    for (const digest of Object.values(candidate.artifactLocks.hashes)) {
      assert.match(digest, /^[0-9a-f]{64}$/);
    }
  }

  assert.doesNotMatch(lockText, /(?:[A-Za-z]:\\|\/mnt\/|\/home\/|\/tmp\/skill-arena-knowledge-consult-auth)/);
  assert.doesNotMatch(lockText, /exception_traceback|thinkingSignature|agent\/pi\.txt|trajectory/i);
  assert.doesNotMatch(lockText, /qrelIds|qrel_ids|expected_papers|paper-\d{4}/i);
  assert.doesNotMatch(lockText, /Compare methods that construct graphs from unstructured documents/i);
});

test("q003 publisher deterministically reconstructs both public artifacts", async () => {
  const { lock, protocol, lockSha256 } = await verifyPublishedArtifacts();
  const result = buildPublishedResult(lock, lockSha256);
  const markdown = buildPublishedMarkdown(lock, lockSha256);
  const historicalProjection = historicalObservedProfileProjection(protocol.evaluationProfile);
  assert.deepEqual(historicalProjection, lock.observedProfile.profile);
  assert.equal(Object.hasOwn(historicalProjection, "externalResumePolicy"), false);
  assert.equal(
    lock.observedProfile.profileSha256,
    "9eaed80fe4b23f2a7e0f50c7022ce5796811d62e6e521f06234bde48aef6e571",
  );
  assert.equal(lock.observedProfile.profile.retries, 0);
  assert.equal(Object.hasOwn(lock.observedProfile.profile, "externalResumePolicy"), false);
  const contextLimitCandidates = lock.candidates.filter(
    (candidate) => candidate.diagnostics.errorCode === "context_length_exceeded",
  );
  assert.deepEqual(
    contextLimitCandidates.map((candidate) => candidate.id),
    ["00-baseline", "02-multi-paper-breadth", "06-compiler-first", "07-four-call-finalizer"],
  );
  assert.ok(protocol.evaluationProfile.externalResumePolicy.absoluteDenylist.includes("context-length"));
  assert.ok(protocol.evaluationProfile.externalResumePolicy.absoluteDenylist.includes("agent-timeout"));
  assert.equal(
    lock.candidates.find((candidate) => candidate.id === "07-four-call-finalizer").exceptionType,
    "AgentTimeoutError",
  );
  assert.equal(result.status, "complete-no-winner-exploratory");
  assert.equal(result.promotable, false);
  assert.equal(result.causalComparisonAllowed, false);
  assert.equal(result.provenance.identityConsistent, false);
  assert.equal(result.aggregateUsage.candidateTrials, 8);
  assert.equal(result.aggregateUsage.evaluableTrials, 4);
  assert.equal(result.aggregateUsage.inputTokens, 13211233);
  assert.equal(result.aggregateUsage.outputTokens, 372559);
  assert.match(markdown, /exploratory and non-promotable/);
  assert.match(markdown, /not a causal candidate comparison/);
  assert.match(markdown, /Candidates `00`–`04` were installed[\s\S]*legacy basename `skill`/);
  assert.match(markdown, /\| Contract \| Min docs \| Mechanical \| Diagnostic utility \|/);
  assert.match(markdown, /\| `00-baseline` \| no \| legacy `skill` \| n\/a \| n\/a \| n\/a \| n\/a \|/);
  assert.match(markdown, /\| `04-harbor-legacy-port` \| yes \| legacy `skill` \| 1 \| 0 \| 0 \|/);
  assert.match(markdown, /verify-native/);
});

test("q003 final analyzer semantic lock rejects decision drift", async () => {
  const lock = JSON.parse(await fs.readFile(
    path.join(
      repoRoot,
      "evaluations",
      "knowledge-consult-evolution",
      "results",
      "q003-evidence.lock.json",
    ),
    "utf8",
  ));
  const matchingRun = {
    selectedWinner: null,
    bestEvolvableCandidate: lock.analyzerDiagnostics.bestEvolvableCandidate,
    survivors: [...lock.analyzerDiagnostics.survivorsByPrimaryFitness],
    repairParents: [
      ...lock.analyzerDiagnostics.repairParentsByComplementaryRequiredRewardCoverage,
    ],
    minimumDevelopmentPassRate: lock.observedProfile.profile.minimumDevelopmentPassRate,
    requiredRewardThresholds: structuredClone(lock.observedProfile.profile.requiredRewards),
    holdout: {
      status: "not-eligible",
      promoted: false,
      minimumDevelopmentPassRate: lock.observedProfile.profile.minimumDevelopmentPassRate,
    },
  };
  assert.doesNotThrow(() => verifyFinalAnalysisSemantics(matchingRun, lock));

  const drifts = [
    ["selected winner", { ...matchingRun, selectedWinner: "04-harbor-legacy-port" }],
    ["holdout status", { ...matchingRun, holdout: { ...matchingRun.holdout, status: "eligible" } }],
    ["holdout promotion", { ...matchingRun, holdout: { ...matchingRun.holdout, promoted: true } }],
    ["survivors", { ...matchingRun, survivors: [...matchingRun.survivors].reverse() }],
    ["repair parents", { ...matchingRun, repairParents: [...matchingRun.repairParents].reverse() }],
    ["best evolvable", { ...matchingRun, bestEvolvableCandidate: "05-context-budgeted" }],
    ["pass rate", { ...matchingRun, minimumDevelopmentPassRate: 0.5 }],
    [
      "holdout pass rate",
      {
        ...matchingRun,
        holdout: { ...matchingRun.holdout, minimumDevelopmentPassRate: 0.5 },
      },
    ],
    [
      "required reward thresholds",
      {
        ...matchingRun,
        requiredRewardThresholds: {
          ...matchingRun.requiredRewardThresholds,
          evidence_contract_gate: 0,
        },
      },
    ],
  ];
  for (const [label, driftedRun] of drifts) {
    assert.throws(
      () => verifyFinalAnalysisSemantics(driftedRun, lock),
      /drift/,
      label,
    );
  }
});

test("knowledge consult receipt comparison rejects any materialization drift", () => {
  const expected = { schemaVersion: 1, materialized: { tasks: { treeSha256: "abc" } } };
  compareReceipts(structuredClone(expected), expected);
  assert.throws(
    () => compareReceipts(
      { schemaVersion: 1, materialized: { tasks: { treeSha256: "def" } } },
      expected,
    ),
    /receipt drift/,
  );
});

test("knowledge consult source verification works with a synthetic repository", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-consult-source-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const datasetDir = path.join(root, "registry");
  const bundle = path.join(root, "bundle");
  const skill = path.join(root, "skill");
  await fs.mkdir(datasetDir, { recursive: true });
  await fs.mkdir(bundle, { recursive: true });
  await fs.mkdir(skill, { recursive: true });
  const cohorts = { discovery: ["q001"], holdout: ["q002"], hard: ["q003"] };
  await fs.writeFile(
    path.join(datasetDir, "dataset.json"),
    `${JSON.stringify({ dataset_id: "fixture", reference_bundle: "bundle" })}\n`,
  );
  await fs.writeFile(path.join(datasetDir, "cohorts.json"), `${JSON.stringify({ cohorts })}\n`);
  await fs.writeFile(path.join(bundle, "records.jsonl"), "{}\n");
  await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: fixture\n---\n");

  const run = (args) => import("node:child_process").then(({ spawnSync }) => {
    const completed = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(completed.status, 0, completed.stderr);
  });
  await run(["init", "--quiet"]);
  await run(["config", "user.email", "fixture@example.com"]);
  await run(["config", "user.name", "Fixture"]);
  await run(["add", "."]);
  await run(["commit", "--quiet", "-m", "fixture"]);
  const { spawnSync } = await import("node:child_process");
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();

  const descriptorSha = createHash("sha256")
    .update(await fs.readFile(path.join(datasetDir, "dataset.json")))
    .digest("hex");
  const cohortsSha = createHash("sha256")
    .update(await fs.readFile(path.join(datasetDir, "cohorts.json")))
    .digest("hex");
  const bundleTree = await treeDigest(bundle);
  const skillTree = await treeDigest(skill);
  const protocol = {
    sourceFreeze: {
      repository: { commit },
      dataset: {
        id: "fixture",
        descriptorPath: "registry/dataset.json",
        cohortsPath: "registry/cohorts.json",
        referenceBundlePath: "bundle",
      },
      files: [
        { path: "registry/dataset.json", sha256: descriptorSha },
        { path: "registry/cohorts.json", sha256: cohortsSha },
      ],
      trees: [
        { path: "bundle", ...bundleTree },
        { path: "skill", ...skillTree },
      ],
    },
    benchmark: { cohorts },
  };

  const verified = await verifySourceFreeze({ knowledgeRoot: root, protocol });
  assert.equal(verified.commit, commit);
  await fs.writeFile(path.join(bundle, "records.jsonl"), "{\"drift\":true}\n");
  await assert.rejects(
    verifySourceFreeze({ knowledgeRoot: root, protocol }),
    /bundle tree SHA-256 drift/,
  );
});
