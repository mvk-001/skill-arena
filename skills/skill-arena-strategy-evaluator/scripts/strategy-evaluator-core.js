import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const STRATEGY_IDS = [
  "population-search",
  "trace-distillation",
  "reflective-pareto-search",
  "operator-coevolution",
];

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fields = {};
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

async function countFiles(rootDir) {
  const counts = { files: 0, scripts: 0, references: 0, assets: 0, agents: 0 };
  async function visit(currentDir, relativeDir = "") {
    for (const entry of await fs.readdir(currentDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await visit(path.join(currentDir, entry.name), relativePath);
      } else if (entry.isFile()) {
        counts.files += 1;
        const firstSegment = relativePath.split(path.sep)[0];
        if (Object.hasOwn(counts, firstSegment)) counts[firstSegment] += 1;
      }
    }
  }
  await visit(rootDir);
  return counts;
}

export async function catalogSkills(rootDir) {
  const absoluteRoot = path.resolve(rootDir);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries.filter((value) => value.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const skillDir = path.join(absoluteRoot, entry.name);
    const skillPath = path.join(skillDir, "SKILL.md");
    let markdown;
    try {
      markdown = await fs.readFile(skillPath, "utf8");
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatter(markdown);
    const counts = await countFiles(skillDir);
    skills.push({
      skillId: entry.name,
      declaredName: frontmatter.name ?? null,
      description: frontmatter.description ?? null,
      skillMdLines: markdown.split(/\r?\n/).length,
      ...counts,
    });
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(skills)).digest("hex");
  return {
    schemaVersion: 1,
    sourceRoot: absoluteRoot,
    skillCount: skills.length,
    digest,
    skills,
  };
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function validateScenario(scenario) {
  const scenarioId = String(scenario?.scenarioId ?? "").trim();
  const subjectId = String(scenario?.subjectId ?? "").trim();
  const candidates = Array.isArray(scenario?.candidates) ? scenario.candidates : [];
  if (!scenarioId || !subjectId || candidates.length < 2) {
    throw new Error("Every scenario requires scenarioId, subjectId, and at least two candidates.");
  }
  const candidateIds = new Set(candidates.map((entry) => String(entry.candidateId ?? "")));
  if (candidateIds.size !== candidates.length || !candidateIds.has(scenario.baselineCandidateId)) {
    throw new Error(`Scenario ${scenarioId} requires unique candidates and a declared baselineCandidateId.`);
  }
  const caseIds = Object.keys(candidates[0].caseScores ?? {}).sort();
  if (caseIds.length === 0) throw new Error(`Scenario ${scenarioId} requires caseScores.`);
  for (const candidate of candidates) {
    for (const field of ["devScore", "holdoutScore", "parentFitness"]) {
      if (typeof candidate[field] !== "number" || candidate[field] < 0 || candidate[field] > 1) {
        throw new Error(`${scenarioId}/${candidate.candidateId} ${field} must be in 0..1.`);
      }
    }
    if (caseIds.some((caseId) => typeof candidate.caseScores?.[caseId] !== "number")) {
      throw new Error(`${scenarioId}/${candidate.candidateId} must provide every case score.`);
    }
  }
  return { ...scenario, scenarioId, subjectId, candidates, caseIds };
}

function candidateTieBreak(left, right) {
  return right.devScore - left.devScore
    || (left.complexityDelta ?? 0) - (right.complexityDelta ?? 0)
    || String(left.candidateId).localeCompare(String(right.candidateId));
}

function selectPopulation(scenario) {
  return [...scenario.candidates].sort(candidateTieBreak)[0];
}

function scoreVectorDominates(left, right, caseIds) {
  return caseIds.every((caseId) => left.caseScores[caseId] >= right.caseScores[caseId])
    && caseIds.some((caseId) => left.caseScores[caseId] > right.caseScores[caseId]);
}

function selectReflectivePareto(scenario) {
  const archive = scenario.candidates.filter((candidate) => !scenario.candidates.some(
    (other) => other.candidateId !== candidate.candidateId
      && scoreVectorDominates(other, candidate, scenario.caseIds),
  ));
  return [...archive].sort((left, right) => {
    const leftWorst = Math.min(...scenario.caseIds.map((caseId) => left.caseScores[caseId]));
    const rightWorst = Math.min(...scenario.caseIds.map((caseId) => right.caseScores[caseId]));
    const leftMean = mean(scenario.caseIds.map((caseId) => left.caseScores[caseId]));
    const rightMean = mean(scenario.caseIds.map((caseId) => right.caseScores[caseId]));
    return rightWorst - leftWorst || rightMean - leftMean || candidateTieBreak(left, right);
  })[0];
}

function selectTraceDistillation(scenario) {
  const support = new Map();
  for (const trace of scenario.traces ?? []) {
    for (const tag of new Set(trace.tags ?? [])) support.set(tag, (support.get(tag) ?? 0) + 1);
  }
  const minSupport = scenario.minTraceSupport ?? 2;
  const acceptedTags = new Set([...support].filter(([, count]) => count >= minSupport).map(([tag]) => tag));
  return [...scenario.candidates].sort((left, right) => {
    const leftMatches = (left.patchTags ?? []).filter((tag) => acceptedTags.has(tag)).length;
    const rightMatches = (right.patchTags ?? []).filter((tag) => acceptedTags.has(tag)).length;
    return rightMatches - leftMatches || candidateTieBreak(left, right);
  })[0];
}

function selectOperatorCoevolution(scenario) {
  const groups = new Map();
  for (const candidate of scenario.candidates) {
    const operatorId = String(candidate.operatorId ?? "unassigned");
    const values = groups.get(operatorId) ?? [];
    values.push(candidate.devScore - candidate.parentFitness);
    groups.set(operatorId, values);
  }
  const bestOperatorId = [...groups].map(([operatorId, improvements]) => ({
    operatorId,
    meanImprovement: mean(improvements),
    successRate: improvements.filter((value) => value > 0).length / improvements.length,
    trials: improvements.length,
  })).sort((left, right) => (
    right.meanImprovement - left.meanImprovement
    || right.successRate - left.successRate
    || right.trials - left.trials
    || left.operatorId.localeCompare(right.operatorId)
  ))[0].operatorId;
  return scenario.candidates.filter((entry) => String(entry.operatorId ?? "unassigned") === bestOperatorId)
    .sort(candidateTieBreak)[0];
}

function selectCandidate(strategyId, scenario) {
  if (strategyId === "population-search") return selectPopulation(scenario);
  if (strategyId === "trace-distillation") return selectTraceDistillation(scenario);
  if (strategyId === "reflective-pareto-search") return selectReflectivePareto(scenario);
  if (strategyId === "operator-coevolution") return selectOperatorCoevolution(scenario);
  throw new Error(`Unsupported strategy ${strategyId}.`);
}

export function replayStrategies(input) {
  if (input?.schemaVersion !== 1) throw new Error("Replay input schemaVersion must be 1.");
  const scenarios = (input.scenarios ?? []).map(validateScenario);
  if (scenarios.length === 0) throw new Error("At least one replay scenario is required.");
  const results = [];
  for (const scenario of scenarios) {
    const baseline = scenario.candidates.find((entry) => entry.candidateId === scenario.baselineCandidateId);
    for (const strategyId of STRATEGY_IDS) {
      const selected = selectCandidate(strategyId, scenario);
      results.push({
        strategyId,
        scenarioId: scenario.scenarioId,
        subjectId: scenario.subjectId,
        selectedCandidateId: selected.candidateId,
        devScore: selected.devScore,
        holdoutScore: selected.holdoutScore,
        baselineHoldoutScore: baseline.holdoutScore,
        holdoutGain: selected.holdoutScore - baseline.holdoutScore,
        generalizationGap: selected.devScore - selected.holdoutScore,
        regressionFree: selected.holdoutScore >= baseline.holdoutScore,
        complexityDelta: selected.complexityDelta ?? 0,
        evaluationCost: scenario.candidates.reduce((sum, entry) => sum + (entry.evaluationCost ?? 1), 0)
          + (strategyId === "trace-distillation" ? (scenario.traces?.length ?? 0) : 0),
        diversity: strategyId === "reflective-pareto-search"
          ? new Set(scenario.candidates.flatMap((entry) => Object.keys(entry.caseScores ?? {}))).size
          : strategyId === "operator-coevolution"
            ? new Set(scenario.candidates.map((entry) => entry.operatorId)).size
            : strategyId === "trace-distillation"
              ? new Set((scenario.traces ?? []).flatMap((entry) => entry.tags ?? [])).size
              : scenario.candidates.length,
      });
    }
  }

  const aggregates = STRATEGY_IDS.map((strategyId) => {
    const rows = results.filter((entry) => entry.strategyId === strategyId);
    return {
      strategyId,
      scenarios: rows.length,
      meanDevScore: mean(rows.map((entry) => entry.devScore)),
      meanHoldoutScore: mean(rows.map((entry) => entry.holdoutScore)),
      meanHoldoutGain: mean(rows.map((entry) => entry.holdoutGain)),
      meanGeneralizationGap: mean(rows.map((entry) => entry.generalizationGap)),
      reliability: rows.filter((entry) => entry.regressionFree).length / rows.length,
      meanComplexityDelta: mean(rows.map((entry) => entry.complexityDelta)),
      meanEvaluationCost: mean(rows.map((entry) => entry.evaluationCost)),
      meanDiversity: mean(rows.map((entry) => entry.diversity)),
    };
  });

  return {
    schemaVersion: 1,
    evidenceLayer: "deterministic-mechanism-replay",
    scenarioCount: scenarios.length,
    strategies: STRATEGY_IDS,
    results,
    aggregates,
    limitations: [
      "Replay fixtures test deterministic selection behavior; they are not live agent-quality measurements.",
      "Holdout scores are revealed only after each strategy selects a candidate.",
      "All strategies pay the full frozen candidate evaluation cost in this conservative comparison.",
    ],
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderReplayReport(replay, metadata = {}) {
  const lines = [
    "# Skill Evolution Strategy Replay",
    "",
    `Evidence layer: \`${replay.evidenceLayer}\``,
    `Scenarios: ${replay.scenarioCount}`,
  ];
  if (metadata.corpusDigest) lines.push(`Corpus digest: \`${metadata.corpusDigest}\``);
  lines.push(
    "",
    "## Aggregate metrics",
    "",
    "| Strategy | Holdout | Gain | Reliability | Gen. gap | Complexity Δ | Eval cost | Diversity |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const row of replay.aggregates) {
    lines.push(`| ${row.strategyId} | ${percent(row.meanHoldoutScore)} | ${percent(row.meanHoldoutGain)} | ${percent(row.reliability)} | ${percent(row.meanGeneralizationGap)} | ${row.meanComplexityDelta.toFixed(2)} | ${row.meanEvaluationCost.toFixed(1)} | ${row.meanDiversity.toFixed(1)} |`);
  }
  lines.push(
    "",
    "## Scenario selections",
    "",
    "| Scenario | Subject | Strategy | Selected | Holdout | Gain |",
    "| --- | --- | --- | --- | ---: | ---: |",
  );
  for (const row of replay.results) {
    lines.push(`| ${row.scenarioId} | ${row.subjectId} | ${row.strategyId} | ${row.selectedCandidateId} | ${percent(row.holdoutScore)} | ${percent(row.holdoutGain)} |`);
  }
  lines.push(
    "",
    "## How to choose",
    "",
    "- Use population search for stable scalar fitness and affordable broad evaluation.",
    "- Use trace distillation for recurring lessons in an existing labeled trace pool.",
    "- Use reflective Pareto search for rich per-case feedback and competing task families.",
    "- Use operator coevolution after fixed mutation operators plateau across repeated generations.",
    "",
    "## Limitations",
    "",
    ...replay.limitations.map((entry) => `- ${entry}`),
    "",
  );
  return lines.join("\n");
}

export function parseFlags(argv) {
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

export function requireFlag(flags, name) {
  const value = flags.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing required flag --${name}`);
  return value;
}

