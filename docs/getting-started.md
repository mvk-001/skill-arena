# Harbor Skill Evolution: usage and operations

Run commands from the repository root unless a different working directory is shown.

[![Harbor 0.18.0](https://img.shields.io/badge/Harbor-0.18.0-652f6c)](../skills/harbor-run-results/SKILL.md) [![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![12 atomic skills](https://img.shields.io/badge/skills-12_atomic-007298)](#skills)

Twelve self-contained skills author datasets, organize, plan, evaluate, report,
recover, materialize, and evolve agent skills around one native Harbor evidence
surface.
There is no Skill Arena runtime, Promptfoo translation layer, or duplicate
evaluation implementation.

Each bundle owns its executable contract and dependencies. The repository also
preserves three versioned studies and their public, sanitized evidence.

## Install

Requirements: Python 3.12+, [`uv`](https://docs.astral.sh/uv/), Docker for
container environments, and the credentials required by the selected Harbor
agent. Scripts pin Harbor 0.18.0 through inline metadata.

Clone the repository, then copy complete bundles into the Codex skill catalog:

```bash
git clone https://github.com/mvk-001/skill-arena.git
cd skill-arena
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R skills/harbor-* "$CODEX_HOME/skills/"
```

PowerShell:

```powershell
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$SkillHome = Join-Path $CodexHome "skills"
New-Item -ItemType Directory -Force $SkillHome | Out-Null
Copy-Item -Recurse -Force skills/harbor-* $SkillHome
```

Copy the whole directory, not only `SKILL.md`. Install only the bundles you
need, then start a new Codex task so they are discovered.

## Skills

Use `harbor-author-evaluation-datasets` to design leakage-resistant native task
roots, then use `harbor-organize-evaluations` to freeze study splits and track
the ordered lifecycle, `harbor-run-results` for native evaluation and reports,
optionally add recovery, use the realizer when a mutation plan needs a sealed
child, and choose one evolver for a declared development stage. Every evolution
must also declare an independent, optimizer-invisible validation dataset and
downstream validation stage before it starts. Use MetaSkill replay only after
comparable branch evidence exists. Keep datasets and raw evaluation artifacts
local: the organizer's Git allowlist exposes only its publication indexes and
explicitly reviewed aggregate result tables.

| Skill | Use it for |
| --- | --- |
| [`harbor-author-evaluation-datasets`](../skills/harbor-author-evaluation-datasets/SKILL.md) | Define semantic task families, assign group-disjoint splits, materialize deterministic seeded response-surface variants, audit adapters and verifiers, and render publication-safe cross-run Markdown plus static SVGs from finalized native reports. Start here when the datasets do not already exist. |
| [`harbor-organize-evaluations`](../skills/harbor-organize-evaluations/SKILL.md) | Freeze dataset manifests, require development plus sealed validation before evolution starts, bind the frozen candidate and release validation/holdout in order, and expose only Git-safe indexes and reviewed aggregate result tables. Start here for a multi-stage study. |
| [`harbor-run-results`](../skills/harbor-run-results/SKILL.md) | Validate or execute a native `JobConfig`, inspect completed jobs, compare baseline and treatment, and write `final-report.md` plus `final-report.json`. Start here for one job or comparison. |
| [`harbor-resume-external-failures`](../skills/harbor-resume-external-failures/SKILL.md) | Retry only cells proven unavailable because of an external provider, authentication, environment, evaluator, or infrastructure failure. It is not an optimizer. |
| [`harbor-population-search`](../skills/harbor-population-search/SKILL.md) | Rank a baseline and several real alternatives with one trusted scalar objective. |
| [`harbor-trace-distillation`](../skills/harbor-trace-distillation/SKILL.md) | Consolidate recurring, independently supported lessons from completed success and failure traces. |
| [`harbor-reflective-pareto-search`](../skills/harbor-reflective-pareto-search/SKILL.md) | Preserve complementary candidates when case-level strengths conflict and verified local feedback exists. |
| [`harbor-operator-coevolution`](../skills/harbor-operator-coevolution/SKILL.md) | Learn which mutation instructions improve their own parents after several attributable generations. |
| [`harbor-evolve-skill`](../skills/harbor-evolve-skill/SKILL.md) | Let GEPA rewrite and select complete `SKILL.md` text on evolution data, then validate one frozen winner before opening holdout. |
| [`harbor-maximize-knowledge-expertise`](../skills/harbor-maximize-knowledge-expertise/SKILL.md) | Bind a knowledge skill and sanitized development evidence, classify multi-dimensional expertise gaps, and emit exact benchmark-agnostic mutation portfolios without scoring or opening holdout. |
| [`harbor-realize-skill-candidate`](../skills/harbor-realize-skill-candidate/SKILL.md) | Turn a frozen parent plus an exact mutation contract into a complete, validated, digest-sealed candidate bundle without granting the realizer evaluation or selection authority. |
| [`harbor-metaskill-evolution`](../skills/harbor-metaskill-evolution/SKILL.md) | Replay branch-local task and five-policy meta-state from digest-bound development evidence, then compute hard-gated productivity and identity-partitioned frontier decisions without a configured holdout input. |

Read the chosen `SKILL.md` before authoring its config. It defines exact
inputs, commands, modes, evidence checks, outputs, and validation.

## Common workflow

Choose a method using its evidence requirements, not its apparent complexity.
The [methodology review](methodology-review.md) maps all twelve responsibilities
and separates executable guards from study-level scientific judgments. Keep
budgets, stopping rules, and the finalist rule in the private study protocol;
do not add unsupported fields to a runner's configuration.

1. Before study initialization, use `harbor-author-evaluation-datasets` to
   define source and scenario families, assign families to splits, materialize
   seeded nuisance variants, test reference and shortcut solutions, audit
   leakage, and freeze separate native Harbor roots. Keep sealed cohort plans,
   seeds, prompts, solutions, and verifiers outside the evolution workspace.
2. Initialize an ordered study; register disjoint discovery, development,
   validation, and optional holdout dataset locks; and declare skill-owned
   stages and dependencies with `harbor-organize-evaluations`.
3. Freeze the baseline bundle and digest, development, validation, and holdout
   tasks, `JobConfig`, agent/model profile, attempts, rewards, hard gates,
   budget, and promotion policy.
4. Validate with `--dry-run` and `--doctor` before any model call. A plain
   Harbor config can be checked with:

   ```bash
   uvx --from harbor==0.18.0 harbor run --config <job.yaml> --print-config
   ```

5. Reuse complete, provenance-valid jobs through `--analyze-only`, `--skip-run`,
   or reporting-only operation instead of rerunning them.
6. Keep Harbor's built-in retry count at zero. Use selective recovery only for
   independently proven external failures; never retry semantic failures to
   search for a better score.
7. When a mutation plan needs a complete child bundle, use the candidate
   realizer to bind the frozen parent, exact instruction, allowed paths, and
   validation evidence before evaluation.
8. Start one evolution mechanism only after the organizer accepts its
   development-only stage and already-planned downstream validation gate.
   Preserve every candidate, rejection, lineage edge, cost, and native job.
9. Bind the selected candidate bundle by digest, release validation exactly
   once, and compare only the unchanged baseline and frozen winner. Never feed
   validation evidence back into mutation, ranking, or reselection; use fresh
   validation in a new study after a failed gate.
10. If an additional holdout is declared, release it only after completed
   validation. Never feed holdout evidence back into mutation or selection.
11. Promote only when the independent gate, optional holdout policy, and
   ordinary bundle validation pass;
   otherwise retain the baseline.
12. After the owning release boundary permits aggregate publication, pass only
    finalized schema-version-1 `final-report.json` files to
    `consolidate_harbor_reports.py`. Review its quality, resource, and
    efficiency SVGs together: pass rate or reward never compensates silently
    for increased tokens, reported cost, agent time, wall time, or errors.

The report consolidator records source hashes and observation coverage, keeps
cached input as a subset of input tokens, and leaves missing cost or timing as
`n/a`. Its aggregate views do not establish comparability when task locks,
hardware, model, agent, attempts, or cache policy differ.

A minimal native config is available at
[`test/fixtures/job-configs/skill.yaml`](../test/fixtures/job-configs/skill.yaml).

## Preserved study evidence

- [`evaluations/harbor-evolution-comparison/`](../evaluations/harbor-evolution-comparison)
  is the closed four-strategy study: 24 eligible jobs, 78 trials, frozen
  protocol and locks, a [human report](../evaluations/harbor-evolution-comparison/results/20260716/report.md),
  and a [machine summary](../evaluations/harbor-evolution-comparison/results/20260716/summary.json).
- [`evaluations/knowledge-consult-evolution/`](../evaluations/knowledge-consult-evolution)
  preserves the Q003 study and append-only meta-evolution history. Its README
  records which generations are sealed, unevaluated, or prospective; do not
  describe them all as completed or promotable.
- [`evaluations/harbor-next-skill-comparison/`](../evaluations/harbor-next-skill-comparison)
  is the append-only contract and evidence assessment for the candidate
  realizer and MetaSkill adaptation. It distinguishes verified compatibility
  from hypotheses that prior evidence cannot identify.

Raw native jobs remain ignored under `.tmp/harbor-evolution-comparison/` and
`.tmp/knowledge-consult-evolution/` because they may contain credentials,
reasoning, answers, local paths, or private verifier data. Back them up outside
Git; never delete or merge them as part of repository cleanup.

The root `package.json` and `package-lock.json` are intentionally historical.
Q003 generation 003 seals their exact paths and SHA-256 values as part of its
verification TCB. Do not edit, move, or regenerate them even though the former
npm CLI has been removed.

Research provenance and adaptation limits are summarized in
[`docs/research-foundations.md`](research-foundations.md). Durable Harbor
decisions remain under [`.specs/adr/`](../.specs/adr).

## Validate changes

```bash
npm run docs:check
npm run skills:check
npm test
```

`npm test` covers the twelve bundles, native reporting fixtures, sealed recovery
contracts, and the versioned evolution studies. The slow environment-dependent
V2–V5 recovery audit is separate:

```bash
node --test test/audit/*.test.js
```

Run that audit from the same WSL/Linux evidence environment used to create the
sealed contracts. Historical Skill Arena CLI code and workflows remain
available in Git history, not in the maintained tree.
