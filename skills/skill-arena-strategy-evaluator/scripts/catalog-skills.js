#!/usr/bin/env node
import { catalogSkills, parseFlags, requireFlag, writeJson } from "./strategy-evaluator-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const rootDir = requireFlag(flags, "root");
  const outputPath = requireFlag(flags, "output");
  const catalog = await catalogSkills(rootDir);
  await writeJson(outputPath, catalog);
  console.log(`Skill catalog: ${catalog.skillCount} skills; sha256=${catalog.digest}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

