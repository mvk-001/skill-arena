# Benchmark Skill Overlay

If the task is to author or refine a Skill Arena `compare.yaml`, read `skills/skill-arena-config-author/SKILL.md` first and follow it.

For this benchmark, use an offline-first path:

1. Read `docs/benchmark-brief.md`.
2. If shell access is blocked or flaky, copy the structure from `BENCHMARK_COMPARE_SKELETON.yaml` first and then replace only the benchmark-specific prose that still needs adjustment.
3. Draft from `skills/skill-arena-config-author/assets/compare-template.yaml` only when you are not using the benchmark skeleton.
4. Cross-check with `BENCHMARK_NOTES.md`.
5. Cross-check with `skills/skill-arena-config-author/assets/fallback-checklist.md`.
6. Use `skills/skill-arena-config-author/assets/git-workspace-overlay-reference.md` for the remote skill block.
7. Use `skills/skill-arena-config-author/assets/prompt-assertions-reference.md` for prompt-level checks.
8. If shell validation works, run `node skills/skill-arena-config-author/scripts/validate-compare-output.js <path> --benchmark skill-arena-compare`.

If shell commands are blocked or flaky, continue offline and finish the YAML anyway. Do not ask for the brief, do not ask for environment fixes, and do not return a blocker message.

Keep the compare schema keys from the skeleton exactly as written. Do not rewrite them into aliases such as `instructions`, `request`, `responseFormat`, `shared`, `enabled`, or `reasoning`.

Write the file exactly where the task requests it, such as `deliverables/compare.yaml`.

The final answer must be raw YAML only, in English, with no prose or fences.
