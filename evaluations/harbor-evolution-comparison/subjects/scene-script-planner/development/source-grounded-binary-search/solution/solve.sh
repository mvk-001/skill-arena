#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"

cat > "$APP_DIR/scene_plan.md" <<'EOF'
# Halving the Search

Status: Spike
Target runtime: 24 seconds
Audience: First-year computer science students who know arrays but not search algorithms.
Core idea: A binary-search comparison removes half of the remaining sorted interval.
Learning outcome: The viewer can explain why the visible search interval shrinks after each comparison.

## Research Summary

Binary search compares a target with the middle item while maintaining bounds on a sorted array [SRC-BS-01]. Bisection repeatedly partitions that active interval [SRC-BS-02].

## Visual Language

A single row of blue array cells sits on charcoal. A yellow target marker stays fixed above it. The active interval has a bright bracket; rejected cells dim and compress into the background.

## Timeline

| Time | Beat | Visuals | Narration or on-screen text | Transition |
| --- | --- | --- | --- | --- |
| 0:00-0:05 | Establish the search | Reveal the sorted array, target marker, and full active bracket. | "Start with every possible position." | The bracket draws from both ends. |
| 0:05-0:11 | Compare the midpoint | Lift the middle cell and align it with the target marker. | "Compare with the middle." | A vertical guide connects target and midpoint. |
| 0:11-0:18 | Reject one half | Dim the impossible half and snap the active bracket around the remaining cells. | "One comparison removes half." | Rejected cells recede while the bracket contracts. |
| 0:18-0:24 | Isolate the target | Repeat the contraction once, leaving the target cell alone. | "Repeat until one position remains." | The final cell brightens as all guides clear. |

## Component Candidates

- Candidate: Shrinking interval bracket
  Reason: The bracket-and-dim treatment could explain other narrowing search spaces.
  Proposed folder: components/animations/
  Approval status: Candidate only

## Implementation Notes

Keep all cells on one horizontal axis. Preserve sorted values and use the same bracket geometry for both contractions. Narration must not claim that the target is guaranteed to exist.
EOF

cat > "$APP_DIR/research.md" <<'EOF'
# Research Notes

## Claims Used

- Claim: Binary search maintains bounds and compares the target with the middle entry of a sorted array.
  Source: SRC-BS-01
  Confidence: High
  Notes: This supports the midpoint and active-bracket visuals.
- Claim: Bisection repeatedly partitions a sorted search interval.
  Source: SRC-BS-02
  Confidence: High
  Notes: This supports the repeated contraction beat.

## Sources Checked

- Title: Binary search algorithm
  URL: https://algs4.cs.princeton.edu/11model/BinarySearch.java.html
  Why it matters: It grounds the bounded midpoint comparison.
- Title: bisect — Array bisection algorithm
  URL: https://docs.python.org/3/library/bisect.html
  Why it matters: It grounds repeated interval partitioning.
EOF
