# Source Combination Protocol

## Contents

1. Scope and terms
2. Choose the topology
3. Mode S: keep logical sources separate
4. Mode U: homogeneous partition union
5. Entity fusion and upstream canonicalization
6. Refresh behavior and consultation handoff
7. Required evidence and acceptance tests
8. Manifest examples

## 1. Scope and terms

Apply this protocol before writing a manifest that uses more than one input. Record the decision beside the original manifest because the generated bundle cannot infer governance, authority, or identity policy from observed rows.

- **Physical member:** one file or independently versioned input.
- **Logical source:** one entry in the manifest `sources` array and therefore one `source_id` namespace.
- **Separate-in-bundle:** several logical sources share one bundle but retain distinct source and identity namespaces.
- **Separate-bundles:** each source has its own bundle and release boundary.
- **Logical union:** several compatible physical members match one logical source path/glob and are appended as one record set.
- **Entity fusion:** two or more input records believed to describe the same real entity are coalesced into one canonical record. This is not the same operation as logical union.

The direct builder supports separate logical sources and append-only logical union. It does not perform entity resolution, field-level coalescing, cross-source joins, precedence selection, or automatic `owl:sameAs` assertions.

## 2. Choose the topology

Evaluate the gates in order. Any failed gate moves the decision left toward stronger separation.

| Question | Separate bundles | Separate in one bundle | One logical source |
|---|---:|---:|---:|
| Different tenant, access, license, retention, deletion, or security boundary? | Required | No | No |
| Must one source be releasable or refreshable without exposing the others? | Preferred | Possible only as one atomic bundle refresh | No |
| Different authority, ownership, evidence strength, or update cadence? | Possible | Preferred | No |
| Different kind, class, mapping, scalar schema, or reader options? | Possible | Required without preprocessing | No |
| Same authority, governance, class, mapping, schema, and cadence? | Possible | Possible | Eligible |
| Record IDs unique across all physical members by contract? | Not required | Scoped per source | Required |
| Input records may describe the same entity or disagree by field? | Keep separate or fuse upstream | Preferred | Direct union prohibited |

Use the following decision rule:

1. Choose **separate-bundles** for hard governance or access isolation. The consultant's local query helper and `data.ttl` are not an authorization boundary or named-graph store.
2. Choose **separate-in-bundle** when sources may be queried together under one release boundary but their authority, semantics, provenance, refresh analysis, or identity namespaces must remain distinguishable.
3. Choose **logical union** only when all members implement one reviewed source contract and appending records is sufficient.
4. Choose **upstream canonicalization** when schemas can be deterministically normalized but the direct-union preconditions are not met.
5. Keep sources separate when entity matching or conflict resolution lacks an approved, reproducible policy.

## 3. Mode S: keep logical sources separate

### 3.1 Invariants

- Declare one manifest source per logical authority and give each a stable, unique `id`.
- Keep its own path, mapping, class, schema/options, content digest, record count, and aggregate record digest.
- Treat `(source_id, record_id)` as the identity key for non-RDF records. The same `record_id` may appear in different logical sources because generated concept and subject IRIs include `source_id`.
- Never infer equivalence because titles, identifiers, or field values happen to match. Add a reviewed object relation or an externally justified alignment only when the ontology workflow accepts it.
- Query or aggregate across the sources explicitly; do not erase `source_id` during export or downstream loading.
- Refresh still rebuilds and promotes the complete bundle atomically. Diffs remain attributable per source, but one source is not independently deployable inside the bundle.
- Remember that SHACL rules target ontology classes, not source declarations. Two sources mapped to the same class share its acceptance rules in one bundle.

RDF is stricter: an RDF record retains its absolute subject IRI instead of receiving a source-scoped subject. Two separate RDF sources that emit the same subject IRI collide in one bundle. Use separate bundles or upstream source-specific IRIs unless the records are intentionally reconciled before ingestion.

### 3.2 Separation strength

Use one bundle only when all readers may access all accepted facts. In one bundle:

- concept paths and ledger records remain source-scoped;
- provenance has a separate source entity per `source_id`;
- accepted assertions still share one `semantic/data.ttl` graph;
- validation, refresh, publication, and deletion approval operate on the whole snapshot.

Use separate bundles when separation must control access, encryption, credentials, licensing, retention, deletion, tenant ownership, independent releases, or blast radius. Query those bundles independently or federate them in an external system with explicit graph and authorization boundaries.

## 4. Mode U: homogeneous partition union

### 4.1 Direct-union preconditions

Declare one source whose path glob resolves every reviewed member. All members must share:

- one source authority, owner, access policy, retention rule, and release cadence;
- one source kind and encoding policy;
- one ontology class, concept type, ID/title policy, and field mapping;
- one scalar schema and reader-option contract;
- one global `record_id` namespace;
- append-only set semantics with no field-level merge or winner selection.

CSV header order may differ, but the exact case-sensitive header set must equal the declared schema in every file. JSON member compatibility must be profiled and tested because the explicit reader schema is the contract. Markdown uses the manifest-relative path without its suffix as `record_id`. RDF uses the absolute subject IRI.

### 4.2 Identity and conflicts

- Require record IDs to be unique across the complete glob, not merely within each file.
- Reject duplicate concept IDs or subject IRIs. Never use file order, partition order, last-write-wins, first-write-wins, or implicit deduplication.
- Treat two different IDs as two concepts even if their content matches.
- Treat a member rename as a record removal/addition for Markdown; structured IDs remain stable when the file moves but the record ID does not.
- Treat an RDF subject repeated across members as a collision.

### 4.3 Provenance

Logical union produces:

- one source entry and one aggregate source-content digest for the sorted physical-member set;
- one source provenance entity whose location is the declared glob;
- one record provenance entity per normalized record;
- the concrete matched file in each record's `source_path` and record provenance location.

This proves which physical file produced a record, but the current builder allows exactly one origin entity per normalized record. Therefore direct union is suitable only when each output record comes from one member without coalescing other records.

The aggregate source digest is repeated on every record and concept in the logical source. A change to one member therefore updates that source-level marker across the partition union even when the normalized content and `record_sha256` of other records remain unchanged.

### 4.4 Member inventory

Keep a reviewed inventory beside the manifest containing every expected member locator and raw hash. A glob proves what matched at build time, not which members were expected. Compare the inventory before build and refresh so an accidentally missing file cannot masquerade as an approved logical-source update.

The bundled builder does not enforce this expected-member inventory. Make its exact path/hash comparison a blocking external CI or release gate before invoking build or refresh; do not interpret the builder's observed glob result as proof that the expected set was complete.

## 5. Entity fusion and upstream canonicalization

Do not use direct union when multiple input records must become one canonical entity. Build a deterministic upstream canonical dataset first, then ingest that dataset as a new logical source.

The upstream fusion contract must define:

1. normalized identity keys and their authority;
2. match thresholds or exact crosswalk rules;
3. field-level precedence by named source, never parser iteration or file order;
4. normalization functions for every compared value;
5. conflict outcomes: reject, quarantine, or approved deterministic selection;
6. treatment of null, deletion, tombstone, and late-arriving records;
7. a canonical record ID that remains stable across refreshes;
8. a lineage ledger mapping each canonical record and field decision to all original locators, record IDs, and raw digests;
9. processor/version hashes and an approval reference;
10. positive, ambiguous-match, conflict, deletion, and replay tests.

The resulting canonical dataset is a new source, not evidence that the original sources were identical. The current Semantic OKF record model exposes one direct origin. To preserve multi-origin lineage, either:

- keep the originals separate and query the reviewed crosswalk;
- publish the lineage ledger as a separately reviewed RDF/evidence source; or
- extend the record/provenance contract before claiming native multi-origin fusion.

Changing identity, precedence, or conflict policy changes semantic meaning. Assign a new ontology `version_iri`, rebuild, and rerun competency and negative tests.

## 6. Refresh behavior and consultation handoff

### 6.1 Separate-in-bundle

- Preview the complete refresh and inspect `changes.sources` plus `changes.records` per source.
- A removed source declaration is both a plan change and normally a record removal.
- Preserve every declared authority's source ID, subject identity, concept path, and provenance so `$consult-semantic-okf` can distinguish them after publication.

### 6.2 Logical union

- Treat any member addition, modification, rename, or removal as a change to the one logical source digest.
- Inspect record-level diffs to determine which concepts changed; the source-level diff alone is intentionally aggregate.
- Require `--allow-record-removals` for member removal that drops records.
- Re-run duplicate-ID, member-inventory, schema-compatibility, and competency tests after refresh.

### 6.3 Separate bundles

- Build, validate, refresh, authorize, and release each bundle independently.
- Publish a stable revision digest for each bundle so an authorized reader can pin every consulted release.

### 6.4 Consultation handoff

After the replacement snapshot passes validation, use `$consult-semantic-okf` to verify source-scoped lookup, partition visibility, cross-source comparisons, and lineage without changing the snapshot. Keep query execution and answer synthesis out of this lifecycle skill.

## 7. Required evidence and acceptance tests

Record this decision object beside the manifest; it is review evidence, not a new manifest field:

```json
{
  "protocol_version": "1.0",
  "decision_id": "people-combination-001",
  "mode": "separate-in-bundle",
  "members": ["crm-people", "support-people"],
  "logical_source_id": null,
  "identity_scope": "source-and-record-id",
  "duplicate_policy": "reject-within-identity-scope",
  "record_fusion": false,
  "governance_reference": "DATA-GOV-42",
  "approval_reference": "ARCH-REVIEW-17"
}
```

For logical union, set `mode` to `logical-union`, set `logical_source_id` to the one manifest source ID, use `identity_scope: logical-source-record-id`, and list the reviewed physical member IDs or inventory locators. `reject-within-identity-scope` means the same local ID may appear in different source-scoped declarations, but it must not repeat inside one source namespace.

Minimum acceptance matrix:

| Test | Separate | Logical union |
|---|---|---|
| Two members with the same local record ID | Two source-scoped concepts succeed | Build fails as duplicate identity |
| Distinct valid IDs | Source filters return independent sets | One source filter returns the combined set |
| Incompatible schema/mapping | Independent declarations may differ | Reject or canonicalize upstream |
| Provenance | Distinct source entities | One source entity, distinct physical record paths |
| Member/source removal | Review source-specific removals | Review aggregate-source and record removals |
| Refresh replay | Same per-source digests and IDs | Same inventory, aggregate digest, IDs, and paths |
| Access-boundary test | Separate bundle required when hard | Must be identical for every member |

Every accepted protocol must retain:

- resolved member inventory and hashes;
- semantic mapping/schema fingerprints;
- identity and duplicate policy;
- governance and approval references;
- conforming and conflict fixtures;
- expected ledger and SPARQL results;
- initial and refreshed revision digests.

## 8. Manifest examples

### 8.1 Two logical sources kept separate

```json
{
  "sources": [
    {
      "id": "crm-people",
      "kind": "csv",
      "path": "sources/crm/people.csv",
      "concept_type": "Person",
      "ontology_class": "Person",
      "id_field": "id",
      "title_field": "name",
      "fields": {"name": "name"},
      "schema": {"id": "string", "name": "string"}
    },
    {
      "id": "support-people",
      "kind": "json",
      "path": "sources/support/people.jsonl",
      "concept_type": "Person",
      "ontology_class": "Person",
      "id_field": "id",
      "title_field": "display_name",
      "fields": {"display_name": "name"},
      "schema": {"id": "string", "display_name": "string"}
    }
  ]
}
```

The local ID `42` may exist in both because its effective keys are `(crm-people, 42)` and `(support-people, 42)`.

### 8.2 Compatible files used as one logical source

```json
{
  "sources": [
    {
      "id": "regional-people",
      "kind": "csv",
      "path": "sources/regions/people-*.csv",
      "concept_type": "Person",
      "ontology_class": "Person",
      "id_field": "global_id",
      "title_field": "name",
      "fields": {"name": "name"},
      "schema": {"global_id": "string", "name": "string"},
      "options": {"header": "true", "mode": "FAILFAST"}
    }
  ]
}
```

Every matched file must implement that exact logical contract, and `global_id` must be unique across the entire glob.
