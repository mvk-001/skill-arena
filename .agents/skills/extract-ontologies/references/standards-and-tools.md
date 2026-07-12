# Standards and Tooling Baseline

Use the latest stable W3C Recommendations unless the user explicitly requests experimental features. Recheck document status before changing this baseline.

## Authored baseline: 2026-07-10

- RDF 1.1 is the latest RDF Recommendation. RDF 1.2 Concepts is a Candidate Recommendation Snapshot dated 2026-04-07. Do not emit RDF 1.2 triple terms silently.
- OWL 2 Second Edition is the stable W3C Recommendation suite dated 2012-12-11.
- SHACL 2017 is the latest SHACL Recommendation. SHACL 1.2 Core is a Working Draft dated 2026-06-30. Do not emit SHACL 1.2-only constructs silently.
- The bundled Python validator is pinned to RDFLib 7.6.0, pySHACL 0.40.0, and OWL-RL 7.6.2.
- `requirements.in` records the direct pins and `requirements.txt` locks their transitive Python 3.11+ environment.

## Primary specifications

- RDF 1.1 Concepts: https://www.w3.org/TR/rdf11-concepts/
- RDF 1.1 Semantics: https://www.w3.org/TR/rdf11-mt/
- RDF 1.2 status: https://www.w3.org/TR/rdf12-concepts/
- OWL 2 Primer: https://www.w3.org/TR/owl2-primer/
- OWL 2 Structural Specification: https://www.w3.org/TR/owl2-syntax/
- OWL 2 Profiles: https://www.w3.org/TR/owl2-profiles/
- OWL 2 Conformance: https://www.w3.org/TR/owl2-conformance/
- OWL 2 mapping to RDF: https://www.w3.org/TR/owl2-mapping-to-rdf/
- SHACL Recommendation: https://www.w3.org/TR/shacl/
- SHACL 1.2 Core status: https://www.w3.org/TR/shacl12-core/
- PROV-O: https://www.w3.org/TR/prov-o/
- Web Annotation selectors: https://www.w3.org/TR/annotation-model/#selectors

Pinned validator releases:

- RDFLib 7.6.0: https://pypi.org/project/rdflib/7.6.0/
- pySHACL 0.40.0: https://pypi.org/project/pyshacl/0.40.0/
- OWL-RL 7.6.2: https://pypi.org/project/owlrl/7.6.2/

## Validator scope

`validate_semantic_artifacts.py` performs these checks:

- reject non-local input paths;
- parse each RDF graph separately and identify the failing file;
- reject RDF dataset serializations instead of silently unioning named graphs;
- block remote JSON-LD contexts;
- warn about unresolved `owl:imports` without dereferencing them;
- meta-validate SHACL shapes by default;
- run pySHACL with an explicit entailment regime;
- serialize an RDF validation report and provide deterministic text or JSON summaries.

It does not perform these checks:

- complete OWL 2 DL structural or global-restriction validation;
- conformance to OWL 2 EL, QL, or RL syntax;
- complete ontology consistency checking;
- remote import resolution;
- SHACL-JS execution;
- validation of an implicit union of RDF named graphs.

Use a profile-aware OWL tool and an appropriate reasoner for the omitted OWL checks. Record its name, version, import closure, and reasoning mode independently from the SHACL result.

## Security policy

Treat RDF and SHACL as active inputs: parsers may dereference contexts, and SPARQL or extension features may consume excessive resources. Keep inputs local, disable import dereferencing, keep SHACL Advanced Features opt-in, and process untrusted artifacts in an operating-system sandbox. The Python wrapper is a guardrail, not a security boundary.
