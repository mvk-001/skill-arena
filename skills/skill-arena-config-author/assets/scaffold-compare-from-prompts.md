# Prompt-driven compare skeleton generator

This document describes `scaffold-compare-from-prompts.js`, a low-boilerplate
path to generate `compare.yaml` from prompt arguments and assertion presets.

## Why this exists

The new generator helps create a valid `compare.yaml` with minimal manual typing:

- One command call for benchmark metadata, prompts, checks, workspace, variants and skill source.
- Prompt rows are provided with `--prompt` or `--prompt-json`.
- Shared checks are collected under `evaluation.assertions`.
- Prompt-specific checks are placed under `task.prompts[*].evaluation.assertions`.
- The output includes inline English TODO comments where user decisions are expected.

## Command

```bash
node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js
```

By default it writes `deliverables/compare.yaml`.

## Required input

- At least one `--prompt` or `--prompt-json`.
- Benchmark metadata flags (`--benchmark-id`, `--description`, etc.).
- A workspace path (`--workspace-path`).

## Prompt formats

1. Preset prompt form:

```bash
--prompt "json|Return JSON only."
--prompt "markdown|Return Markdown only."
--prompt "contains:OK|Return the confirmation marker."
```

2. Key-value prompt form:

```bash
--prompt "id=prompt-1;prompt=Return JSON;assertions=json"
```

3. Explicit prompt + assertion form with id:

```bash
--prompt "prompt-id|assertions|Prompt text"
```

4. Arbitrary JSON object:

```bash
--prompt-json '{"id":"prompt-id","prompt":"...","assertions":[{"type":"contains","value":"..."}]}'
```

## Assertion presets and custom tokens

- Preset aliases
  - `json` → `type: is-json`
  - `markdown` → `type: regex` + markdown heading/list pattern
  - `non-empty` → example LLM rubric for non-empty responses
- Custom tokens
  - `contains:text`
  - `icontains:text`
  - `equals:text`
  - `regex:pattern`
  - `javascript:code`
  - `file-contains:path:value`
  - `llm-rubric:rubric`

You can add shared assertions once:

```bash
--shared-assertion regex:comparison\\s+pass
--shared-assertion contains:baseline
```

## Common options

- `--out <file>`: output path.
- `--stdout`: print generated YAML only.
- `--validate`: run `validate-compare-output.js` after writing.
- `--benchmark-id`: benchmark identifier.
- `--description`: human-readable benchmark description.
- `--tag`: repeatable; adds tags to benchmark metadata.
- `--workspace-path`: local path for base fixture source.
- `--initialize-git true|false`
- `--requests`, `--timeout-ms`, `--max-concurrency`, `--tracing`, `--no-cache`
- `--variant-*`: override variant/agent settings (adapter/model/sandbox/etc.)

## Skill source options

- System-installed (default):

```bash
--skill-source-type system-installed
```

- Local path:

```bash
--skill-source-type local-path
--skill-source-path fixtures/skills/my-skill
--skill-id my-skill
```

- Git remote:

```bash
--skill-source-type git
--skill-source-repo https://github.com/example/repo.git
--skill-source-ref main
--skill-source-skill-path skills/example-skill
--skill-source-skill-id example-skill
--skill-source-install-strategy workspace-overlay
```

## Example 1: minimum prompts

```bash
node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js \
  --benchmark-id json-markdown-bench \
  --description "JSON and markdown prompt checks" \
  --workspace-path fixtures/example/base \
  --prompt "json|Return JSON only." \
  --prompt "markdown|Return Markdown only." \
  --out deliverables/compare.yaml
```

## Example 2: repo skill + shared assertions

```bash
node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js \
  --out deliverables/compare.yaml \
  --benchmark-id cli-compare \
  --description "CLI comparison with git-installed skill" \
  --workspace-path fixtures/example/base \
  --skill-source-type git \
  --skill-source-repo https://github.com/example/repo.git \
  --skill-source-skill-path skills/example \
  --prompt "json|Return JSON result." \
  --shared-assertion contains:ok \
  --validate
```

## Example 3: full prompt object

```bash
node skills/skill-arena-config-author/scripts/scaffold-compare-from-prompts.js \
  --out deliverables/compare.yaml \
  --prompt-json '{"id":"advanced","prompt":"Summarize errors","assertions":[{"type":"contains","value":"Summary"},{"type":"regex","value":"(?m)^ERROR$"}]}' \
  --benchmark-id advanced-bench \
  --description "Advanced assertions example" \
  --workspace-path fixtures/example/base
```

## Notes

- The generator keeps the compare scaffold V1-compatible.
- English comments are included for areas that still need refinement.
- If shell access is limited, use `--stdout` and paste the result into `deliverables/compare.yaml`.
