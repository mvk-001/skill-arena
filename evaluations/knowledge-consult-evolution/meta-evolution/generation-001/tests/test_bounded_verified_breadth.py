#!/usr/bin/env python3
"""Deterministic contract tests for the bounded verified-breadth realization."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path


GENERATION_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = (
    GENERATION_ROOT
    / "candidates"
    / "bounded-verified-breadth"
    / "consult-semantic-okf"
)
SCRIPTS = SKILL_ROOT / "scripts"
SNAPSHOT = Path(__file__).resolve().parent / "fixtures" / "snapshot"
sys.path.insert(0, str(SCRIPTS))

import harbor_answer  # noqa: E402


QUESTION = (
    "Compare two service designs across architecture, retrieval, and supported tasks. "
    "Use evidence from at least 3 independent sources."
)
PARAMETERS = {
    "facet_limit": 6,
    "per_facet": 2,
    "max_supports": 5,
    "excerpt_chars": 220,
    "strategy": harbor_answer.STRATEGY,
}


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    files = [
        item
        for item in root.rglob("*")
        if item.is_file()
        and "__pycache__" not in item.relative_to(root).parts
        and not item.name.endswith(".pyc")
    ]
    files.sort(key=lambda path: path.relative_to(root).as_posix().encode("utf-8"))
    for path in files:
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def valid_draft(pack: dict[str, object]) -> dict[str, object]:
    draft = copy.deepcopy(pack["draft_template"])
    handles = list(draft["evidence"])
    draft["answer"] = {
        "summary": "The selected records cover the requested design dimensions.",
        "claims": [
            {
                "statement": f"Synthetic supported observation {index + 1}.",
                "evidence_indices": [index],
            }
            for index in range(len(handles))
        ],
    }
    return draft


class BoundedVerifiedBreadthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.before = tree_digest(SNAPSHOT)
        cls.pack, cls.private_supports = harbor_answer._compile_support_pack(
            SNAPSHOT,
            "synthetic-001",
            QUESTION,
            PARAMETERS,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        if tree_digest(SNAPSHOT) != cls.before:
            raise AssertionError("the read-only synthetic snapshot changed")

    def test_adaptive_plan_meets_source_dimensions_and_pack_budget(self) -> None:
        self.assertEqual(self.pack["breadth_contract"]["minimum_sources"], 3)
        self.assertEqual(self.pack["breadth_contract"]["target_sources"], 4)
        self.assertLessEqual(len(self.pack["supports"]), PARAMETERS["max_supports"])
        self.assertGreaterEqual(
            len({row["source_handle"] for row in self.pack["supports"]}),
            3,
        )
        self.assertEqual(
            [row["text"] for row in self.pack["dimensions"]],
            ["architecture", "retrieval", "supported tasks"],
        )
        required = {row["dimension_id"] for row in self.pack["dimensions"]}
        covered = {
            dimension_id
            for row in self.pack["supports"]
            for dimension_id in row["dimension_ids"]
        }
        self.assertEqual(covered, required)

    def test_prepare_exposes_only_opaque_handles(self) -> None:
        forbidden = {
            "source_id",
            "record_id",
            "concept_path",
            "source_path",
            "record_sha256",
            "locator",
            "text_sha256",
        }
        for row in self.pack["supports"]:
            self.assertFalse(forbidden & set(row))
            self.assertRegex(row["support_id"], r"^support-[0-9a-f]{64}$")
            self.assertRegex(row["source_handle"], r"^source-[0-9a-f]{64}$")
        serialized = json.dumps(self.pack, sort_keys=True)
        self.assertNotIn('"locator"', serialized)
        self.assertNotIn("source-alpha", serialized)

    def test_finalizer_emits_exact_validated_contract(self) -> None:
        result = harbor_answer.finalize(
            self.pack,
            self.private_supports,
            valid_draft(self.pack),
        )
        self.assertEqual(tuple(result), ("question_id", "answer", "evidence"))
        self.assertEqual(tuple(result["answer"]), ("summary", "claims"))
        for row in result["evidence"]:
            self.assertEqual(tuple(row), harbor_answer.EVIDENCE_KEYS)
            self.assertEqual(
                row["locator"],
                {"kind": "record", "target": "record.body"},
            )

    def test_finalizer_rejects_draft_below_source_floor(self) -> None:
        draft = valid_draft(self.pack)
        draft["evidence"] = draft["evidence"][:2]
        draft["answer"]["claims"] = [
            {"statement": "First observation.", "evidence_indices": [0]},
            {"statement": "Second observation.", "evidence_indices": [1]},
        ]
        with self.assertRaisesRegex(harbor_answer.AnswerError, "distinct sources"):
            harbor_answer.finalize(self.pack, self.private_supports, draft)

    def test_finalizer_rejects_changed_parameters(self) -> None:
        changed = dict(PARAMETERS)
        changed["max_supports"] = 4
        changed_pack, changed_private = harbor_answer._compile_support_pack(
            SNAPSHOT,
            "synthetic-001",
            QUESTION,
            changed,
        )
        with self.assertRaisesRegex(harbor_answer.AnswerError, "parameters"):
            harbor_answer.finalize(
                changed_pack,
                changed_private,
                valid_draft(self.pack),
            )


if __name__ == "__main__":
    unittest.main()
