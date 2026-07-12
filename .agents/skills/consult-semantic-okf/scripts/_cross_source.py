#!/usr/bin/env python3
"""Deterministic read-only support for cross-source Semantic OKF answers."""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from _consult_semantic_okf import SnapshotError, safe_concept_path, snapshot_file, validate_snapshot


PAGE_PATTERN = re.compile(r"#PDF-page-(\d+)$")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)
STOP_WORDS = {
    "a",
    "alone",
    "always",
    "about",
    "across",
    "after",
    "all",
    "also",
    "an",
    "and",
    "answer",
    "answers",
    "approach",
    "approaches",
    "are",
    "as",
    "at",
    "be",
    "between",
    "by",
    "can",
    "compare",
    "corpus",
    "different",
    "distinct",
    "do",
    "does",
    "each",
    "explain",
    "for",
    "from",
    "graphrag",
    "how",
    "in",
    "include",
    "identify",
    "into",
    "is",
    "it",
    "its",
    "job",
    "jobs",
    "method",
    "methods",
    "neither",
    "of",
    "on",
    "or",
    "paper",
    "papers",
    "result",
    "results",
    "should",
    "signal",
    "signals",
    "sufficient",
    "system",
    "systems",
    "that",
    "the",
    "their",
    "these",
    "they",
    "this",
    "to",
    "use",
    "used",
    "using",
    "versus",
    "what",
    "when",
    "which",
    "with",
}


@dataclass(frozen=True)
class PaperRecord:
    """One authoritative paper concept and its page boundary."""

    paper_id: str
    slug: str
    title: str
    page_count: int
    concept_path: str


@dataclass(frozen=True)
class ClaimRecord:
    """One reviewed source-specific claim with a stable page locator."""

    paper_id: str
    dimension: str
    interpretation: str
    page: int
    concept_path: str
    title: str


@dataclass(frozen=True)
class CrossSourceCatalog:
    """Immutable in-memory view used by preparation and validation gates."""

    root: Path
    papers: Mapping[str, PaperRecord]
    claims: tuple[ClaimRecord, ...]
    claims_by_paper: Mapping[str, tuple[ClaimRecord, ...]]
    records_by_path: Mapping[str, Mapping[str, Any]]
    path_to_paper: Mapping[str, str]
    dimensions: frozenset[str]


def _load_ledger(root: Path) -> list[dict[str, Any]]:
    path = snapshot_file(root, "semantic/records.jsonl")
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise SnapshotError(f"cannot read record ledger: {exc}") from exc
    if not lines:
        raise SnapshotError("records.jsonl must not be empty")
    for number, line in enumerate(lines, start=1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SnapshotError(f"invalid records.jsonl line {number}: {exc}") from exc
        if not isinstance(value, dict):
            raise SnapshotError(f"records.jsonl line {number} must be an object")
        safe_concept_path(root, value.get("concept_path"))
        records.append(value)
    return records


def load_catalog(root: Path) -> CrossSourceCatalog:
    """Load exact paper, claim, dimension, and path metadata without mutation."""

    root = root.resolve()
    validate_snapshot(root, full_read_surface=False)
    records = _load_ledger(root)
    papers: dict[str, PaperRecord] = {}
    slug_to_paper: dict[str, str] = {}
    records_by_path: dict[str, Mapping[str, Any]] = {}
    dimensions: set[str] = set()

    for record in records:
        concept_path = record.get("concept_path")
        if not isinstance(concept_path, str):
            raise SnapshotError("record contains no string concept_path")
        if concept_path in records_by_path:
            raise SnapshotError(f"duplicate concept_path in record ledger: {concept_path}")
        records_by_path[concept_path] = record
        attributes = record.get("attributes")
        if not isinstance(attributes, Mapping):
            attributes = {}
        if record.get("concept_type") == "Research Paper":
            paper_id = attributes.get("paper_id")
            page_count = attributes.get("page_count")
            source_id = record.get("source_id")
            title = record.get("title")
            if (
                not isinstance(paper_id, str)
                or not paper_id
                or not isinstance(page_count, int)
                or page_count < 1
                or not isinstance(source_id, str)
                or not source_id.startswith("paper-")
                or not isinstance(title, str)
            ):
                raise SnapshotError(f"invalid Research Paper record at {concept_path}")
            slug = source_id.removeprefix("paper-")
            if paper_id in papers or slug in slug_to_paper:
                raise SnapshotError(f"duplicate paper identity in record ledger: {paper_id}")
            papers[paper_id] = PaperRecord(
                paper_id=paper_id,
                slug=slug,
                title=title,
                page_count=page_count,
                concept_path=concept_path,
            )
            slug_to_paper[slug] = paper_id
        if attributes.get("term_kind") == "analysis-dimension":
            record_id = record.get("record_id")
            if isinstance(record_id, str) and record_id.startswith("dimension-"):
                dimensions.add(record_id.removeprefix("dimension-"))

    if not papers:
        raise SnapshotError("record ledger contains no Research Paper concepts")

    claims: list[ClaimRecord] = []
    path_to_paper: dict[str, str] = {
        paper.concept_path: paper.paper_id for paper in papers.values()
    }
    for record in records:
        concept_path = record["concept_path"]
        source_id = record.get("source_id")
        record_id = record.get("record_id")
        if isinstance(source_id, str) and source_id.startswith("claims-"):
            paper_id = slug_to_paper.get(source_id.removeprefix("claims-"))
            attributes = record.get("attributes")
            if paper_id is None or not isinstance(attributes, Mapping):
                raise SnapshotError(f"claim cannot be mapped to a paper: {concept_path}")
            dimension = attributes.get("claim_kind")
            interpretation = attributes.get("interpretation")
            locator = attributes.get("evidence_locator")
            title = record.get("title")
            match = PAGE_PATTERN.search(locator) if isinstance(locator, str) else None
            if (
                record.get("concept_type") != "Paper Semantic Claim"
                or not isinstance(dimension, str)
                or not isinstance(interpretation, str)
                or not interpretation.strip()
                or match is None
                or not isinstance(title, str)
            ):
                raise SnapshotError(f"invalid paper claim at {concept_path}")
            page = int(match.group(1))
            if page < 1 or page > papers[paper_id].page_count:
                raise SnapshotError(f"claim page is outside the paper boundary: {concept_path}")
            claims.append(
                ClaimRecord(
                    paper_id=paper_id,
                    dimension=dimension,
                    interpretation=interpretation.strip(),
                    page=page,
                    concept_path=concept_path,
                    title=title,
                )
            )
            path_to_paper[concept_path] = paper_id
            dimensions.add(dimension)
        elif (
            record.get("concept_type") == "Analysis Term"
            and isinstance(record_id, str)
            and record_id.startswith("method-")
        ):
            paper_id = slug_to_paper.get(record_id.removeprefix("method-"))
            if paper_id is not None:
                path_to_paper[concept_path] = paper_id

    if not claims:
        raise SnapshotError("record ledger contains no page-grounded paper claims")
    claims.sort(key=lambda item: (item.paper_id, item.dimension, item.page, item.concept_path))
    claims_by_paper: dict[str, tuple[ClaimRecord, ...]] = {}
    for paper_id in sorted(papers):
        selected = tuple(claim for claim in claims if claim.paper_id == paper_id)
        if not selected:
            raise SnapshotError(f"paper has no reviewed claims: {paper_id}")
        claims_by_paper[paper_id] = selected
    return CrossSourceCatalog(
        root=root,
        papers=dict(sorted(papers.items())),
        claims=tuple(claims),
        claims_by_paper=claims_by_paper,
        records_by_path=dict(sorted(records_by_path.items())),
        path_to_paper=dict(sorted(path_to_paper.items())),
        dimensions=frozenset(dimensions),
    )


def tokenize(value: str) -> tuple[str, ...]:
    """Tokenize English query and claim text for deterministic local ranking."""

    return tuple(
        token
        for token in (item.lower() for item in TOKEN_PATTERN.findall(value))
        if len(token) > 1 and token not in STOP_WORDS
    )


def _bm25_scores(documents: Mapping[str, Sequence[str]], query_tokens: Sequence[str]) -> dict[str, float]:
    """Score a small paper corpus with dependency-free BM25."""

    if not documents:
        return {}
    lengths = {key: len(tokens) for key, tokens in documents.items()}
    average = sum(lengths.values()) / len(lengths) or 1.0
    frequencies = {key: Counter(tokens) for key, tokens in documents.items()}
    document_frequency = Counter(
        token for token in set(query_tokens) for tokens in documents.values() if token in set(tokens)
    )
    scores = {key: 0.0 for key in documents}
    k1 = 1.5
    b = 0.75
    for token in set(query_tokens):
        df = document_frequency[token]
        if not df:
            continue
        inverse = math.log(1.0 + (len(documents) - df + 0.5) / (df + 0.5))
        for key, counts in frequencies.items():
            tf = counts[token]
            if not tf:
                continue
            denominator = tf + k1 * (1.0 - b + b * lengths[key] / average)
            scores[key] += inverse * (tf * (k1 + 1.0)) / denominator
    return scores


def rank_papers(
    catalog: CrossSourceCatalog,
    question: str,
    required_dimensions: Iterable[str],
) -> list[dict[str, Any]]:
    """Rank papers and their best page-grounded claims for one answer contract."""

    dimensions = tuple(sorted(set(required_dimensions)))
    unknown = sorted(set(dimensions) - catalog.dimensions)
    if unknown:
        raise ValueError(f"unknown controlled dimensions: {', '.join(unknown)}")
    if not dimensions:
        raise ValueError("at least one controlled dimension is required")
    question_tokens = tokenize(question)
    paper_documents: dict[str, tuple[str, ...]] = {}
    for paper_id, claims in catalog.claims_by_paper.items():
        relevant = [claim for claim in claims if claim.dimension in dimensions]
        text = " ".join(
            [catalog.papers[paper_id].title]
            + [f"{claim.dimension} {claim.interpretation}" for claim in relevant]
        )
        paper_documents[paper_id] = tokenize(text)
    paper_scores = _bm25_scores(paper_documents, question_tokens)

    ranked: list[dict[str, Any]] = []
    for paper_id, paper in catalog.papers.items():
        per_dimension: list[ClaimRecord] = []
        dimension_scores: dict[str, float] = {}
        for dimension in dimensions:
            candidates = [
                claim for claim in catalog.claims_by_paper[paper_id] if claim.dimension == dimension
            ]
            if not candidates:
                continue
            claim_documents = {
                claim.concept_path: tokenize(f"{claim.title} {claim.interpretation}")
                for claim in candidates
            }
            scores = _bm25_scores(claim_documents, question_tokens)
            best = min(
                candidates,
                key=lambda claim: (-scores[claim.concept_path], claim.page, claim.concept_path),
            )
            per_dimension.append(best)
            dimension_scores[dimension] = round(scores[best.concept_path], 6)
        covered = sorted({claim.dimension for claim in per_dimension})
        matched_terms = sorted(set(question_tokens) & set(paper_documents[paper_id]))
        best_claim_scores = [dimension_scores[dimension] for dimension in covered]
        rank_components = {
            "matched_question_terms": len(matched_terms),
            "matched_dimensions": sum(score > 0 for score in best_claim_scores),
            "best_claim_score_sum": round(sum(best_claim_scores), 6),
            "best_claim_score": round(max(best_claim_scores, default=0.0), 6),
            "paper_bm25_score": round(paper_scores[paper_id], 6),
        }
        selection_score = round(
            2.0 * rank_components["matched_question_terms"]
            + 2.0 * rank_components["matched_dimensions"]
            + 4.0 * rank_components["best_claim_score"]
            + 0.5 * rank_components["best_claim_score_sum"]
            + 0.25 * rank_components["paper_bm25_score"],
            6,
        )
        ranked.append(
            {
                "paper_id": paper_id,
                "title": paper.title,
                "page_count": paper.page_count,
                "paper_concept_path": paper.concept_path,
                "dimension_coverage": covered,
                "coverage_complete": set(dimensions) <= set(covered),
                "relevance_score": round(paper_scores[paper_id], 6),
                "selection_score": selection_score,
                "matched_terms": matched_terms,
                "rank_components": rank_components,
                "selected_claims": [
                    {
                        "dimension": claim.dimension,
                        "interpretation": claim.interpretation,
                        "page": claim.page,
                        "concept_path": claim.concept_path,
                        "relevance_score": dimension_scores[claim.dimension],
                    }
                    for claim in sorted(
                        per_dimension,
                        key=lambda item: (item.dimension, item.page, item.concept_path),
                    )
                ],
            }
        )
    return sorted(
        ranked,
        key=lambda item: (
            -item["selection_score"],
            item["paper_id"],
        ),
    )


def seed_from_candidates(
    question_id: str,
    dimensions: Sequence[str],
    candidates: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build a canonical response skeleton from exact ranked ledger evidence."""

    paper_ids = sorted(str(candidate["paper_id"]) for candidate in candidates)
    citations: list[dict[str, Any]] = []
    evidence: list[str] = []
    for candidate in sorted(candidates, key=lambda item: str(item["paper_id"])):
        claims = candidate.get("selected_claims")
        if not isinstance(claims, Sequence):
            continue
        pages = sorted(
            {
                int(claim["page"])
                for claim in claims
                if isinstance(claim, Mapping) and isinstance(claim.get("page"), int)
            }
        )
        if pages:
            citations.append({"paper_id": candidate["paper_id"], "pages": pages})
        evidence.extend(
            str(claim["concept_path"])
            for claim in claims
            if isinstance(claim, Mapping) and isinstance(claim.get("concept_path"), str)
        )
    return {
        "question_id": question_id,
        "answer": {
            "summary": "REPLACE WITH A COMPARATIVE, EVIDENCE-BOUNDED SYNTHESIS",
            "dimensions": sorted(set(dimensions)),
            "paper_ids": paper_ids,
            "citations": citations,
        },
        "evidence": sorted(set(evidence)),
    }
