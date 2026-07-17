#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import {
  buildMatrix,
  buildRouteKey,
  buildRowId,
  buildScenarioStats,
} from "../../../src/compare-matrix.js";
import { parseConfigFile } from "../../../src/config-file.js";
import {
  buildCompareMatrixSummary,
  renderCompareMatrixReport,
  writeMergedBenchmarkArtifacts,
} from "../../../src/results.js";

const slugSchema = z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const reportConfigSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: z.object({
    id: slugSchema,
    description: z.string().min(1),
  }),
  evaluation: z.object({
    requests: z.number().int().positive(),
    rewardKey: z.string().min(1).default("reward"),
    passThreshold: z.number().default(1),
  }),
  task: z.object({
    prompts: z.array(z.object({
      id: slugSchema,
      harborTaskName: z.string().min(1),
      description: z.string().min(1),
      prompt: z.string().min(1),
    })).min(1),
  }),
  comparison: z.object({
    variants: z.array(z.object({
      id: slugSchema,
      displayName: z.string().min(1),
      agent: z.string().min(1),
      model: z.string().min(1),
    })).min(1),
    profiles: z.array(z.object({
      id: slugSchema,
      displayName: z.string().min(1),
      description: z.string().min(1),
      skillMode: z.enum(["disabled", "enabled"]),
      skillSource: z.string().min(1),
      expectedSkills: z.array(z.string().min(1)).default([]),
      jobDirectory: z.string().min(1),
    })).min(1),
  }),
}).strict();

export async function loadHarborReportConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
  const parsed = await parseConfigFile(absoluteConfigPath);
  const result = reportConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n"));
  }

  return {
    config: result.data,
    configPath: absoluteConfigPath,
    configDirectory: path.dirname(absoluteConfigPath),
  };
}

export async function normalizeHarborJobs({
  config,
  configDirectory,
  outputDirectory,
  profileDirectoryOverrides = new Map(),
  generatedAt = new Date().toISOString(),
}) {
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  const loadedProfiles = [];

  for (const profile of config.comparison.profiles) {
    const configuredDirectory = profileDirectoryOverrides.get(profile.id) ?? profile.jobDirectory;
    const jobDirectory = resolveFrom(configDirectory, configuredDirectory);
    loadedProfiles.push({
      profile,
      job: await loadHarborJob(jobDirectory),
    });
  }

  validateHarborJobs({ config, loadedProfiles });

  const manifest = {
    benchmark: config.benchmark,
    task: {
      prompts: config.task.prompts.map((prompt) => ({
        id: prompt.id,
        description: prompt.description,
        prompt: prompt.prompt,
      })),
    },
  };
  const supportedRuns = [];
  const routeMap = new Map();
  const outputs = [];

  for (const { profile, job } of loadedProfiles) {
    for (const variant of config.comparison.variants) {
      const scenario = createScenario({ config, profile, variant });
      const run = {
        scenario,
        workspaceDirectory: null,
        harborJobDirectory: job.jobDirectory,
      };
      supportedRuns.push(run);
      routeMap.set(buildRouteKey(variant.id, profile.id), run);
    }

    for (const trial of job.trials) {
      const variant = findVariant(config.comparison.variants, trial.result);
      const prompt = findPrompt(config.task.prompts, trial.result);
      outputs.push(normalizeHarborTrial({
        trial,
        profile,
        variant,
        prompt,
        index: outputs.length,
        rewardKey: config.evaluation.rewardKey,
        passThreshold: config.evaluation.passThreshold,
      }));
    }
  }

  const matrix = buildMatrix({
    manifest,
    supportedRuns,
    outputs,
    routeMap,
    evaluationRequests: config.evaluation.requests,
    compareRunDirectory: absoluteOutputDirectory,
    skippedCells: [],
  });
  const scenarioSummaries = supportedRuns.map(({ scenario, harborJobDirectory }) => {
    const scenarioOutputs = outputs.filter((output) => output.scenarioId === scenario.id);
    return {
      evalId: null,
      promptfooVersion: null,
      benchmarkId: config.benchmark.id,
      benchmarkDescription: config.benchmark.description,
      scenarioId: scenario.id,
      scenarioDescription: scenario.description,
      runId: scenario.id,
      profileId: scenario.output.labels.profileId,
      skillMode: scenario.skillMode,
      adapter: scenario.agent.adapter,
      model: scenario.agent.model,
      outputTags: scenario.output.tags,
      outputLabels: scenario.output.labels,
      workspaceDirectory: null,
      promptfooResultsPath: null,
      harborJobDirectory,
      stats: buildScenarioStats(scenarioOutputs),
      outputs: scenarioOutputs,
      reuseFingerprint: null,
      generatedAt,
    };
  });
  const summary = {
    evalId: null,
    promptfooVersion: null,
    source: "harbor",
    benchmarkId: config.benchmark.id,
    benchmarkDescription: config.benchmark.description,
    compareRunDirectory: absoluteOutputDirectory,
    promptfooResultsPath: null,
    harborJobDirectories: loadedProfiles.map(({ profile, job }) => ({
      profileId: profile.id,
      jobDirectory: job.jobDirectory,
    })),
    stats: buildScenarioStats(outputs),
    providers: supportedRuns.map(({ scenario, harborJobDirectory }) => ({
      scenarioId: scenario.id,
      adapter: scenario.agent.adapter,
      model: scenario.agent.model,
      profileId: scenario.output.labels.profileId,
      skillMode: scenario.skillMode,
      skillSource: scenario.skillSource,
      labels: scenario.output.labels,
      tags: scenario.output.tags,
      harborJobDirectory,
    })),
    unsupportedCells: [],
    matrix,
    scenarioSummaries,
    generatedAt,
  };

  await fs.mkdir(absoluteOutputDirectory, { recursive: true });
  const summaryPath = path.join(absoluteOutputDirectory, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const mergedSummary = buildCompareMatrixSummary({
    manifest,
    matrix,
    skippedVariants: [],
    unsupportedCells: [],
    generatedAt,
  });
  const report = renderCompareMatrixReport(mergedSummary);
  const mergedArtifacts = await writeMergedBenchmarkArtifacts({
    benchmarkId: config.benchmark.id,
    benchmarkRunDirectory: path.join(absoluteOutputDirectory, "merged"),
    mergedSummary,
    cliReport: report,
  });

  return {
    summary,
    summaryPath,
    mergedSummary,
    report,
    mergedArtifacts,
  };
}

export async function loadHarborJob(jobDirectory) {
  const absoluteJobDirectory = path.resolve(jobDirectory);
  const configPath = path.join(absoluteJobDirectory, "config.json");
  const resultPath = path.join(absoluteJobDirectory, "result.json");
  const jobConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  const jobResult = JSON.parse(await fs.readFile(resultPath, "utf8"));
  const entries = await fs.readdir(absoluteJobDirectory, { withFileTypes: true });
  const trials = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const trialResultPath = path.join(absoluteJobDirectory, entry.name, "result.json");
    const result = await readOptionalJson(trialResultPath);
    if (result?.task_name && result?.trial_name) {
      trials.push({
        result,
        resultPath: trialResultPath,
        trialDirectory: path.dirname(trialResultPath),
      });
    }
  }

  trials.sort((left, right) => {
    const startedOrder = String(left.result.started_at ?? "").localeCompare(
      String(right.result.started_at ?? ""),
    );
    return startedOrder || left.result.trial_name.localeCompare(right.result.trial_name);
  });

  if (trials.length === 0) {
    throw new Error(`Harbor job "${absoluteJobDirectory}" contains no trial result.json files.`);
  }

  return {
    jobDirectory: absoluteJobDirectory,
    configPath,
    resultPath,
    config: jobConfig,
    result: jobResult,
    trials,
  };
}

export function normalizeHarborTrial({
  trial,
  profile,
  variant,
  prompt,
  index = 0,
  rewardKey,
  passThreshold,
}) {
  const result = trial.result;
  const reward = result.verifier_result?.rewards?.[rewardKey];
  const exception = formatHarborException(result.exception_info);
  const missingReward = typeof reward !== "number"
    ? `Harbor result is missing numeric reward "${rewardKey}".`
    : null;
  const error = exception ?? missingReward;
  const usage = aggregateAgentUsage(result);
  const latencyMs = aggregateAgentExecutionDuration(result);
  const scenarioId = buildScenarioId(variant.id, profile.id);

  return {
    index,
    promptId: prompt.id,
    promptDescription: prompt.description,
    scenarioId,
    scenarioDescription: `${variant.displayName} | ${profile.description}`,
    variantId: variant.id,
    variantDisplayName: variant.displayName,
    rowId: buildRowId(variant.id, prompt.id),
    profileId: profile.id,
    provider: profile.id,
    prompt: prompt.prompt,
    text: extractAgentOutput(result),
    success: error === null && reward >= passThreshold,
    score: typeof reward === "number" ? reward : null,
    latencyMs,
    cost: usage.cost,
    tokenUsage: usage.totalTokens === null
      ? null
      : {
          prompt: usage.inputTokens,
          cached: usage.cacheTokens,
          completion: usage.outputTokens,
          total: usage.totalTokens,
        },
    sessionUsage: usage.hasUsage
      ? {
          inputTokens: usage.inputTokens,
          cacheTokens: usage.cacheTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.cost,
        }
      : null,
    codeMetricsDelta: null,
    executionEventHook: null,
    error,
  };
}

function validateHarborJobs({ config, loadedProfiles }) {
  const expectedCellCount = config.evaluation.requests;
  const checksumByPrompt = new Map();
  const agentVersionByVariant = new Map();
  let referenceJobConfig = null;

  for (const { profile, job } of loadedProfiles) {
    validateProfileSkills({ config, profile, job });
    const comparableJobConfig = buildComparableJobConfig(job.config);
    if (referenceJobConfig === null) {
      referenceJobConfig = comparableJobConfig;
    } else if (!isDeepStrictEqual(referenceJobConfig, comparableJobConfig)) {
      throw new Error(
        `Harbor profile "${profile.id}" changes job configuration beyond job identity and skills.`,
      );
    }

    const configuredAttempts = job.config.n_attempts ?? 1;
    if (configuredAttempts !== expectedCellCount) {
      throw new Error(
        `Harbor profile "${profile.id}" declares n_attempts=${configuredAttempts}; expected ${expectedCellCount}.`,
      );
    }

    const expectedTotalTrials = expectedCellCount
      * config.task.prompts.length
      * config.comparison.variants.length;
    if (job.result.n_total_trials !== expectedTotalTrials) {
      throw new Error(
        `Harbor profile "${profile.id}" planned ${job.result.n_total_trials} trials; expected ${expectedTotalTrials}.`,
      );
    }
    const completedTrials = job.result.stats?.n_completed_trials
      ?? job.result.stats?.n_trials
      ?? null;
    if (completedTrials !== expectedTotalTrials) {
      throw new Error(
        `Harbor profile "${profile.id}" reports ${completedTrials} completed trials; expected ${expectedTotalTrials}.`,
      );
    }
    if (job.trials.length !== expectedTotalTrials) {
      throw new Error(
        `Harbor profile "${profile.id}" has ${job.trials.length} completed trial artifacts; expected ${expectedTotalTrials}.`,
      );
    }

    const counts = new Map();
    for (const trial of job.trials) {
      const variant = findVariant(config.comparison.variants, trial.result);
      const prompt = findPrompt(config.task.prompts, trial.result);
      const groupKey = buildRowId(variant.id, prompt.id);
      counts.set(groupKey, (counts.get(groupKey) ?? 0) + 1);

      const agentVersion = trial.result.agent_info?.version;
      if (typeof agentVersion !== "string" || agentVersion.length === 0) {
        throw new Error(`Harbor trial "${trial.result.trial_name}" has no agent version.`);
      }
      const referenceAgentVersion = agentVersionByVariant.get(variant.id);
      if (referenceAgentVersion === undefined) {
        agentVersionByVariant.set(variant.id, agentVersion);
      } else if (referenceAgentVersion !== agentVersion) {
        throw new Error(
          `Harbor agent version mismatch for variant "${variant.id}": ${referenceAgentVersion} != ${agentVersion}.`,
        );
      }

      const checksum = trial.result.task_checksum;
      const referenceChecksum = checksumByPrompt.get(prompt.id);
      if (referenceChecksum === undefined) {
        checksumByPrompt.set(prompt.id, checksum);
      } else if (referenceChecksum !== checksum) {
        throw new Error(
          `Harbor task checksum mismatch for prompt "${prompt.id}": ${referenceChecksum} != ${checksum}.`,
        );
      }
    }

    for (const variant of config.comparison.variants) {
      for (const prompt of config.task.prompts) {
        const groupKey = buildRowId(variant.id, prompt.id);
        const count = counts.get(groupKey) ?? 0;
        if (count !== expectedCellCount) {
          throw new Error(
            `Harbor profile "${profile.id}" cell "${groupKey}" has ${count} trials; expected ${expectedCellCount}.`,
          );
        }
      }
    }
  }
}

function validateProfileSkills({ config, profile, job }) {
  const expectedSkills = [...profile.expectedSkills].sort();
  if (profile.skillMode === "enabled" && expectedSkills.length === 0) {
    throw new Error(`Harbor profile "${profile.id}" enables skills but declares no expectedSkills.`);
  }
  if (profile.skillMode === "disabled" && expectedSkills.length > 0) {
    throw new Error(`Harbor profile "${profile.id}" disables skills but declares expectedSkills.`);
  }

  const configuredAgents = job.config.agents ?? [];
  for (const variant of config.comparison.variants) {
    const matches = configuredAgents.filter((agent) =>
      agent.name === variant.agent && agent.model_name === variant.model,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Harbor profile "${profile.id}" matched ${matches.length} configured agents for variant "${variant.id}".`,
      );
    }
    assertExpectedSkills({
      actualSkills: matches[0].skills,
      expectedSkills,
      context: `profile "${profile.id}" agent "${variant.id}"`,
    });
  }

  for (const trial of job.trials) {
    assertExpectedSkills({
      actualSkills: trial.result.config?.agent?.skills,
      expectedSkills,
      context: `trial "${trial.result.trial_name}"`,
    });
  }
}

function assertExpectedSkills({ actualSkills, expectedSkills, context }) {
  const actualNames = (actualSkills ?? []).map(skillName).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedSkills)) {
    throw new Error(
      `Harbor ${context} has skills [${actualNames.join(", ")}]; expected [${expectedSkills.join(", ")}].`,
    );
  }
}

function skillName(skill) {
  const normalized = String(skill).replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
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

function createScenario({ config, profile, variant }) {
  const labels = {
    adapter: variant.agent,
    adapterDisplayName: variant.agent,
    displayName: profile.id,
    profileDisplayName: profile.displayName,
    profileId: profile.id,
    reportDisplayName: profile.displayName,
    model: variant.model,
    skill: profile.skillMode === "enabled" ? "on" : "off",
    skillDisplayName: profile.displayName,
    skillModeId: profile.id,
    skillSource: profile.skillSource,
    variant: variant.id,
    variantDisplayName: variant.displayName,
    skill_state: profile.skillMode === "enabled" ? "on" : "off",
  };

  return {
    id: buildScenarioId(variant.id, profile.id),
    description: `${variant.displayName} | ${profile.description}`,
    agent: {
      adapter: variant.agent,
      model: variant.model,
    },
    skillMode: profile.skillMode,
    skillSource: profile.skillSource,
    output: {
      tags: ["harbor", "poc", profile.id, variant.id],
      labels,
    },
  };
}

function findVariant(variants, result) {
  const agent = result.agent_info?.name ?? result.config?.agent?.name;
  const configuredModel = result.config?.agent?.model_name;
  const reportedModel = result.agent_info?.model_info?.name;
  const reportedProvider = result.agent_info?.model_info?.provider;
  const modelCandidates = new Set([
    configuredModel,
    reportedModel,
    reportedProvider && reportedModel ? `${reportedProvider}/${reportedModel}` : null,
  ].filter(Boolean));
  const matches = variants.filter((variant) =>
    variant.agent === agent && modelCandidates.has(variant.model),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Harbor trial "${result.trial_name}" matched ${matches.length} variants for agent=${agent}, models=${[...modelCandidates].join(",")}.`,
    );
  }

  return matches[0];
}

function findPrompt(prompts, result) {
  const matches = prompts.filter((prompt) => prompt.harborTaskName === result.task_name);
  if (matches.length !== 1) {
    throw new Error(
      `Harbor trial "${result.trial_name}" matched ${matches.length} prompts for task_name=${result.task_name}.`,
    );
  }
  return matches[0];
}

function aggregateAgentUsage(result) {
  const contexts = result.agent_result
    ? [result.agent_result]
    : (result.step_results ?? []).map((step) => step.agent_result).filter(Boolean);
  let inputTokens = null;
  let cacheTokens = null;
  let outputTokens = null;
  let cost = null;

  for (const context of contexts) {
    inputTokens = addOptionalNumber(inputTokens, context.n_input_tokens);
    cacheTokens = addOptionalNumber(cacheTokens, context.n_cache_tokens);
    outputTokens = addOptionalNumber(outputTokens, context.n_output_tokens);
    cost = addOptionalNumber(cost, context.cost_usd);
  }

  const hasUsage = inputTokens !== null || cacheTokens !== null || outputTokens !== null || cost !== null;
  const totalTokens = inputTokens === null || outputTokens === null
    ? null
    : inputTokens + outputTokens;
  return { inputTokens, cacheTokens, outputTokens, cost, totalTokens, hasUsage };
}

function addOptionalNumber(current, value) {
  return typeof value === "number" && Number.isFinite(value)
    ? (current ?? 0) + value
    : current;
}

function extractAgentOutput(result) {
  const contexts = result.agent_result
    ? [result.agent_result]
    : (result.step_results ?? []).map((step) => step.agent_result).filter(Boolean);
  const candidateKeys = ["final_output", "output", "response", "text"];

  for (const context of contexts.toReversed()) {
    for (const key of candidateKeys) {
      if (typeof context.metadata?.[key] === "string") {
        return context.metadata[key];
      }
    }
  }
  return null;
}

function durationMs(timing) {
  if (!timing?.started_at || !timing?.finished_at) {
    return null;
  }
  const startedAt = Date.parse(timing.started_at);
  const finishedAt = Date.parse(timing.finished_at);
  const duration = finishedAt - startedAt;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function aggregateAgentExecutionDuration(result) {
  const singleStepDuration = durationMs(result.agent_execution);
  if (singleStepDuration !== null) {
    return singleStepDuration;
  }
  if (!Array.isArray(result.step_results) || result.step_results.length === 0) {
    return null;
  }
  const durations = result.step_results.map((step) => durationMs(step.agent_execution));
  return durations.some((duration) => duration === null)
    ? null
    : durations.reduce((total, duration) => total + duration, 0);
}

function formatHarborException(exceptionInfo) {
  if (!exceptionInfo) {
    return null;
  }
  return [exceptionInfo.exception_type, exceptionInfo.exception_message]
    .filter(Boolean)
    .join(": ");
}

function buildScenarioId(variantId, profileId) {
  return `${variantId}-${profileId}`;
}

function resolveFrom(baseDirectory, inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDirectory, inputPath);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseProfileOverrides(argv) {
  const overrides = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--profile") {
      continue;
    }
    const value = argv[index + 1];
    if (!value || !value.includes("=")) {
      throw new Error("--profile requires <profile-id>=<harbor-job-directory>.");
    }
    const separatorIndex = value.indexOf("=");
    const profileId = value.slice(0, separatorIndex);
    const inputDirectory = value.slice(separatorIndex + 1);
    overrides.set(
      profileId,
      path.isAbsolute(inputDirectory)
        ? inputDirectory
        : path.resolve(process.cwd(), inputDirectory),
    );
    index += 1;
  }
  return overrides;
}

function readOption(argv, optionName) {
  const index = argv.indexOf(optionName);
  return index === -1 ? null : argv[index + 1] ?? null;
}

async function main() {
  const configArgument = process.argv[2];
  if (!configArgument || configArgument.startsWith("--")) {
    throw new Error(
      "Usage: node normalize-harbor-jobs.js <report-config.yaml> [--profile <id>=<job-dir>] [--output <dir>]",
    );
  }
  const loaded = await loadHarborReportConfig(configArgument);
  const outputArgument = readOption(process.argv, "--output");
  const outputDirectory = outputArgument
    ? path.resolve(outputArgument)
    : path.resolve(loaded.configDirectory, ".tmp", "normalized");
  const profileDirectoryOverrides = parseProfileOverrides(process.argv.slice(3));

  const result = await normalizeHarborJobs({
    ...loaded,
    outputDirectory,
    profileDirectoryOverrides,
  });
  console.log(JSON.stringify({
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
