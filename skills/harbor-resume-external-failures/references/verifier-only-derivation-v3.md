# Verifier-only derivation V3

Use V3 only after the sealed V2 derivation itself failed before publishing a
recovery lock, while the original V1 verifier journal remains completed and
immutable. V3 is append-only: it binds and copies the V2 owner and staging as
failed derived evidence and never edits or deletes them.

V3 permits exactly two in-memory Harbor/Pydantic default equivalences:

- an absent `JobConfig.tasks[0].overwrite` equals `false`; and
- an absent `JobConfig.n_attempts` equals `1`.

Both values must be the exact defaults materialized by Harbor 0.18.0. The
native and recovered root/trial configs and locks remain byte-identical; no
field is written back. Explicit values of another type/value, another missing
field, a second profile delta, or drift in V1/V2 evidence rejects completion.

Run the sealed wrapper with `--doctor` and `--dry-run` first. Both modes are
read-only and must report zero planned Harbor, model, and verifier calls. Live
completion also makes zero calls. After completion, repeat live only as an
idempotence check and use `--verify` for receipt validation.

Before live, use `--rehearse` to exercise the complete build, finish, and
verification path against disposable copies under the operating-system temp
directory. It must report a semantic result, zero calls, and zero workspace
writes, then remove its temporary tree.
