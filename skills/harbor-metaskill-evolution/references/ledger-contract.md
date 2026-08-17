# Development Ledger Contract

This bundle replays an append-only development ledger. It does not read raw
Harbor trials, calculate Harbor rewards, run Harbor, call a model, create or
modify candidates, select a winner, or configure holdout input. A producer must
publish Harbor-native evidence declared sanitized and development-only, an
owning-analyzer receipt, and the receipt's digest-sealed source artifact before
analysis. Those declarations are not authenticated by this replay.

## Hash-chained JSON Lines

Use UTF-8 JSON Lines. The first record is a header. Every later record is a
`node` or `selection` event. Its `sequence` is the zero-based position among
all post-header records, not merely among records of the same type.

Every record contains `previousRecordDigest` and `recordDigest`. The header
uses `null`; each later record names the immediately preceding digest. Compute
`recordDigest` by removing only the top-level `recordDigest`, serializing with
recursively sorted JSON object keys, UTF-8, no ASCII escaping, and separators
`,` and `:`, then prefixing the lowercase SHA-256 hex with `sha256:`.

The chain detects a changed replay prefix. It does not authenticate an author;
seal the final digest separately when authorship matters.

## Header record

~~~json
{
  "recordType": "header",
  "schemaVersion": 1,
  "ledgerId": "example-development-ledger",
  "split": "development",
  "appendOnly": true,
  "evidenceRoot": "evidence/development",
  "budget": {
    "unit": "candidate-evaluations",
    "totalUnits": 20,
    "maximumChildrenPerNode": 4
  },
  "frontierPolicy": {
    "weights": {"utility": 1.0, "productivity": 0.5, "novelty": 0.25},
    "minimumProductivitySupport": 2,
    "hardGateThresholds": {"mechanical_qualification": 1.0}
  },
  "counterfactualPolicy": {
    "requiredForMetaChanges": true,
    "minimumComparablePairs": 1
  },
  "previousRecordDigest": null,
  "recordDigest": "sha256:..."
}
~~~

`split` is exactly `development`; a configured holdout input fails closed.
`evidenceRoot` is a relative directory beneath the ledger directory. It and
every referenced file must be regular non-reparse paths, and no path component
may contain `holdout`. This does not prove semantic absence of mislabeled data.
Budgets are fixed positive integers. Because the unit is one complete
`candidate-evaluations` observation, every node has `budgetUnits: 1`. Node
spend and declared child allocations are checked separately against
`totalUnits`; allocation is not spend. Frontier
weights are finite and non-negative with at least one positive weight. Gates
are conjunctive. `requiredForMetaChanges` is true.

## Node record

~~~json
{
  "recordType": "node",
  "sequence": 0,
  "nodeId": "root",
  "parentNodeId": null,
  "inspirationNodeIds": [],
  "taskSkillDigest": "sha256:...",
  "producingMetaDigest": null,
  "inheritedMetaDigest": "sha256:...",
  "metaBundle": {
    "analyzer": "sha256:...",
    "retriever": "sha256:...",
    "allocator": "sha256:...",
    "proposer": "sha256:...",
    "evolver": "sha256:..."
  },
  "metaBundleDigest": "sha256:...",
  "budgetUnits": 1,
  "allocatedChildBudgetUnits": 2,
  "utilityEvidence": {
    "path": "projections/root.json",
    "sha256": "sha256:...",
    "jsonPointer": "/values/primaryUtility",
    "expectedValue": 0.4
  },
  "generationReceipt": null,
  "counterfactual": null,
  "previousRecordDigest": "sha256:...",
  "recordDigest": "sha256:..."
}
~~~

Node IDs are unique lowercase identifiers. Parents and inspirations must
already exist, producing an append-only DAG. A root has null producing meta; a
child's producing meta equals its parent's inherited meta. `metaBundle` has
exactly the five typed keys shown, and its contract digest equals
`metaBundleDigest` and `inheritedMetaDigest`. A node never declares
`selectionCount`; the analyzer derives it from ledger events. A node's
source-bound `evaluatedTaskSkillDigest` must equal its `taskSkillDigest`.
`generationReceipt` is null except on direct children of a counterfactual arm.

## Selection event

~~~json
{
  "recordType": "selection",
  "sequence": 1,
  "eventId": "selection-001",
  "nodeId": "root",
  "previousRecordDigest": "sha256:...",
  "recordDigest": "sha256:..."
}
~~~

An event ID is unique and its node already exists. Every valid event adds one
to that node's derived selection count. Novelty is replayable as
`1 / (1 + derivedSelectionCount)`.

## Evidence, receipt, and source artifact

The projection schema is exact:

~~~json
{
  "schemaVersion": 1,
  "evidenceClass": "harbor-native-development-projection",
  "publicEvidence": true,
  "split": "development",
  "evaluationStatus": "evaluable",
  "evaluatedTaskSkillDigest": "sha256:...",
  "comparisonProfileDigest": "sha256:...",
  "taskSetDigest": "sha256:...",
  "utilityMetricDigest": "sha256:...",
  "values": {"primaryUtility": 0.4},
  "hardGates": {"mechanical_qualification": 1.0},
  "sourceReceipt": {"path": "receipts/root.json", "sha256": "sha256:..."}
}
~~~

`evidenceClass` is `harbor-native-development-summary` or
`harbor-native-development-projection`. `values` has exactly one entry and the
node pointer is `/values/<entry>`. The exact top-level schema prevents an
unrelated or holdout payload beside the development value.

The SHA-bound receipt also has an exact schema:

~~~json
{
  "schemaVersion": 1,
  "receiptClass": "harbor-owning-analyzer-receipt",
  "publicEvidence": true,
  "split": "development",
  "owningAnalyzerDigest": "sha256:...",
  "sourceArtifact": {
    "path": "source/root-summary.json",
    "sha256": "sha256:...",
    "artifactClass": "harbor-native-development-only-public-summary-artifact"
  },
  "sourceSelectors": {
    "evaluationStatus": "/developmentSummary/evaluationStatus",
    "evaluatedTaskSkillDigest": "/developmentSummary/evaluatedTaskSkillDigest",
    "comparisonProfileDigest": "/developmentSummary/comparisonProfileDigest",
    "taskSetDigest": "/developmentSummary/taskSetDigest",
    "utilityMetricDigest": "/developmentSummary/utilityMetricDigest",
    "values": "/developmentSummary/values",
    "hardGates": "/developmentSummary/hardGates"
  },
  "projection": {
    "evaluationStatus": "evaluable",
    "evaluatedTaskSkillDigest": "sha256:...",
    "comparisonProfileDigest": "sha256:...",
    "taskSetDigest": "sha256:...",
    "utilityMetricDigest": "sha256:...",
    "values": {"primaryUtility": 0.4},
    "hardGates": {"mechanical_qualification": 1.0}
  }
}
~~~

The source artifact must be strict JSON. The analyzer hashes receipt and source
artifact, resolves each required canonical `sourceSelectors` RFC 6901 pointer
against the artifact, and requires those seven extracted values to equal both
the receipt's `projection` and the projection document. A source digest that merely sits
beside co-signed numbers is insufficient. The artifact class is explicitly
development-only, and any nested key or string value containing `holdout` is
rejected. Accepted evidence has
`trustLevel: content-bound-development-projection-authority-unverified`. This
establishes exact byte and selector consistency, not author authenticity,
analyzer authority, semantic truth, or semantic absence of holdout content.

The authoritative observation identity is the contract digest of the source
artifact SHA-256, the canonical seven-selector mapping, the evaluated
task-skill digest, and the comparison-profile, task-set, and utility-metric
digests. Projection paths, projection digests, receipt paths, and receipt
digests are wrappers and do not create new observations. Different wrappers
over the same locator therefore cannot increase allocation, support, or `k`.

For `evaluable`, utility and every gate are finite. For `external-failure` or
`non-evaluable`, utility, expected value, and gates are null. Such nodes remain
in provenance but contribute no comparison or frontier score.

## Productivity and frontier

A parent-child edge is eligible only when both observations are evaluable,
both pass all gates, profile/task-set/metric digests match, the task-skill
digest changed, the child is not a counterfactual branch seed, and neither the
authoritative observation nor realized child task-skill digest repeats for the
parent. Productivity is the arithmetic mean of eligible child utility minus
parent utility. Every eligible edge reports its `producingMetaDigest`; every
exclusion keeps its reason.

A frontier row also needs `minimumProductivitySupport`. Its score is utility
weight times utility, plus productivity weight times mean productivity, plus
novelty weight times `1 / (1 + derivedSelectionCount)`. Order is descending
score, utility, productivity, novelty, then ascending node ID. Rankings are
partitioned by the exact comparison-profile, task-set, and utility-metric
identity. There is no global ranking or comparison between partitions. Each
partition is diagnostic and never authorizes selection or promotion.

## Frozen/adaptive parity

Each counterfactual arm uses this exact object:

~~~json
{
  "groupId": "meta-update-001",
  "arm": "adaptive-meta",
  "k": 2,
  "retrievalOrderedArtifactDigests": ["sha256:...", "sha256:..."],
  "generatorProfileDigest": "sha256:...",
  "proposerProfileDigest": "sha256:...",
  "generatorPromptDigest": "sha256:...",
  "proposerPromptDigest": "sha256:...",
  "generatorSeeds": [101, 102],
  "proposerSeeds": [201, 202],
  "downstreamEvaluationCohortDigest": "sha256:...",
  "downstreamEvaluationProfileDigest": "sha256:..."
}
~~~

A direct child of either arm binds this exact SHA-256 receipt through its node
`generationReceipt: {"path": "...", "sha256": "sha256:..."}`:

~~~json
{
  "schemaVersion": 1,
  "receiptClass": "harbor-metaskill-generation-receipt",
  "split": "development",
  "groupId": "meta-update-001",
  "arm": "adaptive-meta",
  "slotIndex": 0,
  "generatorSeed": 101,
  "proposerSeed": 201,
  "retrievalOrderedArtifactDigests": ["sha256:...", "sha256:..."],
  "generatorProfileDigest": "sha256:...",
  "proposerProfileDigest": "sha256:...",
  "generatorPromptDigest": "sha256:...",
  "proposerPromptDigest": "sha256:...",
  "parentNodeId": "adaptive",
  "parentTaskSkillDigest": "sha256:...",
  "parentMetaDigest": "sha256:...",
  "realizedChildTaskSkillDigest": "sha256:...",
  "childProducingMetaDigest": "sha256:..."
}
~~~

Every field must match the parent arm, its indexed generator/proposer seeds,
the ordered retrieval inputs, the parent node/task/inherited-meta state, the
child task, and the child's producing meta. Receipt bytes and
`(groupId, arm, slotIndex)` are each single-use. A complete arm has exactly the
slots `0..k-1`; missing slots remain diagnostic but make the pair incomparable.

A group has exactly one adaptive and one frozen arm. Apart from `arm`, both
share every field above, plus parent, task state, producing meta, seed evidence,
utility, identities, gates, and child allocation. The ordered retrieval list
binds set and order. Each seed list contains exactly `k` entries, and each
arm's allocation equals `k`. Seed and direct-child evidence match the explicit
downstream cohort and profile.

The frozen arm keeps its producing meta; the adaptive arm changes it. A result
is comparable only when each arm has all `k` generation slots, exactly `k`
authoritative observations, exactly `k` distinct realized child task-skill
digests, exactly `k` eligible observations, and frontier minimum support. The
report gives adaptive-minus-frozen productivity without causal or significance
claims and explains any slot, child, observation, or support shortfall.

## Deterministic report

The report has no timestamp, absolute path, model output, or mutable machine
metadata. It records source bindings, final chain digest, DAG edges, selection
events and derived counts, spent units separately from child allocations,
exclusions, productivity, parity checks, and the hard-gated frontier.

`decision` is `frontiers-ranked-within-identities` only with at least one
non-empty identity partition and the required number of complete
counterfactual pairs. Otherwise it is `insufficient-evidence`. The report sets
`configuredHoldoutInput: false` and
`semanticHoldoutAbsenceVerified: false`; it never claims that scanning names
proves semantic absence. Execution, generation, cross-identity ranking,
selection, promotion, reproduction, and causal-claim permissions remain false.
