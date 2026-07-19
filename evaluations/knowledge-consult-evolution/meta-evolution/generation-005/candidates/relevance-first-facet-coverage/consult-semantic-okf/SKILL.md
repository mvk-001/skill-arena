---
name: consult-semantic-okf
description: Give an agent the read-only context and local tools needed to consult an existing Semantic OKF knowledge folder and, when requested, close an exact JSON answer with hash-bound evidence under a strict context budget. Use for record discovery, semantic queries, cross-source synthesis, or strict grounded responses. This skill never creates, repairs, refreshes, or modifies knowledge.
---

# Consult Semantic OKF

Navigate and answer from one published Semantic OKF knowledge folder while preserving its revision and evidence boundaries.

## Standalone boundary

- Use only this skill's `SKILL.md`, `references/`, `scripts/`, and declared Python requirements.
- Do not import scripts, instructions, validators, or conventions from sibling skills or repository files.
- Treat the supplied knowledge folder as the only domain input; the skill itself contains no domain corpus.
- Provide read-only navigation and consultation context only. Never create or maintain the knowledge folder.

## Read-only boundary

- Treat the bundle, source manifest, concepts, and semantic graphs as immutable inputs.
- Do not edit sources, manifests, mappings, ontology declarations, SHACL rules, ledgers, concepts, or generated graphs.
- Do not run build, refresh, recovery, or promotion commands.
- If the snapshot is missing, failed, stale, or requires source changes, report that condition and stop without attempting a repair.
- Do not use prior knowledge, the web, or guesses when the request limits answers to the snapshot.

## Route first

Choose the route before opening knowledge artifacts:

1. If the response must have the closed top-level keys `question_id`, `answer`, and `evidence`, use only the context-budgeted compiler route below. It takes precedence over the general workflow and optional references.
2. For every other request, use the general consultation workflow.

## One-shot exact JSON and evidence route

This is an exclusive single-command route. Do not use the general workflow, auxiliary queries, direct knowledge reads, source-code reads, reference-file reads, environment probes, draft files, or any other tool call on this route.

1. Set `SKILL_ROOT` to the directory containing this `SKILL.md` and `BUNDLE` to the supplied knowledge folder; these are separate roots. Preserve the question ID, complete semantic question, and complete evidence clause byte-for-byte. Set the latter to `EXACT_EVIDENCE_CLAUSE` and extract its stated independent-source minimum as `MINIMUM_SOURCE_COUNT`; fail closed before accessing knowledge if it is not an unambiguous positive integer.
2. Run exactly one command. The deterministic extractive compiler validates the bundle, decomposes alternatives and requested answer roles into bounded facets, expands only domain-neutral intent terms, and requires up to the configured number of distinct authorities per facet when the validated record pool provides them. It prefers reviewed claim-ready records when enough distinct authorities exist, safely falls back to the full validated record set otherwise, composes claims only from text present in selected records, finalizes evidence, and emits the closed response:

```bash
python -B "$SKILL_ROOT/scripts/harbor_answer.py" "$BUNDLE" answer \
  --question-id QUESTION_ID \
  --question "EXACT QUESTION" \
  --evidence-clause "EXACT_EVIDENCE_CLAUSE" \
  --minimum-sources MINIMUM_SOURCE_COUNT \
  --facet-limit 8 \
  --per-facet 2 \
  --max-supports 12 \
  --excerpt-chars 500 \
  --pack-byte-budget 16384
```

3. Successful stdout is terminal: return it exactly and never call another tool, reread, reformat, wrap, or modify it. If the command or its execution tool fails, preserve that first failure trace and stop; do not retry, inspect knowledge, invoke a fallback tool, or hand-assemble an answer.

## General consultation workflow

1. Parse the question and output contract: requested facts, operations, source scope, graph scope, evidence form, keys, types, ordering, limits, and citation requirements.
2. Locate the bundle and require a passing `semantic/build-report.json` plus the declared read artifacts.
3. Choose the cheapest authoritative layer that can answer the operation.
4. Discover exact identifiers and artifact paths through bounded `semantic/records.jsonl` queries before opening selected concepts or graphs.
5. Read selected `concepts/` Markdown for full explanations and source-oriented context.
6. Use `semantic/data.ttl` only when the question needs joins, traversal, grouping, aggregation, or typed values. Add other graphs only for their declared purpose.
7. For multi-source questions, establish breadth and evidence coverage before reading any one source deeply.
8. Verify every returned value, citation, page locator, and `concept_path` against the selected authoritative layer.
9. Apply the requested response schema exactly and verify the final evidence paths before returning the answer.

## Required references

- Read [querying.md](references/querying.md) before choosing a layer or writing a query.
- Read [source-boundaries.md](references/source-boundaries.md) when a bundle contains separate authorities, homogeneous partitions, or cross-bundle evidence.
- Read [cross-source-synthesis.md](references/cross-source-synthesis.md) before comparing, aggregating, or citing multiple sources.

## Environment

Run commands from the directory containing this `SKILL.md`, or prefix paths with the skill root.

```bash
python -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell, activate the same environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

Then install and verify with the activated interpreter:

```bash
python -m pip install -r scripts/requirements.txt
python scripts/runtime_smoke.py
```

Keep the environment activated for every command below. CPython 3.12 is the compatibility baseline used to compile the lock; a newer CPython is supported only when `runtime_smoke.py` passes with the exact locked dependencies.

The bundled Python helper is the supported baseline. `rg`, external reasoners, and persistent triplestores are optional tools, not package prerequisites. The helper is local and read-only; it does not perform network requests, mutation, entailment, build, refresh, or recovery.

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
  --source-id papers --type "Research Paper" --limit 20 --format json

python scripts/query_semantic_okf.py BUNDLE ledger \
  --contains "retrieval strategy" --show-content --format json

python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file PATH_TO_DATA_QUERY.rq --graph data --format json

python scripts/query_semantic_okf.py BUNDLE sparql \
  --query-file PATH_TO_LINEAGE_QUERY.rq --graph data --graph provenance --format json
```

Replace each `PATH_TO_*_QUERY.rq` placeholder with a query file you create outside the immutable bundle. No `queries/` directory or example query asset is supplied by this package.

Outside the closed compiler route, use `--validate` only when a full read-surface integrity check is explicitly required. It verifies the ledger, exact concept paths, semantic plan, and local Turtle graphs; it is a read-only integrity check, not a repair operation.

## Cross-source synthesis

Work breadth before depth. Convert the request into a clause checklist and build a source-by-clause-by-dimension ledger from one batched query. Count a source only when a selected claim directly supports a requested clause. Meet the independent-source minimum with verified relevant sources before reading any one source deeply.

Copy artifact paths verbatim from ledger `concept_path` values. Never reconstruct hashes, shorten generated names, use wildcard paths, or substitute a topic-adjacent source for a relevant one. Keep source IDs, cited pages, and evidence paths aligned.

Read [cross-source-synthesis.md](references/cross-source-synthesis.md) only when the request needs multi-source comparison or a strict evidence contract. Its optional helpers remain local and read-only.

## Completion gate

Before returning an answer, confirm:

- the snapshot passed the read-surface gate and was not modified;
- any strict evidence contract passed its bundled read-only preflight after the final repair;
- the chosen graph set matches the question and no unrelated graph was treated as domain evidence;
- every requested operation and clause is represented, every inferred facet meets its distinct-authority support floor, and the overall source minimum is satisfied;
- returned scalars, arrays, objects, RDF terms, datatypes, and nulls match the requested representation;
- every citation and evidence path exists and directly supports the associated statement;
- exact keys, types, ordering, uniqueness, limits, and length requirements are satisfied;
- a closed JSON request was returned only from a successful `harbor_answer.py finalize` run with unchanged question and parameters;
- the successful finalizer confirmed the question-derived source floor and inferred-dimension coverage using opaque handles before materializing any locator;
- no claim depends on the web, guesses, or unmounted knowledge when the snapshot is authoritative.
