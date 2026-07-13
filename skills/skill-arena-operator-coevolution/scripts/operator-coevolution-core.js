import fs from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function numberInUnitInterval(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number in 0..1.`);
  }
  return value;
}

export function normalizeGeneration(input) {
  if (!input || typeof input !== "object") throw new Error("Generation input must be an object.");
  const generationId = String(input.generationId ?? "").trim();
  if (!generationId) throw new Error("generationId is required.");

  const operators = Array.isArray(input.operators) ? input.operators.map((entry) => {
    const operatorId = String(entry?.operatorId ?? "").trim();
    const instruction = String(entry?.instruction ?? "").trim();
    if (!operatorId || !instruction) throw new Error("Every operator requires operatorId and instruction.");
    return {
      operatorId,
      instruction,
      parentOperatorIds: Array.isArray(entry.parentOperatorIds) ? entry.parentOperatorIds.map(String).sort() : [],
      origin: String(entry.origin ?? "seed"),
    };
  }) : [];
  if (operators.length < 2) throw new Error("At least two operators are required.");
  if (new Set(operators.map((entry) => entry.operatorId)).size !== operators.length) {
    throw new Error("operatorId values must be unique.");
  }
  const operatorIds = new Set(operators.map((entry) => entry.operatorId));

  const candidates = Array.isArray(input.candidates) ? input.candidates.map((entry) => {
    const candidateId = String(entry?.candidateId ?? "").trim();
    const operatorId = String(entry?.operatorId ?? "").trim();
    if (!candidateId || !operatorIds.has(operatorId)) {
      throw new Error("Every candidate requires candidateId and one declared operatorId.");
    }
    const parentFitness = numberInUnitInterval(entry.parentFitness, `parentFitness for ${candidateId}`);
    const rawFitness = numberInUnitInterval(entry.fitness, `fitness for ${candidateId}`);
    const hardGatesPassed = entry.hardGatesPassed !== false;
    const fitness = hardGatesPassed ? rawFitness : 0;
    const complexityDelta = entry.complexityDelta ?? 0;
    const evaluationCost = entry.evaluationCost ?? 1;
    if (![complexityDelta, evaluationCost].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Candidate ${candidateId} has invalid numeric metadata.`);
    }
    if (evaluationCost < 0) throw new Error("evaluationCost must be nonnegative.");
    return {
      candidateId,
      operatorId,
      parentCandidateId: String(entry.parentCandidateId ?? "baseline"),
      parentFitness,
      rawFitness,
      fitness,
      hardGatesPassed,
      improvement: fitness - parentFitness,
      complexityDelta,
      evaluationCost,
    };
  }) : [];
  if (candidates.length === 0) throw new Error("At least one evaluated candidate is required.");
  if (new Set(candidates.map((entry) => entry.candidateId)).size !== candidates.length) {
    throw new Error("candidateId values must be unique.");
  }
  return { generationId, operators, candidates };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rankCoevolution(input, survivorCount = 2) {
  const generation = normalizeGeneration(input);
  if (!Number.isInteger(survivorCount) || survivorCount < 1) {
    throw new Error("survivorCount must be a positive integer.");
  }
  const candidateRanking = [...generation.candidates].sort((left, right) => (
    right.fitness - left.fitness
    || right.improvement - left.improvement
    || left.complexityDelta - right.complexityDelta
    || left.evaluationCost - right.evaluationCost
    || left.candidateId.localeCompare(right.candidateId)
  ));

  const operatorRanking = generation.operators.map((operator) => {
    const trials = generation.candidates.filter((candidate) => candidate.operatorId === operator.operatorId);
    if (trials.length === 0) {
      return {
        operatorId: operator.operatorId,
        instruction: operator.instruction,
        trialCount: 0,
        meanImprovement: Number.NEGATIVE_INFINITY,
        successRate: 0,
        bestImprovement: Number.NEGATIVE_INFINITY,
        established: false,
      };
    }
    const improvements = trials.map((entry) => entry.improvement);
    return {
      operatorId: operator.operatorId,
      instruction: operator.instruction,
      trialCount: trials.length,
      meanImprovement: mean(improvements),
      successRate: improvements.filter((value) => value > 0).length / improvements.length,
      bestImprovement: Math.max(...improvements),
      established: trials.length >= 2,
    };
  }).sort((left, right) => (
    right.meanImprovement - left.meanImprovement
    || right.successRate - left.successRate
    || right.bestImprovement - left.bestImprovement
    || right.trialCount - left.trialCount
    || left.operatorId.localeCompare(right.operatorId)
  ));

  return {
    generationId: generation.generationId,
    candidateRanking,
    operatorRanking,
    candidateSurvivors: candidateRanking.slice(0, survivorCount).map((entry) => entry.candidateId),
    operatorSurvivors: operatorRanking.slice(0, survivorCount).map((entry) => entry.operatorId),
    evaluations: generation.candidates.length,
    totalEvaluationCost: generation.candidates.reduce((sum, entry) => sum + entry.evaluationCost, 0),
  };
}

export function breedOperatorPlans(input, rankingInput, operatorCount = 6) {
  const generation = normalizeGeneration(input);
  if (!Number.isInteger(operatorCount) || operatorCount < 2) {
    throw new Error("operatorCount must be an integer of at least 2.");
  }
  const byId = new Map(generation.operators.map((entry) => [entry.operatorId, entry]));
  const survivorIds = rankingInput.operatorSurvivors.filter((id) => byId.has(id)).slice(0, 2);
  if (survivorIds.length < 2) throw new Error("Ranking must contain two declared operator survivors.");

  const next = survivorIds.map((operatorId, index) => ({
    operatorId: `operator-${String(index).padStart(2, "0")}`,
    origin: "survivor",
    parentOperatorIds: [operatorId],
    instruction: byId.get(operatorId).instruction,
  }));
  for (let index = next.length; index < operatorCount; index += 1) {
    const leftId = survivorIds[index % survivorIds.length];
    const rightId = survivorIds[(index + 1) % survivorIds.length];
    const crossover = index % 2 === 1;
    next.push({
      operatorId: `operator-${String(index).padStart(2, "0")}`,
      origin: crossover ? "crossover-plan" : "mutation-plan",
      parentOperatorIds: crossover ? [leftId, rightId] : [leftId],
      instruction: crossover
        ? `Combine the transferable strengths of ${leftId} and ${rightId} into one concise mutation instruction; remove conflicts and benchmark-specific details.`
        : `Mutate ${leftId} to address its weakest observed child outcome while preserving its successful general rule.`,
    });
  }
  return {
    sourceGenerationId: generation.generationId,
    operatorCount,
    operators: next,
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

