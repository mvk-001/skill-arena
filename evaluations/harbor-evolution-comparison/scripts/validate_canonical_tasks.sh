#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
benchmark_root="$(cd "$script_dir/.." && pwd)"
base_image="harbor-evolver-base:20260716"

if ! docker image inspect "$base_image" >/dev/null 2>&1; then
  docker build -t "$base_image" "$benchmark_root/environment"
fi

validated=0
while IFS= read -r task_config; do
  task_dir="$(dirname "$task_config")"
  relative="${task_dir#"$benchmark_root/subjects/"}"
  tag="harbor-evolver-canonical-$(printf '%s' "$relative" | tr '/_' '--' | tr -cd '[:alnum:].-')"

  docker build -q -t "$tag" -f "$task_dir/environment/Dockerfile" \
    "$task_dir/environment" >/dev/null
  docker run --rm --user root \
    -v "$task_dir/solution:/solution:ro" \
    -v "$task_dir/tests:/tests:ro" \
    "$tag" \
    bash -lc 'bash /solution/solve.sh && bash /tests/test.sh && python3 -c '\''from pathlib import Path; assert abs(float(Path("/logs/verifier/reward.txt").read_text()) - 1.0) < 1e-9'\'''

  printf 'validated %s\n' "$relative"
  validated=$((validated + 1))
done < <(find "$benchmark_root/subjects" -type f -name task.toml | sort)

test "$validated" -eq 9
printf 'validated %d canonical Harbor tasks\n' "$validated"
