# gws-calendar-agenda Benchmark Reference

Use this when the task matches the repository `skill-arena-compare` benchmark
and shell access is blocked or unreliable.

## Fastest safe route

1. Copy `assets/gws-calendar-agenda-copy-card.yaml`.
2. Write the result to the requested output path.
3. Replace only wording that the brief explicitly asks to improve.
4. If validation works, run the validator.
5. Return raw YAML only.

## Output rule

- The final answer must start with `schemaVersion: 1`.
- Do not add headings, bullets, status notes, test notes, or fenced code.
- If `npx skill-arena evaluate ... --dry-run` fails because the CLI is missing or
  unavailable, do not mention that failure in the final answer.

## Exact target values

- Benchmark id: `gws-calendar-agenda-compare-generated`
- Benchmark description: `Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.`
- Benchmark tags:
  - `compare`
  - `calendar`
  - `gws`
  - `codex`
- Prompt ids:
  - `today-json`
  - `week-markdown`
- Workspace path:
  - `fixtures/gws-calendar-agenda-compare/base`
- Shared judge provider:
  - `skill-arena:judge:codex`
- Enabled skill Git source:
  - `type: git`
  - `repo: https://github.com/googleworkspace/cli.git`
  - `ref: main`
  - `subpath: .`
  - `skillPath: skills/gws-calendar-agenda`
  - `skillId: gws-calendar-agenda`
- Variant:
  - `id: codex-mini`
  - `model: gpt-5.1-codex-mini`
  - `executionMethod: command`
  - `commandPath: codex`
  - `sandboxMode: danger-full-access`
  - `approvalPolicy: never`
  - `webSearchEnabled: false`
  - `networkAccessEnabled: true`
  - `reasoningEffort: low`
- Evaluation:
  - `requests: 2`
  - `timeoutMs: 1200000`
  - `maxConcurrency: 1`

## Prompt requirements

- `today-json` asks for today's agenda across all calendars.
- `week-markdown` asks for this week's agenda across all calendars.
- Both prompts explicitly prefer `gws calendar +agenda` in read-only mode.
- `today-json` requires JSON only.
- `week-markdown` requires Markdown only.

## Copy-first reminders

- Keep `task.prompts` as a YAML list with exactly two prompt objects.
- Keep the shared `llm-rubric` under top-level `evaluation.assertions`.
- Keep `skillMode: disabled` and `skillMode: enabled` exactly as written.
- Keep the enabled skill block nested under `comparison.skillModes[*].skill`.
- Keep the variant agent keys inside `comparison.variants[*].agent`.

## Required shape

- Top-level keys only:
  - `schemaVersion`
  - `benchmark`
  - `task`
  - `workspace`
  - `evaluation`
  - `comparison`
- Use `workspace.sources`, not `workspace.fixture`.
- Use `comparison.skillModes` and `comparison.variants`.
- Put shared checks in top-level `evaluation.assertions`.
- Put row-specific format checks under each prompt:
  - `today-json`: `type: is-json`
  - `week-markdown`: `type: regex` and/or `type: llm-rubric`

## Compact skeleton

```yaml
schemaVersion: 1
benchmark:
  id: gws-calendar-agenda-compare-generated
  description: Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.
  tags:
    - compare
    - calendar
    - gws
    - codex
task:
  prompts:
    - id: today-json
      prompt: <today across all calendars, prefer gws calendar +agenda in read-only mode, JSON only>
      evaluation:
        assertions:
          - type: is-json
    - id: week-markdown
      prompt: <this week across all calendars, prefer gws calendar +agenda in read-only mode, Markdown only>
      evaluation:
        assertions:
          - type: regex
            value: "(?m)^(#|[-*] )"
workspace:
  sources:
    - type: local-path
      path: fixtures/gws-calendar-agenda-compare/base
      target: /
  setup:
    initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: <shared benchmark success rubric>
  requests: 2
  timeoutMs: 1200000
  tracing: false
  maxConcurrency: 1
  noCache: true
comparison:
  skillModes:
    - id: no-skill
      description: Baseline without the skill.
      skillMode: disabled
    - id: skill
      description: Skill-enabled run.
      skillMode: enabled
      skill:
        source:
          type: git
          repo: https://github.com/googleworkspace/cli.git
          ref: main
          subpath: .
          skillPath: skills/gws-calendar-agenda
          skillId: gws-calendar-agenda
        install:
          strategy: workspace-overlay
  variants:
    - id: codex-mini
      description: Codex mini comparison variant.
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
        executionMethod: command
        commandPath: codex
        sandboxMode: danger-full-access
        approvalPolicy: never
        webSearchEnabled: false
        networkAccessEnabled: true
        reasoningEffort: low
        additionalDirectories: []
        cliEnv: {}
        config: {}
      output:
        labels:
          variantDisplayName: codex mini
```

## Reject these mistakes

- top-level `skillModes`
- top-level `variants`
- `workspace.fixture`
- `execution`
- `sandbox`
- `webSearch`
- `networkAccess`
- `allowNetwork`
- `type: is-markdown`
