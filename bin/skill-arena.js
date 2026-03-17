#!/usr/bin/env node
import fs from "node:fs";
import { spawn } from "node:child_process";

import { fromPackageRoot } from "../src/project-paths.js";

const command = process.argv[2];
const passthroughArgs = process.argv.slice(3);
const packageJsonPath = fromPackageRoot("package.json");
const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;

const commandMap = {
  evaluate: fromPackageRoot("src", "cli", "run-evaluate.js"),
  "gen-conf": fromPackageRoot("src", "cli", "generate-compare-template.js"),
  "val-conf": fromPackageRoot("src", "cli", "validate-manifest.js"),
};

const commandDetails = {
  evaluate: {
    usage: "evaluate <manifest-or-compare-path> [--scenario <scenario-id>] [--requests <n>] [--max-concurrency <n>] [--dry-run] [--verbose]",
    description:
      "Run one benchmark manifest or compare config. Compare configs auto-route to compare execution.",
    options: [
      "--scenario <scenario-id>: run only one manifest scenario (not valid for compare configs)",
      "--requests <n>: override effective evaluation requests for this run",
      "--max-concurrency <n>: override effective maxConcurrency for this run",
      "--dry-run: generate promptfoo config and skip execution",
      "--verbose: print full internal artifact paths and raw output",
      "--help: show evaluate usage",
    ],
    examples: [
      "./benchmarks/smoke-skill-following/manifest.json --scenario codex-mini-no-skill",
      "./benchmarks/smoke-skill-following/manifest.json --dry-run",
      "./benchmarks/skill-arena-compare/compare.yaml --dry-run",
      "./benchmarks/skill-arena-compare/compare.yaml",
    ],
  },
  "gen-conf": {
    usage: "gen-conf [--output <path>] [--prompt <text>] [options]",
    description:
      "Generate a commented compare config template with TODO placeholders for fast authoring.",
    options: [
      "--output <path>: destination file path (default: ./compare.generated.yaml)",
      "--prompt <text>: add one task prompt row; repeat to add more rows",
      "--prompt-description <text>: optional description for the next prompt row; repeatable",
      "--evaluation-type <type>: add one shared assertion type; repeatable",
      "--evaluation-value <value>: add one shared assertion value; repeatable and paired by order",
      "--skill-type <type>: enabled skill source template (git, local-path, system-installed, inline-files)",
      "--requests <n>: set evaluation.requests",
      "--max-concurrency <n>: set evaluation.maxConcurrency",
      "--maxConcurrency <n>: alias for --max-concurrency",
      "--help: show gen-conf usage",
    ],
    examples: [
      "--prompt \"summarize file A\" --evaluation-type javascript --evaluation-value @checks.js",
      "--prompt \"summarize file A\" --evaluation-type llm-rubric --evaluation-value \"Score 1.0 only if the file is summarized.\" --requests 3 --skill-type git",
      "--output ./benchmarks/my-benchmark/compare.yaml --prompt \"create a compare config\" --skill-type local-path",
    ],
  },
  "val-conf": {
    usage: "val-conf <manifest-or-compare-path>",
    description: "Validate a manifest or compare config and print a normalized summary.",
    options: [
      "--help: show val-conf usage",
    ],
    examples: [
      "./benchmarks/smoke-skill-following/manifest.yaml",
      "./benchmarks/smoke-skill-following/compare.yaml",
    ],
  },
};

const commandOrder = ["evaluate", "gen-conf", "val-conf"];

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log(`skill-arena v${packageVersion}`);
  process.exit(0);
}

if (command === "help") {
  if (passthroughArgs.length === 0) {
    printUsage();
    process.exit(0);
  }

  const subcommand = passthroughArgs[0];
  const result = printCommandHelp(subcommand);
  process.exit(result.exitCode);
}

const scriptPath = commandMap[command];
if (passthroughArgs.includes("--help") || passthroughArgs.includes("-h")) {
  const result = printCommandHelp(command);
  process.exit(result.exitCode);
}

if (!scriptPath) {
  const { exitCode } = printUsage(`Unknown command "${command}".`);
  process.exit(exitCode);
}

const child = spawn(process.execPath, [scriptPath, ...passthroughArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

function printUsage(errorMessage = null) {
  if (errorMessage) {
    console.error(errorMessage);
    console.error("");
  }

  console.error("Usage: skill-arena <command> [args]");
  console.error("       skill-arena [--help|--version]");
  console.error("");
  console.error("Commands:");
  for (const commandName of commandOrder) {
    const details = commandDetails[commandName];
    console.error(`  ${commandName.padEnd(18)} ${details.usage}`);
  }
  console.error("");
  console.error("Use `skill-arena help <command>` for details.");
  console.error("Tip: every command also accepts `--help` for inline usage.");

  return { exitCode: errorMessage ? 1 : 0 };
}

function printCommandHelp(commandName) {
  const details = commandDetails[commandName];
  if (!details) {
    return printUsage(`Unknown command "${commandName}".`);
  }

  console.error("");
  console.error(`skill-arena ${details.usage}`);
  console.error("");
  console.error(details.description);
  console.error("");
  if (details.options && details.options.length > 0) {
    console.error("Options:");
    for (const option of details.options) {
      console.error(`  ${option}`);
    }
    console.error("");
  }
  console.error("Examples:");
  for (const example of exampleFor(commandName)) {
    console.error(`  skill-arena ${example}`);
  }
  console.error("");
  return { exitCode: 0 };
}

function exampleFor(command) {
  const details = commandDetails[command];
  if (details) {
    return details.examples;
  }
  return ["--help"];
}
