# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "gepa==0.1.2"]
# ///
"""Simulate the Harbor+GEPA lifecycle without Docker, agents, or model calls."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4


def load_target(path: Path):
    spec = importlib.util.spec_from_file_location("harbor_evolve_target", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load target module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeTrialQueue:
    def __init__(self, n_concurrent: int):
        self.n_concurrent = n_concurrent

    def submit(self, config):
        async def execute():
            trial_directory = Path(config.trials_dir) / ("trial-" + uuid4().hex[:8])
            agent_directory = trial_directory / "agent"
            verifier_directory = trial_directory / "verifier"
            agent_directory.mkdir(parents=True)
            verifier_directory.mkdir(parents=True)
            skill_directory = Path(config.agent.skills[0])
            candidate = (skill_directory / "SKILL.md").read_text(encoding="utf-8")
            reward = 1.0 if "Improved behavior" in candidate else 0.0
            (agent_directory / "trajectory.json").write_text(
                json.dumps({"candidateImproved": reward == 1.0}),
                encoding="utf-8",
            )
            (agent_directory / "codex.txt").write_text(
                "simulated output",
                encoding="utf-8",
            )
            (verifier_directory / "test-output.txt").write_text(
                "simulated verifier feedback",
                encoding="utf-8",
            )
            return SimpleNamespace(
                verifier_result=SimpleNamespace(rewards={"reward": reward}),
                exception_info=None,
            )

        return execute()


class FakeGepaResult:
    def __init__(self, candidate: str, run_directory: str):
        self.best_candidate = candidate
        self.num_candidates = 2
        self.total_metric_calls = 2
        self.best_idx = 1
        self.val_aggregate_scores = [0.0, 1.0]
        self.run_dir = run_directory


def main() -> None:
    module = load_target(Path(sys.argv[1]).resolve())
    with tempfile.TemporaryDirectory(prefix="harbor-evolve-simulation-") as raw_temp:
        root = Path(raw_temp)
        baseline = root / "baseline"
        baseline.mkdir()
        baseline_text = (
            "---\n"
            "name: simulation-skill\n"
            "description: Guide the simulated task.\n"
            "---\n\n"
            "# Simulation Skill\n\n"
            "Use the baseline behavior.\n"
        )
        candidate_text = baseline_text.replace(
            "Use the baseline behavior.",
            "Improved behavior: verify the requested artifact before finishing.",
        )
        (baseline / "SKILL.md").write_text(baseline_text, encoding="utf-8")
        (baseline / "reference.txt").write_text(
            "preserved resource\n", encoding="utf-8"
        )

        task_paths = {}
        for split in ("train", "validation", "holdout"):
            task_path = root / split
            task_path.mkdir()
            task_paths[split] = module.HarborTaskExample(
                task_id=split,
                task_name="simulation/" + split,
                path=task_path,
                digest="sha256:" + split,
            )

        output = root / "run"
        config = {
            "id": "simulated-harbor-evolution",
            "objective": "Improve the skill.",
            "background": "Simulation only.",
            "baselineSkill": baseline,
            "baselineText": baseline_text,
            "skillName": "simulation-skill",
            "outputDirectory": output,
            "splits": {
                "train": [task_paths["train"]],
                "validation": [task_paths["validation"]],
                "holdout": [task_paths["holdout"]],
            },
            "harbor": {
                "agentName": "codex",
                "modelName": "openai/simulated",
                "agentKwargs": {},
                "environment": "docker",
                "concurrency": 2,
                "rewardKey": "reward",
                "requiredEnv": [],
                "holdoutAttempts": 2,
            },
            "gepa": {
                "maxMetricCalls": 4,
                "maxCandidateProposals": 1,
                "reflectionMinibatchSize": 1,
                "reflectionModel": "openai/simulated",
                "seed": 0,
            },
            "promotion": {
                "minimumMeanGain": 0,
                "allowTaskRegressions": False,
                "requireNoErrors": True,
            },
        }

        def fake_optimize_anything(*, seed_candidate, evaluator, dataset, config, **_):
            run_directory = Path(config.engine.run_dir)
            run_directory.mkdir(parents=True)
            asyncio.run(evaluator(seed_candidate, dataset[0]))
            asyncio.run(evaluator(candidate_text, dataset[0]))
            return FakeGepaResult(candidate_text, str(run_directory))

        module.TrialQueue = FakeTrialQueue
        module.optimize_anything = fake_optimize_anything
        result = module.run_evolution(config)

        assert result["holdout"]["promoted"] is True
        assert result["holdout"]["baselineMeanReward"] == 0.0
        assert result["holdout"]["candidateMeanReward"] == 1.0
        assert len(result["holdoutTrials"]["baseline"]) == 2
        assert len(result["holdoutTrials"]["candidate"]) == 2
        assert (baseline / "SKILL.md").read_text(encoding="utf-8") == baseline_text
        assert (output / "candidate-skill" / "reference.txt").read_text(
            encoding="utf-8"
        ) == "preserved resource\n"
        assert (output / "report.md").is_file()
        assert (output / "run.json").is_file()
        print(
            json.dumps(
                {
                    "decision": "promote",
                    "developmentTrials": len(
                        list((output / "harbor-trials" / "development").iterdir())
                    ),
                    "holdoutBaselineTrials": len(result["holdoutTrials"]["baseline"]),
                    "holdoutCandidateTrials": len(result["holdoutTrials"]["candidate"]),
                }
            )
        )


if __name__ == "__main__":
    main()
