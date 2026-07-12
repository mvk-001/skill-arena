---
name: extract-ontologies
description: Extract, author, and validate reviewed domain ontologies from source evidence before Semantic OKF materialization, producing competency questions, evidence ledgers, vocabulary alignments, RDF graphs, OWL 2 axioms and profiles, instance data, SHACL shapes, fixtures, SPARQL checks, and validation reports. Use when Codex must perform ontology learning, evidence-led semantic modeling, entity or relation extraction, vocabulary alignment, OWL 2 engineering, or SHACL constraint design from documents, schemas, or datasets. Do not use it to create, expand, refresh, or repair a Semantic OKF snapshot, or to consult an existing knowledge bundle.
---

# Ontology Extraction

Use this skill to turn source evidence into a reviewed semantic model before lifecycle materialization. Hand approved mappings and constraints to the Semantic OKF builder. Use the dedicated consultation skill for read-only questions against an existing bundle.

## Preserve the semantic boundaries

- Treat source statements as evidence, not automatically as domain truth. Record the source, locator, interpretation, confidence, and review state for every consequential assertion.
- Keep the terminology model (TBox), instance assertions (ABox), SHACL shapes, provenance, and validation reports in separate artifacts or explicitly documented graphs.
- Use OWL for logical meaning under open-world semantics. Use SHACL for validation of a precisely identified data graph. Never present a SHACL constraint as an OWL entailment or an OWL restriction as a completeness check.
- Remember that OWL has no unique-name assumption. Do not emit `owl:sameAs`, disjointness, inverse properties, property characteristics, keys, or cardinalities without direct evidence and human review.
- Treat `rdfs:domain` and `rdfs:range` as type-producing axioms, not input constraints. Put record-shape requirements in SHACL.
- Default to stable W3C Recommendations: RDF 1.1, OWL 2, and SHACL 2017. Use RDF 1.2 or SHACL 1.2 features only when explicitly requested, version-pinned, and supported by the target toolchain.
- Do not dereference imports, remote JSON-LD contexts, or untrusted SHACL extensions automatically. Pin imported ontologies locally and record their resolved versions.

## Follow the extraction workflow

1. Define the domain boundary, intended consumers, decisions the graph must support, and out-of-scope concepts.
2. Write testable competency questions before choosing classes or properties.
3. Inventory and version every source. Create an evidence ledger before authoring strong axioms.
4. Extract candidates in separate passes: terminology, entities, relations, rules, constraints, identity claims, and alignments.
5. Normalize labels while preserving source language and exact evidence. Assign stable IRIs only after resolving collisions and homonyms.
6. Reuse established vocabularies when their semantics match. Prefer a local mapping over `owl:equivalentClass`, `owl:equivalentProperty`, or `owl:sameAs` when equivalence is uncertain.
7. Model the TBox and ABox separately. Declare classes and properties, document intended meanings, and add only justified restrictions.
8. Choose and record an OWL 2 profile from the reasoning workload: EL for very large terminologies, QL for query rewriting over large instance stores, RL for rule-based materialization, or DL when the required expressivity exceeds the profiles.
9. Author portable SHACL Core shapes with explicit targets, severities, and messages. Add SHACL-SPARQL only when Core cannot express a requirement and the processor dependency is declared.
10. Build conforming and non-conforming fixtures, execute competency queries, run the validation gates, and route low-confidence or high-impact assertions to review.

Read [extraction-workflow.md](references/extraction-workflow.md) before extracting from source material. Read [semantic-modeling.md](references/semantic-modeling.md) before choosing OWL axioms, profiles, graph boundaries, or SHACL constraints. Read [turtle-patterns.md](references/turtle-patterns.md) when authoring RDF artifacts. Read [standards-and-tools.md](references/standards-and-tools.md) when exact standards status, validation scope, or tool limitations matter.

## Produce an auditable bundle

Create or adapt this bundle unless the user specifies another contract:

```text
scope.md                  # domain boundary, consumers, profile, assumptions
evidence.csv              # assertion-to-source review ledger
ontology.ttl              # OWL 2 terminology and ontology metadata
data.ttl                  # accepted instance assertions
shapes.ttl                # SHACL validation contract
competency-questions.rq   # ASK/SELECT queries tied to numbered questions
validation-report.ttl     # machine-readable SHACL report when shapes are run
```

Scaffold the first six files with:

```bash
python scripts/scaffold_ontology_bundle.py OUTPUT_DIR \
  --ontology-iri https://example.org/ontology/domain \
  --version-iri https://example.org/ontology/domain/1.0.0 \
  --prefix ex \
  --title "Domain ontology" \
  --owl-profile rl
```

Do not publish the scaffold unchanged. Replace comments, fill the evidence ledger, and add positive and negative fixtures appropriate to the domain.

## Validate deterministically

Install the pinned validator dependencies once in an isolated environment:

```bash
python -m pip install -r scripts/requirements.txt
```

Then validate local graph files:

```bash
python scripts/validate_semantic_artifacts.py \
  --data OUTPUT_DIR/data.ttl \
  --ontology OUTPUT_DIR/ontology.ttl \
  --shapes OUTPUT_DIR/shapes.ttl \
  --inference none \
  --report OUTPUT_DIR/validation-report.ttl
```

Use `--inference rdfs`, `owlrl`, or `both` only when that entailment regime is part of the declared validation contract. The bundled validator parses RDF graphs, meta-validates SHACL, and runs pySHACL; it deliberately does not certify OWL 2 DL/profile conformance or full logical consistency.

## Enforce completion gates

- Confirm every file parses in its declared RDF syntax and every IRI policy is documented.
- Confirm the chosen OWL profile with a profile-aware tool; run a suitable reasoner separately when consistency or DL reasoning is required.
- Confirm the import closure is local, pinned, complete, and free of conflicting ontology versions.
- Confirm the shapes graph is well-formed and validation ends in one of three explicitly reported states: conformant, non-conformant, or processor failure.
- Confirm validation records the exact data graph, shapes graph, entailment regime, processor version, and report artifact.
- Confirm positive fixtures conform and each negative fixture fails for the intended constraint.
- Confirm competency queries cover the agreed questions and return expected results.
- Confirm strong identity, equivalence, disjointness, key, and cardinality axioms have evidence and review.
- Confirm every file referenced by a manifest, scope, or delivery note exists and that recorded digests and outcomes match the delivered artifact.
- Report OWL reasoning and SHACL validation independently; never collapse them into one pass/fail claim.
