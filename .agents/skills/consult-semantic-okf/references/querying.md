# Querying Semantic OKF Efficiently

## Contents

1. Choose the cheapest layer
2. Inspect the ledger
3. Search and read Markdown
4. Query RDF with SPARQL
5. Write durable queries
6. Scale repeated queries
7. Safety and limits

## 1. Choose the cheapest layer

| Question | Use | Why |
|---|---|---|
| Find by concept, subject, source, type, record ID, or mapped attribute | `semantic/records.jsonl` | Canonically ordered, streaming JSONL; no RDF parse |
| Find words and read the full human explanation | `concepts/**/*.md` | Preserves source-oriented Markdown and frontmatter |
| Join entities, filter typed values, aggregate, or traverse relations | `semantic/data.ttl` | Accepted normalized domain assertions |
| Inspect declared classes and properties | `semantic/semantic-plan.json` and `ontology.ttl` | Reviewed model and OWL declarations |
| Trace a subject to its source | `data.ttl` plus `provenance.ttl` | Explicit `prov:wasDerivedFrom` chain |
| Inspect acceptance rules or validation outcomes | `shapes.ttl` and `validation-report.ttl` | Validation contract, not domain knowledge |

Do not union all graphs by default. The ontology, accepted data, provenance, shapes, and report have different owners and meanings.

Treat discovery and evidence separately. `semantic-plan.json` can reveal prefixes, rule names, and intended mappings, but a generated-constraint answer must be verified and cited from `shapes.ttl`; a validation-result answer must come from `validation-report.ttl`. Cite every authoritative layer needed for the answer, not every file inspected along the way.

## 2. Inspect the ledger

Use the bundled helper for cheap streaming filters. Filters combine with logical AND:

```bash
python scripts/query_semantic_okf.py BUNDLE ledger \
  --source-id projects --attribute status active --format json
```

Exact lookup and concept retrieval:

```bash
python scripts/query_semantic_okf.py BUNDLE ledger \
  --concept-id concepts/projects/project-1-a33e35d302 \
  --show-content --format json
```

Other filters include `--subject-iri`, `--record-id`, `--type`, and Unicode case-insensitive `--contains`. Attribute values are parsed as JSON when possible, so `true`, `3`, and JSON arrays remain typed. The default limit is 50; use `--all` only when an unbounded result is intentional.

When output is truncated, `matched` is `null` because the streaming reader stops after the first extra match instead of scanning the remaining ledger.

## 3. Search and read Markdown

Use fixed-string ripgrep for lexical search; it is faster and safer than treating user text as a regular expression:

```bash
rg -i -n --glob '*.md' --fixed-strings -- 'retention policy' BUNDLE/concepts
```

Resolve the selected concept through `records.jsonl` or the ledger command before opening it. Query durable identifiers rather than relying on the hashed filename suffix.

## 4. Query RDF with SPARQL

Discover the bundle prefix, classes, properties, and source mappings in `semantic/semantic-plan.json`. Prefer query files over shell-escaped inline text:

```bash
python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file queries/active-projects.rq \
  --graph data --format json
```

Example explicit-data query; replace the namespace with the bundle's ontology namespace:

```sparql
PREFIX research: <https://example.org/ontology/research#>

SELECT ?project ?conceptId ?status
WHERE {
  ?project a research:Project ;
           research:okfConceptId ?conceptId ;
           research:status ?status .
}
ORDER BY ?project
LIMIT 100
```

Add provenance only for lineage queries:

```bash
python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file queries/lineage.rq \
  --graph data --graph provenance --format json
```

Select `--graph shapes` for SHACL constraints and `--graph validation` for validation results. Keep those graphs out of ordinary domain queries.

The helper injects standard `rdf`, `rdfs`, `owl`, `xsd`, `dcterms`, and `prov` prefixes plus the manifest prefix. JSON output preserves URI, blank-node, literal, datatype, language, and unbound-value distinctions.

## 5. Write durable queries

- Select stable subject IRIs and `okfConceptId`; do not join on filenames, partition order, or hashes.
- Use explicit projections, selective triple patterns, typed literals, `ORDER BY`, and a query-level `LIMIT`.
- Match the requested representation exactly. Return full IRIs when the question asks for IRIs; when it asks for compact schema names, use the bundle namespace local name and standard prefixes such as `xsd:string`.
- Preserve requested scalar, array, and object shapes. Do not replace a requested scalar summary with an RDF-library object merely because the source term has structure.
- Before answering, verify the exact key set, set ordering, typed values, and that every cited artifact directly supports the claim.
- Keep the expected columns, rows, and entailment regime beside each competency query.
- Rerun competency queries after every successful refresh.
- Treat `--limit` as an output cap, not an evaluation-cost limit; put `LIMIT` in SPARQL too.
- The bundled helper uses entailment `none`. Run and record a separate reasoner workflow when RDFS or OWL entailment is required.

## 6. Scale repeated queries

RDFLib reparses only the selected Turtle graphs for each invocation. This is appropriate for small or occasional local queries. For large bundles, repeated queries, concurrent readers, or latency-sensitive use:

1. validate the promoted snapshot once;
2. load `data.ttl` and only the required ontology/provenance graphs into an indexed persistent triplestore;
3. record the source-manifest tree or revision digest with the loaded dataset;
4. replace or version the entire loaded snapshot after refresh rather than incrementally mixing revisions.

## 7. Safety and limits

- Only local read-only SPARQL `SELECT` and `ASK` are accepted.
- `SERVICE`, `FROM`, and `FROM NAMED` are rejected; `--graph` is the only graph-selection mechanism.
- Query text is limited to 64 KiB.
- `--validate` parses the complete read surface before a query: the ledger, exact concept paths, semantic plan, and all local Turtle graphs. Without it, the helper requires a passing build report and required local artifacts. This is not the builder's full semantic and SHACL publication validator; send moved, untrusted, or structurally changed snapshots through `$build-semantic-okf` before consultation.
- The helper never mutates a bundle, dereferences ontology imports, or creates indexes inside it.
