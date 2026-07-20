# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "pyyaml>=6,<7"]
# ///
"""Publish deterministic development diagnostics without evolutionary decisions."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from importlib.metadata import version
from pathlib import Path
from typing import Any

import harbor_operator_coevolution as operator
import yaml


def _host_path(value: Any, base: Path) -> Any:
    if not isinstance(value, str):
        return value
    match = re.fullmatch(r"/mnt/([a-zA-Z])(?:/(.*))?", value)
    if os.name == "nt" and match:
        suffix = (match.group(2) or "").replace("/", "\\")
        return f"{match.group(1).upper()}:\\{suffix}"
    path = Path(value)
    return str(path if path.is_absolute() else (base / path).resolve())


def _normalize_config(
    config_path: Path, output_override: Path | None
) -> dict[str, Any]:
    """Translate sealed WSL paths when report projection runs on Windows."""

    config_path = config_path.resolve()
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Generation config root must be a mapping.")
    base = config_path.parent
    evolution = raw.get("evolution", {})
    if "outputDir" in evolution:
        evolution["outputDir"] = _host_path(evolution["outputDir"], base)
    if evolution.get("previousGenerationLog") is not None:
        evolution["previousGenerationLog"] = _host_path(
            evolution["previousGenerationLog"], base
        )
    for candidate in raw.get("candidates", []):
        for key in ("skill", "jobConfig", "jobDirectory"):
            if candidate.get(key) is not None:
                candidate[key] = _host_path(candidate[key], base)
    for side in ("baseline", "candidate"):
        reference = raw.get("holdout", {}).get(side, {})
        for key in ("jobConfig", "jobDirectory"):
            if reference.get(key) is not None:
                reference[key] = _host_path(reference[key], base)
    with tempfile.TemporaryDirectory(prefix="harbor-report-only-") as temporary:
        portable_config = Path(temporary) / "generation.yaml"
        portable_config.write_text(
            yaml.safe_dump(raw, sort_keys=False), encoding="utf-8"
        )
        return operator.normalize_config(portable_config, output_override)


def _render_report(
    config: dict[str, Any],
    candidates: dict[str, Any],
    operators: dict[str, Any],
) -> str:
    top = candidates["ranking"][0] if candidates["ranking"] else None
    return "\n".join(
        [
            f"# Harbor Operator Diagnostic Report: {config['generationId']}",
            "",
            "Decision: **REPORT ONLY**",
            "",
            "## Development evidence",
            "",
            f"- Deterministic top-ranked candidate: `{top['candidateId']}`"
            if top is not None
            else "- Deterministic top-ranked candidate: none",
            "- Candidate survivors: none",
            "- Operator survivors: none",
            "- Candidate fitness awarded: false",
            "- Operator credit awarded: false",
            "- Breeding produced: false",
            "- Holdout opened: false",
            "- Promotion: false",
            "- Chain eligible: false",
            "",
            "The ranking is diagnostic evidence only. This mode cannot execute Harbor, "
            "select survivors, award credit, breed operators, open holdout jobs, or "
            "promote a candidate.",
            "",
        ]
    )


def run_report(config_path: Path, output_override: Path | None) -> dict[str, Any]:
    """Analyze immutable development jobs through the canonical classifier."""

    config = _normalize_config(config_path, output_override)
    operator.prepare_output_directory(config["outputDirectory"])

    # Classification still reads every structured verifier diagnostic, while the
    # zero excerpt limit prevents report-only analysis from loading model text.
    config["harbor"]["diagnosticChars"] = 0
    paths = operator.resolve_development_jobs(config, analyze_only=True)
    development = [
        operator.load_candidate_job(
            paths[candidate["candidateId"]],
            candidate,
            config["harbor"],
            allow_legacy_alias=True,
        )
        for candidate in config["candidates"]
    ]
    operator.validate_fair_jobs(development, "development")
    evidence_by_id = {item["candidateId"]: item for item in development}
    candidate_ranking, operator_ranking = operator.rank_generation(
        config,
        evidence_by_id,
        allow_incomplete_operator_population=True,
    )

    # Preserve the deterministic ranking and raw diagnostics, but explicitly
    # remove every evolutionary decision from this capability.
    candidate_ranking["survivors"] = []
    candidate_ranking["diagnosticOnly"] = True
    candidate_ranking["fitnessAwarded"] = False
    candidate_ranking["reportOnly"] = True
    operator_ranking["survivors"] = []
    operator_ranking["diagnosticOnly"] = True
    operator_ranking["creditAwarded"] = False
    operator_ranking["reportOnly"] = True

    breeding = {
        "schemaVersion": 1,
        "sourceGenerationId": config["generationId"],
        "diagnosticOnly": True,
        "reportOnly": True,
        "chainEligible": False,
        "operatorCount": 0,
        "operators": [],
        "reason": "diagnostic-report-only",
    }
    holdout = operator.unopened_holdout_artifact(
        reason="diagnostic-report-only",
        selected_candidate=None,
        diagnostic_only=True,
    )
    holdout["reportOnly"] = True
    profile = operator.build_development_evolution_profile(config, development)
    operator.validate_previous_generation_profile(
        config,
        profile,
        development_evidence=development,
        development_only=True,
    )
    evidence_identity = operator.development_evidence_identity(
        config, development
    )
    evidence = {
        "schemaVersion": 1,
        "source": "harbor",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generationId": config["generationId"],
        "phase": "development",
        "requestedPhase": "diagnostic-report-only",
        "diagnosticOnly": True,
        "reportOnly": True,
        "rewardKey": config["harbor"]["rewardKey"],
        "requiredRewardThresholds": config["harbor"]["requiredRewards"],
        "exploratory": any(item["exploratory"] for item in development),
        "development": [operator.public_evidence(item) for item in development],
        "holdout": [],
        "holdoutOpened": False,
    }
    policy = config["harbor"]["candidateAttributableDiagnosticPolicy"]
    if policy["contracts"]:
        evidence["candidateAttributableDiagnosticPolicy"] = policy
        evidence["candidateAttributableDiagnosticSummary"] = {
            "development": operator.candidate_attributable_diagnostic_summary(
                development
            ),
            "holdout": {"matchedTrials": 0, "contracts": {}},
        }

    log = {
        "schemaVersion": 1,
        "source": "harbor-operator-coevolution",
        "harborVersion": version("harbor"),
        "evolutionId": config["id"],
        "generation": config["generation"],
        "generationId": config["generationId"],
        "phase": "development",
        "requestedPhase": "diagnostic-report-only",
        "decision": "development-reported",
        "diagnosticOnly": True,
        "reportOnly": True,
        "chainEligible": False,
        "holdoutOpened": False,
        "promotion": False,
        "selectedDevelopment": None,
        "developmentEvidenceIdentity": evidence_identity,
        "developmentEvidenceIdentityDigest": operator.stable_digest(
            evidence_identity
        ),
        "candidateRanking": candidate_ranking,
        "operatorRanking": operator_ranking,
        "breedingPlan": breeding,
        "repairPlan": None,
        "holdoutPromotion": holdout,
        "holdoutUsedForDevelopmentSelection": False,
        "exploratory": evidence["exploratory"],
        "evolutionProfile": profile,
        "evolutionProfileDigest": operator.stable_digest(profile),
    }
    log["generationSeal"] = operator.stable_digest(
        operator.generation_seal_payload(log)
    )

    output = config["outputDirectory"]
    operator.write_json(output / operator.OUTPUT_FILES["evidence"], evidence)
    operator.write_json(
        output / operator.OUTPUT_FILES["candidates"], candidate_ranking
    )
    operator.write_json(
        output / operator.OUTPUT_FILES["operators"], operator_ranking
    )
    operator.write_json(output / operator.OUTPUT_FILES["breeding"], breeding)
    operator.write_json(output / operator.OUTPUT_FILES["holdout"], holdout)
    operator.write_json(output / operator.OUTPUT_FILES["log"], log)
    (output / operator.OUTPUT_FILES["report"]).write_text(
        _render_report(config, candidate_ranking, operator_ranking),
        encoding="utf-8",
    )
    return {
        "mode": "analyze-only",
        "phase": "development",
        "requestedPhase": "diagnostic-report-only",
        "decision": "development-reported",
        "diagnosticOnly": True,
        "reportOnly": True,
        "chainEligible": False,
        "holdoutOpened": False,
        "promotion": False,
        "topCandidate": (
            candidate_ranking["ranking"][0]["candidateId"]
            if candidate_ranking["ranking"]
            else None
        ),
        "topOperator": (
            operator_ranking["ranking"][0]["operatorId"]
            if operator_ranking["ranking"]
            else None
        ),
        "outputDirectory": str(output),
        "log": str(output / operator.OUTPUT_FILES["log"]),
        "report": str(output / operator.OUTPUT_FILES["report"]),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        result = run_report(args.config, args.output_dir)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
