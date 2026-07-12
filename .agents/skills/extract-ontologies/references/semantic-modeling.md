# RDF, OWL 2, and SHACL Modeling Guide

## Contents

1. RDF graph policy
2. OWL and SHACL boundary
3. OWL 2 profile selection
4. Modeling hazards
5. Versioning and imports
6. Provenance
7. Validation interpretation

## 1. RDF graph policy

Use absolute IRIs for durable resources. Treat prefix declarations and relative IRIs only as serialization conveniences. Use blank nodes for local structures, not identifiers that must survive file boundaries or repeated extraction.

An RDF graph is a set of triples: order and duplicate serialization carry no meaning. An RDF dataset contains one default graph and zero or more named graphs. Document what the default graph means and how validation selects or unions graphs. A graph name alone does not establish provenance, endorsement, or truth.

Keep these layers distinct unless the consumer contract requires a documented union:

- accepted source assertions;
- ontology axioms;
- machine-inferred triples;
- unreviewed candidates;
- SHACL shapes;
- validation reports;
- provenance metadata.

## 2. OWL and SHACL boundary

| Concern | OWL 2 | SHACL |
|---|---|---|
| Primary purpose | Logical meaning and entailment | Validation of a selected data graph |
| Missing property | May be unknown or supplied by an unnamed model element | `sh:minCount` can report it |
| Too many values | May imply value equality under a maximum cardinality or functional property | `sh:maxCount` reports graph values |
| Domain/range | Infers types from property use | `sh:class`, `sh:datatype`, and node shapes validate values |
| Closed records | Open world by default | `sh:closed true` with explicit ignored properties |
| Different IRIs | May denote the same individual | Normally distinct RDF terms for graph validation |
| Result | Entailments or consistency judgment | Validation report over focus nodes |

Do not mechanically copy cardinalities between OWL and SHACL. Add both only when both the domain semantics and data contract independently require them.

## 3. OWL 2 profile selection

| Profile | Prefer when | Common caution |
|---|---|---|
| OWL 2 EL | The terminology has very many classes/properties and needs scalable classification | Limited negation, disjunction, and universal/cardinality constructs |
| OWL 2 QL | Instance data is large and queries must be rewritten to a relational store | Expressivity is intentionally narrow; cardinality restrictions are excluded |
| OWL 2 RL | Rule-based materialization over RDF is the deployment model | Rule closure is not a complete OWL 2 DL consistency/profile certification |
| OWL 2 DL | Required semantics exceed the profiles and a DL reasoner is available | Respect structural and global restrictions; reasoning cost can be high |

The three profiles are independent; none is a subset of another. Record the profile and confirm it with a profile-aware checker after serialization.

## 4. Modeling hazards

- `rdfs:domain` and `rdfs:range` infer types. They do not reject a subject or object with an absent type.
- `owl:sameAs` is global logical equality. Prefer a local match record, SKOS mapping, or candidate alignment when substitutability is not proven.
- A functional property with two values can entail that the values are equal; it is not a data-quality violation by itself.
- `owl:allValuesFrom` constrains known and possible values but does not require a value. Pair it with an existential restriction only when the domain meaning requires existence.
- Minimum cardinality can be satisfied by unnamed individuals. It does not prove that the serialized record contains that many values.
- Class disjointness can make an ontology inconsistent. Use it only for impossible overlap, not for a user-interface category choice.
- Property chains, transitivity, symmetry, and inverses can create many implicit assertions. Test them on adversarial fixtures.
- OWL annotations carry documentation and provenance but do not affect OWL 2 Direct Semantics.
- Recursive SHACL shapes are not portable under the 2017 Recommendation. Prefer acyclic Core shapes.
- Warning and info severities still produce validation results under SHACL 2017; processor options that ignore them change the conformance policy and must be recorded.

## 5. Versioning and imports

Give an ontology series one stable ontology IRI and each immutable release a distinct version IRI. Keep old version IRIs retrievable. Use imported version IRIs when reproducibility is more important than automatically following the current release.

Resolve imports before profile checking, consistency checking, or reasoning. Imports are transitive. Build a manifest that records:

- requested import IRI;
- resolved local file;
- ontology IRI and version IRI found in that file;
- content digest;
- retrieval date;
- license;
- compatibility decision.

Do not load two versions of one ontology series into a closure unless the combination has been reviewed. Treat `owl:priorVersion`, `owl:backwardCompatibleWith`, and `owl:incompatibleWith` as annotations that still require tests.

## 6. Provenance

Use PROV-O for lineage: source and generated artifacts as `prov:Entity`, extraction and validation runs as `prov:Activity`, and software or operators as agents. Link them with `prov:used`, `prov:wasGeneratedBy`, `prov:wasDerivedFrom`, and `prov:wasAssociatedWith`.

Use OWL axiom annotations to attach evidence to asserted OWL axioms. Under RDF 1.1, use RDF reification for an unasserted candidate claim; remember that reifying a triple neither asserts it nor follows from asserting it. Use Web Annotation selectors for exact text positions or quotes in versioned sources.

Define confidence in a project namespace, including its scale and reviewer meaning. PROV-O does not define a confidence probability.

## 7. Validation interpretation

Record three distinct outcomes:

1. **Conformant** — validation completed and `sh:conforms` is true.
2. **Non-conformant** — validation completed and produced results.
3. **Processor failure** — validation could not complete because inputs, shapes, entailment, recursion, resources, or features were invalid or unsupported.

Never report processor failure as ordinary non-conformance. Keep the data and shapes immutable and serialize the validation report separately. Compare reports only when graph construction, shapes, entailment, processor, and configuration are equivalent.
