# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "PyYAML>=6,<7"]
# ///
"""Materialize one candidate-specific Harbor JobConfig from a frozen template."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml
from harbor.models.job.config import JobConfig


def resolve_local(base: Path, value: Any) -> str:
    path = Path(str(value)).expanduser()
    return str(path.resolve() if path.is_absolute() else (base / path).resolve())


def materialize(
    template_path: Path,
    skill_path: Path,
    job_name: str,
    jobs_dir: Path,
    dataset_path: Path | None = None,
) -> dict[str, Any]:
    raw = yaml.safe_load(template_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Job template must be a mapping: {template_path}")
    base = template_path.resolve().parent
    skill = skill_path.resolve()
    if not (skill / "SKILL.md").is_file():
        raise ValueError(f"Candidate skill has no SKILL.md: {skill}")

    raw["job_name"] = job_name
    raw["jobs_dir"] = str(jobs_dir.resolve())
    raw["quiet"] = True
    agents = raw.get("agents")
    if not isinstance(agents, list) or len(agents) != 1:
        raise ValueError("Comparison jobs require exactly one agent.")
    if not isinstance(agents[0], dict):
        raise ValueError("The Harbor agent entry must be a mapping.")
    agents[0]["skills"] = [str(skill)]

    datasets = raw.get("datasets", [])
    if dataset_path is not None:
        if not isinstance(datasets, list) or len(datasets) != 1:
            raise ValueError("Dataset override requires exactly one dataset entry.")
        datasets[0] = {"path": str(dataset_path.resolve())}
    for dataset in datasets:
        if isinstance(dataset, dict) and dataset.get("path") is not None:
            dataset["path"] = resolve_local(base, dataset["path"])
    for task in raw.get("tasks", []):
        if isinstance(task, dict) and task.get("path") is not None:
            task["path"] = resolve_local(base, task["path"])
    raw["extra_instruction_paths"] = [
        resolve_local(base, value) for value in raw.get("extra_instruction_paths", [])
    ]

    config = JobConfig.model_validate(raw)
    if config.retry.max_retries != 0:
        raise ValueError("Comparison jobs must keep retry.max_retries at zero.")
    return config.model_dump(mode="json", exclude_none=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--skill", type=Path, required=True)
    parser.add_argument("--job-name", required=True)
    parser.add_argument("--jobs-dir", type=Path, required=True)
    parser.add_argument(
        "--dataset-path",
        type=Path,
        help="Override the single dataset path, for a gated holdout release.",
    )
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = materialize(
        args.template.resolve(),
        args.skill.resolve(),
        args.job_name,
        args.jobs_dir.resolve(),
        args.dataset_path.resolve() if args.dataset_path is not None else None,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    print(args.output.resolve())


if __name__ == "__main__":
    main()
