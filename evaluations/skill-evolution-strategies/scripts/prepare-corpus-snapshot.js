#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SUBJECTS = [
  "animated-svg-to-gif",
  "compose-synchronized-svg",
  "d3-composition-evaluator",
  "html-d3-anime-video-workflow",
];

function parseFlags(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags.set(token.slice(2), true);
    else { flags.set(token.slice(2), next); index += 1; }
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const sourceRoot = path.resolve(String(flags.get("source-root") ?? path.join(os.homedir(), "dev", "skills", ".agents", "skills")));
const outputRoot = path.resolve(String(flags.get("output-root") ?? path.join("evaluations", "skill-evolution-strategies", "fixtures", "workspaces", "base", "subjects")));
const evidenceRoot = path.resolve(String(flags.get("evidence-root") ?? path.join("evaluations", "skill-evolution-strategies", "fixtures", "workspaces", "base", "evidence")));
const replayPath = path.resolve(String(flags.get("replay") ?? path.join("evaluations", "skill-evolution-strategies", "replay-scenarios.json")));
const manifest = { schemaVersion: 1, sourceRoot, subjects: [] };

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const subjectId of SUBJECTS) {
  const sourcePath = path.join(sourceRoot, subjectId, "SKILL.md");
  const content = await fs.readFile(sourcePath, "utf8");
  const destinationDir = path.join(outputRoot, subjectId);
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, "SKILL.md"), content, "utf8");
  manifest.subjects.push({
    subjectId,
    sourcePath,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    lines: content.split(/\r?\n/).length,
  });
}

await fs.writeFile(path.join(outputRoot, "snapshot-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const replay = JSON.parse(await fs.readFile(replayPath, "utf8"));
await fs.rm(evidenceRoot, { recursive: true, force: true });
await fs.mkdir(evidenceRoot, { recursive: true });
for (const scenario of replay.scenarios) {
  const liveScenario = {
    ...scenario,
    holdoutScoresWithheld: true,
    candidates: scenario.candidates.map(({ holdoutScore, ...candidate }) => candidate),
  };
  await fs.writeFile(
    path.join(evidenceRoot, `${scenario.scenarioId}.json`),
    `${JSON.stringify(liveScenario, null, 2)}\n`,
    "utf8",
  );
}

console.log(`Prepared ${manifest.subjects.length} subject snapshots and ${replay.scenarios.length} evidence scenarios.`);
