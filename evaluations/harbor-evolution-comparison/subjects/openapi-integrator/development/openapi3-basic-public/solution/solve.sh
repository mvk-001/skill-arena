#!/usr/bin/env bash
set -euo pipefail

root=/app/deliverables/warehouse-client
mkdir -p "$root/scripts" "$root/references"

cat > "$root/SKILL.md" <<'EOF'
---
name: warehouse-client
description: Generated integration for Warehouse Edge API with anonymous health checks and HTTP Basic protected bin reads.
---

# Warehouse Edge API

Use `scripts/api_client.py` to call the Warehouse Edge API.

## Configuration

- `WAREHOUSE_CLIENT_BASE_URL` overrides the API base URL.
- `WAREHOUSE_CLIENT_API_KEY` supplies `username:password` for HTTP Basic auth.

## Operations

- `probe_health`: public `GET /health`
- `get_bins_binid`: authenticated `GET /bins/{binId}`
EOF

cp /app/input/openapi.json "$root/references/openapi.json"

cat > "$root/scripts/api_client.py" <<'PY'
#!/usr/bin/env python3
import argparse
import base64
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = os.environ.get(
    "WAREHOUSE_CLIENT_BASE_URL", "https://warehouse.example.test/v2"
)
API_KEY = os.environ.get("WAREHOUSE_CLIENT_API_KEY", "")

OPERATIONS = {
    "probe_health": {
        "method": "GET",
        "path": "/health",
        "path_params": [],
        "query_params": [],
        "authenticated": False,
    },
    "get_bins_binid": {
        "method": "GET",
        "path": "/bins/{binId}",
        "path_params": ["binId"],
        "query_params": ["detail"],
        "authenticated": True,
    },
}


def execute(operation, values):
    op = OPERATIONS[operation]
    path = op["path"]
    for name in op["path_params"]:
        path = path.replace("{" + name + "}", str(values[name]))
    query = {name: values[name] for name in op["query_params"] if name in values}
    url = BASE_URL.rstrip("/") + "/" + path.lstrip("/")
    if query:
        url += "?" + urlencode(query)
    headers = {"Accept": "application/json"}
    if op["authenticated"] and API_KEY:
        token = base64.b64encode(API_KEY.encode("utf-8")).decode("ascii")
        headers["Authorization"] = "Basic " + token
    with urlopen(Request(url, headers=headers, method=op["method"]), timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?")
    parser.add_argument("--list", action="store_true")
    args, unknown = parser.parse_known_args()
    if args.list:
        for name in OPERATIONS:
            print(name)
        return
    if args.operation not in OPERATIONS:
        parser.error("choose a listed operation")
    values = {}
    index = 0
    while index < len(unknown):
        key = unknown[index].removeprefix("--")
        values[key] = unknown[index + 1]
        index += 2
    print(json.dumps(execute(args.operation, values), indent=2))


if __name__ == "__main__":
    main()
PY

chmod +x "$root/scripts/api_client.py"
