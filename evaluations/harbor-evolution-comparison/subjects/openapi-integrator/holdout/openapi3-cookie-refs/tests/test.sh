#!/usr/bin/env bash
set -euo pipefail

mkdir -p /logs/verifier
trap 'if [[ ! -f /logs/verifier/reward.txt ]]; then printf "0\n" > /logs/verifier/reward.txt; fi' EXIT
python3 /tests/verify.py
