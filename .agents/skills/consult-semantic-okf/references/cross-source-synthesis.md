# Cross-Source Synthesis

Use this breadth-before-depth procedure when an answer must compare, aggregate, or cite evidence from multiple independent sources. The goal is a concise synthesis whose source breadth, semantic coverage, page locators, and artifact paths can all be checked independently.

## 1. Freeze the answer contract

Before querying, extract a checklist from the request:

- question clauses or comparison sides that the answer must address;
- required controlled dimensions or categories;
- the eligible or preferred source set, if one is stated;
- the minimum number of independent relevant sources;
- citation and page-locator requirements;
- exact output keys, types, order, cardinalities, length bounds, sorting, and uniqueness rules.

Do not treat a raw count of mentioned sources as coverage. A source counts only when a selected claim directly supports at least one requested clause and the source is eligible under the contract.

## 2. Discover broadly with one batched query

Inspect `semantic/semantic-plan.json` for the reviewed namespace, classes, and property IRIs. Use the ledger for exact source and concept identifiers, then write one SPARQL query that projects the fields needed for selection across all requested dimensions:

- source or document identifier;
- controlled claim kind or dimension;
- claim interpretation or readable text;
- evidence or page locator;
- stable concept ID.

Constrain the query with `VALUES` for the requested dimensions or candidate sources, use an explicit projection and `ORDER BY`, and save it as a query file. Run it once against the accepted data graph:

```bash
python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file queries/cross-source-coverage.rq \
  --graph data --format json
```

Do not repeatedly parse the graph for one source at a time. For a large or repeatedly queried snapshot, load the validated revision into the persistent indexed store described in `querying.md`.

## 3. Build a coverage ledger

Record candidates before drafting prose:

| source | question clause | controlled dimension | claim concept ID | page locator | exact concept path | selected |
|---|---|---|---|---|---|---|

Apply these selection gates:

1. Cover every required clause and controlled dimension.
2. Meet the independent-source minimum using directly relevant claims before adding depth from any one source.
3. Balance both sides of a comparison and the requested method or task categories.
4. Keep one additional verified source when a selected claim is borderline or indirect.
5. Reject topic-adjacent padding: extra sources do not compensate for being below the relevant-source minimum.

Only after the breadth gate passes should you open the selected claim and source concepts for close reading. Preserve real distinctions between sources; a shared dimension is an analysis axis, not proof that two methods are equivalent. When relevant evidence permits, keep one additional verified source beyond the hard minimum. This reserve protects the answer from a borderline interpretation, but it must never be filled with topic-adjacent padding.

For exact cross-source answer contracts, use `prepare_cross_source_evidence.py` to make this ledger executable. Its local BM25 rank is a discovery aid, not a relevance verdict: read each selected interpretation and use explicit `--candidate-paper` values to replace a weak selection. The script copies exact claim paths and parses page locators from the ledger, then emits a response seed whose source IDs, citations, dimensions, and evidence are already aligned.

## 4. Verify citations and artifact paths

Resolve every selected stable concept ID through `semantic/records.jsonl` or the ledger helper. Copy its `concept_path` exactly. Never reconstruct a generated filename from a title, source ID, directory name, or remembered hash.

For each selected source:

1. verify the claim in its claim or method concept;
2. verify page locators against the readable source or paper concept;
3. retain an authoritative artifact type appropriate to the requested evidence contract;
4. confirm every emitted path exists beneath the bundle root.

Claim, source, paper, and method concepts may all be valid evidence when the bundle defines them as authoritative. Prefer claim concepts for mechanism or operator statements, paper concepts for broad page-spanning verification, and both when the answer needs both specificity and readable context. Do not force one artifact type across every bundle. Do not emit glob characters, shortened filenames, placeholder suffixes, or guessed hashes.

## 5. Synthesize, then run the deterministic preflight

Write a comparative explanation organized by the question's clauses or method families. Explain differences in mechanism, retrieval or reasoning task, strengths, limitations, and trade-offs where the selected evidence supports them. Avoid a paper-by-paper inventory.

For an exact cross-source response contract, run `validate_cross_source_answer.py` with the same question ID, question text, dimensions, source minimum, reserve, and word bounds used for preparation. The preflight rejects duplicate or trailing JSON, wrong key order and types, length errors, unsorted or duplicate arrays, uncontrolled dimensions, insufficient locally relevant sources, citation-page errors, unknown paths, source ownership mismatches, and missing claim coverage.

The report deliberately separates three independent counts: listed paper IDs, citation sources, and paper-specific claim-evidence sources. All three must meet the source gate and refer to the same papers. A generic semantic graph path is supplemental evidence; it never substitutes for paper-specific evidence.

Before returning the answer, check all of the following:

- exact top-level and nested keys, types, and key order;
- required length and cardinality bounds;
- every required controlled dimension is present and allowed;
- arrays are unique and sorted when requested;
- the relevant independent-source count meets the minimum;
- selected source IDs, citations, pages, and evidence paths agree;
- every citation page is within the verified source and supports the associated statement;
- every evidence item is a string copied from a verified `concept_path` and exists locally;
- no wildcard, abbreviated generated name, placeholder, or synthesized hash appears.

If any gate fails, repair the coverage ledger or output structure, then rerun the preflight. Safe structural repairs appear in `normalized_response`; guessed paths and semantic coverage gaps remain hard failures and require exact planner evidence. Do not hide a coverage gap by adding unrelated sources or unverifiable paths. A passing preflight proves structural and local evidence alignment, not that every prose sentence is semantically entailed; retain that responsibility during close reading.
