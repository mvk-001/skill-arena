#!/usr/bin/env node
import {
  breedOperatorPlans,
  parseFlags,
  readJson,
  requireFlag,
  writeJson,
} from "./operator-coevolution-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const inputPath = requireFlag(flags, "input");
  const rankingPath = requireFlag(flags, "ranking");
  const outputPath = requireFlag(flags, "output");
  const operatorCount = Number(flags.get("operator-count") ?? 6);
  const plans = breedOperatorPlans(await readJson(inputPath), await readJson(rankingPath), operatorCount);
  await writeJson(outputPath, plans);
  console.log(`Operator plans: ${plans.operatorCount}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
