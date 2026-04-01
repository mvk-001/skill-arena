import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendGenerationLog,
  breedNextGeneration,
  rankGeneration,
  seedGeneration,
} from "../skills/skill-arena-evolution/scripts/evolution-core.js";

async function createToySkill(rootDir) {
  const skillDir = path.join(rootDir, "toy-skill");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: toy-skill",
      "description: Toy skill for deterministic evolution tests.",
      "---",
      "",
      "# Toy Skill",
      "",
      "Use this toy skill for tests.",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(skillDir, "references", "guide.md"), "# Guide\n", "utf8");
  return skillDir;
}

test("skill-arena-evolution seeds a deterministic ten-candidate generation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-evolution-seed-"));
  const skillDir = await createToySkill(tempDir);
  const outputDir = path.join(tempDir, "run");

  const { generationDir, generationState } = await seedGeneration({
    skillSourceDir: skillDir,
    outputDir,
  });

  assert.equal(generationState.populationSize, 10);
  assert.equal(generationState.candidates.length, 10);

  const firstCandidate = JSON.parse(
    await fs.readFile(path.join(generationDir, "candidates", "candidate-00", "candidate.json"), "utf8"),
  );
  const tenthCandidate = JSON.parse(
    await fs.readFile(path.join(generationDir, "candidates", "candidate-09", "candidate.json"), "utf8"),
  );

  assert.equal(firstCandidate.operator.type, "baseline");
  assert.equal(tenthCandidate.operator.focus, "selection");
  await assert.doesNotReject(() =>
    fs.access(path.join(generationDir, "candidates", "candidate-03", "skill", "SKILL.md")),
  );
});

test("skill-arena-evolution ranks candidates by fitness and keeps deterministic survivors", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-evolution-rank-"));
  const skillDir = await createToySkill(tempDir);
  const outputDir = path.join(tempDir, "run");

  const { generationDir } = await seedGeneration({
    skillSourceDir: skillDir,
    outputDir,
  });

  const fitnesses = [0.10, 0.95, 0.40, 0.20, 0.95, 0.30, 0.70, 0.50, 0.60, 0.80];
  await Promise.all(fitnesses.map((fitness, index) => fs.writeFile(
    path.join(generationDir, "candidates", `candidate-${String(index).padStart(2, "0")}`, "result.json"),
    JSON.stringify({ fitness }, null, 2),
    "utf8",
  )));

  const ranking = await rankGeneration(generationDir);

  assert.deepEqual(ranking.survivors, ["candidate-01", "candidate-04"]);
  assert.equal(ranking.ranking[0].fitness, 0.95);
  assert.equal(ranking.ranking[1].fitness, 0.95);
});

test("skill-arena-evolution breeds the next generation from the top two candidates and logs the winner", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-evolution-breed-"));
  const skillDir = await createToySkill(tempDir);
  const outputDir = path.join(tempDir, "run");

  const { generationDir } = await seedGeneration({
    skillSourceDir: skillDir,
    outputDir,
  });

  await fs.writeFile(
    path.join(generationDir, "candidates", "candidate-01", "skill", "references", "guide.md"),
    "# Guide\n\nFrom parent one.\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(generationDir, "candidates", "candidate-04", "skill", "extra.txt"),
    "from parent four\n",
    "utf8",
  );

  const survivorFitness = [
    ["candidate-00", 0.2],
    ["candidate-01", 0.9],
    ["candidate-02", 0.1],
    ["candidate-03", 0.3],
    ["candidate-04", 0.8],
    ["candidate-05", 0.05],
    ["candidate-06", 0.4],
    ["candidate-07", 0.6],
    ["candidate-08", 0.7],
    ["candidate-09", 0.5],
  ];
  await Promise.all(survivorFitness.map(([candidate, fitness]) => fs.writeFile(
    path.join(generationDir, "candidates", candidate, "result.json"),
    JSON.stringify({ fitness }, null, 2),
    "utf8",
  )));
  await rankGeneration(generationDir);

  const { nextGenerationDir, generationState } = await breedNextGeneration({
    outputDir,
    previousGenerationDir: generationDir,
    nextGenerationIndex: 1,
  });

  assert.equal(generationState.candidates.length, 10);
  const survivorManifest = JSON.parse(
    await fs.readFile(path.join(nextGenerationDir, "candidates", "candidate-00", "candidate.json"), "utf8"),
  );
  const childManifest = JSON.parse(
    await fs.readFile(path.join(nextGenerationDir, "candidates", "candidate-03", "candidate.json"), "utf8"),
  );
  assert.deepEqual(survivorManifest.parents, ["candidate-01"]);
  assert.deepEqual(childManifest.parents, ["candidate-04", "candidate-01"]);

  await Promise.all(generationState.candidates.map((candidate, index) => fs.writeFile(
    path.join(nextGenerationDir, "candidates", candidate.candidateId, "result.json"),
    JSON.stringify({ fitness: 1 - index / 100 }, null, 2),
    "utf8",
  )));
  await rankGeneration(nextGenerationDir);
  const entry = await appendGenerationLog({
    rootDir: outputDir,
    generationDir: nextGenerationDir,
  });

  assert.equal(entry.acceptedWinner, "candidate-00");
  const log = JSON.parse(await fs.readFile(path.join(outputDir, "evolution-log.json"), "utf8"));
  assert.equal(log.generations.length, 1);
  assert.equal(log.generations[0].generationId, "generation-001");
});
