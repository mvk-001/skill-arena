# ADR: Explicit Development-Only Operator Chains

Date: 2026-07-19

## Status

Accepted

## Context

The phase-separated operator workflow intentionally made every development-only
receipt non-chainable. That protected holdout from diagnostic repair output and
from development results with an incomplete operator population. It also left
no valid route for a frozen study that requires repeated operator credit across
multiple development generations before its one final holdout release: running
`full` in the first generation opens holdout too early, while running
`development` produces a log that the next generation must reject.

The knowledge consultation study requires two operator-coevolution generations
before final release. Its historical meta-evolution used terminal development
and report-only receipts. Those artifacts must remain diagnostic, non-chainable,
and unchanged; they must not be retroactively reclassified as evolution
predecessors.

## Decision

- Keep `full` as the default development-then-holdout workflow.
- Keep `--phase development` as a terminal receipt with
  `chainEligible: false`.
- Add the explicit `--phase development-chain` mode. Live execution and
  analyze-only consume development jobs only. Dry-run validates the declared
  plan without executing jobs; doctor performs only development-side
  preflights. None of these development-chain operations resolves, validates,
  loads, or executes a holdout reference target.
- Complete `development-chain` only when development selects a qualified
  candidate and enough established, credit-eligible operators exist to produce
  a complete normal breeding plan. Seal that generation's winner separately;
  do not require the raw holdout candidate ID to predict it. Complementary
  repair, an all-unqualified generation, or an insufficient operator population
  fails closed in this mode.
- Seal successful output with `phase: development`,
  `requestedPhase: development-chain`, `diagnosticOnly: false`,
  `chainEligible: true`, `holdoutOpened: false`, and `promotion: false`.
  The unopened holdout projection remains a non-promoting holdout artifact; the
  sealed generation log is the predecessor contract.
- Emit explicit `phase: full`, `requestedPhase: full`,
  `diagnosticOnly: false`, `chainEligible: true`, `holdoutOpened: true`, and
  Boolean `promotion` fields on every newly produced full log. Continue to
  accept marker-free full logs only through the historical profile shape.
- Seal `holdoutUsedForDevelopmentSelection: false` in every newly phased log
  and require that value from an explicit predecessor.
- Seal an opaque holdout declaration and digest in every successful
  development-chain profile. Schema version 2 binds the baseline ID and
  reference, an ID-free candidate-slot `jobConfig`/`jobDirectory` reference
  after lexical normalization relative to the config, and the normalized
  promotion policy. It deliberately excludes the eventual candidate ID.
  Construct it without resolving symlinks, requiring path existence, or
  reading either referenced target.
- Accept a development-only predecessor only when its seal, profile digest,
  selected candidate, breeding plan, false promotion state, and closed holdout
  state agree with the explicit development-chain contract. Require the next
  generation to present the exact sealed opaque declaration before resolving
  holdout; declared paths may be populated later but cannot be substituted.
- Require an explicit predecessor's selected candidate to equal the first
  qualified survivor and its ranking digest. Require a normal, non-diagnostic,
  chain-eligible breeding plan whose operator count equals its operator list.
- Treat every normal breeding-plan instruction as an exact sealed realization,
  including mutation and crossover entries. Record an `exact-text-v1`
  instruction contract and digest on each entry, and require the successor's
  operator text to match exactly in addition to matching ID, origin, and parent
  lineage.
- Seal a canonical development-evidence identity projection and digest in each
  new generation log. Bind candidate attribution and skill digest; root job
  directory, UUID, result path/digest, config digest, and lock digest; and every
  trial UUID, result path/digest, and task identity.
- Require every successor generated child to be disjoint from all predecessor
  evidence across job directory/UUID/result identity and trial UUID/result
  identity. Permit reuse only for an unattributed candidate with the exact same
  candidate ID, skill digest, and complete freshness-identity set when its
  predecessor was an unattributed root or exactly `selectedDevelopment`.
  Second-place and lower survivors do not qualify. Reject partial/hybrid reuse;
  a fully disjoint fresh reevaluation is also valid. This exception never
  applies to a currently attributed child.
- Validate the predecessor's development profile and operator lineage before a
  successor full run resolves holdout. A development-chain predecessor compares
  by the frozen development projection because it has no observed holdout lock;
  the successor full run seals the holdout lock after its own development
  selection. Full-to-full chaining continues to require the exact full profile.
- In `full`, after current development selects its winner, require the raw
  holdout candidate ID to equal that winner before resolving the frozen
  candidate slot. Seal `holdoutReleaseBinding` with the selected ID and skill
  digest, declaration and slot digests, and observed candidate holdout
  job/result/trial identity. Development logs must omit this release binding;
  full predecessors must validate it against their selected development record,
  declaration, and holdout promotion evidence.
- Reject candidate-bound declaration schema version 1 as a predecessor for the
  deferred-release workflow. Its historical shape remains inspectable, but it
  cannot safely migrate to the ID-free candidate-slot contract.
- Preserve parsing and historical-seal verification for full logs that predate
  explicit phase and chain fields. Do not grant that compatibility to phased
  development logs that omit the new explicit marker. Fail closed when an old
  log lacks the job/trial identity projection needed to prove a successor's
  generated-child freshness; such a log remains readable but cannot seed a new
  generation.

## Consequences

- Generation zero may run `development-chain`, generation one may run `full`,
  and the study obtains two development generations with one holdout release at
  the end of the second generation. Generation one may select and release a
  candidate ID that did not win generation zero while reusing the same frozen
  holdout cohort slot and promotion policy.
- Invalid predecessor identity, lineage, seal, or development-profile drift is
  rejected before any holdout path is opened.
- Reusing the same generated-child job, copying its result tree to another
  directory, replaying its trial UUIDs/result digests, or changing planned
  operator text under the same ID is rejected before holdout is opened. A
  rebuilt job with new root/trial identities and unchanged frozen evaluation
  profile remains valid.
- Holdout job paths can remain nonexistent throughout development-chain, while
  their future cohort identity is frozen. A baseline ID/reference,
  candidate-slot path, or promotion-policy change fails before either old or
  replacement target is inspected; the eventual candidate ID remains unbound
  until final full development selects it.
- Plain development, complementary repair, report-only analysis, and historical
  knowledge meta-evolution receipts remain terminal and non-chainable.
- This decision narrows only the earlier statement that every development-only
  output is a receipt. The safe default and all diagnostic branches remain
  unchanged.
