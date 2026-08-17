---
name: harbor-metaskill-evolution
description: Replay and audit append-only development ledgers of task-skill branches and typed Analyzer, Retriever, Allocator, Proposer, and Evolver meta-policy snapshots from SHA-bound Harbor-native projections. Use when Codex needs to verify lineage, source-bound utility, meta-productivity, frozen-meta parity, fixed budgets, or identity-partitioned frontiers without running Harbor, calling a model, generating candidates, selecting winners, or configuring holdout input; producer authority and semantic holdout absence remain unverified.
---

# Harbor Meta-Skill Evolution

Analyze a completed development ledger deterministically. Treat this bundle as
an analysis-only and replay-only adapter, not as an implementation or
reproduction of MetaSkill-Evolve.

## Boundaries

- Do not run Harbor or calculate a Harbor reward.
- Do not call a model, generate or mutate a candidate, or edit a task skill.
- Do not select, promote, deploy, or overwrite any candidate.
- Do not open raw, private, or holdout evidence.
- Do not retry failures. Preserve external failures as non-evaluable records.
- Do not claim paper reproduction, causal attribution, or statistical
  significance.

The script uses only the Python 3.12 standard library. It consumes projections
declared sanitized, public, and development-only, bound to an owning-analyzer
receipt and a SHA-256 source artifact. It never accepts a detached numeric
utility, but it does not authenticate the producer's semantic declarations.

## Workflow

1. Read [references/ledger-contract.md](references/ledger-contract.md) fully.
2. Confirm the ledger and all evidence are copies or digest-sealed
   publications. Never repair or overwrite prior evidence in place.
3. Check that every projection has a matching source receipt, a
   development-only public JSON source artifact, and exact source selectors
   that reproduce the evaluated task-skill digest, status, comparison
   identities, value, and gates. Reject self-asserted or merely co-signed
   projections without this binding.
4. Check that every meta-changing node has a frozen/adaptive pair with explicit
   parity for `k`, ordered retrieval artifacts, generator and proposer profiles,
   prompts, seeds, child allocation, and downstream evaluation identities.
   Require every direct child to bind a unique generation receipt for its exact
   arm, slot, seeds, parent task/meta state, producing meta, and realized task.
5. Create a new deterministic report:

   ~~~bash
   python scripts/analyze_metaskill_ledger.py path/to/ledger.jsonl --output path/to/report.json
   ~~~

6. Inspect exclusions, derived selection counts, budget fields, productivity,
   counterfactual completeness, trust level, and the frontier. A frontier is a
   diagnostic ordering only.
7. Recompute before relying on a stored report:

   ~~~bash
   python scripts/analyze_metaskill_ledger.py path/to/ledger.jsonl --verify-report path/to/report.json
   ~~~

Resolve the script path from this copied skill directory. The script refuses
to overwrite an existing report.

## Interpretation Rules

- The ledger hash chain proves replay integrity, not author identity.
- `content-bound-development-projection-authority-unverified` proves byte and
  selector consistency only. It does not prove author identity, analyzer
  authority, semantic correctness, or semantic absence of holdout content.
- Derive observation identity from source artifact bytes, canonical source
  selectors, the evaluated task skill, and comparison identities. Do not count
  projection or receipt wrappers as independent observations.
- Selection counts come only from hash-chained selection events. Never add a
  count to a node record.
- Apply hard gates and comparison identities before productivity. Partition
  frontier rankings by comparison profile, task set, and utility metric; never
  rank across those identities.
- Keep spent node units separate from declared child allocations; allocations
  are capacity, not evidence of spend.
- Attribute each eligible parent-child observation to the child's
  `producingMetaDigest`.
- Treat non-evaluable observations as exclusions, never as zero or a penalty.
- Exclude unchanged task-skill edges, adaptive/frozen branch-seed structural
  edges, and repeated realized child skill digests from productivity.
- Report a frozen/adaptive comparison only after both arms have exactly `k`
  unique generation slots, observations, realized child skills, and eligible
  edges under the bound downstream cohort and profile.

`frontiers-ranked-within-identities` means only that at least one within-identity
ranking and the configured counterfactual requirement are complete.
`insufficient-evidence` means no ranking decision is available. Neither value
authorizes cross-identity ranking, selection, or promotion.

## Validation

After changing this copied bundle, run:

~~~bash
python scripts/analyze_metaskill_ledger.py --help
node --test test/harbor-metaskill-evolution.test.js
~~~

Also run the repository-wide checks required by the host repository. Keep this
bundle atomic: copy `SKILL.md`, `agents/`, `references/`, and `scripts/`
together.
