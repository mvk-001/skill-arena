# Decision Tree

Use the shortest path that fits the task.

## Repository benchmark

Use this route when the task matches `benchmarks/skill-arena-compare/compare.yaml`.

1. Preferred: run `scripts/scaffold-skill-arena-compare-benchmark.js <path> --validate`
2. No shell or flaky shell: copy `assets/gws-calendar-agenda-copy-card.yaml`
3. Need exact values: open `assets/gws-calendar-agenda-benchmark-reference.md`

## Generic compare task

1. Start from `assets/compare-template.yaml`
2. Replace placeholders with task-specific values
3. Validate with `scripts/validate-compare-output.js <path>` when possible

## Final gate

- Keep the answer as raw YAML only
- No headings, bullets, fences, tests, or next steps
