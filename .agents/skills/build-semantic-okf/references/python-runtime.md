# Python Runtime

## Supported environment

Use CPython 3.12 with the locked dependencies in `scripts/requirements.txt`. The builder uses the standard library for CSV, JSON, hashing, paths, and atomic staging; RDFLib for RDF parsing and graph construction; PyYAML for frontmatter; and pySHACL for validation.

Install and verify the runtime:

```bash
python -m venv .venv
python -m pip install -r scripts/requirements.txt
python scripts/runtime_smoke.py
```

The smoke command imports every required library and emits one JSON document with the interpreter and dependency versions.

## Deterministic processing

The builder performs these steps in one process:

1. validate the closed manifest;
2. discover every manifest-relative source path;
3. hash the sorted physical source inventory;
4. parse every source with its strict adapter;
5. normalize and sort records by source ID, record ID, and source path;
6. re-discover and re-hash sources to detect content or membership changes;
7. materialize concepts, RDF, provenance, SHACL, ledgers, and reports into a staging directory;
8. validate the complete staging tree before one final promotion rename.

Do not depend on filesystem enumeration or parser iteration order. JSON object order has no semantic effect. CSV fields bind by exact physical header name, not schema member order.

## Resource limits

Whole Markdown and RDF files are read in memory. The materializer also retains normalized records and RDF graphs in memory so it can validate cross-artifact coherence before publication. This is appropriate for local research libraries and ordinary document collections, not unbounded data lakes.

Split multi-gigabyte documents upstream. For a collection that no longer fits comfortably in memory, create independently versioned bundles with explicit federation or load validated RDF releases into a persistent indexed store. Do not introduce silent partial materialization.

## Strict failures

Malformed encodings, duplicate or mismatched CSV headers, invalid scalar conversions, malformed JSON, blank RDF nodes, duplicate identities, source changes during processing, SHACL violations, and cross-layer drift are blocking errors. The builder removes its staging directory after ordinary failure and never publishes a partial snapshot.
