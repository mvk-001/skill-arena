#!/usr/bin/env node
import path from "node:path";
import { initializeTraceRun, parseFlagArguments, requireFlag } from "./traced-evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const skillSourceDir = path.resolve(requireFlag(flags, "skill"));
  const outputDir = path.resolve(requireFlag(flags, "out"));
  const benchmarkId = typeof flags.get("benchmark-id") === "string" ? flags.get("benchmark-id") : null;
  const result = await initializeTraceRun({ skillSourceDir, outputDir, benchmarkId });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
