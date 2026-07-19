#!/usr/bin/env python3
"""Model-free checks for generation-003 deterministic terminal compilers."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from unittest import mock


sys.dont_write_bytecode = True
GENERATION_ROOT = Path(__file__).resolve().parents[1]
CANDIDATES_ROOT = GENERATION_ROOT / "candidates"
SNAPSHOT = Path(__file__).resolve().parent / "fixtures" / "snapshot"
PARENT_DIGEST = "8e3412afc7690f2862073eb25ea5fa82736fb5b1c9f243585e6df704b850a8a7"
DONOR_DIGEST = "a5b1f39495edc8c17358f38108cf4fdf106ffe7038a646821b067cd3a965f48b"
OPERATOR_ID = "deterministic-terminal-answer-compiler"
QUESTION = (
    "Compare layered architecture with distributed architecture. "
    "How does design origin change architecture, retrieval, and supported tasks?"
)
EVIDENCE_CLAUSE = "Use evidence from at least 3 independent sources."
CANDIDATE_IDS = (
    "extractive-one-shot-answer",
    "contrast-matrix-one-shot-answer",
)
PUBLIC_KEYS = ("question_id", "answer", "evidence")
EVIDENCE_KEYS = (
    "source_id",
    "record_id",
    "concept_path",
    "source_path",
    "record_sha256",
    "locator",
    "text_sha256",
)


def load_candidate(candidate_id: str):
    scripts = CANDIDATES_ROOT / candidate_id / "consult-semantic-okf" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        for name in ("_cross_source", "_consult_semantic_okf"):
            sys.modules.pop(name, None)
        module_name = "g003_harbor_answer_" + candidate_id.replace("-", "_")
        spec = importlib.util.spec_from_file_location(module_name, scripts / "harbor_answer.py")
        if spec is None or spec.loader is None:
            raise RuntimeError(f"cannot load {candidate_id}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(scripts))


def parameters(module) -> dict[str, object]:
    return {
        "facet_limit": 8,
        "per_facet": 2,
        "max_supports": 12,
        "excerpt_chars": 500,
        "evidence_clause": EVIDENCE_CLAUSE,
        "minimum_sources": 3,
        "pack_byte_budget": 16384,
        "strategy": module.STRATEGY,
    }


def tree_digest(root: Path) -> tuple[str, int, int]:
    digest = hashlib.sha256()
    files = [
        item
        for item in root.rglob("*")
        if item.is_file()
        and "__pycache__" not in item.relative_to(root).parts
        and not item.name.endswith(".pyc")
    ]
    files.sort(key=lambda path: path.relative_to(root).as_posix().encode("utf-8"))
    total = 0
    for path in files:
        data = path.read_bytes()
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(relative)
        digest.update(b"\0")
        digest.update(data)
        digest.update(b"\0")
        total += len(data)
    return digest.hexdigest(), len(files), total


def cli_command(candidate_id: str) -> list[str]:
    script = (
        CANDIDATES_ROOT
        / candidate_id
        / "consult-semantic-okf"
        / "scripts"
        / "harbor_answer.py"
    )
    return [
        sys.executable,
        "-B",
        str(script),
        str(SNAPSHOT),
        "answer",
        "--question-id",
        "synthetic-contract",
        "--question",
        QUESTION,
        "--evidence-clause",
        EVIDENCE_CLAUSE,
        "--minimum-sources",
        "3",
        "--facet-limit",
        "8",
        "--per-facet",
        "2",
        "--max-supports",
        "12",
        "--excerpt-chars",
        "500",
        "--pack-byte-budget",
        "16384",
    ]


class GenerationThreeCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.modules = {candidate_id: load_candidate(candidate_id) for candidate_id in CANDIDATE_IDS}
        cls.compiled = {}
        cls.results = {}
        for candidate_id, module in cls.modules.items():
            pack, private = module._compile_support_pack(
                SNAPSHOT, "synthetic-contract", QUESTION, parameters(module)
            )
            cls.compiled[candidate_id] = (pack, private)
            cls.results[candidate_id] = module.answer_one_shot(
                SNAPSHOT, "synthetic-contract", QUESTION, parameters(module)
            )

    def test_one_shot_results_are_deterministic_closed_and_fully_used(self) -> None:
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id):
                result = self.results[candidate_id]
                repeated = module.answer_one_shot(
                    SNAPSHOT, "synthetic-contract", QUESTION, parameters(module)
                )
                self.assertEqual(result, repeated)
                self.assertEqual(tuple(result), PUBLIC_KEYS)
                self.assertEqual(tuple(result["answer"]), ("summary", "claims"))
                self.assertLessEqual(len(result["answer"]["summary"].split()), 450)
                self.assertGreaterEqual(len({row["source_id"] for row in result["evidence"]}), 3)
                first_use: list[int] = []
                for claim in result["answer"]["claims"]:
                    self.assertEqual(tuple(claim), ("statement", "evidence_indices"))
                    self.assertTrue(claim["statement"])
                    for index in claim["evidence_indices"]:
                        self.assertGreaterEqual(index, 0)
                        self.assertLess(index, len(result["evidence"]))
                        if index not in first_use:
                            first_use.append(index)
                self.assertEqual(first_use, list(range(len(result["evidence"]))))
                for row in result["evidence"]:
                    self.assertEqual(tuple(row), EVIDENCE_KEYS)
                    self.assertEqual(row["locator"], {"kind": "record", "target": "record.body"})

    def test_claim_ready_preference_is_verified_and_has_safe_fallback(self) -> None:
        for candidate_id, module in self.modules.items():
            pack, _ = self.compiled[candidate_id]
            with self.subTest(candidate_id=candidate_id, case="preferred"):
                self.assertEqual(pack["selection"]["policy"], "claim-ready-reviewed")
                self.assertIsNone(pack["selection"]["fallback_reason"])
                self.assertEqual(pack["selection"]["claim_ready_records"], 6)
                self.assertEqual(pack["selection"]["claim_ready_authorities"], 6)
            records = copy.deepcopy(module._load_records(SNAPSHOT))
            for record in records:
                record["attributes"] = {"kind": "synthetic"}
            with self.subTest(candidate_id=candidate_id, case="fallback"):
                with mock.patch.object(module, "_load_records", return_value=records):
                    fallback, _ = module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, parameters(module)
                    )
                self.assertEqual(fallback["selection"]["policy"], "all-records-fallback")
                self.assertEqual(
                    fallback["selection"]["fallback_reason"],
                    "insufficient-claim-ready-authorities",
                )
            original_planner = module.plan_bounded_supports
            calls = 0

            def fail_preferred_once(*args, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise module.BreadthPlanningError("synthetic preferred-pool gap")
                return original_planner(*args, **kwargs)

            with self.subTest(candidate_id=candidate_id, case="planning-retry"):
                with mock.patch.object(
                    module, "plan_bounded_supports", side_effect=fail_preferred_once
                ):
                    recovered, _ = module._compile_support_pack(
                        SNAPSHOT, "synthetic-contract", QUESTION, parameters(module)
                    )
                self.assertEqual(calls, 2)
                self.assertEqual(recovered["selection"]["policy"], "all-records-fallback")
                self.assertEqual(
                    recovered["selection"]["fallback_reason"],
                    "claim-ready-planning-failed",
                )

    def test_authority_identity_prevents_source_aliases_from_inflating_breadth(self) -> None:
        for candidate_id, module in self.modules.items():
            records = [
                {
                    "source_id": "alias-a",
                    "record_id": "record-a",
                    "attributes": {"paper_iri": "urn:paper:shared"},
                },
                {
                    "source_id": "alias-b",
                    "record_id": "record-b",
                    "attributes": {"paper_iri": "urn:paper:shared"},
                },
            ]
            ranking = [(0, 2.0), (1, 1.0)]
            with self.subTest(candidate_id=candidate_id):
                with self.assertRaisesRegex(module.BreadthPlanningError, "target sources required"):
                    module.plan_bounded_supports(
                        records,
                        {"dimension-01": ranking},
                        ranking,
                        minimum_sources=2,
                        target_sources=2,
                        max_supports=2,
                    )

    def test_comparison_matrix_is_oriented_and_uses_dimension_text(self) -> None:
        result = self.results["contrast-matrix-one-shot-answer"]
        claims = result["answer"]["claims"]
        self.assertEqual(len(claims), 3)
        expected = (
            ("architecture", "layered components", "distributed architecture separates"),
            ("retrieval", "layered architecture, retrieval", "distributed architecture, retrieval"),
            ("supported tasks", "layered architecture supports tasks", "distributed architecture supports tasks"),
        )
        for claim, (dimension, left, right) in zip(claims, expected, strict=True):
            statement = claim["statement"].casefold()
            self.assertTrue(statement.startswith(dimension))
            self.assertLess(statement.index(left), statement.index(right))
            self.assertEqual(len(claim["evidence_indices"]), 2)
        module = self.modules["contrast-matrix-one-shot-answer"]
        self.assertTrue(
            module._negates_arm(
                {"body": "This design does not construct graphs from documents."},
                "construct graphs from documents",
                "begin from a pre-existing graph",
            )
        )

    def test_incomplete_matrix_falls_back_atomically_to_extractive_closure(self) -> None:
        candidate_id = "contrast-matrix-one-shot-answer"
        module = self.modules[candidate_id]
        pack, private = self.compiled[candidate_id]
        altered = copy.deepcopy(private)
        matrix_groups: dict[str, list[str]] = {}
        for row in pack["dimensions"]:
            matrix_groups.setdefault(row["dimension_text"], []).append(row["dimension_id"])
        failed_pair = next(iter(matrix_groups.values()))
        self.assertEqual(len(failed_pair), 2)
        for record, _ in altered.values():
            scores = record["_dimension_scores"]
            tied = max(float(scores.get(failed_pair[0], 0.0)), float(scores.get(failed_pair[1], 0.0)))
            scores[failed_pair[0]] = tied
            scores[failed_pair[1]] = tied
        draft = module.build_complete_draft(pack, altered)
        self.assertTrue(draft["answer"]["claims"])
        self.assertTrue(all(" — " not in claim["statement"] for claim in draft["answer"]["claims"]))
        result = module.finalize(pack, altered, draft)
        self.assertEqual(tuple(result), PUBLIC_KEYS)

    def test_extractive_and_strict_variants_remain_complementary(self) -> None:
        extractive = self.modules["extractive-one-shot-answer"]
        contrast = self.modules["contrast-matrix-one-shot-answer"]
        body = "\n".join(
            [
                "A bounded statement is directly supported by this record.",
                "line two",
                "line three",
                "line four",
                "line five",
                "line six",
                "line seven",
            ]
        )
        record = {"body": body, "attributes": {}}
        support = {"excerpt": body.splitlines()[0]}
        self.assertEqual(
            extractive._extractive_statement(record, support),
            body.splitlines()[0],
        )
        self.assertIsNone(contrast._strict_statement(record))

    def test_clause_mismatch_fails_before_bundle_access(self) -> None:
        missing = SNAPSHOT / "does-not-exist"
        for candidate_id, module in self.modules.items():
            invalid = parameters(module)
            invalid["minimum_sources"] = 2
            with self.subTest(candidate_id=candidate_id):
                with self.assertRaisesRegex(module.AnswerError, "does not match"):
                    module._compile_support_pack(
                        missing, "synthetic-contract", QUESTION, invalid
                    )

    def test_cli_exposes_only_answer_and_stdout_is_byte_deterministic(self) -> None:
        before = tree_digest(SNAPSHOT)
        for candidate_id, module in self.modules.items():
            with self.subTest(candidate_id=candidate_id, case="stdout"):
                first = subprocess.run(cli_command(candidate_id), capture_output=True, check=False)
                second = subprocess.run(cli_command(candidate_id), capture_output=True, check=False)
                self.assertEqual(first.returncode, 0, first.stderr.decode("utf-8", "replace"))
                self.assertEqual(first.stdout, second.stdout)
                self.assertEqual(tuple(json.loads(first.stdout)), PUBLIC_KEYS)
            for forbidden in ("prepare", "finalize"):
                with self.subTest(candidate_id=candidate_id, case=forbidden):
                    with redirect_stderr(StringIO()):
                        with self.assertRaises(SystemExit):
                            module.build_parser().parse_args([str(SNAPSHOT), forbidden])
        self.assertEqual(tree_digest(SNAPSHOT), before)

    def test_skill_route_is_one_command_terminal_and_stops_on_first_failure(self) -> None:
        for candidate_id in CANDIDATE_IDS:
            skill = (
                CANDIDATES_ROOT / candidate_id / "consult-semantic-okf" / "SKILL.md"
            ).read_text(encoding="utf-8")
            route = skill.split("## General consultation workflow", 1)[0]
            with self.subTest(candidate_id=candidate_id):
                self.assertEqual(route.count("```bash"), 1)
                self.assertEqual(route.count("harbor_answer.py"), 1)
                self.assertEqual(route.count(" answer \\\n"), 1)
                self.assertNotIn("harbor_answer.py\" \"$BUNDLE\" prepare", route)
                self.assertNotIn("harbor_answer.py\" \"$BUNDLE\" finalize", route)
                self.assertIn("Successful stdout is terminal", route)
                self.assertIn("preserve that first failure trace and stop", route)
                self.assertIn("do not retry", route)

    def test_manifests_are_sealed_to_baseline_and_donor_is_diagnostic_only(self) -> None:
        for candidate_id in CANDIDATE_IDS:
            candidate_root = CANDIDATES_ROOT / candidate_id
            bundle = candidate_root / "consult-semantic-okf"
            manifest = json.loads((candidate_root / "candidate-manifest.json").read_text(encoding="utf-8"))
            realization = json.loads((candidate_root / "operator-realization.json").read_text(encoding="utf-8"))
            digest, count, total = tree_digest(bundle)
            with self.subTest(candidate_id=candidate_id):
                self.assertEqual(manifest["parentCandidateId"], "00-baseline")
                self.assertEqual(manifest["parentTreeSha256"], PARENT_DIGEST)
                self.assertEqual(manifest["skill"]["treeSha256"], digest)
                self.assertEqual(manifest["skill"]["fileCount"], count)
                self.assertEqual(manifest["skill"]["totalBytes"], total)
                self.assertEqual(
                    {row["path"] for row in manifest["diffFiles"]},
                    {
                        "SKILL.md",
                        "references/harbor-answer-contract.md",
                        "scripts/_cross_source.py",
                        "scripts/harbor_answer.py",
                    },
                )
                self.assertEqual(realization["parentCandidateId"], "00-baseline")
                self.assertEqual(len(realization["parentCandidates"]), 1)
                self.assertEqual(realization["parentCandidates"][0]["treeSha256"], PARENT_DIGEST)
                donors = realization["donorTraces"]
                self.assertTrue(any(row["candidateTreeSha256"] == DONOR_DIGEST for row in donors))
                self.assertTrue(all(row["relationship"] == "diagnostic-only" for row in donors))
                self.assertEqual(realization["operatorId"], OPERATOR_ID)
                self.assertEqual(realization["candidateTreeSha256"], digest)

    def test_candidate_bundles_contain_no_runtime_residue_or_public_case_literals(self) -> None:
        forbidden = ("q003", "qrels", "grader", "489934516868c0b8bcd5469c2b7c0439")
        for candidate_id in CANDIDATE_IDS:
            bundle = CANDIDATES_ROOT / candidate_id / "consult-semantic-okf"
            paths = [path for path in bundle.rglob("*") if path.is_file()]
            with self.subTest(candidate_id=candidate_id):
                self.assertFalse(any("__pycache__" in path.parts or path.suffix == ".pyc" for path in paths))
                text = "\n".join(
                    path.read_text(encoding="utf-8", errors="ignore") for path in paths
                ).casefold()
                for literal in forbidden:
                    self.assertNotIn(literal, text)


if __name__ == "__main__":
    unittest.main()
