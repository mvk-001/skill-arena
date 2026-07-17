# ADR: Independent Skill Artifacts and Explicit Compositions

Date: 2026-07-12

## Status

Accepted

## Context

Skill Arena isolates compare profiles by materializing fresh workspaces and
exposing only declared capabilities. That execution isolation does not by
itself make a skill portable. A skill can still depend on sibling skill
directories, repository-root files, or undeclared host state, and a profile can
combine several capabilities while presenting the result as evidence for one
skill.

Skills also legitimately reuse stable platform interfaces. Requiring every
skill to copy configuration parsing, evaluation execution, or external tool
logic into its own directory would create drift rather than useful
independence. Some workflows are intentionally composite or orchestrate other
skills and therefore cannot be represented honestly as atomic skills.

## Decision

- An atomic skill directory must be independently copyable as one unit. Files
  referenced by its `SKILL.md`, and relative resources or imports used by its
  scripts, must remain inside that skill directory.
- Atomic skills must not depend on sibling skill directories, repository-root
  helper files, or host personalization. Required platform dependencies such as
  the public Skill Arena CLI, another executable, an API, or a credential may
  remain external when the skill declares them explicitly and fails clearly
  when they are unavailable.
- Skills should reuse the supported `skill-arena evaluate`, `gen-conf`, and
  `val-conf` interfaces instead of embedding parallel runtime implementations.
  This explicit platform dependency does not make a skill composite.
- Composite and orchestrator skills are allowed when composition is their
  purpose. They must label themselves as composite or orchestrator and declare
  the skills, capability bundles, or external inputs they require.
- Repository-integrated composites may record machine-checkable exceptions in
  `skill-dependencies.json`. The contract names the classification and exact
  sibling skills, repository modules, and packages that may remain external;
  unlisted boundary escapes remain errors.
- A comparison between a control and a profile containing exactly one atomic
  skill may support a claim about that skill. A profile containing multiple
  skills, or a skill combined with instructions, agents, hooks, MCP, extensions,
  or plugins, supports a claim about the declared composition rather than the
  individual contribution of any member.
- Individual causal claims from a composition require additional profiles that
  isolate the relevant capability, such as single-capability or factorial
  comparisons under the same prompt, workspace, agent, and execution settings.

## Consequences

- Atomic skill folders can be moved, installed, and tested without copying
  unrelated repository content.
- Shared platform behavior remains centralized behind the public CLI contract.
- Composite workflows such as strategy evaluators remain supported, but their
  dependency and evidence boundaries are visible to users.
- Benchmark reports and documentation must distinguish individual-skill impact
  from bundle or composition impact.
- Skill validation needs an isolated-copy check for atomic skills and explicit
  dependency checks for composite or orchestrator skills.
- `npm run skills:check` enforces these boundaries for repository-maintained
  bundles and syntax-checks copied JavaScript helpers outside the monorepo.
