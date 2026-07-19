# Generation 004 prospective forward validation

This stage tests the already frozen `extractive-one-shot-answer` candidate on
forward tasks that were not used to realize it. It does not import the q003
baseline score or operator credit. The q003 publication is bound only to prove
that the candidate identity was frozen before this stage.

The machine-readable contract is [`protocol.json`](protocol.json). It freezes
the baseline and candidate trees, q007/q018/q024/q030 task trees, Harbor/Pi/model
profile, reward gates, diagnostic disposition, call budget, and staged stop
policy before any generation-004 Harbor call.

## Why context limits are zero here but never retried

`provider-context-limit.v1` is an explicit candidate-attributable disposition.
It requires one exact, conflict-free structured diagnostic tuple and maps it to
an available operational score of zero. It remains unqualified and sets
`retryAuthorized: false`. Transient provider, authentication, environment,
evaluator, infrastructure, ambiguous, or conflicting failures remain null and
stop comparison.

This does not weaken `harbor-resume-external-failures`: context exhaustion is
still an absolute retry denial. The distinction is between measuring an
unchanged candidate's operational failure and granting it another attempt.

## Stages

1. Privately seal the current Pi `auth.json`; never reuse or amend the
   generation-003 seal.
2. Prepare only q007 plus the two frozen candidate inputs and Harbor configs.
3. Run the baseline once. If its evidence is transient-external or ambiguous,
   stop; do not run the candidate automatically.
4. Run the candidate once and publish the q007 gate.
5. Only after q007 passes, materialize q018/q024/q030 and their two configs.
6. Run baseline and candidate once per task and publish the final forward gate.

Harbor retries stay zero. The fully successful path has at most four Harbor job
invocations and eight model executions. A separate selective-resume run may be
authorized only by its own frozen eligibility proof; this harness never retries
automatically.

## Executable workflow

Run the tracked preparation commands from Windows PowerShell. Replace the auth
path with the current Pi `auth.json` or its containing directory.

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/prepare-generation-004.js seal-auth --auth-source C:\Users\villa\.pi\agent\auth.json
node evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/prepare-generation-004.js prepare-q007 --auth-source C:\Users\villa\.pi\agent\auth.json
```

Preparation writes an immutable q007 receipt and two WSL wrappers under
`.tmp/knowledge-consult-evolution/meta-evolution/generation-004/prepared/q007`.
Run the baseline wrapper from WSL first. The candidate wrapper calls the Harbor
operator analyzer in development-only mode and refuses the candidate call when
the baseline disposition is unavailable, ambiguous, conflicting, or transient.

```bash
bash .tmp/knowledge-consult-evolution/meta-evolution/generation-004/prepared/q007/run-baseline.sh /mnt/c/Users/villa/.pi/agent/auth.json
bash .tmp/knowledge-consult-evolution/meta-evolution/generation-004/prepared/q007/run-extractive-one-shot-answer.sh /mnt/c/Users/villa/.pi/agent/auth.json
node evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/publish-generation-004.js publish-q007
```

Only a passing immutable q007 publication authorizes the remaining materializer.
Before opening any remaining task, the materializer recomputes that publication
from the bound Harbor jobs and the private, provenance-checked operator output;
a merely self-hashed or edited pass cannot unlock the stage. It then creates two
more wrappers, each using one Harbor invocation for three trials.

```powershell
node evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/prepare-generation-004.js prepare-remaining --auth-source C:\Users\villa\.pi\agent\auth.json
```

```bash
bash .tmp/knowledge-consult-evolution/meta-evolution/generation-004/prepared/remaining-forward-validation/run-baseline.sh /mnt/c/Users/villa/.pi/agent/auth.json
bash .tmp/knowledge-consult-evolution/meta-evolution/generation-004/prepared/remaining-forward-validation/run-extractive-one-shot-answer.sh /mnt/c/Users/villa/.pi/agent/auth.json
node evaluations/knowledge-consult-evolution/meta-evolution/generation-004/scripts/publish-generation-004.js publish-remaining
```

The analyzer must run under WSL because native Harbor locks and configs bind
`/mnt/c/...` paths. Its detailed evidence stays under the private runtime tree.
The publisher exposes only the allowed metrics, dispositions, token counts, and
candidate/task/profile/job/lock/result/trial digests. It never publishes task
answers, qrels, model text, diagnostic excerpts, or authentication metadata.

Every wrapper uses the exact frozen image, `uvx --offline`, one attempt, zero
Harbor retries, an isolated fresh auth projection, and an exclusive job path.
No wrapper performs an automatic retry or overwrites an existing job.

## Model-free tests

```powershell
node --test test/knowledge-consult-meta-evolution-generation-004.test.js
```

These tests cover staged materialization, auth sealing, immutable verification,
the prospective operator policy, external-null stopping, context-limit zero/no-
retry disposition, and the 4-invocation/8-execution ceiling. They make no Harbor
or model calls.
