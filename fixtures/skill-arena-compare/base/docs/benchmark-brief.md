# Benchmark Brief

Create `deliverables/compare.yaml`.

The file must define one valid Skill Arena compare config that evaluates this
skill:

- `https://github.com/googleworkspace/cli/tree/main/skills/gws-calendar-agenda`

The generated compare config must follow these requirements:

- `schemaVersion: 1`
- benchmark id `gws-calendar-agenda-compare-generated`
- benchmark description `Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.`
- benchmark tags `compare`, `calendar`, `gws`, and `codex`
- use `task.prompts` with exactly two prompts:
  - `today-json`
  - `week-markdown`
- the `today-json` prompt must ask for today's agenda across all calendars and
  require JSON only
- the `week-markdown` prompt must ask for this week's agenda across all
  calendars and require Markdown only
- both generated prompts should explicitly prefer the underlying
  `gws calendar +agenda` command in read-only mode
- the top-level compare config keys must be exactly:
  - `schemaVersion`
  - `benchmark`
  - `task`
  - `workspace`
  - `evaluation`
  - `comparison`
- `workspace.sources` must include one runtime-relative `local-path` source:
  - `path: fixtures/gws-calendar-agenda-compare/base`
  - `target: /`
- `workspace.setup.initializeGit: true`
- shared evaluation should include one `llm-rubric` assertion with provider
  `skill-arena:judge:codex`
- prompt-level evaluation should distinguish the two response formats:
  - `today-json` should include `type: is-json`
  - `week-markdown` should use supported V1 assertions to check for a
    Markdown-shaped response instead of JSON, for example `regex` and/or
    `llm-rubric`
- `evaluation.requests: 2`
- `evaluation.timeoutMs: 1200000`
- `evaluation.maxConcurrency: 1`
- two skill modes:
  - `no-skill` as disabled baseline
  - `skill` as enabled with an explicit `skill` block and
    `install.strategy: workspace-overlay`
- the enabled `skill.source` must use this exact Git source:
  - `type: git`
  - `repo: https://github.com/googleworkspace/cli.git`
  - `ref: main`
  - `subpath: .`
  - `skillPath: skills/gws-calendar-agenda`
  - `skillId: gws-calendar-agenda`
- one variant:
  - id `codex-mini`
  - adapter `codex`
  - model `gpt-5.1-codex-mini`
  - execution method `command`
  - command path `codex`
  - sandbox mode `danger-full-access`
  - approval policy `never`
  - web search disabled
  - network access enabled
  - reasoning effort `low`
  - `output.labels.variantDisplayName: codex mini`

Use the exact compare schema keys for nested blocks:

- `comparison.skillModes`
- `comparison.variants`
- `comparison.variants[*].agent.executionMethod`
- `comparison.variants[*].agent.commandPath`
- `comparison.variants[*].agent.sandboxMode`
- `comparison.variants[*].agent.webSearchEnabled`
- `comparison.variants[*].agent.networkAccessEnabled`

Do not invent aliases or unsupported assertion types. In particular, do not use:

- top-level `skillModes`
- top-level `variants`
- `execution`
- `sandbox`
- `webSearch`
- `networkAccess`
- `allowNetwork`
- `disabled`
- `instructions`
- `template`
- `type: is-markdown`

Keep the config concise and valid YAML.

Use runtime-relative local paths so the generated compare config can run from
another working directory such as `C:\Users\villa\tmp`. Do not rely on
package-relative paths.

Return only the completed `compare.yaml` content.
