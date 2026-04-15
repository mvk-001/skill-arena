# Data Extractor Segmented Isolation Check

## Goal

Check whether running `data-extractor-compare` as one assistant per compare file changes outcomes relative to the full matrix enough to suggest environment leakage between assistants or profiles.

## Reference full-matrix run

- Full benchmark summary: [summary.json](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare/2026-04-14T11-30-07-767Z-compare/summary.json)
- Full benchmark report: [report.md](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare/2026-04-14T11-30-07-767Z-compare/merged/report.md)

## Segmented configs

- [codex-gpt54.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/codex-gpt54.yaml)
- [codex-mini.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/codex-mini.yaml)
- [copilot-gpt54.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/copilot-gpt54.yaml)
- [copilot-mini.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/copilot-mini.yaml)
- [opencode-gpt54.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/opencode-gpt54.yaml)
- [opencode-mini.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/opencode-mini.yaml)
- [pi-gpt54.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/pi-gpt54.yaml)
- [pi-gpt5mini.yaml](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/pi-gpt5mini.yaml)

These were generated from the same benchmark task, workspace, assertions, profiles, and variant definitions, keeping only one variant per compare file.

## Segmented run summaries

Parallel-request runs (`maxConcurrency: 2` from the source config):

- [codex gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-gpt54/2026-04-14T23-11-26-632Z-compare/summary.json)
- [codex mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-mini/2026-04-14T23-23-55-348Z-compare/summary.json)
- [copilot gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-copilot-gpt54/2026-04-14T23-24-41-976Z-compare/summary.json)
- [copilot mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-copilot-mini/2026-04-14T23-39-07-947Z-compare/summary.json)
- [opencode gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-opencode-gpt54/2026-04-14T23-56-29-714Z-compare/summary.json)
- [opencode mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-opencode-mini/2026-04-15T00-00-09-886Z-compare/summary.json)
- [pi gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-pi-gpt54/2026-04-15T00-03-52-972Z-compare/summary.json)
- [pi gpt-5 mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-pi-gpt5mini/2026-04-15T00-11-40-873Z-compare/summary.json)

Serial-request runs (`--max-concurrency 1`):

- [codex gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-gpt54/2026-04-15T01-55-15-327Z-compare/summary.json)
- [codex mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-mini/2026-04-15T02-18-22-629Z-compare/summary.json)
- [copilot gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-copilot-gpt54/2026-04-15T02-19-56-984Z-compare/summary.json)
- [copilot mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-copilot-mini/2026-04-15T02-44-02-411Z-compare/summary.json)
- [opencode gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-opencode-gpt54/2026-04-15T03-11-11-172Z-compare/summary.json)
- [opencode mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-opencode-mini/2026-04-15T03-18-36-560Z-compare/summary.json)
- [pi gpt-5.4 summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-pi-gpt54/2026-04-15T03-25-34-338Z-compare/summary.json)
- [pi gpt-5 mini summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-pi-gpt5mini/2026-04-15T03-41-27-982Z-compare/summary.json)

Additional control:

- [codex pair config](/C:/Users/villa/dev/skill-arena/evaluations/data-extractor-compare/segments/codex-pair.yaml)
- [codex pair summary](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-pair/2026-04-15T00-22-19-060Z-compare/summary.json)

## Comparison summary

Stable between full-matrix and segmented runs:

- `codex gpt-5.4`: `100%` across all prompts and profiles in the full run, segmented parallel run, and segmented serial run.
- `pi gpt-5 mini`: `100%` across all prompts and profiles in the full run, segmented parallel run, and segmented serial run.
- `pi gpt-5.4`: `100%` across all prompts and profiles in the full run, segmented parallel run, and segmented serial run.
- `copilot mini`: `0%` everywhere, dominated by errors in all run shapes.
- `copilot gpt-5.4`: `0%` everywhere, dominated by errors in all run shapes.
- `opencode mini`: `0%` everywhere, with no meaningful shift between full and segmented runs.
- `opencode gpt-5.4`: `0%` everywhere, with no meaningful shift between full and segmented runs.

Only material divergence:

- `codex mini`
  - Full benchmark: between `80%` and `100%` depending on prompt/profile.
  - Segmented parallel run: `0%` across all prompts/profiles.
  - Segmented serial run: `0%` across all prompts/profiles.
  - Codex-pair control (`codex gpt-5.4` + `codex mini` together): `codex mini` stayed at `0%`.

## Error evidence for codex mini

Segmented `codex mini` failures are not workspace-leak symptoms. They are model-support failures emitted by Codex itself:

- [execution event sample](/C:/Users/villa/dev/skill-arena/results/data-extractor-compare-codex-mini/2026-04-14T23-23-55-353Z-3ca9bc82-e216-4937-93b1-67895b29376c-codex-mini-no-skill/workspace/.skill-arena/hooks/execution-events/2026-04-14T23-23-58.604Z-codex-d6a1f0ca-ead3-4b94-bd3d-a319861dd158.json)

Observed error text:

```text
The 'gpt-5.1-codex-mini' model is not supported when using Codex with a ChatGPT account.
```

This same failure persisted when request parallelism was disabled, so request concurrency is not the cause.

## Conclusion

The repeated experiment does not support the environment-leakage hypothesis.

Reasons:

- Seven of the eight assistants behave consistently between the full benchmark and the segmented runs.
- The only divergence, `codex mini`, still fails when:
  - run completely alone
  - run with request concurrency forced to `1`
  - run together with `codex gpt-5.4` in a smaller two-variant compare
- The failure mode is an external Codex model-entitlement/authentication error, not evidence of shared workspace state, shared profile state, or cross-assistant contamination inside Skill Arena.

Current best explanation:

- `codex mini` availability drifted between the earlier full benchmark and the later segmented reruns.
- The harness isolation itself was not shown to be leaking state between assistants.

Recommended follow-up if this needs hardening later:

- add a Codex preflight that checks whether the requested model is actually usable under the current auth mode before running the benchmark
- mark unsupported Codex models as unsupported cells early instead of counting them as benchmark failures
