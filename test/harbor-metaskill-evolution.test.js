import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-metaskill-evolution",
  "scripts",
  "analyze_metaskill_ledger.py",
);
const python = process.env.PYTHON ?? "python";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function shaBytes(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function digest(value) {
  return shaBytes(Buffer.from(JSON.stringify(canonicalize(value)), "utf8"));
}

function namedDigest(name) {
  return shaBytes(Buffer.from(name, "utf8"));
}

function metaBundle(prefix) {
  const bundle = Object.fromEntries(
    ["analyzer", "retriever", "allocator", "proposer", "evolver"]
      .map((component) => [component, namedDigest(`${prefix}-${component}`)]),
  );
  return { bundle, digest: digest(bundle) };
}

async function writeJson(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return { bytes, digest: shaBytes(bytes) };
}

async function writeEvidence(root, id, utility, options = {}) {
  const status = options.status ?? "evaluable";
  const profile = options.profile ?? namedDigest("comparison-profile");
  const cohort = options.cohort ?? namedDigest("development-cohort");
  const metric = options.metric ?? namedDigest("primary-utility-metric");
  const evaluatedTaskSkillDigest = options.taskSkillDigest
    ?? namedDigest(`${id}-task-skill`);
  const values = { primaryUtility: status === "evaluable" ? utility : null };
  const hardGates = {
    mechanical_qualification:
      status === "evaluable" ? (options.gate ?? 1) : null,
  };
  const receiptProjection = {
    evaluationStatus: status,
    evaluatedTaskSkillDigest,
    comparisonProfileDigest: profile,
    taskSetDigest: cohort,
    utilityMetricDigest: metric,
    values: options.receiptMismatch ? { primaryUtility: utility + 0.01 } : values,
    hardGates,
  };
  const sourceProjection = {
    ...receiptProjection,
    values: options.sourceMismatch
      ? { primaryUtility: utility + 0.02 }
      : receiptProjection.values,
  };
  const artifact = options.reuseSource?.document ?? {
    schemaVersion: 1,
    split: "development",
    artifactId: id,
    developmentSummary: sourceProjection,
    ...(options.holdoutArtifact
      ? { nested: { holdoutResults: { utility: 0.99 } } }
      : {}),
  };
  const artifactRelative = options.reuseSource?.path ?? `source/${id}.json`;
  const artifactWrite = options.reuseSource
    ? { digest: options.reuseSource.sha256 }
    : await writeJson(path.join(root, artifactRelative), artifact);
  const receipt = {
    schemaVersion: 1,
    receiptClass: "harbor-owning-analyzer-receipt",
    publicEvidence: true,
    split: "development",
    owningAnalyzerDigest: namedDigest("owning-analyzer-v1"),
    sourceArtifact: {
      path: artifactRelative,
      sha256: artifactWrite.digest,
      artifactClass:
        "harbor-native-development-only-public-summary-artifact",
    },
    sourceSelectors: {
      evaluationStatus: "/developmentSummary/evaluationStatus",
      evaluatedTaskSkillDigest: "/developmentSummary/evaluatedTaskSkillDigest",
      comparisonProfileDigest: "/developmentSummary/comparisonProfileDigest",
      taskSetDigest: "/developmentSummary/taskSetDigest",
      utilityMetricDigest: "/developmentSummary/utilityMetricDigest",
      values: "/developmentSummary/values",
      hardGates: "/developmentSummary/hardGates",
    },
    projection: receiptProjection,
  };
  const receiptRelative = `receipts/${id}.json`;
  const receiptWrite = await writeJson(path.join(root, receiptRelative), receipt);
  const projection = {
    schemaVersion: 1,
    evidenceClass: "harbor-native-development-projection",
    publicEvidence: true,
    split: "development",
    evaluationStatus: status,
    evaluatedTaskSkillDigest,
    comparisonProfileDigest: profile,
    taskSetDigest: cohort,
    utilityMetricDigest: metric,
    values,
    hardGates,
    ...(!options.omitReceipt
      ? { sourceReceipt: { path: receiptRelative, sha256: receiptWrite.digest } }
      : {}),
    ...(options.extraProjectionField ? { holdoutUtility: 0.99 } : {}),
  };
  const projectionRelative = `projections/${id}.json`;
  const projectionWrite = await writeJson(
    path.join(root, projectionRelative),
    projection,
  );
  return {
    path: projectionRelative,
    sha256: projectionWrite.digest,
    jsonPointer: "/values/primaryUtility",
    expectedValue: values.primaryUtility,
    absolutePath: path.join(root, projectionRelative),
    evaluatedTaskSkillDigest,
    sourceArtifact: {
      path: artifactRelative,
      sha256: artifactWrite.digest,
      document: artifact,
    },
  };
}

async function writeGenerationReceipt(root, id, context, slotIndex, binding, overrides = {}) {
  const receipt = {
    schemaVersion: 1,
    receiptClass: "harbor-metaskill-generation-receipt",
    split: "development",
    groupId: context.groupId,
    arm: context.arm,
    slotIndex,
    generatorSeed: context.generatorSeeds[slotIndex],
    proposerSeed: context.proposerSeeds[slotIndex],
    retrievalOrderedArtifactDigests: context.retrievalOrderedArtifactDigests,
    generatorProfileDigest: context.generatorProfileDigest,
    proposerProfileDigest: context.proposerProfileDigest,
    generatorPromptDigest: context.generatorPromptDigest,
    proposerPromptDigest: context.proposerPromptDigest,
    parentNodeId: binding.parentNodeId,
    parentTaskSkillDigest: binding.parentTaskSkillDigest,
    parentMetaDigest: binding.parentMetaDigest,
    realizedChildTaskSkillDigest: binding.realizedChildTaskSkillDigest,
    childProducingMetaDigest: binding.childProducingMetaDigest,
    ...overrides,
  };
  const relative = `generations/${id}.json`;
  const absolutePath = path.join(root, relative);
  const written = await writeJson(absolutePath, receipt);
  return { path: relative, sha256: written.digest, absolutePath };
}

function counterfactual(arm, overrides = {}) {
  return {
    groupId: "meta-update-001",
    arm,
    k: 2,
    retrievalOrderedArtifactDigests: [
      namedDigest("retrieval-a"),
      namedDigest("retrieval-b"),
    ],
    generatorProfileDigest: namedDigest("generator-profile"),
    proposerProfileDigest: namedDigest("proposer-profile"),
    generatorPromptDigest: namedDigest("generator-prompt"),
    proposerPromptDigest: namedDigest("proposer-prompt"),
    generatorSeeds: [101, 102],
    proposerSeeds: [201, 202],
    downstreamEvaluationCohortDigest: namedDigest("development-cohort"),
    downstreamEvaluationProfileDigest: namedDigest("comparison-profile"),
    ...overrides,
  };
}

function node({
  nodeId,
  parentNodeId,
  taskSkillDigest,
  producingMetaDigest,
  meta,
  utilityEvidence,
  generationReceipt = null,
  budgetUnits = 1,
  allocatedChildBudgetUnits = 0,
  counterfactual: pair = null,
  inspirations = [],
  injectSelectionCount = false,
}) {
  return {
    recordType: "node",
    nodeId,
    parentNodeId,
    inspirationNodeIds: inspirations,
    taskSkillDigest,
    producingMetaDigest,
    inheritedMetaDigest: meta.digest,
    metaBundle: meta.bundle,
    metaBundleDigest: meta.digest,
    ...(injectSelectionCount ? { selectionCount: 0 } : {}),
    budgetUnits,
    allocatedChildBudgetUnits,
    utilityEvidence: {
      path: utilityEvidence.path,
      sha256: utilityEvidence.sha256,
      jsonPointer: utilityEvidence.jsonPointer,
      expectedValue: utilityEvidence.expectedValue,
    },
    generationReceipt: generationReceipt === null
      ? null
      : { path: generationReceipt.path, sha256: generationReceipt.sha256 },
    counterfactual: pair,
  };
}

function chainRecords(records) {
  let previousRecordDigest = null;
  return records.map((input, index) => {
    const record = {
      ...input,
      ...(input.recordType === "header" ? {} : { sequence: index - 1 }),
      previousRecordDigest,
    };
    record.recordDigest = digest(record);
    previousRecordDigest = record.recordDigest;
    return record;
  });
}

async function createFixture(directory, options = {}) {
  const evidenceRoot = path.join(directory, "evidence", "development");
  await fs.mkdir(evidenceRoot, { recursive: true });
  const metaA = metaBundle("meta-a");
  const metaB = metaBundle("meta-b");
  const tasks = {
    root: namedDigest("root-task"),
    pair: namedDigest("pair-task"),
    adaptive1: options.unchangedAdaptiveTask
      ? namedDigest("pair-task")
      : namedDigest("adaptive-task-1"),
    adaptive2: namedDigest("adaptive-task-2"),
    frozen1: namedDigest("frozen-task-1"),
    frozen2: namedDigest("frozen-task-2"),
    altRoot: namedDigest("alt-root-task"),
    alt1: namedDigest("alt-task-1"),
    alt2: namedDigest("alt-task-2"),
  };
  if (
    options.duplicateWrapper
    || options.reuseGenerationReceipt
    || options.duplicateChildTask
  ) {
    tasks.adaptive2 = tasks.adaptive1;
  }
  const adaptiveContext = counterfactual("adaptive-meta");
  const frozenContext = counterfactual(
    "frozen-meta",
    options.parityMismatch ? { proposerSeeds: [201, 999] } : {},
  );
  const evidence = {};
  evidence.root = await writeEvidence(evidenceRoot, "root", 0.4, {
    taskSkillDigest: options.wrongEvaluatedTask
      ? namedDigest("wrong-root-task")
      : tasks.root,
    holdoutArtifact: options.holdoutArtifact,
    receiptMismatch: options.receiptMismatch,
    sourceMismatch: options.sourceMismatch,
    omitReceipt: options.omitReceipt,
    extraProjectionField: options.extraProjectionField,
  });
  evidence.pair = await writeEvidence(evidenceRoot, "pair", 0.5, {
    taskSkillDigest: tasks.pair,
  });
  evidence.adaptive1 = await writeEvidence(evidenceRoot, "adaptive-1", 0.8, {
    taskSkillDigest: tasks.adaptive1,
  });
  evidence.adaptive2 = await writeEvidence(
    evidenceRoot,
    "adaptive-2",
    options.duplicateWrapper ? 0.8 : 0.7,
    {
      taskSkillDigest: tasks.adaptive2,
      status: options.externalFailure ? "external-failure" : "evaluable",
      gate: options.failedGate ? 0 : 1,
      reuseSource: options.duplicateWrapper
        ? evidence.adaptive1.sourceArtifact
        : undefined,
    },
  );
  evidence.frozen1 = await writeEvidence(evidenceRoot, "frozen-1", 0.6, {
    taskSkillDigest: tasks.frozen1,
  });
  evidence.frozen2 = await writeEvidence(evidenceRoot, "frozen-2", 0.55, {
    taskSkillDigest: tasks.frozen2,
  });

  const adaptive1Generation = await writeGenerationReceipt(
    evidenceRoot,
    "adaptive-1",
    adaptiveContext,
    0,
    {
      parentNodeId: "adaptive",
      parentTaskSkillDigest: tasks.pair,
      parentMetaDigest: metaB.digest,
      realizedChildTaskSkillDigest: tasks.adaptive1,
      childProducingMetaDigest: metaB.digest,
    },
    options.generationSeedMismatch ? { generatorSeed: 999 } : {},
  );
  const adaptive2Generation = options.reuseGenerationReceipt
    ? adaptive1Generation
    : await writeGenerationReceipt(
      evidenceRoot,
      "adaptive-2",
      adaptiveContext,
      1,
      {
        parentNodeId: "adaptive",
        parentTaskSkillDigest: tasks.pair,
        parentMetaDigest: metaB.digest,
        realizedChildTaskSkillDigest: tasks.adaptive2,
        childProducingMetaDigest: metaB.digest,
      },
      options.generationProducingMetaMismatch
        ? { childProducingMetaDigest: metaA.digest }
        : {},
    );
  const frozen1Generation = await writeGenerationReceipt(
    evidenceRoot,
    "frozen-1",
    frozenContext,
    0,
    {
      parentNodeId: "frozen",
      parentTaskSkillDigest: tasks.pair,
      parentMetaDigest: metaA.digest,
      realizedChildTaskSkillDigest: tasks.frozen1,
      childProducingMetaDigest: metaA.digest,
    },
  );
  const frozen2Generation = await writeGenerationReceipt(
    evidenceRoot,
    "frozen-2",
    frozenContext,
    1,
    {
      parentNodeId: "frozen",
      parentTaskSkillDigest: tasks.pair,
      parentMetaDigest: metaA.digest,
      realizedChildTaskSkillDigest: tasks.frozen2,
      childProducingMetaDigest: metaA.digest,
    },
  );

  let alternateRecords = [];
  if (options.secondPartition) {
    const alternateIdentity = {
      profile: namedDigest("alternate-comparison-profile"),
      cohort: namedDigest("alternate-development-cohort"),
      metric: namedDigest("alternate-utility-metric"),
    };
    evidence.altRoot = await writeEvidence(evidenceRoot, "alt-root", 0.3, {
      ...alternateIdentity,
      taskSkillDigest: tasks.altRoot,
    });
    evidence.alt1 = await writeEvidence(evidenceRoot, "alt-1", 0.6, {
      ...alternateIdentity,
      taskSkillDigest: tasks.alt1,
    });
    evidence.alt2 = await writeEvidence(evidenceRoot, "alt-2", 0.55, {
      ...alternateIdentity,
      taskSkillDigest: tasks.alt2,
    });
    alternateRecords = [
      node({
        nodeId: "alt-root",
        parentNodeId: null,
        taskSkillDigest: tasks.altRoot,
        producingMetaDigest: null,
        meta: metaA,
        utilityEvidence: evidence.altRoot,
        allocatedChildBudgetUnits: 2,
      }),
      node({
        nodeId: "alt-1",
        parentNodeId: "alt-root",
        taskSkillDigest: tasks.alt1,
        producingMetaDigest: metaA.digest,
        meta: metaA,
        utilityEvidence: evidence.alt1,
      }),
      node({
        nodeId: "alt-2",
        parentNodeId: "alt-root",
        taskSkillDigest: tasks.alt2,
        producingMetaDigest: metaA.digest,
        meta: metaA,
        utilityEvidence: evidence.alt2,
      }),
    ];
  }
  const records = [
    {
      recordType: "header",
      schemaVersion: 1,
      ledgerId: "fixture-development-ledger",
      split: "development",
      appendOnly: true,
      evidenceRoot: "evidence/development",
      budget: {
        unit: "candidate-evaluations",
        totalUnits: options.lowBudget ? 3 : 20,
        maximumChildrenPerNode: 4,
      },
      frontierPolicy: {
        weights: { utility: 1, productivity: 0.5, novelty: 0.25 },
        minimumProductivitySupport: 2,
        hardGateThresholds: { mechanical_qualification: 1 },
      },
      counterfactualPolicy: {
        requiredForMetaChanges: true,
        minimumComparablePairs: 1,
      },
    },
    node({
      nodeId: "root",
      parentNodeId: null,
      taskSkillDigest: tasks.root,
      producingMetaDigest: null,
      meta: metaA,
      utilityEvidence: evidence.root,
      budgetUnits: options.zeroNodeBudget ? 0 : (options.multiNodeBudget ? 2 : 1),
      allocatedChildBudgetUnits: 1,
      injectSelectionCount: options.injectSelectionCount,
    }),
    node({
      nodeId: "adaptive",
      parentNodeId: "root",
      taskSkillDigest: tasks.pair,
      producingMetaDigest: metaA.digest,
      meta: metaB,
      utilityEvidence: evidence.pair,
      allocatedChildBudgetUnits: 2,
      counterfactual: adaptiveContext,
    }),
    node({
      nodeId: "frozen",
      parentNodeId: "root",
      taskSkillDigest: tasks.pair,
      producingMetaDigest: metaA.digest,
      meta: metaA,
      utilityEvidence: evidence.pair,
      allocatedChildBudgetUnits: 2,
      counterfactual: frozenContext,
    }),
    node({
      nodeId: "adaptive-1",
      parentNodeId: "adaptive",
      taskSkillDigest: tasks.adaptive1,
      producingMetaDigest: metaB.digest,
      meta: metaB,
      utilityEvidence: evidence.adaptive1,
      generationReceipt: options.missingGenerationReceipt
        ? null
        : adaptive1Generation,
    }),
    node({
      nodeId: "adaptive-2",
      parentNodeId: "adaptive",
      taskSkillDigest: tasks.adaptive2,
      producingMetaDigest: metaB.digest,
      meta: metaB,
      utilityEvidence: evidence.adaptive2,
      generationReceipt: adaptive2Generation,
      inspirations: ["adaptive-1"],
    }),
    node({
      nodeId: "frozen-1",
      parentNodeId: "frozen",
      taskSkillDigest: tasks.frozen1,
      producingMetaDigest: metaA.digest,
      meta: metaA,
      utilityEvidence: evidence.frozen1,
      generationReceipt: frozen1Generation,
    }),
    ...(!options.underExecute
      ? [node({
        nodeId: "frozen-2",
        parentNodeId: "frozen",
        taskSkillDigest: tasks.frozen2,
        producingMetaDigest: metaA.digest,
        meta: metaA,
        utilityEvidence: evidence.frozen2,
        generationReceipt: frozen2Generation,
      })]
      : []),
    ...alternateRecords,
    {
      recordType: "selection",
      eventId: "selection-frozen-001",
      nodeId: "frozen",
    },
    {
      recordType: "selection",
      eventId: "selection-frozen-002",
      nodeId: "frozen",
    },
  ];
  const chained = chainRecords(records);
  const ledgerPath = path.join(directory, "ledger.jsonl");
  await fs.writeFile(
    ledgerPath,
    `${chained.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  return {
    ledgerPath,
    evidence,
    tasks,
    generations: {
      adaptive1: adaptive1Generation,
      adaptive2: adaptive2Generation,
      frozen1: frozen1Generation,
      frozen2: frozen2Generation,
    },
  };
}

function run(ledgerPath, ...args) {
  return spawnSync(python, [script, ledgerPath, ...args], {
    encoding: "utf8",
  });
}

test("replays source-bound evidence deterministically and derives selection novelty", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-meta-valid-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { ledgerPath } = await createFixture(directory);
  const reportPath = path.join(directory, "report.json");

  const created = run(ledgerPath, "--output", reportPath);
  assert.equal(created.status, 0, created.stderr);
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert.equal(report.decision, "frontiers-ranked-within-identities");
  assert.equal(
    report.trustLevel,
    "content-bound-development-projection-authority-unverified",
  );
  assert.equal(report.decisionScope, "within-comparison-identities-only");
  assert.equal(report.capabilityBoundaries.modelCalls, false);
  assert.equal(report.capabilityBoundaries.selectionAuthorized, false);
  assert.equal(report.capabilityBoundaries.configuredHoldoutInput, false);
  assert.equal(report.capabilityBoundaries.semanticHoldoutAbsenceVerified, false);
  assert.equal(Object.hasOwn(report.capabilityBoundaries, "holdoutAccess"), false);
  assert.equal(report.selectionEvents.length, 2);
  assert.equal(report.nodes.find((item) => item.nodeId === "frozen").selectionCount, 2);
  assert.equal(report.nodes.find((item) => item.nodeId === "adaptive").selectionCount, 0);
  assert.equal(report.frontier.partitions.length, 1);
  assert.equal(report.frontier.partitions[0].ranking[0].nodeId, "adaptive");
  assert.equal(report.frontier.crossIdentityRankingAuthorized, false);
  assert.equal(
    report.counterfactuals.pairs[0].adaptiveMinusFrozenProductivity,
    0.175,
  );
  assert.equal(report.counterfactuals.pairs[0].comparable, true);
  assert.equal(report.budget.spentNodeUnits, 7);
  assert.equal(report.budget.declaredChildAllocationUnits, 5);
  assert.deepEqual(report.dag.inspirationEdges, [
    { sourceNodeId: "adaptive-1", targetNodeId: "adaptive-2" },
  ]);
  assert.equal(report.dag.lineageEdges.length, 6);
  assert.ok(report.productivity[1].comparisons.every(
    (edge) => edge.producingMetaDigest,
  ));
  assert.ok(report.productivity[0].comparisons.every(
    (edge) => edge.exclusionReasons.includes(
      "counterfactual-branch-seed-structural-edge",
    ),
  ));
  assert.deepEqual(report.counterfactuals.pairs[0].adaptiveGenerationSlots, [0, 1]);
  assert.deepEqual(report.counterfactuals.pairs[0].frozenGenerationSlots, [0, 1]);
  assert.ok(report.nodes.every((item) => item.utilityEvidence.observationIdentity));
  assert.ok(report.nodes.every(
    (item) => item.utilityEvidence.evaluatedTaskSkillDigest === item.taskSkillDigest,
  ));
  assert.equal(report.nodes[0].utilityEvidence.sourceProvenance.trustLevel,
    "content-bound-development-projection-authority-unverified");
  assert.equal(JSON.stringify(report).includes(directory), false);

  const replayed = run(ledgerPath);
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.deepEqual(JSON.parse(replayed.stdout), report);
  const verified = run(ledgerPath, "--verify-report", reportPath);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).valid, true);
  const overwrite = run(ledgerPath, "--output", reportPath);
  assert.equal(overwrite.status, 2);
  assert.match(overwrite.stderr, /refusing to overwrite/);
});

test("rejects detached, self-asserted, smuggled, or mixed-split projections", async (t) => {
  for (const [name, options, pattern] of [
    ["receipt-mismatch", { receiptMismatch: true }, /owning-analyzer receipt/],
    ["source-mismatch", { sourceMismatch: true }, /source selector for values/],
    ["missing-receipt", { omitReceipt: true }, /invalid keys/],
    ["extra-field", { extraProjectionField: true }, /unexpected.*holdoutUtility/],
    ["holdout-source", { holdoutArtifact: true }, /forbidden holdout/],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 2, `${name}: ${result.stderr}`);
    assert.match(result.stderr, pattern);
  }
});

test("rejects caller-supplied novelty and explicit parity mismatches", async (t) => {
  for (const [name, options, pattern] of [
    ["selection-count", { injectSelectionCount: true }, /selectionCount/],
    ["parity", { parityMismatch: true }, /explicit parity field proposerSeeds/],
    ["budget", { lowBudget: true }, /spent node budget/],
    ["zero-node-budget", { zeroNodeBudget: true }, /budgetUnits must be an integer >= 1/],
    ["multi-node-budget", { multiNodeBudget: true }, /budgetUnits must equal 1/],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 2, `${name}: ${result.stderr}`);
    assert.match(result.stderr, pattern);
  }
});

test("marks under-executed and non-evaluable counterfactuals insufficient", async (t) => {
  for (const [name, options, expectedReason] of [
    ["under-executed", { underExecute: true }, "frozen-child-count-not-k"],
    ["external-failure", { externalFailure: true }, "adaptive-support-does-not-equal-k"],
    ["hard-gate", { failedGate: true }, "adaptive-support-does-not-equal-k"],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.decision, "insufficient-evidence");
    assert.equal(report.counterfactuals.pairs[0].comparable, false);
    assert.ok(report.counterfactuals.pairs[0].exclusionReasons.includes(expectedReason));
  }
});

test("partitions frontier rankings by exact comparison identity", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-meta-partitions-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { ledgerPath } = await createFixture(directory, { secondPartition: true });
  const result = run(ledgerPath);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.decision, "frontiers-ranked-within-identities");
  assert.equal(report.frontier.partitions.length, 2);
  assert.equal(Object.hasOwn(report.frontier, "ranking"), false);
  assert.equal(report.frontier.crossIdentityRankingAuthorized, false);
  for (const partition of report.frontier.partitions) {
    assert.ok(partition.ranking.length > 0);
    assert.ok(partition.ranking.every((row) => row.nodeId));
  }
  assert.deepEqual(
    [...report.frontier.partitions]
      .map((partition) => partition.comparisonIdentityDigest),
    [...report.frontier.partitions]
      .map((partition) => partition.comparisonIdentityDigest)
      .sort(),
  );
});

test("rejects wrapper pseudoreplication and source-bound candidate identity drift", async (t) => {
  for (const [name, options, pattern] of [
    ["duplicate-wrapper", { duplicateWrapper: true }, /authoritative observation identity/],
    ["wrong-candidate", { wrongEvaluatedTask: true }, /evaluatedTaskSkillDigest/],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 2, `${name}: ${result.stderr}`);
    assert.match(result.stderr, pattern);
  }
});

test("requires exact non-reused counterfactual generation receipts", async (t) => {
  for (const [name, options, pattern] of [
    ["missing", { missingGenerationReceipt: true }, /requires a SHA-bound generationReceipt/],
    ["seed", { generationSeedMismatch: true }, /generatorSeed mismatch/],
    ["producing-meta", { generationProducingMetaMismatch: true }, /childProducingMetaDigest mismatch/],
    ["reuse", { reuseGenerationReceipt: true }, /generation receipt is reused/],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-generation-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 2, `${name}: ${result.stderr}`);
    assert.match(result.stderr, pattern);
  }
});

test("excludes unchanged and repeated realized child skills from productivity", async (t) => {
  for (const [name, options, comparisonReason, pairReason] of [
    [
      "unchanged",
      { unchangedAdaptiveTask: true },
      "unchanged-task-skill",
      "adaptive-support-does-not-equal-k",
    ],
    [
      "repeated-child",
      { duplicateChildTask: true },
      "duplicate-child-task-skill-for-parent",
      "adaptive-unique-child-task-skill-count-not-k",
    ],
  ]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `harbor-meta-${name}-`));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { ledgerPath } = await createFixture(directory, options);
    const result = run(ledgerPath);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const adaptive = report.productivity.find((row) => row.nodeId === "adaptive");
    assert.ok(adaptive.comparisons.some(
      (comparison) => comparison.exclusionReasons.includes(comparisonReason),
    ));
    assert.equal(report.counterfactuals.pairs[0].comparable, false);
    assert.ok(report.counterfactuals.pairs[0].exclusionReasons.includes(pairReason));
    assert.equal(report.decision, "insufficient-evidence");
  }
});

test("rejects post-ledger evidence mutation", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-meta-mutation-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { ledgerPath, evidence } = await createFixture(directory);
  await fs.appendFile(evidence.adaptive1.absolutePath, " \n");
  const result = run(ledgerPath);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /sha256 mismatch/);

  const generationDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "harbor-meta-generation-mutation-"),
  );
  t.after(() => fs.rm(generationDirectory, { recursive: true, force: true }));
  const generationFixture = await createFixture(generationDirectory);
  await fs.appendFile(generationFixture.generations.adaptive1.absolutePath, " \n");
  const generationResult = run(generationFixture.ledgerPath);
  assert.equal(generationResult.status, 2, generationResult.stderr);
  assert.match(generationResult.stderr, /generationReceipt\.sha256 mismatch/);
});

test("rejects ledger-chain and stored-report tampering", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-meta-chain-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { ledgerPath } = await createFixture(directory);
  const reportPath = path.join(directory, "report.json");
  assert.equal(run(ledgerPath, "--output", reportPath).status, 0);

  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  report.frontier.partitions[0].ranking[0].score += 1;
  await fs.writeFile(reportPath, `${JSON.stringify(report)}\n`);
  const reportVerification = run(ledgerPath, "--verify-report", reportPath);
  assert.equal(reportVerification.status, 2);
  assert.match(reportVerification.stderr, /does not match deterministic replay/);

  const lines = (await fs.readFile(ledgerPath, "utf8")).trimEnd().split("\n");
  const finalEvent = JSON.parse(lines.at(-1));
  finalEvent.nodeId = "adaptive";
  lines[lines.length - 1] = JSON.stringify(finalEvent);
  await fs.writeFile(ledgerPath, `${lines.join("\n")}\n`);
  const chainVerification = run(ledgerPath);
  assert.equal(chainVerification.status, 2);
  assert.match(chainVerification.stderr, /recordDigest mismatch/);
});
