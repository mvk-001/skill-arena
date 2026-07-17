# Native Harbor Evolver Decision Index

This versioned index preserves the decisions produced by the four native
Harbor analyzers. Development and holdout values come only from the frozen
Harbor jobs. Detailed analyzer outputs remain local under
`.tmp/harbor-evolution-comparison/20260716/evolver-runs/final/`; the locked
inputs, selected candidates, and recomputed metrics are preserved in the
evaluation assets and `summary.json` beside this file.

| Strategy | Subject | Development outcome | Holdout outcome | Local analyzer artifact |
| --- | --- | --- | --- | --- |
| Population search | OpenAPI Integrator | child `1.0` > baseline `0.85` | promote; `0.7272725` -> `0.7272725` | `population-search/openapi-integrator/report.md` |
| Population search | Deepfake Detector | baseline wins lexical tie at `0.65` | staged; no distinct winner job | `population-search/deepfake-detector/report.md` |
| Population search | Scene Script Planner | baseline `0.9429765` > child `0.91287625` | staged; no distinct winner job | `population-search/scene-script-planner/report.md` |
| Trace distillation | OpenAPI Integrator | child selected by study (`1.0`) | promote; `0.7272725` -> `1.0` | `trace-distillation/openapi-integrator/gate-final/report.md` |
| Trace distillation | Deepfake Detector | child selected by study (`1.0`) | promote; `1.0` -> `1.0` | `trace-distillation/deepfake-detector/gate-final/report.md` |
| Trace distillation | Scene Script Planner | baseline `0.9429765` > child `0.92123725` | rejected child not run | `trace-distillation/scene-script-planner/analysis/report.md` |
| Reflective Pareto | OpenAPI Integrator | child best aggregate; child and baseline non-dominated | promote; `0.7272725` -> `1.0` | `reflective-pareto-search/openapi-integrator/analysis/holdout/report.md` |
| Reflective Pareto | Deepfake Detector | child dominates baseline | promote; `1.0` -> `1.0` | `reflective-pareto-search/deepfake-detector/analysis/holdout/report.md` |
| Reflective Pareto | Scene Script Planner | archive contains baseline only | not applicable | `reflective-pareto-search/scene-script-planner/analysis/development/generation-000/pareto-archive.json` |
| Operator coevolution | OpenAPI Integrator | baseline selected | unavailable under one-child budget | `operator-coevolution/openapi-integrator/NOTES.md` |
| Operator coevolution | Deepfake Detector | child has complete jobs, but only one operator is evaluated | runner rejects: `Need 2 evaluated operators, found 1.` | `operator-coevolution/deepfake-detector/analysis/NOTES.md` |
| Operator coevolution | Scene Script Planner | baseline selected | unavailable under one-child budget | `operator-coevolution/scene-script-planner/NOTES.md` |

## Native Command Forms

```text
uv run --offline --script skills/harbor-population-search/scripts/search_harbor_population.py ... --analyze-only
uv run --offline --script skills/harbor-trace-distillation/scripts/distill_harbor_traces.py <final-config> [--analyze-only]
uv run --offline --script skills/harbor-reflective-pareto-search/scripts/harbor_reflective_pareto.py <final-config> [--phase holdout] --analyze-only
uv run --offline --script skills/harbor-operator-coevolution/scripts/harbor_operator_coevolution.py <final-config> --analyze-only
```

Population generation manifests contain the exact candidate-to-job mappings.
The other exact input mappings are preserved in each local `config.yaml`,
`development.yaml`, or `generation.yaml` beside its analyzer output.

## Closeout Validation

- Four evolver test files: 23/23 passed.
- Result-summary tamper tests: 6/6 passed.
- Combined focal Node suite: 24/24 passed.
- Complete repository suite in serial mode: 436/436 passed.
- Python byte compilation, Ruff, skill-bundle checks, documentation links, and
  the required Rust code analysis closeout hook passed.
- No scored candidate, lock, native Harbor job, protocol, or corpus artifact
  was modified during analyzer finalization.
