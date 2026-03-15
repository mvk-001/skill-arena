import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";
import { ZodError } from "zod";

import { benchmarkManifestSchema } from "./manifest-schema.js";
import { PROJECT_ROOT } from "./project-paths.js";

export async function loadBenchmarkManifest(manifestPath) {
  const absoluteManifestPath = path.resolve(process.cwd(), manifestPath);
  const manifestContents = await fs.readFile(absoluteManifestPath, "utf8");
  const parsedManifest = parseManifestContents({
    manifestContents,
    manifestPath: absoluteManifestPath,
  });

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

function parseManifestContents({ manifestContents, manifestPath }) {
  const extension = path.extname(manifestPath).toLowerCase();

  try {
    if (extension === ".yaml" || extension === ".yml") {
      return YAML.parse(manifestContents);
    }

    return JSON.parse(manifestContents);
  } catch (error) {
    throw new Error(
      `Failed to parse manifest "${manifestPath}". Expected valid ${extension === ".yaml" || extension === ".yml" ? "YAML" : "JSON"}. ${error.message}`,
    );
  }
}

export function resolveManifestPath(repositoryRelativePath) {
  if (path.isAbsolute(repositoryRelativePath)) {
    return repositoryRelativePath;
  }

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
