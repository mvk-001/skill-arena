import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveManifestPath } from "./manifest.js";

export async function computeScenarioReuseFingerprints({
  manifest,
  scenarios,
  sourceBaseDirectory = process.cwd(),
}) {
  const workspaceFingerprint = await fingerprintWorkspace(
    manifest.workspace,
    sourceBaseDirectory,
  );
  const taskFingerprint = stableValue(manifest.task);
  const fingerprints = new Map();

  for (const scenario of scenarios) {
    const fingerprintInput = {
      benchmarkId: manifest.benchmark.id,
      task: taskFingerprint,
      workspace: workspaceFingerprint,
      scenario: {
        id: scenario.id,
        skillMode: scenario.skillMode,
        skillSource: scenario.skillSource,
        agent: stableValue(scenario.agent),
        evaluation: stableValue(scenario.evaluation),
        output: stableValue(scenario.output),
        profile: await fingerprintProfile(scenario.profile, sourceBaseDirectory),
        skill: await fingerprintSkillDefinition(scenario.skill, sourceBaseDirectory),
      },
    };

    fingerprints.set(scenario.id, hashObject(fingerprintInput));
  }

  return fingerprints;
}

export async function planScenarioReuse({
  manifest,
  scenarios,
  outputRootDirectory,
  sourceBaseDirectory = outputRootDirectory,
  evaluationRequests,
}) {
  const scenarioFingerprints = await computeScenarioReuseFingerprints({
    manifest,
    scenarios,
    sourceBaseDirectory,
  });
  const previousRun = await findLatestCompareSummary({
    benchmarkId: manifest.benchmark.id,
    outputRootDirectory,
  });

  if (!previousRun) {
    return {
      previousRun: null,
      scenarioFingerprints,
      reusableScenarioIds: new Set(),
      reusedScenarioSummaries: new Map(),
      freshScenarios: [...scenarios],
    };
  }

  const reusableScenarioIds = new Set();
  const reusedScenarioSummaries = new Map();
  const freshScenarios = [];
  const promptCount = Array.isArray(manifest.task?.prompts) ? manifest.task.prompts.length : 1;
  const requiredOutputCount = promptCount * evaluationRequests;
  const previousScenarioMap = new Map(
    (previousRun.summary.scenarioSummaries ?? []).map((summary) => [summary.scenarioId, summary]),
  );

  for (const scenario of scenarios) {
    const previousSummary = previousScenarioMap.get(scenario.id);
    const nextFingerprint = scenarioFingerprints.get(scenario.id);
    const previousFingerprint = previousSummary?.reuseFingerprint ?? null;
    const outputCount = Array.isArray(previousSummary?.outputs) ? previousSummary.outputs.length : 0;

    if (
      previousSummary
      && previousFingerprint
      && previousFingerprint === nextFingerprint
      && outputCount === requiredOutputCount
    ) {
      reusableScenarioIds.add(scenario.id);
      reusedScenarioSummaries.set(scenario.id, previousSummary);
      continue;
    }

    freshScenarios.push(scenario);
  }

  return {
    previousRun,
    scenarioFingerprints,
    reusableScenarioIds,
    reusedScenarioSummaries,
    freshScenarios,
  };
}

export async function findLatestCompareSummary({
  benchmarkId,
  outputRootDirectory,
}) {
  const benchmarkResultsDirectory = path.join(
    outputRootDirectory,
    "results",
    benchmarkId,
  );
  const entries = await fs.readdir(benchmarkResultsDirectory, { withFileTypes: true }).catch(() => []);
  const candidateDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-compare"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const directoryName of candidateDirectories) {
    const compareRunDirectory = path.join(benchmarkResultsDirectory, directoryName);
    const summaryPath = path.join(compareRunDirectory, "summary.json");
    const summary = await readJson(summaryPath).catch(() => null);

    if (summary) {
      return {
        compareRunDirectory,
        summaryPath,
        summary,
      };
    }
  }

  return null;
}

export function createEmptyPromptfooResultsEnvelope() {
  return {
    results: {
      stats: {},
      outputs: [],
    },
    metadata: {
      promptfooVersion: null,
    },
  };
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function fingerprintWorkspace(workspace, sourceBaseDirectory) {
  return {
    setup: stableValue(workspace.setup),
    sources: await Promise.all(
      (workspace.sources ?? []).map((source) =>
        fingerprintMaterializedSource(source, sourceBaseDirectory),
      ),
    ),
  };
}

async function fingerprintProfile(profile, sourceBaseDirectory) {
  if (!profile) {
    return null;
  }

  const capabilities = {};
  for (const [family, entries] of Object.entries(profile.capabilities ?? {})) {
    capabilities[family] = await Promise.all(
      (entries ?? []).map((entry) => fingerprintCapabilityEntry(entry, sourceBaseDirectory)),
    );
  }

  return {
    id: profile.id,
    description: profile.description ?? null,
    isolation: stableValue(profile.isolation),
    capabilities,
  };
}

async function fingerprintCapabilityEntry(entry, sourceBaseDirectory) {
  return {
    ...stableValue({
      ...entry,
      source: undefined,
    }),
    source: await fingerprintMaterializedSource(entry.source, sourceBaseDirectory),
  };
}

async function fingerprintSkillDefinition(skill, sourceBaseDirectory) {
  if (!skill) {
    return null;
  }

  return {
    install: stableValue(skill.install),
    source: await fingerprintSkillSource(skill.source, sourceBaseDirectory),
  };
}

async function fingerprintSkillSource(skillSource, sourceBaseDirectory) {
  if (!skillSource) {
    return null;
  }

  switch (skillSource.type) {
    case "local-path":
      return {
        ...stableValue(skillSource),
        resolvedPath: resolveManifestPath(skillSource.path, { baseDirectory: sourceBaseDirectory }),
        contentHash: await hashDirectory(
          resolveManifestPath(skillSource.path, { baseDirectory: sourceBaseDirectory }),
        ),
      };
    case "inline":
      return {
        ...stableValue(skillSource),
        contentHash: hashObject({
          content: skillSource.content ?? "",
          files: stableValue(skillSource.files ?? []),
        }),
      };
    case "inline-files":
      return {
        ...stableValue(skillSource),
        contentHash: hashObject(skillSource.files ?? []),
      };
    case "git":
    case "none":
    case "system-installed":
      return stableValue(skillSource);
    default:
      return stableValue(skillSource);
  }
}

async function fingerprintMaterializedSource(source, sourceBaseDirectory) {
  if (!source) {
    return null;
  }

  switch (source.type) {
    case "local-path": {
      const resolvedPath = resolveManifestPath(source.path, { baseDirectory: sourceBaseDirectory });
      return {
        ...stableValue(source),
        resolvedPath,
        contentHash: await hashDirectory(resolvedPath),
      };
    }
    case "inline-files":
      return {
        ...stableValue(source),
        contentHash: hashObject(source.files ?? []),
      };
    case "git":
    case "empty":
      return stableValue(source);
    default:
      return stableValue(source);
  }
}

async function hashDirectory(directoryPath) {
  const stats = await fs.stat(directoryPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Reuse fingerprint path does not exist or is not a directory: ${directoryPath}`);
  }

  const entries = [];
  await collectDirectoryEntries(directoryPath, directoryPath, entries);
  return hashObject(entries.sort((left, right) => left.path.localeCompare(right.path)));
}

async function collectDirectoryEntries(rootDirectory, currentDirectory, entries) {
  const children = await fs.readdir(currentDirectory, { withFileTypes: true });

  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPath = path.join(currentDirectory, child.name);
    const relativePath = path.relative(rootDirectory, childPath).split(path.sep).join("/");

    if (child.isDirectory()) {
      entries.push({ type: "directory", path: relativePath });
      await collectDirectoryEntries(rootDirectory, childPath, entries);
      continue;
    }

    if (child.isFile()) {
      const content = await fs.readFile(childPath);
      entries.push({
        type: "file",
        path: relativePath,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
      });
      continue;
    }

    if (child.isSymbolicLink()) {
      entries.push({
        type: "symlink",
        path: relativePath,
        target: await fs.readlink(childPath),
      });
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }

  return value ?? null;
}
