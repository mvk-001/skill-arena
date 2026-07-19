# Consulting Source Boundaries

Use source topology as part of answer semantics. Source IDs preserve identity and provenance; they do not automatically create authorization or named-graph boundaries.

## Separate authorities in one bundle

- Filter one authority with an exact ledger `--source-id`.
- Compare authorities through one batched query over `data`, projecting or constraining `sourceId` so each statement retains its authority.
- Add `provenance` only when the answer needs the physical source member or derivation chain.
- Do not treat similar local record IDs from different non-RDF sources as the same entity.

## Homogeneous partition union

- Treat all physical members declared by one glob-backed source as one logical authority.
- Query the union with its one logical `source_id`.
- Use ledger `source_path` or provenance `prov:atLocation` to identify the physical partition.
- Do not infer semantic differences from partition order or filenames.

## Separate bundles

- Consult each authorized bundle independently.
- Record the revision digest of every bundle used in a cross-bundle answer.
- Use a separately authorized client or named-graph dataset for cross-bundle joins.
- Never copy independent bundles into one ungoverned default graph and continue describing them as separated.

## Identity and evidence

The normalized `record_id` is build identity, not automatically a queryable business key. Use only reviewed mapped properties for semantic joins. Keep the source ID, record ID, stable subject IRI, page or evidence locator, and exact `concept_path` distinct in the coverage ledger.

When a cross-source answer claims equivalence or conflict, require explicit reviewed evidence. Shared dimensions or matching strings are discovery signals, not identity assertions.
