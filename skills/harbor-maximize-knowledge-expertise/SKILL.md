---
name: harbor-maximize-knowledge-expertise
description: Plan evidence-bound evolution portfolios for knowledge and expert skill bundles without scoring, mutating, or promoting them. Use when Codex must turn sanitized development-only Harbor evidence into benchmark-agnostic operators that improve knowledge coverage, retrieval, ranking, evidence fidelity, synthesis, calibration, robustness, or efficiency; bind the target and evidence by digest; preserve complementary candidates; and hand exact mutation contracts to Harbor candidate realization, Pareto search, or operator coevolution.
---

# Harbor Maximize Knowledge Expertise

Turn development-only failure patterns into a deterministic portfolio of exact,
benchmark-agnostic mutation instructions. Keep candidate realization, Harbor
evaluation, selection, and promotion in their owning skills.

Runtime: Python 3.12 or newer, using only the standard library. In commands,
`<skill-root>` means this copied skill directory.

## Workflow

1. Read [references/expertise-contract.md](references/expertise-contract.md)
   completely before preparing a campaign.
2. Freeze the complete target skill and compute its canonical tree digest:

   ~~~powershell
   python <skill-root>/scripts/plan_knowledge_expertise.py digest <target-skill>
   ~~~

3. Declare at least three expertise dimensions, including
   `evidence-fidelity`, and bind every sanitized development evidence file by
   exact SHA-256. Describe gaps with opaque case IDs and the fixed failure-mode
   vocabulary. Do not provide questions, answers, qrels, rubric text, private
   verifier files, model reasoning, or holdout evidence.
4. Declare whether a holdout is `frozen-unopened` or `unavailable`. An exposed
   or missing holdout must be `unavailable`; the resulting plan can support
   retrospective development only.
5. Create one append-only plan:

   ~~~powershell
   python <skill-root>/scripts/plan_knowledge_expertise.py plan campaign.json
   ~~~

6. Inspect the target/evidence bindings, dimension coverage, gap-to-operator
   mapping, conservative branch, evaluation handoff, and explicit claim limits.
   The generated instructions contain no case IDs or task facts.
7. Realize each selected operator as a separate complete child with
   `harbor-realize-skill-candidate`. Evaluate every child with fresh native
   Harbor jobs. Use `harbor-reflective-pareto-search` when case strengths
   conflict; use `harbor-operator-coevolution` only after at least two
   attributable trials per operator exist.
8. Keep the incumbent and at least one conservative candidate. Select only
   from development evidence. Open a frozen untouched holdout once for the
   unchanged baseline and one frozen winner; otherwise label every result
   retrospective and do not promote.
9. Recompute all bindings and the deterministic plan before relying on it:

   ~~~powershell
   python <skill-root>/scripts/plan_knowledge_expertise.py verify campaign.json
   ~~~

## Boundaries

- Treat this bundle as a planner, not an evaluator or candidate generator.
- Never calculate, normalize, replace, or reinterpret Harbor rewards.
- Never read evidence content to infer answers. The planner verifies only file
  identity and uses caller-declared, opaque development gap classifications.
- Require the target tree and every evidence file to match frozen digests.
- Reject symbolic links, junctions, reparse points, unsafe paths, duplicate
  identities, non-finite values, and unknown schema fields.
- Generate operators only from the fixed knowledge-expertise library. Keep
  instructions free of dataset names, questions, case IDs, answers, and
  holdout facts.
- Require multiple expertise dimensions and multiple operator families.
  Preserve evidence fidelity and robustness as non-compensating concerns.
- Do not edit the source skill, create child bundles, call a model, run Harbor,
  open holdout, rank candidates, or install a skill.
- Refuse to overwrite an existing plan.

## Output

The plan records:

- canonical target and evidence digests;
- the declared expertise dimensions and sanitized gaps;
- a bounded portfolio of exact mutation instructions with gap coverage;
- the Harbor evaluation handoff and holdout state;
- `planned-fitness-unverified` and explicit zero-call/no-promotion boundaries;
  and
- a canonical self-digest for deterministic verification.

## Validation

After changing this copied bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/plan_knowledge_expertise.py
python <skill-root>/scripts/plan_knowledge_expertise.py --help
node --test test/harbor-maximize-knowledge-expertise.test.js
~~~

Also run the repository-wide checks required by the host repository. Copy
`SKILL.md`, `agents/`, `references/`, and `scripts/` together.
