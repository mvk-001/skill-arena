import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveManifestPath } from "./manifest.js";
import { createRuntimeIsolation } from "./runtime-isolation.js";

const execFileAsync = promisify(execFile);
const gitSourceCache = new Map();

async function writeInlineFiles(workspaceDirectory, files, target = "") {
  for (const file of files) {
    const outputPath = resolveWorkspacePath(workspaceDirectory, path.posix.join(target, file.path));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, file.content ?? "", "utf8");
  }
}

async function copySkillDirectoriesToCodexHome(skillDirectories, sourceDirectory, codexHome) {
  for (const skillId of skillDirectories) {
    await fs.cp(
      path.join(sourceDirectory, skillId),
      path.join(codexHome, "skills", skillId),
      { recursive: true },
    );
  }
}

const WORKSPACE_SOURCE_HANDLERS = {
  "local-path": async ({ source, workspaceDirectory, labelPrefix, sourceBaseDirectory }) => {
    const sourceDirectory = resolveLocalPath(source.path, sourceBaseDirectory);
    await assertDirectoryExists(sourceDirectory, `${labelPrefix}.${source.id ?? source.type}.path`);
    await copyDirectoryIntoTarget({
      sourceDirectory,
      workspaceDirectory,
      target: source.target,
    });
  },
  git: async ({ source, workspaceDirectory }) => {
    const sourceDirectory = await cloneGitSource(source);
    await copyDirectoryIntoTarget({
      sourceDirectory,
      workspaceDirectory,
      target: source.target,
    });
  },
  "inline-files": async ({ source, workspaceDirectory }) => {
    await writeInlineFiles(workspaceDirectory, source.files, source.target);
  },
  empty: async () => {},
};

const SKILL_SOURCE_HANDLERS = {
  "local-path": async ({ skillSource, workspaceDirectory, sourceBaseDirectory }) => {
    const sourceDirectory = resolveLocalPath(skillSource.path, sourceBaseDirectory);
    await assertDirectoryExists(sourceDirectory, "skill.source.path");
    await materializeResolvedSkillDirectory({
      sourceDirectory,
      workspaceDirectory,
      skillId: skillSource.skillId,
    });
  },
  git: async ({ skillSource, workspaceDirectory }) => {
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
  },
  inline: async ({ skillSource, workspaceDirectory }) => {
    const skillDirectory = resolveWorkspacePath(
      workspaceDirectory,
      path.posix.join("skills", skillSource.skillId),
    );
    await fs.mkdir(skillDirectory, { recursive: true });
    await fs.writeFile(path.join(skillDirectory, "SKILL.md"), skillSource.content ?? "", "utf8");
    await writeInlineFiles(
      workspaceDirectory,
      skillSource.files ?? [],
      path.posix.join("skills", skillSource.skillId),
    );
  },
  "inline-files": async ({ skillSource, workspaceDirectory }) => {
    await writeInlineFiles(workspaceDirectory, skillSource.files);
  },
  none: async () => {},
  "system-installed": async () => {},
};

const MATERIALIZABLE_PROFILE_CAPABILITY_FAMILIES = [
  "instructions",
  "agents",
  "hooks",
];

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
  const scenarioSkills = getScenarioSkills(scenario);

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

  await materializeProfileCapabilities({
    scenario,
    workspaceDirectory: executionWorkspaceDirectory,
    sourceBaseDirectory,
  });

  for (const skill of scenarioSkills) {
    if (skill.install.strategy === "system-installed") {
      throw new Error(
        "Strict isolation does not support system-installed skills. Use a workspace-overlay skill source.",
      );
    }

    if (skill.install.strategy === "workspace-overlay") {
      await materializeSkillSource({
        skillSource: skill.source,
        workspaceDirectory: executionWorkspaceDirectory,
        sourceBaseDirectory,
      });
    }
  }

  const mountedSkillIds = await mountConfiguredSkills({
    scenarioSkills,
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
  const handleSource = WORKSPACE_SOURCE_HANDLERS[source.type];

  if (!handleSource) {
    throw new Error(`Unsupported workspace source type "${source.type}".`);
  }

  await handleSource({ source, workspaceDirectory, labelPrefix, sourceBaseDirectory });
}

async function materializeSkillSource({ skillSource, workspaceDirectory, sourceBaseDirectory }) {
  const handleSkillSource = SKILL_SOURCE_HANDLERS[skillSource.type];

  if (!handleSkillSource) {
    throw new Error(`Unsupported skill source type "${skillSource.type}".`);
  }

  await handleSkillSource({ skillSource, workspaceDirectory, sourceBaseDirectory });
}

async function materializeProfileCapabilities({
  scenario,
  workspaceDirectory,
  sourceBaseDirectory,
}) {
  for (const family of MATERIALIZABLE_PROFILE_CAPABILITY_FAMILIES) {
    const entries = Array.isArray(scenario?.profile?.capabilities?.[family])
      ? scenario.profile.capabilities[family]
      : [];

    for (const [index, entry] of entries.entries()) {
      if (!entry?.source) {
        throw new Error(
          `profile.capabilities.${family}[${index}] must declare a materializable source.`,
        );
      }

      await materializeWorkspaceSource({
        source: entry.source,
        workspaceDirectory,
        labelPrefix: `profile.capabilities.${family}`,
        sourceBaseDirectory,
      });
    }
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
  scenarioSkills,
  executionWorkspaceDirectory,
  runtimeIsolation,
}) {
  if (scenarioSkills.length === 0) {
    runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = "";
    return [];
  }

  const workspaceSkillsDirectory = path.join(executionWorkspaceDirectory, "skills");
  const skillEntries = await fs.readdir(workspaceSkillsDirectory, { withFileTypes: true }).catch(() => []);
  const skillDirectories = skillEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (skillDirectories.length === 0) {
    runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = "";
    return [];
  }

  await copySkillDirectoriesToCodexHome(
    skillDirectories,
    workspaceSkillsDirectory,
    runtimeIsolation.codexHome,
  );
  runtimeIsolation.environment.SKILL_ARENA_ALLOWED_SKILLS = skillDirectories.join(",");
  return skillDirectories;
}

function getScenarioSkills(scenario) {
  if (Array.isArray(scenario?.profile?.capabilities?.skills)) {
    return scenario.profile.capabilities.skills;
  }

  if (scenario?.skill?.install?.strategy && scenario.skill.install.strategy !== "none") {
    return [scenario.skill];
  }

  return [];
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
  const execOptions = {
    cwd: workspaceDirectory,
    windowsHide: true,
  };

  try {
    await execFileAsync("git", ["init", "--initial-branch=main"], execOptions);
    return true;
  } catch {
    try {
      await execFileAsync("git", ["init"], execOptions);
      await execFileAsync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], execOptions)
        .catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
}

function createRunId(scenarioId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${scenarioId}`;
}
