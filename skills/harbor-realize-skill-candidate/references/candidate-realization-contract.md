# Candidate Realization Contract

## Configuration

Paths resolve from the configuration file. JSON is the only accepted format.
Duplicate object keys and non-finite numbers are rejected as non-canonical and
ambiguous.

~~~json
{
  "schemaVersion": 1,
  "realization": {
    "id": "generation-001-child-a",
    "candidateId": "child-a",
    "parentSkill": "../skills/example-skill",
    "expectedParentTreeSha256": "sha256:<64 lowercase hexadecimal characters>",
    "workspaceDir": "../runs/child-a-workspace",
    "outputDir": "../runs/child-a-sealed",
    "operator": {
      "operatorId": "tighten-contract",
      "instruction": "Tighten observable output requirements without adding benchmark facts.",
      "origin": "operator-coevolution",
      "parentOperatorIds": []
    },
    "allowedChanges": [
      "SKILL.md",
      "references/**",
      "scripts/**",
      "agents/openai.yaml"
    ],
    "developmentEvidence": [
      {
        "id": "reflection-plan",
        "role": "development",
        "path": "../evidence/reflection-plan.json",
        "sha256": "sha256:<64 lowercase hexadecimal characters>"
      }
    ],
    "trustedValidationCommands": true,
    "validationCommands": [
      {
        "id": "python-syntax",
        "argv": ["python", "-m", "py_compile", "scripts/tool.py"],
        "timeoutSeconds": 60
      }
    ]
  }
}
~~~

`id`, `candidateId`, and `operatorId` are portable lowercase identifiers.
`parentOperatorIds` may be empty. `origin` and `instruction` must be non-empty.
At least one allowed-change rule and validation command are required.

The parent, workspace, and output directories must be distinct and non-nested.
The output must not exist when sealing. The workspace may already exist only
when its exact mutation contract, baseline, and canonical layout verify;
prepare never discards or replaces candidate edits.

## Tree digest

Obtain the canonical value before writing a config:

~~~powershell
python <skill-root>/scripts/realize_skill_candidate.py digest <parent-skill>
~~~

The command is read-only and emits only logical name, digest, file and directory
counts, and total bytes. It rejects links and reparse points.

The tree digest covers every directory and regular file below the bundle root.
Entries are ordered by unsigned UTF-8 bytes of their POSIX relative path, then
by kind. For a directory, hash `D`, NUL, path bytes, NUL. For a file, hash `F`,
NUL, path bytes, NUL, raw file bytes, NUL. Prefix the lowercase SHA-256 result
with `sha256:`. The root directory itself is not an entry.

Links, junctions, Windows reparse points, sockets, devices, and other special
nodes are invalid. Digest computation fails instead of following them.

## Change scope

An allowed-change rule is either one exact POSIX relative path or a directory
prefix ending in `/**`. Absolute paths, `.` or `..` segments, backslashes, and
other glob syntax are rejected. Creation, modification, or deletion of a file
or directory must match a declared rule. A candidate must contain at least one
change, and its frontmatter name must remain equal to the parent name.

## Validation

Each command has an ID, a non-empty argv string array, and an integer timeout
from 1 through 300 seconds. The first argv element is executed directly with
`shell=False`; the working directory is a disposable copy of the edited
candidate. No command-specific environment or working-directory override is
accepted. A nonzero exit, signal, launch failure, or timeout aborts sealing.

`trustedValidationCommands` must be exactly `true`. This is an explicit caller
acknowledgement that argv commands are trusted code. The realizer rejects
direct shell executables, uses `shell=False`, gives commands a disposable
candidate copy, and replaces the inherited environment with a minimal policy:
PATH and required Windows loader variables, disposable HOME/TEMP directories,
and non-secret Python/output controls. This is not a security sandbox. A trusted
program may still use the network, read host paths named in argv, write outside
its working directory, or start child processes. Parent, baseline, candidate,
config, and evidence byte integrity are checked after validation, but semantic
holdout or secret non-access cannot be proven by those hashes.

The deterministic validation receipt records only command ID, argv, timeout,
exit code, and `passed`. It intentionally omits output, timestamps, and
durations. Validation may create files in its disposable copy, but the external
parent, prepared baseline, and editable candidate must retain their exact
pre-validation digests.

## Evidence and outputs

Every evidence entry must use role `development` and bind one ordinary file by
exact SHA-256. Evidence is rechecked during prepare, seal, and verify. The
realizer rejects paths with an obvious `holdout` or `hard` component and has no
holdout input or release mode. The role remains a caller attestation; digests
prove bytes and identity, not the semantic development/holdout classification.

`mutation-contract.json` binds the original config digest, lexical paths,
expected parent, operator instruction and digest, evidence, path scope, and
validation argv. `validation.json` records the passed realization checks.
`candidate-manifest.json` records the exact parent/candidate trees and diff.
`operator-realization.json` binds the operator and lineage to the sealed
candidate and the other receipts. Each JSON document has a canonical object
digest field; file digests provide the cross-document bindings.

The published directory remains writable unless the surrounding storage layer
adds access controls. "Sealed" means its exact bytes are digest-bound and later
changes fail verification; it does not mean filesystem immutability. Receipt
boundaries distinguish the zero Harbor/model calls and absent selection or
promotion actions of the realizer core from trusted validation commands. Since
those commands are deliberately not sandboxed, their Harbor/model calls,
holdout access, and external side effects are recorded as unverified rather
than zero or absent.

Verification is read-only and does not rerun validations. It recomputes every
tree, evidence, diff, object seal, file binding, config binding, and boundary.
Any drift is a hard failure.
