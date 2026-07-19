#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const STUDY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REPO_ROOT = path.resolve(STUDY_ROOT, "..", "..");
const DEFAULT_KNOWLEDGE_ROOT = path.resolve(REPO_ROOT, "..", "knowledge");
const DEFAULT_OUTPUT_ROOT = path.resolve(
  REPO_ROOT,
  ".tmp",
  "knowledge-consult-evolution",
  "prepared",
);

function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(filePath) {
  return digestBytes(await fs.readFile(filePath));
}

async function collectTreeFiles(root, current = root, files = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "__pycache__") {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Tree contains unsupported symbolic link: ${absolute}`);
    }
    if (entry.isDirectory()) {
      await collectTreeFiles(root, absolute, files);
      continue;
    }
    if (entry.isFile()) {
      files.push({
        absolute,
        relative: path.relative(root, absolute).split(path.sep).join("/"),
      });
    }
  }
  return files;
}

export async function treeDigest(root) {
  const files = await collectTreeFiles(path.resolve(root));
  files.sort((left, right) => Buffer.compare(
    Buffer.from(left.relative, "utf8"),
    Buffer.from(right.relative, "utf8"),
  ));
  const digest = createHash("sha256");
  let totalBytes = 0;
  for (const file of files) {
    const bytes = await fs.readFile(file.absolute);
    totalBytes += bytes.length;
    digest.update(Buffer.from(file.relative, "utf8"));
    digest.update(Buffer.from([0]));
    digest.update(bytes);
    digest.update(Buffer.from([0]));
  }
  return {
    sha256: digest.digest("hex"),
    fileCount: files.length,
    totalBytes,
  };
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} drift: expected ${expected}, found ${actual}`);
  }
}

function resolveInside(root, relativePath, label) {
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its root: ${relativePath}`);
  }
  return candidate;
}

export function assertOutputWithinTmp(outputRoot, repoRoot = REPO_ROOT) {
  const resolvedOutput = path.resolve(outputRoot);
  const tmpRoot = path.resolve(repoRoot, ".tmp");
  const relative = path.relative(tmpRoot, resolvedOutput);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Output must be a child of ${tmpRoot}: ${resolvedOutput}`);
  }
  return resolvedOutput;
}

function run(command, args, options = {}) {
  const completed = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (completed.error) {
    throw completed.error;
  }
  if (completed.status !== 0) {
    const detail = options.capture
      ? `\n${completed.stderr || completed.stdout}`
      : "";
    throw new Error(`${command} exited with status ${completed.status}${detail}`);
  }
  return options.capture ? completed.stdout.trim() : "";
}

function gitOutput(knowledgeRoot, args) {
  return run("git", ["-C", knowledgeRoot, ...args], { capture: true });
}

function pythonEnvironment() {
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

function runPython(python, script, args) {
  run(python, [script, ...args], { env: pythonEnvironment() });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function deterministicJson(value) {
  function canonicalize(item) {
    if (Array.isArray(item)) {
      return item.map(canonicalize);
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.keys(item).sort().map((key) => [key, canonicalize(item[key])]),
      );
    }
    return item;
  }
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function cohortCounts(cohorts) {
  return Object.fromEntries(
    Object.entries(cohorts).map(([name, ids]) => [name, ids.length]),
  );
}

export async function verifySourceFreeze({ knowledgeRoot, protocol }) {
  const commit = gitOutput(knowledgeRoot, ["rev-parse", "HEAD"]);
  requireEqual(commit, protocol.sourceFreeze.repository.commit, "knowledge commit");

  for (const entry of protocol.sourceFreeze.files) {
    const filePath = resolveInside(knowledgeRoot, entry.path, "frozen file");
    requireEqual(await sha256File(filePath), entry.sha256, entry.path);
  }

  for (const entry of protocol.sourceFreeze.trees) {
    const treePath = resolveInside(knowledgeRoot, entry.path, "frozen tree");
    const actual = await treeDigest(treePath);
    requireEqual(actual.sha256, entry.sha256, `${entry.path} tree SHA-256`);
    requireEqual(actual.fileCount, entry.fileCount, `${entry.path} file count`);
    requireEqual(actual.totalBytes, entry.totalBytes, `${entry.path} byte count`);
  }

  const descriptor = await readJson(resolveInside(
    knowledgeRoot,
    protocol.sourceFreeze.dataset.descriptorPath,
    "dataset descriptor",
  ));
  requireEqual(descriptor.dataset_id, protocol.sourceFreeze.dataset.id, "dataset ID");
  requireEqual(
    descriptor.reference_bundle,
    protocol.sourceFreeze.dataset.referenceBundlePath,
    "reference bundle path",
  );

  const cohortsEntry = protocol.sourceFreeze.files.find((entry) => (
    entry.path === protocol.sourceFreeze.dataset.cohortsPath
  ));
  if (!cohortsEntry) {
    throw new Error("Protocol has no frozen cohort file");
  }
  const cohortDocument = await readJson(resolveInside(knowledgeRoot, cohortsEntry.path, "cohorts"));
  const expectedCohorts = protocol.benchmark.cohorts;
  requireEqual(
    deterministicJson(cohortDocument.cohorts),
    deterministicJson(expectedCohorts),
    "cohort membership",
  );

  return { commit, descriptor, cohorts: cohortDocument.cohorts };
}

async function copyBaselineSkill(source, destination) {
  await fs.cp(source, destination, {
    recursive: true,
    filter(candidate) {
      return !candidate.split(path.sep).includes("__pycache__");
    },
  });
}

export async function buildReceipt({ knowledgeRoot, outputRoot, protocol }) {
  const dataset = protocol.sourceFreeze.dataset;
  const bundle = resolveInside(knowledgeRoot, dataset.referenceBundlePath, "reference bundle");
  const baselineSource = resolveInside(knowledgeRoot, dataset.baselineSkillPath, "baseline skill");
  const grader = resolveInside(knowledgeRoot, dataset.graderPath, "grader");
  const tasks = path.join(outputRoot, "tasks");
  const baselineSkill = path.join(outputRoot, "baseline-skill");
  const taskManifest = await readJson(path.join(tasks, "manifest.json"));
  const counts = cohortCounts(protocol.benchmark.cohorts);

  requireEqual(taskManifest.dataset_id, dataset.id, "generated dataset ID");
  requireEqual(taskManifest.family, dataset.family, "generated family");
  requireEqual(taskManifest.mode, dataset.mode, "generated mode");
  requireEqual(
    deterministicJson(taskManifest.cohort_counts),
    deterministicJson(counts),
    "generated cohort counts",
  );

  const [bundleTree, baselineSourceTree, graderTree, taskTree, baselineTree] = await Promise.all([
    treeDigest(bundle),
    treeDigest(baselineSource),
    treeDigest(grader),
    treeDigest(tasks),
    treeDigest(baselineSkill),
  ]);
  requireEqual(
    taskManifest.reference_bundle_tree_sha256,
    bundleTree.sha256,
    "generated reference bundle binding",
  );
  requireEqual(baselineTree.sha256, baselineSourceTree.sha256, "baseline copy tree SHA-256");

  return {
    schemaVersion: 1,
    studyId: protocol.studyId,
    knowledgeCommit: protocol.sourceFreeze.repository.commit,
    dataset: {
      id: dataset.id,
      family: dataset.family,
      mode: dataset.mode,
      cohortCounts: counts,
    },
    source: {
      referenceBundleTreeSha256: bundleTree.sha256,
      referenceLedgerSha256: await sha256File(path.join(bundle, "semantic", "records.jsonl")),
      baselineSkillTreeSha256: baselineSourceTree.sha256,
      graderTreeSha256: graderTree.sha256,
    },
    materialized: {
      tasks: {
        treeSha256: taskTree.sha256,
        manifestSha256: await sha256File(path.join(tasks, "manifest.json")),
        fileCount: taskTree.fileCount,
        totalBytes: taskTree.totalBytes,
      },
      baselineSkill: {
        treeSha256: baselineTree.sha256,
        fileCount: baselineTree.fileCount,
        totalBytes: baselineTree.totalBytes,
      },
    },
  };
}

export function compareReceipts(actual, expected, label = "receipt") {
  requireEqual(deterministicJson(actual), deterministicJson(expected), label);
}

async function materialize({ knowledgeRoot, outputRoot, protocol, python }) {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  const dataset = protocol.sourceFreeze.dataset;
  const generator = resolveInside(
    knowledgeRoot,
    "evaluations/semantic-okf-datasets/generate_harbor_tasks.py",
    "task generator",
  );
  const tasks = path.join(outputRoot, "tasks");
  const bundle = resolveInside(knowledgeRoot, dataset.referenceBundlePath, "reference bundle");
  runPython(python, generator, [
    "--dataset", dataset.id,
    "--family", dataset.family,
    "--mode", dataset.mode,
    "--bundle", bundle,
    "--output", tasks,
  ]);
  await copyBaselineSkill(
    resolveInside(knowledgeRoot, dataset.baselineSkillPath, "baseline skill"),
    path.join(outputRoot, "baseline-skill"),
  );
}

async function validateMaterialization({ knowledgeRoot, outputRoot, protocol, python }) {
  const dataset = protocol.sourceFreeze.dataset;
  const bundle = resolveInside(knowledgeRoot, dataset.referenceBundlePath, "reference bundle");
  const tasks = path.join(outputRoot, "tasks");
  const validator = resolveInside(
    knowledgeRoot,
    "evaluations/semantic-okf-datasets/validate_harbor_tasks.py",
    "task validator",
  );
  runPython(python, validator, [
    "--dataset", dataset.id,
    "--family", dataset.family,
    "--mode", dataset.mode,
    "--tasks", tasks,
    "--bundle", bundle,
  ]);
}

function parseArguments(argv) {
  const command = argv[0] ?? "prepare";
  if (!new Set(["prepare", "verify"]).has(command)) {
    throw new Error(`Unknown command ${command}; choose prepare or verify`);
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --flag value, found ${flag ?? "end of arguments"}`);
    }
    values.set(flag.slice(2), value);
  }
  return {
    command,
    knowledgeRoot: path.resolve(values.get("knowledge-root") ?? DEFAULT_KNOWLEDGE_ROOT),
    outputRoot: path.resolve(values.get("output") ?? DEFAULT_OUTPUT_ROOT),
    python: values.get("python") ?? process.env.PYTHON ?? "python",
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  options.outputRoot = assertOutputWithinTmp(options.outputRoot);
  const protocol = await readJson(path.join(STUDY_ROOT, "protocol.json"));
  const expectedReceipt = await readJson(path.join(STUDY_ROOT, "receipt.lock.json"));
  const statusBefore = gitOutput(options.knowledgeRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);

  let receipt;
  let operationError;
  try {
    await verifySourceFreeze({ knowledgeRoot: options.knowledgeRoot, protocol });
    const datasetTool = resolveInside(
      options.knowledgeRoot,
      "evaluations/semantic-okf-datasets/dataset_tool.py",
      "dataset tool",
    );
    runPython(options.python, datasetTool, [
      "validate",
      "--dataset", protocol.sourceFreeze.dataset.id,
      "--family", protocol.sourceFreeze.dataset.family,
    ]);

    if (options.command === "prepare") {
      await materialize({ ...options, protocol });
    } else {
      await fs.access(path.join(options.outputRoot, "tasks", "manifest.json"));
      await fs.access(path.join(options.outputRoot, "baseline-skill", "SKILL.md"));
    }

    await validateMaterialization({ ...options, protocol });
    receipt = await buildReceipt({
      knowledgeRoot: options.knowledgeRoot,
      outputRoot: options.outputRoot,
      protocol,
    });
    compareReceipts(receipt, expectedReceipt, "tracked receipt");

    const receiptPath = path.join(options.outputRoot, "receipt.json");
    if (options.command === "prepare") {
      await fs.writeFile(receiptPath, deterministicJson(receipt), "utf8");
    } else {
      compareReceipts(await readJson(receiptPath), receipt, "materialized receipt");
    }
  } catch (error) {
    operationError = error;
  }

  const statusAfter = gitOutput(options.knowledgeRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  requireEqual(statusAfter, statusBefore, "knowledge working tree");
  if (operationError) {
    throw operationError;
  }
  process.stdout.write(`${options.command} passed: ${receipt.materialized.tasks.treeSha256}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
