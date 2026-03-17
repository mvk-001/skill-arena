# Skill Arena

Skill Arena is a CLI harness for evaluating coding agents with and without skills (skill vs no-skill) in reproducible, isolated workspaces.

The CLI package creates evaluation artifacts (`promptfooconfig.yaml`, `summary.json`) and runs controlled comparisons across prompts, skill modes, and agent configurations.

Codex scenarios run through a Promptfoo custom script that uses the local Codex system via `codex exec` or `@openai/codex-sdk`.

Copilot CLI scenarios run through a Promptfoo custom script that uses the local `copilot` command.

Benchmarks can target either workspace-injected skills or skills already installed in the local Codex system.

## Quickstart

Prerequisites:

- Node.js 24 or newer
- local Codex CLI on `PATH` as `codex`
- local GitHub Copilot CLI on `PATH` as `copilot` when running `copilot-cli` scenarios
- Codex already authenticated on the machine

### 0. Install dependencies

Clone the repository and install dependencies. No global Promptfoo install is required because the repo uses the local package through `npm run` and `npx`.

```bash
git clone <your-fork-or-this-repo-url>
cd skill-arena
npm install
```

or

```bash
pnpm install
```

To run Skill Arena as a dependency or globally from the published package:

```bash
npm install -g skill-arena
pnpm add -g skill-arena
```

If you need the package temporarily without installing it globally, use:

```bash
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx skill-arena evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
npx skill-arena --version
```

You can run the CLI with the workspace scripts, `npx`, or through a local install:

```bash
# local workspace script
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml

# direct CLI binary (`npm` / `npx`, `pnpm dlx`, or package bin scripts)
npx . evaluate ./benchmarks/skill-arena-compare/compare.yaml
npx . evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
npx . --version

pnpm exec skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
pnpm exec skill-arena evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
```

When the package is installed from npm under a name, use:

```bash
npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
```

Command help is also command-aware:

```bash
skill-arena --help
skill-arena evaluate <manifest-or-compare-path> [--scenario <scenario-id>] [--dry-run]
skill-arena help evaluate
skill-arena help gen-conf
skill-arena help val-conf
skill-arena evaluate --help
```

### 1. Install the `skill-arena-compare` skill

Copy the reusable skill into your local Codex skills directory, then restart Codex so it picks up the new skill.

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R ./skills/skill-arena-compare "${CODEX_HOME:-$HOME/.codex}/skills/skill-arena-compare"
```

### 2. Ask Codex to generate a compare config

Use the installed skill in any benchmark authoring workspace. For example:

```text
Use the skill-arena-compare skill to create deliverables/compare.yaml for this benchmark.
Return only the final compare.yaml content.
```

The repository also includes a ready-made benchmark for this exact task in `benchmarks/skill-arena-compare/compare.yaml`.

### 3. Run the benchmark

Execute the included compare benchmark:

```bash
npm run benchmark:compare -- ./benchmarks/skill-arena-compare/compare.yaml

# Or use evaluate to let it auto-detect
skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml
skill-arena evaluate ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
```

To run the versioned minimal `copilot-cli` smoke comparison:

```bash
npm run benchmark:copilot:compare
```

### 4. Open the generated report

The compare run writes a merged report to:

```text
results/skill-arena-compare/<timestamp>-compare/merged/report.md
```

On PowerShell, this opens the most recent report:

```powershell
$report = Get-ChildItem .\results\skill-arena-compare\*\merged\report.md |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
Start-Process $report
```

The evaluate CLI compare mode also prints these final artifact paths at the end of the run:

- `Compare summary`
- `Final merged summary`
- `Final merged report`

It also prints the final merged markdown table and the merged JSON summary to stdout.

### 5. Optional: inspect execution details in Promptfoo

After at least one run, open the Promptfoo viewer:

```bash
npx promptfoo@latest view
```

Start with these documents:

1. [Architecture](./docs/architecture.md)
2. [Specs](./docs/specs.md)
3. [Usage guide](./docs/usage.md)
4. [Testing](./docs/testing.md)
5. [Agent guidance](./AGENTS.md)

The repository has two authoring surfaces:

- `manifest.yaml` for scenario-oriented benchmark runs
- `compare.yaml` for one Promptfoo eval with skill-mode columns and variant/prompt rows

Promptfoo is the evaluation runtime behind both formats.

`skill-arena gen-conf` is the fast compare authoring helper. It generates a commented `compare.yaml` starter with `TODO:` markers for benchmark metadata, prompts, assertions, workspace sources, skill source shape, and the first variant.

```bash
npx skill-arena gen-conf \
  --output ./benchmarks/my-benchmark/compare.yaml \
  --prompt "summarize file A" \
  --evaluation-type javascript \
  --evaluation-value @checks.js \
  --prompt "create an evaluation script" \
  --evaluation-type llm-rubric \
  --evaluation-value "Score 1.0 only if the script is present and correct." \
  --requests 3 \
  --maxConcurrency 8 \
  --skill-type git
```

For the older developer-only flow that writes the intermediate Promptfoo config for one manifest scenario, keep using:

```bash
npm run generate:config -- ./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill
```
