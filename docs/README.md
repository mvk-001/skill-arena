# Documentation

This directory contains the user and contributor documentation for Skill Arena.
Start with the guide that matches the work you are doing.

## For Harbor evolution

Start with the [Harbor evolution playbook](./harbor-evolution-playbook.md). It
selects a primary strategy from the evidence available, shows the algorithmic
loop for every maintained evolver, and defines composition, cost, stop, and
holdout-promotion rules.

| Need | Maintained skill |
| --- | --- |
| Execute, inspect, compare, or report native Harbor jobs | [`harbor-run-results`](../skills/harbor-run-results/SKILL.md) |
| Broad scalar-reward candidate search | [`harbor-population-search`](../skills/harbor-population-search/SKILL.md) |
| Evidence-cited updates from completed traces | [`harbor-trace-distillation`](../skills/harbor-trace-distillation/SKILL.md) |
| Case-level reflection with a non-dominated archive | [`harbor-reflective-pareto-search`](../skills/harbor-reflective-pareto-search/SKILL.md) |
| Evolution of mutation instructions from repeated lineage | [`harbor-operator-coevolution`](../skills/harbor-operator-coevolution/SKILL.md) |
| Integrated GEPA rewriting of `SKILL.md` | [`harbor-evolve-skill`](../skills/harbor-evolve-skill/SKILL.md) |
| Selective recovery of proven external failures | [`harbor-resume-external-failures`](../skills/harbor-resume-external-failures/SKILL.md) |

Use [strategy evaluation](./strategy-evaluation.md) for the measured Harbor
comparison and its limitations, and [research foundations](./research-foundations.md)
for provenance and adaptation boundaries. The primary executable study is
[`evaluations/harbor-evolution-comparison/`](../evaluations/harbor-evolution-comparison/).

## For Skill Arena CLI benchmark authors

1. [Usage guide](./usage.md) — author, validate, dry-run, execute, and inspect a
   compare evaluation.
2. [CLI reference](./cli-reference.md) — commands, options, environment
   variables, and exit behavior.
3. [Configuration specs](./specs.md) — canonical schema, normalization rules,
   adapter contract, and output requirements.

The public CLI remains supported. Its primary compare example is
[`evaluations/skill-arena-config-author/evaluation.yaml`](../evaluations/skill-arena-config-author/evaluation.yaml).
The former Skill Arena evolution skill bundles are deprecated; use the
Harbor-native surface above for new skill-improvement work.

## For contributors

1. [Architecture](./architecture.md) — runtime boundaries, execution flow, and
   source-module responsibilities.
2. [Testing](./testing.md) — validation sequences for documentation, runtime,
   configs, and live evaluations.
3. [Decision records](../.specs/adr/) — durable technical and workflow
   decisions.
4. [Implementation plans](../.specs/plans/) — active task lists and their
   verification evidence; plans are not canonical design contracts.

Read [`AGENTS.md`](../AGENTS.md) before changing the repository.

## Sources of truth

| Concern | Canonical source |
| --- | --- |
| Harbor-native evolution workflow and strategy selection | [Harbor evolution playbook](./harbor-evolution-playbook.md) |
| Harbor evolution evidence and measured comparison | [Strategy evaluation](./strategy-evaluation.md) |
| Improvement-strategy research provenance | [Research foundations](./research-foundations.md) |
| Runtime design and execution flow | [Architecture](./architecture.md) |
| Config fields and required behavior | [Configuration specs](./specs.md) |
| CLI behavior | `skill-arena <command> --help`, then [CLI reference](./cli-reference.md) |
| Maintained benchmark scenarios | [`evaluations/`](../evaluations/) |
| Validation workflow | [Testing](./testing.md) |
| Historical decisions | [ADRs](../.specs/adr/) |
| Active implementation plans | [`.specs/plans/`](../.specs/plans/) |

When prose and executable behavior disagree, treat the implementation and its
tests as evidence of current behavior, then update the relevant canonical
document in the same change.

## Documentation conventions

- Repository artifacts are written in English.
- Use lower-case, kebab-case names for new files in `docs/`.
- Prefer one maintained example over copied YAML snapshots in this directory.
- Link to executable examples under `evaluations/` instead of duplicating them.
- Keep reproducible README diagram sources, static verification renders, and
  animated renders together under [`docs/assets/`](./assets/).
- Keep workflow guidance in `usage.md`, field-level requirements in `specs.md`,
  and implementation details in `architecture.md`.
- Run `npm run docs:check` after changing Markdown links or moving files.
