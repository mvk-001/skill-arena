#!/usr/bin/env python3
"""Synthetic, model-free checks for both generation-002 realizations."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import io
import json
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path


GENERATION_ROOT = Path(__file__).resolve().parents[1]
CANDIDATES_ROOT = GENERATION_ROOT / "candidates"
SNAPSHOT = Path(__file__).resolve().parent / "fixtures" / "snapshot"
PARENT_DIGEST = "8e3412afc7690f2862073eb25ea5fa82736fb5b1c9f243585e6df704b850a8a7"
OPERATOR_ID = "explicit-floor-terminal-finalize"
QUESTION = "Compare two service designs across architecture, retrieval, and supported tasks."
EVIDENCE_CLAUSE = "Use evidence from at least 3 independent sources."
CANDIDATE_IDS = (
    "explicit-floor-terminal-finalize",
    "canonical-floor-terminal-finalize",
)


def load_candidate(candidate_id: str):
    scripts = CANDIDATES_ROOT / candidate_id / "consult-semantic-okf" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        sys.modules.pop("_cross_source", None)
        module_name = "harbor_answer_" + candidate_id.replace("-", "_")
        spec = importlib.util.spec_from_file_location(module_name, scripts / "harbor_answer.py")
        if spec is None or spec.loader is None:
            raise RuntimeError(f"cannot load {candidate_id}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(scripts))


def parameters(module, candidate_id: str) -> dict[str, object]:
    result: dict[str, object] = {
        "facet_limit": 6,
        "per_facet": 2,
        "max_supports": 6,
        "excerpt_chars": 220,
        "evidence_clause": EVIDENCE_CLAUSE,
        "minimum_sources": 3,
        "strategy": module.STRATEGY,
    }
    if candidate_id == "canonical-floor-terminal-finalize":
        result["pack_byte_budget"] = 12000
    return result


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


def canonicalizing_draft(pack: dict[str, object]) -> tuple[dict[str, object], list[int]]:
    draft = copy.deepcopy(pack["draft_template"])
    evidence = list(draft["evidence"])
    order = [len(evidence) - 1, *range(len(evidence) - 1)]
    draft["answer"] = {
        "summary": "The selected records jointly cover the requested design dimensions.",
        "claims": [
            {
                "statement": f"Synthetic supported observation {position + 1}.",
                "evidence_indices": [old_index],
            }
            for position, old_index in enumerate(order)
        ],
    }
    return draft, order


class GenerationTwoCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.modules = {candidate_id: load_candidate(candidate_id) for candidate_id in CANDIDATE_IDS}
        cls.compiled = {}
        for candidate_id, module in cls.modules.items():
            pack, private = module._compile_support_pack(
                SNAPSHOT,
                "synthetic-contract",
                QUESTION,
                parameters(module, candidate_id),
            )
            cls.compiled[candidate_id] = (pack, private)

    def test_separate_evidence_clause_binds_floor_and_is_sealed(self) -> None:
        for candidate_id in CANDIDATE_IDS:
            with self.subTest(candidate_id=candidate_id):
                pack, _ = self.compiled[candidate_id]
                self.assertEqual(pack["breadth_contract"]["minimum_sources"], 3)
                self.assertTrue(pack["breadth_contract"]["explicit_source_minimum"])
                self.assertEqual(pack["parameters"]["minimum_sources"], 3)
                self.assertEqual(pack["parameters"]["evidence_clause"], EVIDENCE_CLAUSE)
                self.assertGreaterEqual(
                    len({row["source_handle"] for row in pack["supports"]}),
                    3,
                )
        direct_pack, _ = self.compiled["explicit-floor-terminal-finalize"]
        stateful_pack, _ = self.compiled["canonical-floor-terminal-finalize"]
        self.assertEqual(direct_pack["breadth_contract"]["target_sources"], 3)
        self.assertEqual(stateful_pack["breadth_contract"]["target_sources"], 5)
        self.assertEqual(
            len({row["source_handle"] for row in stateful_pack["supports"]}),
            stateful_pack["breadth_contract"]["target_sources"],
        )
        self.assertEqual(stateful_pack["compilation"]["state"], "sealed")

    def test_minimum_source_parameter_drift_invalidates_draft_and_commitment(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id):
                original_pack, _ = self.compiled[candidate_id]
                changed_parameters = parameters(module, candidate_id)
                changed_parameters["minimum_sources"] = 4
                changed_parameters["evidence_clause"] = (
                    "Use evidence from at least 4 independent sources."
                )
                changed_pack, changed_private = module._compile_support_pack(
                    SNAPSHOT,
                    "synthetic-contract",
                    QUESTION,
                    changed_parameters,
                )
                self.assertNotEqual(
                    original_pack["support_pack_sha256"],
                    changed_pack["support_pack_sha256"],
                )
                draft, _ = canonicalizing_draft(original_pack)
                with self.assertRaisesRegex(module.AnswerError, "parameters"):
                    module.finalize(changed_pack, changed_private, draft)

    def test_evidence_clause_must_parse_and_equal_explicit_floor(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id, case="mismatch"):
                invalid = parameters(module, candidate_id)
                invalid["minimum_sources"] = 2
                with self.assertRaisesRegex(module.AnswerError, "does not match"):
                    module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, invalid
                    )
            with self.subTest(candidate_id=candidate_id, case="no-explicit-floor"):
                invalid = parameters(module, candidate_id)
                invalid["evidence_clause"] = "Use evidence from independent sources."
                with self.assertRaisesRegex(module.AnswerError, "explicit independent-source"):
                    module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, invalid
                    )
            with self.subTest(candidate_id=candidate_id, case="question-floor"):
                invalid = parameters(module, candidate_id)
                question_with_floor = QUESTION + " At least 4 independent sources."
                with self.assertRaisesRegex(module.AnswerError, "must not lower"):
                    module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", question_with_floor, invalid
                    )

    def test_evidence_clause_text_drift_changes_commitment(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id):
                original_pack, _ = self.compiled[candidate_id]
                changed_parameters = parameters(module, candidate_id)
                changed_parameters["evidence_clause"] = (
                    "Cite evidence from at least 3 independent sources."
                )
                changed_pack, changed_private = module._compile_support_pack(
                    SNAPSHOT, "synthetic-contract", QUESTION, changed_parameters
                )
                self.assertNotEqual(
                    original_pack["support_pack_sha256"],
                    changed_pack["support_pack_sha256"],
                )
                draft, _ = canonicalizing_draft(original_pack)
                with self.assertRaisesRegex(module.AnswerError, "parameters"):
                    module.finalize(changed_pack, changed_private, draft)

    def test_explicit_floor_is_type_checked_and_bounded_by_support_cap(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id, case="boolean"):
                invalid = parameters(module, candidate_id)
                invalid["minimum_sources"] = True
                with self.assertRaisesRegex(module.AnswerError, "minimum_sources"):
                    module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, invalid
                    )
            with self.subTest(candidate_id=candidate_id, case="above-cap"):
                invalid = parameters(module, candidate_id)
                invalid["minimum_sources"] = invalid["max_supports"] + 1
                with self.assertRaisesRegex(module.AnswerError, "minimum_sources"):
                    module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, invalid
                    )

    def test_finalizer_canonicalizes_first_use_and_remaps_claim_indices(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id):
                pack, private = self.compiled[candidate_id]
                draft, order = canonicalizing_draft(pack)
                result = module.finalize(pack, private, draft)
                expected_ids = [draft["evidence"][old_index] for old_index in order]
                expected_sources = [private[support_id][0]["source_id"] for support_id in expected_ids]
                self.assertEqual(
                    [row["source_id"] for row in result["evidence"]],
                    expected_sources,
                )
                self.assertEqual(
                    [claim["evidence_indices"] for claim in result["answer"]["claims"]],
                    [[index] for index in range(len(order))],
                )
                for row in result["evidence"]:
                    self.assertEqual(row["locator"], {"kind": "record", "target": "record.body"})

    def test_finalizer_still_rejects_duplicate_unused_and_invalid_evidence(self) -> None:
        for candidate_id, module in self.modules.items():
            pack, private = self.compiled[candidate_id]
            with self.subTest(candidate_id=candidate_id, case="duplicate"):
                duplicate, _ = canonicalizing_draft(pack)
                duplicate["evidence"].append(duplicate["evidence"][0])
                with self.assertRaisesRegex(module.AnswerError, "duplicate support IDs"):
                    module.finalize(pack, private, duplicate)
            with self.subTest(candidate_id=candidate_id, case="unused"):
                unused, _ = canonicalizing_draft(pack)
                unused["answer"]["claims"] = unused["answer"]["claims"][:-1]
                with self.assertRaisesRegex(module.AnswerError, "unused evidence"):
                    module.finalize(pack, private, unused)
            with self.subTest(candidate_id=candidate_id, case="invalid"):
                invalid, _ = canonicalizing_draft(pack)
                invalid["answer"]["claims"][0]["evidence_indices"] = [len(invalid["evidence"])]
                with self.assertRaisesRegex(module.AnswerError, "out-of-range"):
                    module.finalize(pack, private, invalid)

    def test_stateful_planner_guarantees_distinct_target_sources_or_fails(self) -> None:
        module = self.modules["canonical-floor-terminal-finalize"]
        insufficient = [
            {"source_id": "authority-a", "record_id": "a-1"},
            {"source_id": "authority-a", "record_id": "a-2"},
            {"source_id": "authority-a", "record_id": "a-3"},
            {"source_id": "authority-b", "record_id": "b-1"},
        ]
        ranking = [(index, float(len(insufficient) - index)) for index in range(len(insufficient))]
        with self.assertRaisesRegex(module.BreadthPlanningError, "target sources required"):
            module.plan_bounded_supports(
                insufficient,
                {"dimension-01": ranking},
                ranking,
                minimum_sources=2,
                target_sources=4,
                max_supports=4,
            )

        sufficient = [
            {"source_id": "authority-a", "record_id": "a-1"},
            {"source_id": "authority-a", "record_id": "a-2"},
            {"source_id": "authority-b", "record_id": "b-1"},
            {"source_id": "authority-c", "record_id": "c-1"},
            {"source_id": "authority-d", "record_id": "d-1"},
        ]
        ranking = [(index, float(len(sufficient) - index)) for index in range(len(sufficient))]
        plan = module.plan_bounded_supports(
            sufficient,
            {"dimension-01": ranking},
            ranking,
            minimum_sources=2,
            target_sources=4,
            max_supports=4,
        )
        self.assertEqual(plan["selected_source_count"], 4)

    def test_terminal_route_is_short_rooted_and_binds_floor_twice(self) -> None:
        for candidate_id in CANDIDATE_IDS:
            with self.subTest(candidate_id=candidate_id):
                skill = (
                    CANDIDATES_ROOT / candidate_id / "consult-semantic-okf" / "SKILL.md"
                ).read_text(encoding="utf-8")
                route = skill.split("## General consultation workflow", 1)[0]
                self.assertIn("no more than five tool calls", route)
                self.assertIn("SKILL_ROOT", route)
                self.assertEqual(route.count("--minimum-sources MINIMUM_SOURCE_COUNT"), 2)
                self.assertEqual(
                    route.count('--evidence-clause "EXACT_EVIDENCE_CLAUSE"'),
                    2,
                )
                self.assertEqual(route.count('--question "EXACT QUESTION"'), 2)
                self.assertNotIn("query_semantic_okf.py", route)
                self.assertNotIn("/knowledge/scripts/harbor_answer.py", route)
                self.assertRegex(route, r"successful finalizer is terminal")
                self.assertRegex(route, r"(?:do not|never) call another tool")

    def test_cli_requires_floor_and_evidence_clause_in_both_phases(self) -> None:
        for candidate_id, module in self.modules.items():
            for command in ("prepare", "finalize"):
                base = [
                    str(SNAPSHOT),
                    command,
                    "--question-id",
                    "synthetic-contract",
                    "--question",
                    QUESTION,
                ]
                suffix = ["--draft", "-"] if command == "finalize" else []
                with self.subTest(candidate_id=candidate_id, command=command, missing="floor"):
                    with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                        module.build_parser().parse_args(
                            [*base, "--evidence-clause", EVIDENCE_CLAUSE, *suffix]
                        )
                with self.subTest(candidate_id=candidate_id, command=command, missing="clause"):
                    with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                        module.build_parser().parse_args(
                            [*base, "--minimum-sources", "3", *suffix]
                        )

    def test_candidate_trees_are_distinct_and_manifests_are_honest(self) -> None:
        digests = {}
        for candidate_id in CANDIDATE_IDS:
            root = CANDIDATES_ROOT / candidate_id
            manifest = json.loads((root / "candidate-manifest.json").read_text(encoding="utf-8"))
            realization = json.loads((root / "operator-realization.json").read_text(encoding="utf-8"))
            skill_digest = tree_digest(root / "consult-semantic-okf")
            digests[candidate_id] = skill_digest
            self.assertEqual(manifest["generationId"], "generation-002")
            self.assertEqual(manifest["candidateId"], candidate_id)
            self.assertEqual(manifest["operatorId"], OPERATOR_ID)
            self.assertEqual(manifest["parentCandidateId"], "00-baseline")
            self.assertEqual(manifest["parentTreeSha256"], PARENT_DIGEST)
            self.assertEqual(manifest["skill"]["treeSha256"], skill_digest)
            self.assertEqual(realization["parentCandidateId"], "00-baseline")
            self.assertEqual(realization["parentCandidates"][0]["treeSha256"], PARENT_DIGEST)
            self.assertEqual(realization["operatorId"], OPERATOR_ID)
        self.assertNotEqual(digests[CANDIDATE_IDS[0]], digests[CANDIDATE_IDS[1]])

    def test_candidate_bundles_have_no_evaluation_or_floor_literal_leak(self) -> None:
        forbidden = ("q003", "q007", "--minimum-sources 6", "candidate04", "candidate05")
        for candidate_id in CANDIDATE_IDS:
            root = CANDIDATES_ROOT / candidate_id / "consult-semantic-okf"
            text = "\n".join(
                path.read_text(encoding="utf-8", errors="ignore")
                for path in root.rglob("*")
                if path.is_file() and path.suffix in {".md", ".py", ".yaml", ".txt"}
            ).casefold()
            with self.subTest(candidate_id=candidate_id):
                for value in forbidden:
                    self.assertNotIn(value.casefold(), text)


if __name__ == "__main__":
    unittest.main()
