# CLI Reference

The installed executable is `skill-arena`. From a repository checkout, use
`npx .` in its place. For example, `skill-arena --help` and `npx . --help` are
equivalent.

The CLI exposes three commands:

| Command | Purpose |
| --- | --- |
| `evaluate` | Validate and run a manifest or compare config. |
| `gen-conf` | Generate a commented compare-config template. |
| `val-conf` | Validate a config and print its normalized summary. |

Run `skill-arena help <command>` or `skill-arena <command> --help` for the
authoritative option list installed with your version.

## Global options

| Form | Behavior |
| --- | --- |
| `skill-arena`, `skill-arena --help`, `skill-arena -h` | Show top-level help. |
| `skill-arena --version`, `skill-arena -v` | Show the installed version. |
| `skill-arena help <command>` | Show command-specific help. |

## `evaluate`

```text
skill-arena evaluate <config-path> [options]
```

The config may be a scenario-oriented manifest or a matrix-oriented compare
config. The recommended checked-in filename for either form is
`evaluations/<benchmark-id>/evaluation.yaml`.

| Option | Meaning |
| --- | --- |
| `--scenario <id>` | Run one manifest scenario. Invalid for compare configs. |
| `--requests <n>` | Override the effective request count with a positive integer. |
| `--max-concurrency <n>` | Override effective concurrency with a positive integer. |
| `--maxConcurrency <n>` | Alias for `--max-concurrency`. |
| `--markdown-output <path>` | Overwrite a Markdown file with the final report. |
| `--reuse-unchanged-profiles` | Reuse the latest matching compare outputs for unchanged profiles. |
| `--dry-run` | Materialize workspaces and generate Promptfoo config without running agents. |
| `--verbose` | Print full artifact paths and raw output. |
| `--help` | Show command help. |

Common forms:

```bash
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml --dry-run
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml \
  --requests 2 \
  --max-concurrency 2
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml \
  --markdown-output ./evaluations/skill-arena-config-author/last_report.md
skill-arena evaluate ./evaluations/skill-arena-config-author/evaluation.yaml \
  --reuse-unchanged-profiles
```

## `gen-conf`

```text
skill-arena gen-conf [options]
```

Without `--output`, the command writes `./evaluate.generated.yaml`. Generated
templates contain comments and `TODO:` markers; `val-conf` rejects unfinished
required values.

### Output and benchmark metadata

| Option | Meaning |
| --- | --- |
| `--output <path>` | Destination path. |
| `--benchmark-id <slug>` | Set `benchmark.id`. |
| `--description <text>` | Set `benchmark.description`. |
| `--benchmark-description <text>` | Alias for `--description`. |
| `--tag <text>` | Add a benchmark tag; repeatable. |

### Prompts and evaluation

| Option | Meaning |
| --- | --- |
| `--prompt <text>` | Add a task prompt; repeatable. |
| `--prompt-description <text>` | Describe the next prompt row; repeatable. |
| `--evaluation-type <type>` | Add a shared assertion type; repeatable. |
| `--evaluation-value <value>` | Add the corresponding assertion value; repeatable. |
| `--evaluation-provider <id>` | Set the provider for `llm-rubric` assertions. |
| `--requests <n>` | Set `evaluation.requests`. |
| `--max-concurrency <n>` | Set `evaluation.maxConcurrency`. |
| `--maxConcurrency <n>` | Alias for `--max-concurrency`. |
| `--timeout-ms <ms>` | Set `evaluation.timeoutMs`. |
| `--no-cache <true|false>` | Set `evaluation.noCache`. |
| `--tracing <true|false>` | Set `evaluation.tracing`. |

### Workspace and skill sources

| Option | Meaning |
| --- | --- |
| `--workspace-source-type <type>` | `none`, `local-path`, `git`, `inline-files`, or `empty`. Use `none` for `sources: []`. |
| `--workspace-path <path>` | Local workspace source path. |
| `--workspace-target <path>` | Destination inside the materialized workspace. |
| `--workspace-repo <url>` | Git repository for a workspace source. |
| `--workspace-ref <ref>` | Git ref for a workspace source. |
| `--workspace-subpath <path>` | Subpath within the workspace repository. |
| `--initialize-git <true|false>` | Set `workspace.setup.initializeGit`. |
| `--env-passthrough <name>` | Allow a required host variable for every cell; repeatable. |
| `--skill-type <type>` | `git`, `local-path`, `system-installed`, or `inline-files`. |
| `--skill-path <path>` | Local skill or overlay path. |
| `--skill-id <slug>` | Installed skill identifier. |
| `--skill-repo <url>` | Git repository for a skill source. |
| `--skill-ref <ref>` | Git ref for a skill source. |
| `--skill-subpath <path>` | Subpath within the skill repository. |
| `--skill-path-in-repo <path>` | Skill folder inside the selected repository root. |

### Variant and runtime

| Option | Meaning |
| --- | --- |
| `--variant-id <slug>` | Set the variant identifier. |
| `--variant-description <text>` | Set the variant description. |
| `--variant-display-name <text>` | Set the report row label. |
| `--adapter <id>` | `codex`, `copilot-cli`, `pi`, `opencode`, `claude-code`, or `gemini-cli`. |
| `--model <id>` | Set the provider-specific model identifier. |
| `--execution-method <id>` | Set the adapter execution method. |
| `--command-path <path>` | Set the local CLI executable path. |
| `--sandbox-mode <id>` | Set the adapter-specific sandbox policy. |
| `--approval-policy <id>` | Set the adapter-specific approval policy. |
| `--web-search-enabled <true|false>` | Set the web-search flag. |
| `--network-access-enabled <true|false>` | Set the network-access flag. |
| `--reasoning-effort <id>` | Set adapter-specific reasoning effort. |
| `--variant-env-passthrough <name>` | Add a required host variable to the generated variant; repeatable. |

Example:

```bash
skill-arena gen-conf \
  --output ./evaluations/my-benchmark/evaluation.yaml \
  --benchmark-id my-benchmark \
  --prompt "Summarize the repository architecture." \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the main runtime stages are covered." \
  --skill-type local-path \
  --requests 3
```

## `val-conf`

```text
skill-arena val-conf <config-path>
```

Validation checks YAML or JSON parsing, schema constraints, source shapes, and
unfinished required `TODO:` values. It does not execute agents.
The normalized summary lists `requiredHostEnvironmentVariables` by name without
reading or printing their values.

```bash
skill-arena val-conf ./evaluations/skill-arena-config-author/evaluation.yaml
```

## Environment variables

Benchmark credentials are declared by name with
`workspace.setup.envPassthrough` or `agent.envPassthrough`. The variables below
configure Skill Arena itself and do not need those allowlists.

| Variable | Effect |
| --- | --- |
| `SKILL_ARENA_MAX_PARALLELISM` | Supplies the concurrency default when neither the config nor CLI sets one. |
| `SKILL_ARENA_MODEL_<UPPER_SLUG>` | Replaces a matching model alias at runtime. |
| `CODEX_HOME` | Selects the host Codex home used for minimum auth seeding into isolated Codex runs. |
| `SKILL_ARENA_RUST_CODE_ANALYSIS_BIN` | Points optional code-metric checks at a specific `rust-code-analysis` binary. |

For schema constraints and adapter-specific behavior, use the
[configuration specs](./specs.md). For the end-to-end workflow, use the
[usage guide](./usage.md).
