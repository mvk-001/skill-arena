# Trace Schema

Use one JSON file per trace.

## Required fields

- `traceId`
- `outcome`: `success` or `failure`
- `issues`: array of normalized issue tags
- `strengths`: array of normalized strength tags

## Optional fields

- `benchmarkId`
- `promptId`
- `notes`
- `filesTouched`
- `score`

## Guidelines

- Keep issue and strength tags short and reusable.
- Use normalized tags such as `missing-output-contract` or `strong-scope-discipline`.
- Treat traces as immutable once imported into a run.
- Keep holdout traces in a separate folder or mark them explicitly.
