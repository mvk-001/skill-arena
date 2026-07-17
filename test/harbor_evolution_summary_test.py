# /// script
# requires-python = ">=3.12"
# dependencies = ["PyYAML>=6,<7"]
# ///
from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = (
    REPO_ROOT / "evaluations" / "harbor-evolution-comparison" / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIR))
SPEC = importlib.util.spec_from_file_location(
    "harbor_evolution_summary", SCRIPTS_DIR / "summarize_results.py"
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load summarize_results.py")
SUMMARY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUMMARY)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


class DigestAndDecisionTests(unittest.TestCase):
    def test_corpus_digest_rejects_content_tamper(self) -> None:
        with tempfile.TemporaryDirectory(prefix="harbor-summary-corpus-") as temporary:
            corpus = Path(temporary) / "development"
            corpus.mkdir()
            task = corpus / "task.toml"
            task.write_text('version = "1"\n', encoding="utf-8")
            expected = SUMMARY.resource_digest(corpus)

            task.write_text('version = "tampered"\n', encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "development corpus digest mismatch"):
                SUMMARY.assert_digest(corpus, expected, "development corpus")

    def test_candidate_digest_rejects_sha_and_size_tamper(self) -> None:
        with tempfile.TemporaryDirectory(prefix="harbor-summary-candidate-") as temporary:
            candidate = Path(temporary) / "candidate"
            candidate.mkdir()
            (candidate / "SKILL.md").write_text("candidate\n", encoding="utf-8")
            expected = SUMMARY.resource_digest(candidate)

            mutations = {
                "sha256": "0" * 64,
                "total_bytes": expected["total_bytes"] + 1,
            }
            for field, value in mutations.items():
                with self.subTest(field=field):
                    tampered = {**expected, field: value}
                    with self.assertRaisesRegex(
                        ValueError, "candidate bundle digest mismatch"
                    ):
                        SUMMARY.assert_digest(candidate, tampered, "candidate bundle")

    def test_candidate_decision_rejects_ineligible_and_wrong_selection(self) -> None:
        source = {"sha256": "source"}
        baseline = {"mean_reward": 0.5, "worst_case_reward": 0.5}
        candidate = {"mean_reward": 0.8, "worst_case_reward": 0.6}
        valid = {
            "candidate": {"sha256": "candidate"},
            "changed_from_baseline": True,
            "score": {"eligible": True},
            "selection": "child",
            "selected_sha256": "candidate",
        }
        self.assertEqual(
            SUMMARY.validate_candidate_decision(
                locked=valid,
                source_digest=source,
                candidate_development=candidate,
                baseline_development=baseline,
                subject="toy",
                strategy="trace",
            ),
            "child",
        )

        mutations = (
            ("eligible", lambda value: value["score"].update(eligible=False), "ineligible"),
            (
                "selection",
                lambda value: value.update(selection="baseline"),
                "violates the protocol order",
            ),
        )
        for label, mutate, message in mutations:
            with self.subTest(label=label):
                tampered = copy.deepcopy(valid)
                mutate(tampered)
                with self.assertRaisesRegex(ValueError, message):
                    SUMMARY.validate_candidate_decision(
                        locked=tampered,
                        source_digest=source,
                        candidate_development=candidate,
                        baseline_development=baseline,
                        subject="toy",
                        strategy="trace",
                    )

    def test_duplicate_physical_job_paths_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "duplicate physical job paths"):
            SUMMARY.assert_unique_jobs(
                [{"job": "jobs/same"}, {"job": "jobs/same"}],
                "Combined physical evidence",
            )


class TrialLockProvenanceTests(unittest.TestCase):
    runtime = {
        "harbor_version": "0.18.0",
        "environment": "docker",
        "attempts_per_task": 1,
        "max_retries": 0,
        "agent": {
            "name": "codex",
            "model_name": "toy-model",
            "kwargs": {"reasoning_effort": "low"},
        },
    }

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="harbor-summary-job-")
        self.root = Path(self.temporary.name)
        self.skill = self.root / "skill"
        self.skill.mkdir()
        (self.skill / "SKILL.md").write_text(
            "---\nname: toy-skill\ndescription: Synthetic test skill.\n---\n",
            encoding="utf-8",
        )
        self.dataset = self.root / "dataset"
        self.task = self.dataset / "toy-task"
        self.task.mkdir(parents=True)
        (self.task / "task.toml").write_text(
            '[environment]\nnetwork_mode = "public"\n', encoding="utf-8"
        )
        self.job = self.root / "job"
        self.trial = self.job / "trial-1"
        self.trial.mkdir(parents=True)
        self.harbor_skill_digest = "sha256:toy-skill"
        self.task_digest = "sha256:toy-task"
        self._write_valid_artifacts()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _skill_lock(self) -> dict[str, str]:
        return {
            "name": "toy-skill",
            "digest": self.harbor_skill_digest,
            "source": self.skill.as_posix(),
        }

    def _task_lock(self) -> dict[str, str]:
        return {
            "name": "toy-task",
            "digest": self.task_digest,
            "path": self.task.as_posix(),
        }

    def _agent_lock(self) -> dict[str, Any]:
        return {
            **self.runtime["agent"],
            "skills": [self.skill.as_posix()],
        }

    def _write_valid_artifacts(self) -> None:
        write_json(
            self.job / "config.json",
            {
                "agents": [self._agent_lock()],
                "datasets": [{"path": self.dataset.as_posix()}],
                "environment": {"type": "docker"},
                "n_attempts": 1,
            },
        )
        write_json(
            self.job / "lock.json",
            {
                "harbor": {"version": "0.18.0"},
                "retry": {"max_retries": 0},
                "trials": [
                    {
                        "skills": [self._skill_lock()],
                        "task": self._task_lock(),
                    }
                ],
            },
        )
        write_json(
            self.job / "result.json",
            {
                "n_total_trials": 1,
                "started_at": "2026-07-16T00:00:00+00:00",
                "finished_at": "2026-07-16T00:00:01+00:00",
                "stats": {
                    "n_completed_trials": 1,
                    "n_errored_trials": 0,
                    "n_retries": 0,
                    "n_running_trials": 0,
                    "n_pending_trials": 0,
                    "n_cancelled_trials": 0,
                    "n_input_tokens": 5,
                    "n_cache_tokens": 1,
                    "n_output_tokens": 2,
                    "cost_usd": 0.01,
                },
            },
        )
        write_json(
            self.trial / "result.json",
            {
                "exception_info": None,
                "verifier_result": {"rewards": {"reward": 1.0}},
                "config": {
                    "agent": self._agent_lock(),
                    "environment": {"type": "docker"},
                },
                "task_id": {"path": self.task.as_posix()},
                "task_name": "toy-task",
                "task_checksum": "result-checksum",
                "agent_result": {
                    "n_input_tokens": 5,
                    "n_cache_tokens": 1,
                    "n_output_tokens": 2,
                    "cost_usd": 0.01,
                },
            },
        )
        write_json(
            self.trial / "lock.json",
            {
                "skills": [self._skill_lock()],
                "agent": self._agent_lock(),
                "environment": {"type": "docker"},
                "task": self._task_lock(),
            },
        )

    def _score(self) -> dict[str, Any]:
        return SUMMARY.job_score(
            self.job,
            expected_trials=1,
            runtime=self.runtime,
            repo_root=self.root,
            expected_skill_sha256=SUMMARY.tree_digest(self.skill)["sha256"],
            expected_skill_path=self.skill,
            expected_harbor_skill_digest=self.harbor_skill_digest,
            expected_logical_skill_name="toy-skill",
            expected_network_mode="public",
            expected_dataset=self.dataset,
        )

    def test_trial_lock_skill_drift_is_rejected(self) -> None:
        self.assertEqual(self._score()["mean_reward"], 1.0)
        trial_lock_path = self.trial / "lock.json"
        trial_lock = SUMMARY.read_json(trial_lock_path)
        trial_lock["skills"][0]["digest"] = "sha256:tampered"
        write_json(trial_lock_path, trial_lock)

        with self.assertRaisesRegex(ValueError, "Trial lock skill provenance mismatch"):
            self._score()

    def test_trial_lock_task_drift_is_rejected(self) -> None:
        trial_lock_path = self.trial / "lock.json"
        trial_lock = SUMMARY.read_json(trial_lock_path)
        trial_lock["task"]["digest"] = "sha256:tampered"
        write_json(trial_lock_path, trial_lock)

        with self.assertRaisesRegex(ValueError, "Trial lock task provenance mismatch"):
            self._score()


if __name__ == "__main__":
    unittest.main()
