import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveManifestPath } from "./manifest.js";
import { fromProjectRoot } from "./project-paths.js";

const execFileAsync = promisify(execFile);

export async function materializeWorkspace({ manifest, scenario }) {
  const runId = createRunId(scenario.id);
  const runDirectory = fromProjectRoot("results", manifest.benchmark.id, runId);
  const workspaceDirectory = path.join(runDirectory, "workspace");

  const fixtureDirectory = resolveManifestPath(manifest.workspace.fixture);
  const skillOverlayDirectory = manifest.workspace.skillOverlay
    ? resolveManifestPath(manifest.workspace.skillOverlay)
    : null;

  await assertDirectoryExists(fixtureDirectory, "workspace.fixture");

  if (scenario.skillMode === "enabled" && skillOverlayDirectory) {
    await assertDirectoryExists(skillOverlayDirectory, "workspace.skillOverlay");
  }

  await fs.mkdir(runDirectory, { recursive: true });
  await fs.cp(fixtureDirectory, workspaceDirectory, { recursive: true });

  if (scenario.skillMode === "enabled" && skillOverlayDirectory) {
    await fs.cp(skillOverlayDirectory, workspaceDirectory, { recursive: true });
  }

  const gitReady = manifest.workspace.initializeGit
    ? await initializeGitRepository(workspaceDirectory)
    : false;

  return {
    runId,
    runDirectory,
    workspaceDirectory,
    gitReady,
  };
}

async function assertDirectoryExists(directoryPath, label) {
  const stats = await fs.stat(directoryPath).catch(() => null);

  if (!stats || !stats.isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${directoryPath}`);
  }
}

async function initializeGitRepository(workspaceDirectory) {
  try {
    await execFileAsync("git", ["init", "--initial-branch=main"], {
      cwd: workspaceDirectory,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function createRunId(scenarioId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${scenarioId}`;
}
