# Harbor Skill Evolution

[![Harbor 0.18.0](https://img.shields.io/badge/Harbor-0.18.0-652f6c)](./skills/harbor-run-results/SKILL.md) [![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![7 atomic skills](https://img.shields.io/badge/skills-7_atomic-007298)](#skills)

Seven self-contained skills evaluate, report, recover, and evolve agent skills
directly from native Harbor jobs. There is no Skill Arena runtime, Promptfoo
translation layer, or duplicate evolution implementation.

Each bundle owns its executable contract and dependencies. The repository also
preserves two versioned evolution studies and their public, sanitized evidence.

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

Use `harbor-run-results`, optionally add recovery, and choose one evolver for a
declared development stage.

| Skill | Use it for |
| --- | --- |
| [`harbor-run-results`](./skills/harbor-run-results/SKILL.md) | Validate or execute a native `JobConfig`, inspect completed jobs, compare baseline and treatment, and write `final-report.md` plus `final-report.json`. Start here. |
| [`harbor-resume-external-failures`](./skills/harbor-resume-external-failures/SKILL.md) | Retry only cells proven unavailable because of an external provider, authentication, environment, evaluator, or infrastructure failure. It is not an optimizer. |
| [`harbor-population-search`](./skills/harbor-population-search/SKILL.md) | Rank a baseline and several real alternatives with one trusted scalar objective. |
| [`harbor-trace-distillation`](./skills/harbor-trace-distillation/SKILL.md) | Consolidate recurring, independently supported lessons from completed success and failure traces. |
| [`harbor-reflective-pareto-search`](./skills/harbor-reflective-pareto-search/SKILL.md) | Preserve complementary candidates when case-level strengths conflict and verified local feedback exists. |
| [`harbor-operator-coevolution`](./skills/harbor-operator-coevolution/SKILL.md) | Learn which mutation instructions improve their own parents after several attributable generations. |
| [`harbor-evolve-skill`](./skills/harbor-evolve-skill/SKILL.md) | Let GEPA rewrite complete `SKILL.md` text from training feedback and select on validation before holdout. |

Read the chosen `SKILL.md` before authoring its config. It defines exact
inputs, commands, modes, evidence checks, outputs, and validation.

## Common workflow

1. Freeze the baseline bundle and digest, development and holdout tasks,
   `JobConfig`, agent/model profile, attempts, rewards, hard gates, budget, and
   promotion policy.
2. Validate with `--dry-run` and `--doctor` before any model call. A plain
   Harbor config can be checked with:

   ```bash
   uvx --from harbor==0.18.0 harbor run --config <job.yaml> --print-config
   ```

3. Reuse complete, provenance-valid jobs through `--analyze-only`, `--skip-run`,
   or reporting-only operation instead of rerunning them.
4. Keep Harbor's built-in retry count at zero. Use selective recovery only for
   independently proven external failures; never retry semantic failures to
   search for a better score.
5. Run one evolution mechanism against development evidence. Preserve every
   candidate, rejection, lineage edge, cost, and native job.
6. Open holdout once for the unchanged baseline and one frozen development
   winner. Never feed holdout evidence back into mutation or selection.
7. Promote only when holdout policy and ordinary bundle validation pass;
   otherwise retain the baseline.

A minimal native config is available at
[`test/fixtures/job-configs/skill.yaml`](./test/fixtures/job-configs/skill.yaml).

## Preserved evolution evidence

- [`evaluations/harbor-evolution-comparison/`](./evaluations/harbor-evolution-comparison/)
  is the closed four-strategy study: 24 eligible jobs, 78 trials, frozen
  protocol and locks, a [human report](./evaluations/harbor-evolution-comparison/results/20260716/report.md),
  and a [machine summary](./evaluations/harbor-evolution-comparison/results/20260716/summary.json).
- [`evaluations/knowledge-consult-evolution/`](./evaluations/knowledge-consult-evolution/)
  preserves the Q003 study and append-only meta-evolution history. Its README
  records which generations are sealed, unevaluated, or prospective; do not
  describe them all as completed or promotable.

Raw native jobs remain ignored under `.tmp/harbor-evolution-comparison/` and
`.tmp/knowledge-consult-evolution/` because they may contain credentials,
reasoning, answers, local paths, or private verifier data. Back them up outside
Git; never delete or merge them as part of repository cleanup.

The root `package.json` and `package-lock.json` are intentionally historical.
Q003 generation 003 seals their exact paths and SHA-256 values as part of its
verification TCB. Do not edit, move, or regenerate them even though the former
npm CLI has been removed.

Research provenance and adaptation limits are summarized in
[`docs/research-foundations.md`](./docs/research-foundations.md). Durable Harbor
decisions remain under [`.specs/adr/`](./.specs/adr/).

## Validate changes

```bash
npm run docs:check
npm run skills:check
npm test
```

`npm test` covers the seven bundles, native reporting fixtures, sealed recovery
contracts, and both evolution studies. The slow environment-dependent V2–V5
recovery audit is separate:

```bash
node --test test/audit/*.test.js
```

Run that audit from the same WSL/Linux evidence environment used to create the
sealed contracts. Historical Skill Arena CLI code and workflows remain
available in Git history, not in the maintained tree.
