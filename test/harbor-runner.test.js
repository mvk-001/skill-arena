import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRunPlan,
  createRunId,
  inspectAgentCredentials,
  runHarborEvaluation,
} from "../skills/harbor-runner/scripts/run-harbor-evaluation.js";
import { loadHarborReportConfig } from "../skills/harbor-runner/scripts/normalize-harbor-jobs.js";

const evaluationDirectory = path.resolve("evaluations", "harbor-report-parity-poc");
const reportConfigPath = path.join(evaluationDirectory, "report-config.yaml");
const liveReportConfigPath = path.join(evaluationDirectory, "report-config-live.yaml");

test("Harbor runner creates stable unique run ids and profile job destinations", async () => {
  assert.equal(createRunId(new Date("2026-07-13T12:34:56.789Z")), "20260713t123456z");
  const loaded = await loadHarborReportConfig(liveReportConfigPath);
  const plan = await buildRunPlan({
    ...loaded,
    runId: "repeat-01",
  });

  assert.deepEqual(
    plan.map(({ profileId, jobName }) => ({ profileId, jobName })),
    [
      { profileId: "no-skill", jobName: "harbor-report-poc-no-skill-repeat-01" },
      { profileId: "skill", jobName: "harbor-report-poc-skill-repeat-01" },
    ],
  );
  assert.notEqual(plan[0].jobDirectory, plan[1].jobDirectory);
});

test("Harbor runner normalizes existing profile results and writes a run manifest", async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-runner-skip-"));
  try {
    const result = await runHarborEvaluation({
      reportConfigPath,
      outputDirectory,
      runId: "fixture-normalize",
      skipRun: true,
      generatedAt: "2026-07-13T12:00:00.000Z",
    });

    assert.equal(result.runManifest.mode, "normalize-only");
    assert.equal(result.runManifest.checks, null);
    assert.equal(result.runManifest.runId, "fixture-normalize");
    assert.match(result.report, /Codex \/ GPT-5\.1 Mini/);
    assert.equal(
      JSON.parse(await fs.readFile(result.runManifestPath, "utf8")).reportPath,
      result.mergedArtifacts.reportPath,
    );
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test("Harbor runner executes fresh profile jobs before normalizing them", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-runner-live-"));
  const jobsDirectory = path.join(tempDirectory, "jobs");
  const outputDirectory = path.join(tempDirectory, "output");
  const calls = [];
  const profileJobOverrides = new Map();

  for (const profileId of ["no-skill", "skill"]) {
    const jobConfigPath = path.join(tempDirectory, `${profileId}.json`);
    const skills = profileId === "skill"
      ? [path.join(evaluationDirectory, "skills", "harbor-marker-guide")]
      : [];
    await fs.writeFile(jobConfigPath, JSON.stringify({
      job_name: `test-${profileId}`,
      jobs_dir: jobsDirectory,
      n_attempts: 2,
      n_concurrent_trials: 2,
      agents: [
        {
          name: "claude-code",
          model_name: "anthropic/claude-haiku-4-5",
          skills,
        },
        {
          name: "codex",
          model_name: "openai/gpt-5.1-codex-mini",
          skills,
        },
      ],
      datasets: [{ path: path.join(evaluationDirectory, "dataset") }],
    }), "utf8");
    profileJobOverrides.set(profileId, jobConfigPath);
  }

  const commandRunner = async (command, args) => {
    calls.push({ command, args });
    if (command === "docker" || command === "uv" || args.includes("--print-config")) {
      return;
    }
    const configPath = args[args.indexOf("--config") + 1];
    const jobName = args[args.indexOf("--job-name") + 1];
    const profileId = path.basename(configPath, ".json");
    await fs.cp(
      path.join(evaluationDirectory, "fixtures", "harbor-jobs", profileId),
      path.join(jobsDirectory, jobName),
      { recursive: true },
    );
  };

  try {
    const result = await runHarborEvaluation({
      reportConfigPath,
      outputDirectory,
      runId: "live-test",
      profileJobOverrides,
      commandRunner,
      environment: {
        OPENAI_API_KEY: "test-openai-key",
        ANTHROPIC_API_KEY: "test-anthropic-key",
      },
      generatedAt: "2026-07-13T12:00:00.000Z",
    });

    assert.equal(result.runManifest.mode, "live");
    assert.equal(result.runManifest.checks.credentials.codex.mode, "api-key");
    assert.equal(result.runManifest.checks.credentials["claude-code"].mode, "api-key");
    assert.equal(result.runManifest.jobs.length, 2);
    assert.equal(calls.filter(({ command }) => command === "docker").length, 2);
    assert.equal(calls.filter(({ args }) => args.includes("--print-config")).length, 2);
    assert.equal(calls.filter(({ command, args }) =>
      command === "uvx" && args.includes("run") && !args.includes("--print-config"),
    ).length, 2);
    assert.match(result.report, /no-skill \| skill/);
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

test("Harbor runner doctor validates infrastructure and credentials without launching trials", async () => {
  const calls = [];
  const commandRunner = async (command, args) => {
    calls.push({ command, args });
  };

  const result = await runHarborEvaluation({
    reportConfigPath: liveReportConfigPath,
    runId: "doctor-test",
    doctor: true,
    commandRunner,
    environment: { OPENAI_API_KEY: "test-openai-key" },
  });

  assert.equal(result.mode, "doctor");
  assert.equal(result.checks.docker, "ready");
  assert.equal(result.checks.dockerCompose, "ready");
  assert.equal(result.checks.credentials.codex.mode, "api-key");
  assert.deepEqual(
    calls.filter(({ command }) => command === "docker").map(({ args }) => args),
    [
      ["info", "--format", "server={{.ServerVersion}}"],
      ["compose", "version", "--short"],
    ],
  );
  assert.equal(
    calls.filter(({ command, args }) =>
      command === "uvx" && args.includes("run") && !args.includes("--print-config"),
    ).length,
    0,
  );
});

test("Harbor runner doctor rejects an expired Codex subscription token", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-runner-auth-"));
  const authPath = path.join(tempDirectory, "auth.json");
  const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url");
  await fs.writeFile(authPath, JSON.stringify({
    tokens: { access_token: `header.${payload}.signature` },
  }), "utf8");

  try {
    await assert.rejects(
      inspectAgentCredentials({
        agentNames: ["codex"],
        environment: { CODEX_AUTH_JSON_PATH: authPath },
        now: Date.parse("2026-07-13T12:00:00Z"),
      }),
      /expired or expires within 60 seconds/i,
    );
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});
