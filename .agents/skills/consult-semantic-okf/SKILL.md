---
name: consult-semantic-okf
description: Consult existing validated Semantic OKF knowledge snapshots without modifying them. Use when Codex needs to answer questions from an OKF bundle, choose between the record ledger, concept Markdown, RDF data, ontology, provenance, SHACL, or validation layers, run safe local SELECT or ASK queries, trace exact evidence paths, compare multiple sources, or produce grounded cited synthesis. Do not use for adding or changing sources, manifests, mappings, ontology terms, validation rules, or generated snapshots; use build-semantic-okf for those lifecycle operations.
---

# Consult Semantic OKF

Answer from one published Semantic OKF snapshot while preserving its revision and evidence boundaries.

## Read-only boundary

- Treat the bundle, source manifest, concepts, and semantic graphs as immutable inputs.
- Do not edit sources, manifests, mappings, ontology declarations, SHACL rules, ledgers, concepts, or generated graphs.
- Do not run build, refresh, recovery, or promotion commands.
- If the snapshot is missing, failed, stale, or requires source changes, stop consultation and hand the task to `$build-semantic-okf`.
- Do not use prior knowledge, the web, or guesses when the request limits answers to the snapshot.

## Workflow

1. Parse the question and exact output contract: requested facts, operations, source scope, graph scope, evidence form, keys, types, ordering, limits, and citation requirements.
2. Locate the bundle and require a passing `semantic/build-report.json` plus the declared read artifacts.
3. Choose the cheapest authoritative layer that can answer the operation.
4. Discover exact identifiers and artifact paths through `semantic/records.jsonl` before opening large concepts or graphs.
5. Read selected `concepts/` Markdown for full explanations and source-oriented context.
6. Use `semantic/data.ttl` only when the question needs joins, traversal, grouping, aggregation, or typed values. Add other graphs only for their declared purpose.
7. For multi-source questions, run the executable evidence planner before drafting; keep its relevance-ranked, page-grounded coverage ledger and source reserve.
8. Verify every returned value, citation, page locator, and `concept_path` against the selected authoritative layer.
9. Apply the requested response schema exactly, run the executable answer preflight, repair every reported failure, and rerun it until `status` is `pass`.

## Required references

- Read [querying.md](references/querying.md) before choosing a layer or writing a query.
- Read [source-boundaries.md](references/source-boundaries.md) when a bundle contains separate authorities, homogeneous partitions, or cross-bundle evidence.
- Read [cross-source-synthesis.md](references/cross-source-synthesis.md) before comparing, aggregating, or citing multiple sources.

## Environment

Run commands from the directory containing this `SKILL.md`, or prefix paths with the skill root.

```bash
python -m venv .venv
python -m pip install -r scripts/requirements.txt
python scripts/runtime_smoke.py
```

The helper is local and read-only. It does not perform network requests, mutation, entailment, build, refresh, or recovery.

## Choose the authoritative layer

1. Use `semantic/records.jsonl` for exact identifiers, source filters, record types, mapped attributes, counts, and literal artifact paths.
2. Use `concepts/` Markdown with fixed-string search for lexical discovery and human reading.
3. Use `semantic/data.ttl` for accepted domain facts and semantic operations.
4. Add `ontology.ttl` only for reviewed schema questions.
5. Add `provenance.ttl` only for lineage or physical-source questions.
6. Query `shapes.ttl` for declared constraints and `validation-report.ttl` for validation outcomes; never present either as ordinary domain facts.

Do not union all graphs by default. Use entailment `none` unless a separately declared reasoner workflow is part of the request.

## Query examples

```bash
python scripts/query_semantic_okf.py BUNDLE ledger \
  --source-id papers --type "Research Paper" --all --format json

python scripts/query_semantic_okf.py BUNDLE ledger \
  --contains "retrieval strategy" --show-content --format json

python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file queries/methods.rq --graph data --format json

python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file queries/lineage.rq --graph data --graph provenance --format json
```

Use `--validate` to parse the complete read surface before consultation. This verifies the ledger, exact concept paths, semantic plan, and local Turtle graphs. It does not replace the builder's full semantic, SHACL, and publication validator.

## Cross-source synthesis

Work breadth before depth. Convert the request into a clause checklist and build a source-by-clause-by-dimension ledger from one batched query. Count a source only when a selected claim directly supports a requested clause. Meet the independent-source minimum with verified relevant sources before reading any one source deeply.

Copy artifact paths verbatim from ledger `concept_path` values. Never reconstruct hashes, shorten generated names, use wildcard paths, or substitute a topic-adjacent source for a relevant one. Keep source IDs, cited pages, and evidence paths aligned.

For a cross-source answer with an exact output contract, the following script gate is mandatory. Pass every required controlled dimension and retain at least one verified source beyond the hard minimum when the snapshot permits it:

```bash
python scripts/prepare_cross_source_evidence.py BUNDLE \
  --question-id QUESTION_ID --question "QUESTION" \
  --dimension DIMENSION --dimension OTHER_DIMENSION \
  --min-sources MINIMUM --reserve 5
```

Review the selected interpretations for semantic fit. If a ranked source is only topic-adjacent, replace it with a relevant `ranked_alternates` paper by rerunning the planner with repeated `--candidate-paper` values. Start from `response_seed`; replace only its summary placeholder unless verified evidence requires a reviewed reselection. Do not type or reconstruct IDs, pages, citations, or generated paths from memory.

Before answering, pipe the single candidate JSON document to the preflight with the same question contract:

```bash
python scripts/validate_cross_source_answer.py BUNDLE --stdin \
  --question-id QUESTION_ID --question "QUESTION" \
  --dimension DIMENSION --dimension OTHER_DIMENSION \
  --min-sources MINIMUM --reserve 5 < CANDIDATE.json
```

On failure, apply the reported repair. Use `normalized_response` for safe key ordering, sorting, deduplication, path-prefix cleanup, and citation merging; manually resolve semantic coverage gaps or unknown paths from the planner. Rerun the preflight after every repair. Return the candidate only when the latest report has `status: pass`. The scripts read the bundle without writing to it or using the network.

## Completion gate

Before returning an answer, confirm:

- the snapshot passed the read-surface gate and was not modified;
- every multi-source answer passed `validate_cross_source_answer.py` after its final repair;
- the chosen graph set matches the question and no unrelated graph was treated as domain evidence;
- every requested operation, clause, controlled dimension, and source minimum is satisfied;
- returned scalars, arrays, objects, RDF terms, datatypes, and nulls match the requested representation;
- every citation and evidence path exists and directly supports the associated statement;
- exact keys, types, ordering, uniqueness, limits, and length requirements are satisfied;
- no claim depends on the web, guesses, or unmounted knowledge when the snapshot is authoritative.
