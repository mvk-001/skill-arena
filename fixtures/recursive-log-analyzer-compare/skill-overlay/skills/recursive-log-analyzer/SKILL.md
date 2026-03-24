---
name: recursive-log-analyzer
description: Analyze very large session logs with recursive segmentation, anomaly scoring, and hotspot extraction for long-horizon pattern discovery.
triggers:
  - "analyze huge logs"
  - "recursive log analysis"
  - "find hotspots in long session logs"
when_to_use:
  - "You need deterministic analysis for logs larger than one prompt window."
  - "You need ranked error hotspots and a reusable JSON artifact."
when_not_to_use:
  - "The input is small enough for direct manual review."
  - "You only need a quick grep without structured output."
degrees_of_freedom: MEDIUM
---

# Recursive Log Analyzer

Use recursive segmentation to score anomalies and surface the highest-risk regions in long logs.

## Level 1 - Quick Start

Build a machine-readable analysis JSON and print a summary report.

```bash
skills/recursive-log-analyzer/scripts/run_recursive_log_analyzer.sh build \
  --input <path/to/log.txt> \
  --output <path/to/analysis.json>

skills/recursive-log-analyzer/scripts/run_recursive_log_analyzer.sh report \
  --analysis-file <path/to/analysis.json>
```

## Level 2 - Targeted Analysis

Use these controls when you need fast triage:
- `--top-k` (build): Number of hotspot leaves stored in JSON.
- `--top-hotspots` (report): Number of hotspots printed in report mode.

Useful command patterns:

```bash
skills/recursive-log-analyzer/scripts/run_recursive_log_analyzer.sh build \
  --input <path/to/log.txt> \
  --output <path/to/analysis.json> \
  --max-lines 300 \
  --min-lines 80 \
  --top-k 20

uv run --script skills/recursive-log-analyzer/scripts/print_hotspots.py \
  <path/to/analysis.json> \
  --top-k 15

# Batch processing pattern
for log_file in logs/*.log; do
  out="analysis/$(basename "${log_file%.log}").json"
  skills/recursive-log-analyzer/scripts/run_recursive_log_analyzer.sh build \
    --input "$log_file" \
    --output "$out"
done
```

## Level 3 - Advanced Integration

Use this level when embedding into larger ingestion or triage pipelines:
- Tune segmentation depth indirectly through `--max-lines` and `--min-lines`.
- Calibrate anomaly interpretation with the weighted signal model.
- Combine `summary.pattern_totals` and leaf-level hotspots for routing and alerting.
- Keep a stable JSON contract for downstream automation.
- Tuning knobs:
  - Increase `--max-lines` for faster, shallower scans.
  - Decrease `--max-lines` and `--min-lines` for tighter localization.
  - Keep `--min-lines < --max-lines` and avoid very low values that over-fragment trees.

References:
- Output schema: `skills/recursive-log-analyzer/references/analysis-output-schema.md`
- Scoring details: `skills/recursive-log-analyzer/references/anomaly-scoring-algorithm.md`
- Operational guide: `skills/recursive-log-analyzer/references/log-analysis-guide.md`

## Outputs

- `metadata`: Input path and runtime parameters.
- `summary`: Global counts, dominant signals, and total anomaly score.
- `root`: Recursive segment tree from `root` to leaves (`root.0.1`, etc.).
- `hotspots`: Top ranked leaf segments for fast triage.
