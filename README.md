# Skill Arena

Skill Arena is a Promptfoo-driven benchmark harness for evaluating coding agents with and without skill overlays in isolated workspaces.

Codex scenarios run through a Promptfoo custom script that uses the local Codex system via `codex exec` or `@openai/codex-sdk`.

Copilot CLI scenarios run through a Promptfoo custom script that uses the local `copilot` command.

Benchmarks can target either workspace-injected skills or skills already installed in the local Codex system.

## Quickstart

Prerequisites:

- Node.js 24 or newer
- local Codex CLI on `PATH` as `codex`
- local GitHub Copilot CLI on `PATH` as `copilot` when running `copilot-cli` scenarios
- Codex already authenticated on the machine

### 0. Install this repository with npm

Clone the repository and install dependencies. No global Promptfoo install is required because the repo uses the local package through `npm run` and `npx`.

```bash
git clone <your-fork-or-this-repo-url>
cd skill-arena
npm install
```

### 1. Install the `skill-arena-compare-author` skill

Copy the reusable skill into your local Codex skills directory, then restart Codex so it picks up the new skill.

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R ./skills/skill-arena-compare-author "${CODEX_HOME:-$HOME/.codex}/skills/skill-arena-compare-author"
```

### 2. Ask Codex to generate a compare config

Use the installed skill in any benchmark authoring workspace. For example:

```text
Use the skill-arena-compare-author skill to create deliverables/compare.yaml for this benchmark.
Return only the final compare.yaml content.
```

The repository also includes a ready-made benchmark for this exact task in `benchmarks/skill-arena-compare-author/compare.yaml`.

### 3. Run the benchmark

Execute the included compare benchmark:

```bash
npm run benchmark:compare -- ./benchmarks/skill-arena-compare-author/compare.yaml
```

To run the versioned minimal `copilot-cli` smoke comparison:

```bash
npm run benchmark:copilot:compare
```

### 4. Open the generated report

The compare run writes a merged report to:

```text
results/skill-arena-compare-author/<timestamp>-compare/merged/report.md
```

On PowerShell, this opens the most recent report:

```powershell
$report = Get-ChildItem .\results\skill-arena-compare-author\*\merged\report.md |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
Start-Process $report
```

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
