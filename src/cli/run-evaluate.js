import path from "node:path";
import { spawn } from "node:child_process";

import { fromPackageRoot } from "../project-paths.js";
import { detectConfigKind, parseConfigFile } from "./config-file.js";
import { ensureKnownLongOptions } from "./cli-options.js";

const runBenchmarkScript = fromPackageRoot("src", "cli", "run-benchmark.js");
const runCompareScript = fromPackageRoot("src", "cli", "run-compare.js");

async function main() {
  const configPath = process.argv[2];
  const scenarioIndex = process.argv.indexOf("--scenario");
  const hasScenario = scenarioIndex > -1;

  if (!configPath || configPath.startsWith("--")) {
    throw new Error(
      "Usage: node ./src/cli/run-evaluate.js <benchmark-config-path> [--scenario <scenario-id>] [--requests <n>] [--max-concurrency <n>] [--dry-run] [--verbose]",
    );
  }
  const knownOptionSchema = {
    "--scenario": true,
    "--requests": true,
    "--max-concurrency": true,
    "--maxConcurrency": true,
    "--dry-run": false,
    "--verbose": false,
  };
  ensureKnownLongOptions(process.argv, knownOptionSchema);

  const absoluteConfigPath = path.resolve(process.cwd(), configPath);

  let configKind;
  const parsed = await parseConfigFile(absoluteConfigPath);
  configKind = detectConfigKind(parsed, absoluteConfigPath);

  if (configKind === "compare" && hasScenario) {
    throw new Error("The matrix evaluation config does not support --scenario. Remove it and rerun.");
  }

  const script = configKind === "compare" ? runCompareScript : runBenchmarkScript;
  const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
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
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
