# Skill Arena

[![Harbor native](https://img.shields.io/badge/workflow-Harbor--native-007298)](./docs/harbor-evolution-playbook.md) [![Harbor 0.18.0](https://img.shields.io/badge/Harbor-0.18.0-652f6c)](./skills/harbor-run-results/SKILL.md) [![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![Skill Arena CLI supported](https://img.shields.io/badge/Skill_Arena_CLI-supported-e77204)](#skill-arena-cli-supported-secondary-surface)

**Evaluate, report, recover, and evolve agent skills directly from native Harbor evidence.**

The primary maintained workflow in this repository is a collection of atomic
Harbor skills. They consume ordinary Harbor `JobConfig` files and native job
artifacts without routing execution, ranking, or reporting through the Skill
Arena runtime. Use them to establish a baseline, compare candidate skills,
learn from trial evidence, and promote a winner through an untouched holdout.

The public Skill Arena CLI remains supported for declarative cross-agent
capability comparisons. It is documented as a secondary surface below; its
former `skill-arena-*` evolution skills and the `harbor-runner` bridge are
deprecated.

**[Harbor quick start](#harbor-quick-start) · [Harbor skills](#harbor-skills) · [Evolution strategy](#choose-one-evolution-strategy) · [Command map](#zero-call-command-map) · [Skill Arena CLI](#skill-arena-cli-supported-secondary-surface) · [Documentation](#documentation)**

## Harbor quick start

### Requirements

- Python 3.12 or newer and [`uv`](https://docs.astral.sh/uv/)
- Docker when the selected Harbor environment uses containers
- the credentials required by the agent and model declared in the native
  `JobConfig`
- one native Harbor YAML or JSON job template; start from the
  [checked-in example](./evaluations/harbor-report-parity-poc/jobs/skill.yaml)

The scripts pin Harbor 0.18.0 in PEP 723 metadata, so a separate Harbor package
installation is not required. Validation, `--dry-run`, `--doctor`, and
artifact-only analysis make no model calls.

### Install only the skills you need

Each Harbor skill is an independently copyable bundle. Copy the entire skill
directory, including `scripts/`, `references/`, and `agents/`; copying only
`SKILL.md` produces an incomplete installation.

```bash
git clone https://github.com/mvk-001/skill-arena.git
cd skill-arena

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R skills/harbor-run-results "$CODEX_HOME/skills/"
cp -R skills/harbor-population-search "$CODEX_HOME/skills/"
```

The first bundle is the default entry point for execution and reporting.
Replace `harbor-population-search` with the single evolver that matches your
evidence regime, or install another bundle later. In PowerShell, the equivalent
copy is:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$SkillHome = Join-Path $CodexHome "skills"
New-Item -ItemType Directory -Force $SkillHome | Out-Null
Copy-Item -Recurse -Force skills/harbor-run-results $SkillHome
Copy-Item -Recurse -Force skills/harbor-population-search $SkillHome
```

Start a new Codex task after installation so the copied bundles are present in
its skill catalog.

### Run and report a native Harbor job

With `harbor-run-results` installed, a direct request to Codex can own the full
safe workflow:

```text
Use harbor-run-results to validate jobs/baseline.yaml without launching an
agent. If it is valid, run it under a new job name and write a final report to
reports/baseline. Preserve the native job and do not overwrite prior evidence.
```

The equivalent direct commands are:

```bash
# Validate and print the resolved config without an agent call.
uvx --from harbor==0.18.0 harbor run --config jobs/baseline.yaml --print-config

# Execute only after validation, using a unique immutable job name.
uvx --from harbor==0.18.0 harbor run \
  --config jobs/baseline.yaml \
  --job-name baseline-001

# Produce a native report from the completed job.
uv run <harbor-run-results-root>/scripts/report_harbor_jobs.py \
  <jobs-directory>/baseline-001 \
  --output-dir reports/baseline-001
```

Compare an unchanged baseline with one treatment by passing the baseline first:

```bash
uv run <harbor-run-results-root>/scripts/report_harbor_jobs.py \
  <jobs-directory>/baseline-001 \
  <jobs-directory>/treatment-001 \
  --compare \
  --output-dir reports/baseline-vs-treatment
```

The reporter writes `final-report.md` for review and `final-report.json` for
automation. It fails closed on incomplete jobs, task drift, agent/model drift,
attempt drift, or incompatible lock provenance.

## Harbor skills

Use one execution/reporting skill, an optional recovery layer, and exactly one
primary evolution strategy for each declared development stage.

| Responsibility | Maintained skill | Use it when |
| --- | --- | --- |
| Execute and report | [`harbor-run-results`](./skills/harbor-run-results/SKILL.md) | Validate or run a native job, inspect completed artifacts, compare baseline and treatment, or publish final reports. Start here. |
| Recover availability | [`harbor-resume-external-failures`](./skills/harbor-resume-external-failures/SKILL.md) | Structured evidence proves that selected cells failed because of a provider, authentication, environment, evaluator, or infrastructure outage. Never use it to retry semantic failures. |
| Scalar population search | [`harbor-population-search`](./skills/harbor-population-search/SKILL.md) | One trusted scalar objective can score an unchanged baseline and several genuine alternatives. |
| Trace distillation | [`harbor-trace-distillation`](./skills/harbor-trace-distillation/SKILL.md) | Diverse completed success and failure traces contain recurring lessons supported across independent tasks and trials. |
| Reflective Pareto search | [`harbor-reflective-pareto-search`](./skills/harbor-reflective-pareto-search/SKILL.md) | Cases conflict and each weak case has verified local feedback; an aggregate mean would hide complementary strengths. |
| Operator coevolution | [`harbor-operator-coevolution`](./skills/harbor-operator-coevolution/SKILL.md) | Several generations provide unambiguous parent-child-operator lineage and multiple established mutation operators. |
| Integrated GEPA evolution | [`harbor-evolve-skill`](./skills/harbor-evolve-skill/SKILL.md) | One optimizer should rewrite complete `SKILL.md` text from training feedback and select candidates on validation before holdout. |

> [!IMPORTANT]
> The repository-maintained `skill-arena-*` workflow bundles and
> [`harbor-runner`](./skills/harbor-runner/SKILL.md) are compatibility-only.
> Do not use them for new evaluation, reporting, or skill-evolution workflows.

## Choose one evolution strategy

Choose from the evidence available before the search starts. Do not execute
every strategy and select whichever happened to return the highest score.

![Harbor evolution strategy selector](./docs/assets/harbor-evolution/harbor-evolution-selector.static.svg)

| Skill | Best when | Strategy | Avoid when |
| --- | --- | --- | --- |
| [`harbor-population-search`](./skills/harbor-population-search/SKILL.md) | A stable scalar objective can evaluate a baseline and several alternatives. | Rank hard-gated Harbor fitness, retain the top two, then create focused mutation or crossover children. | There is only one child, important cases conflict, or a mean can hide regressions. |
| [`harbor-trace-distillation`](./skills/harbor-trace-distillation/SKILL.md) | Completed traces contain recurring, independently supported lessons. | Cite bounded evidence, require support across trials and task checksums, resolve conflicts, and consolidate patches. | Evidence is sparse, correlated, external-only, or cannot justify a safe edit. |
| [`harbor-reflective-pareto-search`](./skills/harbor-reflective-pareto-search/SKILL.md) | Case outcomes conflict and weak cases have verified local feedback. | Build hard-gated case vectors, preserve non-dominated candidates, reflect on weaknesses, and create lineage-bound children. | Only an aggregate reward exists or full case-vector reevaluation is unaffordable. |
| [`harbor-operator-coevolution`](./skills/harbor-operator-coevolution/SKILL.md) | Repeated generations expose reliable parent-child-operator credit. | Measure parent-to-child gains, enforce establishment gates, and breed mutation instructions that repeatedly produce qualified children. | This is a first generation, attribution is ambiguous, or fewer than two operators are established. |
| [`harbor-evolve-skill`](./skills/harbor-evolve-skill/SKILL.md) | GEPA should author full `SKILL.md` candidates automatically. | Reflect on bounded training evidence, preserve Pareto-useful text candidates, select on validation, then open untouched holdout. | Scripts, references, or assets must change, or deterministic patch-level control is required. |

Read the [Harbor evolution playbook](./docs/harbor-evolution-playbook.md) for
the full decision rules, diagrams, composition boundaries, budgets, stop rules,
and promotion gates.

## Harbor operating sequence

1. **Freeze the contract.** Preserve the baseline skill and digest,
   development and holdout task checksums, agent, model, attempts, reward key,
   hard gates, environment, timeout, and promotion policy.
2. **Validate without calls.** Run the selected skill with `--dry-run`, then
   `--doctor`. Fix schema, paths, credentials, Docker, and skill identity
   before live evaluation.
3. **Reuse canonical evidence.** Prefer `--analyze-only`, `--skip-run`, or
   reporting-only operation when complete provenance-valid Harbor jobs exist.
4. **Repair only availability.** Use `harbor-resume-external-failures` only for
   independently proven external failures. Preserve successful and semantic
   outcomes.
5. **Use one evolution mechanism.** Spend development calls once per declared
   candidate-task-attempt cell and preserve every candidate and cost.
6. **Open holdout once.** Evaluate only the unchanged baseline and the single
   frozen development winner. Never feed final holdout evidence back into
   candidate generation.
7. **Report and promote.** Use `harbor-run-results`; promote only when the
   holdout policy and ordinary bundle validation both pass.

Keep Harbor's built-in retry count at zero. Selective recovery is a separate,
auditable evidence-producing operation rather than an invisible benchmark
retry.

### Zero-call command map

In these commands, `<skill-root>` means the installed directory for that
bundle. Run the linked skill's `--dry-run` and `--doctor` contract before
omitting the mode flag for live execution.

| Skill | First safe command |
| --- | --- |
| `harbor-run-results` | `uvx --from harbor==0.18.0 harbor run --config <job.yaml> --print-config` |
| `harbor-population-search` | `uv run <skill-root>/scripts/search_harbor_population.py --job-template <development.yaml> --candidate baseline=<baseline-skill> --candidate candidate-01=<candidate-skill> --baseline baseline --output <run-dir> --doctor` |
| `harbor-trace-distillation` | `uv run <skill-root>/scripts/distill_harbor_traces.py <config.yaml> --doctor` |
| `harbor-reflective-pareto-search` | `uv run <skill-root>/scripts/harbor_reflective_pareto.py <config.yaml> --doctor` |
| `harbor-operator-coevolution` | `uv run <skill-root>/scripts/harbor_operator_coevolution.py <generation.yaml> --doctor` |
| `harbor-evolve-skill` | `uv run <skill-root>/scripts/evolve_skill_with_harbor.py <evolution.yaml> --doctor` |
| `harbor-resume-external-failures` | `uv run <skill-root>/scripts/resume_external_failures.py <config.yaml> --doctor` |

For example, a scalar generation begins with a frozen baseline plus at least
one genuine candidate. Add `--holdout-template` before a live run when the
development winner should be eligible for promotion:

```bash
uv run <harbor-population-search-root>/scripts/search_harbor_population.py \
  --job-template harbor-development.yaml \
  --candidate baseline=/skills/my-skill \
  --candidate candidate-01=/candidates/my-skill \
  --baseline baseline \
  --reward-key reward \
  --pass-threshold 1 \
  --minimum-development-pass-rate 1 \
  --holdout-template harbor-holdout.yaml \
  --minimum-holdout-gain 0.05 \
  --output search-run \
  --doctor
```

Replace `--doctor` with `--dry-run` to inspect the exact job plan. Omit the
mode flag only after both checks pass. Use `--analyze-only` with exact completed
job mappings to rank existing evidence without launching agents.

## Native evidence and outputs

The Harbor skills preserve and validate the evidence needed for a defensible
decision:

- requested `JobConfig` and resolved `lock.json` skill provenance;
- root and per-trial results, rewards, exceptions, usage, and timing;
- task checksums, agent/model identity, attempts, trajectories, verifier
  diagnostics, and collected artifacts;
- candidate lineage, frozen bundle digests, selection rationale, holdout gates,
  and call/cost accounting produced by the selected evolver.

This evidence remains in native Harbor jobs. Evolution scripts write their own
append-only analysis and candidate artifacts; `harbor-run-results` writes
`final-report.json` and `final-report.md` without importing Skill Arena runtime
modules or schemas.

## Skill Arena CLI: supported secondary surface

Use the public CLI when the task is a declarative cross-agent capability
comparison across Codex, Copilot CLI, Pi, OpenCode, Claude Code, or Antigravity
CLI. Do not use its deprecated workflow skills for new evolution logic.

### CLI prerequisites and installation

- Node.js 24 or newer
- Git on `PATH`
- at least one [supported agent CLI](#supported-agent-runtimes), installed and
  authenticated

```bash
git clone https://github.com/mvk-001/skill-arena.git
cd skill-arena
npm install
```

### CLI quick start

```bash
# Validate the compare contract.
npx . val-conf ./evaluations/skill-arena-config-author/evaluation.yaml

# Materialize workspaces and inspect the plan without launching agents.
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run

# Execute the live cross-agent comparison.
npx . evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
```

> [!TIP]
> Start with `--dry-run`. It catches schema, routing, workspace, and capability
> materialization problems before a live evaluation consumes time or quota.

Create a new compare config with:

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

| Command | Purpose |
| --- | --- |
| `skill-arena gen-conf [options]` | Generate a commented compare-config template. |
| `skill-arena val-conf <config>` | Validate YAML or JSON and print its normalized shape. |
| `skill-arena evaluate <config> --dry-run` | Plan the matrix and materialize workspaces without launching agents. |
| `skill-arena evaluate <config>` | Execute the benchmark and write normalized artifacts. |

Use `skill-arena help <command>` or the [CLI reference](./docs/cli-reference.md)
for every option.

### Supported agent runtimes

| Adapter | Local executable | V1 compare capabilities |
| --- | --- | --- |
| `codex` | `codex` | instructions, skills |
| `copilot-cli` | `copilot` | instructions, skills, agents, hooks |
| `pi` | `pi` | skills |
| `opencode` | `opencode` | instructions, skills, agents |
| `claude-code` | `claude` | instructions, skills, agents, hooks |
| `antigravity-cli` | `agy` | instructions, skills, agents, hooks, MCP, plugins |

Every comparison unit receives a fresh materialized workspace. Runtime homes
are isolated where the agent permits it, only minimum authentication state is
seeded, and secret values remain outside YAML and generated Promptfoo
artifacts. See [runtime isolation](./docs/architecture.md#effective-runtime-isolation)
and [credential passthrough](./docs/usage.md#pass-credentials-without-storing-secrets).

CLI compare artifacts are written under
`results/<benchmark-id>/<timestamp>-compare/`, including `summary.json` and
`merged/report.md`. This schema is separate from Harbor's native jobs and
`final-report.*` output.

## Documentation

| Document | Use it for |
| --- | --- |
| [Harbor evolution playbook](./docs/harbor-evolution-playbook.md) | Select, compose, validate, execute, recover, stop, and promote Harbor-native workflows. |
| [Individual Harbor skills](./skills/) | Read the executable contract and references for the selected atomic bundle. |
| [Strategy evaluation](./docs/strategy-evaluation.md) | Review the measured strategy comparison and its limitations. |
| [Research foundations](./docs/research-foundations.md) | Trace papers, related work, and adaptation boundaries behind each evolver. |
| [Documentation index](./docs/README.md) | Navigate all Harbor, CLI, and contributor documentation by task. |
| [Skill Arena usage guide](./docs/usage.md) | Author and execute supported cross-agent CLI comparisons. |
| [CLI reference](./docs/cli-reference.md) | Look up CLI commands, options, and environment variables. |
| [Architecture](./docs/architecture.md) | Understand runtime boundaries, isolation, adapters, and module ownership. |
| [Configuration specs](./docs/specs.md) | Read the canonical Skill Arena schema and normalization contract. |
| [Testing](./docs/testing.md) | Validate documentation, skill bundles, runtime code, configs, and live runs. |
| [ADRs](./.specs/adr/) | Review durable technical and workflow decisions. |

Executable Harbor examples live under
[`evaluations/harbor-evolution-comparison/`](./evaluations/harbor-evolution-comparison/)
and [`evaluations/harbor-report-parity-poc/`](./evaluations/harbor-report-parity-poc/).
Diagram sources and verification renders live under
[`docs/assets/`](./docs/assets/).

## Project status and development

The Harbor skill bundles pin their evaluation dependency and remain portable
outside this repository. The public Skill Arena CLI is pre-1.0 and currently
documents schema V1; its agent adapters do not expose identical policies.

Before submitting changes:

```bash
npm run check
npm run test:coverage
```

Contributors should read [`AGENTS.md`](./AGENTS.md), preserve the documented
package scope, and record durable decisions under [`.specs/adr/`](./.specs/adr/).
