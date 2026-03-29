#!/usr/bin/env node
import path from "node:path";
import { parseFlagArguments, requireFlag, validateConsolidation } from "./traced-evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const runDir = path.resolve(requireFlag(flags, "run-dir"));
  const result = await validateConsolidation(runDir);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
