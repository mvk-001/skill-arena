#!/usr/bin/env node
import {
  buildParetoArchive,
  parseFlags,
  readJson,
  requireFlag,
  writeJson,
} from "./reflective-pareto-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const inputPath = requireFlag(flags, "input");
  const outputPath = requireFlag(flags, "output");
  const archive = buildParetoArchive(await readJson(inputPath));
  await writeJson(outputPath, archive);
  console.log(`Pareto archive: ${archive.archiveSize}/${archive.evaluatedCandidates} candidates; robust=${archive.robustCandidateId}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

