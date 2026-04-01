#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "typer>=0.12.3",
# ]
# ///

from __future__ import annotations

import json
from pathlib import Path

import typer

app = typer.Typer(help="Print top hotspots from recursive log analysis JSON.")


def _load_hotspots(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    hotspots = payload.get("hotspots", [])
    if not isinstance(hotspots, list):
        raise ValueError("The 'hotspots' field must be a list.")
    return hotspots


@app.command()
def main(analysis_file: Path, top_k: int = 10) -> None:
    """Print ranked hotspot rows."""
    if top_k < 1:
        raise typer.BadParameter("top_k must be at least 1")
    if not analysis_file.is_file():
        raise typer.BadParameter(f"analysis_file not found: {analysis_file}")

    hotspots = _load_hotspots(analysis_file)
    ranked = sorted(
        hotspots,
        key=lambda item: int(item.get("anomaly_score", 0)),
        reverse=True,
    )

    for index, hotspot in enumerate(ranked[:top_k], start=1):
        line_start = hotspot.get("line_start", "?")
        line_end = hotspot.get("line_end", "?")
        score = hotspot.get("anomaly_score", 0)
        node_id = hotspot.get("id", "unknown")
        preview = str(hotspot.get("preview", "")).replace("\n", " ")
        typer.echo(f"{index:02d}. {node_id} lines={line_start}-{line_end} score={score}")
        typer.echo(f"    {preview[:180]}")


if __name__ == "__main__":
    app()
