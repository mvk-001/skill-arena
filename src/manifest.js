import path from "node:path";

import { loadValidatedConfig } from "./config-file.js";
import { benchmarkManifestSchema } from "./manifest-schema.js";
import { findWorkspaceRoot, PROJECT_ROOT } from "./project-paths.js";

export async function loadBenchmarkManifest(manifestPath, options = {}) {
  const { config: manifest, configPath: absoluteManifestPath } = await loadValidatedConfig(
    manifestPath,
    benchmarkManifestSchema,
    options,
  );

  return {
    manifest,
    manifestPath: absoluteManifestPath,
    manifestDirectory: path.dirname(absoluteManifestPath),
    workspaceRootDirectory: findWorkspaceRoot(path.dirname(absoluteManifestPath)),
  };
}

export function resolveManifestPath(repositoryRelativePath, options = {}) {
  if (path.isAbsolute(repositoryRelativePath)) {
    return repositoryRelativePath;
  }

  return path.resolve(options.baseDirectory ?? PROJECT_ROOT, repositoryRelativePath);
}

export function findScenario(manifest, scenarioId) {
  const scenario = manifest.scenarios.find((candidate) => candidate.id === scenarioId);

  if (!scenario) {
    throw new Error(
      `Scenario "${scenarioId}" was not found in benchmark "${manifest.benchmark.id}".`,
    );
  }

  return scenario;
}
