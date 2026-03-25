#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const options = parseArgs(args);
const analysisPaths = resolveAnalysisPaths(options.paths);
const binaryPath = resolveBinaryPath(options.binaryPath);

if (!binaryPath) {
  const message = [
    "rust-code-analysis binary not found.",
    "Skipping Codex loop closeout hook.",
    "Set SKILL_ARENA_RUST_CODE_ANALYSIS_BIN, pass --bin <path>, or install the tool described in docs/testing.md.",
  ].join(" ");

  if (options.strict) {
    console.error(message);
    process.exit(1);
  }

  console.log(message);
  process.exit(0);
}

if (analysisPaths.length === 0) {
  console.log("No matching analysis paths found. Skipping Codex loop closeout hook.");
  process.exit(0);
}

const outputDirectory = path.resolve(
  projectRoot,
  options.outputDirectory ?? path.join(".tmp", "rust-code-analysis-loop"),
);
fs.mkdirSync(outputDirectory, { recursive: true });

const commandArgs = [
  "-m",
  "--pr",
  "-O",
  "json",
  ...analysisPaths.flatMap((analysisPath) => ["-p", analysisPath]),
  "-I",
  "*.js",
  "-o",
  outputDirectory,
];

const execution = buildExecution(binaryPath, commandArgs);
const result = spawnSync(execution.command, execution.args, {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: "pipe",
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outputFiles = listJsonFiles(outputDirectory);
console.log(
  [
    "Codex loop closeout hook completed.",
    `Analyzed paths: ${analysisPaths.join(", ")}.`,
    `Output directory: ${outputDirectory}.`,
    `JSON artifacts: ${outputFiles.length}.`,
  ].join(" "),
);

function parseArgs(rawArgs) {
  const options = {
    paths: [],
    binaryPath: null,
    outputDirectory: null,
    strict: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    switch (arg) {
      case "--path":
        options.paths.push(readRequiredValue(rawArgs, ++index, "--path"));
        break;
      case "--bin":
        options.binaryPath = readRequiredValue(rawArgs, ++index, "--bin");
        break;
      case "--output-dir":
        options.outputDirectory = readRequiredValue(rawArgs, ++index, "--output-dir");
        break;
      case "--strict":
        options.strict = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readRequiredValue(argv, index, optionName) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function resolveBinaryPath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN,
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "skill-arena",
      "tools",
      "rust-code-analysis",
      "target",
      "release",
      process.platform === "win32" ? "rust-code-analysis-cli.exe" : "rust-code-analysis-cli",
    ),
    process.platform === "win32" ? "rust-code-analysis-cli.exe" : "rust-code-analysis-cli",
    "rust-code-analysis-cli",
    process.platform === "win32" ? "rust-code-analysis" : "rust-code-analysis",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveExecutable(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function buildExecution(binaryPath, commandArgs) {
  if (/\.(cjs|mjs|js)$/i.test(binaryPath)) {
    return {
      command: process.execPath,
      args: [binaryPath, ...commandArgs],
    };
  }

  return {
    command: binaryPath,
    args: commandArgs,
  };
}

function resolveExecutable(candidate) {
  if (!candidate) {
    return null;
  }

  if (path.isAbsolute(candidate) || candidate.includes(path.sep)) {
    return fs.existsSync(candidate) ? candidate : null;
  }

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidatePath = path.join(entry, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function resolveAnalysisPaths(requestedPaths) {
  const defaults = ["src", "test", "bin", path.join("skills", "skill-arena-compare", "scripts")];
  const candidates = requestedPaths.length > 0 ? requestedPaths : defaults;

  return candidates
    .map((candidate) => path.resolve(projectRoot, candidate))
    .filter((candidatePath) => fs.existsSync(candidatePath))
    .map((candidatePath) => path.relative(projectRoot, candidatePath).split(path.sep).join("/"))
    .filter((candidatePath, index, allPaths) => allPaths.indexOf(candidatePath) === index);
}

function listJsonFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function printHelp() {
  console.log(`Usage: node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js [options]

Run rust-code-analysis as the Codex loop closeout guardrail for this repository.

Options:
  --path <relative-path>   Repeat to override the default analysis paths.
  --bin <path>             Explicit rust-code-analysis binary path.
  --output-dir <path>      Override the output directory. Default: .tmp/rust-code-analysis-loop
  --strict                 Fail when the binary is missing instead of skipping.
  --help, -h               Show this help message.
`);
}
