#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { parseConfigFile } from "../../../src/config-file.js";
import {
  loadHarborReportConfig,
  normalizeHarborJobs,
} from "./normalize-harbor-jobs.js";

const DEFAULT_HARBOR_VERSION = "0.18.0";
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createRunId(date = new Date()) {
  return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
}

export async function buildRunPlan({
  config,
  configDirectory,
  runId,
  profileJobOverrides = new Map(),
  cwd = process.cwd(),
}) {
  assertSafeRunId(runId);
  const plan = [];
  let referenceJobConfig = null;

  for (const profile of config.comparison.profiles) {
    const configuredPath = profileJobOverrides.get(profile.id)
      ?? path.join(configDirectory, "jobs", `${profile.id}.yaml`);
    const jobConfigPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(cwd, configuredPath);
    const jobConfig = await parseConfigFile(jobConfigPath);
    const taskDirectories = await validatePlannedJobConfig({
      jobConfig,
      jobConfigPath,
      profile,
      config,
      cwd,
    });
    const comparableJobConfig = buildComparableJobConfig(jobConfig);
    if (referenceJobConfig === null) {
      referenceJobConfig = comparableJobConfig;
    } else if (!isDeepStrictEqual(referenceJobConfig, comparableJobConfig)) {
      throw new Error(
        `${jobConfigPath}: profile job configuration differs beyond job_name and skills.`,
      );
    }
    const baseJobName = requireString(jobConfig.job_name, `${jobConfigPath}: job_name`);
    const jobsDirectory = requireString(jobConfig.jobs_dir, `${jobConfigPath}: jobs_dir`);
    const jobName = `${baseJobName}-${runId}`;
    const absoluteJobsDirectory = path.isAbsolute(jobsDirectory)
      ? jobsDirectory
      : path.resolve(cwd, jobsDirectory);

    plan.push({
      profileId: profile.id,
      jobConfigPath,
      jobName,
      jobDirectory: path.join(absoluteJobsDirectory, jobName),
      taskDirectories,
    });
  }

  const destinations = new Set(plan.map((entry) => entry.jobDirectory.toLowerCase()));
  if (destinations.size !== plan.length) {
    throw new Error("Harbor profile jobs resolve to duplicate output directories.");
  }
  return plan;
}

async function validatePlannedJobConfig({
  jobConfig,
  jobConfigPath,
  profile,
  config,
  cwd,
}) {
  const taskDirectories = [];
  const attempts = jobConfig.n_attempts ?? 1;
  if (attempts !== config.evaluation.requests) {
    throw new Error(
      `${jobConfigPath}: n_attempts=${attempts}; expected ${config.evaluation.requests}.`,
    );
  }

  const expectedSkills = [...profile.expectedSkills].sort();
  if (profile.skillMode === "enabled" && expectedSkills.length === 0) {
    throw new Error(`${jobConfigPath}: enabled profile declares no expectedSkills.`);
  }
  if (profile.skillMode === "disabled" && expectedSkills.length > 0) {
    throw new Error(`${jobConfigPath}: disabled profile declares expectedSkills.`);
  }

  const agents = jobConfig.agents ?? [];
  if (agents.length !== config.comparison.variants.length) {
    throw new Error(
      `${jobConfigPath}: configured ${agents.length} agents; expected ${config.comparison.variants.length}.`,
    );
  }
  for (const variant of config.comparison.variants) {
    const matches = agents.filter((agent) =>
      agent.name === variant.agent && agent.model_name === variant.model,
    );
    if (matches.length !== 1) {
      throw new Error(
        `${jobConfigPath}: matched ${matches.length} agents for variant "${variant.id}".`,
      );
    }
    const actualSkills = (matches[0].skills ?? []).map(skillName).sort();
    if (!isDeepStrictEqual(actualSkills, expectedSkills)) {
      throw new Error(
        `${jobConfigPath}: variant "${variant.id}" has skills [${actualSkills.join(", ")}]; expected [${expectedSkills.join(", ")}].`,
      );
    }
    for (const skill of matches[0].skills ?? []) {
      const candidate = path.isAbsolute(skill) ? skill : path.resolve(cwd, skill);
      if (await exists(candidate) && !await exists(path.join(candidate, "SKILL.md"))) {
        throw new Error(`${jobConfigPath}: local skill has no SKILL.md: ${candidate}.`);
      }
    }
  }

  const localDatasets = (jobConfig.datasets ?? []).filter((dataset) => dataset.path);
  if (localDatasets.length === 0 && (jobConfig.tasks ?? []).length === 0) {
    throw new Error(`${jobConfigPath}: configure at least one dataset or task.`);
  }
  for (const dataset of localDatasets) {
    const datasetPath = path.isAbsolute(dataset.path)
      ? dataset.path
      : path.resolve(cwd, dataset.path);
    const entries = await fs.readdir(datasetPath, { withFileTypes: true }).catch((error) => {
      throw new Error(`${jobConfigPath}: cannot read dataset ${datasetPath}: ${error.message}`);
    });
    const taskEntries = entries.filter((entry) => entry.isDirectory());
    if (taskEntries.length === 0) {
      throw new Error(`${jobConfigPath}: dataset contains no task directories: ${datasetPath}.`);
    }
    for (const entry of taskEntries) {
      const taskDirectory = path.join(datasetPath, entry.name);
      if (!await exists(path.join(taskDirectory, "task.toml"))
        || !await exists(path.join(taskDirectory, "instruction.md"))) {
        throw new Error(`${jobConfigPath}: invalid Harbor task directory: ${taskDirectory}.`);
      }
      taskDirectories.push(taskDirectory);
    }
  }
  for (const task of jobConfig.tasks ?? []) {
    if (!task.path) {
      continue;
    }
    const taskDirectory = path.isAbsolute(task.path) ? task.path : path.resolve(cwd, task.path);
    if (!await exists(path.join(taskDirectory, "task.toml"))
      || !await exists(path.join(taskDirectory, "instruction.md"))) {
      throw new Error(`${jobConfigPath}: invalid Harbor task directory: ${taskDirectory}.`);
    }
    taskDirectories.push(taskDirectory);
  }
  return taskDirectories;
}

function buildComparableJobConfig(jobConfig) {
  const comparable = structuredClone(jobConfig);
  delete comparable.job_name;
  if (Array.isArray(comparable.agents)) {
    for (const agent of comparable.agents) {
      delete agent.skills;
    }
  }
  return comparable;
}

function skillName(skill) {
  const normalized = String(skill).replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export async function runHarborEvaluation({
  reportConfigPath,
  outputDirectory = null,
  runId = createRunId(),
  harborVersion = DEFAULT_HARBOR_VERSION,
  profileJobOverrides = new Map(),
  profileResultOverrides = new Map(),
  skipRun = false,
  dryRun = false,
  doctor = false,
  resumeExisting = false,
  cwd = process.cwd(),
  commandRunner = runCommand,
  environment = process.env,
  credentialNow = Date.now(),
  generatedAt = new Date().toISOString(),
}) {
  if ([skipRun, dryRun, doctor].filter(Boolean).length > 1) {
    throw new Error("--skip-run, --dry-run, and --doctor are mutually exclusive.");
  }

  const loaded = await loadHarborReportConfig(reportConfigPath);
  const absoluteOutputDirectory = outputDirectory
    ? path.resolve(cwd, outputDirectory)
    : path.resolve(cwd, ".tmp", "harbor-runs", loaded.config.benchmark.id, runId);

  if (skipRun) {
    const normalized = await normalizeHarborJobs({
      ...loaded,
      outputDirectory: absoluteOutputDirectory,
      profileDirectoryOverrides: profileResultOverrides,
      generatedAt,
    });
    return persistRunManifest({
      normalized,
      outputDirectory: absoluteOutputDirectory,
      reportConfigPath: loaded.configPath,
      runId,
      harborVersion,
      jobs: loaded.config.comparison.profiles.map((profile) => ({
        profileId: profile.id,
        jobDirectory: profileResultOverrides.get(profile.id) ?? profile.jobDirectory,
      })),
      generatedAt,
      mode: "normalize-only",
      checks: null,
    });
  }

  const plan = await buildRunPlan({
    config: loaded.config,
    configDirectory: loaded.configDirectory,
    runId,
    profileJobOverrides,
    cwd,
  });
  const uvxArguments = ["--from", `harbor==${harborVersion}`, "harbor"];

  for (const entry of plan) {
    await commandRunner("uvx", [
      ...uvxArguments,
      "run",
      "--config",
      entry.jobConfigPath,
      "--job-name",
      entry.jobName,
      "--print-config",
    ], { cwd, env: environment });
  }
  const taskDirectories = [...new Set(plan.flatMap((entry) => entry.taskDirectories))];
  if (taskDirectories.length > 0) {
    await commandRunner("uv", [
      "run",
      "--with",
      `harbor==${harborVersion}`,
      "python",
      path.join(scriptsDirectory, "validate-harbor-tasks.py"),
      ...taskDirectories,
    ], { cwd, env: environment });
  }

  const checks = doctor || !dryRun
    ? await runEnvironmentDoctor({
        agentNames: loaded.config.comparison.variants.map((variant) => variant.agent),
        cwd,
        commandRunner,
        environment,
        credentialNow,
      })
    : null;

  if (doctor) {
    return {
      mode: "doctor",
      harborVersion,
      reportConfigPath: loaded.configPath,
      runId,
      outputDirectory: absoluteOutputDirectory,
      checks,
      plan,
    };
  }

  if (dryRun) {
    return {
      mode: "dry-run",
      harborVersion,
      reportConfigPath: loaded.configPath,
      runId,
      outputDirectory: absoluteOutputDirectory,
      plan,
    };
  }

  for (const entry of plan) {
    if (!resumeExisting && await exists(entry.jobDirectory)) {
      throw new Error(
        `Harbor job directory already exists: ${entry.jobDirectory}. Use a new --run-id or --resume.`,
      );
    }
    await commandRunner("uvx", [
      ...uvxArguments,
      "run",
      "--config",
      entry.jobConfigPath,
      "--job-name",
      entry.jobName,
    ], { cwd, env: environment });
    if (!await exists(path.join(entry.jobDirectory, "result.json"))) {
      throw new Error(`Harbor did not write a job result at ${entry.jobDirectory}.`);
    }
  }

  const profileDirectoryOverrides = new Map(
    plan.map((entry) => [entry.profileId, entry.jobDirectory]),
  );
  const normalized = await normalizeHarborJobs({
    ...loaded,
    outputDirectory: absoluteOutputDirectory,
    profileDirectoryOverrides,
    generatedAt,
  });
  return persistRunManifest({
    normalized,
    outputDirectory: absoluteOutputDirectory,
    reportConfigPath: loaded.configPath,
    runId,
    harborVersion,
    jobs: plan.map(({ profileId, jobDirectory, jobConfigPath, jobName }) => ({
      profileId,
      jobDirectory,
      jobConfigPath,
      jobName,
    })),
    generatedAt,
    mode: "live",
    checks,
  });
}

export async function inspectAgentCredentials({
  agentNames,
  environment = process.env,
  now = Date.now(),
  homeDirectory = os.homedir(),
}) {
  const checks = {};
  const uniqueAgentNames = [...new Set(agentNames)];

  for (const agentName of uniqueAgentNames) {
    if (agentName === "codex") {
      checks.codex = await inspectCodexCredentials({
        environment,
        now,
        homeDirectory,
      });
    } else if (agentName === "claude-code") {
      checks[agentName] = inspectClaudeCredentials(environment);
    } else {
      checks[agentName] = { mode: "agent-managed" };
    }
  }
  return checks;
}

async function runEnvironmentDoctor({
  agentNames,
  cwd,
  commandRunner,
  environment,
  credentialNow,
}) {
  await commandRunner("docker", ["info", "--format", "server={{.ServerVersion}}"], {
    cwd,
    env: environment,
  });
  await commandRunner("docker", ["compose", "version", "--short"], {
    cwd,
    env: environment,
  });
  const credentials = await inspectAgentCredentials({
    agentNames,
    environment,
    now: credentialNow,
  });
  return {
    docker: "ready",
    dockerCompose: "ready",
    credentials,
  };
}

async function inspectCodexCredentials({ environment, now, homeDirectory }) {
  if (nonEmpty(environment.OPENAI_API_KEY)) {
    return { mode: "api-key" };
  }

  const configuredPath = nonEmpty(environment.CODEX_AUTH_JSON_PATH)
    ? environment.CODEX_AUTH_JSON_PATH
    : isTruthy(environment.CODEX_FORCE_AUTH_JSON)
      ? path.join(homeDirectory, ".codex", "auth.json")
      : null;
  if (!configuredPath) {
    throw new Error(
      "Codex credentials are not selected. Set OPENAI_API_KEY, CODEX_AUTH_JSON_PATH, or CODEX_FORCE_AUTH_JSON=1.",
    );
  }

  let auth;
  try {
    auth = JSON.parse(await fs.readFile(configuredPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read the selected Codex auth.json: ${error.message}`);
  }
  const accessToken = auth.tokens?.access_token ?? auth.access_token;
  if (!nonEmpty(accessToken)) {
    throw new Error("The selected Codex auth.json contains no access token.");
  }
  const expiresAtMs = decodeJwtExpiry(accessToken);
  if (expiresAtMs !== null && expiresAtMs <= now + 60_000) {
    throw new Error(
      `The selected Codex access token is expired or expires within 60 seconds (${new Date(expiresAtMs).toISOString()}). Refresh host Codex authentication before running Harbor.`,
    );
  }
  return {
    mode: "auth-json",
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
  };
}

function inspectClaudeCredentials(environment) {
  if (nonEmpty(environment.ANTHROPIC_API_KEY)) {
    return { mode: "api-key" };
  }
  if (isTruthy(environment.CLAUDE_FORCE_OAUTH)
    && nonEmpty(environment.CLAUDE_CODE_OAUTH_TOKEN)) {
    return { mode: "oauth" };
  }
  throw new Error(
    "Claude Code credentials are not selected. Set ANTHROPIC_API_KEY or CLAUDE_FORCE_OAUTH=1 with CLAUDE_CODE_OAUTH_TOKEN.",
  );
}

function decodeJwtExpiry(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

function isTruthy(value) {
  return nonEmpty(value) && !["0", "false", "no", "off"].includes(value.toLowerCase());
}

async function persistRunManifest({
  normalized,
  outputDirectory,
  reportConfigPath,
  runId,
  harborVersion,
  jobs,
  generatedAt,
  mode,
  checks,
}) {
  const runManifest = {
    schemaVersion: 1,
    source: "harbor",
    mode,
    runId,
    harborVersion,
    checks,
    reportConfigPath,
    jobs,
    summaryPath: normalized.summaryPath,
    mergedSummaryPath: normalized.mergedArtifacts.mergedSummaryPath,
    reportPath: normalized.mergedArtifacts.reportPath,
    generatedAt,
  };
  await fs.mkdir(outputDirectory, { recursive: true });
  const runManifestPath = path.join(outputDirectory, "run.json");
  await fs.writeFile(runManifestPath, JSON.stringify(runManifest, null, 2), "utf8");
  return { ...normalized, runManifest, runManifestPath };
}

function runCommand(command, args, { cwd, env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(
        `${command} exited with ${code ?? `signal ${signal}`} while running ${args.join(" ")}.`,
      ));
    });
  });
}

function parseAssignments(argv, optionName) {
  const assignments = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== optionName) {
      continue;
    }
    const value = argv[index + 1];
    const separator = value?.indexOf("=") ?? -1;
    if (separator < 1 || separator === value.length - 1) {
      throw new Error(`${optionName} requires <profile-id>=<path>.`);
    }
    const id = value.slice(0, separator);
    if (assignments.has(id)) {
      throw new Error(`${optionName} repeats profile "${id}".`);
    }
    const inputPath = value.slice(separator + 1);
    assignments.set(id, path.isAbsolute(inputPath) ? inputPath : path.resolve(inputPath));
    index += 1;
  }
  return assignments;
}

function readOption(argv, optionName) {
  const index = argv.indexOf(optionName);
  return index === -1 ? null : argv[index + 1] ?? null;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertSafeRunId(runId) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(runId)) {
    throw new Error(`Invalid Harbor run id "${runId}".`);
  }
}

async function exists(inputPath) {
  try {
    await fs.access(inputPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const reportConfigPath = argv[0];
  if (!reportConfigPath || reportConfigPath.startsWith("--")) {
    throw new Error(
      "Usage: run-harbor-evaluation.js <report-config.yaml> [--profile-job <id>=<yaml>] [--profile-result <id>=<job-dir>] [--output <dir>] [--run-id <id>] [--harbor-version <version>] [--doctor|--dry-run|--skip-run] [--resume]",
    );
  }
  const result = await runHarborEvaluation({
    reportConfigPath,
    outputDirectory: readOption(argv, "--output"),
    runId: readOption(argv, "--run-id") ?? createRunId(),
    harborVersion: readOption(argv, "--harbor-version") ?? DEFAULT_HARBOR_VERSION,
    profileJobOverrides: parseAssignments(argv, "--profile-job"),
    profileResultOverrides: parseAssignments(argv, "--profile-result"),
    skipRun: argv.includes("--skip-run"),
    dryRun: argv.includes("--dry-run"),
    doctor: argv.includes("--doctor"),
    resumeExisting: argv.includes("--resume"),
  });
  console.log(JSON.stringify(["dry-run", "doctor"].includes(result.mode)
    ? result
    : {
        runManifestPath: result.runManifestPath,
        summaryPath: result.summaryPath,
        mergedSummaryPath: result.mergedArtifacts.mergedSummaryPath,
        reportPath: result.mergedArtifacts.reportPath,
      }, null, 2));
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
