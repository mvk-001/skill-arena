---
name: skill-arena-config-author
description: Deprecated compatibility skill for Skill Arena compare configs. Do not use for new evaluation workflows; author native Harbor JobConfig files and use harbor-run-results instead. Retain only for reproducing or migrating existing Skill Arena comparisons.
---

# Skill Arena Config Author

> [!CAUTION]
> Deprecated. Do not use or extend this skill for new work. Author native
> Harbor `JobConfig` files and use `harbor-run-results`; retain this bundle only
> to reproduce or migrate existing Skill Arena comparisons.

Author valid Skill Arena V1 compare configs without leaking evaluator knowledge
into the benchmarked task prompts.

Runtime: execute bundled ESM helpers with Node.js 24 or newer. In commands,
`<skill-root>` means this installed skill directory.

## Output Contract

For compare-authoring tasks, return the completed YAML only.

- Start with `schemaVersion: 1`.
- Write the requested file before returning when the user names an output path.
- Return no headings, status notes, test notes, Markdown fences, or prose around
  the YAML.
- Preserve every closed-set literal the user supplies, including prompt ids,
  profile ids, variant ids, paths, adapters, and enum values.

## Fast Path

1. Read the request and inspect only the declared workspace or source inputs.
2. Open `assets/decision-tree.md`.
3. Use `skill-arena gen-conf` when the CLI is available, or start from
   `assets/compare-template.yaml`.
4. When you must design a skill evaluation's prompts, read
   `references/evaluation-design.md` before drafting them.
   Then apply `references/task-vocabulary.md` and
   `references/prompt-risk-checklist.md`.
5. Validate structure with `skill-arena val-conf <evaluation.yaml>`.
6. Validate an authored prompt corpus with
   `scripts/validate-evaluation-design.js` and its coverage JSON.

## Evaluation Prompt Rules

Preserve user-supplied prompts exactly unless the user asks you to edit them.
When you design prompts from a skill promise:

- Begin with the smallest plausible user request that makes the task
  executable.
- Include the real input, observable output, output path, safety boundary, and
  user-facing constraints only when the task needs them.
- Keep the skill workflow, required skill reads, validator commands, assertion
  logic, scoring rubric, suspected bug, and expected answer outside the task
  prompt.
- Put test data in declared workspace fixtures and grading knowledge in
  assertions.
- Keep every task prompt identical across profiles.
- For a broad skill, default to at least four prompts across at least three task
  families: two naturalistic cases, one generalization case, and one boundary
  or recovery case.
- For a narrow deterministic skill, use at least one contract smoke and one
  naturalistic case.
- Do not treat different response formats for the same underlying question as
  different task families.
- Do not let one task family occupy more than half of the default corpus.
- Record each prompt's `caseKind` and `taskFamily` in a coverage JSON and run
  the evaluation-design validator.

Exact commands are allowed in a separately labeled `contract-smoke` prompt.
They are not the default for naturalistic or generalization cases.

## Preferred Layout

When the user does not choose another destination, use:

```text
evaluations/<skill-name>/evaluation.yaml
evaluations/<skill-name>/prompt-coverage.json
evaluations/<skill-name>/fixtures/workspaces/<case-name>/
evaluations/<skill-name>/last_report.md
```

Keep fixtures small and meaningful without the skill. Include only files the
benchmarked agent may use.

## Compare Schema

Read `references/compare-schema.md` before drafting source, profile, variant,
or assertion blocks. Preserve the exact V1 nesting and adapter support described
there; do not rederive key names from memory.

## Validation Workflow

1. Extract the exact user-supplied literals.
2. Decide prompts and fixtures before profiles and variants.
3. If prompts are authored, write the coverage JSON and audit it.
4. Draft the compare config.
5. Check profile, variant, workspace-source, and prompt counts when the request
   defines closed sets.
6. Run the schema-backed public validator:

```bash
skill-arena val-conf <evaluation.yaml>
```

7. For an authored prompt corpus, also run:

```bash
node <skill-root>/scripts/validate-evaluation-design.js <evaluation.yaml> --coverage <prompt-coverage.json>
```

8. Run `skill-arena evaluate <evaluation.yaml> --dry-run` when the runtime is
   available.
9. Fix validation failures before returning the YAML.

## Reject These Shapes

- top-level `profiles`, `variants`, `skillModes`, or `modes`
- `task.prompts` written as a mapping instead of a list
- `workspace.sources` written as `- local-path:` instead of `- type: local-path`
- `evaluation.shared` instead of `evaluation.assertions`
- assertion aliases such as `pattern:` or `rubric:` instead of `value:`
- `execution`, `sandbox`, `approval`, `webSearch`, or `networkAccess` in place
  of the exact agent keys
- commentary or code fences around the returned YAML
- evaluator knowledge, workflow recipes, or expected answers copied into
  naturalistic task prompts
- a prompt corpus that varies only one question's output format

## No-Shell Fallback

If shell execution is unavailable, start from `assets/compare-template.yaml`,
use `assets/fallback-checklist.md`, and author the complete best-effort config
offline. Do not replace a valid YAML answer with shell-error prose. Do not
invent unknown closed-set values; preserve every value available in the user
request and declared inputs.

## Final Gate

Before returning:

- the first visible text is `schemaVersion: 1`
- top-level keys are correctly nested
- task prompts contain only user-facing task context
- authored prompt coverage is sufficiently varied
- all requested profiles, variants, sources, capabilities, and assertions are
  present
- there are no TODO values, prose notes, headings, or fences outside the YAML
