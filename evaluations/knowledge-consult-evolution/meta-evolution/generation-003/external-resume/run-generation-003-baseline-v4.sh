#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/readable/auth.json-or-pi-auth-directory" >&2
  exit 64
fi
auth_source="$1"
if [[ -f "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source"
elif [[ -d "$auth_source" && ! -L "$auth_source" ]]; then
  auth_json="$auth_source/auth.json"
else
  echo "auth source must be an ordinary auth.json file or Pi auth directory" >&2
  exit 65
fi
if [[ ! -f "$auth_json" || -L "$auth_json" ]]; then
  echo "auth.json must be an ordinary readable file" >&2
  exit 65
fi
if [[ -e "/mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003/jobs/q003/baseline/knowledge-consult-meta-g003-q003-baseline" ]]; then
  echo "fresh generation-003 baseline job already exists; never overwrite it" >&2
  exit 68
fi

# Both checks are model-free and must pass before the auth mount or Harbor call.
"/mnt/c/Program Files/nodejs/node.exe" \
  'C:\Users\villa\dev\skill-arena\evaluations\knowledge-consult-evolution\meta-evolution\generation-003\scripts\publish-generation-003-post-agent-v4.js' \
  verify-resume \
  --runtime 'C:\Users\villa\dev\skill-arena\.tmp\knowledge-consult-evolution\meta-evolution\generation-003'
node "/mnt/c/Users/villa/dev/skill-arena/evaluations/knowledge-consult-evolution/meta-evolution/generation-003/scripts/prepare-generation-003.js" verify-auth-source --output "/mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003" --auth-source "$auth_json"

auth_mount="/tmp/skill-arena-knowledge-consult-g003-auth"
if [[ -e "$auth_mount" ]]; then
  echo "isolated auth mount must not pre-exist" >&2
  exit 67
fi
mkdir -m 700 -- "$auth_mount"
cleanup() { rm -rf -- "$auth_mount"; }
trap cleanup EXIT INT TERM
install -m 600 -- "$auth_json" "$auth_mount/auth.json"
if [[ "$(find "$auth_mount" -mindepth 1 -maxdepth 1 -printf '%f
' | LC_ALL=C sort)" != "auth.json" ]]; then
  echo "isolated Pi directory must contain exactly auth.json" >&2
  exit 69
fi
actual_image_id="$(docker image inspect --format '{{.Id}}' semantic-okf-harbor-runtime:1.0)"
if [[ "$actual_image_id" != "sha256:1315195dcef58980e6d2620eaa41062ea6edc15c3eb8ed47d42c143be57aded5" ]]; then
  echo "q003 runtime image ID drift" >&2
  exit 70
fi
docker run --pull never --rm --network none --entrypoint /bin/bash   --mount "type=bind,source=$auth_mount,target=/root/.pi/agent"   --mount "type=bind,source=/mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003/prepared-v2/inputs/baseline/consult-semantic-okf,target=/candidate-baseline,readonly"   semantic-okf-harbor-runtime:1.0   -lc 'set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
test -r /candidate-baseline/scripts/runtime_smoke.py
python -B /candidate-baseline/scripts/runtime_smoke.py >/dev/null
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf "%f\n" | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"'"'shellPath'"'"' /root/.pi/agent
tmp_probe="$(mktemp /tmp/g003-baseline-preflight.XXXXXX)"
rm -f "$tmp_probe"
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight'

uvx --from harbor==0.18.0 harbor run --config "/mnt/c/Users/villa/dev/skill-arena/.tmp/knowledge-consult-evolution/meta-evolution/generation-003/prepared-v2/configs/harbor/q003/baseline.yaml" --yes
