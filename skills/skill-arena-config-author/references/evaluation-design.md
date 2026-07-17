# Evaluation Prompt Design

Use this guidance when the compare task evaluates a skill and you must design
the task prompts, not merely preserve prompts supplied by the user.

## Separate task inputs from evaluator knowledge

Each task prompt should contain only:

- the plausible user goal
- inputs the user would actually provide
- the observable artifact or response they need
- constraints that are part of the real task

Keep these outside the task prompt:

- the skill workflow or the files the skill should read
- suspected failure modes and the fix you expect
- validator commands, assertion logic, scoring rubrics, and hidden answers
- compare-schema instructions that are irrelevant to the task performed by the
  benchmarked agent
- outputs or conclusions from earlier repetitions

Exact commands are appropriate only for a separately labeled `contract-smoke`
case. They are not a substitute for naturalistic forward tests.

## Start with the smallest useful prompt

Draft one sentence that states the task. Add only the input locations, exact
output paths, safety boundaries, and acceptance constraints needed to make the
request executable. Stop when another instruction would tell the agent how to
apply the skill instead of what result the user needs.

Put stable format checks in assertions. Put fixture data in the declared
workspace. Do not copy either one into the task prompt as a recipe.

## Build a coverage matrix

When the user does not prescribe a prompt set, use at least four cases for a
broad skill:

1. `naturalistic-forward`: a normal user request with no implementation recipe.
2. `naturalistic-forward`: a different task family promised by the skill.
3. `generalization`: new data, scale, layout, or domain beyond the main example.
4. `boundary-recovery`: ambiguity, invalid input, or a likely failure mode with
   an observable safe outcome.

For a narrow deterministic skill, use at least one `contract-smoke` and one
`naturalistic-forward` case. Add `routing-control` separately when discovery or
trigger wording is part of the skill promise.

Do not let one task family occupy more than half of the corpus by default.
Vary the user goal, input shape, and expected artifact rather than merely
changing output format or nouns in one question.

## Record and validate coverage

Create a small JSON coverage file beside the evaluation:

```json
{
  "schemaVersion": 1,
  "policy": {
    "minimumPrompts": 4,
    "minimumTaskFamilies": 3
  },
  "cases": [
    {
      "promptId": "natural-summary",
      "caseKind": "naturalistic-forward",
      "taskFamily": "summarization"
    }
  ]
}
```

List every prompt exactly once. Then run:

```bash
node <skill-root>/scripts/validate-evaluation-design.js evaluations/<skill>/evaluation.yaml --coverage evaluations/<skill>/prompt-coverage.json
```

The audit checks prompt count, task-family coverage, required case kinds,
single-family concentration, prompt length, pairwise lexical similarity, and
common evaluator or workflow leakage phrases. Adjust explicit policy values
only when the skill's actual scope justifies the exception.

This static audit is a design gate, not a semantic grader. Review the prompts
manually after it passes and keep assertions independent of the skill's own
examples or self-reported success.

## Contrastive Examples

Good: `Audit the Slidev deck in deck and write grounded findings to output/audit.md.`

Reject: `Read the skill audit script, run its exact command, and ensure the hidden overflow check passes.`

Good: `Convert input/loader.svg to output/loader.gif while preserving its animation.`

Reject: `Use the bundled Playwright capture workflow with the evaluator's expected frame count.`
