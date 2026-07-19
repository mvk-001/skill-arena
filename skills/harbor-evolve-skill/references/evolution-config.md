# Harbor Skill Evolution Config

Read this reference before authoring or changing an evolution run.

## Configuration

Paths resolve from the YAML directory. A split entry may point to one Harbor
task directory or to a dataset directory whose direct children are tasks.

~~~yaml
schemaVersion: 1

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
  train:
    - tasks/train
  validation:
    - tasks/validation
  holdout:
    - tasks/holdout

promotion:
  minimumMeanGain: 0
  allowTaskRegressions: false
  requireNoErrors: true
~~~

## Split meaning

- train: GEPA samples these tasks for feedback-guided proposals.
- validation: GEPA evaluates candidates here and selects its best candidate.
- holdout: invisible to GEPA; evaluated only after selection against both
  baseline and candidate.

The validator rejects repeated task names and identical task content across
splits. Keep enough task-family diversity in each split to avoid choosing a
candidate from one narrow behavior.

## Harbor task requirements

Every task must satisfy Harbor's current task model:

- task.toml uses a supported schema and org/name task identity
- instruction.md contains only agent-visible intent
- environment defines a reproducible sandbox
- tests write a numeric reward
- verifier output provides actionable diagnostics without printing canonical
  answers that can be copied into the skill

Multi-reward tasks may choose another rewardKey, but the selected value must be
numeric for every completed development and holdout trial.

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

## Promotion gate

After GEPA selection, Harbor runs the unchanged baseline and candidate for the
same number of attempts on every holdout task.

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
evolves a complete SKILL.md rather than a prompt template and adds a separate
baseline-versus-candidate holdout gate.
