import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveManifestPath } from "./manifest.js";
import { createRuntimeIsolation } from "./runtime-isolation.js";

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
  const executionRootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-execution-"));
  const executionWorkspaceDirectory = path.join(executionRootDirectory, "workspace");
  const runtimeIsolation = await createRuntimeIsolation(executionRootDirectory, scenario);

  await fs.mkdir(executionWorkspaceDirectory, { recursive: true });

  for (const source of manifest.workspace.sources) {
    await materializeWorkspaceSource({
      source,
      workspaceDirectory: executionWorkspaceDirectory,
      labelPrefix: "workspace.sources",
      sourceBaseDirectory,
    });
  }

  await sanitizeWorkspaceRoot(executionWorkspaceDirectory);

  if (scenario.skill.install.strategy === "system-installed") {
    throw new Error(
      "Strict isolation does not support system-installed skills. Use a workspace-overlay skill source.",
    );
  }

  if (scenario.skill.install.strategy === "workspace-overlay") {
    await materializeSkillSource({
      skillSource: scenario.skill.source,
      workspaceDirectory: executionWorkspaceDirectory,
      sourceBaseDirectory,
    });
  }

  const mountedSkillIds = await mountConfiguredSkills({
    scenario,
    executionWorkspaceDirectory,
    runtimeIsolation,
  });

  const gitReady = manifest.workspace.setup.initializeGit
    ? await initializeGitRepository(executionWorkspaceDirectory)
    : false;

  const workspace = {
    runId,
    runDirectory,
    workspaceDirectory,
    executionRootDirectory,
    executionWorkspaceDirectory,
    gitReady,
    environment: {
      ...manifest.workspace.setup.env,
    },
    executionEnvironment: runtimeIsolation.environment,
    isolation: {
      executionRootDirectory,
      homeDirectory: runtimeIsolation.homeDirectory,
      codexHomeDirectory: runtimeIsolation.codexHome,
      mountedSkillIds,
    },
  };

  await syncExecutionWorkspaceToArtifacts(workspace);
  return workspace;
}

export async function syncExecutionWorkspaceToArtifacts(workspace) {
  await fs.rm(workspace.workspaceDirectory, { recursive: true, force: true });
  await fs.mkdir(path.dirname(workspace.workspaceDirectory), { recursive: true });
  await fs.cp(workspace.executionWorkspaceDirectory, workspace.workspaceDirectory, {
    recursive: true,
  });
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
      await materializeResolvedSkillDirectory({
        sourceDirectory,
        workspaceDirectory,
        skillId: skillSource.skillId,
      });
      return;
    }
    case "git": {
      const sourceDirectory = await cloneGitSource(skillSource);
      const selectedSkillDirectory = skillSource.skillPath
        ? path.join(sourceDirectory, skillSource.skillPath)
        : sourceDirectory;
      await assertDirectoryExists(selectedSkillDirectory, "skill.source.skillPath");
      await materializeResolvedSkillDirectory({
        sourceDirectory: selectedSkillDirectory,
        workspaceDirectory,
        skillId: skillSource.skillId,
      });
      return;
    }
    case "inline": {
      const skillDirectory = resolveWorkspacePath(
        workspaceDirectory,
        path.posix.join("skills", skillSource.skillId),
      );
      await fs.mkdir(skillDirectory, { recursive: true });
      await fs.writeFile(path.join(skillDirectory, "SKILL.md"), skillSource.content ?? "", "utf8");
      for (const file of skillSource.files ?? []) {
        const outputPath = resolveWorkspacePath(
          workspaceDirectory,
          path.posix.join("skills", skillSource.skillId, file.path),
        );
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, file.content ?? "", "utf8");
      }
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

async function materializeResolvedSkillDirectory({
  sourceDirectory,
  workspaceDirectory,
  skillId,
}) {
  if (await directoryContainsSkillFile(sourceDirectory)) {
    await copyDirectoryIntoTarget({
      sourceDirectory,
      workspaceDirectory,
      target: path.posix.join("/skills", skillId ?? path.basename(sourceDirectory)),
    });
    return;
  }

  await copyDirectoryIntoTarget({
    sourceDirectory,
    workspaceDirectory,
    target: "/",
  });
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

async function sanitizeWorkspaceRoot(workspaceDirectory) {
  await fs.rm(path.join(workspaceDirectory, "AGENTS.md"), { force: true });
  await fs.rm(path.join(workspaceDirectory, "skills"), { recursive: true, force: true });
}

async function mountConfiguredSkills({
  scenario,
  executionWorkspaceDirectory,
  runtimeIsolation,
}) {
  if (scenario.skillMode !== "enabled") {
    runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = "";
    return [];
  }

  const workspaceSkillsDirectory = path.join(executionWorkspaceDirectory, "skills");
  const skillEntries = await fs.readdir(workspaceSkillsDirectory, { withFileTypes: true }).catch(() => []);
  const skillDirectories = skillEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (skillDirectories.length !== 1) {
    throw new Error(
      `Strict isolation requires exactly one configured skill, found ${skillDirectories.length}.`,
    );
  }

  const skillId = skillDirectories[0];
  if (!skillId) {
    runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = "";
    return [];
  }

  await fs.cp(
    path.join(workspaceSkillsDirectory, skillId),
    path.join(runtimeIsolation.codexHome, "skills", skillId),
    { recursive: true },
  );
  runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = skillId;
  return [skillId];
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

async function directoryContainsSkillFile(directoryPath) {
  const stats = await fs.stat(path.join(directoryPath, "SKILL.md")).catch(() => null);
  return Boolean(stats?.isFile());
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
