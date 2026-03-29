import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_POPULATION_SIZE = 10;
export const DEFAULT_SURVIVOR_COUNT = 2;

const SEED_OPERATORS = [
  { type: "baseline", focus: "control", hypothesis: "Preserve the incoming skill unchanged as the control." },
  { type: "mutation", focus: "trigger", hypothesis: "Tighten the trigger language and invocation conditions." },
  { type: "mutation", focus: "workflow", hypothesis: "Reorder the workflow to reduce ambiguity." },
  { type: "mutation", focus: "output-contract", hypothesis: "Make the expected outputs more explicit." },
  { type: "mutation", focus: "fitness", hypothesis: "Clarify how the evaluator should define success." },
  { type: "mutation", focus: "references", hypothesis: "Move non-core detail into references to reduce SKILL.md load." },
  { type: "mutation", focus: "scripts", hypothesis: "Add or refine deterministic helper scripts." },
  { type: "mutation", focus: "examples", hypothesis: "Improve examples so the agent reaches the intended path faster." },
  { type: "mutation", focus: "guardrails", hypothesis: "Strengthen discard rules for unstable or regressive variants." },
  { type: "mutation", focus: "selection", hypothesis: "Clarify survivor selection and acceptance rules." },
];

const CHILD_OPERATORS = [
  { type: "mutation", focus: "trigger" },
  { type: "crossover", focus: "workflow+scripts" },
  { type: "mutation", focus: "references" },
  { type: "crossover", focus: "fitness+guardrails" },
  { type: "mutation", focus: "examples" },
  { type: "crossover", focus: "trigger+workflow" },
  { type: "mutation", focus: "output-contract" },
  { type: "crossover", focus: "scripts+references" },
];

export async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

export async function readJson(jsonPath) {
  return JSON.parse(await fs.readFile(jsonPath, "utf8"));
}

export async function writeJson(jsonPath, value) {
  await ensureDirectory(path.dirname(jsonPath));
  await fs.writeFile(jsonPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function formatGenerationIndex(index) {
  return String(index).padStart(3, "0");
}

export function formatCandidateIndex(index) {
  return String(index).padStart(2, "0");
}

export function generationDirectory(rootDirectory, generationIndex) {
  return path.join(rootDirectory, `generation-${formatGenerationIndex(generationIndex)}`);
}

export function candidateDirectory(generationDir, candidateIndex) {
  return path.join(generationDir, "candidates", `candidate-${formatCandidateIndex(candidateIndex)}`);
}

export function candidateId(candidateIndex) {
  return `candidate-${formatCandidateIndex(candidateIndex)}`;
}

export function sortRelativePaths(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export async function copyDirectory(sourceDir, destinationDir) {
  const sourceStats = await fs.stat(sourceDir);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Source is not a directory: ${sourceDir}`);
  }

  await ensureDirectory(destinationDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fs.readlink(sourcePath);
      await fs.symlink(linkTarget, destinationPath);
    } else {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

export async function listFiles(rootDir) {
  const collected = [];

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const currentPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(currentPath);
        continue;
      }
      if (entry.isFile()) {
        collected.push(path.relative(rootDir, currentPath));
      }
    }
  }

  await visit(rootDir);
  return sortRelativePaths(collected);
}

export async function createCandidateFromSkill({
  generationDir,
  candidateIndex,
  skillSourceDir,
  operator,
  parents = [],
  origin,
}) {
  const candidateRoot = candidateDirectory(generationDir, candidateIndex);
  const candidateSkillDir = path.join(candidateRoot, "skill");
  await copyDirectory(skillSourceDir, candidateSkillDir);

  const manifest = {
    candidateId: candidateId(candidateIndex),
    generation: path.basename(generationDir),
    origin,
    parents,
    operator,
    skillPath: "skill",
  };

  await writeJson(path.join(candidateRoot, "candidate.json"), manifest);
  return { candidateRoot, candidateSkillDir, manifest };
}

export async function seedGeneration({
  skillSourceDir,
  outputDir,
  generationIndex = 0,
  populationSize = DEFAULT_POPULATION_SIZE,
}) {
  if (populationSize < 2) {
    throw new Error("Population size must be at least 2.");
  }

  const generationDir = generationDirectory(outputDir, generationIndex);
  await ensureDirectory(path.join(generationDir, "candidates"));

  const candidates = [];
  for (let index = 0; index < populationSize; index += 1) {
    const operator = SEED_OPERATORS[index % SEED_OPERATORS.length];
    const created = await createCandidateFromSkill({
      generationDir,
      candidateIndex: index,
      skillSourceDir,
      operator,
      parents: [],
      origin: "seed",
    });
    candidates.push(created.manifest);
  }

  const generationState = {
    generation: generationIndex,
    populationSize,
    survivorCount: DEFAULT_SURVIVOR_COUNT,
    strategy: "seed",
    candidates,
  };
  await writeJson(path.join(generationDir, "generation.json"), generationState);
  return { generationDir, generationState };
}

export function resolveFitness(result) {
  if (typeof result?.fitness === "number") {
    return result.fitness;
  }
  if (typeof result?.score === "number") {
    return result.score;
  }
  if (typeof result?.summary?.fitness === "number") {
    return result.summary.fitness;
  }
  if (typeof result?.summary?.passRate === "number") {
    return result.summary.passRate;
  }
  if (typeof result?.summary?.successRate === "number") {
    return result.summary.successRate;
  }
  if (typeof result?.stats?.successes === "number" || typeof result?.stats?.failures === "number") {
    const successes = Number(result?.stats?.successes ?? 0);
    const failures = Number(result?.stats?.failures ?? 0);
    const total = successes + failures;
    if (total > 0) {
      return successes / total;
    }
  }
  const outputs = Array.isArray(result?.outputs)
    ? result.outputs
    : Array.isArray(result?.results?.results)
      ? result.results.results
      : null;
  if (outputs && outputs.length > 0) {
    const numericScores = outputs
      .map((entry) => {
        if (typeof entry?.score === "number") {
          return entry.score;
        }
        if (typeof entry?.success === "boolean") {
          return entry.success ? 1 : 0;
        }
        return null;
      })
      .filter((value) => value !== null);
    if (numericScores.length > 0) {
      return numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length;
    }
  }
  throw new Error("Could not resolve a numeric fitness from the result payload.");
}

export async function rankGeneration(generationDir) {
  const candidatesDir = path.join(generationDir, "candidates");
  const candidateNames = sortRelativePaths(await fs.readdir(candidatesDir));
  const ranking = [];

  for (const name of candidateNames) {
    const candidateRoot = path.join(candidatesDir, name);
    const manifest = await readJson(path.join(candidateRoot, "candidate.json"));
    const resultPath = path.join(candidateRoot, "result.json");
    const result = await readJson(resultPath);
    ranking.push({
      candidateId: manifest.candidateId,
      parents: manifest.parents,
      operator: manifest.operator,
      resultPath,
      fitness: resolveFitness(result),
    });
  }

  ranking.sort((left, right) => {
    if (right.fitness !== left.fitness) {
      return right.fitness - left.fitness;
    }
    return left.candidateId.localeCompare(right.candidateId);
  });

  const rankingState = {
    generation: path.basename(generationDir),
    rankedAt: new Date().toISOString(),
    ranking,
    survivors: ranking.slice(0, DEFAULT_SURVIVOR_COUNT).map((entry) => entry.candidateId),
  };
  await writeJson(path.join(generationDir, "ranking.json"), rankingState);
  return rankingState;
}

export async function copyCrossoverSkill({
  leftSkillDir,
  rightSkillDir,
  destinationDir,
}) {
  await ensureDirectory(destinationDir);
  const leftFiles = await listFiles(leftSkillDir);
  const rightFiles = await listFiles(rightSkillDir);
  const allFiles = sortRelativePaths(new Set([...leftFiles, ...rightFiles]));

  for (let index = 0; index < allFiles.length; index += 1) {
    const relativeFile = allFiles[index];
    const preferLeft = index % 2 === 0;
    const leftPath = path.join(leftSkillDir, relativeFile);
    const rightPath = path.join(rightSkillDir, relativeFile);
    const leftExists = leftFiles.includes(relativeFile);
    const rightExists = rightFiles.includes(relativeFile);
    const chosenSource = preferLeft
      ? (leftExists ? leftPath : rightPath)
      : (rightExists ? rightPath : leftPath);
    await ensureDirectory(path.dirname(path.join(destinationDir, relativeFile)));
    await fs.copyFile(chosenSource, path.join(destinationDir, relativeFile));
  }
}

export async function breedNextGeneration({
  outputDir,
  previousGenerationDir,
  nextGenerationIndex,
  populationSize = DEFAULT_POPULATION_SIZE,
  survivorCount = DEFAULT_SURVIVOR_COUNT,
}) {
  if (survivorCount !== DEFAULT_SURVIVOR_COUNT) {
    throw new Error("This helper currently requires exactly two survivors.");
  }
  if (populationSize < survivorCount) {
    throw new Error("Population size must be greater than or equal to survivor count.");
  }

  const rankingState = await readJson(path.join(previousGenerationDir, "ranking.json"));
  const survivorIds = rankingState.survivors.slice(0, survivorCount);
  if (survivorIds.length !== survivorCount) {
    throw new Error("Ranking does not contain enough survivors.");
  }

  const nextGenerationDir = generationDirectory(outputDir, nextGenerationIndex);
  await ensureDirectory(path.join(nextGenerationDir, "candidates"));

  const survivorRoots = survivorIds.map((id) => path.join(previousGenerationDir, "candidates", id));
  const survivorSkillDirs = survivorRoots.map((root) => path.join(root, "skill"));
  const candidates = [];

  for (let index = 0; index < survivorCount; index += 1) {
    const created = await createCandidateFromSkill({
      generationDir: nextGenerationDir,
      candidateIndex: index,
      skillSourceDir: survivorSkillDirs[index],
      operator: { type: "survivor-carry", focus: "validated-winner" },
      parents: [survivorIds[index]],
      origin: "survivor",
    });
    candidates.push(created.manifest);
  }

  const offspringCount = populationSize - survivorCount;
  for (let childOffset = 0; childOffset < offspringCount; childOffset += 1) {
    const candidateIndex = survivorCount + childOffset;
    const operator = CHILD_OPERATORS[childOffset % CHILD_OPERATORS.length];
    const candidateRoot = candidateDirectory(nextGenerationDir, candidateIndex);
    const candidateSkillDir = path.join(candidateRoot, "skill");
    const primaryIndex = childOffset % survivorCount;
    const secondaryIndex = (primaryIndex + 1) % survivorCount;

    if (operator.type === "mutation") {
      await copyDirectory(survivorSkillDirs[primaryIndex], candidateSkillDir);
    } else {
      await copyCrossoverSkill({
        leftSkillDir: survivorSkillDirs[primaryIndex],
        rightSkillDir: survivorSkillDirs[secondaryIndex],
        destinationDir: candidateSkillDir,
      });
    }

    const manifest = {
      candidateId: candidateId(candidateIndex),
      generation: path.basename(nextGenerationDir),
      origin: operator.type,
      parents: operator.type === "mutation"
        ? [survivorIds[primaryIndex]]
        : [survivorIds[primaryIndex], survivorIds[secondaryIndex]],
      operator,
      skillPath: "skill",
    };
    await writeJson(path.join(candidateRoot, "candidate.json"), manifest);
    candidates.push(manifest);
  }

  const generationState = {
    generation: nextGenerationIndex,
    populationSize,
    survivorCount,
    strategy: "breed",
    seededFrom: path.basename(previousGenerationDir),
    candidates,
  };
  await writeJson(path.join(nextGenerationDir, "generation.json"), generationState);
  return { nextGenerationDir, generationState };
}

export async function appendGenerationLog({
  rootDir,
  generationDir,
  acceptedWinner = null,
}) {
  const generationState = await readJson(path.join(generationDir, "generation.json"));
  const rankingState = await readJson(path.join(generationDir, "ranking.json"));
  const logPath = path.join(rootDir, "evolution-log.json");

  let existing = { generations: [] };
  try {
    existing = await readJson(logPath);
  } catch {
    existing = { generations: [] };
  }

  const entry = {
    generation: generationState.generation,
    generationId: path.basename(generationDir),
    candidates: generationState.candidates.map((candidate) => candidate.candidateId),
    survivors: rankingState.survivors,
    ranking: rankingState.ranking,
    acceptedWinner: acceptedWinner ?? rankingState.survivors[0] ?? null,
    recordedAt: new Date().toISOString(),
  };

  existing.generations = [
    ...existing.generations.filter((value) => value.generationId !== entry.generationId),
    entry,
  ].sort((left, right) => left.generation - right.generation);

  await writeJson(logPath, existing);
  return entry;
}

export function parseFlagArguments(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      parsed.set(key, true);
      continue;
    }
    parsed.set(key, nextToken);
    index += 1;
  }
  return parsed;
}

export function requireFlag(flags, key) {
  const value = flags.get(key);
  if (value === undefined || value === true || value === "") {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}
