# Append-only q003 publication number parity V5

V5 exists only to publish the already verified V4 q003 derivation. It does not
run Harbor, a model, an agent, Docker, or a verifier, and it does not change any
V4 executable, contract, receipt, job, or recovery artifact.

The failed V4 commit exposed a cross-runtime serialization boundary. The
JavaScript publisher hashes its canonical result body with
`passThreshold: 0.000001`; Python's standard JSON serializer renders the same
number as `1e-06`. Those bodies have different SHA-256 digests even though they
parse to the same value.

V5 does not emulate JavaScript number formatting in Python. The sealed
JavaScript publisher first requires `result.json` and the V5 receipt to equal
its own canonical serialization and validates the V4 contract plus all eight
contrast-resume bindings. It passes the exact SHA-256 of result, report, and
receipt to the atomic Python helper.

The helper requires those three hashes on entry and immediately before the
no-replace rename. Its strict JSON reader rejects duplicate keys, a UTF-8 BOM,
CRLF, tabs, trailing whitespace, and a non-canonical root layout. To verify the
JavaScript self-digest without reserializing any number, it removes exactly one
canonical top-level `publicationSha256` line, reparses the remaining object, and
hashes those exact bytes. No result or receipt bytes are mutated.

The V5 receipt binds the V5 contract, the exact V4 parent contract, the result
and report hashes, the serialization boundary, the V4 completion, and the same
nine public bindings: the V4 contract hash plus eight contrast-resume digests.
Publication remains fixed to `publications/q003`, stages in an invocation-owned
UUID sibling, fsyncs before commit, and uses the inherited atomic no-replace
primitive. A distinct collision fails closed; an identical collision verifies
byte for byte.
