---
name: harbor-run-results
description: Run, validate, inspect, compare, and report Harbor evaluations without Skill Arena. Use when Codex needs to execute a Harbor job config, summarize completed Harbor job or trial artifacts, compare baseline and skill jobs, classify verifier failures versus execution errors, launch the Harbor viewer, or publish native final-report.json and final-report.md artifacts.
---

# Harbor Run Results

Turn Harbor jobs into a concise, evidence-backed final report without invoking
Skill Arena or importing its runtime modules.

Runtime: use uv and Python 3.12 or newer. The bundled reporter pins Harbor
0.18.0 through inline script metadata. In commands, <skill-root> means this
installed skill directory.

## Comparison decisions

Separate three questions: did execution finish, are the jobs comparable, and
what outcome did the verifier measure? Answer them in that order. Report the
paired task/attempt coverage, configured reward and pass threshold, errors,
and available resource measures before interpreting an aggregate delta.
A larger mean cannot compensate for a required gate owned by the study.

Treat repeated attempts as measurements of the same task, not new independent
tasks. State the independent family count and uncertainty only when the
supplied study evidence supports them. A descriptive report, legacy unlocked
comparison, or partial diagnostic report does not itself authorize promotion
or establish that the skill caused a general improvement.

## Workflow

1. Identify whether the user wants an existing job inspected or a fresh job
   executed. Do not rerun completed evidence when inspection alone satisfies
   the request.
2. Read [references/harbor-result-contract.md](references/harbor-result-contract.md)
   completely before comparing jobs or diagnosing artifact drift.
3. Validate a job config without launching an agent:

~~~powershell
uvx --from harbor==0.18.0 harbor run --config <job.yaml> --print-config
~~~

4. For a requested live run, require `retry.max_retries: 0` in the native
   config, choose a new job name, and execute Harbor:

~~~powershell
uvx --from harbor==0.18.0 harbor run --config <job.yaml> --job-name <unique-name>
~~~

Preserve partial jobs as evidence. Route independently proven external
failures to `harbor-resume-external-failures` under its fixed retry cap and
first-evaluable policy. A reporting request does not authorize rerunning
semantic failures or resuming a job against changed skill content.

5. Produce the final report from one completed job:

~~~powershell
uv run <skill-root>/scripts/report_harbor_jobs.py <jobs>/<job-name> --output-dir <reports>/<run-id>
~~~

6. Compare baseline and treatment jobs with the baseline first:

~~~powershell
uv run <skill-root>/scripts/report_harbor_jobs.py <jobs>/<baseline> <jobs>/<treatment> --compare --output-dir <reports>/<run-id>
~~~

The reporter validates config.json, result.json, every trial result, and
lock.json when present through Harbor's own Pydantic models. Comparison fails
closed on task checksum, attempt, agent, model, agent-version, or lock drift.

7. Read final-report.md first, use final-report.json for structured details,
   and inspect individual trial directories only for failures or requested
   evidence. Optionally launch the native viewer with:

~~~powershell
uvx --from harbor==0.18.0 harbor view <jobs-directory>
~~~

## Reporting Rules

- Call config validation, dry inspection, live execution, and artifact-only
  reporting by their exact names.
- Treat an execution exception as an error, not a verifier failure.
- Refuse incomplete jobs by default. Use --allow-incomplete only for an
  explicitly labeled partial diagnostic report.
- Use Harbor input-token counts as totals that already include cached input;
  never add cached input a second time.
- Report total tokens only when input and output counts both exist.
- Measure agent latency from agent_execution; for multi-step trials, sum only
  complete per-step agent timings.
- Use lock.json skill digests and task provenance when available. State the
  weaker fairness basis when legacy jobs have no lock.
- Do not paste trajectories or long raw logs into the user response. Surface
  the report, relevant job directories, pass/error counts, and decisive deltas.
- Do not describe fixture or synthetic artifacts as live model evidence.

## Output

The reporter writes:

~~~text
<output>/
├── final-report.json
└── final-report.md
~~~

It refuses to replace either file unless --overwrite is explicit. The JSON
preserves job summaries, task/agent/model breakdowns, trial outcomes, skill
provenance, comparison deltas, and the fairness basis.

## Validation

After editing this bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/report_harbor_jobs.py
uv run <skill-root>/scripts/report_harbor_jobs.py --help
~~~
