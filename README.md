# Skill Arena

[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/) [![Schema V1](https://img.shields.io/badge/schema-V1-007298)](./docs/specs.md) [![Agent adapters: 6](https://img.shields.io/badge/agent_adapters-6-652f6c)](#supported-agent-runtimes) [![CLI first](https://img.shields.io/badge/interface-CLI--first-e77204)](#core-cli)

**Prove which skills and agent capabilities actually improve task performance.**

Skill Arena is a declarative, CLI-first benchmark harness for comparing coding
agents under the same task, workspace, and execution constraints. It turns
capability decisions into repeatable experiments and normalized evidence.

**[Vision](#vision) · [Quick start](#quick-start) · [Core CLI](#core-cli) · [Skill toolkit](#skill-toolkit) · [Improvement workflows](#choose-an-improvement-workflow) · [Documentation](#documentation)**

## Vision

Agent capabilities should be managed like software: isolated, tested,
compared, and promoted only when the evidence supports them.

Skill Arena aims to make that workflow practical across local agent runtimes.
Instead of trusting a compelling demo or a single lucky run, teams can freeze a
benchmark, compare a control against explicit capability profiles, repeat every
cell, and preserve the evidence needed to make a defensible decision.

The central promise is simple: **know what helped, by how much, and under which
conditions.**

## What you can achieve

| Outcome | What Skill Arena gives you |
| --- | --- |
| Prove skill impact | Compare `no-skill` against one or more skill-enabled profiles under identical inputs. |
| Choose the best alternative | Test several skills, instructions, agents, or hooks in one side-by-side matrix. |
| Compare agent runtimes | Run the same benchmark across Codex, Copilot CLI, Pi, OpenCode, Claude Code, and Antigravity CLI. |
| Measure reliability and efficiency | Repeat each cell and inspect pass rate, token usage, latency, errors, and artifacts. |
| Protect benchmark integrity | Materialize fresh workspaces and expose only declared capabilities and minimum authentication state. |
| Improve skills systematically | Search scored variants, distill traces, reflect across Pareto cases, or coevolve mutation operators. |

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

## Skill toolkit

The repository's maintained skill surface uses Harbor-native evaluation,
reporting, and evolution workflows.

Atomic skills keep their references, scripts, and other relative resources
inside one independently copyable directory. They may declare shared platform
dependencies such as another executable. A multi-skill or mixed-capability
profile measures that composition, not the individual causal effect of one
member.

| Skill | Use it when |
| --- | --- |
| [`harbor-run-results`](./skills/harbor-run-results/SKILL.md) | You need to run or inspect Harbor jobs and publish a native final JSON and Markdown report without Skill Arena. |
| [`harbor-resume-external-failures`](./skills/harbor-resume-external-failures/SKILL.md) | You need to continue only independently attested external Harbor failures without rerunning semantic outcomes or selecting the best retry. |
| [`harbor-evolve-skill`](./skills/harbor-evolve-skill/SKILL.md) | You need Harbor trials and GEPA reflection to evolve SKILL.md and gate it on an untouched holdout. |
| [`harbor-population-search`](./skills/harbor-population-search/SKILL.md) | You need broad candidate search ranked from native Harbor rewards and errors. |
| [`harbor-trace-distillation`](./skills/harbor-trace-distillation/SKILL.md) | You need to consolidate recurring lessons from native Harbor trial traces. |
| [`harbor-reflective-pareto-search`](./skills/harbor-reflective-pareto-search/SKILL.md) | You need per-case Harbor feedback and a non-dominated candidate archive. |
| [`harbor-operator-coevolution`](./skills/harbor-operator-coevolution/SKILL.md) | You need Harbor-derived parent-to-child credit to evolve mutation operators. |

The `skill-arena-*` workflow skills and the `harbor-runner` Skill Arena report
bridge are deprecated. They remain in the repository only for legacy
reproduction and migration; use the Harbor-native skills above for new work.

### Choose an improvement workflow

<p align="center">
  <img src="https://raw.githubusercontent.com/mvk-001/skill-arena/main/docs/assets/improvement-workflows.gif" width="1200" alt="Skill Arena selects among four evidence-driven skill-improvement workflows on top of a trusted benchmark.">
</p>

| Workflow | Best input | Selection mechanism | Best fit |
| --- | --- | --- | --- |
| Population search | Repeatable scalar fitness | Score all candidates and keep the top two | Stable objective, affordable breadth |
| Trace distillation | Labeled success/failure traces | Consolidate recurrent, conflict-free patches | Existing evidence pool, recurring lessons |
| Reflective Pareto search | Per-case scores plus diagnoses | Preserve non-dominated case specialists and robust merges | Heterogeneous tasks and rich feedback |
| Operator coevolution | Multi-generation operator credit | Evolve mutation instructions with skill candidates | Fixed operators have plateaued |

All four keep the benchmark fixed and use a holdout promotion gate. See
[Research foundations](./docs/research-foundations.md) for provenance and
[strategy evaluation](./docs/strategy-evaluation.md) for the reproducible
corpus, replay results, live benchmark, and decision guide.

The maintained workflows execute or inspect standard Harbor jobs, derive
selection evidence from native job and trial artifacts, and never invoke Skill
Arena configuration, runtime modules, or normalized reports. The former Skill
Arena variants are deprecated and retained only for legacy reproduction and
migration.

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
