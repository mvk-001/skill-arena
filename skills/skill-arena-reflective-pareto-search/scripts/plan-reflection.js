#!/usr/bin/env node
import {
  buildReflectionPlan,
  parseFlags,
  readJson,
  requireFlag,
  writeJson,
} from "./reflective-pareto-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const inputPath = requireFlag(flags, "input");
  const outputPath = requireFlag(flags, "output");
  const plan = buildReflectionPlan(await readJson(inputPath));
  await writeJson(outputPath, plan);
  console.log(`Reflection plan: case=${plan.targetCaseId}; parent=${plan.selectedParentId}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
