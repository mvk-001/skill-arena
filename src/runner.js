import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { buildPromptfooConfig, stringifyPromptfooConfig } from "./promptfoo-config.js";
import { resolveEvaluationConcurrency } from "./concurrency.js";
import { normalizePromptfooResults, writePromptfooArtifacts } from "./results.js";
import { fromPackageRoot } from "./project-paths.js";
import { materializeWorkspace, syncExecutionWorkspaceToArtifacts } from "./workspace.js";

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
}

async function executePromptfoo({ promptfooConfigPath, promptfooResultsPath, scenario }) {
  const maxConcurrency = resolveEvaluationConcurrency(scenario.evaluation);
  const promptfooArgs = [
    "promptfoo",
    "eval",
    "-c",
    promptfooConfigPath,
    "--output",
    promptfooResultsPath,
    "--repeat",
    String(scenario.evaluation.requests),
    "-j",
    String(maxConcurrency),
    "--no-progress-bar",
  ];

  if (scenario.evaluation.noCache) {
    promptfooArgs.push("--no-cache");
  }

  const { executable, executableArgs } = await buildPromptfooCommand(promptfooArgs);

  await new Promise((resolve, reject) => {
    const childProcess = spawn(executable, executableArgs, {
      cwd: path.dirname(promptfooConfigPath),
      env: {
        ...process.env,
        PROMPTFOO_DISABLE_TELEMETRY: "1",
        PROMPTFOO_DISABLE_UPDATE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const killTimer = setTimeout(() => {
      childProcess.kill("SIGTERM");
    }, scenario.evaluation.timeoutMs);

    childProcess.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });

    childProcess.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    childProcess.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
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

async function buildPromptfooCommand(args) {
  const promptfooEntrypoint = fromPackageRoot(
    "node_modules",
    "promptfoo",
    "dist",
    "src",
    "entrypoint.js",
  );

  try {
    await fs.access(promptfooEntrypoint);
    return {
      executable: process.execPath,
      executableArgs: [promptfooEntrypoint, ...args.slice(1)],
    };
  } catch {
    if (process.platform !== "win32") {
      return {
        executable: "npx",
        executableArgs: args,
      };
    }

    return {
      executable: "cmd.exe",
      executableArgs: ["/d", "/s", "/c", "npx.cmd", ...args],
    };
  }
}
