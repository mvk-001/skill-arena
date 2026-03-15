import fs from "node:fs/promises";
import path from "node:path";

import { fromPackageRoot } from "./project-paths.js";

const bootstrapPathCache = new Map();

export async function ensureCompareScenarioLocalPaths({
  manifest,
  scenario,
  outputRootDirectory,
}) {
  const localPaths = collectScenarioLocalPaths({ manifest, scenario });

  for (const localPath of localPaths) {
    await ensureCompareLocalPath({
      inputPath: localPath.path,
      label: localPath.label,
      outputRootDirectory,
    });
  }
}

function collectScenarioLocalPaths({ manifest, scenario }) {
  const localPaths = manifest.workspace.sources
    .filter((source) => source.type === "local-path")
    .map((source) => ({
      path: source.path,
      label: `workspace.sources.${source.id ?? source.type}.path`,
    }));

  if (
    scenario.skill.install.strategy === "workspace-overlay"
    && scenario.skill.source.type === "local-path"
  ) {
    localPaths.push({
      path: scenario.skill.source.path,
      label: "skill.source.path",
    });
  }

  return localPaths;
}

async function ensureCompareLocalPath({
  inputPath,
  label,
  outputRootDirectory,
}) {
  if (path.isAbsolute(inputPath)) {
    return;
  }

  const resolvedPath = path.resolve(outputRootDirectory, inputPath);
  const stats = await fs.stat(resolvedPath).catch(() => null);

  if (stats?.isDirectory()) {
    return;
  }

  if (stats && !stats.isDirectory()) {
    throw new Error(`${label} exists but is not a directory: ${resolvedPath}`);
  }

  if (!bootstrapPathCache.has(resolvedPath)) {
    bootstrapPathCache.set(resolvedPath, bootstrapMissingComparePath({
      inputPath,
      label,
      resolvedPath,
    }));
  }

  await bootstrapPathCache.get(resolvedPath);
}

async function bootstrapMissingComparePath({
  inputPath,
  label,
  resolvedPath,
}) {
  const existingStats = await fs.stat(resolvedPath).catch(() => null);

  if (existingStats?.isDirectory()) {
    return;
  }

  if (existingStats && !existingStats.isDirectory()) {
    throw new Error(`${label} exists but is not a directory: ${resolvedPath}`);
  }

  const bootstrapSourceDirectory = await findBootstrapSourceDirectory(inputPath);

  if (!bootstrapSourceDirectory) {
    throw new Error(
      `${label} does not exist or is not a directory: ${resolvedPath}`,
    );
  }

  await copyDirectoryWithoutAgents({
    sourceDirectory: bootstrapSourceDirectory,
    destinationDirectory: resolvedPath,
  });
}

async function findBootstrapSourceDirectory(inputPath) {
  const packageFixturesDirectory = fromPackageRoot("fixtures");
  const requestedSuffix = normalizeRelativeSuffix(inputPath);
  const candidateDirectories = [];

  await walkDirectories(packageFixturesDirectory, async (directoryPath) => {
    const packageRelativeDirectory = path.relative(fromPackageRoot(), directoryPath);
    if (normalizeRelativeSuffix(packageRelativeDirectory).endsWith(requestedSuffix)) {
      candidateDirectories.push(directoryPath);
    }
  });

  if (candidateDirectories.length === 1) {
    return candidateDirectories[0];
  }

  if (candidateDirectories.length > 1) {
    throw new Error(
      `Multiple package fixture directories match the missing compare path "${inputPath}". Use an absolute path or a more specific relative path.`,
    );
  }

  return null;
}

async function walkDirectories(rootDirectory, visitDirectory) {
  const rootStats = await fs.stat(rootDirectory).catch(() => null);

  if (!rootStats?.isDirectory()) {
    return;
  }

  await visitDirectory(rootDirectory);

  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    await walkDirectories(path.join(rootDirectory, entry.name), visitDirectory);
  }
}

async function copyDirectoryWithoutAgents({
  sourceDirectory,
  destinationDirectory,
}) {
  await fs.mkdir(destinationDirectory, { recursive: true });
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.toLowerCase() === "agents.md") {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryWithoutAgents({
        sourceDirectory: sourcePath,
        destinationDirectory: destinationPath,
      });
      continue;
    }

    if (entry.isFile()) {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

function normalizeRelativeSuffix(inputPath) {
  return inputPath
    .replace(/^\.([/\\]|$)/, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .toLowerCase();
}
