# ADR: Four Harbor-Native Skill Evolution Strategies

Date: 2026-07-16

## Status

Accepted

## Context

The repository has four Skill Arena evolution strategies that operate over
declared scores or normalized trace inputs: population search, trace
distillation, reflective Pareto search, and operator coevolution. It also has a
Harbor+GEPA optimizer, but not one Harbor-native skill for each evidence regime.

Users with Harbor task corpora need the strategy loop to execute standard
Harbor jobs and learn from their native artifacts. Routing those jobs through
Skill Arena would add a second evaluation contract and would prevent the
evolution workflow from being portable to a Harbor-only workspace.

## Decision

- Add four atomic, independently copyable bundles:
  - `harbor-population-search`
  - `harbor-trace-distillation`
  - `harbor-reflective-pareto-search`
  - `harbor-operator-coevolution`
- Pin Harbor 0.18.0 in each executable script through uv inline dependency
  metadata. A Harbor upgrade requires fixture validation against its models and
  artifact layout.
- Use ordinary Harbor JobConfig inputs and one candidate skill per job. A
  candidate run may override only job identity, output directory, quiet mode,
  and the evaluated agent skill path.
- Preserve and validate Harbor `config.json`, `lock.json` when present,
  root `result.json`, per-trial `result.json`, trajectories, agent output,
  verifier output, and collected artifacts.
- Keep the bundles independent of Skill Arena configuration, runtime modules,
  CLI commands, and normalized result schemas.
- Derive each method's evidence directly from Harbor:
  - candidate reward and errors for population fitness
  - success/failure trials, task checksums, trajectories, and verifier evidence
    for trace support
  - task-agent-model case vectors and diagnostics for Pareto reflection
  - parent-to-child fitness deltas for mutation-operator credit
- Keep development selection and holdout promotion separate. Reject task
  checksum overlap, compare baseline and selected candidate under equivalent
  Harbor settings, and never overwrite or install the source skill.
- Keep `harbor-evolve-skill` as the integrated Harbor+GEPA optimizer. The new
  reflective Pareto bundle is the deterministic native-job artifact workflow,
  so its archive and reflection steps remain inspectable and agent-mediated.

## Consequences

- Harbor users can choose the same four evolution mechanisms without adopting
  Skill Arena as an evaluation layer.
- Native job and lock provenance makes the evaluated task, agent, model,
  environment, attempts, and candidate skill digest reviewable.
- Mutation and patch generation still require an editing agent; deterministic
  scripts own execution, evidence normalization, ranking, support accounting,
  credit, and promotion gates.
- Offline jobs without locked skill digests may support exploratory diagnosis
  where a bundle explicitly allows them, but they cannot establish candidate
  provenance or causal improvement. Prefer jobs created by the bundle itself.
- The four bundles intentionally duplicate a small amount of Harbor artifact
  validation to preserve atomic installation. They must be regression-tested
  together when the pinned Harbor contract changes.
- Strategy replay results and Harbor live results remain different evidence
  layers and must not be combined into one performance claim.
