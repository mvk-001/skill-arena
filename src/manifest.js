import fs from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { benchmarkManifestSchema } from "./manifest-schema.js";
import { PROJECT_ROOT } from "./project-paths.js";

export async function loadBenchmarkManifest(manifestPath) {
  const absoluteManifestPath = path.resolve(process.cwd(), manifestPath);
  const manifestContents = await fs.readFile(absoluteManifestPath, "utf8");
  const parsedManifest = JSON.parse(manifestContents);

  try {
    const manifest = benchmarkManifestSchema.parse(parsedManifest);
    return {
      manifest,
      manifestPath: absoluteManifestPath,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatManifestErrors(error));
    }

    throw error;
  }
}

export function resolveManifestPath(repositoryRelativePath) {
  return path.resolve(PROJECT_ROOT, repositoryRelativePath);
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

function formatManifestErrors(error) {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("\n");
}
