# /// script
# requires-python = ">=3.12"
# dependencies = ["harbor==0.18.0", "pyyaml>=6,<7"]
# ///
"""Inspect exactly one completed Harbor candidate job without executing or ranking."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import harbor_operator_coevolution as operator


def _public_trial(trial: dict[str, Any]) -> dict[str, Any]:
    """Keep dispositions and bindings while excluding all diagnostic/model text."""

    candidate_diagnostic = trial.get("candidateAttributableDiagnostic")
    return {
        "trialName": trial["trialName"],
        "taskName": trial["taskName"],
        "taskChecksum": trial["taskChecksum"],
        "agent": trial["agent"],
        "agentVersion": trial["agentVersion"],
        "model": trial["model"],
        "reportedReward": trial["reportedReward"],
        "missingPrimaryReward": trial["missingPrimaryReward"],
        "score": trial["score"],
        "evaluationAvailable": trial["evaluationAvailable"],
        "candidateAttributableFailure": trial.get(
            "candidateAttributableFailure", False
        ),
        "candidateAttributableDiagnostic": candidate_diagnostic,
        "infrastructureFailure": trial["infrastructureFailure"],
        "infrastructureFailureDomain": trial["infrastructureFailureDomain"],
        "infrastructureFailureDomains": trial["infrastructureFailureDomains"],
        "conflictingDiagnosticDomains": trial["conflictingDiagnosticDomains"],
        "requiredRewards": trial["requiredRewards"],
        "qualificationPassed": trial["qualificationPassed"],
        "qualificationFailures": trial["qualificationFailures"],
        "errorPresent": trial["error"] is not None,
        "retryAuthorized": bool(
            candidate_diagnostic
            and candidate_diagnostic.get("retryAuthorized") is True
        ),
    }


def inspect_candidate(config_path: Path, candidate_id: str) -> dict[str, Any]:
    """Load one immutable job through the operator's exact evidence classifier."""

    config = operator.normalize_config(config_path.resolve(), None)
    matches = [
        candidate
        for candidate in config["candidates"]
        if candidate["candidateId"] == candidate_id
    ]
    if len(matches) != 1:
        raise ValueError(f"Unknown or duplicate candidateId: {candidate_id}")
    candidate = matches[0]
    if candidate["jobConfig"] is not None:
        raise ValueError(
            "Single-candidate diagnostics require an existing jobDirectory; "
            "jobConfig/live execution is forbidden."
        )
    if candidate["jobDirectory"] is None:
        raise ValueError("Selected candidate has no immutable Harbor jobDirectory.")

    evidence = operator.load_candidate_job(
        candidate["jobDirectory"],
        candidate,
        config["harbor"],
        allow_legacy_alias=False,
    )
    return {
        "schemaVersion": 1,
        "mode": "single-candidate-diagnostic-only",
        "source": "harbor-operator-coevolution",
        "generationId": config["generationId"],
        "candidateId": candidate_id,
        "diagnosticPolicy": config["harbor"][
            "candidateAttributableDiagnosticPolicy"
        ],
        "evidence": {
            "candidateId": evidence["candidateId"],
            "skillName": evidence["skillName"],
            "skillDigest": evidence["skillDigest"],
            "lockedSkillName": evidence["lockedSkillName"],
            "identityMode": evidence["identityMode"],
            "promotionEligibleIdentity": evidence["promotionEligibleIdentity"],
            "jobName": evidence["jobName"],
            "harborVersion": evidence["harborVersion"],
            "evaluationProfileDigest": evidence["evaluationProfileDigest"],
            "completedTrials": evidence["completedTrials"],
            "errorCount": evidence["errorCount"],
            "fitnessAvailable": evidence["fitnessAvailable"],
            "rawFitness": evidence["rawFitness"],
            "caseScores": evidence["caseScores"],
            "qualification": evidence["qualification"],
            "fairnessSignature": evidence["fairnessSignature"],
            "trials": [_public_trial(trial) for trial in evidence["trials"]],
        },
        "capabilityBoundaries": {
            "harborExecution": False,
            "otherCandidateJobsOpened": False,
            "holdoutOpened": False,
            "rankingProduced": False,
            "breedingProduced": False,
        },
    }


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--output-file", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        result = inspect_candidate(args.config, args.candidate_id)
        write_exclusive(args.output_file, result)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
    print(
        json.dumps(
            {
                "mode": result["mode"],
                "candidateId": result["candidateId"],
                "completedTrials": result["evidence"]["completedTrials"],
            },
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
    )


if __name__ == "__main__":
    main()
