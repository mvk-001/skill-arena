import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveManifestPath } from "./manifest.js";

const execFileAsync = promisify(execFile);
const gitSourceCache = new Map();

export async function materializeWorkspace({
  manifest,
  scenario,
  outputRootDirectory = process.cwd(),
  sourceBaseDirectory = outputRootDirectory,
}) {
  const runId = createRunId(scenario.id);
  const runDirectory = path.join(outputRootDirectory, "results", manifest.benchmark.id, runId);
  const workspaceDirectory = path.join(runDirectory, "workspace");

  await fs.mkdir(workspaceDirectory, { recursive: true });

  for (const source of manifest.workspace.sources) {
    await materializeWorkspaceSource({
      source,
      workspaceDirectory,
      labelPrefix: "workspace.sources",
      sourceBaseDirectory,
    });
  }

  if (scenario.skill.install.strategy === "workspace-overlay") {
    await materializeSkillSource({
      skillSource: scenario.skill.source,
      workspaceDirectory,
      sourceBaseDirectory,
    });
  }

  const gitReady = manifest.workspace.setup.initializeGit
    ? await initializeGitRepository(workspaceDirectory)
    : false;

  return {
    runId,
    runDirectory,
    workspaceDirectory,
    gitReady,
    environment: {
      ...manifest.workspace.setup.env,
    },
  };
}

async function materializeWorkspaceSource({
  source,
  workspaceDirectory,
  labelPrefix,
  sourceBaseDirectory,
}) {
  switch (source.type) {
    case "local-path": {
      const sourceDirectory = resolveLocalPath(source.path, sourceBaseDirectory);
      await assertDirectoryExists(sourceDirectory, `${labelPrefix}.${source.id ?? source.type}.path`);
      await copyDirectoryIntoTarget({
        sourceDirectory,
        workspaceDirectory,
        target: source.target,
      });
      return;
    }
    case "git": {
      const sourceDirectory = await cloneGitSource(source);
      await copyDirectoryIntoTarget({
        sourceDirectory,
        workspaceDirectory,
        target: source.target,
      });
      return;
    }
    case "inline-files": {
      for (const file of source.files) {
        const outputPath = resolveWorkspacePath(workspaceDirectory, path.posix.join(source.target, file.path));
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, file.content ?? "", "utf8");
      }
      return;
    }
    case "empty":
      return;
    default:
      throw new Error(`Unsupported workspace source type "${source.type}".`);
  }
}

async function materializeSkillSource({ skillSource, workspaceDirectory, sourceBaseDirectory }) {
  switch (skillSource.type) {
    case "local-path": {
      const sourceDirectory = resolveLocalPath(skillSource.path, sourceBaseDirectory);
      await assertDirectoryExists(sourceDirectory, "skill.source.path");
      await copyDirectoryIntoTarget({
        sourceDirectory,
        workspaceDirectory,
        target: "/",
      });
      return;
    }
    case "git": {
      const sourceDirectory = await cloneGitSource(skillSource);
      await copyDirectoryIntoTarget({
        sourceDirectory,
        workspaceDirectory,
        target: "/",
      });
      return;
    }
    case "inline-files": {
      for (const file of skillSource.files) {
        const outputPath = resolveWorkspacePath(workspaceDirectory, file.path);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, file.content ?? "", "utf8");
      }
      return;
    }
    case "none":
    case "system-installed":
      return;
    default:
      throw new Error(`Unsupported skill source type "${skillSource.type}".`);
  }
}

async function cloneGitSource(gitSource) {
  const cacheKey = JSON.stringify(gitSource);

  if (!gitSourceCache.has(cacheKey)) {
    gitSourceCache.set(cacheKey, cloneGitSourceOnce(gitSource));
  }

  return await gitSourceCache.get(cacheKey);
}

async function cloneGitSourceOnce(gitSource) {
  const cloneDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-git-source-"));
  const gitArgs = ["clone", "--depth", "1"];

  if (gitSource.ref) {
    gitArgs.push("--branch", gitSource.ref);
  }

  gitArgs.push(gitSource.repo, cloneDirectory);

  try {
    await execFileAsync("git", gitArgs, {
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(
      `Failed to clone git repo "${gitSource.repo}". ${error.message}`,
    );
  }

  const sourceDirectory = gitSource.subpath
    ? path.join(cloneDirectory, gitSource.subpath)
    : cloneDirectory;

  await assertDirectoryExists(sourceDirectory, "git.subpath");
  return sourceDirectory;
}

async function copyDirectoryIntoTarget({ sourceDirectory, workspaceDirectory, target }) {
  const targetDirectory = resolveWorkspacePath(workspaceDirectory, target);
  await fs.mkdir(targetDirectory, { recursive: true });

  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await fs.cp(sourcePath, destinationPath, { recursive: true });
      continue;
    }

    if (entry.isFile()) {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
      continue;
    }

    if (entry.isSymbolicLink()) {
      const linkTarget = await fs.readlink(sourcePath);
      await fs.symlink(linkTarget, destinationPath);
    }
  }
}

function resolveLocalPath(inputPath, sourceBaseDirectory) {
  return resolveManifestPath(inputPath, { baseDirectory: sourceBaseDirectory });
}

function resolveWorkspacePath(workspaceDirectory, targetPath) {
  const normalizedRelativePath = targetPath === "/"
    ? ""
    : targetPath.replace(/^[/\\]+/, "");
  const resolvedPath = path.resolve(workspaceDirectory, normalizedRelativePath);

  const relative = path.relative(workspaceDirectory, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Workspace target escapes the workspace root: ${targetPath}`);
  }

  return resolvedPath;
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
