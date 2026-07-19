# Append-only JavaScript parity after V3

Use this layer only for the sealed generation-003 q003 recovery whose Python V3
receipt already verifies. It does not rerun Harbor, the model, or the verifier,
and it does not replace or edit V1, V2, or V3 evidence.

The V1 JavaScript resolver applied its Python-compatible score parser to every
JSON file. That is correct for recovery records whose self-digests preserve
Python float spellings, but it rejects legitimate native Harbor configuration
values such as `max_wait_sec: 60.0`. It also walked file manifests with locale
ordering, which differs from Python code-point ordering for names such as
`Dockerfile` and `answer.schema.json`.

V4 declares three independent, non-mutating corrections: an explicit parser
boundary, Python-compatible path ordering, and an opt-in publication comparison
for Harbor's lock defaults versus a recovered trial's omitted defaults.

- Native Harbor `JobResult`, `TrialResult`, `lock.json`, and the source job
  `config.json` use ordinary JSON. Their bytes remain authoritative only through
  the already sealed native artifact manifest; V4 never rewrites them.
- Recovery locks, recovery results, call journals, rewards, diagnostics, and
  effective manifests retain the narrow Python-compatible parser and all
  existing self-digest checks.
- File and directory manifests use Python Unicode code-point ordering.
- A sealed V4 inspector fork accepts only two named shapes. Native trial results
  must contain exactly six extra null environment fields and two extra null
  verifier fields. The recovered effective trial must preserve the source
  config's exact `{ type, mounts }` environment, omit `verifier`, and bind the
  seven declared lock defaults plus `{ "disable": false }`. Shape selection is
  explicit at each call site; the historical inspector remains byte-identical.

Before returning evidence, V4 executes the sealed Python V3 `--verify` path and
requires zero new calls. It then independently resolves the effective job and
cross-binds these eight fields to the V3 receipt:

1. recovery lock file SHA-256;
2. recovery record digest;
3. recovery result file SHA-256;
4. recovery result record digest;
5. effective job digest;
6. native retry job artifact digest;
7. recovered job artifact digest;
8. effective resume-manifest SHA-256.

Publication uses a V4-specific publisher fork and the V4 resolver directly; it
does not create or depend on another prepared overlay. The published provenance
binds the V4 verification contract instead of claiming a preparation receipt.
First publication delegates validation, durability, collision comparison, and
the no-replace directory move to a separately locked V4 Python helper.
That helper also exposes `--verify-parent`, a read-only mode that returns the V3
completion and eight-field cross-binding digests with explicit zero-call and
zero-write accounting.

The contract distinguishes nine V4-owned delta files from eight shared TCB
files: the complete local JavaScript import closure used by the resolver and
publisher plus the repository package manifests that lock the YAML dependency.
Both sets are rehashed before and after the sealed Python attestation and again
inside the atomic publication helper.

The ninth delta is the fresh-baseline wrapper. It preserves the prepared-v2
authentication, image, mount, runtime-smoke, and no-overwrite guards while
replacing only the obsolete historical resume precheck with the Windows-host
V4 verifier. Harbor is never invoked manually outside that wrapper.
