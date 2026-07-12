---
name: build-semantic-okf
description: Create, extend, rebuild, refresh, recover, audit, and validate coherent Semantic OKF knowledge snapshots with deterministic Python adapters for Markdown, CSV, JSON or JSONL, and RDF. Use when Codex needs to add, change, or remove declared sources; choose source separation, homogeneous partition union, or upstream canonicalization; review mappings, ontology terms, or SHACL rules; generate OKF concepts and semantic graphs; reprocess all sources safely; or promote a validated replacement snapshot. Do not use for answering questions from an existing snapshot; use consult-semantic-okf for read-only knowledge consultation.
---

# Build Semantic OKF

Create one deterministic, validated knowledge snapshot from reviewed local sources. Keep source content, ontology, provenance, and validation evidence distinct.

## Workflow

1. Write the scope and competency questions before defining the ontology.
2. Choose a source-combination topology. Preserve independent authorities as separate declarations; use a glob only for homogeneous physical partitions; perform true entity reconciliation upstream.
3. Inspect the physical fields, identifiers, encodings, and data quality. Record any profiling command and result beside the manifest.
4. Write a reviewed manifest with explicit classes, properties, source mappings, schemas, and evidence-backed SHACL rules.
5. Verify the locked Python runtime.
6. Build into a new output directory. The adapters parse every declared source strictly, normalize records, detect source changes, sort canonical records, and materialize the complete snapshot atomically.
7. Validate the generated bundle independently.
8. Hand the candidate snapshot to `$consult-semantic-okf` and test every competency query without mutating the candidate.
9. Refresh by rebuilding all declared sources and promoting only a validated replacement snapshot.

Do not infer classes, relations, rules, identity matches, or source precedence from field names alone. Ask for review when the mapping would change domain meaning.

## Required references

- Read [source-combination.md](references/source-combination.md) before combining more than one physical source.
- Read [manifest.md](references/manifest.md) before writing or changing a manifest.
- Read [coherence-contract.md](references/coherence-contract.md) before changing mappings, materialization, or validation behavior.
- Read [python-runtime.md](references/python-runtime.md) before installing or running the scripts.
- Read [refreshing.md](references/refreshing.md) before updating an existing snapshot.

## Environment

Run commands from the directory containing this `SKILL.md`, or prefix paths with the skill root.

```bash
python -m venv .venv
python -m pip install -r scripts/requirements.txt
python scripts/runtime_smoke.py
```

Use Python 3.12. No external data-processing engine is required.

## Build and validate

```bash
python scripts/build_semantic_okf.py manifest.json semantic-okf-output
python scripts/validate_semantic_okf.py semantic-okf-output --output-format json
```

The output directory must not already exist. A successful build contains:

```text
semantic-okf-output/
  index.md
  concepts/
  semantic/
    ontology.ttl
    data.ttl
    shapes.ttl
    provenance.ttl
    records.jsonl
    semantic-plan.json
    source-manifest.json
    validation-report.ttl
    build-report.json
```

Use `semantic/data.ttl` for asserted domain facts. Add `ontology.ttl` only for schema-aware work and `provenance.ttl` only for lineage. Never treat `shapes.ttl` or `validation-report.ttl` as domain knowledge.

## Refresh all sources

Preview a complete reprocessing pass:

```bash
python scripts/refresh_semantic_okf.py update manifest.json semantic-okf-output --check --output-format json
```

Promote an approved candidate:

```bash
python scripts/refresh_semantic_okf.py update manifest.json semantic-okf-output \
  --expected-current-tree-sha256 <current-tree-sha256> \
  --expected-candidate-tree-sha256 <candidate-tree-sha256> \
  --allow-plan-change \
  --allow-record-removals
```

Omit an approval flag when that change class is not intended. Refresh never merges generated trees in place. If promotion is interrupted, run:

```bash
python scripts/refresh_semantic_okf.py recover semantic-okf-output
```

## Consultation handoff

Publish only a validated snapshot, then use `$consult-semantic-okf` for read-only competency queries, semantic lookup, provenance tracing, and cross-source synthesis. Keep consultation tooling out of this lifecycle skill so a reader cannot accidentally acquire source, manifest, refresh, recovery, or promotion commands.

## Source rules

- `markdown`: one concept per file; mapped YAML values must be scalars; the body is preserved for reading.
- `csv`: exact, case-sensitive headers; header order is irrelevant; duplicate, missing, and extra columns fail; scalar conversion is strict.
- `json`: one object per line unless `multiLine=true`; missing declared fields become null; unknown fields are ignored; malformed or non-object records fail.
- `rdf`: one concept per absolute URI subject; blank nodes must be skolemized; repeated mapped predicate values remain repeated values.
- Non-RDF identity is `(source_id, record_id)`. RDF subjects are global and must not collide.
- Every generated concept keeps a single explicit origin. Multi-origin fusion belongs in an upstream canonicalization stage with an external identity map and merge ledger.

## Completion gate

Before delivery, confirm all of the following:

- the runtime smoke test passes;
- every declared source was read by a real adapter;
- the build and independent validator pass with no retained staging directory;
- paper or document text remains readable in the generated concepts;
- the source manifest reports stable content and record digests;
- OKF concepts, ledger subjects, data subjects, provenance origins, ontology classes, and SHACL targets agree;
- `$consult-semantic-okf` returns the reviewed result for every competency query without changing the snapshot;
- a second build from unchanged inputs produces the same logical artifacts;
- refresh preview reports additions, changes, and removals before promotion.
