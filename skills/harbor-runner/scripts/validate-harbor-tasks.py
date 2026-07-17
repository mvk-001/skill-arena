#!/usr/bin/env python3

import argparse
from pathlib import Path

from harbor.models.task.task import Task


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate local Harbor task directories with Harbor's current models."
    )
    parser.add_argument("task_directories", nargs="+", type=Path)
    args = parser.parse_args()

    validated = 0
    for task_directory in args.task_directories:
        task = Task(task_directory)
        if not Task.is_valid_dir(task_directory):
            raise ValueError(f"Invalid Harbor task directory: {task_directory}")
        print(f"validated {task.name}: {task_directory}")
        validated += 1

    print(f"Validated {validated} Harbor task director{'y' if validated == 1 else 'ies'}.")


if __name__ == "__main__":
    main()
