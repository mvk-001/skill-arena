#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


EXPECTED_FAMILY_COUNT = 31
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
COVERAGE_MANIFEST = SKILL_DIR / "references" / "diagram-family-coverage.json"
SOURCE_DIR = SKILL_DIR / "assets" / "examples" / "mermaid"
BY_TYPE_DIR = SKILL_DIR / "assets" / "examples" / "mermaid-animation-directives" / "by-type"
BY_TYPE_MANIFEST = BY_TYPE_DIR / "manifest.json"
ERROR_CLASSES = {"error-icon", "error-text"}
MERMAID_FENCE_RE = re.compile(r"```mermaid\s*\n(?P<body>.*?)```", re.DOTALL)
EXPECTED_ARIA_ROLES = {
    "flowchart": "flowchart-v2",
    "swimlane": "swimlane",
    "sequence": "sequence",
    "class": "class",
    "state": "stateDiagram",
    "entity-relationship": "er",
    "journey": "journey",
    "gantt": "gantt",
    "pie": "pie",
    "quadrant": "quadrantChart",
    "requirement": "requirement",
    "gitgraph": "gitGraph",
    "c4": "c4",
    "mindmap": "mindmap",
    "timeline": "timeline",
    "zenuml": "zenuml",
    "sankey": "sankey",
    "xychart": "xychart",
    "block": "block",
    "packet": "packet",
    "kanban": "kanban",
    "architecture": "architecture",
    "radar": "radar",
    "event-modeling": "eventmodeling",
    "treemap": "treemap",
    "venn": "venn",
    "ishikawa": "ishikawa",
    "wardley": "wardley-beta",
    "cynefin": "cynefin",
    "tree-view": "treeView",
    "railroad": "railroad",
}


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_text(text: str) -> str:
    return text.replace("\r\n", "\n").strip()


def first_declaration(source: str) -> str:
    lines = source.replace("\r\n", "\n").splitlines()
    index = 0
    if lines and lines[0].strip() == "---":
        index = 1
        while index < len(lines) and lines[index].strip() != "---":
            index += 1
        index += 1
    for line in lines[index:]:
        stripped = line.strip()
        if stripped and not stripped.startswith("%%"):
            return stripped.split()[0].rstrip(":")
    return "unknown"


def class_tokens(element: ET.Element) -> set[str]:
    return {token for token in element.get("class", "").split() if token}


def validate_svg(path: Path, *, animated: bool, expected_role: str) -> list[str]:
    findings: list[str] = []
    if not path.is_file() or path.stat().st_size < 100:
        return [f"missing or too-small SVG: {path.name}"]
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as error:
        return [f"invalid XML in {path.name}: {error}"]
    if not root.tag.endswith("svg"):
        findings.append(f"{path.name} root must be svg")
    if root.get("aria-roledescription", "").lower() == "error":
        findings.append(f"{path.name} is a Mermaid error SVG")
    if root.get("aria-roledescription") != expected_role:
        findings.append(
            f"{path.name} aria-roledescription is {root.get('aria-roledescription')!r}, expected {expected_role!r}"
        )
    if any(class_tokens(element) & ERROR_CLASSES for element in root.iter()):
        findings.append(f"{path.name} contains Mermaid error classes")
    if animated:
        if root.get("data-animated-mermaid") != "true":
            findings.append(f"{path.name} is missing data-animated-mermaid=true")
        try:
            element_count = int(root.get("data-element-count", "0"))
        except ValueError:
            element_count = 0
        if element_count <= 0:
            findings.append(f"{path.name} must animate at least one element")
    return findings


def expected_generated_source(family: dict[str, object]) -> str:
    return (
        ".agents/skills/mermaid-animated-svg/assets/examples/mermaid/"
        f"{family['source']}.mmd"
    )


def expected_directive_source(family: dict[str, object]) -> str:
    return (
        ".agents/skills/mermaid-animated-svg/assets/examples/"
        f"mermaid-animation-directives/by-type/{family['directiveSlug']}.mmd"
    )


def validate_family(
    family: dict[str, object],
    generated_entry: dict[str, object] | None,
) -> list[str]:
    findings: list[str] = []
    family_id = str(family["id"])
    source_name = str(family["source"])
    slug = str(family["directiveSlug"])
    source_path = SOURCE_DIR / f"{source_name}.mmd"
    markdown_path = SOURCE_DIR / f"{source_name}.md"
    directive_path = BY_TYPE_DIR / f"{slug}.mmd"
    static_path = BY_TYPE_DIR / f"{slug}.static.svg"
    animated_path = BY_TYPE_DIR / f"{slug}.animated.svg"

    if not source_path.is_file():
        findings.append(f"missing canonical source {source_path.name}")
        source_text = ""
    else:
        source_text = source_path.read_text(encoding="utf-8")
        declaration = first_declaration(source_text)
        if declaration != family["sourceDeclaration"]:
            findings.append(
                f"source declaration is {declaration!r}, expected {family['sourceDeclaration']!r}"
            )
        declarations = family.get("declarations")
        if not isinstance(declarations, list) or declaration not in declarations:
            findings.append(f"source declaration {declaration!r} is not in the accepted declaration list")

    if not markdown_path.is_file():
        findings.append(f"missing canonical Markdown wrapper {markdown_path.name}")
    else:
        matches = list(MERMAID_FENCE_RE.finditer(markdown_path.read_text(encoding="utf-8")))
        if len(matches) != 1:
            findings.append(f"{markdown_path.name} must contain exactly one Mermaid fence")
        elif source_text and normalized_text(matches[0].group("body")) != normalized_text(source_text):
            findings.append(f"{markdown_path.name} Mermaid fence differs from {source_path.name}")

    if not directive_path.is_file():
        findings.append(f"missing generated directive source {directive_path.name}")
    else:
        directive_text = directive_path.read_text(encoding="utf-8")
        if source_text and not normalized_text(directive_text).startswith(normalized_text(source_text)):
            findings.append(f"{directive_path.name} does not preserve the canonical source prefix")
        if "%% Directive critique:" not in directive_text:
            findings.append(f"{directive_path.name} is missing its directive critique")
        if "%% @animate v1" not in directive_text:
            findings.append(f"{directive_path.name} is missing the v1 animation directive")

    if generated_entry is None:
        findings.append("missing generated manifest entry")
    else:
        expected_fields = {
            "family": family_id,
            "type": family["label"],
            "slug": slug,
            "source": expected_generated_source(family),
            "directiveSource": expected_directive_source(family),
        }
        for field, expected in expected_fields.items():
            if generated_entry.get(field) != expected:
                findings.append(
                    f"generated manifest {field} is {generated_entry.get(field)!r}, expected {expected!r}"
                )
        if not isinstance(generated_entry.get("critique"), str) or not generated_entry["critique"].strip():
            findings.append("generated manifest critique must be non-empty")

    expected_role = EXPECTED_ARIA_ROLES.get(family_id)
    if expected_role is None:
        findings.append("family has no frozen aria-roledescription contract")
    else:
        findings.extend(validate_svg(static_path, animated=False, expected_role=expected_role))
        findings.extend(validate_svg(animated_path, animated=True, expected_role=expected_role))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate exact Mermaid 11.16.0 family coverage across canonical and generated assets."
    )
    parser.add_argument("--report", type=Path, help="Write the validation report as JSON.")
    args = parser.parse_args()

    findings: list[str] = []
    manifest = load_json(COVERAGE_MANIFEST)
    if not isinstance(manifest, dict):
        raise ValueError("Coverage manifest must be a JSON object.")
    families = manifest.get("families")
    if not isinstance(families, list):
        raise ValueError("Coverage manifest families must be a list.")
    if manifest.get("requiredFamilyCount") != EXPECTED_FAMILY_COUNT:
        findings.append(f"requiredFamilyCount must be {EXPECTED_FAMILY_COUNT}")
    if len(families) != EXPECTED_FAMILY_COUNT:
        findings.append(f"coverage manifest must contain exactly {EXPECTED_FAMILY_COUNT} families")

    family_ids = [str(family.get("id")) for family in families if isinstance(family, dict)]
    family_labels = [str(family.get("label")) for family in families if isinstance(family, dict)]
    for field, values in (("family id", family_ids), ("family label", family_labels)):
        duplicates = sorted(value for value, count in Counter(values).items() if count > 1)
        if duplicates:
            findings.append(f"duplicate {field}s: {', '.join(duplicates)}")
    missing_role_contracts = sorted(set(family_ids) - set(EXPECTED_ARIA_ROLES))
    unexpected_role_contracts = sorted(set(EXPECTED_ARIA_ROLES) - set(family_ids))
    if missing_role_contracts:
        findings.append(f"missing aria-roledescription contracts: {', '.join(missing_role_contracts)}")
    if unexpected_role_contracts:
        findings.append(f"unexpected aria-roledescription contracts: {', '.join(unexpected_role_contracts)}")

    if not BY_TYPE_MANIFEST.is_file():
        generated_entries: list[dict[str, object]] = []
        findings.append("generated by-type manifest is missing")
    else:
        loaded_entries = load_json(BY_TYPE_MANIFEST)
        generated_entries = (
            [entry for entry in loaded_entries if isinstance(entry, dict)]
            if isinstance(loaded_entries, list)
            else []
        )
        if len(generated_entries) != EXPECTED_FAMILY_COUNT:
            findings.append(f"generated manifest must contain exactly {EXPECTED_FAMILY_COUNT} entries")

    generated_ids = [str(entry.get("family")) for entry in generated_entries]
    duplicate_generated_ids = sorted(
        value for value, count in Counter(generated_ids).items() if count > 1
    )
    if duplicate_generated_ids:
        findings.append(f"duplicate generated family ids: {', '.join(duplicate_generated_ids)}")
    generated_by_family = {str(entry.get("family")): entry for entry in generated_entries}
    expected_ids = set(family_ids)
    actual_ids = set(generated_by_family)
    missing_ids = sorted(expected_ids - actual_ids)
    unexpected_ids = sorted(actual_ids - expected_ids)
    if missing_ids:
        findings.append(f"generated manifest missing families: {', '.join(missing_ids)}")
    if unexpected_ids:
        findings.append(f"generated manifest has unexpected families: {', '.join(unexpected_ids)}")

    expected_slugs = {str(family["directiveSlug"]) for family in families}
    asset_sets = {
        "directive mmd": {path.stem for path in BY_TYPE_DIR.glob("*.mmd")},
        "static svg": {
            path.name.removesuffix(".static.svg") for path in BY_TYPE_DIR.glob("*.static.svg")
        },
        "animated svg": {
            path.name.removesuffix(".animated.svg") for path in BY_TYPE_DIR.glob("*.animated.svg")
        },
    }
    exact_asset_sets = True
    for label, actual in asset_sets.items():
        missing = sorted(expected_slugs - actual)
        unexpected = sorted(actual - expected_slugs)
        if missing:
            exact_asset_sets = False
            findings.append(f"{label} missing slugs: {', '.join(missing)}")
        if unexpected:
            exact_asset_sets = False
            findings.append(f"{label} has unexpected slugs: {', '.join(unexpected)}")

    family_results: list[dict[str, object]] = []
    for family in families:
        if not isinstance(family, dict):
            findings.append("each family entry must be an object")
            continue
        family_findings = validate_family(family, generated_by_family.get(str(family["id"])))
        family_results.append(
            {
                "id": family["id"],
                "label": family["label"],
                "source": family["source"],
                "directiveSlug": family["directiveSlug"],
                "covered": not family_findings,
                "findings": family_findings,
            }
        )
        findings.extend(f"{family['id']}: {finding}" for finding in family_findings)

    covered_count = sum(1 for result in family_results if result["covered"])
    coverage_percent = round(100.0 * covered_count / EXPECTED_FAMILY_COUNT, 2)
    report = {
        "ok": not findings and covered_count == EXPECTED_FAMILY_COUNT and exact_asset_sets,
        "mermaidVersion": manifest.get("mermaidVersion"),
        "requiredFamilyCount": EXPECTED_FAMILY_COUNT,
        "coveredFamilyCount": covered_count,
        "coveragePercent": coverage_percent,
        "exactAssetSets": exact_asset_sets,
        "missingFamilies": missing_ids,
        "unexpectedFamilies": unexpected_ids,
        "families": family_results,
        "findings": findings,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
