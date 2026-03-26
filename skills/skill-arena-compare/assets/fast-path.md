# Fast Path

Use this when the task is to author one `compare.yaml` and the agent is likely
to lose track of long instructions.

## 1. Pick one starting point

- Generic compare task: start from `assets/compare-template.yaml`.
- Repository benchmark `benchmarks/skill-arena-compare/compare.yaml`:
  - preferred:
    `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js --validate`
  - default output path: `deliverables/compare.yaml`
  - no shell or no script execution: copy `assets/gws-calendar-agenda-copy-card.yaml`
  - if needed: open `assets/gws-calendar-agenda-benchmark-reference.md`
- Prompt-driven generator:
  - `node skills/skill-arena-compare/scripts/scaffold-compare-from-prompts.js --help`
  - Full reference: `assets/scaffold-compare-from-prompts.md`
  - Use `--prompt` with assertion packs (`json`, `markdown`, `regex:...`, `contains:...`).

## 2. Fill only the required fields

- Keep the top-level key order:
  `schemaVersion`, `benchmark`, `task`, `workspace`, `evaluation`, `comparison`
- Keep prompts inside one `task.prompts` YAML list.
- Keep shared checks in top-level `evaluation.assertions`.
- Keep prompt-specific checks under each prompt object.
- Keep profile capability settings under `comparison.profiles[*].capabilities`.
- Prefer profile ids `no-skill` and `skill` unless the task explicitly asks for different ids.
- Inside `capabilities.skills`, use `- source:` and `install:` directly. Do not add an extra `skill:` wrapper.
- Keep agent settings under `comparison.variants[*].agent`.

## 3. Avoid the common failures

- No prose before the YAML.
- No prose after the YAML.
- No Markdown fences.
- Do not invent aliases such as `execution`, `sandbox`, `webSearch`,
  `networkAccess`, top-level `profiles`, or top-level `variants`.
- Do not replace `workspace.sources` with `workspace.fixture` unless the task
  explicitly asks for legacy shape.

## 4. Run the cheapest useful check

- Repository benchmark exact scaffold:
  `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js --validate`
- Preferred:
  `node skills/skill-arena-compare/scripts/validate-compare-output.js <path>`
- Repository benchmark:
  `node skills/skill-arena-compare/scripts/scaffold-skill-arena-compare-benchmark.js`
- Repository benchmark validator:
  `node skills/skill-arena-compare/scripts/validate-compare-output.js deliverables/compare.yaml --benchmark skill-arena-compare`

## 5. If shell validation is flaky

- Keep going offline.
- Use `assets/fallback-checklist.md`.
- For the repository benchmark, use:
  - `assets/gws-calendar-agenda-copy-card.yaml`
  - `assets/gws-calendar-agenda-benchmark-reference.md`
  - `assets/git-workspace-overlay-reference.md`
  - `assets/prompt-assertions-reference.md`
- Final answer is the YAML only.
- Remove headings, bullets, fences, and test notes before sending.
