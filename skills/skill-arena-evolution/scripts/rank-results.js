#!/usr/bin/env node
import path from "node:path";
import { parseFlagArguments, rankGeneration, requireFlag } from "./evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const generationDir = path.resolve(requireFlag(flags, "generation-dir"));
  const rankingState = await rankGeneration(generationDir);
  console.log(JSON.stringify(rankingState, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
