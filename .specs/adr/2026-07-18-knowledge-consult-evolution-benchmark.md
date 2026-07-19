# ADR: Knowledge Consultation Dataset for Harbor Evolution

Date: 2026-07-18

## Status

Accepted

## Context

The first Harbor-native comparison exercised four evolution strategies on three
skills, two development tasks, one holdout task, and one submitted child per
strategy. That study established the artifact and holdout workflow, but its
budget did not exercise population breadth, a useful Pareto archive, or repeated
operator credit.

The adjacent `knowledge` repository contains a stronger consultation benchmark:
`graphrag-papers-40`. It freezes 40 questions over a checked Semantic OKF bundle,
with 24 discovery questions, 6 holdout questions, and 10 evidence-first hard
questions. Its historical campaign is diagnostic rather than rankable, but its
dataset generator, hidden verifier, oracle checks, and source digests are useful
independent evaluation inputs.

The `knowledge` repository is not part of this workspace and must remain
read-only. The existing `harbor-evolution-comparison` study is also frozen by
content digests and must not be rewritten to absorb a new experiment.

## Decision

- Add a separate `evaluations/knowledge-consult-evolution/` study in Skill
  Arena. Do not modify the 2026-07-16 study or reinterpret its results.
- Use `graphrag-papers-40`, family `legacy`, mode `consult-only`, and the
  standalone `consult-semantic-okf` bundle as the common target.
- Treat the adjacent repository as a read-only source. Bind its Git revision,
  dataset descriptor, cohort map, questions, hidden semantic rubric, hard ground
  truth, processed bundle, ledger, grader, and baseline skill by digest.
- Regenerate Harbor tasks and copy candidate baselines only into Skill Arena's
  ignored `.tmp/` tree. Disable Python bytecode generation for every command
  that imports code from the adjacent repository.
- Expose only the public task instruction, read-only knowledge mount, and one
  candidate skill to an evaluated agent. Candidate authors and evolution
  analyzers may use discovery artifacts but must not inspect holdout or hard
  task paths, qrels, rubric points, ground truth, verifier code, or prior answers.
- Use the 24 discovery questions for evolution. A five-question discovery smoke
  may calibrate mechanics but cannot select a final winner by itself. Release
  the 6 holdout and 10 hard questions only after candidate and evolver artifacts
  are frozen.
- Give each strategy enough evidence to exercise its declared mechanism:
  population search evaluates at least four children; trace distillation
  requires recurring support across distinct trials and task checksums;
  reflective Pareto search evaluates at least three candidates across the full
  case vector; operator coevolution evaluates at least two operators with two
  children each and repeats operator credit across generations before calling
  an operator established.
- Freeze the complete evolution provenance, not only the submitted child. This
  includes candidate manifests, mutation hypotheses, trace proposals,
  consolidation state, Pareto archives, reflection and merge plans, operator
  genomes and lineage, every development job consumed, and the final selection.
- Publish a deterministic sanitized evidence lock for every reported live run.
  The lock records the observed runtime/profile, installed skill identity,
  candidate digest, aggregate metrics, and checksums of native JobConfigs and
  results. Raw native jobs remain ignored because they can contain machine-local
  paths, credentials, agent reasoning, answer text, and private verifier data.
  A checked publisher must regenerate the public JSON and Markdown from the
  sanitized lock and, when raw jobs are retained locally, verify their hashes
  and projected metrics.
- Require every new candidate to be installed under the exact logical skill
  name declared by its frontmatter. A generic, candidate-specific, or
  generation-specific installed basename is analyze-only provenance and blocks
  smoke qualification, selection, holdout release, and promotion.
- Keep mechanical qualification and semantic answer quality separate. Contract,
  evidence validity, minimum-document coverage, and execution health are
  non-compensating gates. Retrieval/reward, semantic completeness, token use,
  latency, and patch size remain separate objectives; a weighted score is valid
  only when its profile and weights were frozen in advance.
- Classify provider, authentication, environment, and incomplete-result failures
  separately from semantic zeroes. Missing metrics remain unavailable rather
  than being coerced to zero.
- Keep Harbor built-in retries at zero. For future runs only, allow the external
  orchestration strategy `harbor-resume-external-failures` to create at most one
  retry for an original trial when a verifier-owned diagnostic contains an exact
  allowlisted signal, or Harbor records an exact allowlisted exception type or
  code, identifying an authentication, environment, evaluator, infrastructure,
  or provider failure. Missing reward and unstructured text are insufficient.
  Canonical skill identity and locked task, candidate, profile, original-job,
  and retry-job provenance are mandatory. Authentication and environment
  failures additionally require locked remediation type, evidence path and
  digest, derived attestation digest, and a successful live preflight; the other
  eligible domains do not. Remediation evidence contents are not copied.
- Execute an eligible external retry as a new immutable Harbor job in a new
  directory; never mutate or reuse the original job. Merge trial evidence with
  `first-evaluable-no-best-of`: retain the first evaluable result in trial order
  and never select among evaluable attempts by quality or cost.
- Serialize mutating resume modes with a sibling O_EXCL writer lock that fails
  closed even when stale. Atomically persist a cap-consuming attempt reservation
  before creating any attempt path or calling Harbor, and stop after the first
  evaluable result. Repeated empty analyze-only imports against complete outputs
  must be byte-idempotent.
- Absolutely deny external retry for context length, context budget, agent
  timeout, token budget, tool budget, semantic reward, required-reward gate
  failure, invalid response contract, or ambiguous/conflicting failure
  attestations. A second label or manual override cannot bypass this denylist.
  A structured provider rate-limit or HTTP 5xx can be eligible, but provider
  classification never overrides a denied context or budget outcome.
- Report the total cost of search, including discarded candidates and all
  generations, alongside selected-candidate development and holdout results.
- Treat the historical q003 qualification pilot as exploratory and
  non-promotable. Candidates 00 through 04 used the installed basename `skill`,
  candidate 05 used `05-context-budgeted`, and only candidates 06 and 07 used
  `consult-semantic-okf`. The mixed identity modes, one-task scope, and lack of
  a mechanical qualifier preclude causal candidate claims and strategy ranking;
  its analyzer survivors and repair parents are diagnostics only.

## Consequences

- The four Harbor strategies are evaluated on a real heterogeneous consultation
  workload with an honest development/holdout boundary.
- The experiment can reveal complementary candidates and operator evidence that
  the one-child study could not measure.
- Reproduction requires the exact adjacent repository revision or an independently
  materialized snapshot with matching digests. Large generated task trees remain
  ignored and are regenerated rather than committed.
- Published reports remain reproducible without ignored native jobs because
  their sanitized evidence lock is tracked. Re-verifying the original native
  byte streams additionally requires the local ignored jobs named by that lock.
- The full comparison starts from fresh canonical-name runs; the historical
  mixed-identity q003 pilot cannot contribute promotion evidence.
- Selective external resume can recover a remediated authentication or
  environment setup failure, or a structured evaluator, infrastructure, or
  transient provider failure, without converting search into best-of sampling.
  It adds a new immutable job and provenance record to cost accounting.
- The q003 pilot remains unchanged: it used no retry. Its context-limit and
  agent-timeout outcomes would be denied by the future policy, and its semantic,
  gate, and invalid-contract outcomes are not external-resume candidates. The
  future policy is outside q003's immutable observed-profile attestation.
- The hidden rubric and hard ground truth remain physically present in the source
  checkout, so isolation is enforced by the preparation and release workflow,
  locks, and path boundaries rather than by cryptographic secrecy.
- Semantic review of questions 1 through 30 remains a separate blinded evidence
  layer; mechanical anchor coverage must not be described as entailment.
