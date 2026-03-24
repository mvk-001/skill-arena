# Recursive Log Analysis Guide

## Goal
Use deterministic recursive segmentation to inspect logs that are too large for one prompt.

## Baseline Run
- Start with `--max-lines 400 --min-lines 120`.
- Increase `--max-lines` when speed matters more than detail.
- Decrease `--max-lines` when you need tighter hotspot localization.

## Segment Tree Structure
- Root node is always `id: root`, representing the full file line range.
- Child nodes are deterministic (`root.0`, `root.1`, `root.1.0`, ...).
- Internal nodes aggregate counts from descendants and keep `children`.
- Leaf nodes have `children: []` and are the only nodes considered for hotspot ranking.
- `hotspots` contains a sorted subset of leaf nodes, not internal branches.

## Interpretation
- `anomaly_score` is weighted by error signals (`error`, `exception`, `traceback`, `failure`, `timeout`, `warning`).
- Focus first on hotspots with high score and narrow line ranges.
- Use the preview text for quick triage, then inspect full lines in the source log.
- If two hotspots share score, prioritize narrower ranges for precise root-cause analysis.
