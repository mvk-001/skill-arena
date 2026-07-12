# Refreshing a Semantic OKF Snapshot

## Contents

1. Operation model
2. Check and update
3. Review gates
4. Transaction and recovery
5. Automation
6. Limits

## 1. Operation model

Keep initial creation and refresh separate:

- `build_semantic_okf.py` creates a new output path and refuses an existing destination.
- `refresh_semantic_okf.py update` requires an existing validated bundle, reprocesses every declared source, builds a complete candidate, compares snapshots, and promotes only the validated candidate.

Always pass the original manifest in its original directory. Relative source paths in the copied `semantic/semantic-plan.json` are traceability data, not a relocated refresh root.

Refresh is a full rebuild. It never copies old concepts or merges RDF, so source deletions cannot leave stale Markdown, triples, or provenance.

## 2. Check and update

Preview freshness without changing the visible bundle:

```bash
python scripts/refresh_semantic_okf.py update manifest.json OUTPUT_DIR \
  --check --output-format json
```

`--check` exits `0` when the rebuilt snapshot is byte-identical and `3` when changes are pending. Its JSON includes source, record, artifact, plan, revision, and tree differences plus any review blockers.

Promote an ordinary source-content update:

```bash
python scripts/refresh_semantic_okf.py update manifest.json OUTPUT_DIR \
  --output-format json
```

Preview and promotion are separate complete rebuilds. For compare-and-swap automation, pin both the observed published tree and the exact candidate tree reviewed in the preview:

```bash
python scripts/refresh_semantic_okf.py update manifest.json OUTPUT_DIR \
  --expected-current-tree-sha256 PREVIEW_PREVIOUS_TREE_SHA256 \
  --expected-candidate-tree-sha256 PREVIEW_CURRENT_TREE_SHA256 \
  --output-format json
```

Those values are `previous.tree_sha256` and `current.tree_sha256` in the preview JSON. The first detects another writer changing the published snapshot; the second rejects a rebuilt candidate that differs from what was reviewed because sources, configuration, or processors changed. Keep inputs pinned or quiescent anyway, and use both values for unattended promotion.

## 3. Review gates

Refresh blocks these changes by default:

- **Reviewed-plan changes:** pass `--allow-plan-change` after reviewing mappings, rules, schemas, source configuration, and ontology metadata.
- **Removed records:** pass `--allow-record-removals` only after checking every concept ID in `changes.records.removed`.
- **Semantic changes with a reused version IRI:** change `bundle.version_iri`; this blocker cannot be bypassed.
- **Bundle identity changes:** a new `base_iri` or `ontology_iri` requires a new output directory.
- **Unmanaged or manually edited files:** audit them separately; refresh will not silently erase or preserve them.

The same `record_id` under the same source retains its deterministic concept path and normalized subject IRI. A changed record body or attributes changes its record digest. Added and removed IDs appear explicitly in the diff.

For version enforcement, a semantic change means a change to ontology classes/properties, rules, `base_iri`, `ontology_iri`, prefix, declared OWL profile, or any source configuration except `path` and `allow_empty`. Schema, reader options, class, ID/title fields, and property mappings can change normalized graph meaning and therefore require a new `version_iri`. Path-only and `allow_empty` changes still require `--allow-plan-change`, but do not independently trigger ontology-version reuse.

With `allow_empty: true`, a source glob may resolve to no files and contributes zero records. Without it, a missing match is a source error. If every source is empty, the builder still fails because no normalized records exist.

There is intentionally no override for unmanaged or manually edited files in the generated tree. Preserve or audit such files elsewhere, then create a clean bundle at a new path or restore the current bundle from a known generated snapshot before refreshing.

After promotion, rerun stored competency queries against the refreshed snapshot and compare their expected results. Refresh validates structure and graph coherence; it cannot decide whether domain answers remain correct.

## 4. Transaction and recovery

Refresh uses a sibling lock, candidate, backup, and durable journal. It validates the candidate with the semantic and OKF validators, re-hashes the original sources, verifies that the current bundle did not change during the build, and then performs a two-rename promotion.

Ordinary promotion failures trigger rollback. If the process or host stops between renames, run:

```bash
python scripts/refresh_semantic_okf.py recover OUTPUT_DIR --output-format json
```

Recovery trusts hashes and validators, not only the journal state. It commits an already promoted valid candidate or restores the matching valid backup. Ambiguous or externally modified states fail without deleting evidence.

Recovery has no dry-run mode: invoke it only when a journal exists and preserve the output, candidate, backup, and journal before manual incident analysis.

## 5. Automation

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | Updated, unchanged, or recovered successfully |
| `2` | Build, validation, policy, concurrency, promotion, or recovery error |
| `3` | `--check` found pending changes |

Use JSON output in CI. Keep the manifest and source inputs outside the output directory. Serialize scheduled writers per bundle; the command also enforces a filesystem lock and fails fast when another writer owns it.

When `--check` finds changes, it exits `3` even if the JSON also contains policy blockers. A non-check promotion with unresolved blockers exits `2` and leaves the current tree unchanged.

## 6. Limits

- Promotion of a populated directory is two atomic renames, not one portable atomic exchange; the direct path may be absent briefly.
- Keep enough free space for the old bundle, candidate, and temporary backup.
- Open files, antivirus, indexers, network shares, or permission changes can block directory renames. UNC refresh targets are rejected on Windows.
- Refresh supports local manifest-relative sources only, matching the builder contract.
- Do not place credentials in the manifest or generated bundle.
- Readers that require uninterrupted availability should publish immutable release directories and manage a separate atomic `current` pointer outside this skill.
- Byte identity is an operational no-op criterion for this pinned generator, not a general statement that arbitrary Turtle serializers are byte-stable. Semantic validation still reconstructs graphs and compares them by isomorphism.
