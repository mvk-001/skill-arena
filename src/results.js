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
    scenarioId: scenario.id,
    runId: workspace.runId,
    skillMode: scenario.skillMode,
    adapter: scenario.agent.adapter,
    model: scenario.agent.model ?? null,
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
