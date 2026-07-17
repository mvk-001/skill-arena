#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path("/app/artifacts/parcel-sdk")
SOURCE = Path("/app/input/openapi.json")
REWARD = Path("/logs/verifier/reward.txt")
checks: list[tuple[str, bool, str]] = []


def check(name: str, passed: bool, detail: str) -> None:
    checks.append((name, bool(passed), detail))
    print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")


required = [
    ROOT / "SKILL.md",
    ROOT / "scripts" / "api_client.py",
    ROOT / "references" / "openapi.json",
]
check("exact output layout", all(path.is_file() for path in required), str(ROOT))
check(
    "no duplicated destination directory",
    not (ROOT / "parcel-sdk").exists(),
    "destination is not nested",
)
skill_text = required[0].read_text(encoding="utf-8") if required[0].is_file() else ""
check(
    "generated skill identity",
    "Parcel Event API" in skill_text and "PARCEL_SDK_API_KEY" in skill_text,
    "title and credential variable are documented",
)

reference_matches = False
try:
    reference_matches = json.loads(required[2].read_text(encoding="utf-8")) == json.loads(
        SOURCE.read_text(encoding="utf-8")
    )
except Exception as exc:
    print(f"[DIAG] reference parse failed: {exc}")
check("source reference preserved", reference_matches, "reference is semantically identical")

client = required[1]
compiled = False
listed = ""
if client.is_file():
    compile_run = subprocess.run(
        ["python3", "-m", "py_compile", str(client)],
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    compiled = compile_run.returncode == 0
    if compile_run.stderr:
        print(f"[DIAG] compile stderr: {compile_run.stderr.strip()}")
    list_run = subprocess.run(
        ["python3", str(client), "--list"],
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    listed = list_run.stdout.lower() if list_run.returncode == 0 else ""
    if list_run.stderr:
        print(f"[DIAG] list stderr: {list_run.stderr.strip()}")
check("client syntax", compiled, "python byte-compilation succeeds")
check(
    "operation listing",
    "list_events" in listed and "append_event" in listed,
    "both normalized identifiers are listed",
)

requests: list[dict[str, object]] = []


class Handler(BaseHTTPRequestHandler):
    def _capture(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        requests.append(
            {
                "method": self.command,
                "path": self.path,
                "cookie": self.headers.get("Cookie"),
                "authorization": self.headers.get("Authorization"),
                "body": body,
            }
        )
        payload = b"{}"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        self._capture()

    def do_POST(self) -> None:  # noqa: N802
        self._capture()

    def log_message(self, _format: str, *_args: object) -> None:
        return


cli_ok = False
if client.is_file() and compiled:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = os.environ.copy()
    env["PARCEL_SDK_BASE_URL"] = f"http://127.0.0.1:{server.server_port}/service"
    env["PARCEL_SDK_API_KEY"] = "cookie-value"
    commands = [
        [
            "python3",
            str(client),
            "list_events",
            "--parcelId",
            "P-4",
            "--cursor",
            "C2",
        ],
        [
            "python3",
            str(client),
            "append_event",
            "--parcelId",
            "P-4",
            "--body",
            '{"state": "loaded", "note": "dock"}',
        ],
    ]
    results = [
        subprocess.run(
            command,
            env=env,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        for command in commands
    ]
    cli_ok = all(result.returncode == 0 for result in results)
    for result in results:
        if result.stderr:
            print(f"[DIAG] client stderr: {result.stderr.strip()}")
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)

check("client invocation", cli_ok and len(requests) == 2, "list and append operations execute locally")
listed_request = requests[0] if len(requests) > 0 else {}
appended_request = requests[1] if len(requests) > 1 else {}
listed_url = urlsplit(str(listed_request.get("path", "")))
appended_url = urlsplit(str(appended_request.get("path", "")))
check(
    "referenced path and query parameters",
    listed_url.path == "/service/parcels/P-4/events"
    and parse_qs(listed_url.query).get("cursor") == ["C2"],
    "referenced parcelId and cursor are substituted",
)
cookie_ok = all(
    request.get("cookie") == "parcel_session=cookie-value" for request in requests
)
check("cookie API-key mapping", len(requests) == 2 and cookie_ok, "declared cookie is sent")
body_ok = False
try:
    body_ok = json.loads(bytes(appended_request.get("body", b"")).decode("utf-8")) == {
        "state": "loaded",
        "note": "dock",
    }
except Exception as exc:
    print(f"[DIAG] request body parse failed: {exc}")
check(
    "referenced request body",
    appended_url.path == "/service/parcels/P-4/events" and body_ok,
    "referenced JSON request body is preserved",
)
check(
    "no bearer reinterpretation",
    len(requests) == 2
    and all(not request.get("authorization") for request in requests),
    "Authorization header is absent",
)

passed = sum(1 for _, result, _ in checks if result)
score = passed / len(checks) if checks else 0.0
REWARD.parent.mkdir(parents=True, exist_ok=True)
REWARD.write_text(f"{score:.6f}\n", encoding="utf-8")
print(f"[SUMMARY] {passed}/{len(checks)} checks passed; reward={score:.6f}")
