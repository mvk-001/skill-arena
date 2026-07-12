---
name: mermaid-colorset-styler
description: Style existing Mermaid diagrams in a folder with colorset1 or colorset2. Use when Codex needs to batch-apply a Mermaid base theme, update .mmd files or mermaid code fences in Markdown, preserve existing diagram geometry, add only needed Mermaid color class definitions, or validate coverage across Mermaid diagram types.
---

# Mermaid Colorset Styler

## Core Contract

Style the user's existing Mermaid source; do not redraw, simplify, or convert the diagrams.

Use `theme: "base"` for every styled diagram. Mermaid only supports full theme-variable customization on the base theme, so do not use `default`, `neutral`, `forest`, or `dark` when applying colorsets.

Keep insertion minimal:

1. Add one Mermaid YAML frontmatter `config:` block per diagram block with the selected colorset.
2. Add `classDef` lines only when the diagram type supports `classDef` and the source already references one of the supported color classes.
3. Add only class definitions for referenced classes; do not invent class assignments for existing objects.
4. Preserve all user diagram content, comments, ordering, labels, and frontmatter.
5. Migrate previous generated `%%{init: ...}%%` colorset directives to YAML frontmatter instead of keeping both formats.

## Workflow

1. Read `references/diagram-coverage.md` when the task asks about supported Mermaid types, class support, or why a diagram received only theme variables. Treat its linked `references/diagram-types.json` manifest as the maintenance source of truth.
2. Run the styler against the requested directory. Use `--write` to modify files in place, and always request a report.
3. Inspect the JSON report. Confirm every expected Mermaid block was found, every block uses the requested colorset, and class definitions were inserted only for supported types.
4. Run the changed diagrams through the user's renderer or validation command when available. If no renderer is available, at least run the script's `--check` mode after writing.

## Commands

Style a directory in place with colorset1:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/style_mermaid_directory.py path/to/diagrams --colorset colorset1 --write --report path/to/mermaid-colorset-report.json
```

Style Markdown fences and `.mmd` files with colorset2:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/style_mermaid_directory.py path/to/docs --colorset colorset2 --write --report path/to/mermaid-colorset-report.json
```

Verify that a directory is already styled without modifying it:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/style_mermaid_directory.py path/to/diagrams --colorset colorset1 --check --report path/to/mermaid-colorset-check.json
```

Run the bundled coverage test when maintaining the skill:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/test_style_mermaid_directory.py
```

Run the rendered visual smoke test when maintaining palette or theme behavior:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/visual_smoke_mermaid_colorset.py --output projects/mermaid-colorset-styler-visual/artifacts/latest --report projects/mermaid-colorset-styler-visual/artifacts/latest/visual-report.json --png --render-retries 3
```

Review and approve every bundled Mermaid example when maintaining fixture coverage:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/review_mermaid_examples.py --render --render-retries 8 --output projects/mermaid-colorset-styler-review/artifacts/render-approval --report projects/mermaid-colorset-styler-review/artifacts/render-approval/approval-report.json
```

Fresh-render every renderable declaration for both colorsets in isolated small batches. The gate never reuses prior SVGs: it promotes valid partial output, retries only unresolved diagrams, and isolates stubborn items on the final attempt. It defaults to one render job and eight-item batches so constrained CI runners stay deterministic without accumulating browser pressure in one long-lived Chromium process:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/validate_mermaid_render_coverage.py --report projects/mermaid-colorset-styler-review/artifacts/render-coverage.json
```

Keep Chromium's sandbox enabled by default. Use `--disable-browser-sandbox` only inside a trusted, isolated CI runner whose AppArmor policy prevents Chromium from starting, and only with repository-owned Mermaid fixtures. The Pages workflow opts into this mode explicitly through `validate-diagram-type-coverage.py --disable-mermaid-browser-sandbox`.

Run the deterministic chunk/retry tests when maintaining the fresh-render gate:

```powershell
uv run --script .agents/skills/mermaid-colorset-styler/scripts/test_validate_mermaid_render_coverage.py
```

## Color Classes

Use these class names in generated or existing Mermaid source when individual Mermaid objects need semantic color roles:

- `csPrimary`
- `csAccent`
- `csMuted`
- `csCritical`
- `csWarning`
- `csSuccess`
- `csInfo`
- `csSpecial`
- `csNeutral`

The styler defines those classes only when they are already referenced through Mermaid class syntax such as `:::csPrimary`, `class A csPrimary`, or `cssClass "A" csPrimary`.

## Output Checks

After writing changes, verify:

- The report `changedFileCount` is greater than zero for a requested style pass.
- The report `missingStyleCount` is zero after a `--check` pass.
- Non-classable diagram types have an empty `insertedClassDefs` list.
- Existing Mermaid frontmatter and non-colorset directives are still present.
- Styled blocks use YAML frontmatter with `config.theme: "base"` and `config.themeVariables`.
- Rendered smoke output does not contain Mermaid default purple theme tokens and does contain the expected colorset class and theme tokens.
- The coverage report records Mermaid 11.16.0 and shows 31/31 families, 40/40 current declarations, and 48/48 renderable declarations with 100 percent coverage.
- The full example approval report has `approved: true`, `approvedExampleCount` equal to `exampleCount`, no missing, unexpected, or duplicate declarations, no missing color classes, and no findings.

## SkillOpt Maintenance

When using SkillOpt or SkillOpt-Sleep on this skill, train only from reviewed tasks with deterministic gates. Treat the acceptance gate as passing the bundled coverage test, a post-write `--check` report with `missingStyleCount: 0`, and rendered smoke or full example approval when theme behavior changes.

Reject any candidate that adds class assignments to user diagrams, changes diagram geometry, switches away from Mermaid `base`, emits generated JSON init directives, or expands YAML frontmatter beyond the minimal generated `config` plus preserved user metadata needed for the selected colorset.
