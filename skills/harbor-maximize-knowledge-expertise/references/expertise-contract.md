# Knowledge Expertise Planning Contract

## Contents

1. Purpose and authority
2. Campaign schema
3. Expertise dimensions
4. Failure modes and operators
5. Evaluation handoff
6. Output and interpretation

## Purpose and authority

The planner converts caller-reviewed, development-only gap classifications into
exact mutation instructions. It verifies target and evidence identity, but it
does not verify the semantic truth of a gap classification. It never reads
qrels, answers, hidden rubrics, private verifier data, model reasoning, or
holdout evidence.

The output is a mutation portfolio, not a score or selection. Native Harbor
jobs remain the only evaluation authority. Candidate realization, Pareto
selection, operator credit, and holdout promotion remain owned by their
separate atomic skills.

## Campaign schema

Use one strict JSON object:

~~~json
{
  "schemaVersion": 1,
  "campaign": {
    "id": "knowledge-expert-generation-001",
    "targetSkill": "../skills/example-expert",
    "expectedTargetTreeSha256": "sha256:<64 lowercase hex>",
    "outputPath": "plans/generation-001.json",
    "developmentEvidence": [
      {
        "id": "development-archive",
        "role": "development",
        "path": "../evidence/archive.json",
        "sha256": "sha256:<64 lowercase hex>",
        "sanitized": true
      }
    ],
    "expertiseDimensions": [
      {
        "id": "retrieval-breadth",
        "objective": "maximize",
        "priority": 5,
        "metricKeys": ["recall_at_10"]
      },
      {
        "id": "ranking-discrimination",
        "objective": "maximize",
        "priority": 5,
        "metricKeys": ["ndcg_at_10", "mrr_at_10"]
      },
      {
        "id": "evidence-fidelity",
        "objective": "hard-gate",
        "priority": 5,
        "metricKeys": ["evidence_contract_gate"]
      },
      {
        "id": "robustness",
        "objective": "hard-gate",
        "priority": 5,
        "metricKeys": ["case_non_regression"]
      }
    ],
    "gaps": [
      {
        "id": "late-authority",
        "failureMode": "relevant-evidence-late",
        "severity": 0.8,
        "dimensionIds": ["ranking-discrimination"],
        "evidenceIds": ["development-archive"],
        "caseIds": ["opaque-case-01", "opaque-case-07"]
      }
    ],
    "portfolio": {
      "minimumOperators": 3,
      "maximumOperators": 6,
      "includeConservative": true
    },
    "evaluation": {
      "developmentSplitId": "development-v1",
      "selectionMechanism": "harbor-reflective-pareto-search",
      "requiredRewardKeys": [
        "evidence_contract_gate",
        "mechanical_qualification_gate"
      ],
      "allowCaseRegressions": false,
      "minimumOperatorTrials": 2,
      "holdout": {
        "status": "unavailable",
        "splitId": null
      }
    }
  }
}
~~~

All paths resolve from the campaign JSON. Unknown keys fail closed. The target
must be a regular, self-contained skill bundle with exact frontmatter name.
Every evidence file must be regular, sanitized, role `development`, and
digest-matched. `sanitized: true` is a caller assertion retained as an
unverified boundary; it is not proof that the producer removed private or
holdout content.

The output path must be outside the target bundle and absent before `plan`.
`verify` refuses drift in the target, evidence, config, or stored plan.

## Expertise dimensions

Declare at least three distinct dimensions and include both
`evidence-fidelity` and `robustness`. Use only these IDs:

| Dimension | Meaning |
| --- | --- |
| `knowledge-coverage` | The immutable snapshot contains and exposes the needed domain surface. |
| `retrieval-breadth` | Relevant independent sources enter the bounded result set. |
| `ranking-discrimination` | Strong authoritative evidence appears early and in useful order. |
| `evidence-fidelity` | Every claim or hit preserves exact source and locator identity. |
| `synthesis-completeness` | The response covers requested comparison arms without unsupported fill. |
| `calibration` | The skill distinguishes support, inference, uncertainty, and abstention. |
| `robustness` | Improvements do not depend on one case or erase complementary strengths. |
| `efficiency` | Expertise stays within declared latency, token, and tool budgets. |

`objective` is `maximize`, `minimize`, or `hard-gate`. Priority is an integer
from 1 through 5. `metricKeys` are labels owned by the external evaluator; the
planner stores but never reads their values.

## Failure modes and operators

Use opaque case IDs without whitespace. Never place task text, answers, paper
IDs, qrels, or hidden labels in a gap.

| Failure mode | Primary operator |
| --- | --- |
| `knowledge-surface-gap` | Derive additional query-independent indexes from the immutable snapshot. |
| `relevant-evidence-missing` | Expand bounded coverage without importing external facts. |
| `relevant-evidence-late` | Calibrate early ranking while preserving result budget. |
| `query-intent-dilution` | Separate the full intent anchor from complementary facets. |
| `ranking-disagreement` | Gate rank fusion with answer-independent agreement and margin signals. |
| `evidence-identity-risk` | Make evidence copying and identity checks fail closed. |
| `answer-coverage-gap` | Drive synthesis from verified comparison-arm coverage. |
| `abstention-calibration-gap` | Add explicit support and abstention thresholds. |
| `latency-budget-pressure` | Route expensive signals only when cheap confidence is insufficient. |
| `case-regression` | Preserve an incumbent branch and gate risky rank changes. |
| `response-contract-failure` | Finalize and validate the public response deterministically. |

The script aggregates repeated failure modes, orders them by maximum severity,
and fills any remaining minimum portfolio slots from uncovered high-priority
dimensions. `includeConservative: true` always adds the regression-preserving
operator. Each instruction is fixed in code and carries only generic gap,
dimension, and evidence identifiers as metadata.

## Evaluation handoff

`selectionMechanism` is one of:

- `harbor-reflective-pareto-search` for complementary case strengths; or
- `harbor-operator-coevolution` after enough independently realized children
  exist to attribute parent-to-child operator credit.

Keep `minimumOperatorTrials` at least 2. The planner does not create Harbor
configs or jobs. The caller must:

1. realize one complete candidate per exact operator instruction;
2. run fresh development jobs with identical task and runtime profiles;
3. enforce every declared required reward as a non-compensating gate;
4. preserve the incumbent and complementary candidates;
5. use no development case regression unless explicitly frozen otherwise; and
6. open only an untouched, frozen holdout after development selection.

Holdout status:

- `frozen-unopened` requires a non-empty split ID and permits only a future,
  still-unverified promotion attempt;
- `unavailable` requires `splitId: null`, makes promotion ineligible, and
  limits claims to retrospective development evidence.

No holdout path, digest, task, score, or diagnostic belongs in this config.

## Output and interpretation

The output contains exact target and evidence bindings, the normalized
dimension and gap declarations, the selected operator portfolio, evaluation
handoff, holdout state, and boundaries. It records no metric values and performs
zero Harbor or model calls.

`planned-fitness-unverified` means only that a deterministic portfolio exists.
It does not mean any candidate was created or improved. `promotionEligible`
describes whether an untouched holdout was declared, not whether it passed.
Only the owning Harbor evaluator and holdout gate may establish those facts.
