#!/usr/bin/env node
import path from "node:path";
import { breedNextGeneration, parseFlagArguments, requireFlag } from "./evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const outputDir = path.resolve(requireFlag(flags, "out"));
  const previousGenerationDir = path.resolve(requireFlag(flags, "previous-generation-dir"));
  const nextGenerationIndex = Number(flags.get("next-generation") ?? 1);
  const populationSize = Number(flags.get("population-size") ?? 10);
  const survivorCount = Number(flags.get("survivors") ?? 2);

  const result = await breedNextGeneration({
    outputDir,
    previousGenerationDir,
    nextGenerationIndex,
    populationSize,
    survivorCount,
  });

  console.log(JSON.stringify({
    generationDir: result.nextGenerationDir,
    generation: result.generationState.generation,
    seededFrom: result.generationState.seededFrom,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
