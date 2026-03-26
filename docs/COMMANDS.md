# Commands Reference

This document lists the allowed `skill-arena` CLI command forms exposed by the repository today.

The project language policy requires English for repository artifacts, so this file is written in English.

## Placeholders

- `$CONFIG_PATH`: path to a manifest or compare config file
- `$MANIFEST_PATH`: path to a manifest config file
- `$COMPARE_PATH`: path to a compare config file
- `$SCENARIO_ID`: manifest scenario id
- `$OUTPUT_PATH`: destination path for generated config output
- `$PROMPT_TEXT`: prompt text
- `$PROMPT_DESCRIPTION`: prompt description text
- `$SLUG`: slug-like identifier
- `$TEXT`: free-form text
- `$TYPE`: allowed enum value for the given option
- `$VALUE`: assertion value or generic option value
- `$URL`: repository URL
- `$REF`: Git ref, branch, tag, or commit
- `$PATH_VALUE`: filesystem path
- `$TARGET_PATH`: workspace target path
- `$ID`: generic identifier
- `$BOOL`: `true` or `false`
- `$N`: positive integer
- `$MS`: positive integer in milliseconds

## Global Commands

# Show top-level help
`skill-arena`

# Show top-level help
`skill-arena --help`

# Show top-level help
`skill-arena -h`

# Show the installed CLI version
`skill-arena --version`

# Show the installed CLI version
`skill-arena -v`

# Show top-level help through the explicit help command
`skill-arena help`

Environment override notes:

- No documented environment variable changes the behavior of the global help or version commands.

## Help By Command

# Show help for the evaluate command
`skill-arena help evaluate`

# Show help for the gen-conf command
`skill-arena help gen-conf`

# Show help for the val-conf command
`skill-arena help val-conf`

# Show inline help for the evaluate command
`skill-arena evaluate --help`

# Show inline help for the gen-conf command
`skill-arena gen-conf --help`

# Show inline help for the val-conf command
`skill-arena val-conf --help`

## Evaluate

Allowed option set for `evaluate`:

- `--scenario $SCENARIO_ID`
- `--requests $N`
- `--max-concurrency $N`
- `--maxConcurrency $N`
- `--dry-run`
- `--verbose`

Constraint:

- `--scenario` is valid only for manifest configs and is not valid for compare configs.

Environment override notes:

- `SKILL_ARENA_MAX_PARALLELISM`: if `evaluation.maxConcurrency` is omitted in the config and you do not pass `--max-concurrency` or `--maxConcurrency`, this environment variable overrides the default machine-derived parallelism used by `evaluate`.
- `SKILL_ARENA_MODEL_<UPPER_SLUG>`: if a scenario or compare variant uses model value `$MODEL`, the runtime resolves `SKILL_ARENA_MODEL_<UPPER_SLUG>` first and uses that value instead. Example: `model: codex-small` can be overridden by `SKILL_ARENA_MODEL_CODEX_SMALL=gpt-5.1-codex-mini`.
- `CODEX_HOME`: for Codex-backed runs, strict runtime isolation seeds the temporary Codex home from `CODEX_HOME` when set. If it is not set, the runtime falls back to the OS default home path `.codex`.

# Run a manifest or compare config with no overrides
`skill-arena evaluate $CONFIG_PATH`

# Run a manifest config for one scenario only
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID`

# Run with an overridden request count
`skill-arena evaluate $CONFIG_PATH --requests $N`

# Run with an overridden max concurrency
`skill-arena evaluate $CONFIG_PATH --max-concurrency $N`

# Run with an overridden max concurrency using the camelCase alias
`skill-arena evaluate $CONFIG_PATH --maxConcurrency $N`

# Run a dry-run that writes artifacts but skips Promptfoo execution
`skill-arena evaluate $CONFIG_PATH --dry-run`

# Run with verbose artifact and raw output reporting
`skill-arena evaluate $CONFIG_PATH --verbose`

# Run a manifest scenario dry-run
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID --dry-run`

# Run a manifest scenario with overridden request count
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID --requests $N`

# Run a manifest scenario with overridden max concurrency
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID --max-concurrency $N`

# Run a manifest scenario with verbose output
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID --verbose`

# Run with request count and max concurrency overrides
`skill-arena evaluate $CONFIG_PATH --requests $N --max-concurrency $N`

# Run with request count override and dry-run
`skill-arena evaluate $CONFIG_PATH --requests $N --dry-run`

# Run with request count override and verbose output
`skill-arena evaluate $CONFIG_PATH --requests $N --verbose`

# Run with max concurrency override and dry-run
`skill-arena evaluate $CONFIG_PATH --max-concurrency $N --dry-run`

# Run with max concurrency override and verbose output
`skill-arena evaluate $CONFIG_PATH --max-concurrency $N --verbose`

# Run with dry-run and verbose output
`skill-arena evaluate $CONFIG_PATH --dry-run --verbose`

# Run with request count, max concurrency, and dry-run
`skill-arena evaluate $CONFIG_PATH --requests $N --max-concurrency $N --dry-run`

# Run with request count, max concurrency, and verbose output
`skill-arena evaluate $CONFIG_PATH --requests $N --max-concurrency $N --verbose`

# Run with request count, dry-run, and verbose output
`skill-arena evaluate $CONFIG_PATH --requests $N --dry-run --verbose`

# Run with max concurrency, dry-run, and verbose output
`skill-arena evaluate $CONFIG_PATH --max-concurrency $N --dry-run --verbose`

# Run with all common overrides together
`skill-arena evaluate $CONFIG_PATH --requests $N --max-concurrency $N --dry-run --verbose`

# Run a manifest scenario with all common overrides together
`skill-arena evaluate $MANIFEST_PATH --scenario $SCENARIO_ID --requests $N --max-concurrency $N --dry-run --verbose`

## Generate Evaluation Template

Allowed option set for `gen-conf`:

- `--output $OUTPUT_PATH`
- `--prompt $PROMPT_TEXT` (repeatable)
- `--prompt-description $PROMPT_DESCRIPTION` (repeatable; applies to the next prompt row)
- `--benchmark-id $SLUG`
- `--description $TEXT`
- `--benchmark-description $TEXT`
- `--tag $TEXT` (repeatable)
- `--evaluation-type $TYPE` (repeatable)
- `--evaluation-value $VALUE` (repeatable; paired by order)
- `--evaluation-provider $ID`
- `--skill-type $TYPE`
- `--skill-path $PATH_VALUE`
- `--skill-id $SLUG`
- `--skill-repo $URL`
- `--skill-ref $REF`
- `--skill-subpath $PATH_VALUE`
- `--skill-path-in-repo $PATH_VALUE`
- `--workspace-source-type $TYPE`
- `--workspace-path $PATH_VALUE`
- `--workspace-target $TARGET_PATH`
- `--workspace-repo $URL`
- `--workspace-ref $REF`
- `--workspace-subpath $PATH_VALUE`
- `--initialize-git $BOOL`
- `--requests $N`
- `--max-concurrency $N`
- `--maxConcurrency $N`
- `--timeout-ms $MS`
- `--no-cache $BOOL`
- `--tracing $BOOL`
- `--variant-id $SLUG`
- `--variant-description $TEXT`
- `--variant-display-name $TEXT`
- `--adapter $ID`
- `--model $ID`
- `--execution-method $ID`
- `--command-path $PATH_VALUE`
- `--sandbox-mode $ID`
- `--approval-policy $ID`
- `--web-search-enabled $BOOL`
- `--network-access-enabled $BOOL`
- `--reasoning-effort $ID`

Allowed enum values exposed by the CLI:

- `--skill-type`: `git`, `local-path`, `system-installed`, `inline-files`
- `--workspace-source-type`: `local-path`, `git`, `inline-files`, `empty`
- `--adapter`: `codex`, `copilot-cli`, `pi`

Generation patterns:

# Generate a default commented compare template
`skill-arena gen-conf`

# Generate a template to a specific output file
`skill-arena gen-conf --output $OUTPUT_PATH`

# Generate a template with one prompt row
`skill-arena gen-conf --prompt $PROMPT_TEXT`

# Generate a template with multiple prompt rows
`skill-arena gen-conf --prompt $PROMPT_TEXT --prompt $PROMPT_TEXT`

# Generate a template with prompt descriptions
`skill-arena gen-conf --prompt-description $PROMPT_DESCRIPTION --prompt $PROMPT_TEXT`

# Generate a template with benchmark metadata
`skill-arena gen-conf --benchmark-id $SLUG --description $TEXT --tag $TEXT`

# Generate a template with shared evaluation assertions
`skill-arena gen-conf --evaluation-type $TYPE --evaluation-value $VALUE`

# Generate a template with multiple shared assertions
`skill-arena gen-conf --evaluation-type $TYPE --evaluation-value $VALUE --evaluation-type $TYPE --evaluation-value $VALUE`

# Generate a template with an llm-rubric provider
`skill-arena gen-conf --evaluation-type llm-rubric --evaluation-value $VALUE --evaluation-provider $ID`

# Generate a template with a local-path skill source shape
`skill-arena gen-conf --skill-type local-path --skill-path $PATH_VALUE --skill-id $SLUG`

# Generate a template with a git skill source shape
`skill-arena gen-conf --skill-type git --skill-repo $URL --skill-ref $REF --skill-subpath $PATH_VALUE --skill-path-in-repo $PATH_VALUE --skill-id $SLUG`

# Generate a template with a system-installed skill source shape
`skill-arena gen-conf --skill-type system-installed --skill-id $SLUG`

# Generate a template with an inline-files skill source shape
`skill-arena gen-conf --skill-type inline-files --skill-id $SLUG`

# Generate a template with a local-path workspace source
`skill-arena gen-conf --workspace-source-type local-path --workspace-path $PATH_VALUE --workspace-target $TARGET_PATH`

# Generate a template with a git workspace source
`skill-arena gen-conf --workspace-source-type git --workspace-repo $URL --workspace-ref $REF --workspace-subpath $PATH_VALUE --workspace-target $TARGET_PATH`

# Generate a template with an inline-files workspace source
`skill-arena gen-conf --workspace-source-type inline-files --workspace-target $TARGET_PATH`

# Generate a template with an empty workspace source
`skill-arena gen-conf --workspace-source-type empty --workspace-target $TARGET_PATH`

# Generate a template with workspace setup overrides
`skill-arena gen-conf --initialize-git $BOOL --requests $N --timeout-ms $MS --no-cache $BOOL --tracing $BOOL`

# Generate a template with a concurrency override
`skill-arena gen-conf --max-concurrency $N`

# Generate a template with a concurrency override using the camelCase alias
`skill-arena gen-conf --maxConcurrency $N`

# Generate a template with variant metadata overrides
`skill-arena gen-conf --variant-id $SLUG --variant-description $TEXT --variant-display-name $TEXT`

# Generate a template with variant agent overrides
`skill-arena gen-conf --adapter $ID --model $ID --execution-method $ID --command-path $PATH_VALUE`

# Generate a template with variant runtime policy overrides
`skill-arena gen-conf --sandbox-mode $ID --approval-policy $ID --web-search-enabled $BOOL --network-access-enabled $BOOL --reasoning-effort $ID`

# Generate a fully customized template
`skill-arena gen-conf --output $OUTPUT_PATH --benchmark-id $SLUG --description $TEXT --tag $TEXT --prompt $PROMPT_TEXT --evaluation-type $TYPE --evaluation-value $VALUE --skill-type $TYPE --workspace-source-type $TYPE --requests $N --max-concurrency $N --timeout-ms $MS --variant-id $SLUG --adapter $ID --model $ID`

Composition rule:

- Any valid `gen-conf` invocation is `skill-arena gen-conf` plus any subset of the allowed options above.
- Repeatable options may appear multiple times where noted.
- Options that describe a specific source shape are meaningful only when paired with the corresponding `--skill-type` or `--workspace-source-type`.

Environment override notes:

- No documented environment variable changes the generated template defaults for `gen-conf`.
- The generated file may later be evaluated under `SKILL_ARENA_MAX_PARALLELISM`, `SKILL_ARENA_MODEL_<UPPER_SLUG>`, or `CODEX_HOME`, but those variables do not change the text emitted by `gen-conf`.

## Validate Config

# Validate a manifest or compare config
`skill-arena val-conf $CONFIG_PATH`

Environment override notes:

- No documented environment variable changes the validation behavior or default output of `val-conf`.

## Examples

# Dry-run the maintained compare benchmark
`skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --dry-run`

# Validate the maintained compare benchmark
`skill-arena val-conf ./benchmarks/skill-arena-compare/compare.yaml`

# Scaffold a benchmark compare config
`skill-arena gen-conf --output ./benchmarks/my-benchmark/compare.yaml --prompt "Read the repository and summarize the architecture." --evaluation-type llm-rubric --evaluation-value "Score 1.0 only if the answer covers the main architecture." --requests 3 --skill-type local-path`
