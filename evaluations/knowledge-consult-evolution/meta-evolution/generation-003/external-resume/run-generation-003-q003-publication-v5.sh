#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "usage: $0" >&2
  exit 64
fi

# This append-only wrapper performs only the zero-call q003 V5 publication.
# It never starts Harbor, a model, an agent, Docker, or a verifier.
"/mnt/c/Program Files/nodejs/node.exe" \
  'C:\Users\villa\dev\skill-arena\evaluations\knowledge-consult-evolution\meta-evolution\generation-003\scripts\publish-generation-003-post-agent-v5.js' \
  q003 \
  --runtime 'C:\Users\villa\dev\skill-arena\.tmp\knowledge-consult-evolution\meta-evolution\generation-003'
