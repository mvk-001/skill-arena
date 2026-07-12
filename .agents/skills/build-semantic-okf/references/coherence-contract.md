# Semantic Coherence Contract

## Layer ownership

| Layer | Authoritative for | Must not claim |
|---|---|---|
| OKF Markdown | Human-readable concepts, citations, navigable knowledge | OWL entailment or SHACL conformance |
| OWL ontology | Classes, properties, logical meaning, imports/version | Record completeness |
| RDF data | Accepted normalized assertions and provenance markers | Completeness outside the selected graph |
| SHACL shapes | Operational acceptance rules for the selected data graph | Universal domain truth |
| Build manifests | Reproducible source/mapping/tool configuration | Independent evidence for semantic claims |

## Required invariants

For each `records.jsonl` entry, require all of the following:

1. Its `concept_id` resolves to exactly one OKF concept file.
2. The concept frontmatter fields match the record entry.
3. Its `ontology_class_iri` is declared as `owl:Class`.
4. Its `subject_iri` is an absolute IRI and has that `rdf:type` in `data.ttl`.
5. The subject has exactly one semantic `okfConceptId` equal to `concept_id`.
6. The subject repeats the expected source ID, raw-source digest, and normalized-record digest.
7. The source exists in `source-manifest.json` and contributes to its sorted records digest.
8. Its `source_refs` exactly match the PROV-O record entities linked with `prov:wasDerivedFrom`.

Also require the reverse direction: every generated concept has one record entry, and the complete subject set in accepted `data.ttl` equals the record-ledger subject set. Keep ontology, shapes, validation, and provenance triples out of the accepted data graph.

Preserve the reviewed manifest as `semantic/semantic-plan.json`. Reconstruct the ontology, accepted data, SHACL shapes, and provenance graphs from that plan plus `records.jsonl`, then require RDF graph isomorphism. Artifact hashes detect accidental byte changes; reconstruction detects coordinated semantic changes.

For ontology and rules, require:

- every mapped property is declared with the expected kind;
- every mapped property domain matches the source class and every typed literal has a valid lexical form for its declared range;
- every SHACL target class and path is declared;
- every rule carries a non-empty rationale;
- ontology IRI and version IRI are distinct and match all concept frontmatter;
- SHACL meta-validation succeeds before data validation;
- the generated data graph conforms under the recorded entailment regime.

## Source-combination invariants

Apply [source-combination.md](source-combination.md) whenever a build resolves more than one physical input.

For logical sources kept separate in one bundle:

- require a distinct stable source declaration and provenance entity per authority;
- scope non-RDF identity as `(source_id, record_id)`, so overlapping local IDs produce distinct concepts and generated subjects;
- never infer equivalence or collapse assertions merely because fields or titles match;
- keep `source_id` visible in cross-source answers;
- treat the shared `data.ttl`, validation, refresh, and release lifecycle as explicit non-isolation.

For a homogeneous partition union:

- require one logical source contract across every matched member;
- require global record-ID uniqueness across the complete glob;
- retain each record's concrete physical `source_path` while using one logical source ID and aggregate source digest;
- reject duplicate concept IDs and subject IRIs instead of deduplicating, merging fields, or selecting a winner;
- treat additions, changes, renames, and removals of any member as changes to the logical source snapshot.

RDF subjects remain absolute and therefore are not source-scoped. A repeated RDF subject collides even when its files or declarations differ. True entity fusion and multi-origin, assertion-level provenance require a reviewed upstream canonicalization contract or a future record-model extension.

## Digest policy

Compute `source_content_sha256` from raw bytes; for a source glob, hash the sorted `(relative_path, file_sha256)` pairs. Compute `record_sha256` from canonical normalized values, not parser or filesystem order. Compute `records_sha256` from the sorted record digests. Store lower-case SHA-256 hex strings consistently across concept frontmatter, RDF/provenance graphs, record ledger, and source manifest.

The bundled datatype encoder intentionally accepts a conservative local subset: years `0001` through `9999` for `xsd:date` and `xsd:dateTime`, valid optional timezone offsets, and finite `xsd:double` values. Reject unsupported but standards-valid edge lexical forms instead of silently changing them.

Treat graph isomorphism and normalized ledgers as the semantic reproducibility criteria. This pinned generator also writes a canonical sorted N-Triples-compatible Turtle representation and tests byte identity for operational no-op detection; do not generalize that implementation property to arbitrary Turtle serializers or use byte identity alone as semantic proof.

## Failure classes

- `manifest-error`: unsupported source, invalid IRI/name, missing mapping, or undeclared semantic term.
- `source-error`: unreadable input, malformed CSV/JSON/RDF, duplicate or empty record identifier.
- `okf-error`: invalid concept frontmatter, reserved filename misuse, or concept/record mismatch.
- `semantic-error`: RDF parse failure, undeclared class/property, missing reverse mapping, or provenance mismatch.
- `coherence-error`: internally valid artifacts disagree with the reviewed plan, ledger, index, provenance, or live report.
- `shacl-nonconformant`: validation completed and produced results.
- `processor-failure`: RDF or SHACL processing could not complete.

Keep these outcomes distinct in machine-readable reports.

## Scope limits

The bundled validator does not certify full OWL 2 DL consistency or syntactic profile membership. Run a profile-aware checker and a suitable reasoner separately when those guarantees are required. Execution scale does not change semantic validity.

## Refresh contract

Treat every bundle as one immutable generated snapshot. Reprocess the original manifest and all declared sources into a separate candidate; never merge candidate files with the current tree. Before promotion, require both semantic and OKF validation, a stable post-build source snapshot, a reviewed plan/version decision, and an unchanged current-tree digest.

Record additions, changes, and removals by source and concept ID. Preserve deterministic concept and subject identifiers only when their source ID and record ID remain stable. Require explicit approval for removals because a full refresh intentionally deletes concepts and triples no longer produced by a source.

Promotion of an existing populated path is a journaled two-rename transaction with rollback and recovery, not a single portable atomic exchange. Keep the candidate, backup, lock, and journal as siblings on the same filesystem. Never follow links or delete paths not owned and named by the transaction.

## Consultation handoff

Publish the record ledger, readable concepts, accepted data, ontology, provenance, shapes, validation report, semantic plan, and passing build report as one coherent revision. Then use `$consult-semantic-okf` for graph selection, read-only queries, evidence tracing, and answer synthesis. Do not bundle consultation commands into the lifecycle skill.
