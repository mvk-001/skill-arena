#!/usr/bin/env node
import path from "node:path";
import { consolidatePatches, parseFlagArguments, requireFlag } from "./traced-evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const runDir = path.resolve(requireFlag(flags, "run-dir"));
  const minSupport = Number(flags.get("min-support") ?? 2);
  const result = await consolidatePatches({ runDir, minSupport });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
