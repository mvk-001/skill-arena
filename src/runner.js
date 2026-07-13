import fs from "node:fs/promises";
import path from "node:path";

import { buildPromptfooConfig, stringifyPromptfooConfig } from "./promptfoo-config.js";
import { resolveEvaluationConcurrency } from "./concurrency.js";
import { normalizePromptfooResults, writePromptfooArtifacts } from "./results.js";
import { runPromptfooEval } from "./promptfoo-runner.js";
import { materializeWorkspace, syncExecutionWorkspaceToArtifacts, clearGitSourceCache } from "./workspace.js";

export async function runScenario({
  manifest,
  scenario,
  dryRun = false,
  outputRootDirectory = process.cwd(),
  sourceBaseDirectory = outputRootDirectory,
}) {
  const workspace = await materializeWorkspace({
    manifest,
    scenario,
    outputRootDirectory,
    sourceBaseDirectory,
  });

  try {
    const promptfooConfig = buildPromptfooConfig({ manifest, scenario, workspace });
    const promptfooConfigYaml = stringifyPromptfooConfig(promptfooConfig);
    const promptfooConfigPath = path.join(workspace.runDirectory, "promptfooconfig.yaml");
    const promptfooResultsPath = path.join(workspace.runDirectory, "promptfoo-results.json");

    await fs.writeFile(promptfooConfigPath, promptfooConfigYaml, "utf8");

    if (dryRun) {
      return {
        runDirectory: workspace.runDirectory,
        workspaceDirectory: workspace.workspaceDirectory,
        promptfooConfigPath,
        promptfooResultsPath,
        skipped: true,
      };
    }

    await runPromptfooEval({
      promptfooConfigPath,
      promptfooResultsPath,
      requests: scenario.evaluation.requests,
      maxConcurrency: resolveEvaluationConcurrency(scenario.evaluation),
      noCache: scenario.evaluation.noCache,
      timeoutMs: computeEffectiveTimeout(scenario.evaluation),
    });
    await syncExecutionWorkspaceToArtifacts(workspace);

    const summary = await normalizePromptfooResults({
      manifest,
      scenario,
      workspace,
      promptfooResultsPath,
    });

    await writePromptfooArtifacts({
      runDirectory: workspace.runDirectory,
      promptfooConfigYaml,
      promptfooResultsPath,
      promptfooJsonPath: promptfooResultsPath,
      summary,
    });

    return {
      runDirectory: workspace.runDirectory,
      workspaceDirectory: workspace.workspaceDirectory,
      promptfooConfigPath,
      promptfooResultsPath,
      summaryPath: path.join(workspace.runDirectory, "summary.json"),
      summary,
      skipped: false,
    };
  } finally {
    await fs.rm(workspace.executionRootDirectory, { recursive: true, force: true }).catch(() => {});
    clearGitSourceCache();
  }
}

/**
 * Compute an effective process-level timeout that accounts for the number
 * of requested repetitions. `timeoutMs` in the config is per-prompt, but
 * the promptfoo process runs all requests sequentially or with bounded
 * concurrency.  The effective timeout is:
 *   timeoutMs × ceil(requests / concurrency) + 30 s buffer
 */
function computeEffectiveTimeout(evaluation) {
  const baseTimeout = evaluation.timeoutMs ?? 120_000;
  const requests = evaluation.requests ?? 1;
  const concurrency = evaluation.maxConcurrency ?? 1;
  const rounds = Math.ceil(requests / Math.max(1, concurrency));
  const bufferMs = 30_000;
  return baseTimeout * rounds + bufferMs;
}
