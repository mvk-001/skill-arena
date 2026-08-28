# Harbor Skill Evolution: repository guide

Independently copyable skills for running, inspecting, recovering, and improving skills with native Harbor jobs. The repository also preserves versioned studies and research provenance for the evaluation and evolution workflow.

## Layout

| Path | Responsibility |
| --- | --- |
| `skills/` | Self-contained Harbor contracts and their supporting resources. |
| `evaluations/` | Preserved studies, protocols, locks, and reviewed evidence. |
| `test/` | Bundle, reporting, recovery, and historical-contract tests. |
| `scripts/` | Documentation and bundle validators. |
| `docs/` | Workflow overview, research provenance, and maintenance. |
| `.specs/adr/` | Durable evidence and architecture decisions. |

## Documentation policy

- Keep the root `README.md` focused on purpose, critical constraints, and the first useful action. Put detailed procedures in `docs/`.
- Maintain `docs/README.md` as the navigation index whenever a guide is added or moved.
- Preserve existing specification, ADR, skill-contract, and evidence locations. Link to their owners instead of copying authoritative content.
- Keep implementation, configuration, source data, and generated output separate. Do not create empty folder hierarchies without a concrete need.
- Use portable relative links. Update both outgoing links and inbound references when moving a document.
- Document prerequisites, commands, expected outcomes, and limitations. Never describe an unrun check as verified.

## Change workflow

1. Read `AGENTS.md`, this index, and the relevant source contract.
2. Inspect `git status` and preserve pre-existing changes and staged files.
3. Make a focused change and update affected documentation in the same change.
4. Run the applicable checks below, inspect the diff, and record any unavailable prerequisite.
5. Stage explicit paths. Publish only when authorized; do not force-push or merge unrelated work.

## Validation

```sh
npm run docs:check
npm run skills:check
npm test
```

Run `node --test test/audit/*.test.js` only in the matching WSL/Linux evidence environment. Do not substitute an unqualified local run for a sealed historical audit.

## Data and operating boundaries

Do not edit or move `package.json` or `package-lock.json`: sealed studies bind their exact hashes and paths. Preserve tracked study evidence and ignored native jobs; never delete, republish, or expose private traces. Candidate selection must never consume independent validation or holdout evidence.

[Back to the documentation index](README.md).
