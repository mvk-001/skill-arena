# Semantic OKF Manifest

## Contents

1. Design rules
2. Complete example
3. Bundle fields
4. Ontology fields
5. Rule fields
6. Source fields
7. Mapping semantics
8. Multiple-source encoding

## 1. Design rules

Use JSON so CI and non-Python consumers can read the same immutable plan. Resolve relative source paths against the manifest directory. Inputs are local, manifest-relative files or globs.

The manifest schema is closed. Unknown fields are errors, including unsupported equivalence, disjointness, key, import, and OWL cardinality declarations. This prevents a semantic request from being preserved in the plan but silently omitted from generated RDF.

Declare semantics before running the build:

- classes and properties express reviewed domain meaning;
- source mappings say how accepted records instantiate that model;
- SHACL rules express the declared graph acceptance contract;
- observed physical schemas can suggest mappings but cannot create universal axioms automatically.

## 2. Complete example

```json
{
  "schema_version": "1.0",
  "bundle": {
    "title": "Research knowledge bundle",
    "description": "Policies, people, projects, and a controlled vocabulary.",
    "base_iri": "https://example.org/knowledge/",
    "ontology_iri": "https://example.org/ontology/research",
    "version_iri": "https://example.org/ontology/research/1.0.0",
    "prefix": "research",
    "owl_profile": "rl"
  },
  "ontology": {
    "classes": [
      {"name": "PolicyDocument", "label": "policy document"},
      {"name": "Person", "label": "person"},
      {"name": "Project", "label": "project"},
      {"name": "VocabularyResource", "label": "vocabulary resource"}
    ],
    "properties": [
      {"name": "name", "kind": "datatype", "domain": "Person", "range": "xsd:string"},
      {"name": "role", "kind": "datatype", "domain": "Person", "range": "xsd:string"},
      {"name": "status", "kind": "datatype", "domain": "Project", "range": "xsd:string"},
      {"name": "prefLabel", "kind": "datatype", "domain": "VocabularyResource", "range": "xsd:string"}
    ]
  },
  "rules": [
    {
      "name": "PersonNameRule",
      "target_class": "Person",
      "path": "name",
      "min_count": 1,
      "max_count": 1,
      "datatype": "xsd:string",
      "message": "Each accepted person record must contain exactly one name.",
      "basis": {
        "kind": "operational-policy",
        "references": ["PEOPLE-1"]
      }
    }
  ],
  "sources": [
    {
      "id": "policies",
      "kind": "markdown",
      "path": "sources/policies/*.md",
      "concept_type": "Policy",
      "ontology_class": "PolicyDocument"
    },
    {
      "id": "people",
      "kind": "csv",
      "path": "sources/people.csv",
      "concept_type": "Person",
      "ontology_class": "Person",
      "id_field": "id",
      "title_field": "name",
      "fields": {"name": "name", "role": "role"},
      "schema": {"id": "string", "name": "string", "role": "string"},
      "options": {"header": "true", "enforceSchema": "false"}
    },
    {
      "id": "projects",
      "kind": "json",
      "path": "sources/projects.jsonl",
      "concept_type": "Project",
      "ontology_class": "Project",
      "id_field": "id",
      "title_field": "title",
      "fields": {"status": "status"},
      "schema": {"id": "string", "title": "string", "status": "string"}
    },
    {
      "id": "vocabulary",
      "kind": "rdf",
      "path": "sources/vocabulary.ttl",
      "format": "turtle",
      "concept_type": "Vocabulary Resource",
      "ontology_class": "VocabularyResource",
      "title_predicate": "http://www.w3.org/2000/01/rdf-schema#label",
      "fields": {
        "http://www.w3.org/2004/02/skos/core#prefLabel": "prefLabel"
      }
    }
  ]
}
```

## 3. Bundle fields

- `title` and `description`: OKF index and ontology metadata.
- `base_iri`: stable namespace for normalized subjects and source entities; end it with `/` or `#`.
- `ontology_iri`: stable ontology-series IRI.
- `version_iri`: immutable ontology-version IRI, distinct from `ontology_iri`.
- `prefix`: conservative ASCII Turtle prefix.
- `owl_profile`: `el`, `ql`, `rl`, or `dl`; it is a declared target, not proof of conformance.

## 4. Ontology fields

Class entries require a unique local `name` and human-readable `label`. Property entries require:

- unique local `name`;
- `kind`: `datatype`, `object`, or `annotation`;
- declared `domain` class for datatype/object properties;
- `range`: an XSD datatype, class local name, or absolute IRI.

Do not use equivalence, identity, disjointness, keys, property characteristics, or cardinality axioms in this pipeline unless an upstream ontology review explicitly accepts them. Keep advanced axioms in a reviewed imported ontology.

## 5. Rule fields

Each rule creates one SHACL property shape. Require `name`, `target_class`, `path`, `message`, and `basis`. `basis.kind` is `evidence` or `operational-policy`; `basis.references` must contain stable source locators or policy IDs. Support:

- `min_count`, `max_count`;
- `datatype`;
- `class`;
- `node_kind`: `IRI`, `Literal`, `BlankNode`, or combined SHACL node kinds;
- `pattern`.

The rule target class and path property must exist in the ontology block. A data-quality rule is not automatically an OWL restriction.

## 6. Source fields

All sources require unique `id`, supported `kind`, local `path`, non-empty `concept_type`, and declared `ontology_class`.

Build reports count manifest source declarations, not resolved files. When a requirement says “N sources,” state whether it means declarations, physical files, or both, and retain a separate resolved-file inventory with raw hashes when physical-file coverage matters.

Use portable lowercase source IDs and avoid Windows device names such as `con`, `nul`, `com1`, or `lpt1`. Paths must be manifest-relative POSIX-style globs without parent traversal. When CSV or JSON reader options include `mode`, it must remain `FAILFAST`; this pipeline never accepts silent record loss.

- `markdown`: one concept per UTF-8 file; frontmatter `title`, the first H1, and the filename are the title precedence. A `fields` mapping may map scalar frontmatter keys to declared ontology properties. YAML dates and timestamps are normalized to ISO strings; mappings to lists or objects fail.
- `csv`: use the strict Python CSV adapter; require `id_field`, `title_field`, and an explicit scalar schema.
- `json`: use the strict Python JSON adapter; JSON Lines is the default, and `options.multiLine=true` accepts one JSON object or array of objects per file.
- `rdf`: parse a complete local document with RDFLib and create one concept per URI subject. Require an explicit safe `format` of `turtle`, `nt`, or `n3`; JSON-LD is intentionally excluded because remote contexts violate local deterministic ingestion.

Sources may define `fields`, mapping Markdown frontmatter keys, structured input field names, or RDF predicate IRIs to declared ontology property names. A mapped datatype or object property must have the same domain as the source's `ontology_class`; this avoids unintended OWL typing through `rdfs:domain`. Reject unmapped properties from the normalized graph rather than guessing.

CSV and JSON sources should declare a top-level scalar `schema` mapping field names to `string`, `integer`, `long`, `double`, `boolean`, `date`, or `timestamp`. Treat schema inference as profiling-only and never as a repeatable build contract.

For CSV, schema object order has no meaning. The adapter reads each physical header, matches every column by its exact, case-sensitive name, and requires the header set to equal the declared schema set. Different files in one source may use different column orders. Duplicate, missing, extra, or case-mismatched headers fail. Row-width mismatches and invalid non-empty scalar values fail instead of becoming null. Integers use signed 32-bit bounds, longs use signed 64-bit bounds, doubles use a decimal/exponent lexical form and must be finite, and booleans are exactly `true` or `false` ignoring case. Dates are exactly `YYYY-MM-DD`. Timestamps require `YYYY-MM-DDTHH:MM:SS`, may include one to six fractional digits and `Z` or a valid `±HH:MM` offset, and normalize zoned values to UTC. Keep `header=true`; `enforceSchema` is accepted as a compatibility no-op after the stronger name check. Set `multiLine=true` explicitly to accept quoted fields containing line breaks. Dots in legal field names are literal, not nested paths. Supported CSV options are `header`, `sep`, `quote`, `escape`, `encoding`, `mode`, `multiLine`, `enforceSchema`, `nullValue`, and `emptyValue`.

For JSON Lines, each nonblank line must be one strict JSON object. With `multiLine=true`, each physical file must contain one object or an array of objects. Duplicate or malformed syntax, non-standard numeric constants, non-object records, nested values in declared scalar fields, and type mismatches fail. Unknown members are ignored; missing declared members become null. Supported JSON options are `multiLine`, `encoding`, and `mode`.

Reject RDF sources containing blank nodes anywhere in the accepted graph because RDFLib's internal blank-node identifiers are not stable build identities. Skolemize them through an explicit, reviewed upstream policy before ingestion.

Set `allow_empty: true` only when an empty source is an accepted, tested state.

Source Markdown bodies are preserved verbatim for traceability. Generated structured and RDF summaries escape active HTML, but preserved Markdown may still contain raw HTML; disable raw HTML in downstream renderers for untrusted sources.

## 7. Mapping semantics

The normalized `concept_path` is `concepts/<source-id>/<safe-record-id>.md`; the OKF `concept_id` is that bundle-relative path without `.md`. The normalized subject IRI is `<base_iri>resource/<source-id>/<percent-encoded-record-id>` unless an RDF source already supplies an absolute subject IRI.

Every concept frontmatter records `concept_id`, `concept_path`, `subject_iri`, absolute `ontology_class_iri`, `ontology_version_iri`, `source_id`, `source_kind`, `source_path`, `source_content_sha256`, `record_sha256`, `source_refs`, and `record_id`. Set the OKF `resource` field to `subject_iri`; keep source URIs separate.

Hash raw source content, normalized records, and aggregate record sets independently. Compute normalized record hashes from compact UTF-8 JSON with recursively sorted object keys, normalized line endings, stable array order, and no build timestamp.

## 8. Multiple-source encoding

Read [source-combination.md](source-combination.md) and record its decision object beside the manifest before encoding more than one physical input. Do not add grouping or merge-policy fields to this manifest: its schema is closed.

- **Keep logical sources separate:** declare one source entry per authority. Its stable `id` scopes non-RDF identity, provenance, ledger filtering, source counts, and refresh diffs. The same local `record_id` may appear under two different source IDs.
- **Use homogeneous partitions as one logical source:** declare one source entry whose `path` glob resolves every member. All members share one adapter kind, mapping, schema/options, authority, governance, and refresh lifecycle. Record IDs must be unique across the entire glob.
- **Fuse records into canonical entities:** normalize, match, resolve conflicts, and retain multi-origin lineage upstream. Ingest the resulting canonical dataset as a new source; the builder does not perform joins, deduplication, winner selection, or field coalescing.

One bundle is not an access-control boundary: separate declarations still publish accepted assertions into the same `semantic/data.ttl`. Use independent bundles for tenant, permission, license, retention, deletion, independent-release, or ontology-version boundaries.
