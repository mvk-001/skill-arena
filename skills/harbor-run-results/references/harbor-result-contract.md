# Harbor Result Contract

Read this reference before comparing jobs or diagnosing result drift.

## Native artifacts

A completed Harbor job normally contains:

~~~text
<job>/
├── config.json
├── lock.json
├── result.json
└── <trial>/
    ├── result.json
    ├── agent/
    │   └── trajectory.json
    └── verifier/
        ├── reward.txt or reward.json
        └── test output
~~~

- config.json records the requested JobConfig.
- lock.json records resolved task digests, Harbor version, environment,
  verifier, agent settings, and skill content digests.
- the job result records planned/completed/error counts and aggregate usage.
- each trial result records task checksum, agent/model/version, rewards,
  exception information, token/cost usage, and phase timing.

The bundled reporter validates these JSON objects with Harbor 0.18.0 models.
It uses immediate child trial result files when present and falls back to
embedded job trial results for compatible archived jobs.

## Completion gate

A final report requires all of the following:

- finished_at exists
- the number of trial artifacts equals n_total_trials
- completed count equals the number of trial artifacts
- pending and running counts are zero
- every non-exception trial has the configured reward key
- trial ids and names are unique

An exception may still be a completed trial. It remains an error and never
becomes a normal reward failure.

## Reward and usage semantics

The default pass gate is reward >= 1.0. Override --reward-key and
--pass-threshold only when the task's verifier contract declares another
metric or scale.

Harbor n_input_tokens includes cached input. Complete total tokens are:

~~~text
n_input_tokens + n_output_tokens
~~~

n_cache_tokens is reported separately and must not be added again. For
multi-step tasks, Harbor usage is the sum of step agent contexts.

Agent latency excludes environment setup and verifier time. Use the top-level
agent_execution timing for a single-step trial. For multi-step tasks, require
complete timing for every step and sum those durations.

## Fair comparison

Pass baseline first when using --compare. With lock.json present for every job,
the reporter permits skill provenance to differ and requires the remaining
resolved lock contract to match. It also requires identical observed:

- task names and checksums
- agent names and versions
- model identifiers
- attempt counts per task/agent/model cell

If no job has lock.json, comparison can verify only those observed fields. The
report labels its fairness basis as trial-results and includes a limitation.
Mixed presence of lock files is rejected.

## Failure classes

- Config failure: Harbor cannot resolve JobConfig during --print-config.
- Incomplete job: missing final timestamp, trials, rewards, or settled counts.
- Infrastructure error: environment, Docker, cloud sandbox, or setup failure.
- Agent error: timeout, authentication, unsupported model, crash, or agent
  exception.
- Verifier failure: the agent completed without an exception but reward stayed
  below the pass threshold.
- Fairness drift: compared jobs differ beyond their intended skill treatment.

Keep these classes distinct in the final user-facing summary.
