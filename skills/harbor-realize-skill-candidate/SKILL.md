---
name: harbor-realize-skill-candidate
description: Materialize, validate, digest-seal, and verify one complete skill candidate from a frozen parent bundle and an exact mutation contract. Use when a population, trace, Pareto, operator-coevolution, or human-reviewed development workflow has already chosen a mutation hypothesis and Codex must realize it as an isolated candidate with strict path scope, parent and evidence digests, explicit trusted argv-only validation, tamper-evident lineage artifacts, and no scoring, selection, promotion, installation, or Harbor/model calls by the realizer core.
---

# Harbor Realize Skill Candidate

Turn one reviewed development mutation into a provenance-complete candidate
bundle. The realizer core owns materialization and sealing only. It does not
diagnose Harbor results, choose a mutation, evaluate fitness, select a winner,
configure or release holdout, promote, install a skill, or call Harbor or a
model. Declared validation commands are trusted, unsandboxed code, so their
external behavior is explicitly unverified.

Runtime: Python 3.12 or newer, using only the standard library. In commands,
`<skill-root>` means this installed skill directory.

## Workflow

1. Read [references/candidate-realization-contract.md](references/candidate-realization-contract.md)
   completely before authoring the JSON config.
2. Freeze the parent bundle and obtain its canonical tree digest without a
   config or workspace:

~~~powershell
python <skill-root>/scripts/realize_skill_candidate.py digest <parent-skill>
~~~

   Record the returned `treeSha256` as `expectedParentTreeSha256`. Provide only
   reviewed development evidence. Keep holdout, hard-test, private verifier,
   answer, and secret-bearing artifacts outside the realizer's inputs.
3. Declare one exact operator instruction, its lineage, allowed file paths, and
   validation commands as argv arrays. Commands always run with `shell=False`
   in a disposable copy of the candidate.
4. Prepare the isolated editable workspace:

~~~powershell
python <skill-root>/scripts/realize_skill_candidate.py prepare realization.json
~~~

   Preparation verifies the expected parent digest before and after copying,
   creates a digest-frozen baseline and editable candidate copies under canonical
   skill-name directories, and writes `mutation-contract.json`. Repeating
   prepare verifies an existing matching workspace; it never resets edits.
5. Edit only the prepared candidate directory reported by the command. Follow
   the exact operator instruction. Do not edit the parent, baseline snapshot,
   mutation contract, benchmark, verifier, or output destination.
6. Seal after the candidate and its declared validations are ready:

~~~powershell
python <skill-root>/scripts/realize_skill_candidate.py seal realization.json
~~~

   Seal rejects parent or baseline drift, logical-name drift, unsafe filesystem
   nodes, out-of-scope changes, failed validation, validation-time mutation of
   the frozen source/workspace, and an existing destination. It builds and
   verifies a complete private staging tree before exclusive publication. The
   published tree is digest-sealed and tamper-evident, not filesystem-immutable.
7. Verify the published result without rerunning validation commands:

~~~powershell
python <skill-root>/scripts/realize_skill_candidate.py verify realization.json
~~~

8. Pass only the sealed `candidate/skills/<name>/` bundle to a separate Harbor
   evaluator. Treat `validation.json` as local realization evidence, never as
   fitness or promotion evidence.

## Boundaries

- Require the exact expected parent tree digest in config. Prepare-state alone
  is never authority for parent identity.
- Keep the parent skill, workspace, and sealed destination disjoint. Never
  overwrite or repair any of them automatically.
- Preserve the parent `SKILL.md` frontmatter name exactly. Candidate IDs and
  operator IDs do not change installed skill identity.
- Permit changes only through exact paths or `<directory>/**` prefixes declared
  before preparation. Reject traversal, absolute patterns, links, junctions,
  reparse points, sockets, devices, and other non-regular nodes.
- Bind every optional development-evidence file by ID, role, path, and digest.
  The only accepted evidence role is `development`.
- Run every validation from an argv array with no shell, in declaration order,
  in a disposable candidate copy. Receipts contain no wall-clock timestamps,
  durations, or raw command output.
- Set `trustedValidationCommands: true` only after reviewing every argv. The
  realizer supplies a disposable working directory and a credential-free
  minimal environment, but it is not a process, filesystem, or network sandbox;
  trusted code can still access host resources available to the caller.
- Rehash the external parent, prepared baseline, and editable candidate before
  and after validation. Any mutation aborts publication.
- Never import code from another skill bundle or require a repository checkout.
  Copy this complete directory when installing the skill.
- Never claim that a realized candidate improved anything. Harbor evaluation,
  selection, holdout comparison, promotion, and installation remain separate.

## Output

A successful seal publishes exactly:

~~~text
<output>/
├── mutation-contract.json
├── baseline/
│   └── skills/<name>/
├── candidate/
│   └── skills/<name>/
├── validation.json
├── candidate-manifest.json
└── operator-realization.json
~~~

All JSON receipts are deterministic, self-sealed, and cross-bound to the
parent, candidate, contract, operator, validation declaration, and diff. Their
zero-call and no-action fields describe only the realizer core. Because trusted
validation commands are not sandboxed, receipts explicitly leave their Harbor,
model, holdout, and external side effects unverified.

## Validation

After editing this bundle, run:

~~~powershell
python <skill-creator-root>/scripts/quick_validate.py <skill-root>
python -m py_compile <skill-root>/scripts/realize_skill_candidate.py
python <skill-root>/scripts/realize_skill_candidate.py --help
node --test test/harbor-realize-skill-candidate.test.js
~~~
