#!/usr/bin/env python3
"""Prepare exact, page-grounded evidence for a cross-source Semantic OKF answer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _consult_semantic_okf import SnapshotError, configure_utf8_output  # noqa: E402
from _cross_source import load_catalog, rank_papers, seed_from_candidates  # noqa: E402


def _emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def _minimal_evidence_selection(
    candidates: list[dict[str, Any]], dimensions: list[str]
) -> list[dict[str, Any]]:
    """Keep one strong claim per paper plus the few claims needed for dimension coverage."""

    selected_paths: set[str] = set()
    claims_by_path: dict[str, dict[str, Any]] = {}
    owner_by_path: dict[str, str] = {}
    for candidate in candidates:
        paper_id = str(candidate["paper_id"])
        claims = list(candidate["selected_claims"])
        claims.sort(
            key=lambda claim: (
                -float(claim["relevance_score"]),
                str(claim["dimension"]),
                int(claim["page"]),
                str(claim["concept_path"]),
            )
        )
        if claims:
            selected_paths.add(str(claims[0]["concept_path"]))
        for claim in claims:
            path = str(claim["concept_path"])
            claims_by_path[path] = claim
            owner_by_path[path] = paper_id
    covered = {claims_by_path[path]["dimension"] for path in selected_paths}
    for dimension in dimensions:
        if dimension in covered:
            continue
        options = [
            claim for claim in claims_by_path.values() if claim["dimension"] == dimension
        ]
        if not options:
            continue
        best = min(
            options,
            key=lambda claim: (
                -float(claim["relevance_score"]),
                str(claim["concept_path"]),
            ),
        )
        selected_paths.add(str(best["concept_path"]))
        covered.add(dimension)

    result: list[dict[str, Any]] = []
    for candidate in candidates:
        paper_id = str(candidate["paper_id"])
        reduced = dict(candidate)
        all_claims = list(candidate["selected_claims"])
        reduced["available_dimension_claims"] = len(all_claims)
        reduced["selected_claims"] = sorted(
            [
                claim
                for claim in all_claims
                if str(claim["concept_path"]) in selected_paths
                and owner_by_path[str(claim["concept_path"])] == paper_id
            ],
            key=lambda claim: (
                str(claim["dimension"]),
                int(claim["page"]),
                str(claim["concept_path"]),
            ),
        )
        result.append(reduced)
    return result


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line interface."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="Published Semantic OKF bundle root.")
    parser.add_argument("--question-id", required=True, help="Exact response question_id.")
    parser.add_argument("--question", required=True, help="Cross-source question to rank locally.")
    parser.add_argument(
        "--dimension",
        action="append",
        required=True,
        dest="dimensions",
        help="Required controlled dimension. Repeat for every required dimension.",
    )
    parser.add_argument(
        "--min-sources",
        type=int,
        required=True,
        help="Hard minimum of independent relevant sources in the answer contract.",
    )
    parser.add_argument(
        "--reserve",
        type=int,
        default=5,
        help="Additional verified sources retained above the hard minimum (default: 5).",
    )
    parser.add_argument(
        "--candidate-paper",
        action="append",
        default=[],
        help="Use a reviewed paper ID explicitly. Repeat to override automatic selection.",
    )
    parser.add_argument(
        "--alternate-limit",
        type=int,
        default=3,
        help="Number of unselected ranked alternatives to expose (default: 3).",
    )
    return parser


def prepare(args: argparse.Namespace) -> dict[str, Any]:
    """Return a deterministic evidence plan and canonical response seed."""

    if args.min_sources < 1:
        raise ValueError("--min-sources must be at least 1")
    if args.reserve < 0:
        raise ValueError("--reserve cannot be negative")
    if args.alternate_limit < 0:
        raise ValueError("--alternate-limit cannot be negative")
    dimensions = sorted(set(args.dimensions))
    if len(dimensions) != len(args.dimensions):
        raise ValueError("--dimension values must be unique")
    catalog = load_catalog(args.bundle)
    target = args.min_sources + args.reserve
    if target > len(catalog.papers):
        raise ValueError(
            f"source target {target} exceeds the {len(catalog.papers)} papers in the snapshot"
        )
    ranked = rank_papers(catalog, args.question, dimensions)
    eligible = [
        candidate
        for candidate in ranked
        if candidate["dimension_coverage"]
        and candidate["rank_components"]["matched_dimensions"] > 0
    ]
    if len(eligible) < target:
        raise ValueError(
            f"only {len(eligible)} papers have question-matched claims in a required dimension; "
            f"{target} are required"
        )

    if args.candidate_paper:
        requested = list(args.candidate_paper)
        if len(set(requested)) != len(requested):
            raise ValueError("--candidate-paper values must be unique")
        unknown = sorted(set(requested) - set(catalog.papers))
        if unknown:
            raise ValueError(f"unknown candidate papers: {', '.join(unknown)}")
        if len(requested) < target:
            raise ValueError(
                f"explicit selection has {len(requested)} papers but the source target is {target}"
            )
        selected_ids = set(requested)
        selected = [candidate for candidate in ranked if candidate["paper_id"] in selected_ids]
        unmatched = [
            candidate["paper_id"]
            for candidate in selected
            if candidate["rank_components"]["matched_dimensions"] < 1
        ]
        if unmatched:
            raise ValueError(
                "explicit papers lack question-matched required-dimension claims: "
                + ", ".join(unmatched)
            )
        policy = "explicit-reviewed-selection"
    else:
        selected = eligible[:target]
        selected_ids = {candidate["paper_id"] for candidate in selected}
        covered = {
            dimension for candidate in selected for dimension in candidate["dimension_coverage"]
        }
        for dimension in sorted(set(dimensions) - covered):
            supplemental = next(
                (
                    candidate
                    for candidate in eligible
                    if candidate["paper_id"] not in selected_ids
                    and dimension in candidate["dimension_coverage"]
                ),
                None,
            )
            if supplemental is None:
                raise ValueError(f"no eligible paper covers required dimension {dimension!r}")
            selected.append(supplemental)
            selected_ids.add(supplemental["paper_id"])
            covered.update(supplemental["dimension_coverage"])
        policy = "bm25-question-match-and-global-dimension-coverage"

    covered = {
        dimension for candidate in selected for dimension in candidate["dimension_coverage"]
    }
    missing = sorted(set(dimensions) - covered)
    if missing:
        raise ValueError(f"selected papers do not cover required dimensions: {', '.join(missing)}")

    selected = _minimal_evidence_selection(selected, dimensions)

    selected_ids = {candidate["paper_id"] for candidate in selected}
    alternates = [
        {
            "paper_id": candidate["paper_id"],
            "title": candidate["title"],
            "dimension_coverage": candidate["dimension_coverage"],
            "relevance_score": candidate["relevance_score"],
            "selection_score": candidate["selection_score"],
            "matched_terms": candidate["matched_terms"],
        }
        for candidate in ranked
        if candidate["paper_id"] not in selected_ids
    ][: args.alternate_limit]
    return {
        "status": "pass",
        "mode": "read-only",
        "question_id": args.question_id,
        "required_dimensions": dimensions,
        "source_gate": {
            "hard_minimum": args.min_sources,
            "reserve": args.reserve,
            "required_total": target,
            "selected": len(selected),
            "available": len(catalog.papers),
        },
        "selection_policy": policy,
        "selected_papers": selected,
        "ranked_alternates": alternates,
        "response_seed": seed_from_candidates(args.question_id, dimensions, selected),
        "next_gate": (
            "Replace only response_seed.answer.summary, preserve exact IDs, citations, dimensions, and paths, "
            "then run validate_cross_source_answer.py until status is pass."
        ),
    }


def main(argv: Sequence[str] | None = None) -> int:
    """Prepare evidence or return a classified machine-readable error."""

    configure_utf8_output()
    args = build_parser().parse_args(argv)
    try:
        _emit(prepare(args))
    except (SnapshotError, OSError, UnicodeError, ValueError) as exc:
        _emit({"status": "error", "code": "evidence-preparation-failed", "message": str(exc)})
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
