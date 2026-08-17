# Harbor Next-Skill Contract and Evidence Comparison

Date: 2026-07-20

Study: `harbor-next-skill-comparison-20260720`

## Outcome

This append-only snapshot records two distinct, digest-sealed workflow
contracts, but it does not claim that either contract improves skill quality:

- `harbor-realize-skill-candidate` occupies the candidate-realization boundary.
  Its core turns a mutation proposal and a digest-frozen parent into an
  isolated, auditable candidate bundle plus mutation, validation, manifest,
  and operator-realization receipts. The core does not run Harbor, score,
  select, promote, or install; trusted validation commands are unsandboxed and
  their external effects remain unverified.
- `harbor-metaskill-evolution` occupies the higher-order replay boundary. Its
  first version is intended to audit a hash-chained, branch-local ledger for
  five typed policy roles and deterministically report supported productivity,
  gates, frontiers, novelty, budget, and frozen-meta comparisons. It must not
  run Harbor or models, score raw trials, author candidates, or promote them.

Both four-file bundles are sealed by the deterministic tree digest recorded in
[`protocol.json`](protocol.json). The repository currently has no comparable
tracked execution of either new bundle. Their causal gain and the metaskill
bundle's meta-productivity are therefore **not identifiable**.

The comparison reuses only tracked public development or discovery-smoke
evidence. It does not import a holdout metric, open a task, generate a
candidate, select a winner, invoke Harbor, or invoke a model.

## Lifecycle comparison

| Bundle | Primary responsibility | Candidate output | Selection authority | Evidence in this snapshot |
| --- | --- | --- | --- | --- |
| `harbor-run-results` | Execute, validate, compare, and report native Harbor results | No | Reports comparisons; does not mutate | Maintained contract |
| `harbor-resume-external-failures` | Recover only independently proven external failures | No | No semantic reselection | Maintained contract |
| `harbor-realize-skill-candidate` | Realize one proposed mutation as an isolated candidate | Yes | None | Digest-sealed contract; no execution result |
| `harbor-population-search` | Scalar population evaluation and development selection | References candidate bundles | Yes | Descriptive development observation |
| `harbor-trace-distillation` | Convert supported trace lessons into a candidate and gate it | Yes | Yes | Descriptive development observation |
| `harbor-reflective-pareto-search` | Preserve and compare complementary case-level candidates | Yes | Yes | Descriptive development observation |
| `harbor-operator-coevolution` | Attribute child deltas to mutation operators over generations | Yes | Yes | One-generation child observation; operator credit not identifiable |
| `harbor-evolve-skill` | Run an integrated GEPA reflective Pareto workflow for `SKILL.md` | Yes | Yes | Maintained contract; no comparable result imported here |
| `harbor-metaskill-evolution` | Replay and audit typed meta-policy lineage and productivity | No | Reports an analysis frontier; no promotion | Digest-sealed contract; no replay result; meta-productivity not identifiable |

The machine-readable version of this matrix, including claim maturity and
non-goals, is in
[`results/20260720/evidence-ledger.json`](results/20260720/evidence-ledger.json).
Each digest-sealed owning `SKILL.md` remains authoritative for its bundle.

## What the tracked evidence says

The 2026-07-16 Harbor evolution comparison supplies descriptive development
observations for four maintained strategies. The selected development mean and
delta were:

| Strategy | Selected development mean | Observed delta | Improved / regressed / tied subjects | Selected children |
| --- | ---: | ---: | ---: | ---: |
| Population search | 0.8643255 | +0.0500000 | 1 / 1 / 1 | 1 |
| Trace distillation | 0.9809922 | +0.1666667 | 2 / 1 / 0 | 2 |
| Reflective Pareto search | 0.9491740 | +0.1348485 | 2 / 1 / 0 | 2 |
| Operator coevolution | 0.9309922 | +0.1166667 | 1 / 2 / 0 | 1 |

These are repository observations, not paper-reported figures and not a replay
performed by this study. The historical design used three subjects, a thin
development cohort, and one submitted child per strategy and subject. It
cannot support a universal ranking or causal effect estimate. In particular,
the historical operator analyzer correctly refused to infer coevolution from
one evaluated operator per subject.

The knowledge-consult evolution evidence is even more restrictive:

- The tracked q003 pilot is `complete-no-winner-exploratory`, explicitly
  disallows causal comparison and strategy ranking, and contains four evaluable
  trials among eight candidate trials.
- The generation-005 ledger records an unevaluated development child and a
  `not-evaluated` promotion decision.
- Generation 005 also tracks a candidate lock, candidate manifest, and
  operator-realization receipt that bind parent, candidate, mutation lineage,
  and zero-call validation metadata. These are ad hoc historical primitives
  compatible with the new realization boundary; they cannot retroactively
  prove that `harbor-realize-skill-candidate` executed.
- The generation-006 protocol is prospective: its runtime was not materialized
  and it recorded zero Harbor or model calls at seal time.

Consequently, prior tracked evidence cannot estimate realization reliability,
metaskill meta-productivity, or the causal gain of either new bundle. No score
is synthesized for those questions.

Compatibility references are deliberately separate from performance
observations in the ledger. The MetaSkill row points to the one-generation
operator observation and the prospective generation-006 contract only as
mechanism-adjacent history; neither identifies meta-productivity.

## Paper context versus repository evidence

The survey `2607.13104v1`, *Self-Improvements in Modern Agentic Systems: A
Survey*, and `2607.05297v1`, *MetaSkill-Evolve*, motivate the separation between
object-level candidate realization and higher-order procedure evolution. They
are design context only in this snapshot. No numeric paper result is copied
into the evidence ledger, and no paper result is labeled as a repository
replay.

Any later empirical comparison must predeclare an object-level quality metric
and a meta-productivity metric, bind parent/operator/candidate lineage, charge
candidate-authoring and evaluation calls, run repeated attributable
generations, and keep selection evidence separate from an untouched promotion
cohort.

## Evidence boundary

The frozen protocol is [`protocol.json`](protocol.json). The deterministic
[`study lock`](locks/study-lock.json) binds the exact protocol and evidence
ledger bytes. Historical sources are tracked files with exact SHA-256 seals.
Machine-readable observations select only development or discovery-smoke JSON
fields. Historical files may contain other fields, but those fields are not
imported into this result.

Maintained `tracked-skill-contract` sources may evolve after this snapshot. The
verifier accepts such a working-tree change only when Git history still
contains the exact historical file bytes named by the frozen SHA-256. All
result, protocol, lock, and other historical evidence paths must continue to
match their sealed bytes in the current tree; this exception never rewrites or
rebinds the 2026-07-20 result.

This directory is a new study; it does not modify either prior evaluation.
After publication, corrections must be written as a new dated result and must
record explicit provenance rather than overwriting this snapshot.

## Validation

Run the deterministic verifier from the repository root:

```bash
node evaluations/harbor-next-skill-comparison/scripts/verify-study.mjs
node --test test/harbor-next-skill-comparison.test.js
```

To recompute the two read-only contract tree digests:

```bash
node evaluations/harbor-next-skill-comparison/scripts/verify-study.mjs --print-new-skill-digests
```

The second command does not edit a contract. Its deterministic output must
match the file counts, byte counts, and tree digests sealed in the protocol.
