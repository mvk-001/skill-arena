# skill-arena-config-author evolution holdout

Population-search generation 2 compared the current skill bundle with the
recovery candidate under the same four prompts, three requests per cell,
`gpt-5.4`, cache disabled, and concurrency 4.

| Prompt | Incumbent | Challenger |
| --- | ---: | ---: |
| Local skill with portable environment paths | 100% (3/3) | 100% (3/3) |
| Multi-prompt data extraction | 0% (0/3) | 0% (0/3) |
| Layered Git and empty OpenCode workspace | 0% (0/3) | 0% (0/3) |
| Naturalistic Git brainstorming task | 0% (0/3) | 67% (2/3) |
| **Overall** | **25% (3/12)** | **42% (5/12)** |

The challenger was accepted because it improved the validated pass rate without
regressing any prompt row. It keeps prompt-design rules in `SKILL.md`, moves the
complete V1 schema into `references/compare-schema.md`, adds contrastive leakage
examples, and preserves exact user task vocabulary through focused references.

The holdout exposed two benchmark defects that affected incumbent and challenger
equally: the data-extraction assertion rejected any JSON-first/Markdown-second
pair, and the OpenCode assertion expected profile ids not requested by the
prompt. Both were repaired only after the frozen evolution loop completed.

The first live attempt used `gpt-5.1-codex-mini`, which the local ChatGPT-backed
Codex CLI rejected before task execution. The single infrastructure retry used
the repository-maintained `gpt-5.4` Codex variant.

Primary evidence:

- `results/skill-arena-config-author-evolution-final/2026-07-13T01-00-03-728Z-compare/merged/report.md`
- `results/skill-arena-config-author-evolution-final/2026-07-13T01-00-03-728Z-compare/summary.json`
