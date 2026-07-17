# Skill Evolution Strategy Replay

Evidence layer: `deterministic-mechanism-replay`
Scenarios: 4
Corpus digest: `9cde0bbd894fea88176a652a053bd1cc475ae20913a5a6a83a25928f3c0ba21a`

## Aggregate metrics

| Strategy | Holdout | Gain | Reliability | Gen. gap | Complexity Δ | Eval cost | Diversity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| population-search | 74.3% | 7.7% | 75.0% | 17.8% | 11.25 | 14.5 | 5.3 |
| trace-distillation | 85.0% | 18.5% | 100.0% | -2.0% | 3.25 | 16.8 | 1.3 |
| reflective-pareto-search | 88.5% | 22.0% | 100.0% | -2.5% | 4.25 | 14.5 | 2.8 |
| operator-coevolution | 74.3% | 7.7% | 75.0% | 17.8% | 11.25 | 14.5 | 5.0 |

## Scenario selections

| Scenario | Subject | Strategy | Selected | Operator elite | Holdout | Gain |
| --- | --- | --- | --- | --- | ---: | ---: |
| stable-scalar-converter | animated-svg-to-gif | population-search | scalar-contract | n/a | 90.0% | 25.0% |
| stable-scalar-converter | animated-svg-to-gif | trace-distillation | trace-exact-output | n/a | 80.0% | 15.0% |
| stable-scalar-converter | animated-svg-to-gif | reflective-pareto-search | pareto-balanced | n/a | 82.0% | 17.0% |
| stable-scalar-converter | animated-svg-to-gif | operator-coevolution | scalar-contract | evolved | 90.0% | 25.0% |
| heterogeneous-svg-orchestration | compose-synchronized-svg | population-search | scalar-overfit | n/a | 65.0% | -3.0% |
| heterogeneous-svg-orchestration | compose-synchronized-svg | trace-distillation | trace-brief-gate | n/a | 82.0% | 14.0% |
| heterogeneous-svg-orchestration | compose-synchronized-svg | reflective-pareto-search | pareto-balanced | n/a | 92.0% | 24.0% |
| heterogeneous-svg-orchestration | compose-synchronized-svg | operator-coevolution | scalar-overfit | evolved | 65.0% | -3.0% |
| recurring-composition-findings | d3-composition-evaluator | population-search | scalar-overfit | n/a | 70.0% | 4.0% |
| recurring-composition-findings | d3-composition-evaluator | trace-distillation | trace-reconciled-score | n/a | 94.0% | 28.0% |
| recurring-composition-findings | d3-composition-evaluator | reflective-pareto-search | pareto-balanced | n/a | 85.0% | 19.0% |
| recurring-composition-findings | d3-composition-evaluator | operator-coevolution | scalar-overfit | evolved | 70.0% | 4.0% |
| plateaued-video-mutations | html-d3-anime-video-workflow | population-search | scalar-overfit | n/a | 72.0% | 5.0% |
| plateaued-video-mutations | html-d3-anime-video-workflow | trace-distillation | trace-render-gate | n/a | 84.0% | 17.0% |
| plateaued-video-mutations | html-d3-anime-video-workflow | reflective-pareto-search | operator-child-a | n/a | 95.0% | 28.0% |
| plateaued-video-mutations | html-d3-anime-video-workflow | operator-coevolution | scalar-overfit | evolved | 72.0% | 5.0% |

## How to choose

- Use population search for stable scalar fitness and affordable broad evaluation.
- Use trace distillation for recurring lessons in an existing labeled trace pool.
- Use reflective Pareto search for rich per-case feedback and competing task families.
- Use operator coevolution after fixed mutation operators plateau across repeated generations.

## Limitations

- Replay fixtures test deterministic selection behavior; they are not live agent-quality measurements.
- Holdout scores are revealed only after each strategy selects a candidate.
- All strategies pay the full frozen candidate evaluation cost in this conservative comparison.
