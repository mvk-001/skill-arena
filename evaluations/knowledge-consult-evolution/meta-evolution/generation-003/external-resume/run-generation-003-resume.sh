#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/../../../../.." && pwd -P)"
adapter="$script_dir/resume-generation-003.mjs"
engine="$repo_root/skills/harbor-resume-external-failures/scripts/resume_external_failures.py"
runtime="$repo_root/.tmp/knowledge-consult-evolution/meta-evolution/generation-003/resume/q003/contrast-matrix-one-shot-answer-prepared-v3"
config="$runtime/resume-config.json"
attestation="$runtime/remediation-attestation.json"
auth_source="/mnt/c/Users/villa/.pi/agent/auth.json"
auth_mount="/tmp/skill-arena-knowledge-consult-g003-auth"

mode="${1:-live}"
case "$mode" in
  --preflight-only)
    :
    ;;
  --doctor)
    exec node "$adapter" doctor
    ;;
  --dry-run)
    exec node "$adapter" dry-run
    ;;
  --verify)
    exec node "$adapter" verify
    ;;
  live)
    ;;
  *)
    echo "usage: $0 [--verify|--doctor|--dry-run|--preflight-only]" >&2
    exit 64
    ;;
esac

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "generation-003 selective resume must run inside WSL/Linux" >&2
  exit 65
fi
if [[ ! -f "$config" || ! -f "$attestation" ]]; then
  echo "prepare and verify the private generation-003 resume artifacts first" >&2
  exit 66
fi
if [[ ! -f "$auth_source" || -L "$auth_source" ]]; then
  echo "sealed Pi auth source is missing or linked" >&2
  exit 67
fi
if [[ -e "$auth_mount" || -L "$auth_mount" ]]; then
  echo "isolated Pi auth mount already exists; refusing stale state" >&2
  exit 68
fi

node "$adapter" verify >/dev/null
node "$adapter" verify-auth --auth "$auth_source" --attestation "$attestation" >/dev/null

mkdir -m 700 -- "$auth_mount"
cleanup() {
  if [[ "$auth_mount" != "/tmp/skill-arena-knowledge-consult-g003-auth" ]]; then
    echo "refusing unsafe auth cleanup target" >&2
    return 1
  fi
  if [[ -d "$auth_mount" && ! -L "$auth_mount" ]]; then
    rm -rf -- "$auth_mount"
  fi
}
trap cleanup EXIT INT TERM
cp --preserve=timestamps -- "$auth_source" "$auth_mount/auth.json"
chmod 600 -- "$auth_mount/auth.json"

mapfile -t isolated_auth_entries < <(
  find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort
)
if [[ ${#isolated_auth_entries[@]} -ne 1 || "${isolated_auth_entries[0]}" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
node "$adapter" verify-auth --auth "$auth_mount/auth.json" --attestation "$attestation" >/dev/null

if [[ "$mode" == "--preflight-only" ]]; then
  node "$adapter" preflight
  exit 0
fi

# The generic engine performs the sealed domain preflight, reserves the cap,
# creates one new job only for contrast, and stops at the first evaluable retry.
cd -- "$repo_root"
uv run "$engine" "$config"
