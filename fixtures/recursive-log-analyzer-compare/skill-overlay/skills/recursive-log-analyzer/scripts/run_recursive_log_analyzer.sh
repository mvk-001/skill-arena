#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/dev/task-queue/scripts/rlm_recursive_log_analyzer.py"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Analyzer script not found: $SCRIPT_PATH" >&2
  exit 1
fi

# Use local Python first to avoid network dependency for uv-managed script deps.
if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_PATH" "$@"
fi

if command -v uv >/dev/null 2>&1; then
  exec uv run --script "$SCRIPT_PATH" "$@"
fi

echo "Neither python3 nor uv is available to run: $SCRIPT_PATH" >&2
exit 1
