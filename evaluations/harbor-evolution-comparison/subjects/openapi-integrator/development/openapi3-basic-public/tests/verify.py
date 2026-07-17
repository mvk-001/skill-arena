#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path("/app/deliverables/warehouse-client")
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
    not (ROOT / "warehouse-client").exists(),
    "destination is not nested",
)

skill_text = required[0].read_text(encoding="utf-8") if required[0].is_file() else ""
check(
    "generated skill identity",
    "Warehouse Edge API" in skill_text and "WAREHOUSE_CLIENT_API_KEY" in skill_text,
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
    "probe_health" in listed and "get_bins_binid" in listed,
    "explicit and fallback identifiers are listed",
)

requests: list[dict[str, object]] = []


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        requests.append(
            {
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
            }
        )
        payload = b"{}"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: object) -> None:
        return


cli_ok = False
if client.is_file() and compiled:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = os.environ.copy()
    env["WAREHOUSE_CLIENT_BASE_URL"] = f"http://127.0.0.1:{server.server_port}/v2"
    env["WAREHOUSE_CLIENT_API_KEY"] = "alice:wonder"
    commands = [
        ["python3", str(client), "probe_health"],
        [
            "python3",
            str(client),
            "get_bins_binid",
            "--binId",
            "B-7",
            "--detail",
            "full",
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

check("client invocation", cli_ok and len(requests) == 2, "both operations execute locally")
public = requests[0] if len(requests) > 0 else {}
secure = requests[1] if len(requests) > 1 else {}
public_url = urlsplit(str(public.get("path", "")))
secure_url = urlsplit(str(secure.get("path", "")))
check(
    "anonymous security override",
    public_url.path == "/v2/health" and not public.get("authorization"),
    "health request has no Authorization header",
)
check(
    "path and query substitution",
    secure_url.path == "/v2/bins/B-7"
    and parse_qs(secure_url.query).get("detail") == ["full"],
    "binId and detail reach the local endpoint",
)
check(
    "HTTP Basic mapping",
    secure.get("authorization") == "Basic YWxpY2U6d29uZGVy",
    "username:password is encoded as Basic credentials",
)

passed = sum(1 for _, result, _ in checks if result)
score = passed / len(checks) if checks else 0.0
REWARD.parent.mkdir(parents=True, exist_ok=True)
REWARD.write_text(f"{score:.6f}\n", encoding="utf-8")
print(f"[SUMMARY] {passed}/{len(checks)} checks passed; reward={score:.6f}")
