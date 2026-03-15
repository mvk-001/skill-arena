---
name: skill-arena-compare
description: Use this skill when you need to author or refine a Skill Arena compare.yaml file.
---

# Skill Arena Compare

Author a `compare.yaml` file for Skill Arena.

## Goal

Produce a concise compare config that gives:

- skill-mode columns such as `no-skill` and `skill`
- rows by prompt and agent/configuration
- explicit repeated executions through `evaluation.requests`
- labels that read well in Promptfoo and in `merged/report.md`

## Rules

1. Keep the task prompt exact and benchmark-specific.
2. Prefer `task.prompts` over a single `task.prompt` when the benchmark should compare multiple prompt variants.
3. Set `evaluation.requests` explicitly. Use `10` unless the benchmark has a reason to use a different count.
4. Set `evaluation.maxConcurrency` explicitly when the benchmark should scale with local machine capacity. Prefer `80%` of the machine's available parallelism, rounded down, with a minimum of `1`.
5. Prefer two skill modes by default:
   - `no-skill`
   - `skill`
6. Set `skillSource` explicitly when the benchmark depends on a system-installed skill.
7. Give every variant a stable slug id and a readable `output.labels.variantDisplayName`.
8. Keep assertions strict enough to measure the benchmark goal, but avoid unnecessary harness instructions in the prompt.
9. Write the final config into the user's current working workspace at the path they requested, such as `./compare.yaml` or `./deliverables/compare.yaml`. Do not write outputs into the skill directory, the repository skill source, or any hidden helper location unless the user explicitly asks for that.
10. Reuse the template in `assets/compare-template.yaml` as the starting point.

## maxConcurrency guidance

When the user wants the compare config to use local machine capacity, calculate `evaluation.maxConcurrency` from Node.js and write the computed integer into the YAML.

Preferred Node.js snippet:

```js
import os from "node:os";

const capacity = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : os.cpus().length;

const maxConcurrency = Math.max(1, Math.floor(capacity * 0.8));
console.log(maxConcurrency);
```

PowerShell one-liner:

```powershell
node -e "const os=require('node:os'); const capacity=typeof os.availableParallelism==='function' ? os.availableParallelism() : os.cpus().length; console.log(Math.max(1, Math.floor(capacity * 0.8)));"
```

If the benchmark should stay portable across machines and the user does not want machine-specific numbers committed into the file, omit `evaluation.maxConcurrency` and note that the harness will use local machine parallelism by default.

## Output

When writing files, treat the user's current workspace as the destination root.

Return only the completed `compare.yaml` content unless the user asks for explanation.
