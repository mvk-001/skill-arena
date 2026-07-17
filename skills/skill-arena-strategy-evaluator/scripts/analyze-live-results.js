#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  analyzeLiveResults,
  parseFlags,
  readJson,
  renderLiveAnalysisReport,
  requireFlag,
  writeJson,
} from "./strategy-evaluator-core.js";

try {
  const flags = parseFlags(process.argv.slice(2));
  const resultsPath = requireFlag(flags, "results");
  const replayPath = requireFlag(flags, "replay");
  const outputPath = requireFlag(flags, "output");
  const markdownPath = requireFlag(flags, "markdown");
  const analysis = analyzeLiveResults(await readJson(resultsPath), await readJson(replayPath));
  await writeJson(outputPath, analysis);
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(markdownPath, `${renderLiveAnalysisReport(analysis)}\n`, "utf8");
  console.log(`Live analysis: ${analysis.rows.length} cells; ${analysis.aggregates.length} profiles`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
