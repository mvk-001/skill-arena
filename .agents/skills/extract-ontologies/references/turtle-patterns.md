# Turtle and SHACL Patterns

Use these as patterns, not as domain claims. Replace every example IRI and label.

## Contents

1. Ontology header and TBox
2. ABox assertions
3. Portable SHACL Core shape
4. Evidence on an asserted OWL axiom
5. Unasserted candidate under RDF 1.1
6. Extraction and validation provenance
7. Competency query

## Ontology header and TBox

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://example.org/ontology/permits> a owl:Ontology ;
    owl:versionIRI <https://example.org/ontology/permits/1.0.0> ;
    dcterms:title "Permits ontology"@en .

ex:Permit a owl:Class ;
    rdfs:label "permit"@en .

ex:issuedTo a owl:ObjectProperty ;
    rdfs:domain ex:Permit ;
    rdfs:range ex:Organization .

ex:expiresOn a owl:DatatypeProperty ;
    rdfs:domain ex:Permit ;
    rdfs:range xsd:date .
```

## ABox assertions

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:permit-123 a ex:Permit ;
    ex:issuedTo ex:organization-7 ;
    ex:expiresOn "2027-03-31"^^xsd:date .
```

Mint individual IRIs from stable source identifiers, not labels. Preserve the original identifier as data when it remains useful.

## Portable SHACL Core shape

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:PermitShape a sh:NodeShape ;
    sh:targetClass ex:Permit ;
    sh:property [
        sh:path ex:issuedTo ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
        sh:nodeKind sh:IRI ;
        sh:class ex:Organization ;
        sh:message "A permit must identify exactly one issuing recipient organization."@en
    ] ;
    sh:property [
        sh:path ex:expiresOn ;
        sh:maxCount 1 ;
        sh:datatype xsd:date ;
        sh:severity sh:Violation
    ] .
```

If a shape is closed, usually list `rdf:type` in `sh:ignoredProperties`. Define whether inferred properties participate in validation.

## Evidence on an asserted OWL axiom

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:TemporaryPermit rdfs:subClassOf ex:Permit .

[] a owl:Axiom ;
    owl:annotatedSource ex:TemporaryPermit ;
    owl:annotatedProperty rdfs:subClassOf ;
    owl:annotatedTarget ex:Permit ;
    prov:wasDerivedFrom <https://example.org/source/policy-v3#section-4> ;
    ex:confidence "reviewed" .
```

The main triple remains asserted. The annotation does not change its OWL meaning.

## Unasserted candidate under RDF 1.1

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:candidate-42 a rdf:Statement ;
    rdf:subject ex:TemporaryPermit ;
    rdf:predicate rdfs:subClassOf ;
    rdf:object ex:Permit ;
    prov:wasDerivedFrom <https://example.org/source/policy-v3#paragraph-18> ;
    ex:reviewStatus "candidate" .
```

This reification does not assert the subclass triple. Do not add the main triple until the candidate is accepted.

## Extraction and validation provenance

```turtle
@prefix ex: <https://example.org/ontology/permits#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:extraction-run-2026-07-10 a prov:Activity ;
    prov:used <https://example.org/source/policy-v3> ;
    prov:generated <https://example.org/ontology/permits/1.0.0> ;
    prov:endedAtTime "2026-07-10T15:00:00Z"^^xsd:dateTime .
```

If named graphs carry layers, document graph roles explicitly in metadata. Do not assume graph names automatically express provenance.

## Competency query

```sparql
PREFIX ex: <https://example.org/ontology/permits#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

# CQ-01: Which permits expire before 2027-04-01?
SELECT ?permit ?date
WHERE {
  ?permit a ex:Permit ; ex:expiresOn ?date .
  FILTER (?date < "2027-04-01"^^xsd:date)
}
ORDER BY ?date ?permit
```

Tie each query to a numbered competency question and an expected result fixture.
