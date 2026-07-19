#!/usr/bin/env python3
"""Model-free checks for the generation-005 development child."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


sys.dont_write_bytecode = True
GENERATION_ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_ROOT = GENERATION_ROOT / "candidates" / "relevance-first-facet-coverage"
BUNDLE = CANDIDATE_ROOT / "consult-semantic-okf"
SCRIPTS = BUNDLE / "scripts"
FIXTURE = GENERATION_ROOT.parents[0] / "generation-003" / "tests" / "fixtures" / "snapshot"


def load_module():
    sys.path.insert(0, str(SCRIPTS))
    try:
        for name in ("_cross_source", "_consult_semantic_okf"):
            sys.modules.pop(name, None)
        spec = importlib.util.spec_from_file_location("g005_harbor_answer", SCRIPTS / "harbor_answer.py")
        if spec is None or spec.loader is None:
            raise RuntimeError("cannot load generation-005 candidate")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(SCRIPTS))


class RelevanceFirstFacetCoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def test_canonical_name_and_bundle_are_case_neutral(self) -> None:
        skill = (BUNDLE / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("name: consult-semantic-okf", skill)
        text = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in BUNDLE.rglob("*")
            if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
        ).casefold()
        for forbidden in ("q018", "q024", "q030", "qrels", "grader"):
            self.assertNotIn(forbidden, text)

    def test_alternatives_and_answer_roles_become_separate_facets(self) -> None:
        question = (
            "Compare local evidence to reduce errors or improve reliability. "
            "Which controls make outputs auditable, and what risks can retrieval introduce?"
        )
        facets = self.module.decompose_facets(question, 8)
        self.assertIn("improve reliability", facets)
        self.assertIn("Which controls make outputs auditable", facets)
        self.assertIn("what risks can retrieval introduce", facets)

    def test_generic_intent_expansion_is_domain_neutral(self) -> None:
        tokens = self.module._expanded_query_tokens("Which controls are auditable and what risks remain?")
        self.assertIn("provenance", tokens)
        self.assertIn("explanation", tokens)
        self.assertIn("limitation", tokens)
        self.assertIn("noise", tokens)

    def test_planner_enforces_distinct_authorities_per_dimension(self) -> None:
        records = [
            {"source_id": f"source-{index}", "record_id": f"record-{index}", "attributes": {}}
            for index in range(4)
        ]
        plan = self.module.plan_bounded_supports(
            records,
            {
                "dimension-01": [(0, 4.0), (1, 3.0), (2, 1.0)],
                "dimension-02": [(2, 4.0), (3, 3.0), (1, 1.0)],
            },
            [(0, 4.0), (2, 4.0), (1, 3.0), (3, 3.0)],
            minimum_sources=4,
            target_sources=4,
            max_supports=4,
            per_dimension=2,
        )
        self.assertEqual(plan["selected_source_count"], 4)
        self.assertEqual(plan["dimension_source_floors"], {"dimension-01": 2, "dimension-02": 2})
        self.assertGreaterEqual(plan["dimension_source_counts"]["dimension-01"], 2)
        self.assertGreaterEqual(plan["dimension_source_counts"]["dimension-02"], 2)

    def test_end_to_end_fixture_is_closed_and_deterministic(self) -> None:
        question = (
            "Compare layered architecture with distributed architecture. "
            "How does design origin change architecture, retrieval, and supported tasks?"
        )
        parameters = {
            "facet_limit": 8,
            "per_facet": 2,
            "max_supports": 12,
            "excerpt_chars": 500,
            "evidence_clause": "Use evidence from at least 3 independent sources.",
            "minimum_sources": 3,
            "pack_byte_budget": 16384,
            "strategy": self.module.STRATEGY,
        }
        first = self.module.answer_one_shot(FIXTURE, "synthetic-contract", question, parameters)
        second = self.module.answer_one_shot(FIXTURE, "synthetic-contract", question, parameters)
        self.assertEqual(first, second)
        self.assertEqual(tuple(first), ("question_id", "answer", "evidence"))
        self.assertEqual(tuple(first["answer"]), ("summary", "claims"))
        self.assertGreaterEqual(len({row["source_id"] for row in first["evidence"]}), 3)
        json.dumps(first)


if __name__ == "__main__":
    unittest.main()
