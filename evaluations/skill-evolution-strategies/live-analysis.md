# Live Skill Evolution Strategy Analysis

Evidence layer: `live-agent-selection-with-post-selection-holdout`

## Aggregate metrics

| Profile | Assertion pass | Method fidelity | Post-selection holdout | Holdout gain | Tokens avg | Latency avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| population-search | 25.0% | 25.0% | 92.8% | 26.2% | 32492 | 41303 ms |
| trace-distillation | 50.0% | 50.0% | 88.5% | 22.0% | 46073 | 50426 ms |
| reflective-pareto-search | 100.0% | 100.0% | 88.5% | 22.0% | 37756 | 50573 ms |
| operator-coevolution | 75.0% | 75.0% | 80.3% | 13.7% | 23575 | 37007 ms |

## Cell selections

| Prompt | Profile | Selected | Expected mechanism | Fidelity | Holdout | Gain |
| --- | --- | --- | --- | ---: | ---: | ---: |
| heterogeneous-orchestrator | operator-coevolution | scalar-overfit | scalar-overfit | yes | 65.0% | -3.0% |
| heterogeneous-orchestrator | population-search | pareto-balanced | scalar-overfit | no | 92.0% | 24.0% |
| heterogeneous-orchestrator | reflective-pareto-search | pareto-balanced | pareto-balanced | yes | 92.0% | 24.0% |
| heterogeneous-orchestrator | trace-distillation | pareto-balanced | trace-brief-gate | no | 92.0% | 24.0% |
| operator-plateau | operator-coevolution | scalar-overfit | scalar-overfit | yes | 72.0% | 5.0% |
| operator-plateau | population-search | operator-child-a | scalar-overfit | no | 95.0% | 28.0% |
| operator-plateau | reflective-pareto-search | operator-child-a | operator-child-a | yes | 95.0% | 28.0% |
| operator-plateau | trace-distillation | pareto-balanced | trace-render-gate | no | 88.0% | 21.0% |
| recurring-findings | operator-coevolution | trace-reconciled-score | scalar-overfit | no | 94.0% | 28.0% |
| recurring-findings | population-search | trace-reconciled-score | scalar-overfit | no | 94.0% | 28.0% |
| recurring-findings | reflective-pareto-search | pareto-balanced | pareto-balanced | yes | 85.0% | 19.0% |
| recurring-findings | trace-distillation | trace-reconciled-score | trace-reconciled-score | yes | 94.0% | 28.0% |
| scalar-converter | operator-coevolution | scalar-contract | scalar-contract | yes | 90.0% | 25.0% |
| scalar-converter | population-search | scalar-contract | scalar-contract | yes | 90.0% | 25.0% |
| scalar-converter | reflective-pareto-search | pareto-balanced | pareto-balanced | yes | 82.0% | 17.0% |
| scalar-converter | trace-distillation | trace-exact-output | trace-exact-output | yes | 80.0% | 15.0% |

## Limitations

- One request per cell is a smoke and does not estimate variance.
- Method fidelity and post-selection holdout answer different questions and must not be merged into one score.
- Holdout is joined from the replay fixture only after the live response selects a candidate.
