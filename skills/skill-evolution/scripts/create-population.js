#!/usr/bin/env node
import path from "node:path";
import { parseFlagArguments, requireFlag, seedGeneration } from "./evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const skillSourceDir = path.resolve(requireFlag(flags, "skill"));
  const outputDir = path.resolve(requireFlag(flags, "out"));
  const generationIndex = Number(flags.get("generation") ?? 0);
  const populationSize = Number(flags.get("population-size") ?? 10);

  const { generationDir, generationState } = await seedGeneration({
    skillSourceDir,
    outputDir,
    generationIndex,
    populationSize,
  });

  console.log(JSON.stringify({
    generationDir,
    populationSize: generationState.populationSize,
    generation: generationState.generation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
