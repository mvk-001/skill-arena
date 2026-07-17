# Harbor Evolver Comparison

This study compares four skill-evolution strategies on three real skill
bundles while using native Harbor jobs as the only scored evidence. The study
manifest in `protocol.yaml` is a study-local control document, not a new Skill
Arena runtime format.

## Completed Study

The frozen 2026-07-16 run contains 24 eligible Harbor jobs and 78 trials with
zero errors or retries. Trace distillation and reflective Pareto search tied
for the strongest selected holdout mean. See the
[`results/20260716/report.md`](results/20260716/report.md) analysis and its
machine-readable [`summary.json`](results/20260716/summary.json).

Regenerate and validate the joined result after the holdout jobs exist:

```bash
uv run --script scripts/summarize_results.py \
  --protocol protocol.yaml \
  --corpus-lock locks/corpus-lock.json \
  --candidate-lock locks/candidate-lock.json \
  --release-lock ../../.tmp/harbor-evolution-comparison/20260716/holdout-release/release-lock.json \
  --jobs-root ../../.tmp/harbor-evolution-comparison/20260716/jobs \
  --repo-root ../.. \
  --output results/20260716/summary.json
```

## Frozen comparison

Every strategy receives the same baseline bundle, the same two development
tasks, one submitted child, two Harbor attempts per task, no retries, and the
same Codex model and reasoning effort. A shared baseline run is reused within
each subject. Internal prose proposals are allowed, but a strategy may submit
and score only one child per subject.

The task containers use Harbor's `public` network mode because the available
WSL kernel cannot run Harbor 0.18's nftables-based egress sidecar (its required
`fib` expressions fail at startup). Codex web search is explicitly disabled,
all benchmark inputs are local, and every strategy uses the same network cell.
The two failed pre-agent sidecar calibrations are excluded in `protocol.yaml`.

The baseline must complete without agent, environment, or verifier errors. An
errored child still consumes its one-child budget but is ineligible and selects
the baseline. Otherwise, the development winner is selected lexicographically
by mean reward and then worst-case reward. An exact tie selects the baseline.
Runtime, token use, and bundle size are reported but do not break a quality
tie.

The holdout is not consulted during mutation or development selection. After
all twelve submitted-child digests, development-job digests, and baseline-or-
child decisions are frozen, the release gate copies the holdout datasets into
a run-only directory. Each selected winner is then evaluated once on its
subject's holdout. When a strategy selected the baseline, the shared baseline
holdout result is reused.

The versioned holdout task sources remain present in this repository, so this
is procedural isolation rather than a cryptographic secrecy boundary. During
candidate authoring, agents must not receive, inspect, search, or execute paths
under `subjects/*/holdout`. Only aggregate holdout hashes are exposed before
release.

## Lock and release workflow

Run these commands from WSL so path and hashing behavior matches the live
Harbor environment:

```bash
cd /mnt/c/Users/villa/dev/skill-arena

uv run --script evaluations/harbor-evolution-comparison/scripts/protocol_gate.py \
  freeze-corpora \
  --protocol evaluations/harbor-evolution-comparison/protocol.yaml \
  --output evaluations/harbor-evolution-comparison/locks/corpus-lock.json

# Copy candidate-registry.example.yaml, replace every placeholder, and record
# the completed native Harbor development job directory for each child.
uv run --script evaluations/harbor-evolution-comparison/scripts/protocol_gate.py \
  freeze-candidates \
  --protocol evaluations/harbor-evolution-comparison/protocol.yaml \
  --corpus-lock evaluations/harbor-evolution-comparison/locks/corpus-lock.json \
  --registry evaluations/harbor-evolution-comparison/candidate-registry.yaml \
  --output evaluations/harbor-evolution-comparison/locks/candidate-lock.json

uv run --script evaluations/harbor-evolution-comparison/scripts/protocol_gate.py \
  release-holdout \
  --protocol evaluations/harbor-evolution-comparison/protocol.yaml \
  --corpus-lock evaluations/harbor-evolution-comparison/locks/corpus-lock.json \
  --candidate-lock evaluations/harbor-evolution-comparison/locks/candidate-lock.json \
  --output-dir .tmp/harbor-evolution-comparison/20260716/holdout-release
```

`release-holdout` fails if the protocol, a corpus, a candidate, or its native
development job changed after freezing. It emits a released JobConfig template
per subject whose dataset path points only at the released copy. Use
`materialize_job.py` on that template to inject the selected skill bundle.

## Interpretation limits

Two repetitions are an explicit cost-bounded design choice. Rewards are useful
for this controlled case study, but they do not establish statistical
significance or a universal ranking of the four strategies. Canonical solution
runs, dry runs, unsupported-model runs, and model-calibration runs are listed
as exclusions in `protocol.yaml` and never enter strategy fitness.
