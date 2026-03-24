import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_IGNORED_DIRECTORIES = new Set([".git"]);

export async function captureWorkspaceSnapshot(workspaceDirectory) {
  const snapshot = new Map();
  await walkWorkspace(workspaceDirectory, workspaceDirectory, snapshot);
  return snapshot;
}

export async function analyzeWorkspaceMetricDelta({
  beforeSnapshot,
  afterSnapshot,
  analyzeFileMetrics = analyzeFileWithRustCodeAnalysis,
}) {
  const modifiedOriginalFiles = [];
  const metricSamples = new Map();

  for (const [relativePath, beforeEntry] of beforeSnapshot.entries()) {
    const afterEntry = afterSnapshot.get(relativePath);

    if (!afterEntry || beforeEntry.sha1 === afterEntry.sha1) {
      continue;
    }

    const beforeMetrics = await analyzeFileMetrics({
      relativePath,
      fileContent: beforeEntry.content,
    });
    const afterMetrics = await analyzeFileMetrics({
      relativePath,
      fileContent: afterEntry.content,
    });
    const metricDeltas = diffMetricMaps(beforeMetrics, afterMetrics);

    if (metricDeltas.size === 0) {
      continue;
    }

    modifiedOriginalFiles.push(relativePath);

    for (const [metricName, delta] of metricDeltas.entries()) {
      const samples = metricSamples.get(metricName) ?? [];
      samples.push(delta);
      metricSamples.set(metricName, samples);
    }
  }

  if (modifiedOriginalFiles.length === 0 || metricSamples.size === 0) {
    return null;
  }

  return {
    changedOriginalFiles: modifiedOriginalFiles.sort(),
    metrics: Object.fromEntries(
      [...metricSamples.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([metricName, samples]) => [
          metricName,
          summarizeSamples(samples),
        ]),
    ),
  };
}

export async function analyzeFileWithRustCodeAnalysis({
  relativePath,
  fileContent,
  command = process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN ?? "rust-code-analysis-cli",
}) {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-rca-"));
  const filePath = path.join(tempDirectory, path.basename(relativePath));

  try {
    await fs.writeFile(filePath, fileContent);
    const { executable, args } = buildRustCodeAnalysisCommand(command, filePath);
    const { stdout } = await execFileAsync(
      executable,
      args,
      {
        windowsHide: true,
      },
    );

    return extractMetricMapFromRustCodeAnalysis(stdout);
  } catch (error) {
    if (isMissingCommandError(error)) {
      return new Map();
    }

    return new Map();
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

export function extractMetricMapFromRustCodeAnalysis(outputText) {
  if (typeof outputText !== "string" || outputText.trim().length === 0) {
    return new Map();
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return new Map();
  }

  const rootRecord = Array.isArray(parsed) ? parsed[0] : parsed;
  const metricsRoot = rootRecord?.metrics;

  if (!metricsRoot || typeof metricsRoot !== "object") {
    return new Map();
  }

  const flattenedMetrics = new Map();
  flattenMetricObject(metricsRoot, "", flattenedMetrics);
  return flattenedMetrics;
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      count: 0,
      avg: null,
      standardDeviation: null,
      samples: [],
    };
  }

  const count = samples.length;
  const avg = samples.reduce((sum, value) => sum + value, 0) / count;
  const variance = samples.reduce(
    (sum, value) => sum + ((value - avg) ** 2),
    0,
  ) / count;

  return {
    count,
    avg,
    standardDeviation: Math.sqrt(variance),
    samples: [...samples],
  };
}

function diffMetricMaps(beforeMetrics, afterMetrics) {
  const deltas = new Map();
  const metricNames = new Set([
    ...beforeMetrics.keys(),
    ...afterMetrics.keys(),
  ]);

  for (const metricName of metricNames) {
    const beforeValue = beforeMetrics.get(metricName);
    const afterValue = afterMetrics.get(metricName);

    if (typeof beforeValue !== "number" || typeof afterValue !== "number") {
      continue;
    }

    const delta = afterValue - beforeValue;
    if (delta !== 0) {
      deltas.set(metricName, delta);
    }
  }

  return deltas;
}

async function walkWorkspace(workspaceDirectory, currentDirectory, snapshot) {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = path.relative(workspaceDirectory, absolutePath).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await walkWorkspace(workspaceDirectory, absolutePath, snapshot);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = await fs.readFile(absolutePath);
    snapshot.set(relativePath, {
      content,
      sha1: crypto.createHash("sha1").update(content).digest("hex"),
    });
  }
}

function flattenMetricObject(value, prefix, flattenedMetrics) {
  for (const [key, childValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (typeof childValue === "number" && Number.isFinite(childValue)) {
      flattenedMetrics.set(nextPrefix, childValue);
      continue;
    }

    if (childValue && typeof childValue === "object" && !Array.isArray(childValue)) {
      flattenMetricObject(childValue, nextPrefix, flattenedMetrics);
    }
  }
}

function isMissingCommandError(error) {
  return error?.code === "ENOENT"
    || /not recognized/i.test(error?.message ?? "")
    || /not found/i.test(error?.message ?? "");
}

function buildRustCodeAnalysisCommand(command, filePath) {
  const args = ["-m", "-p", filePath, "--pr", "-O", "json"];

  if (typeof command === "string" && [".js", ".mjs", ".cjs"].includes(path.extname(command))) {
    return {
      executable: process.execPath,
      args: [command, ...args],
    };
  }

  return {
    executable: command,
    args,
  };
}
