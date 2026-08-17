# Harbor Skill Evolution Config

Read this reference before authoring or changing an evolution run.

## Configuration

Paths resolve from the YAML directory. A split entry may point to one Harbor
task directory or to a dataset directory whose direct children are tasks.

~~~yaml
schemaVersion: 2

evolution:
  id: example-skill-harbor-evolution
  baselineSkill: ../../skills/example-skill
  outputDir: ../../.tmp/harbor-evolution/example-run
  objective: >-
    Improve the skill's reliability across the declared Harbor tasks while
    preserving concise, transferable instructions.
  background: >-
    The skill guides a coding agent. Do not add task answers or holdout facts.

harbor:
  agent:
    name: codex
    model: openai/gpt-5.1-codex-mini
    kwargs: {}
  environment: docker
  concurrency: 4
  rewardKey: reward
  validationAttempts: 2
  holdoutAttempts: 2
  requiredEnv:
    - OPENAI_API_KEY

gepa:
  reflectionModel: openai/gpt-5.1
  reflectionMinibatchSize: 3
  maxMetricCalls: 100
  maxCandidateProposals: 12
  seed: 0

splits:
  evolution:
    - tasks/evolution
  validation:
    - tasks/validation
  holdout:
    - tasks/holdout

validationGate:
  minimumMeanGain: 0
  allowTaskRegressions: false
  requireNoErrors: true

promotion:
  minimumMeanGain: 0
  allowTaskRegressions: false
  requireNoErrors: true
~~~

## Split meaning

- evolution: the only optimizer-visible dataset. GEPA samples it for
  feedback-guided proposals and evaluates candidates on it for selection.
- validation: invisible to GEPA; evaluated only after selection against both
  the unchanged baseline and the digest-frozen candidate.
- holdout: invisible to GEPA and validation; opened only when the frozen
  candidate passes independent validation.

The validator rejects repeated task names and identical task content across
splits. This is a byte-level control, so also review for semantic duplicates.
Keep enough task-family diversity in the evolution dataset to avoid choosing a
candidate from one narrow behavior, and keep validation representative enough
to detect evolution-dataset overfitting.

Schema 2 is mandatory. Schema 1 used `validation` as GEPA's selection set and
is rejected so an older optimizer-visible boundary cannot be mistaken for
independent validation.

## Harbor task requirements

Every task must satisfy Harbor's current task model:

- task.toml uses a supported schema and org/name task identity
- instruction.md contains only agent-visible intent
- environment defines a reproducible sandbox
- tests write a numeric reward
- verifier output provides actionable diagnostics without printing canonical
  answers that can be copied into the skill

Multi-reward tasks may choose another rewardKey, but the selected value must be
numeric for every completed evolution, validation, and holdout trial.

## Candidate boundary

The seed is the complete baseline SKILL.md. Before GEPA starts, the runner
copies the source skill once to
`<output>/baseline-snapshot/skills/<frontmatter.name>` and verifies the copy
with Harbor's skill digest. The original source remains read-only, and every
candidate is derived from the frozen snapshot rather than from a potentially
changing workspace directory.

The frontmatter name is the installed identity, not a display label. It must be
an exact portable basename containing 1-64 lowercase letters, digits, or
interior hyphens and must not be a Windows-reserved name such as `con`, `nul`,
`com1`, or `lpt1`. The source directory may have a different physical basename;
the runner never adopts that alias or sanitizes an unsafe name.

Other bundle files are copied unchanged into every candidate trial at:

~~~text
<evaluation>/skills/<frontmatter.name>/
~~~

GEPA may change any text inside SKILL.md but the runner rejects:

- invalid YAML frontmatter
- missing name or description
- a changed skill name
- more than 500 lines

This boundary keeps each trial attributable. If evidence points to a broken
script or reference, stop this run, repair and validate the baseline resource,
then freeze a new benchmarked baseline.

## Trial identity and provenance

After `TrialQueue` completes, the runner requires exactly one terminal trial
directory and reads its `config.json`, `result.json`, and `lock.json`. All three
configured skill sources plus the locked source must resolve to the canonical
staged path. The staged basename and locked name must equal the frontmatter
name, and the locked digest must equal Harbor's digest of the staged bundle
both before and after execution.

Missing artifacts, aliases, source mismatches, digest mismatches, or multiple
terminal trial directories fail closed before the reward reaches GEPA. There is
no legacy/exploratory identity mode because this workflow creates new live
trials. Each `evaluation.json` preserves the candidate text digest and complete
identity evidence for audit.

## Independent validation and promotion gates

GEPA receives the evolution examples as both its feedback dataset and its
internal selection set. After GEPA returns one winner, the runner validates its
text, copies the complete candidate bundle, and freezes its digest before
opening validation. It runs the unchanged baseline and that one candidate for
`validationAttempts` on every validation task. The validation gate uses its own
minimum gain, task-regression, error, and provenance rules.

Validation evidence cannot trigger a mutation, candidate reranking, or
reselection in the same run. On failure the runner writes the candidate and
validation evidence, leaves holdout unopened, and returns
`validation-rejected`. Reusing that validation feedback for a later evolution
consumes its independence; a later unbiased gate requires a fresh validation
dataset.

Only after validation passes does Harbor run the unchanged baseline and frozen
candidate for the same number of attempts on every holdout task.

Promotion requires:

- candidate mean minus baseline mean is at least minimumMeanGain
- no task-level mean regression unless allowTaskRegressions is true
- no candidate execution errors when requireNoErrors is true
- verified canonical name/source/digest provenance for every baseline and
  candidate holdout trial

The gate does not automatically install or replace the skill. Review the
candidate, preserved trials, and normal skill tests before copying it.

## Method provenance

This workflow adapts the official
[Harbor + GEPA cookbook](https://github.com/harbor-framework/harbor-cookbook/tree/main/harbor_cookbook/gepa):
Harbor supplies isolated trials, rewards, and rich side information; GEPA uses
reflective candidate mutation and Pareto-aware selection. The local adaptation
evolves a complete SKILL.md rather than a prompt template, adds an independent
baseline-versus-frozen-candidate validation gate, and defers the final holdout
until that gate passes.
