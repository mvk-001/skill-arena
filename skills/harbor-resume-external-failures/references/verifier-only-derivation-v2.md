# Verifier-only derivation V2

Use this continuation only when the V1 verifier call journal is already sealed
as `completed` with exactly two deterministic verifier runs and the failure
happened later while materializing derived artifacts.

The continuation performs zero Harbor, agent, model, and verifier calls. It:

1. revalidates the V1 contract, its eight sealed executables, native retry,
   task, Pi trace, completed journal, input snapshot, and both verifier runs;
2. copies the complete failed post-call staging into an append-only evidence
   directory and labels the partial recovered job as untrusted evidence only;
3. permits exactly one semantic compatibility rule in memory:
   `TaskConfig.overwrite` absent equals the Harbor/Pydantic default `false`;
4. reconstructs the recovered job from the native retry plus the sealed first
   verifier run, never from the partial recovered job;
5. requires root and trial `config.json` and `lock.json` to remain byte-identical
   to the native retry; and
6. publishes a self-sealed V2 receipt binding the old call code, old journal,
   new completion code, compatibility projection, and exact call accounting;
   and
7. lets a V2-aware downstream publisher build into one UUID-owned sibling,
   fsync the complete three-file publication, and commit it with an atomic
   no-replace move to the single fixed `publications/q003` namespace.

The rule does not coerce `true`, `null`, strings, or any other missing field.
Any additional profile difference rejects the continuation. A completed call
journal is a hard prerequisite, so no verifier replay is possible.

If the V1 journal is complete but its post-call materializer failed, run the
V2 wrapper in `--doctor` and `--dry-run` modes first. Run live exactly once only
after both modes report zero planned Harbor, model, and verifier calls. Repeats
after completion are verification-only. Never repair or delete V1 staging.
