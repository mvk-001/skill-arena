#!/usr/bin/env bash
set -euo pipefail

root=/app/artifacts/parcel-sdk
mkdir -p "$root/scripts" "$root/references"

cat > "$root/SKILL.md" <<'EOF'
---
name: parcel-sdk
description: Generated integration for Parcel Event API with cookie authentication and referenced OpenAPI inputs.
---

# Parcel Event API

Use `scripts/api_client.py` to list and append parcel events.

## Configuration

- `PARCEL_SDK_BASE_URL` overrides the API base URL.
- `PARCEL_SDK_API_KEY` supplies the `parcel_session` cookie value.

## Operations

- `list_events`: `GET /parcels/{parcelId}/events`
- `append_event`: `POST /parcels/{parcelId}/events`
EOF

cp /app/input/openapi.json "$root/references/openapi.json"

cat > "$root/scripts/api_client.py" <<'PY'
#!/usr/bin/env python3
import argparse
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = os.environ.get("PARCEL_SDK_BASE_URL", "https://parcel.example.test/service")
API_KEY = os.environ.get("PARCEL_SDK_API_KEY", "")

OPERATIONS = {
    "list_events": {
        "method": "GET",
        "path": "/parcels/{parcelId}/events",
        "path_params": ["parcelId"],
        "query_params": ["cursor"],
        "has_body": False,
    },
    "append_event": {
        "method": "POST",
        "path": "/parcels/{parcelId}/events",
        "path_params": ["parcelId"],
        "query_params": [],
        "has_body": True,
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
    if API_KEY:
        headers["Cookie"] = "parcel_session=" + API_KEY
    body = None
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
