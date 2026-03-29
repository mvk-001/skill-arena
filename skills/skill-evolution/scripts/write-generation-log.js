#!/usr/bin/env node
import path from "node:path";
import { appendGenerationLog, parseFlagArguments, requireFlag } from "./evolution-core.js";

async function main() {
  const flags = parseFlagArguments(process.argv.slice(2));
  const rootDir = path.resolve(requireFlag(flags, "root"));
  const generationDir = path.resolve(requireFlag(flags, "generation-dir"));
  const acceptedWinner = flags.get("accepted-winner");

  const entry = await appendGenerationLog({
    rootDir,
    generationDir,
    acceptedWinner: typeof acceptedWinner === "string" ? acceptedWinner : null,
  });

  console.log(JSON.stringify(entry, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
