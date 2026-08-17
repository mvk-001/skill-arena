import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  computeStudyLockBinding,
  findForbiddenSelectedBoundary,
  secureResolveWithinRoot,
  verifyStudy,
} from "../evaluations/harbor-next-skill-comparison/scripts/verify-study.mjs";

const studyRoot = path.resolve("evaluations/harbor-next-skill-comparison");
const protocol = JSON.parse(
  fs.readFileSync(path.join(studyRoot, "protocol.json"), "utf8"),
);
const ledger = JSON.parse(
  fs.readFileSync(
    path.join(studyRoot, "results/20260720/evidence-ledger.json"),
    "utf8",
  ),
);
const studyLock = JSON.parse(
  fs.readFileSync(path.join(studyRoot, "locks/study-lock.json"), "utf8"),
);

function tamper(mutator) {
  const candidateProtocol = structuredClone(protocol);
  const candidateLedger = structuredClone(ledger);
  mutator(candidateProtocol, candidateLedger);
  return verifyStudy({
    protocol: candidateProtocol,
    ledger: candidateLedger,
  }).issues;
}

test("the next-skill snapshot verifies sealed evidence and historical skill bytes", () => {
  const result = verifyStudy();
  assert.deepEqual(result.issues, []);
});

test("the snapshot requires conclusions and future evaluation requirements", () => {
  for (const field of ["conclusions", "futureEvaluationRequirements"]) {
    const issues = tamper((_candidateProtocol, candidateLedger) => {
      delete candidateLedger[field];
    });
    assert.ok(
      issues.some((issue) => issue.includes(`ledger ${field} differ`)),
      `missing ${field} was not rejected: ${issues.join("\n")}`,
    );
  }
});

test("allowed roles and every observation role are frozen development boundaries", () => {
  const issues = tamper((candidateProtocol, candidateLedger) => {
    candidateProtocol.evidenceBoundary.allowedRepositoryEvidenceRoles.push(
      "holdout",
    );
    candidateLedger.repositoryObservations[0].evidenceRole = "holdout";
  });

  assert.ok(
    issues.some((issue) => issue.includes("frozen boundary constants")),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("hec-baseline-development has a non-frozen evidenceRole"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("forbidden evidence role on hec-baseline-development"),
    ),
  );
});

test("fixed bundle, source, and lifecycle mappings reject fabricated history", () => {
  const issues = tamper((candidateProtocol, candidateLedger) => {
    candidateProtocol.comparisonSet.push("harbor-fabricated-history");
    candidateProtocol.newBundleContracts.push({
      bundleId: "harbor-fabricated-history",
      path: "skills/harbor-fabricated-history",
    });
    candidateLedger.sources[0].class = "tracked-repository-result";
    const row = candidateLedger.contractComparison.find(
      (entry) => entry.bundleId === "harbor-population-search",
    );
    row.contractSourceRef = "contract-harbor-run-results";
    row.lifecycleRole =
      "native-harbor-execution-validation-comparison-and-reporting";
  });

  assert.ok(issues.some((issue) => issue.includes("exact fixed nine bundle IDs")));
  assert.ok(issues.some((issue) => issue.includes("new bundle contracts IDs")));
  assert.ok(
    issues.some((issue) =>
      issue.includes("source ref/path/class/hash differs from the frozen contract"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("harbor-population-search has a non-frozen contractSourceRef"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("harbor-population-search has a non-frozen lifecycleRole"),
    ),
  );
});

test("historical compatibility is exact and cannot become performance evidence", () => {
  const realizer = ledger.contractComparison.find(
    (entry) => entry.bundleId === "harbor-realize-skill-candidate",
  );
  const metaskill = ledger.contractComparison.find(
    (entry) => entry.bundleId === "harbor-metaskill-evolution",
  );
  assert.deepEqual(realizer.repositoryObservationRefs, []);
  assert.deepEqual(realizer.historicalCompatibilityRefs, [
    "knowledge-g005-realization-primitives",
  ]);
  assert.deepEqual(metaskill.historicalCompatibilityRefs, [
    "hec-operator-development",
    "knowledge-g006-prospective-protocol",
  ]);

  const issues = tamper((_candidateProtocol, candidateLedger) => {
    const candidateRealizer = candidateLedger.contractComparison.find(
      (entry) => entry.bundleId === "harbor-realize-skill-candidate",
    );
    candidateRealizer.repositoryObservationRefs.push(
      "knowledge-g005-realization-primitives",
    );
    candidateRealizer.historicalCompatibilityRefs = [];

    const primitives = candidateLedger.repositoryObservations.find(
      (entry) => entry.observationId === "knowledge-g005-realization-primitives",
    );
    primitives.sourceRefs.pop();
    primitives.selectors.pop();
  });

  assert.ok(
    issues.some((issue) =>
      issue.includes("harbor-realize-skill-candidate has a non-frozen repositoryObservationRefs"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("harbor-realize-skill-candidate has a non-frozen historicalCompatibilityRefs"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("knowledge-g005-realization-primitives has a non-frozen sourceRefs"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("knowledge-g005-realization-primitives selectors differ"),
    ),
  );
});

test("both new bundle contracts are sealed and cannot be downgraded or rebound", () => {
  assert.deepEqual(
    protocol.newBundleContracts.map(
      ({ bundleId, status, fileCount, totalBytes, treeSha256 }) => ({
        bundleId,
        status,
        fileCount,
        totalBytes,
        treeSha256,
      }),
    ),
    [
      {
        bundleId: "harbor-realize-skill-candidate",
        status: "sealed",
        fileCount: 4,
        totalBytes: 65487,
        treeSha256:
          "f788c14a992e941dd2f5ea3374f48f971bed28d8bc8876d6c19e3f27b0c5ccf2",
      },
      {
        bundleId: "harbor-metaskill-evolution",
        status: "sealed",
        fileCount: 4,
        totalBytes: 91053,
        treeSha256:
          "d467e6538138830feaf97a16eac8fd15774ac51eb78c997e4be11e70135a4804",
      },
    ],
  );

  const downgradeIssues = tamper((candidateProtocol) => {
    candidateProtocol.newBundleContracts[0].status = "not-yet-sealed";
    candidateProtocol.newBundleContracts[0].treeSha256 = null;
  });
  assert.ok(
    downgradeIssues.some((issue) =>
      issue.includes("sealed new bundle contract differs from the frozen seal"),
    ),
  );

  const reboundIssues = tamper((candidateProtocol) => {
    candidateProtocol.newBundleContracts[1].treeSha256 = "0".repeat(64);
  });
  assert.ok(
    reboundIssues.some((issue) =>
      issue.includes("new bundle tree mismatch harbor-metaskill-evolution"),
    ),
  );
});

test("ancestor JSON pointers cannot import nested holdout fields", () => {
  const issues = tamper((_candidateProtocol, candidateLedger) => {
    candidateLedger.repositoryObservations[0].selectors = [
      { pointer: "", expected: {} },
    ];
  });

  assert.ok(
    issues.some((issue) =>
      issue.includes("selectors differ from the exact development-only pointer set"),
    ),
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes("selected value exposes forbidden nested evidence"),
    ),
  );
  assert.match(
    findForbiddenSelectedBoundary({ nested: { selected_holdout_mean: 1 } }),
    /forbidden boundary key/,
  );
});

test("the deterministic lock binding changes when a bound hash is tampered", () => {
  assert.equal(computeStudyLockBinding(studyLock), studyLock.bindingSha256);
  const tamperedLock = structuredClone(studyLock);
  tamperedLock.files[0].sha256 = "0".repeat(64);
  assert.notEqual(
    computeStudyLockBinding(tamperedLock),
    tamperedLock.bindingSha256,
  );
});

test("secure path resolution rejects traversal and reparse-point ancestors", (t) => {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "harbor-next-comparison-path-"),
  );
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));

  const root = path.join(fixture, "root");
  const outside = path.join(fixture, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "evidence.json"), "{}\n", "utf8");

  assert.throws(
    () => secureResolveWithinRoot(root, "../outside/evidence.json"),
    /invalid repository-relative path/,
  );

  const linked = path.join(root, "linked");
  try {
    fs.symlinkSync(
      outside,
      linked,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.diagnostic(`reparse-point assertion skipped: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.throws(
    () => secureResolveWithinRoot(root, "linked/evidence.json"),
    /links, junctions, and reparse-point ancestors are forbidden/,
  );
});
