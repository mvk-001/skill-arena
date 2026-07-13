#!/usr/bin/env node
import { parseFlags, rankCoevolution, readJson, requireFlag, writeJson } from "./operator-coevolution-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const inputPath = requireFlag(flags, "input");
  const outputPath = requireFlag(flags, "output");
  const survivorCount = Number(flags.get("survivors") ?? 2);
  const ranking = rankCoevolution(await readJson(inputPath), survivorCount);
  await writeJson(outputPath, ranking);
  console.log(`Coevolution ranking: ${ranking.evaluations} evaluations; operators=${ranking.operatorSurvivors.join(",")}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

