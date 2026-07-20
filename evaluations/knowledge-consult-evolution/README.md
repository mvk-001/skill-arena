# Knowledge Consult Evolution Study

This versioned study evaluates four skill-evolution strategies against the
frozen `graphrag-papers-40` dataset from the sibling `knowledge` repository.
It uses only the `legacy` family in `consult-only` mode. The source repository
is an immutable input: all generated tasks, skill copies, candidates, and run
artifacts belong under Skill Arena's `.tmp/knowledge-consult-evolution` tree.

The authoritative machine-readable contract is [`protocol.json`](protocol.json).
It pins knowledge commit `25170692c9e211b7bf719f07d3243cdaf409c88b`, every
registry input used by this dataset, the reference bundle, the production
grader, the baseline `consult-semantic-okf` skill, and the generated task tree.
The compatible generated tree has 529 files and SHA-256
`b99f247213febab9ba362f23eb3f094a19f01febc9a8ed1fb3cacd5c4491cf9c`.

The first live qualification artifact is
[`results/q003-qualification-pilot.md`](results/q003-qualification-pilot.md).
It intentionally reports no winner and does not claim a strategy ranking or a
causal candidate comparison. The historical pilot mixed three installed-skill
identity modes: candidates 00-04 used the basename `skill`, candidate 05 used
its candidate ID, and only candidates 06-07 used the canonical logical name.
Every row is therefore exploratory and non-promotable. Its purpose is to
validate the frozen gates and turn public Harbor traces into generic evolver
repairs before a new, canonical-identity study spends the full budget.

The tracked
[`results/q003-evidence.lock.json`](results/q003-evidence.lock.json) is the
sanitized source for the published JSON and Markdown. It preserves the observed
profile, installed identity mode, candidate tree digest, aggregate metrics, and
SHA-256 locks for every native JobConfig, job result, trial result, diagnostic,
reward, and normalized analyzer result. It excludes credentials, agent
reasoning, answer text, qrel identities, hidden rubrics, oracle data, and private
verifier input. Raw native jobs remain local and ignored because they contain
machine-specific paths and execution metadata.

## External target boundary

Each Harbor evolution strategy remains a self-contained, generic skill bundle.
Its own `SKILL.md`, executable, references, configuration validation, artifact
parsing, selection state, and holdout gate travel together. The target skill
and benchmark do not: this study supplies the copied target bundle and native
Harbor JobConfig as external paths. No evolver may embed
`consult-semantic-okf`, `graphrag-papers-40`, hidden answers, or dataset-specific
mutation rules. The same four evolvers must therefore accept another target
skill and Harbor dataset without changing their bundles.

Evolution agents create candidate copies outside the evolver directory, record
their parent and hypothesis, execute the externally supplied Harbor job, and
feed only native artifacts back into the generic strategy. This preserves the
atomic portability of each evolver while keeping ownership of the target skill
with its caller.

Every new run must stage each candidate under the exact portable frontmatter
name `consult-semantic-okf`. A candidate installed under a generic or
generation-specific basename is analyze-only evidence and cannot enter smoke,
development selection, holdout, or promotion.

## Benchmark split

The 40 tasks are frozen before any edit:

| Stage | Count | Use |
| --- | ---: | --- |
| Discovery | 24 | Candidate feedback, mutation, ranking, and trace analysis |
| Holdout | 6 | One final promotion release only |
| Hard | 10 | Same final release; evidence-first generalization audit |

The qualification smoke uses `q003`, `q007`, `q018`, `q024`, and `q030`.
Smoke results are not reused as full-development evidence. Holdout and hard
tasks remain verifier-only until every strategy has frozen its development
decision and candidate digest. There is no post-release repair.

The existing mechanical grader verifies response shape, ledger identities,
retrieval quality, and evidence anchors. For q001-q030, semantic correctness
still requires a separate blinded or documented manual review. Mechanical
reward must not be presented as claim entailment.

## Frozen evaluation profile

The study does not leave promotion thresholds to each invocation. It freezes
Harbor 0.18.0, Pi 0.73.1, `openai-codex/gpt-5.3-codex-spark` with high
thinking, one attempt, no retry, `reward` as the primary metric, and a positive
pass threshold of `0.000001`. Every task must independently report all three
non-compensating gates at `1`: `evidence_contract_gate`,
`minimum_document_gate`, and `mechanical_qualification_gate`.

The five-task smoke passes only when all five tasks are evaluable, meet the
primary pass threshold, and meet every required reward. The development winner
must have pass rate 1.0 before holdout can open. Provider, authentication,
environment, evaluator, infrastructure, and missing-primary-reward outcomes
remain unavailable (`null`), never semantic zero. Final promotion also requires
disjoint holdout/hard tasks, no errors or regressions, complete gates, and
non-negative mean gain. These values are authoritative in
`protocol.json.evaluationProfile` and apply to all four strategy adapters.

### Selective external resume policy

Future runs may use the external strategy
`harbor-resume-external-failures`; this is study orchestration, not a fifth
evolution skill and not a Harbor built-in retry. Harbor retries remain `0`.
The orchestrator may start at most one external retry for an original trial,
and only after a verifier-owned diagnostic contains an exact allowlisted signal,
or Harbor records an exact allowlisted exception type or code, identifying an
authentication, environment, evaluator, infrastructure, or provider failure.
Unstructured error text and a missing reward are never sufficient.
Authentication and environment failures additionally require a locked
remediation attestation; evaluator, infrastructure, and provider failures do not.

The retry requires the canonical installed skill identity; locked task,
candidate, profile, original-job, and retry-job provenance; and a new immutable
Harbor job in a new directory. Authentication and environment retries also lock
their `remediationType`, real non-linked `evidencePath`, exact
`remediationEvidenceSha256`, and derived `remediationAttestationDigest`, and must
pass a live preflight. Evidence contents are not copied. The retry may not mutate
or reuse the original job.
Merge is `first-evaluable-no-best-of`: use the first evaluable result in trial
order and never choose between multiple evaluable attempts by reward, gate,
utility, latency, or any other quality signal.

All mutating modes use one sibling O_EXCL writer lock; an active or stale lock
fails closed for manual audit. Before creating an attempt directory, staging a
skill, writing a retry config, or calling Harbor, the orchestrator atomically
persists a sealed reservation. Reserved, setup-failed, and execution-failed
attempts consume the fixed cap. A retry sequence stops at its first evaluable
result. Repeating an empty analyze-only import against already complete outputs
is verified and byte-idempotent.

The orchestrator publishes a Harbor-compatible `effective-job` only after every
source trial has either its trusted original semantic result or its first
evaluable retry. It builds the complete view in a fresh temporary directory,
validates it, and publishes it atomically as a new directory. Its
`resume-manifest.json` seals source lineage and every source and destination
checksum. An incomplete view is never published. Existing evolvers consume only
that manifested directory through their ordinary `analyze-only` job input; this
does not add another selection opportunity and cannot change the no-best-of
rule.

The absolute denylist is context length, context budget, agent timeout, token
budget, tool budget, semantic reward, required-reward gate failure, invalid
response contract, and ambiguous or conflicting failure attestation. A denied
outcome cannot become retryable through a second label, manual override, or
remediation claim.

An exact provider rate-limit, HTTP 5xx, overloaded, provider-unavailable, or
service-unavailable signal (or its exact allowlisted exception type) may be
eligible because it is external and transient. A generic `provider` label alone
is ambiguous. Provider classification never overrides the absolute denylist:
context-length and context-budget failures remain ineligible even when their
failure domain is `provider`.

The historical q003 pilot used Harbor built-in retries `0` and no external
retry. Its context-limit outcomes and candidate 07 agent timeout are absolutely
ineligible under this policy; its semantic/gate/invalid-contract outcomes are
also not external-resume evidence. The policy is future-facing and is excluded
from the immutable q003 observed-profile attestation.

## Minimum study budgets

These are finite minimum budgets for this study, not changes to the global
defaults of any strategy skill.

| Strategy | Submitted evolution work | Full development accounting |
| --- | --- | ---: |
| Population search | Generation 0 has baseline + 4 children; retain 2; generation 1 reevaluates those 2 with 4 new offspring | 8 unique children, 9 unique bundles, 11 candidate-generation evaluations, 264 task attempts |
| Trace distillation | Analyze all 24 frozen baseline traces independently; a promoted patch needs at least 2 supporting trials and 2 distinct task checksums; submit 1 consolidated child | 48 task attempts for baseline + consolidated child |
| Reflective Pareto search | Evaluate baseline + 4 initial candidates on all cases; retain every non-dominated candidate; evaluate exactly 1 merge with at most 2 parents | 6 bundles including merge, 144 task attempts; no artificial archive cap |
| Operator coevolution | 2 active operator slots, 2 children per operator per generation, 2 generations, at least 2 trials per operator identity | 8 children + baseline, 216 task attempts |

Every unique bundle also receives the five-task smoke before the full
development run. The fully qualified smoke accounting is 45, 10, 30, and 45
task attempts respectively. One final release evaluates a shared baseline and
at most one selected bundle per strategy on the 6 holdout plus 10 hard tasks,
for at most 80 final task attempts with baseline reuse.

### Trace-distillation development binding

Trace distillation uses config schema 2 of `harbor-trace-distillation`. The 24
baseline discovery trials remain the only proposal evidence. After
consolidation, the runner freezes the child digest and evaluates that candidate
on the exact same 24 task/checksum/profile/replay cells through
`development.candidateArtifacts` or `development.candidateJobConfigs`, with
`minimumPassRate: 1`. Those 24 candidate trials must be genuinely new attempts;
shared or copied job directories, trial identities, result/lock paths, or
equivalent attempt evidence fail closed even when the child equals the
baseline. Candidate-development normalization is metric-only and cannot feed
another patch in the same run. Both 24-trial sides use complete root JobLocks
whose retry policy matches the JobConfig, fixes Harbor built-in retries at
zero, and yields matching retry-policy digests. The 6 holdout and 10 hard tasks
are not opened unless this development gate passes. Once opened, both final
sides use the same complete zero-retry JobConfig/JobLock/stats contract and
must remain disjoint from both 24-trial sides. This clarifies how the existing
48-attempt protocol budget maps to the generic evolver; it does not revise any
historical result, lock, or protocol value.

## Reproduce and verify

From the Skill Arena repository root:

```powershell
node evaluations/knowledge-consult-evolution/scripts/prepare-study.js prepare
node evaluations/knowledge-consult-evolution/scripts/prepare-study.js verify
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify
```

Use `--knowledge-root <path>` only when the sibling checkout is elsewhere, and
`--python <executable>` when `python` is not the desired interpreter. The
output path may be overridden with `--output`, but the script rejects any path
outside this repository's `.tmp` directory.

`prepare` performs the following operations:

1. checks the knowledge commit, pinned files, source trees, dataset registry,
   cohorts, and exact 24/6/10 counts;
2. runs the external task generator with `PYTHONDONTWRITEBYTECODE=1` and an
   explicit Skill Arena `.tmp` output;
3. copies the baseline skill into `.tmp`, excluding bytecode caches;
4. runs the external task validator, its deterministic regeneration check,
   and all 40 structural qualification oracles;
5. writes `.tmp/.../prepared/receipt.json` and compares it byte-for-structure
   with the tracked [`receipt.lock.json`](receipt.lock.json); and
6. proves the knowledge Git working-tree status did not change.

`verify` repeats all source checks, deterministic task regeneration, oracles,
hashes, and both receipt comparisons without replacing the prepared tree.

The q003 publisher rebuilds the published result and report deterministically
from the tracked sanitized lock. When the ignored native jobs used for the pilot
are still present, also verify every raw checksum and projected metric. This
parses the locked final analyzer `run.json` and requires its null winner,
non-promoted `not-eligible` holdout, survivors, repair parents, best-evolvable
candidate, required-reward thresholds, and development pass-rate gates to match
the sanitized lock semantically; a matching file hash alone is insufficient:

```powershell
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify-native
```

The focal study test uses a synthetic analyzer result and independently mutates
each decision family to prove that semantic drift is rejected. It performs no
model calls.

Use `render` only after intentionally updating and reviewing the evidence lock:

```powershell
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js render
```

This reproduces the publication, not a historical agent trajectory. Exact live
reruns require candidate bundles matching the locked tree digests and the same
external dataset/profile. The full comparison must use fresh canonical-name
runs; the mixed-identity q003 pilot is never promotion evidence.

Do not give candidate authors or mutation operators any task `tests/`, oracle
responses, qrels, semantic rubrics, hard ground truth, or authority evidence.
Only the public Harbor instruction, the copied consult skill, and the exact
processed bundle mounted read-only at `/knowledge` belong in a candidate run.
The preparation tree contains every cohort for orchestrator verification, so
this boundary is enforced by path policy and native JobConfig mounts rather
than filesystem ACLs: an evaluated container receives one current-cohort task
directory and never receives the Skill Arena host workspace.
