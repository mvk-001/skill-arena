# Skill Arena

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/) [![Schema V1](https://img.shields.io/badge/schema-V1-007298)](./docs/specs.md) [![Agent adapters: 6](https://img.shields.io/badge/agent_adapters-6-652f6c)](#supported-agent-runtimes) [![CLI first](https://img.shields.io/badge/interface-CLI--first-e77204)](#core-cli)

**Prove which skills and agent capabilities actually improve task performance.**

Skill Arena is a declarative, CLI-first benchmark harness for comparing coding
agents under the same task, workspace, and execution constraints. It turns
capability decisions into repeatable experiments and normalized evidence.

**[Vision](#vision) · [Harbor evolution](#harbor-evolution) · [Quick start](#quick-start) · [Core CLI](#core-cli) · [Documentation](#documentation)**

## Vision

Agent capabilities should be managed like software: isolated, tested,
compared, and promoted only when the evidence supports them.

Skill Arena aims to make that workflow practical across local agent runtimes.
Instead of trusting a compelling demo or a single lucky run, teams can freeze a
benchmark, compare a control against explicit capability profiles, repeat every
cell, and preserve the evidence needed to make a defensible decision.

The central promise is simple: **know what helped, by how much, and under which
conditions.**

## Harbor evolution

The maintained skill-improvement surface is Harbor-native. Harbor executes the
tasks and preserves native jobs, locks, trials, rewards, verifier diagnostics,
trajectories, costs, and skill digests. Each evolution skill consumes that
evidence directly and keeps development selection separate from the final
holdout promotion decision.

Choose one primary strategy from the evidence you already have. Do not run all
of them and select the luckiest result.

![Harbor evolution strategy selector](./docs/assets/harbor-evolution/harbor-evolution-selector.static.svg)

| Skill | Best when | Strategy | Avoid when |
| --- | --- | --- | --- |
| [`harbor-population-search`](./skills/harbor-population-search/SKILL.md) | One trusted scalar objective can score the baseline and several genuine alternatives. | Rank hard-gated Harbor fitness, keep the top two, then create focused mutation or crossover children. | There is only one child, case-level regressions matter, or the mean hides conflicting strengths. |
| [`harbor-trace-distillation`](./skills/harbor-trace-distillation/SKILL.md) | Diverse completed success and failure traces contain recurring, causally supported lessons. | Cite bounded evidence, require support from at least two trials and two task checksums, resolve conflicts, and consolidate patches. | Evidence is sparse, correlated, external-only, or does not justify a safe edit. |
| [`harbor-reflective-pareto-search`](./skills/harbor-reflective-pareto-search/SKILL.md) | Cases conflict and each weakness has verified local feedback. | Build hard-gated case vectors, preserve non-dominated candidates, reflect on weak cases, and create lineage-bound children. | Only an aggregate score exists or full case-vector reevaluation is unaffordable. |
| [`harbor-operator-coevolution`](./skills/harbor-operator-coevolution/SKILL.md) | Several generations provide unambiguous parent-child-operator lineage and multiple established operators. | Credit mutation instructions by parent-to-child improvement, then breed the operators that repeatedly produce qualified children. | This is a first generation, operator attribution is ambiguous, or independent trials are insufficient. |
| [`harbor-evolve-skill`](./skills/harbor-evolve-skill/SKILL.md) | One integrated optimizer should rewrite complete `SKILL.md` text from training feedback and select on validation. | GEPA reflects on bounded Harbor evidence, preserves Pareto-useful text candidates, and uses validation before untouched holdout. | Scripts, references, or assets must change, or deterministic patch-level control is required. |

Use [`harbor-run-results`](./skills/harbor-run-results/SKILL.md) to execute,
inspect, compare, and report native jobs. Add
[`harbor-resume-external-failures`](./skills/harbor-resume-external-failures/SKILL.md)
only for independently verified external failures; it is a recovery layer, not
an optimizer. The [Harbor evolution playbook](./docs/harbor-evolution-playbook.md)
contains the full decision rules, strategy diagrams, compositions, commands,
and promotion gates.

The public Skill Arena CLI remains supported for declarative cross-agent
comparisons. Its former `skill-arena-*` evolution skills and the
`harbor-runner` reporting bridge are deprecated and retained only for legacy
reproduction and migration.

## What you can achieve

| Outcome | What Skill Arena gives you |
| --- | --- |
| Prove skill impact | Compare `no-skill` against one or more skill-enabled profiles under identical inputs. |
| Choose the best alternative | Test several skills, instructions, agents, or hooks in one side-by-side matrix. |
| Compare agent runtimes | Run the same benchmark across Codex, Copilot CLI, Pi, OpenCode, Claude Code, and Antigravity CLI. |
| Measure reliability and efficiency | Repeat each cell and inspect pass rate, token usage, latency, errors, and artifacts. |
| Protect benchmark integrity | Materialize fresh workspaces and expose only declared capabilities and minimum authentication state. |
| Improve skills systematically | Use native Harbor evidence for population search, trace distillation, reflective Pareto search, operator coevolution, or GEPA evolution. |

## How it works

<p align="center">
  <img src="https://raw.githubusercontent.com/mvk-001/skill-arena/main/docs/assets/skill-arena-value.gif" width="1200" alt="Skill Arena turns fixed benchmark inputs into normalized evidence and a clear capability decision.">
</p>

1. **Declare** exact prompts, zero or more workspace sources, assertions, profiles, and agent
   variants in YAML.
2. **Materialize** a fresh isolated workspace for every supported comparison
   unit.
3. **Execute** the `prompt × variant × profile` matrix through local agent CLIs
   and Promptfoo.
4. **Normalize** results into stable JSON and a human-readable comparison
   report.

## Quick start

### Prerequisites

- Node.js 24 or newer
- Git on `PATH`
- at least one [supported agent CLI](#supported-agent-runtimes), installed and
  authenticated

### Install from the repository

```bash
git clone https://github.com/mvk-001/skill-arena.git
cd skill-arena
npm install
```

### Run the maintained evaluation

```bash
# 1. Validate the authoring contract.
npx . val-conf ./evaluations/skill-arena-config-author/evaluation.yaml

# 2. Materialize workspaces and inspect the plan without launching agents.
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run

# 3. Execute the live comparison.
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
```

> [!TIP]
> Start with `--dry-run`. It catches schema, routing, workspace, and capability
> materialization problems before a live evaluation consumes time or model
> quota.

### Create your own evaluation

```bash
npx . gen-conf \
  --output ./evaluations/my-benchmark/evaluation.yaml \
  --benchmark-id my-benchmark \
  --prompt "Complete the benchmark task." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only when every requirement is satisfied." \
  --skill-type local-path \
  --requests 3
```

The recommended checked-in layout is:

```text
evaluations/<benchmark-id>/
├── evaluation.yaml
├── fixtures/workspaces/
└── last_report.md
```

See the [usage guide](./docs/usage.md) for complete source shapes, assertions,
judges, profile reuse, and result inspection.

## Core CLI

| Command | Purpose |
| --- | --- |
| `skill-arena gen-conf [options]` | Generate a commented compare-config template. |
| `skill-arena val-conf <config>` | Validate YAML or JSON and print its normalized shape. |
| `skill-arena evaluate <config> --dry-run` | Plan the matrix and materialize workspaces without launching agents. |
| `skill-arena evaluate <config>` | Execute the benchmark and write normalized artifacts. |

Use `skill-arena help <command>` or the [CLI reference](./docs/cli-reference.md)
for every option.

## Supported agent runtimes

| Adapter | Local executable | V1 compare capabilities |
| --- | --- | --- |
| `codex` | `codex` | instructions, skills |
| `copilot-cli` | `copilot` | instructions, skills, agents, hooks |
| `pi` | `pi` | skills |
| `opencode` | `opencode` | instructions, skills, agents |
| `claude-code` | `claude` | instructions, skills, agents, hooks |
| `antigravity-cli` | `agy` | instructions, skills, agents, hooks, MCP, plugins |

Adapters expose different native control surfaces. Skill Arena reports
unsupported capability cells explicitly instead of pretending that every
runtime is equivalent. See [runtime isolation](./docs/architecture.md#effective-runtime-isolation)
and [capability families](./docs/specs.md#compare-capability-families).

## Isolation and secrets

- Every supported comparison unit receives a fresh materialized workspace.
- Evaluations that need no input files may omit `workspace.sources` entirely.
- Runtime homes or config directories are isolated where the local CLI permits
  it.
- Only minimum authentication state is seeded; host personalization is not
  copied into the benchmark environment.
- Secret values stay out of YAML and generated Promptfoo artifacts.

Credential-dependent benchmarks can allowlist host variables by name:

```yaml
workspace:
  setup:
    envPassthrough:
      - GITHUB_TOKEN
```

The runtime fails early when a required variable is missing. See
[credential passthrough](./docs/usage.md#pass-credentials-without-storing-secrets)
for workspace-level and variant-level examples.

## Results

Compare runs write predictable artifacts under
`results/<benchmark-id>/<timestamp>-compare/`:

```text
promptfooconfig.yaml          # generated Promptfoo plan
promptfoo-results.json        # raw execution output
summary.json                  # stable machine-readable result
merged/merged-summary.json    # merged comparison payload
merged/report.md              # primary human-readable report
```

Use `summary.json` for automation and `merged/report.md` for review and
decision-making.

The Harbor-native reporting skill instead writes `final-report.json` and
`final-report.md` directly from completed Harbor job artifacts. It is
independent of the Skill Arena CLI and report schema.

## Documentation

| Document | Use it for |
| --- | --- |
| [Documentation index](./docs/README.md) | Navigate by audience and find the canonical source for each concern. |
| [Usage guide](./docs/usage.md) | Author and execute real evaluations end to end. |
| [CLI reference](./docs/cli-reference.md) | Look up commands, options, and environment variables. |
| [Architecture](./docs/architecture.md) | Understand execution flow, isolation, adapters, and module boundaries. |
| [Configuration specs](./docs/specs.md) | Read the canonical schema and normalization contract. |
| [Research foundations](./docs/research-foundations.md) | Trace the papers, related work, and adaptation boundaries behind skill improvement. |
| [Strategy evaluation](./docs/strategy-evaluation.md) | Reproduce the four-way comparison and choose a workflow for your evidence regime. |
| [Harbor evolution playbook](./docs/harbor-evolution-playbook.md) | Select, compose, test, and recover Harbor-native evolution workflows with minimum unnecessary calls. |
| [Testing](./docs/testing.md) | Validate documentation, runtime code, configs, and live runs. |
| [ADRs](./.specs/adr/) | Review durable technical and workflow decisions. |

Executable examples live under [`evaluations/`](./evaluations/). Diagram
sources and static verification renders live under
[`docs/assets/`](./docs/assets/).

## Project status and development

Skill Arena is pre-1.0 and currently documents schema V1. Local agent CLIs do
not expose identical policies, so cross-runtime comparisons should be
interpreted with the adapter limitations above.

Before submitting changes:

```bash
npm run check
npm run test:coverage
```

Contributors should read [`AGENTS.md`](./AGENTS.md), preserve the documented
package scope, and record durable decisions under [`.specs/adr/`](./.specs/adr/).
