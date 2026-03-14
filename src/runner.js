import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { buildPromptfooConfig, stringifyPromptfooConfig } from "./promptfoo-config.js";
import { normalizePromptfooResults, writePromptfooArtifacts } from "./results.js";
import { materializeWorkspace } from "./workspace.js";

export async function runScenario({ manifest, scenario, dryRun = false }) {
  const workspace = await materializeWorkspace({ manifest, scenario });
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

  await executePromptfoo({
    promptfooConfigPath,
    promptfooResultsPath,
    scenario,
  });

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
    skipped: false,
  };
}

async function executePromptfoo({ promptfooConfigPath, promptfooResultsPath, scenario }) {
  const promptfooArgs = [
    "promptfoo",
    "eval",
    "-c",
    promptfooConfigPath,
    "--output",
    promptfooResultsPath,
    "--repeat",
    String(scenario.evaluation.repeat),
    "-j",
    String(scenario.evaluation.maxConcurrency),
    "--no-progress-bar",
  ];

  if (scenario.evaluation.noCache) {
    promptfooArgs.push("--no-cache");
  }

  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx.cmd", ...promptfooArgs]
      : promptfooArgs;

  await new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: path.dirname(promptfooConfigPath),
      env: {
        ...process.env,
        PROMPTFOO_DISABLE_TELEMETRY: "1",
        PROMPTFOO_DISABLE_UPDATE: "1",
      },
      stdio: "inherit",
      windowsHide: true,
    });

    const killTimer = setTimeout(() => {
      childProcess.kill("SIGTERM");
    }, scenario.evaluation.timeoutMs);

    childProcess.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    childProcess.on("exit", (code) => {
      clearTimeout(killTimer);

      if (code === 0 || code === 100) {
        resolve();
        return;
      }

      reject(new Error(`promptfoo eval exited with code ${code}.`));
    });
  });
}
