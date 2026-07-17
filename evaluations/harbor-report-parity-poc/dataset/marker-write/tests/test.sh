#!/usr/bin/env bash
set -euo pipefail

expected="HARBOR-REPORT-PARITY-42"
actual=""
if [[ -f /app/answer.txt ]]; then
  actual="$(tr -d '\r\n' < /app/answer.txt)"
fi

if [[ "$actual" == "$expected" ]]; then
  echo 1 > /logs/verifier/reward.txt
else
  echo 0 > /logs/verifier/reward.txt
fi
