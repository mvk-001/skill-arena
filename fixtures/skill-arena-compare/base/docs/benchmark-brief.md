# Benchmark Brief

Create `deliverables/compare.yaml`.

The file must define a Skill Arena compare config with these requirements:

- `schemaVersion: 1`
- benchmark id `repo-summary-generated`
- benchmark description `Compare baseline and skill-enabled repository summaries.`
- benchmark tag `compare`
- use `task.prompts` with exactly these prompts:
  - `architecture`: `Read the repository and summarize the architecture.`
  - `testing`: `Read the repository and summarize how tests are run.`
- `workspace.fixture: fixtures/repo-summary/base`
- `workspace.skillOverlay.path: fixtures/repo-summary/skill-overlay`
- `workspace.initializeGit: true`
- one `llm-rubric` assertion with provider `openai:gpt-5-mini`
- `evaluation.requests: 10`
- two skill modes:
  - `no-skill` as disabled baseline
  - `skill` as enabled with an explicit `skill` block that uses `source.type: local-path`, `path: fixtures/repo-summary/skill-overlay`, and `install.strategy: workspace-overlay`
- one variant:
  - id `codex-mini`
  - adapter `codex`
  - model `gpt-5.1-codex-mini`
  - execution method `command`
  - command path `codex`
  - sandbox mode `read-only`
  - approval policy `never`
  - web search disabled
  - network access disabled
  - reasoning effort `low`
  - `output.labels.variantDisplayName: codex mini`

Keep the config concise and valid YAML.

The final `compare.yaml` must be executable from another working directory such as `C:\Users\villa\tmp`. Use runtime-relative paths and rely on compare bootstrap, not package-relative execution.
