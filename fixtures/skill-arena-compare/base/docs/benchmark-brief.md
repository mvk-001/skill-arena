# Benchmark Brief

Create `deliverables/compare.yaml`.

The file must define a Skill Arena compare config with these requirements:

- `schemaVersion: 1`
- benchmark id `compare-config-authoring-generated`
- benchmark description `Compare baseline and skill-enabled compare.yaml authoring runs.`
- benchmark tags `compare`, `authoring`, and `skill`
- use `task.prompts` with exactly these prompts:
  - `author-compare`: `Read docs/benchmark-brief.md and author deliverables/compare.yaml in the workspace. Return only the completed compare.yaml content.`
  - `review-compare`: `Review the generated compare.yaml for correct prompts, agent settings, evaluation rules, and explicit skill and no-skill configuration. Return only a short validation summary.`
- `workspace.fixture: fixtures/skill-arena-compare/base`
- `workspace.initializeGit: true`
- one `llm-rubric` assertion with provider `skill-arena:judge:codex`
- `evaluation.requests: 3`
- two skill modes:
  - `no-skill` as disabled baseline
  - `skill` as enabled with an explicit `skill` block and `install.strategy: workspace-overlay`
- one variant:
  - id `codex-mini`
  - adapter `codex`
  - model `gpt-5.1-codex-mini`
  - execution method `command`
  - command path `codex`
  - sandbox mode `workspace-write`
  - approval policy `never`
  - web search disabled
  - network access disabled
  - reasoning effort `low`
  - `output.labels.variantDisplayName: codex mini`

Keep the config concise and valid YAML.

Set `evaluation.maxConcurrency: 12`.

The final `compare.yaml` must be executable from another working directory such as `C:\Users\villa\tmp`. Use runtime-relative paths and rely on compare bootstrap, not package-relative execution.

The exact enabled `skill.source` shape is scenario-specific and will be specified in the task prompt. Follow the prompt when choosing between `local-path`, `git`, or `inline-files`.
