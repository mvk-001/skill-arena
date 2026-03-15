## Summary

Describe the change in 2-5 sentences. Focus on the repository behavior that changed and why it matters.

## Scope

- Benchmark authoring
- Runtime or materialization logic
- Adapter behavior
- Documentation
- Tests
- Other:

## Benchmark Impact

State whether this change affects any of the following:

- Manifest schema or normalization
- Compare config schema or expansion
- Workspace materialization
- Skill injection or `system-installed` handling
- Promptfoo config generation
- Result normalization or reporting
- None

## Validation

List the commands you ran and the result.

```text
npm test
```

Add any manifest validation, config generation, benchmark, or compare commands that are relevant to this change.

## Checklist

- [ ] Repository artifacts added or changed are written in English.
- [ ] The change does not introduce an undocumented benchmark or compare format.
- [ ] Specs or architecture docs were updated if behavior or schema changed.
- [ ] Agent-specific behavior remains in the adapter layer when applicable.
- [ ] `skillSource: "system-installed"` is used when a benchmark depends on a system-installed skill.
- [ ] New or changed benchmark files keep the prompt focused on the task instead of adding harness instructions.
- [ ] Tests were added or updated when behavior changed.

## Risks

Describe any compatibility risks, migration concerns, or known gaps. If there are none, write `None`.
