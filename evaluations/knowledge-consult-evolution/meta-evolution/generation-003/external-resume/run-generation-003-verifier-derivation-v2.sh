#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/../../../../.." && pwd -P)"
builder="$repo_root/skills/harbor-resume-external-failures/scripts/complete_verifier_derivation_v2.py"
contract="$script_dir/post-agent-derivation-v2-contract.json"

mode="${1:-live}"
case "$mode" in
  --doctor|--dry-run|--verify|live)
    ;;
  *)
    echo "usage: $0 [--doctor|--dry-run|--verify]" >&2
    exit 64
    ;;
esac

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "generation-003 verifier derivation V2 must run inside WSL/Linux" >&2
  exit 65
fi
if [[ ! -f "$builder" || -L "$builder" || ! -f "$contract" || -L "$contract" ]]; then
  echo "sealed derivation V2 inputs are missing or linked" >&2
  exit 66
fi

cd -- "$repo_root"
if [[ "$mode" == "live" ]]; then
  exec uv run --offline --frozen "$builder" "$contract"
fi
exec uv run --offline --frozen "$builder" "$contract" "$mode"
