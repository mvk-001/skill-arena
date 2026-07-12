# Ontology Extraction Workflow

## Contents

1. Frame the extraction
2. Build the evidence ledger
3. Run extraction passes
4. Resolve candidates
5. Convert language to semantics
6. Test and review
7. Deliver the bundle

## 1. Frame the extraction

Write the following before modeling:

- domain and time boundary;
- intended graph consumers and reasoning tasks;
- source authority order and version policy;
- named users or reviewers for ambiguous domain claims;
- required serialization and OWL 2 profile;
- validation graph construction and entailment regime;
- explicit exclusions.

Create numbered competency questions with observable answers. Prefer questions such as “Which permits expire within 30 days?” over goals such as “Represent permits.” Mark each question as `ASK`, `SELECT`, or reasoning-dependent and state the expected answer on a small fixture.

## 2. Build the evidence ledger

Use one row per candidate assertion. Keep rejected candidates so future runs do not rediscover the same ambiguity.

| Field | Meaning |
|---|---|
| `assertion_id` | Stable local identifier for the candidate |
| `kind` | `class`, `subclass`, `property`, `fact`, `constraint`, `identity`, `alignment`, or `annotation` |
| `subject` | Candidate subject label or IRI |
| `predicate` | Candidate relation or axiom type |
| `object` | Candidate object, class, or literal |
| `source_id` | Versioned source identifier |
| `source_locator` | Page, section, paragraph, row, timestamp, or selector |
| `evidence_text` | Short exact excerpt when licensing permits |
| `interpretation` | Normalized meaning inferred from the evidence |
| `confidence` | Declared scale, not an unexplained probability |
| `status` | `candidate`, `accepted`, `rejected`, or `needs-review` |
| `review_note` | Reason, reviewer, and decision |

Keep confidence separate from truth status. A high-confidence extraction can faithfully capture a source claim that the ontology team later rejects.

## 3. Run extraction passes

Process the corpus repeatedly rather than trying to model everything in one pass:

1. **Terminology pass** — collect preferred labels, synonyms, definitions, abbreviations, and homonyms.
2. **Entity pass** — identify durable individuals and decide which need stable IRIs instead of blank nodes.
3. **Relation pass** — collect verb phrases, role relations, part-whole relations, temporal relations, and measurable attributes.
4. **Taxonomy pass** — propose broader/narrower and subclass relations; check that every subclass statement is universally intended.
5. **Rule pass** — extract conditions, exceptions, dependencies, and derived classifications without prematurely encoding them as OWL.
6. **Constraint pass** — identify record completeness, datatype, range, pattern, cardinality, and closed-shape requirements for SHACL.
7. **Identity and alignment pass** — isolate same-entity and equivalence claims for dedicated review.

Retain source-specific terms until homonyms and scope differences are resolved. Never merge two candidates solely because their labels match.

## 4. Resolve candidates

For every candidate, choose one outcome:

- encode as an OWL axiom because it is intended to hold in every model;
- encode as an ABox assertion because it is a supported fact about an individual;
- encode as a SHACL constraint because it is a data acceptance rule;
- encode as SKOS when the source is a thesaurus or concept scheme rather than a logical class model;
- retain as an annotation or provenance claim;
- retain as an unasserted candidate;
- reject with a reason.

Review high-impact candidates first: equality, equivalence, disjointness, keys, inverse-functional properties, property chains, universal restrictions, and maximum cardinalities.

## 5. Convert language to semantics

Treat linguistic cues as prompts for review, not automatic mappings.

| Source wording | Candidate interpretation | Required check |
|---|---|---|
| “Every A is a B” | `A rdfs:subClassOf B` | Is it universal or merely typical? |
| “A includes B” | taxonomy, membership, or part-whole | What does “includes” mean here? |
| “A has B” | object or datatype property | Is B an entity, value, role, or document field? |
| “must provide one code” | SHACL `sh:minCount 1` and often `sh:maxCount 1` | Is this a record rule or domain truth? |
| “can have only one biological mother” | possible OWL maximum cardinality | Does identity reasoning make this intended? |
| “X is the same as Y” | possible `owl:sameAs` | Is substitutability in every context justified? |
| “A and B cannot overlap” | possible `owl:disjointWith` | Are exceptions impossible or merely invalid data? |
| “usually”, “may”, “often” | annotation or probabilistic/rule layer | Do not turn a tendency into a universal axiom |

Do not infer a negative fact from silence. Do not turn examples into universal restrictions. Do not use a document field name as a domain concept without checking its intended meaning.

## 6. Test and review

For each competency question:

1. create the smallest conforming fixture that answers it;
2. create a counterexample when a constraint is involved;
3. write an ASK or SELECT query;
4. state whether RDFS, OWL RL, another OWL reasoner, or no inference is required;
5. compare the result with the expected answer;
6. link failures back to evidence or a modeling decision.

Use a review queue for every `needs-review` row and for all strong axioms. Record acceptance criteria, not just reviewer comments.

## 7. Deliver the bundle

Deliver:

- scope, competency questions, and assumptions;
- evidence ledger with accepted and unresolved candidates;
- ontology, data, shapes, and provenance artifacts;
- import manifest with ontology and version IRIs;
- positive and negative fixtures;
- competency queries and expected results;
- separate OWL profile/consistency and SHACL validation outcomes;
- a concise limitations section covering unresolved ambiguity and unsupported reasoning.

Never describe the ontology as complete. State the source coverage, acceptance criteria, and extraction date instead.
