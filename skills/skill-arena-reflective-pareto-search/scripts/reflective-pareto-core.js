import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function normalizeRun(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Run input must be a JSON object.");
  }

  const benchmarkId = String(input.benchmarkId ?? "").trim();
  if (!benchmarkId) {
    throw new Error("benchmarkId is required.");
  }

  const cases = Array.isArray(input.cases) ? input.cases.map((entry) => ({
    caseId: String(entry?.caseId ?? "").trim(),
    weight: entry?.weight === undefined ? 1 : finiteNumber(entry.weight, `Weight for ${entry?.caseId}`),
  })) : [];
  if (cases.length === 0 || cases.some((entry) => !entry.caseId)) {
    throw new Error("At least one case with a non-empty caseId is required.");
  }
  if (new Set(cases.map((entry) => entry.caseId)).size !== cases.length) {
    throw new Error("caseId values must be unique.");
  }
  if (cases.some((entry) => entry.weight <= 0)) {
    throw new Error("Case weights must be greater than zero.");
  }

  const caseIds = cases.map((entry) => entry.caseId);
  const candidates = Array.isArray(input.candidates) ? input.candidates.map((entry) => {
    const candidateId = String(entry?.candidateId ?? "").trim();
    if (!candidateId) {
      throw new Error("Every candidate requires candidateId.");
    }
    const caseScores = {};
    for (const caseId of caseIds) {
      const score = finiteNumber(entry?.caseScores?.[caseId], `Score ${candidateId}/${caseId}`);
      if (score < 0 || score > 1) {
        throw new Error(`Score ${candidateId}/${caseId} must be in 0..1.`);
      }
      caseScores[caseId] = score;
    }
    const feedback = Array.isArray(entry.feedback) ? entry.feedback.map((item) => {
      const caseId = String(item?.caseId ?? "").trim();
      const diagnosis = String(item?.diagnosis ?? "").trim();
      const evidence = String(item?.evidence ?? "").trim();
      if (!caseIds.includes(caseId) || !diagnosis || !evidence) {
        throw new Error(`Feedback for ${candidateId} requires a declared case, diagnosis, and evidence.`);
      }
      return {
        caseId,
        outcome: item?.outcome === "success" ? "success" : "failure",
        diagnosis,
        evidence,
      };
    }) : [];
    return {
      candidateId,
      parentIds: Array.isArray(entry.parentIds) ? entry.parentIds.map(String).sort() : [],
      caseScores,
      complexityDelta: entry.complexityDelta === undefined
        ? 0
        : finiteNumber(entry.complexityDelta, `complexityDelta for ${candidateId}`),
      evaluationCost: entry.evaluationCost === undefined
        ? caseIds.length
        : finiteNumber(entry.evaluationCost, `evaluationCost for ${candidateId}`),
      feedback,
    };
  }) : [];
  if (candidates.length === 0) {
    throw new Error("At least one candidate is required.");
  }
  if (new Set(candidates.map((entry) => entry.candidateId)).size !== candidates.length) {
    throw new Error("candidateId values must be unique.");
  }
  if (candidates.some((entry) => entry.evaluationCost < 0)) {
    throw new Error("evaluationCost must be nonnegative.");
  }

  return { benchmarkId, cases, candidates };
}

export function dominates(left, right, caseIds) {
  let strictlyBetter = false;
  for (const caseId of caseIds) {
    if (left.caseScores[caseId] < right.caseScores[caseId]) {
      return false;
    }
    strictlyBetter ||= left.caseScores[caseId] > right.caseScores[caseId];
  }
  if (strictlyBetter) {
    return true;
  }
  if (left.complexityDelta !== right.complexityDelta) {
    return left.complexityDelta < right.complexityDelta;
  }
  if (left.evaluationCost !== right.evaluationCost) {
    return left.evaluationCost < right.evaluationCost;
  }
  return left.candidateId.localeCompare(right.candidateId) < 0;
}

function candidateStats(candidate, cases) {
  const scores = cases.map((entry) => candidate.caseScores[entry.caseId]);
  const totalWeight = cases.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedMean = cases.reduce(
    (sum, entry) => sum + candidate.caseScores[entry.caseId] * entry.weight,
    0,
  ) / totalWeight;
  return {
    meanScore: weightedMean,
    worstCaseScore: Math.min(...scores),
  };
}

export function buildParetoArchive(input) {
  const run = normalizeRun(input);
  const caseIds = run.cases.map((entry) => entry.caseId);
  const archiveCandidates = run.candidates.filter((candidate) => !run.candidates.some(
    (other) => other.candidateId !== candidate.candidateId && dominates(other, candidate, caseIds),
  ));

  const bestByCase = Object.fromEntries(caseIds.map((caseId) => [
    caseId,
    Math.max(...archiveCandidates.map((candidate) => candidate.caseScores[caseId])),
  ]));
  const archive = archiveCandidates.map((candidate) => ({
    ...candidate,
    ...candidateStats(candidate, run.cases),
    ownedCases: caseIds.filter((caseId) => candidate.caseScores[caseId] === bestByCase[caseId]),
  })).sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  const robustCandidate = [...archive].sort((left, right) => (
    right.worstCaseScore - left.worstCaseScore
    || right.meanScore - left.meanScore
    || left.complexityDelta - right.complexityDelta
    || left.evaluationCost - right.evaluationCost
    || left.candidateId.localeCompare(right.candidateId)
  ))[0];

  return {
    benchmarkId: run.benchmarkId,
    caseIds,
    evaluatedCandidates: run.candidates.length,
    archiveSize: archive.length,
    bestByCase,
    archive,
    robustCandidateId: robustCandidate.candidateId,
    dominatedCandidateIds: run.candidates
      .filter((candidate) => !archive.some((entry) => entry.candidateId === candidate.candidateId))
      .map((candidate) => candidate.candidateId)
      .sort(),
  };
}

export function planComplementaryMerge(archiveState) {
  const candidates = archiveState.archive;
  let best = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const union = [...new Set([...left.ownedCases, ...right.ownedCases])].sort();
      const overlap = left.ownedCases.filter((caseId) => right.ownedCases.includes(caseId)).length;
      if (union.length <= Math.max(left.ownedCases.length, right.ownedCases.length)) {
        continue;
      }
      const proposal = {
        parentIds: [left.candidateId, right.candidateId],
        coveredCases: union,
        overlap,
        combinedComplexityDelta: left.complexityDelta + right.complexityDelta,
      };
      if (!best
        || proposal.coveredCases.length > best.coveredCases.length
        || (proposal.coveredCases.length === best.coveredCases.length && proposal.overlap < best.overlap)
        || (proposal.coveredCases.length === best.coveredCases.length
          && proposal.overlap === best.overlap
          && proposal.combinedComplexityDelta < best.combinedComplexityDelta)
        || (proposal.coveredCases.length === best.coveredCases.length
          && proposal.overlap === best.overlap
          && proposal.combinedComplexityDelta === best.combinedComplexityDelta
          && proposal.parentIds.join("|").localeCompare(best.parentIds.join("|")) < 0)) {
        best = proposal;
      }
    }
  }
  return best;
}

export function buildReflectionPlan(input) {
  const run = normalizeRun(input);
  const archiveState = buildParetoArchive(run);
  const targetCaseId = [...archiveState.caseIds].sort((left, right) => (
    archiveState.bestByCase[left] - archiveState.bestByCase[right]
    || left.localeCompare(right)
  ))[0];
  const parent = [...archiveState.archive].sort((left, right) => (
    right.caseScores[targetCaseId] - left.caseScores[targetCaseId]
    || left.complexityDelta - right.complexityDelta
    || left.candidateId.localeCompare(right.candidateId)
  ))[0];
  const feedback = parent.feedback.filter((entry) => entry.caseId === targetCaseId);

  return {
    benchmarkId: run.benchmarkId,
    targetCaseId,
    selectedParentId: parent.candidateId,
    currentScore: parent.caseScores[targetCaseId],
    feedback,
    reflectionTask: feedback.length > 0
      ? "Propose one skill-bundle edit that addresses the verified diagnosis without changing the benchmark or weakening other cases."
      : "Collect verified case-local feedback before proposing an edit; do not guess from the scalar score alone.",
    mergePlan: planComplementaryMerge(archiveState),
  };
}

export function parseFlags(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags.set(token.slice(2), true);
    else { flags.set(token.slice(2), next); index += 1; }
  }
  return flags;
}

export function requireFlag(flags, name) {
  const value = flags.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing required flag --${name}`);
  return value;
}

