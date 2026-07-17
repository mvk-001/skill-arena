#!/usr/bin/env bash
set -euo pipefail

root=/app/deliverables/ledger-relay
mkdir -p "$root/scripts" "$root/references"

cat > "$root/SKILL.md" <<'EOF'
---
name: ledger-relay
description: Generated integration for Ledger Relay API with query API-key authentication and legacy Swagger body support.
---

# Ledger Relay API

Use `scripts/api_client.py` to create and inspect ledger entries.

## Configuration

- `LEDGER_RELAY_BASE_URL` overrides the API base URL.
- `LEDGER_RELAY_API_KEY` supplies the `access_token` query parameter.

## Operations

- `create_entry`: `POST /entries`
- `get_entries_entryid`: `GET /entries/{entryId}`
EOF

cp /app/input/swagger.json "$root/references/openapi.json"

cat > "$root/scripts/api_client.py" <<'PY'
#!/usr/bin/env python3
import argparse
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("LEDGER_RELAY_BASE_URL", "https://ledger.example.test/api/v3")
API_KEY = os.environ.get("LEDGER_RELAY_API_KEY", "")

OPERATIONS = {
    "create_entry": {
        "method": "POST",
        "path": "/entries",
        "path_params": [],
        "query_params": [],
        "has_body": True,
    },
    "get_entries_entryid": {
        "method": "GET",
        "path": "/entries/{entryId}",
        "path_params": ["entryId"],
        "query_params": ["expand"],
        "has_body": False,
    },
}


def execute(operation, values):
    op = OPERATIONS[operation]
    path = op["path"]
    for name in op["path_params"]:
        path = path.replace("{" + name + "}", str(values[name]))
    query = {name: values[name] for name in op["query_params"] if name in values}
    if API_KEY:
        query["access_token"] = API_KEY
    url = BASE_URL.rstrip("/") + "/" + path.lstrip("/")
    if query:
        url += "?" + urlencode(query)
    body = None
    headers = {"Accept": "application/json"}
    if op["has_body"]:
        body = json.dumps(json.loads(values["body"])).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=op["method"])
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--body")
    args, unknown = parser.parse_known_args()
    if args.list:
        for name in OPERATIONS:
            print(name)
        return
    if args.operation not in OPERATIONS:
        parser.error("choose a listed operation")
    values = {"body": args.body} if args.body is not None else {}
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
