# ADR: Source-Free Workspaces

Date: 2026-07-12

## Status

Accepted

## Context

Some evaluations measure pure response behavior, remote tools, or capabilities
that do not need any files in the agent workspace. The declarative workspace
schema required at least one `workspace.sources` entry, forcing authors to add a
no-op `type: empty` source even when there was no source to describe.

That placeholder added configuration noise and made the source list less
truthful: an evaluation with no inputs appeared to have one input.

## Decision

Declarative workspaces may contain zero sources. Both of these forms are valid
and normalize to `workspace.sources: []`:

```yaml
workspace:
  sources: []
  setup:
    initializeGit: true
```

```yaml
workspace:
  setup:
    initializeGit: true
```

Workspace setup, environment passthrough, profile capability materialization,
skill overlays, runtime isolation, and optional Git initialization continue to
run normally when the source list is empty.

The `empty` source type remains supported for backward compatibility and for
layered configurations that intentionally need an explicit no-op entry. New
source-free evaluations should omit `sources` or use `sources: []`.

Legacy `workspace.fixture` and declarative workspace fields must not be mixed in
one workspace object.

## Consequences

- Pure prompt and remote-tool evaluations no longer need placeholder sources.
- Normalized manifests always expose `workspace.sources` as an array.
- Existing configs using `type: empty` continue to work.
- The generator exposes `--workspace-source-type none` for this case.
