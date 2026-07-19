#!/usr/bin/env python3
"""Validate and canonicalize a cross-source answer before it is returned."""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _consult_semantic_okf import SnapshotError, configure_utf8_output, snapshot_file  # noqa: E402
from _cross_source import CrossSourceCatalog, load_catalog, rank_papers  # noqa: E402


MAX_RESPONSE_BYTES = 256 * 1024
TOP_LEVEL_KEYS = ["question_id", "answer", "evidence"]
ANSWER_KEYS = ["summary", "dimensions", "paper_ids", "citations"]
CITATION_KEYS = ["paper_id", "pages"]
WORD_PATTERN = re.compile(r"\b[\w'-]+\b", re.UNICODE)
SEMANTIC_EVIDENCE = {
    "semantic/data.ttl",
    "semantic/ontology.ttl",
    "semantic/provenance.ttl",
    "semantic/records.jsonl",
    "semantic/semantic-plan.json",
    "semantic/shapes.ttl",
    "semantic/validation-report.ttl",
}


class DuplicateKeyError(ValueError):
    """Reject ambiguous JSON objects instead of retaining the last value."""


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate JSON object key: {key}")
        result[key] = value
    return result


def strict_json_loads(raw: str) -> Any:
    """Parse exactly one finite JSON value with duplicate-key rejection."""

    if len(raw.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise ValueError(f"candidate exceeds {MAX_RESPONSE_BYTES} bytes")
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError(f"non-finite JSON number is not allowed: {value}")
        ),
    )


def _error(code: str, path: str, message: str, repair: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message, "repair": repair}


def _exact_keys(
    value: Mapping[str, Any], expected: list[str], path: str, errors: list[dict[str, str]]
) -> None:
    actual = list(value.keys())
    if actual != expected:
        errors.append(
            _error(
                "object-key-contract",
                path,
                f"expected keys in order {expected!r}, found {actual!r}",
                "Use the normalized_response key order and remove missing or additional keys.",
            )
        )


def _sorted_unique(values: list[Any]) -> bool:
    try:
        return values == sorted(set(values))
    except TypeError:
        return False


def _source_path_aliases(catalog: CrossSourceCatalog) -> dict[str, str | None]:
    candidates: dict[str, set[str]] = defaultdict(set)
    for concept_path, record in catalog.records_by_path.items():
        for field in ("source_path", "concept_id"):
            alias = record.get(field)
            if not isinstance(alias, str):
                continue
            candidates[alias].add(concept_path)
    return {
        alias: next(iter(paths)) if len(paths) == 1 else None
        for alias, paths in candidates.items()
    }


def _path_suggestion(value: str, catalog: CrossSourceCatalog) -> str | None:
    """Suggest, but never silently apply, a likely exact ledger path."""

    normalized = value.replace("\\", "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized.startswith("knowledge/"):
        normalized = normalized.removeprefix("knowledge/")
    aliases = _source_path_aliases(catalog)
    if normalized in aliases and aliases[normalized] is not None:
        return aliases[normalized]
    matches = difflib.get_close_matches(
        normalized,
        list(catalog.records_by_path),
        n=1,
        cutoff=0.9,
    )
    return matches[0] if matches else None


def canonicalize_response(value: Any, catalog: CrossSourceCatalog) -> dict[str, Any] | None:
    """Return a safe ordering/deduplication candidate without inventing evidence."""

    if not isinstance(value, Mapping):
        return None
    answer = value.get("answer")
    evidence = value.get("evidence")
    if not isinstance(answer, Mapping) or not isinstance(evidence, list):
        return None
    dimensions = answer.get("dimensions")
    paper_ids = answer.get("paper_ids")
    citations = answer.get("citations")
    if (
        not isinstance(dimensions, list)
        or not all(isinstance(item, str) for item in dimensions)
        or not isinstance(paper_ids, list)
        or not all(isinstance(item, str) for item in paper_ids)
        or not isinstance(citations, list)
        or not all(isinstance(item, Mapping) for item in citations)
        or not all(isinstance(item, str) for item in evidence)
    ):
        return None
    merged_pages: dict[str, set[int]] = defaultdict(set)
    for citation in citations:
        paper_id = citation.get("paper_id")
        pages = citation.get("pages")
        if isinstance(paper_id, str) and isinstance(pages, list):
            merged_pages[paper_id].update(page for page in pages if isinstance(page, int))
    normalized_evidence: list[str] = []
    aliases = _source_path_aliases(catalog)
    for item in evidence:
        normalized = item.replace("\\", "/")
        if normalized.startswith("./"):
            normalized = normalized[2:]
        if normalized.startswith("knowledge/"):
            normalized = normalized.removeprefix("knowledge/")
        alias = aliases.get(normalized)
        if alias is not None:
            normalized = alias
        normalized_evidence.append(normalized)
    return {
        "question_id": value.get("question_id"),
        "answer": {
            "summary": answer.get("summary"),
            "dimensions": sorted(set(dimensions)),
            "paper_ids": sorted(set(paper_ids)),
            "citations": [
                {"paper_id": paper_id, "pages": sorted(pages)}
                for paper_id, pages in sorted(merged_pages.items())
            ],
        },
        "evidence": sorted(set(normalized_evidence)),
    }


def validate_response(
    value: Any,
    catalog: CrossSourceCatalog,
    *,
    question_id: str,
    question: str,
    required_dimensions: Sequence[str],
    minimum_sources: int,
    reserve: int,
    minimum_words: int,
    maximum_words: int,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    """Apply independent structure, relevance, citation, and evidence gates."""

    errors: list[dict[str, str]] = []
    counts: dict[str, Any] = {
        "summary_words": 0,
        "paper_ids": 0,
        "citation_sources": 0,
        "claim_evidence_sources": 0,
        "locally_relevant_sources": 0,
        "required_dimensions": len(set(required_dimensions)),
        "required_dimensions_covered": 0,
        "required_source_total": minimum_sources + reserve,
    }
    if not isinstance(value, Mapping):
        return [
            _error(
                "top-level-type",
                "$",
                "candidate must be a JSON object",
                "Start from prepare_cross_source_evidence.py response_seed.",
            )
        ], counts
    _exact_keys(value, TOP_LEVEL_KEYS, "$", errors)
    if value.get("question_id") != question_id:
        errors.append(
            _error(
                "question-id",
                "$.question_id",
                f"expected {question_id!r}",
                "Copy the exact --question-id value into question_id.",
            )
        )
    answer = value.get("answer")
    evidence = value.get("evidence")
    if not isinstance(answer, Mapping):
        errors.append(
            _error(
                "answer-type",
                "$.answer",
                "answer must be an object for a passing snapshot",
                "Use response_seed.answer and replace only its summary placeholder.",
            )
        )
        return errors, counts
    _exact_keys(answer, ANSWER_KEYS, "$.answer", errors)

    summary = answer.get("summary")
    if not isinstance(summary, str):
        errors.append(
            _error(
                "summary-type",
                "$.answer.summary",
                "summary must be a string",
                "Write a comparative synthesis string.",
            )
        )
    else:
        counts["summary_words"] = len(WORD_PATTERN.findall(summary))
        if not minimum_words <= counts["summary_words"] <= maximum_words:
            errors.append(
                _error(
                    "summary-word-bound",
                    "$.answer.summary",
                    f"summary has {counts['summary_words']} words; expected {minimum_words}-{maximum_words}",
                    "Revise only the summary until it fits the requested word interval.",
                )
            )

    dimensions = answer.get("dimensions")
    dimension_values: list[str] = []
    if not isinstance(dimensions, list) or not all(isinstance(item, str) for item in dimensions):
        errors.append(
            _error(
                "dimensions-type",
                "$.answer.dimensions",
                "dimensions must be an array of strings",
                "Copy response_seed.answer.dimensions.",
            )
        )
    else:
        dimension_values = dimensions
        if not _sorted_unique(dimensions):
            errors.append(
                _error(
                    "dimensions-order",
                    "$.answer.dimensions",
                    "dimensions must be sorted and unique",
                    "Use normalized_response.answer.dimensions.",
                )
            )
        unknown = sorted(set(dimensions) - catalog.dimensions)
        if unknown:
            errors.append(
                _error(
                    "unknown-dimension",
                    "$.answer.dimensions",
                    f"uncontrolled dimensions: {unknown!r}",
                    "Remove dimensions not declared by the snapshot.",
                )
            )
        missing = sorted(set(required_dimensions) - set(dimensions))
        if missing:
            errors.append(
                _error(
                    "required-dimension-missing",
                    "$.answer.dimensions",
                    f"required dimensions are missing: {missing!r}",
                    "Restore every --dimension value.",
                )
            )

    paper_ids = answer.get("paper_ids")
    paper_values: list[str] = []
    target = minimum_sources + reserve
    if not isinstance(paper_ids, list) or not all(isinstance(item, str) for item in paper_ids):
        errors.append(
            _error(
                "paper-ids-type",
                "$.answer.paper_ids",
                "paper_ids must be an array of strings",
                "Copy response_seed.answer.paper_ids.",
            )
        )
    else:
        paper_values = paper_ids
        counts["paper_ids"] = len(set(paper_ids))
        if not _sorted_unique(paper_ids):
            errors.append(
                _error(
                    "paper-ids-order",
                    "$.answer.paper_ids",
                    "paper_ids must be sorted and unique",
                    "Use normalized_response.answer.paper_ids.",
                )
            )
        unknown = sorted(set(paper_ids) - set(catalog.papers))
        if unknown:
            errors.append(
                _error(
                    "unknown-paper",
                    "$.answer.paper_ids",
                    f"papers are not present in the snapshot: {unknown!r}",
                    "Select only exact paper IDs emitted by the evidence planner.",
                )
            )
        if len(set(paper_ids)) < target:
            errors.append(
                _error(
                    "source-total",
                    "$.answer.paper_ids",
                    f"found {len(set(paper_ids))} unique papers; gate requires {target}",
                    "Rerun prepare_cross_source_evidence.py with the same minimum and reserve.",
                )
            )

    citations = answer.get("citations")
    citation_map: dict[str, set[int]] = {}
    if not isinstance(citations, list):
        errors.append(
            _error(
                "citations-type",
                "$.answer.citations",
                "citations must be an array",
                "Copy response_seed.answer.citations.",
            )
        )
    else:
        citation_ids: list[str] = []
        for index, citation in enumerate(citations):
            path = f"$.answer.citations[{index}]"
            if not isinstance(citation, Mapping):
                errors.append(
                    _error("citation-type", path, "citation must be an object", "Use the response seed.")
                )
                continue
            _exact_keys(citation, CITATION_KEYS, path, errors)
            paper_id = citation.get("paper_id")
            pages = citation.get("pages")
            if not isinstance(paper_id, str) or not isinstance(pages, list):
                errors.append(
                    _error(
                        "citation-shape",
                        path,
                        "citation requires a string paper_id and pages array",
                        "Use the response seed citation object.",
                    )
                )
                continue
            citation_ids.append(paper_id)
            if not pages or not all(isinstance(page, int) and not isinstance(page, bool) for page in pages):
                errors.append(
                    _error(
                        "citation-pages-type",
                        f"{path}.pages",
                        "pages must be a nonempty integer array",
                        "Copy page numbers from selected claim evidence.",
                    )
                )
                continue
            if not _sorted_unique(pages):
                errors.append(
                    _error(
                        "citation-pages-order",
                        f"{path}.pages",
                        "pages must be sorted and unique",
                        "Use normalized_response citation pages.",
                    )
                )
            if paper_id in citation_map:
                errors.append(
                    _error(
                        "duplicate-citation",
                        path,
                        f"paper {paper_id!r} has more than one citation object",
                        "Use normalized_response to merge pages by paper.",
                    )
                )
            citation_map.setdefault(paper_id, set()).update(pages)
            paper = catalog.papers.get(paper_id)
            if paper is not None:
                invalid = [page for page in pages if page < 1 or page > paper.page_count]
                if invalid:
                    errors.append(
                        _error(
                            "citation-page-bound",
                            f"{path}.pages",
                            f"pages outside 1-{paper.page_count}: {invalid!r}",
                            "Use only the PDF pages emitted beside selected claims.",
                        )
                    )
        counts["citation_sources"] = len(set(citation_ids))
        if citation_ids != sorted(set(citation_ids)):
            errors.append(
                _error(
                    "citation-order",
                    "$.answer.citations",
                    "citations must be sorted by unique paper_id",
                    "Use normalized_response.answer.citations.",
                )
            )
        if set(citation_ids) != set(paper_values):
            errors.append(
                _error(
                    "citation-paper-alignment",
                    "$.answer.citations",
                    "citation paper IDs must equal answer.paper_ids",
                    "Restore the planner's aligned paper_ids and citations.",
                )
            )
        if len(set(citation_ids)) < target:
            errors.append(
                _error(
                    "citation-source-total",
                    "$.answer.citations",
                    f"found {len(set(citation_ids))} citation sources; gate requires {target}",
                    "Restore every planner citation.",
                )
            )

    claim_by_path = {claim.concept_path: claim for claim in catalog.claims}
    evidence_values: list[str] = []
    claim_papers: set[str] = set()
    claim_dimensions: set[str] = set()
    claim_pages: dict[str, set[int]] = defaultdict(set)
    paper_specific_evidence: set[str] = set()
    if not isinstance(evidence, list) or not all(isinstance(item, str) for item in evidence):
        errors.append(
            _error(
                "evidence-type",
                "$.evidence",
                "evidence must be an array of strings",
                "Copy response_seed.evidence.",
            )
        )
    else:
        evidence_values = evidence
        if not evidence:
            errors.append(
                _error(
                    "evidence-empty",
                    "$.evidence",
                    "evidence cannot be empty",
                    "Copy exact claim concept paths from the evidence planner.",
                )
            )
        if not _sorted_unique(evidence):
            errors.append(
                _error(
                    "evidence-order",
                    "$.evidence",
                    "evidence must be sorted and unique",
                    "Use normalized_response.evidence.",
                )
            )
        known = set(catalog.records_by_path) | SEMANTIC_EVIDENCE
        for index, item in enumerate(evidence):
            path = f"$.evidence[{index}]"
            if item not in known:
                suggestion = _path_suggestion(item, catalog)
                repair = (
                    f"Verify and replace with the exact ledger concept_path {suggestion!r}."
                    if suggestion
                    else "Remove it and copy an exact concept_path from the evidence planner."
                )
                errors.append(
                    _error(
                        "unknown-evidence-path",
                        path,
                        f"path is not an exact ledger concept_path or allowed semantic artifact: {item!r}",
                        repair,
                    )
                )
                continue
            if item in SEMANTIC_EVIDENCE:
                try:
                    snapshot_file(catalog.root, item)
                except SnapshotError as exc:
                    errors.append(
                        _error(
                            "semantic-evidence-missing",
                            path,
                            str(exc),
                            "Remove the missing semantic artifact.",
                        )
                    )
                continue
            owner = catalog.path_to_paper.get(item)
            if owner is not None:
                paper_specific_evidence.add(owner)
            claim = claim_by_path.get(item)
            if claim is not None:
                claim_papers.add(claim.paper_id)
                claim_dimensions.add(claim.dimension)
                claim_pages[claim.paper_id].add(claim.page)
        counts["claim_evidence_sources"] = len(claim_papers)
        counts["required_dimensions_covered"] = len(
            set(required_dimensions) & claim_dimensions
        )
        if paper_specific_evidence - set(paper_values):
            errors.append(
                _error(
                    "unlisted-evidence-owner",
                    "$.evidence",
                    f"evidence belongs to unlisted papers: {sorted(paper_specific_evidence - set(paper_values))!r}",
                    "List the paper consistently or remove its evidence.",
                )
            )
        missing_claim_papers = sorted(set(paper_values) - claim_papers)
        if missing_claim_papers:
            errors.append(
                _error(
                    "paper-claim-evidence",
                    "$.evidence",
                    f"listed papers lack paper-specific claim evidence: {missing_claim_papers!r}",
                    "Restore at least one selected claim concept for every listed paper.",
                )
            )
        if len(claim_papers) < target:
            errors.append(
                _error(
                    "evidence-source-total",
                    "$.evidence",
                    f"claim evidence covers {len(claim_papers)} papers; gate requires {target}",
                    "Restore the planner's exact claim paths.",
                )
            )
        missing_dimensions = sorted(set(required_dimensions) - claim_dimensions)
        if missing_dimensions:
            errors.append(
                _error(
                    "dimension-evidence",
                    "$.evidence",
                    f"required dimensions lack selected claim evidence: {missing_dimensions!r}",
                    "Restore claims for every required dimension.",
                )
            )
        for paper_id, pages in citation_map.items():
            unbacked = sorted(pages - claim_pages.get(paper_id, set()))
            if unbacked:
                errors.append(
                    _error(
                        "citation-page-evidence",
                        "$.answer.citations",
                        f"citation pages for {paper_id} lack selected claim locators: {unbacked!r}",
                        "Use only pages emitted with selected claim concept paths.",
                    )
                )

    relevance = {
        item["paper_id"]: item["relevance_score"]
        for item in rank_papers(catalog, question, required_dimensions)
    }
    locally_relevant = {
        paper_id for paper_id in set(paper_values) & claim_papers if relevance.get(paper_id, 0) > 0
    }
    counts["locally_relevant_sources"] = len(locally_relevant)
    if len(locally_relevant) < target:
        errors.append(
            _error(
                "relevance-source-total",
                "$.answer.paper_ids",
                f"only {len(locally_relevant)} listed papers have question-matched reviewed claims; gate requires {target}",
                "Use the planner's ranked selection; do not pad with topic-adjacent papers.",
            )
        )
    return errors, counts


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line interface."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="Published Semantic OKF bundle root.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--response-file", type=Path, help="Candidate JSON file outside the bundle.")
    source.add_argument("--stdin", action="store_true", help="Read candidate JSON from standard input.")
    parser.add_argument("--question-id", required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--dimension", action="append", required=True, dest="dimensions")
    parser.add_argument("--min-sources", type=int, required=True)
    parser.add_argument("--reserve", type=int, default=5)
    parser.add_argument("--min-words", type=int, default=180)
    parser.add_argument("--max-words", type=int, default=300)
    return parser


def _read_candidate(args: argparse.Namespace) -> str:
    if args.stdin:
        return sys.stdin.read()
    assert args.response_file is not None
    return args.response_file.read_text(encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the fail-closed preflight and expose a repairable normalized candidate."""

    configure_utf8_output()
    args = build_parser().parse_args(argv)
    try:
        if args.min_sources < 1 or args.reserve < 0:
            raise ValueError("source minimum must be positive and reserve cannot be negative")
        if args.min_words < 1 or args.max_words < args.min_words:
            raise ValueError("invalid summary word interval")
        if len(set(args.dimensions)) != len(args.dimensions):
            raise ValueError("--dimension values must be unique")
        catalog = load_catalog(args.bundle)
        raw = _read_candidate(args)
        value = strict_json_loads(raw)
    except (DuplicateKeyError, json.JSONDecodeError, SnapshotError, OSError, UnicodeError, ValueError) as exc:
        print(
            json.dumps(
                {
                    "status": "fail",
                    "mode": "read-only-preflight",
                    "errors": [
                        _error(
                            "candidate-parse",
                            "$",
                            str(exc),
                            "Emit exactly one finite JSON object with no duplicate keys or trailing content.",
                        )
                    ],
                    "normalized_response": None,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 3

    dimensions = sorted(args.dimensions)
    errors, counts = validate_response(
        value,
        catalog,
        question_id=args.question_id,
        question=args.question,
        required_dimensions=dimensions,
        minimum_sources=args.min_sources,
        reserve=args.reserve,
        minimum_words=args.min_words,
        maximum_words=args.max_words,
    )
    normalized = canonicalize_response(value, catalog)
    normalized_errors: list[dict[str, str]] | None = None
    if normalized is not None:
        normalized_errors, _ = validate_response(
            normalized,
            catalog,
            question_id=args.question_id,
            question=args.question,
            required_dimensions=dimensions,
            minimum_sources=args.min_sources,
            reserve=args.reserve,
            minimum_words=args.min_words,
            maximum_words=args.max_words,
        )
    report = {
        "status": "pass" if not errors else "fail",
        "mode": "read-only-preflight",
        "counts": counts,
        "errors": errors,
        "normalized_response": normalized,
        "normalized_response_status": (
            "unavailable"
            if normalized_errors is None
            else "pass"
            if not normalized_errors
            else "needs-semantic-repair"
        ),
        "assurance": (
            "The gate checks response structure, local lexical relevance, exact evidence ownership, and page alignment; "
            "the writer must still ensure that every prose sentence is semantically supported."
        ),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 3


if __name__ == "__main__":
    raise SystemExit(main())
