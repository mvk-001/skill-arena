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
  "val-gen": fromPackageRoot("src", "cli", "validate-manifest.js"),
};

const commandDetails = {
  evaluate: {
    usage: "evaluate <benchmark-config-path> [--scenario <scenario-id>] [--requests <n>] [--max-concurrency <n>] [--dry-run] [--verbose]",
    description:
      "Run one benchmark manifest or matrix evaluation config.",
    options: [
      "--scenario <scenario-id>: run only one manifest scenario (not valid for matrix evaluation configs)",
      "--requests <n>: override effective evaluation requests for this run",
      "--max-concurrency <n>: override effective maxConcurrency for this run",
      "--maxConcurrency <n>: alias for --max-concurrency",
      "--dry-run: generate promptfoo config and skip execution",
      "--verbose: print full internal artifact paths and raw output",
      "--help: show evaluate usage",
    ],
    examples: [
      "./benchmarks/skill-arena-compare/compare.yaml --dry-run",
      "./benchmarks/skill-arena-compare/compare.yaml",
    ],
  },
  "gen-conf": {
    usage: "gen-conf [--output <path>] [--prompt <text>] [options]",
    description:
      "Generate a commented evaluation config template with TODO placeholders for fast authoring.",
    options: [
      "--output <path>: destination file path (default: ./evaluate.generated.yaml)",
      "--prompt <text>: add one task prompt row; repeatable",
      "--prompt-description <text>: optional description for the next prompt row; repeatable",
      "--benchmark-id <slug>: override benchmark.id",
      "--description <text>: override benchmark.description",
      "--benchmark-description <text>: synonym for --description",
      "--tag <text>: add one benchmark tag",
      "--evaluation-type <type>: add one shared assertion type; repeatable",
      "--evaluation-value <value>: add one shared assertion value; repeatable and paired by order",
      "--evaluation-provider <id>: grader provider for llm-rubric",
      "--skill-type <type>: enabled skill source template (git, local-path, system-installed, inline-files)",
      "--skill-path <path>: skill source path for local skill overlays",
      "--skill-id <slug>: skill identifier",
      "--skill-repo <url>: repository for git skills",
      "--skill-ref <ref>: git ref for git skills",
      "--skill-subpath <path>: git repo subpath for git skills",
      "--skill-path-in-repo <path>: skill folder inside git repo",
      "--workspace-source-type <type>: workspace source type (local-path, git, inline-files, empty)",
      "--workspace-path <path>: path for local workspace source",
      "--workspace-target <path>: workspace source target path",
      "--workspace-repo <url>: repository for workspace git source",
      "--workspace-ref <ref>: workspace git ref",
      "--workspace-subpath <path>: workspace git repo subpath",
      "--initialize-git <true|false>: set workspace setup initializeGit",
      "--requests <n>: set evaluation.requests",
      "--max-concurrency <n>: set evaluation.maxConcurrency",
      "--maxConcurrency <n>: alias for --max-concurrency",
      "--timeout-ms <ms>: set evaluation.timeoutMs",
      "--no-cache <true|false>: set evaluation.noCache",
      "--tracing <true|false>: set evaluation.tracing",
      "--variant-id <id>: variant id override",
      "--variant-description <text>: variant description override",
      "--variant-display-name <text>: variant row label",
      "--adapter <id>: variant agent adapter (codex, copilot-cli, pi)",
      "--model <id>: variant model",
      "--execution-method <id>: variant execution method",
      "--command-path <path>: variant command path",
      "--sandbox-mode <id>: variant sandbox mode",
      "--approval-policy <id>: variant approval policy",
      "--web-search-enabled <true|false>: set variant webSearchEnabled",
      "--network-access-enabled <true|false>: set variant networkAccessEnabled",
      "--reasoning-effort <id>: variant reasoning effort",
      "--help: show gen-conf usage",
    ],
    examples: [
      "--prompt \"summarize file A\" --evaluation-type javascript --evaluation-value @checks.js",
      "--prompt \"summarize file A\" --evaluation-type llm-rubric --evaluation-value \"Score 1.0 only if the file is summarized.\" --requests 3 --skill-type git",
      "--output ./benchmarks/my-benchmark/evaluate.yaml --prompt \"create an evaluation config\" --skill-type local-path",
    ],
  },
  "val-gen": {
    usage: "val-gen <benchmark-config-path>",
    description: "Alias for val-conf.",
    options: [
      "--help: show val-conf usage",
    ],
    examples: [
      "./benchmarks/skill-arena-compare/compare.yaml",
    ],
  },
  "val-conf": {
    usage: "val-conf <benchmark-config-path>",
    description: "Validate a manifest or matrix evaluation config and print a normalized summary.",
    options: [
      "--help: show val-conf usage",
    ],
    examples: [
      "./benchmarks/skill-arena-compare/compare.yaml",
    ],
  },
};

const commandOrder = ["evaluate", "gen-conf", "val-conf", "val-gen"];

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

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

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
