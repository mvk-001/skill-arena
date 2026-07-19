# ADR: Candidate-attributable context failures in Harbor evolution

Date: 2026-07-19

## Status

Accepted for prospective experiments only.

## Context

The generation-003 `q003` baseline finished agent execution without an answer
and the verifier reported the exact structured tuple
`provider-failure / provider-context-limit / context_length_exceeded`. The
selective-resume contract correctly rejects that tuple: a context-window
exhaustion is not a transient provider outage and must never receive another
attempt under the external-failure budget.

The operator-coevolution analyzer previously treated every structured
`provider` diagnostic as unavailable fitness. That is safe for transient
provider outages, but it also prevents an evolver from measuring a candidate
whose purpose is to stop candidate-induced context growth. Treating the same
event as retryable would be worse: it would spend another call on an unchanged
candidate and would give that candidate an extra chance.

## Decision

- Keep `harbor-resume-external-failures` unchanged. Context length, context
  budget, agent timeout, token budget, and tool budget remain absolute retry
  denials.
- Add an opt-in, sealed diagnostic-disposition policy to
  `harbor-operator-coevolution`. Its default remains fail-closed unavailable
  fitness.
- Permit the opt-in policy to map only explicitly allowlisted, non-retryable,
  candidate-attributable terminal signals to an available score of zero.
  Authentication, environment, evaluator, infrastructure, transient provider,
  and ambiguous/conflicting failures remain unavailable.
- Record both the observed external-looking domain and the applied disposition.
  A candidate-failure disposition never creates retry eligibility.
- Do not reinterpret generation-003 `q003` as promotion evidence. Its published
  advance decision predates this policy and remains historical design evidence.
- Freeze the new policy before opening a forward case. Compare the exact
  baseline and already frozen selected candidate on `q007`; open `q018`,
  `q024`, and `q030` only if that first comparison passes.
- Require the selected candidate to pass every configured reward gate. A
  candidate-attributable zero may establish the parent's operational failure,
  but it cannot qualify a candidate for promotion.
- Treat any transient external failure as unavailable and stop the stage. It
  may enter the independent selective-resume workflow only when that workflow
  proves eligibility from its own immutable contract.

## Consequences

- An unchanged context-exhausting candidate receives no extra model call.
- A bounded candidate can demonstrate a real improvement over an operationally
  failing parent under a policy declared before the forward task is opened.
- Historical evidence is not relabeled after seeing its reward.
- Retry eligibility and evolutionary fitness remain separate, auditable
  decisions.
