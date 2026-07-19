#!/usr/bin/env python3
"""Generic contract tests for the state-machine verified-breadth realization."""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path


GENERATION_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = (
    GENERATION_ROOT
    / "candidates"
    / "state-machine-verified-breadth"
    / "consult-semantic-okf"
)
SCRIPTS = SKILL_ROOT / "scripts"
SNAPSHOT = Path(__file__).resolve().parent / "fixtures" / "snapshot"
QUESTION = (
    "Compare two service designs across architecture, retrieval, and supported tasks. "
    "Use evidence from at least 3 independent sources."
)


def load_candidate_module():
    sys.path.insert(0, str(SCRIPTS))
    for name in ("_cross_source", "harbor_answer"):
        sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(
        "harbor_answer",
        SCRIPTS / "harbor_answer.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load state-machine candidate")
    module = importlib.util.module_from_spec(spec)
    sys.modules["harbor_answer"] = module
    spec.loader.exec_module(module)
    return module


harbor_answer = load_candidate_module()
PARAMETERS = {
    "facet_limit": 6,
    "per_facet": 2,
    "max_supports": 6,
    "excerpt_chars": 220,
    "pack_byte_budget": 12000,
    "strategy": harbor_answer.STRATEGY,
}


def valid_draft(pack):
    draft = copy.deepcopy(pack["draft_template"])
    draft["answer"] = {
        "summary": "The selected records cover the requested design dimensions.",
        "claims": [
            {
                "statement": f"Synthetic supported observation {index + 1}.",
                "evidence_indices": [index],
            }
            for index in range(len(draft["evidence"]))
        ],
    }
    return draft


class StateMachineVerifiedBreadthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pack, cls.private_supports = harbor_answer._compile_support_pack(
            SNAPSHOT,
            "synthetic-001",
            QUESTION,
            PARAMETERS,
        )

    def test_adaptive_plan_meets_source_dimensions_and_pack_budget(self) -> None:
        self.assertEqual(self.pack["breadth_contract"]["minimum_sources"], 3)
        self.assertEqual(self.pack["breadth_contract"]["target_sources"], 5)
        self.assertLessEqual(len(self.pack["supports"]), PARAMETERS["max_supports"])
        self.assertGreaterEqual(
            len({row["source_handle"] for row in self.pack["supports"]}),
            3,
        )
        required = {row["dimension_id"] for row in self.pack["dimensions"]}
        covered = {
            dimension_id
            for row in self.pack["supports"]
            for dimension_id in row["dimension_ids"]
        }
        self.assertEqual(covered, required)
        self.assertEqual(self.pack["compilation"]["state"], "sealed")
        emitted_bytes = len(
            json.dumps(self.pack, ensure_ascii=False, indent=2).encode("utf-8")
        ) + 1
        self.assertLessEqual(emitted_bytes, PARAMETERS["pack_byte_budget"])

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
        self.assertNotIn('"locator"', json.dumps(self.pack, sort_keys=True))

    def test_finalizer_emits_exact_validated_contract(self) -> None:
        result = harbor_answer.finalize(
            self.pack,
            self.private_supports,
            valid_draft(self.pack),
        )
        self.assertEqual(tuple(result), ("question_id", "answer", "evidence"))
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
        changed["pack_byte_budget"] = 11000
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
