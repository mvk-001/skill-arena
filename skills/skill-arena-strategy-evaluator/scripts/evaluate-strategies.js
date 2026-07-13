#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseFlags,
  readJson,
  renderReplayReport,
  replayStrategies,
  requireFlag,
  writeJson,
} from "./strategy-evaluator-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const inputPath = requireFlag(flags, "input");
  const outputPath = requireFlag(flags, "output");
  const markdownPath = requireFlag(flags, "markdown");
  const input = await readJson(inputPath);
  const replay = replayStrategies(input);
  await writeJson(outputPath, replay);
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(markdownPath, `${renderReplayReport(replay, input.metadata)}\n`, "utf8");
  console.log(`Strategy replay: ${replay.scenarioCount} scenarios; ${replay.results.length} selections`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
