import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveManifestPath } from "./manifest.js";
import { fromProjectRoot } from "./project-paths.js";

const execFileAsync = promisify(execFile);
const gitOverlayCache = new Map();

export async function materializeWorkspace({ manifest, scenario }) {
  const runId = createRunId(scenario.id);
  const runDirectory = fromProjectRoot("results", manifest.benchmark.id, runId);
  const workspaceDirectory = path.join(runDirectory, "workspace");

  const fixtureDirectory = resolveManifestPath(manifest.workspace.fixture);

  await assertDirectoryExists(fixtureDirectory, "workspace.fixture");

  await fs.mkdir(runDirectory, { recursive: true });
  await fs.cp(fixtureDirectory, workspaceDirectory, { recursive: true });

  if (scenario.skillMode === "enabled" && manifest.workspace.skillOverlay) {
    const skillOverlayDirectory = await resolveSkillOverlayDirectory(
      manifest.workspace.skillOverlay,
    );
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

async function resolveSkillOverlayDirectory(skillOverlay) {
  if (typeof skillOverlay === "string") {
    const directory = resolveManifestPath(skillOverlay);
    await assertDirectoryExists(directory, "workspace.skillOverlay");
    return directory;
  }

  if ("path" in skillOverlay) {
    const directory = resolveManifestPath(skillOverlay.path);
    await assertDirectoryExists(directory, "workspace.skillOverlay.path");
    return directory;
  }

  if ("git" in skillOverlay) {
    return await cloneGitSkillOverlay(skillOverlay.git);
  }

  throw new Error("Unsupported workspace.skillOverlay configuration.");
}

async function cloneGitSkillOverlay(gitOverlay) {
  const cacheKey = JSON.stringify(gitOverlay);

  if (!gitOverlayCache.has(cacheKey)) {
    gitOverlayCache.set(cacheKey, cloneGitSkillOverlayOnce(gitOverlay));
  }

  return await gitOverlayCache.get(cacheKey);
}

async function cloneGitSkillOverlayOnce(gitOverlay) {
  const cloneDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-skill-overlay-"));
  const gitArgs = ["clone", "--depth", "1"];

  if (gitOverlay.ref) {
    gitArgs.push("--branch", gitOverlay.ref);
  }

  gitArgs.push(gitOverlay.repo, cloneDirectory);

  try {
    await execFileAsync("git", gitArgs, {
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(
      `Failed to clone workspace.skillOverlay.git.repo "${gitOverlay.repo}". ${error.message}`,
    );
  }

  const overlayDirectory = gitOverlay.subpath
    ? path.join(cloneDirectory, gitOverlay.subpath)
    : cloneDirectory;

  await assertDirectoryExists(overlayDirectory, "workspace.skillOverlay.git.subpath");

  return overlayDirectory;
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
