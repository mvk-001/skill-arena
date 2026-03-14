import fs from "node:fs/promises";
import path from "node:path";

export async function writePromptfooArtifacts({
  runDirectory,
  promptfooConfigYaml,
  promptfooResultsPath,
  promptfooJsonPath,
  summary,
}) {
  await fs.writeFile(
    path.join(runDirectory, "promptfooconfig.yaml"),
    promptfooConfigYaml,
    "utf8",
  );

  if (promptfooResultsPath && promptfooResultsPath !== promptfooJsonPath) {
    await fs.copyFile(promptfooResultsPath, promptfooJsonPath);
  }

  await fs.writeFile(
    path.join(runDirectory, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
}

export async function writeMergedBenchmarkArtifacts({
  benchmarkId,
  benchmarkRunDirectory,
  mergedSummary,
  cliReport,
}) {
  await fs.mkdir(benchmarkRunDirectory, { recursive: true });
  await fs.writeFile(
    path.join(benchmarkRunDirectory, "merged-summary.json"),
    JSON.stringify(mergedSummary, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(benchmarkRunDirectory, "report.md"),
    cliReport,
    "utf8",
  );

  return {
    benchmarkId,
    benchmarkRunDirectory,
    mergedSummaryPath: path.join(benchmarkRunDirectory, "merged-summary.json"),
    reportPath: path.join(benchmarkRunDirectory, "report.md"),
  };
}

export async function normalizePromptfooResults({
  manifest,
  scenario,
  workspace,
  promptfooResultsPath,
}) {
  const rawResults = JSON.parse(await fs.readFile(promptfooResultsPath, "utf8"));
  const resultEnvelope = rawResults.results ?? {};
  const stats = resultEnvelope.stats ?? {};
  const rowResults = Array.isArray(resultEnvelope.results)
    ? resultEnvelope.results
    : Array.isArray(resultEnvelope.outputs)
      ? resultEnvelope.outputs
      : [];

  return {
    evalId: rawResults.evalId ?? null,
    promptfooVersion: rawResults.metadata?.promptfooVersion ?? null,
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    scenarioId: scenario.id,
    scenarioDescription: scenario.description ?? null,
    runId: workspace.runId,
    skillMode: scenario.skillMode,
    adapter: scenario.agent.adapter,
    model: scenario.agent.model ?? null,
    outputTags: scenario.output.tags,
    outputLabels: scenario.output.labels,
    workspaceDirectory: workspace.workspaceDirectory,
    promptfooResultsPath,
    stats,
    outputs: rowResults.map((output, index) => normalizeOutput(output, index)),
    generatedAt: new Date().toISOString(),
  };
}

function normalizeOutput(output, index) {
  const failureReason =
    output.failureReason === 0 || output.failureReason === null
      ? null
      : output.failureReason;

  return {
    index,
    promptId: output.metadata?.promptId ?? output.testCase?.metadata?.promptId ?? null,
    promptDescription:
      output.metadata?.promptDescription ?? output.testCase?.metadata?.promptDescription ?? null,
    scenarioId: output.metadata?.scenarioId ?? output.testCase?.metadata?.scenarioId ?? null,
    scenarioDescription:
      output.metadata?.scenarioDescription
      ?? output.testCase?.metadata?.scenarioDescription
      ?? null,
    provider:
      typeof output.provider === "string"
        ? output.provider
        : output.provider?.id ?? null,
    prompt: output.prompt?.raw ?? output.prompt ?? null,
    text: output.response?.output ?? output.output ?? null,
    success: output.success ?? null,
    score: output.score ?? null,
    latencyMs: output.latencyMs ?? output.latency ?? null,
    cost: output.cost ?? null,
    tokenUsage: output.tokenUsage ?? output.gradingResult?.tokensUsed ?? null,
    error: output.error ?? failureReason ?? null,
  };
}

export function buildMergedBenchmarkSummary({ manifest, scenarioSummaries, generatedAt }) {
  const promptGroups = new Map();

  for (const summary of scenarioSummaries) {
    for (const output of summary.outputs) {
      const promptId = output.promptId ?? "default";
      const promptGroup = getOrCreateMapEntry(promptGroups, promptId, () => ({
        promptId,
        promptDescription: output.promptDescription ?? null,
        prompt: output.prompt,
        scenarios: {},
      }));

      const scenarioEntry = promptGroup.scenarios[summary.scenarioId] ?? {
        scenarioId: summary.scenarioId,
        scenarioDescription: summary.scenarioDescription,
        skillMode: summary.skillMode,
        model: summary.model,
        outputLabels: summary.outputLabels,
        outputTags: summary.outputTags,
        runs: 0,
        successes: 0,
        failures: 0,
        avgScore: null,
        avgLatencyMs: null,
        sampleOutputs: [],
      };

      scenarioEntry.runs += 1;
      scenarioEntry.successes += output.success ? 1 : 0;
      scenarioEntry.failures += output.success === false ? 1 : 0;
      scenarioEntry.avgScore = averageNumbers(scenarioEntry.avgScore, scenarioEntry.runs, output.score);
      scenarioEntry.avgLatencyMs = averageNumbers(
        scenarioEntry.avgLatencyMs,
        scenarioEntry.runs,
        output.latencyMs,
      );

      if (scenarioEntry.sampleOutputs.length < 3 && output.text !== null) {
        scenarioEntry.sampleOutputs.push(output.text);
      }

      promptGroup.scenarios[summary.scenarioId] = scenarioEntry;
    }
  }

  return {
    benchmarkId: manifest.benchmark.id,
    benchmarkDescription: manifest.benchmark.description ?? null,
    generatedAt,
    scenarioCount: scenarioSummaries.length,
    prompts: [...promptGroups.values()],
  };
}

export function renderMergedBenchmarkReport(mergedSummary) {
  const lines = [
    `# ${mergedSummary.benchmarkId}`,
    "",
    mergedSummary.benchmarkDescription ?? "",
    "",
  ];

  for (const prompt of mergedSummary.prompts) {
    lines.push(`## Prompt: ${prompt.promptId}`);
    if (prompt.promptDescription) {
      lines.push(prompt.promptDescription);
      lines.push("");
    }
    lines.push(`Prompt text: ${prompt.prompt}`);
    lines.push("");
    lines.push("| Scenario | Skill | Runs | Pass | Fail | Avg score | Avg latency ms |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");

    for (const scenario of Object.values(prompt.scenarios)) {
      lines.push(
        `| ${scenario.scenarioId} | ${scenario.outputLabels?.skill_state ?? scenario.skillMode} | ${scenario.runs} | ${scenario.successes} | ${scenario.failures} | ${formatNumber(scenario.avgScore)} | ${formatNumber(scenario.avgLatencyMs)} |`,
      );
    }

    lines.push("");
  }

  return lines.filter((line, index, array) => {
    if (line !== "") {
      return true;
    }
    return array[index - 1] !== "";
  }).join("\n");
}

function getOrCreateMapEntry(map, key, createValue) {
  if (!map.has(key)) {
    map.set(key, createValue());
  }

  return map.get(key);
}

function averageNumbers(currentAverage, count, nextValue) {
  if (typeof nextValue !== "number") {
    return currentAverage;
  }

  if (currentAverage === null || typeof currentAverage !== "number" || count <= 1) {
    return nextValue;
  }

  return ((currentAverage * (count - 1)) + nextValue) / count;
}

function formatNumber(value) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}
