import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(
  "skills",
  "harbor-resume-external-failures",
  "scripts",
  "resume_external_failures.py",
);
const uvAvailable = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

const retryPolicy = {
  max_retries: 0,
  exclude_exceptions: [
    "AgentTimeoutError",
    "ApiUsageLimitError",
    "VerifierOutputParseError",
    "RewardFileNotFoundError",
    "VerifierTimeoutError",
    "RewardFileEmptyError",
  ],
  wait_multiplier: 1,
  min_wait_sec: 1,
  max_wait_sec: 60,
};
const environment = {
  type: "docker",
  force_build: false,
  delete: true,
  cpu_enforcement_policy: "auto",
  memory_enforcement_policy: "auto",
  extra_docker_compose: [],
  kwargs: {},
  extra_allowed_hosts: [],
};
const verifier = { disable: false };

function runResume(config, ...args) {
  return spawnSync("uv", ["run", script, config, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    timeout: 120000,
  });
}

async function runWithFakeHarbor(
  root,
  config,
  template,
  log,
  { crashAttempt = null } = {},
) {
  const harness = path.join(root, `fake-harbor-${randomUUID()}.py`);
  const source = `
import importlib.util
import json
import shutil
import sys
import uuid
from pathlib import Path

SCRIPT = Path(${JSON.stringify(script)})
TEMPLATE = Path(${JSON.stringify(template)})
LOG = Path(${JSON.stringify(log)})
SPEC = importlib.util.spec_from_file_location("resume_external_failures", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\\n", encoding="utf-8")

class FakeJob:
    created = []

    def __init__(self, config):
        self.config = config

    @classmethod
    async def create(cls, config):
        cls.created.append(config.model_dump(mode="json", exclude_none=True))
        return cls(config)

    async def run(self):
        payload = self.config.model_dump(mode="json", exclude_none=True)
        destination = Path(self.config.jobs_dir).resolve() / self.config.job_name
        if destination.exists():
            raise RuntimeError("fake Harbor refuses to overwrite")
        shutil.copytree(TEMPLATE, destination)
        write_json(destination / "config.json", payload)
        trial_directory = next(path for path in destination.iterdir() if path.is_dir())
        result = json.loads((trial_directory / "result.json").read_text(encoding="utf-8"))
        result["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, str(destination)))
        trial_config = result["config"]
        trial_config["task"] = payload["tasks"][0]
        trial_config["agent"] = payload["agents"][0]
        trial_config["environment"] = payload["environment"]
        trial_config["verifier"] = payload["verifier"]
        trial_config["trials_dir"] = str(destination)
        result["config"] = trial_config
        result["task_id"] = {"path": payload["tasks"][0]["path"]}
        write_json(trial_directory / "config.json", trial_config)
        write_json(trial_directory / "result.json", result)
        trial_lock = json.loads((trial_directory / "lock.json").read_text(encoding="utf-8"))
        trial_lock["task"]["path"] = payload["tasks"][0]["path"]
        trial_lock["agent"] = dict(payload["agents"][0])
        skill_source = payload["agents"][0]["skills"][0]
        trial_lock["skills"][0]["source"] = skill_source
        trial_lock["environment"] = payload["environment"]
        trial_lock["verifier"] = payload["verifier"]
        write_json(trial_directory / "lock.json", trial_lock)
        root_lock = json.loads((destination / "lock.json").read_text(encoding="utf-8"))
        root_lock["n_concurrent_trials"] = 1
        root_lock["retry"] = payload["retry"]
        root_lock["trials"] = [trial_lock]
        write_json(destination / "lock.json", root_lock)

MODULE.Job = FakeJob
if ${Number.isInteger(crashAttempt) ? "True" : "False"}:
    real_import_retry_job = MODULE.import_retry_job
    def crash_selected_import(source, job_directory, attempt_number, reward_key):
        result = real_import_retry_job(source, job_directory, attempt_number, reward_key)
        if attempt_number == ${Number.isInteger(crashAttempt) ? crashAttempt : -1}:
            raise SystemExit(91)
        return result
    MODULE.import_retry_job = crash_selected_import
status = MODULE.main([${JSON.stringify(config)}])
write_json(LOG, {"status": status, "configs": FakeJob.created})
raise SystemExit(status)
`;
  await fs.writeFile(harness, source, "utf8");
  return spawnSync(
    "uv",
    ["run", "--with", "harbor==0.18.0", "--with", "PyYAML>=6,<7", "python", harness],
    { cwd: path.resolve("."), encoding: "utf8", timeout: 120000 },
  );
}

async function runWithModulePatch(root, config, patchSource, ...args) {
  const harness = path.join(root, `patched-resume-${randomUUID()}.py`);
  const source = `
import importlib.util
from pathlib import Path

SCRIPT = Path(${JSON.stringify(script)})
SPEC = importlib.util.spec_from_file_location("resume_external_failures", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
${patchSource}
raise SystemExit(MODULE.main([${JSON.stringify(config)}, ${args.map((item) => JSON.stringify(item)).join(", ")}]))
`;
  await fs.writeFile(harness, source, "utf8");
  return spawnSync(
    "uv",
    ["run", "--with", "harbor==0.18.0", "--with", "PyYAML>=6,<7", "python", harness],
    { cwd: path.resolve("."), encoding: "utf8", timeout: 120000 },
  );
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function fileHash(file) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function createSkill(root, name = "synthetic-retry-skill") {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Synthetic canonical skill used to test external retry lineage.",
      "---",
      "",
      "# Synthetic retry skill",
      "",
      "Return deterministic evidence.",
      "",
    ].join("\n"),
    "utf8",
  );
  return directory;
}

async function skillDigest(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  files.sort((left, right) => {
    const a = path.relative(directory, left).split(path.sep).join("/");
    const b = path.relative(directory, right).split(path.sep).join("/");
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const digest = createHash("sha256");
  for (const file of files) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    const content = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    digest.update(relative);
    digest.update(Buffer.from([0]));
    digest.update(content);
    digest.update(Buffer.from([0]));
  }
  return "sha256:" + digest.digest("hex");
}

async function createTask(root) {
  const directory = path.join(root, "task");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "task.toml"), 'version = "1"\n', "utf8");
  return directory;
}

async function taskContentDigest(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  files.sort((left, right) => {
    const a = path.relative(directory, left).split(path.sep).join("/");
    const b = path.relative(directory, right).split(path.sep).join("/");
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const outer = createHash("sha256");
  for (const file of files) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    const content = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    outer.update(`${relative}\0${content}\n`);
  }
  return "sha256:" + outer.digest("hex");
}

async function taskLegacyChecksum(directory) {
  async function hashDirectory(current) {
    const descriptors = [];
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const child = await hashDirectory(absolute);
        descriptors.push([`dirhash:${child}`, `name:${entry.name}`].sort().join("\0"));
      } else if (entry.isFile()) {
        const content = createHash("sha256").update(await fs.readFile(absolute)).digest("hex");
        descriptors.push([`data:${content}`, `name:${entry.name}`].sort().join("\0"));
      }
    }
    return createHash("sha256").update(descriptors.sort().join("\0\0")).digest("hex");
  }
  return hashDirectory(directory);
}

function normalizedAgent(skill, overrides = {}) {
  return {
    name: overrides.name ?? "codex",
    model_name: overrides.model ?? "openai/synthetic-model",
    skills: [skill],
    extra_allowed_hosts: [],
    kwargs: {
      version: overrides.version ?? "0.1.0",
      thinking: overrides.thinking ?? "low",
    },
    mcp_servers: [],
  };
}

function lockedAgent(agent) {
  const copy = structuredClone(agent);
  delete copy.skills;
  return copy;
}

async function createJob(root, options) {
  const directory = path.join(root, options.name);
  const skill = options.skill;
  const task = options.task;
  const skillName = path.basename(skill);
  const digest = await skillDigest(skill);
  const taskDigest = options.taskDigest ?? await taskContentDigest(task);
  const legacyTaskChecksum = await taskLegacyChecksum(task);
  const agent = normalizedAgent(skill, options.agent);
  const taskConfig = { path: task, overwrite: false };
  const rootConfig = {
    job_name: options.name,
    jobs_dir: root,
    n_attempts: options.outcomes.length,
    install_only: false,
    timeout_multiplier: 1,
    debug: false,
    n_concurrent_trials: 1,
    quiet: false,
    retry: retryPolicy,
    environment,
    verifier,
    metrics: [],
    agents: [agent],
    datasets: [],
    tasks: [taskConfig],
    artifacts: [],
    extra_instruction_paths: [],
  };
  const jobId = randomUUID();
  const lockTrials = [];
  await fs.mkdir(directory, { recursive: true });
  await writeJson(path.join(directory, "config.json"), rootConfig);

  for (const [index, outcome] of options.outcomes.entries()) {
    const trialName = `${options.name}__synthetic-task__codex__${index + 1}`;
    const trialDirectory = path.join(directory, trialName);
    const trialConfig = {
      task: taskConfig,
      trial_name: trialName,
      trials_dir: directory,
      install_only: false,
      timeout_multiplier: 1,
      agent,
      environment,
      verifier,
      artifacts: [],
      extra_instruction_paths: [],
      job_id: jobId,
    };
    const result = {
      id: randomUUID(),
      task_name: "synthetic-task",
      trial_name: trialName,
      trial_uri: pathToFileURL(trialDirectory).href,
      task_id: { path: task },
      source: "synthetic",
      task_checksum: legacyTaskChecksum,
      config: trialConfig,
      agent_info: {
        name: agent.name,
        version: agent.kwargs.version,
        model_info: {
          name: agent.model_name.split("/").at(-1),
          provider: agent.model_name.includes("/") ? agent.model_name.split("/")[0] : null,
        },
      },
      agent_result: {
        n_input_tokens: 10,
        n_cache_tokens: 0,
        n_output_tokens: 2,
        cost_usd: 0.001,
      },
      verifier_result: Object.hasOwn(outcome, "reward")
        ? { rewards: { reward: outcome.reward, ...(outcome.rewards ?? {}) } }
        : outcome.rewards
          ? { rewards: outcome.rewards }
          : null,
      exception_info: outcome.exceptionType
        ? {
            exception_type: outcome.exceptionType,
            exception_message: "synthetic failure",
            exception_traceback: "synthetic traceback",
            occurred_at: "2026-07-18T12:00:01Z",
            ...(outcome.exceptionCode ? { error_code: outcome.exceptionCode } : {}),
          }
        : null,
      started_at: "2026-07-18T12:00:00Z",
      finished_at: "2026-07-18T12:00:01Z",
    };
    const trialLock = {
      schema_version: 1,
      task: {
        name: "synthetic-task",
        type: "local",
        digest: taskDigest,
        source: "synthetic",
        path: task,
      },
      install_only: false,
      timeout_multiplier: 1,
      agent: lockedAgent(agent),
      skills: [{ name: skillName, source: skill, digest }],
      environment,
      verifier,
    };
    await writeJson(path.join(trialDirectory, "result.json"), result);
    await writeJson(path.join(trialDirectory, "config.json"), trialConfig);
    if (!outcome.omitLock) await writeJson(path.join(trialDirectory, "lock.json"), trialLock);
    if (outcome.diagnostics) {
      await writeJson(
        path.join(trialDirectory, "verifier", "diagnostics.json"),
        outcome.diagnostics,
      );
    }
    for (const diagnostic of outcome.diagnosticFiles ?? []) {
      await writeJson(
        path.join(trialDirectory, ...diagnostic.path.split("/")),
        diagnostic.payload,
      );
    }
    lockTrials.push(trialLock);
  }

  await writeJson(path.join(directory, "lock.json"), {
    schema_version: 2,
    created_at: "2026-07-18T12:00:00Z",
    harbor: { version: "0.18.0", is_editable: false },
    n_concurrent_trials: 1,
    retry: retryPolicy,
    trials: lockTrials,
  });
  await writeJson(path.join(directory, "result.json"), {
    id: jobId,
    started_at: "2026-07-18T12:00:00Z",
    updated_at: "2026-07-18T12:00:01Z",
    finished_at: "2026-07-18T12:00:01Z",
    n_total_trials: options.outcomes.length,
    stats: {
      n_completed_trials: options.outcomes.length,
      n_errored_trials: options.outcomes.filter((item) => item.exceptionType).length,
      n_running_trials: 0,
      n_pending_trials: 0,
      n_cancelled_trials: 0,
      n_retries: 0,
      evals: {},
      n_input_tokens: options.outcomes.length * 10,
      n_cache_tokens: 0,
      n_output_tokens: options.outcomes.length * 2,
      cost_usd: options.outcomes.length * 0.001,
    },
  });
  return directory;
}

async function writeConfig(file, options) {
  await writeJson(file, {
    schemaVersion: 1,
    sourceJobs: options.sourceJobs,
    outputDirectory: options.output,
    rewardKey: "reward",
    requiredEnv: options.requiredEnv ?? [],
    policy: {
      maxExternalRetriesPerTrial: options.maxRetries ?? 1,
      ...(options.optInFailureContracts
        ? { optInFailureContracts: options.optInFailureContracts }
        : {}),
    },
    remediation: options.remediation ?? {},
    retryJobs: options.retryJobs ?? [],
  });
}

async function reservedRecoveryEntry(output, attempt = 1) {
  const lock = JSON.parse(await fs.readFile(path.join(output, "resume-lock.json"), "utf8"));
  const reservation = lock.attempts.find((item) => item.attempt === attempt && item.status === "reserved");
  assert.ok(reservation, `missing live reservation for attempt ${attempt}`);
  assert.ok(
    reservation.lifecycle.some((event) => event.phase === "harbor-call-starting"),
    "recovery requires a durable pre-call receipt",
  );
  return {
    sourceTrialKey: reservation.sourceTrialKey,
    attempt: reservation.attempt,
    jobDirectory: reservation.jobDirectory,
  };
}

const preAgentSigtermContract =
  "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1";

function preAgentSigtermTrace() {
  return [
    "Traceback (most recent call last):",
    '  File "/site-packages/harbor/cli/jobs.py", line 317, in _handle_sigterm',
    "    raise KeyboardInterrupt",
    "KeyboardInterrupt",
    "",
    "During handling of the above exception, another exception occurred:",
    "",
    '  File "/site-packages/harbor/trial/trial.py", line 350, in run',
    "    await self._prepare()",
    '  File "/site-packages/harbor/trial/trial.py", line 383, in _prepare',
    "    await self._setup_agent()",
    '  File "/site-packages/harbor/trial/trial.py", line 1129, in _setup_agent',
    "    await asyncio.wait_for(",
    '  File "/site-packages/harbor/agents/installed/pi.py", line 50, in install',
    "    await self.exec_as_agent(",
    "asyncio.exceptions.CancelledError",
    "",
  ].join("\n");
}

async function createPreAgentSigtermJob(root, { name, skill, task }) {
  const directory = await createJob(root, {
    name,
    skill,
    task,
    outcomes: [{ exceptionType: "CancelledError" }],
  });
  const trialName = (await fs.readdir(directory, { withFileTypes: true }))
    .find((entry) => entry.isDirectory()).name;
  const trialDirectory = path.join(directory, trialName);
  const trialResultPath = path.join(trialDirectory, "result.json");
  const trialResult = JSON.parse(await fs.readFile(trialResultPath, "utf8"));
  const trace = preAgentSigtermTrace();
  Object.assign(trialResult, {
    agent_result: null,
    verifier_result: null,
    environment_setup: {
      started_at: "2026-07-18T12:00:00.100Z",
      finished_at: "2026-07-18T12:00:00.200Z",
    },
    agent_setup: {
      started_at: "2026-07-18T12:00:00.300Z",
      finished_at: "2026-07-18T12:00:00.900Z",
    },
    agent_execution: null,
    verifier: null,
    step_results: null,
    exception_info: {
      exception_type: "CancelledError",
      exception_message: "",
      exception_traceback: trace,
      occurred_at: "2026-07-18T12:00:00.901Z",
    },
  });
  await writeJson(trialResultPath, trialResult);
  await fs.mkdir(path.join(trialDirectory, "agent", "setup"), { recursive: true });
  await fs.mkdir(path.join(trialDirectory, "verifier"), { recursive: true });
  await fs.mkdir(path.join(trialDirectory, "artifacts", "logs", "artifacts"), {
    recursive: true,
  });
  await fs.writeFile(path.join(trialDirectory, "exception.txt"), trace, "utf8");
  const log = [
    "Running command: apt-get update && apt-get install -y curl",
    `Trial ${trialName} cancelled`,
    "Failed to download artifact '/logs/agent/pi.txt' from service 'main' (best-effort)",
    trace,
  ].join("\n");
  await fs.writeFile(path.join(directory, "job.log"), log, "utf8");
  await fs.writeFile(path.join(trialDirectory, "trial.log"), log, "utf8");
  await writeJson(path.join(trialDirectory, "artifacts", "manifest.json"), [
    {
      source: "/logs/artifacts",
      destination: "artifacts/logs/artifacts",
      type: "directory",
      status: "empty",
      service: null,
    },
    {
      source: "/logs/agent/pi.txt",
      destination: "artifacts/pi.jsonl",
      type: "file",
      status: "failed",
      service: null,
    },
  ]);
  const rootResultPath = path.join(directory, "result.json");
  const rootResult = JSON.parse(await fs.readFile(rootResultPath, "utf8"));
  Object.assign(rootResult, {
    finished_at: null,
    n_total_trials: 1,
    stats: {
      n_completed_trials: 1,
      n_errored_trials: 1,
      n_running_trials: 0,
      n_pending_trials: 0,
      n_cancelled_trials: 1,
      n_retries: 0,
      evals: {
        "pi__synthetic-model__tasks": {
          n_trials: 0,
          n_errors: 1,
          metrics: [{ mean: 0 }],
          pass_at_k: {},
          reward_stats: {},
          exception_stats: { CancelledError: [trialName] },
        },
      },
      n_input_tokens: null,
      n_cache_tokens: null,
      n_output_tokens: null,
      cost_usd: null,
    },
  });
  await writeJson(rootResultPath, rootResult);
  return { directory, trialDirectory, trialName };
}

test("dry-run and doctor classify exact external evidence without writes or preflights", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-plan-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const sentinel = path.join(root, "preflight-called");
    const remediationEvidence = path.join(root, "environment-remediation.json");
    await fs.writeFile(remediationEvidence, '{"change":"docker-daemon-restarted"}\n', "utf8");
    const source = await createJob(root, {
      name: "source-categories",
      skill,
      task,
      outcomes: [
        {
          reward: 0,
          rewards: { contract_gate: 0 },
          diagnostics: { status: "provider-failure", error_code: "rate-limit-exceeded" },
        },
        {
          reward: 0,
          rewards: { contract_gate: 0 },
          diagnosticFiles: [{
            path: "steps/final/verifier/provider/diagnostics.json",
            payload: {
              nested: { failure_domain: "provider", terminal_outcome: "provider-5xx" },
            },
          }],
        },
        { diagnostics: { failure_domain: "environment", error_code: "docker-unavailable" } },
        { diagnostics: { failure_domain: "authentication", error_code: "invalid-api-key" } },
        { diagnostics: { failure_domain: "provider", terminal_outcome: "context-limit" } },
        { exceptionType: "AgentTimeoutError" },
        { reward: 0, diagnostics: { status: "scored-response" } },
        { reward: 0, rewards: { contract_gate: 0 } },
        {},
        {
          reward: 0,
          diagnostics: { failure_domain: "provider", error_code: "rate-limit-exceeded" },
          diagnosticFiles: [{
            path: "verifier/nested/diagnostics.json",
            payload: { terminal_outcome: "answer-emitted-invalid-contract" },
          }],
        },
        {
          diagnosticFiles: [
            {
              path: "verifier/auth/diagnostics.json",
              payload: { failure_domain: "authentication", error_code: "invalid-api-key" },
            },
            {
              path: "steps/agent/verifier/context/diagnostics.json",
              payload: { failure_domain: "provider", terminal_outcome: "provider-context-limit" },
            },
          ],
        },
      ],
    });
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeConfig(config, {
      sourceJobs: [source],
      output,
      remediation: {
        environment: {
          attested: true,
          remediationType: "docker-daemon-restart",
          evidencePath: remediationEvidence,
          remediationEvidenceSha256: `sha256:${await fileHash(remediationEvidence)}`,
          preflightCommand: [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'called')`],
        },
      },
    });

    const doctor = runResume(config, "--doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorResult = JSON.parse(doctor.stdout);
    assert.equal(doctorResult.contractValid, true);
    assert.equal(doctorResult.eligibleTrials, 3);
    assert.equal(doctorResult.excludedTrials, 8);
    assert.equal(doctorResult.resumeNeeded, true);
    assert.equal(doctorResult.externalCalls, 0);
    assert.equal(doctorResult.readyForLive, false);
    assert.equal(doctorResult.liveReadiness, "preflight-not-executed");
    assert.deepEqual(doctorResult.requiredPaths, []);
    assert.ok(doctorResult.hostInputVerification.unverifiedHostInputs.length >= 3);
    const dry = runResume(config, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const plan = JSON.parse(dry.stdout);
    assert.equal(plan.summary.sourceTrials, 11);
    assert.equal(plan.summary.eligibleTrials, 3);
    assert.equal(plan.summary.resumeNeeded, true);
    assert.equal(plan.writes, 0);
    assert.equal(plan.externalCalls, 0);
    assert.equal(plan.trials.filter((row) => row.reason.startsWith("absolute-deny")).length, 3);
    assert.equal(plan.trials.filter((row) => row.classification === "semantic").length, 2);
    assert.equal(plan.trials.filter((row) => row.classification === "ambiguous").length, 1);
    assert.equal(plan.trials.filter((row) => row.classification === "conflict").length, 1);
    assert.equal(plan.trials.filter((row) => row.reason.includes("attestation")).length, 1);
    assert.ok(plan.trials.every((row) => row.sourceJobIndex === 0));
    assert.ok(plan.trials.every((row) => row.sourceJobName === "source-categories"));
    assert.ok(plan.trials.every((row) => row.sourceJobLabel === "1:source-categories"));
    assert.ok(plan.trials.every((row) => row.candidateId === "source-categories"));
    assert.ok(plan.trials.every((row) => row.trialId && row.trialName && row.taskId));
    const nestedEligible = plan.trials.find((row) =>
      row.diagnostics.some((item) => item.path.includes("steps/final/verifier")),
    );
    assert.equal(nestedEligible.eligible, true);
    assert.match(nestedEligible.diagnostics[0].sha256, /^sha256:[0-9a-f]{64}$/);
    await assert.rejects(fs.stat(output), /ENOENT/);
    await assert.rejects(fs.stat(sentinel), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("opt-in pre-agent SIGTERM retries only the unresolved trial and seals first-evaluable lineage", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-sigterm-positive-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const settled = await createJob(root, {
      name: "settled-extractive",
      skill,
      task,
      outcomes: [{ reward: 0.4 }],
    });
    const cancelled = await createPreAgentSigtermJob(root, {
      name: "cancelled-contrast",
      skill,
      task,
    });
    const retryTemplate = await createJob(root, {
      name: "successful-contrast-retry-template",
      skill,
      task,
      outcomes: [{ reward: 0.8 }],
    });
    const evidence = path.join(root, "infrastructure-remediation.json");
    await writeJson(evidence, {
      failureContract: preAgentSigtermContract,
      explicitContinuation: true,
      remediation: "operator-interruption-cleared",
    });
    const output = path.join(root, "resume-output");
    const config = path.join(root, "resume.json");
    await writeConfig(config, {
      sourceJobs: [
        { jobDirectory: settled, candidateId: "extractive", label: "settled" },
        {
          jobDirectory: cancelled.directory,
          candidateId: "contrast",
          label: "external-pre-agent",
        },
      ],
      output,
      optInFailureContracts: [preAgentSigtermContract],
      remediation: {
        infrastructure: {
          attested: true,
          remediationType: "operator-interruption-cleared",
          evidencePath: evidence,
          remediationEvidenceSha256: `sha256:${await fileHash(evidence)}`,
          preflightCommand: [process.execPath, "-e", "process.exit(0)"],
        },
      },
    });

    const doctor = runResume(config, "--doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorPayload = JSON.parse(doctor.stdout);
    assert.equal(doctorPayload.eligibleTrials, 1);
    assert.equal(doctorPayload.excludedTrials, 1);
    assert.equal(doctorPayload.externalCalls, 0);
    assert.equal(doctorPayload.readyForLive, false);
    assert.equal(doctorPayload.liveReadiness, "preflight-not-executed");
    assert.equal(await fs.stat(output).then(() => true, () => false), false);

    const dry = runResume(config, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const dryPayload = JSON.parse(dry.stdout);
    const eligible = dryPayload.trials.filter((row) => row.eligible);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].candidateId, "contrast");
    assert.equal(eligible[0].failureContract, preAgentSigtermContract);
    assert.equal(eligible[0].requiresRemediation, true);
    assert.match(eligible[0].remediationAttestationDigest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(eligible[0].evidenceArtifacts.some((item) => item.path.endsWith("exception.txt")));
    assert.equal(dryPayload.externalCalls, 0);

    const firstLog = path.join(root, "first-live-log.json");
    const live = await runWithFakeHarbor(root, config, retryTemplate, firstLog);
    assert.equal(live.status, 0, live.stderr);
    const firstCalls = JSON.parse(await fs.readFile(firstLog, "utf8"));
    assert.equal(firstCalls.configs.length, 1, "only contrast receives a new Harbor job");
    assert.match(firstCalls.configs[0].job_name, /^external-retry-/);
    assert.equal(firstCalls.configs[0].n_attempts, 1);
    const lock = JSON.parse(await fs.readFile(path.join(output, "resume-lock.json"), "utf8"));
    assert.equal(lock.attempts.length, 1);
    assert.equal(lock.attempts[0].parentTrialId, JSON.parse(
      await fs.readFile(path.join(cancelled.trialDirectory, "result.json"), "utf8"),
    ).id);
    assert.equal(lock.attempts[0].failureContract, preAgentSigtermContract);
    assert.match(lock.attempts[0].parentTrialResultSha256, /^sha256:[0-9a-f]{64}$/);
    assert.match(lock.attempts[0].remediationAttestationDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(lock.attempts[0].evaluable, true);
    const merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    assert.equal(merged.summary.selectedOriginal, 1);
    assert.equal(merged.summary.selectedRetry, 1);
    assert.equal(merged.effectiveJobs.length, 2);

    const secondLog = path.join(root, "second-live-log.json");
    const repeated = await runWithFakeHarbor(root, config, retryTemplate, secondLog);
    assert.equal(repeated.status, 0, repeated.stderr);
    const secondCalls = JSON.parse(await fs.readFile(secondLog, "utf8"));
    assert.equal(secondCalls.configs.length, 0, "first evaluable retry stops all later calls");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("pre-agent SIGTERM contract rejects lifecycle, token, trace, artifact-hash, and cap drift before Job.create", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-sigterm-negative-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const evidence = path.join(root, "infrastructure-remediation.json");
    await writeJson(evidence, {
      failureContract: preAgentSigtermContract,
      explicitContinuation: true,
    });
    const remediation = {
      infrastructure: {
        attested: true,
        remediationType: "operator-interruption-cleared",
        evidencePath: evidence,
        remediationEvidenceSha256: `sha256:${await fileHash(evidence)}`,
        preflightCommand: [process.execPath, "-e", "process.exit(0)"],
      },
    };
    const cases = [
      {
        name: "agent-execution",
        mutate: async ({ trialDirectory }) => {
          const file = path.join(trialDirectory, "result.json");
          const value = JSON.parse(await fs.readFile(file, "utf8"));
          value.agent_execution = {
            started_at: "2026-07-18T12:00:00.902Z",
            finished_at: "2026-07-18T12:00:00.903Z",
          };
          await writeJson(file, value);
        },
      },
      {
        name: "tokens",
        mutate: async ({ directory }) => {
          const file = path.join(directory, "result.json");
          const value = JSON.parse(await fs.readFile(file, "utf8"));
          value.stats.n_input_tokens = 1;
          await writeJson(file, value);
        },
      },
      {
        name: "trace",
        mutate: async ({ trialDirectory }) => {
          const file = path.join(trialDirectory, "result.json");
          const value = JSON.parse(await fs.readFile(file, "utf8"));
          value.exception_info.exception_traceback = value.exception_info.exception_traceback
            .replace("in _handle_sigterm", "in unknown_signal_handler");
          await writeJson(file, value);
        },
      },
      {
        name: "artifact-hash",
        mutate: async ({ trialDirectory }) => {
          await fs.appendFile(path.join(trialDirectory, "exception.txt"), "drift\n", "utf8");
        },
      },
    ];
    for (const item of cases) {
      const source = await createPreAgentSigtermJob(root, {
        name: `cancelled-${item.name}`,
        skill,
        task,
      });
      await item.mutate(source);
      const output = path.join(root, `output-${item.name}`);
      const config = path.join(root, `config-${item.name}.json`);
      await writeConfig(config, {
        sourceJobs: [source.directory],
        output,
        optInFailureContracts: [preAgentSigtermContract],
        remediation,
      });
      const sentinel = path.join(root, `job-create-${item.name}`);
      const completed = await runWithModulePatch(
        root,
        config,
        `
class ForbiddenJob:
    @classmethod
    async def create(cls, config):
        Path(${JSON.stringify(sentinel)}).write_text("called", encoding="utf-8")
        raise RuntimeError("Job.create must not run")
MODULE.Job = ForbiddenJob
`,
      );
      assert.notEqual(completed.status, 0, `${item.name} unexpectedly passed`);
      assert.equal(await fs.stat(sentinel).then(() => true, () => false), false);
    }

    const capped = await createPreAgentSigtermJob(root, {
      name: "cancelled-cap",
      skill,
      task,
    });
    const cappedConfig = path.join(root, "config-cap.json");
    await writeConfig(cappedConfig, {
      sourceJobs: [capped.directory],
      output: path.join(root, "output-cap"),
      maxRetries: 2,
      optInFailureContracts: [preAgentSigtermContract],
      remediation,
    });
    const capSentinel = path.join(root, "job-create-cap");
    const capResult = await runWithModulePatch(
      root,
      cappedConfig,
      `
class ForbiddenJob:
    @classmethod
    async def create(cls, config):
        Path(${JSON.stringify(capSentinel)}).write_text("called", encoding="utf-8")
        raise RuntimeError("Job.create must not run")
MODULE.Job = ForbiddenJob
`,
    );
    assert.notEqual(capResult.status, 0);
    assert.match(capResult.stderr, /requires policy\.maxExternalRetriesPerTrial=1/);
    assert.equal(await fs.stat(capSentinel).then(() => true, () => false), false);

    const noOptConfig = path.join(root, "config-no-opt.json");
    await writeConfig(noOptConfig, {
      sourceJobs: [capped.directory],
      output: path.join(root, "output-no-opt"),
    });
    const noOpt = runResume(noOptConfig, "--dry-run");
    assert.notEqual(noOpt.status, 0);
    assert.match(noOpt.stderr, /Incomplete Harbor job/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("analyze-only recovers only live reservations and stops at the first evaluable retry", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-merge-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-merge",
      skill,
      task,
      outcomes: [
        { diagnostics: { failure_domain: "provider", error_code: "rate-limit-exceeded" } },
        { reward: 0.7, diagnostics: { status: "scored-response" } },
      ],
    });
    const output = path.join(root, "output");
    const planConfig = path.join(root, "plan.json");
    await writeConfig(planConfig, { sourceJobs: [source], output, maxRetries: 2 });
    const dry = runResume(planConfig, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const externalKey = JSON.parse(dry.stdout).trials.find((row) => row.eligible).sourceTrialKey;
    const retryOne = await createJob(root, {
      name: "retry-one",
      skill,
      task,
      outcomes: [{ diagnostics: { failure_domain: "provider", error_code: "rate-limit-exceeded" } }],
    });
    const retryTwo = await createJob(root, {
      name: "retry-two",
      skill,
      task,
      outcomes: [{ reward: 0.9, diagnostics: { status: "scored-response" } }],
    });

    const arbitraryOutput = path.join(root, "arbitrary-output");
    const arbitraryConfig = path.join(root, "arbitrary.json");
    await writeConfig(arbitraryConfig, {
      sourceJobs: [source],
      output: arbitraryOutput,
      maxRetries: 2,
      retryJobs: [{ sourceTrialKey: externalKey, attempt: 1, jobDirectory: retryTwo }],
    });
    const arbitrary = runResume(arbitraryConfig, "--analyze-only");
    assert.notEqual(arbitrary.status, 0);
    assert.match(arbitrary.stderr, /pre-existing engine reservation|no live reservation/i);
    await assert.rejects(fs.stat(arbitraryOutput), /ENOENT/);

    const firstCrash = await runWithFakeHarbor(
      root,
      planConfig,
      retryOne,
      path.join(root, "first-crash-log.json"),
      { crashAttempt: 1 },
    );
    assert.equal(firstCrash.status, 91, firstCrash.stderr);
    const firstRecovery = await reservedRecoveryEntry(output, 1);
    const firstAnalyzeConfig = path.join(root, "analyze-first.json");
    await writeConfig(firstAnalyzeConfig, {
      sourceJobs: [source],
      output,
      maxRetries: 2,
      retryJobs: [firstRecovery],
    });
    const firstAnalyzed = runResume(firstAnalyzeConfig, "--analyze-only");
    assert.equal(firstAnalyzed.status, 0, firstAnalyzed.stderr);
    let merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    let retried = merged.trials.find((row) => row.sourceTrialKey === externalKey);
    assert.equal(retried.retries.length, 1);
    assert.equal(retried.selected, null);
    assert.equal(retried.unresolvedRetryableExternal, true);

    const secondCrash = await runWithFakeHarbor(
      root,
      planConfig,
      retryTwo,
      path.join(root, "second-crash-log.json"),
      { crashAttempt: 2 },
    );
    assert.equal(secondCrash.status, 91, secondCrash.stderr);
    const secondRecovery = await reservedRecoveryEntry(output, 2);
    const secondAnalyzeConfig = path.join(root, "analyze-second.json");
    await writeConfig(secondAnalyzeConfig, {
      sourceJobs: [source],
      output,
      maxRetries: 2,
      retryJobs: [secondRecovery],
    });
    const analyzed = runResume(secondAnalyzeConfig, "--analyze-only");
    assert.equal(analyzed.status, 0, analyzed.stderr);
    merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    retried = merged.trials.find((row) => row.sourceTrialKey === externalKey);
    assert.equal(retried.retries.length, 2);
    assert.equal(retried.selected.attempt, 2);
    assert.equal(retried.reward, 0.9);
    assert.equal(merged.summary.effectiveJobs, 1);
    const effective = merged.effectiveJobs[0].jobDirectory;
    const manifest = JSON.parse(
      await fs.readFile(path.join(effective, "resume-manifest.json"), "utf8"),
    );
    const retryLineage = manifest.lineage.find((row) => row.selected.lineage === "retry");
    assert.equal(retryLineage.selected.attempt, 2);
    const effectiveTrial = (await fs.readdir(effective, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const effectiveTrialResult = JSON.parse(
      await fs.readFile(path.join(effective, effectiveTrial, "result.json"), "utf8"),
    );
    assert.equal(effectiveTrialResult.trial_uri, pathToFileURL(path.join(effective, effectiveTrial)).href);
    assert.doesNotMatch(effectiveTrialResult.trial_uri, /\.build-/);

    const roundTripConfig = path.join(root, "round-trip.json");
    await writeConfig(roundTripConfig, {
      sourceJobs: [effective],
      output: path.join(root, "round-trip-output"),
    });
    const roundTrip = runResume(roundTripConfig, "--dry-run");
    assert.equal(roundTrip.status, 0, roundTrip.stderr);
    assert.equal(JSON.parse(roundTrip.stdout).summary.sourceTrials, 2);
    assert.equal(JSON.parse(roundTrip.stdout).summary.eligibleTrials, 0);

    const manifestHash = await fileHash(path.join(effective, "resume-manifest.json"));
    const duplicate = runResume(secondAnalyzeConfig, "--analyze-only");
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /first-evaluable|terminal|already imported|unresolved live reservation/i);
    assert.equal(await fileHash(path.join(effective, "resume-manifest.json")), manifestHash);

    const retryThree = await createJob(root, {
      name: "retry-three",
      skill,
      task,
      outcomes: [{ reward: 1, diagnostics: { status: "scored-response" } }],
    });
    const capConfig = path.join(root, "cap.json");
    await writeConfig(capConfig, {
      sourceJobs: [source],
      output,
      maxRetries: 2,
      retryJobs: [{ sourceTrialKey: externalKey, attempt: 3, jobDirectory: retryThree }],
    });
    const capped = runResume(capConfig, "--analyze-only");
    assert.notEqual(capped.status, 0);
    assert.match(capped.stderr, /cap|reservation|terminal/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reservation recovery rejects full-profile and artifact drift and preserves unresolved retries", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-drift-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-external",
      skill,
      task,
      outcomes: [{ diagnostics: { status: "provider-failure", error_code: "rate-limit-exceeded" } }],
    });
    const planConfig = path.join(root, "plan.json");
    const arbitraryOutput = path.join(root, "arbitrary-output");
    await writeConfig(planConfig, { sourceJobs: [source], output: arbitraryOutput });
    const dry = runResume(planConfig, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const key = JSON.parse(dry.stdout).trials[0].sourceTrialKey;
    const exactRetry = await createJob(root, {
      name: "retry-exact-template",
      skill,
      task,
      outcomes: [{ reward: 0.5, diagnostics: { status: "scored-response" } }],
    });
    const arbitraryConfig = path.join(root, "arbitrary.json");
    await writeConfig(arbitraryConfig, {
      sourceJobs: [source],
      output: arbitraryOutput,
      retryJobs: [{ sourceTrialKey: key, attempt: 1, jobDirectory: exactRetry }],
    });
    const arbitrary = runResume(arbitraryConfig, "--analyze-only");
    assert.notEqual(arbitrary.status, 0);
    assert.match(arbitrary.stderr, /reservation/i);
    await assert.rejects(fs.stat(arbitraryOutput), /ENOENT/);

    const jobDriftOutput = path.join(root, "job-profile-drift-output");
    const jobDriftLiveConfig = path.join(root, "job-profile-live.json");
    await writeConfig(jobDriftLiveConfig, { sourceJobs: [source], output: jobDriftOutput });
    const jobCrash = await runWithFakeHarbor(
      root,
      jobDriftLiveConfig,
      exactRetry,
      path.join(root, "job-profile-crash.json"),
      { crashAttempt: 1 },
    );
    assert.equal(jobCrash.status, 91, jobCrash.stderr);
    const jobRecovery = await reservedRecoveryEntry(jobDriftOutput, 1);
    const retryRootConfig = path.join(jobRecovery.jobDirectory, "config.json");
    const driftedRoot = JSON.parse(await fs.readFile(retryRootConfig, "utf8"));
    driftedRoot.debug = !driftedRoot.debug;
    await writeJson(retryRootConfig, driftedRoot);
    const jobDriftAnalyze = path.join(root, "job-profile-analyze.json");
    await writeConfig(jobDriftAnalyze, {
      sourceJobs: [source],
      output: jobDriftOutput,
      retryJobs: [jobRecovery],
    });
    const jobDrift = runResume(jobDriftAnalyze, "--analyze-only");
    assert.notEqual(jobDrift.status, 0);
    assert.match(jobDrift.stderr, /Retry JobConfig differs|jobCommonProfile/i);

    const trialDriftOutput = path.join(root, "trial-profile-drift-output");
    const trialDriftLiveConfig = path.join(root, "trial-profile-live.json");
    await writeConfig(trialDriftLiveConfig, { sourceJobs: [source], output: trialDriftOutput });
    const trialCrash = await runWithFakeHarbor(
      root,
      trialDriftLiveConfig,
      exactRetry,
      path.join(root, "trial-profile-crash.json"),
      { crashAttempt: 1 },
    );
    assert.equal(trialCrash.status, 91, trialCrash.stderr);
    const trialRecovery = await reservedRecoveryEntry(trialDriftOutput, 1);
    const retryTrial = (await fs.readdir(trialRecovery.jobDirectory, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const trialConfigPath = path.join(trialRecovery.jobDirectory, retryTrial, "config.json");
    const trialResultPath = path.join(trialRecovery.jobDirectory, retryTrial, "result.json");
    const driftedTrial = JSON.parse(await fs.readFile(trialConfigPath, "utf8"));
    driftedTrial.agent_timeout_multiplier = 7;
    await writeJson(trialConfigPath, driftedTrial);
    const driftedTrialResult = JSON.parse(await fs.readFile(trialResultPath, "utf8"));
    driftedTrialResult.config.agent_timeout_multiplier = 7;
    await writeJson(trialResultPath, driftedTrialResult);
    const trialDriftAnalyze = path.join(root, "trial-profile-analyze.json");
    await writeConfig(trialDriftAnalyze, {
      sourceJobs: [source],
      output: trialDriftOutput,
      retryJobs: [trialRecovery],
    });
    const trialDrift = runResume(trialDriftAnalyze, "--analyze-only");
    assert.notEqual(trialDrift.status, 0);
    assert.match(trialDrift.stderr, /agent_timeout_multiplier|TrialConfig differs/i);

    const artifactOutput = path.join(root, "artifact-drift-output");
    const artifactConfig = path.join(root, "artifact-live.json");
    await writeConfig(artifactConfig, { sourceJobs: [source], output: artifactOutput });
    const completed = await runWithFakeHarbor(
      root,
      artifactConfig,
      exactRetry,
      path.join(root, "artifact-live-log.json"),
    );
    assert.equal(completed.status, 0, completed.stderr);
    const completedLock = JSON.parse(
      await fs.readFile(path.join(artifactOutput, "resume-lock.json"), "utf8"),
    );
    const completedJob = completedLock.attempts[0].jobDirectory;
    const completedTrial = (await fs.readdir(completedJob, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const driftArtifact = path.join(completedJob, completedTrial, "agent", "post-lock-drift.txt");
    await fs.mkdir(path.dirname(driftArtifact), { recursive: true });
    await fs.writeFile(driftArtifact, "drift\n");
    const artifactDrift = runResume(artifactConfig, "--dry-run");
    assert.notEqual(artifactDrift.status, 0);
    assert.match(artifactDrift.stderr, /jobArtifactDigest|native artifacts|ledger field/i);

    const unresolvedRetry = await createJob(root, {
      name: "retry-still-external",
      skill,
      task,
      outcomes: [{ diagnostics: { status: "provider-failure", error_code: "rate-limit-exceeded" } }],
    });
    const unresolvedOutput = path.join(root, "unresolved-output");
    const unresolvedLiveConfig = path.join(root, "unresolved-live.json");
    await writeConfig(unresolvedLiveConfig, {
      sourceJobs: [source],
      output: unresolvedOutput,
    });
    const unresolvedCrash = await runWithFakeHarbor(
      root,
      unresolvedLiveConfig,
      unresolvedRetry,
      path.join(root, "unresolved-crash.json"),
      { crashAttempt: 1 },
    );
    assert.equal(unresolvedCrash.status, 91, unresolvedCrash.stderr);
    const unresolvedRecovery = await reservedRecoveryEntry(unresolvedOutput, 1);
    const unresolvedConfig = path.join(root, "unresolved-analyze.json");
    await writeConfig(unresolvedConfig, {
      sourceJobs: [source],
      output: unresolvedOutput,
      retryJobs: [unresolvedRecovery],
    });
    const unresolved = runResume(unresolvedConfig, "--analyze-only");
    assert.equal(unresolved.status, 0, unresolved.stderr);
    const merged = JSON.parse(
      await fs.readFile(path.join(unresolvedOutput, "merged-result.json"), "utf8"),
    );
    assert.equal(merged.trials[0].reward, null);
    assert.equal(merged.trials[0].unresolvedExternal, true);
    assert.deepEqual(merged.effectiveJobs, []);
    await assert.rejects(fs.stat(path.join(unresolvedOutput, "effective-jobs")), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing locks, non-finite rewards, symlinks, and junctions are rejected or excluded", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-safety-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const missingLock = await createJob(root, {
      name: "source-missing-lock",
      skill,
      task,
      outcomes: [{ omitLock: true, diagnostics: { status: "provider-failure" } }],
    });
    const missingConfig = path.join(root, "missing.json");
    await writeConfig(missingConfig, {
      sourceJobs: [missingLock],
      output: path.join(root, "missing-output"),
    });
    const missing = runResume(missingConfig, "--dry-run");
    assert.equal(missing.status, 0, missing.stderr);
    const missingPlan = JSON.parse(missing.stdout);
    assert.equal(missingPlan.summary.eligibleTrials, 0);
    assert.match(missingPlan.trials[0].reason, /missing-canonical-trial-artifacts/);

    const nonFinite = await createJob(root, {
      name: "source-non-finite",
      skill,
      task,
      outcomes: [{ reward: 0.1 }],
    });
    const nonFiniteTrial = (await fs.readdir(nonFinite, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const nonFiniteResult = path.join(nonFinite, nonFiniteTrial, "result.json");
    const text = await fs.readFile(nonFiniteResult, "utf8");
    await fs.writeFile(nonFiniteResult, text.replace('"reward": 0.1', '"reward": Infinity'), "utf8");
    const nonFiniteConfig = path.join(root, "non-finite.json");
    await writeConfig(nonFiniteConfig, {
      sourceJobs: [nonFinite],
      output: path.join(root, "non-finite-output"),
    });
    const invalid = runResume(nonFiniteConfig, "--dry-run");
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /NaN|Infinity|finite/i);

    const cleanSource = await createJob(root, {
      name: "source-root-link-target",
      skill,
      task,
      outcomes: [{ reward: 0.3 }],
    });
    let junctionSupported = true;
    const sourceAlias = path.join(root, "source-root-junction");
    try {
      await fs.symlink(cleanSource, sourceAlias, "junction");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) junctionSupported = false;
      else throw error;
    }
    if (junctionSupported) {
      const rootAliasConfig = path.join(root, "source-root-alias.json");
      await writeConfig(rootAliasConfig, {
        sourceJobs: [sourceAlias],
        output: path.join(root, "source-root-alias-output"),
      });
      const rootAlias = runResume(rootAliasConfig, "--dry-run");
      assert.notEqual(rootAlias.status, 0);
      assert.match(rootAlias.stderr, /junction|reparse|path chain/i);

      const realOutput = path.join(root, "real-output-target");
      await fs.mkdir(realOutput);
      const outputAlias = path.join(root, "output-root-junction");
      await fs.symlink(realOutput, outputAlias, "junction");
      const outputAliasConfig = path.join(root, "output-root-alias.json");
      await writeConfig(outputAliasConfig, {
        sourceJobs: [cleanSource],
        output: path.join(outputAlias, "nested-output"),
      });
      const outputRejected = runResume(outputAliasConfig, "--dry-run");
      assert.notEqual(outputRejected.status, 0);
      assert.match(outputRejected.stderr, /junction|reparse|path chain/i);

      const aliasedSkillParent = path.join(root, "aliased-skill-parent");
      await fs.mkdir(aliasedSkillParent);
      const aliasedSkill = path.join(aliasedSkillParent, path.basename(skill));
      await fs.symlink(skill, aliasedSkill, "junction");
      const skillAliasSource = await createJob(root, {
        name: "source-root-skill-junction",
        skill: aliasedSkill,
        task,
        outcomes: [{ reward: 0.3 }],
      });
      const skillAliasConfig = path.join(root, "skill-root-alias.json");
      await writeConfig(skillAliasConfig, {
        sourceJobs: [skillAliasSource],
        output: path.join(root, "skill-root-alias-output"),
      });
      const skillAliasRejected = runResume(skillAliasConfig, "--dry-run");
      assert.notEqual(skillAliasRejected.status, 0);
      assert.match(skillAliasRejected.stderr, /junction|reparse|path chain/i);

      const externalSource = await createJob(root, {
        name: "source-retry-root-link",
        skill,
        task,
        outcomes: [{ diagnostics: { failure_domain: "provider", error_code: "rate-limit-exceeded" } }],
      });
      const retryTarget = await createJob(root, {
        name: "retry-root-link-target",
        skill,
        task,
        outcomes: [{ reward: 0.4, diagnostics: { status: "scored-response" } }],
      });
      const retryPlanConfig = path.join(root, "retry-root-plan.json");
      const retryLinkOutput = path.join(root, "retry-root-link-output");
      await writeConfig(retryPlanConfig, { sourceJobs: [externalSource], output: retryLinkOutput });
      const retryPlan = runResume(retryPlanConfig, "--dry-run");
      assert.equal(retryPlan.status, 0, retryPlan.stderr);
      const retryKey = JSON.parse(retryPlan.stdout).trials[0].sourceTrialKey;
      const retryAlias = path.join(root, "retry-root-junction");
      await fs.symlink(retryTarget, retryAlias, "junction");
      const retryAliasConfig = path.join(root, "retry-root-alias.json");
      await writeConfig(retryAliasConfig, {
        sourceJobs: [externalSource],
        output: retryLinkOutput,
        retryJobs: [{ sourceTrialKey: retryKey, attempt: 1, jobDirectory: retryAlias }],
      });
      const retryAliasRejected = runResume(retryAliasConfig, "--analyze-only");
      assert.notEqual(retryAliasRejected.status, 0);
      assert.match(retryAliasRejected.stderr, /junction|reparse|path chain|reservation/i);
      await assert.rejects(fs.stat(retryLinkOutput), /ENOENT/);

      const stagingOutput = path.join(root, "staging-ancestor-output");
      const stagingEscape = path.join(root, "staging-escape-target");
      await fs.mkdir(stagingOutput);
      await fs.mkdir(stagingEscape);
      await fs.symlink(stagingEscape, path.join(stagingOutput, "retries"), "junction");
      const stagingConfig = path.join(root, "staging-ancestor.json");
      await writeConfig(stagingConfig, { sourceJobs: [externalSource], output: stagingOutput });
      const stagingRejected = runResume(stagingConfig);
      assert.notEqual(stagingRejected.status, 0);
      assert.match(stagingRejected.stderr, /junction|reparse|path chain/i);
      assert.deepEqual(await fs.readdir(stagingEscape), []);

      const linkedTarget = path.join(root, "linked-target");
      await fs.mkdir(linkedTarget);
      await fs.writeFile(path.join(linkedTarget, "payload.txt"), "escape", "utf8");
      await fs.symlink(linkedTarget, path.join(skill, "unsafe-link"), "junction");
      const linkedSource = await createJob(root, {
        name: "source-linked-skill",
        skill,
        task,
        outcomes: [{ reward: 0.3 }],
      });
      const linkedConfig = path.join(root, "linked.json");
      await writeConfig(linkedConfig, {
        sourceJobs: [linkedSource],
        output: path.join(root, "linked-output"),
      });
      const linked = runResume(linkedConfig, "--dry-run");
      assert.notEqual(linked.status, 0);
      assert.match(linked.stderr, /junction|reparse|links/i);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("live mode creates one fresh native job per eligible external trial with exact staged profiles", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-live-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-live-mixed",
      skill,
      task,
      outcomes: [
        { reward: 1, diagnostics: { status: "scored-response" } },
        { reward: 0, diagnostics: { terminal_outcome: "contract-failed" } },
        {
          reward: 0,
          rewards: { contract_gate: 0 },
          diagnostics: { status: "provider-failure", error_code: "rate-limit-exceeded" },
        },
        {
          reward: 0,
          rewards: { contract_gate: 0 },
          diagnostics: { failure_domain: "provider", terminal_outcome: "provider-5xx" },
        },
      ],
    });
    const conflictingSource = await createJob(root, {
      name: "source-live-conflict",
      skill,
      task,
      outcomes: [{
        reward: 0,
        diagnostics: {
          failure_domain: "provider",
          error_code: "rate-limit-exceeded",
          terminal_outcome: "answer-emitted-invalid-contract",
        },
      }],
    });
    const retryTemplate = await createJob(root, {
      name: "retry-template",
      skill,
      task,
      outcomes: [{ reward: 0.35, diagnostics: { status: "scored-response" } }],
    });
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeConfig(config, {
      sourceJobs: [source, conflictingSource],
      output,
      maxRetries: 2,
    });
    const dry = runResume(config, "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    const livePlan = JSON.parse(dry.stdout);
    assert.equal(livePlan.summary.eligibleTrials, 2);
    assert.equal(livePlan.trials.filter((row) => row.classification === "conflict").length, 1);

    const firstLog = path.join(root, "fake-log-first.json");
    const first = await runWithFakeHarbor(root, config, retryTemplate, firstLog);
    assert.equal(first.status, 0, first.stderr);
    const invocation = JSON.parse(await fs.readFile(firstLog, "utf8"));
    assert.equal(invocation.status, 0);
    assert.equal(invocation.configs.length, 2);
    const destinations = new Set();
    for (const jobConfig of invocation.configs) {
      assert.equal(jobConfig.n_attempts, 1);
      assert.equal(jobConfig.n_concurrent_trials, 1);
      assert.equal(jobConfig.tasks.length, 1);
      assert.equal(jobConfig.agents.length, 1);
      assert.equal(jobConfig.agents[0].name, "codex");
      assert.equal(jobConfig.agents[0].model_name, "openai/synthetic-model");
      assert.equal(jobConfig.agents[0].kwargs.version, "0.1.0");
      assert.equal(jobConfig.agents[0].kwargs.thinking, "low");
      assert.equal(jobConfig.agents[0].skills.length, 1);
      assert.equal(path.basename(jobConfig.agents[0].skills[0]), path.basename(skill));
      assert.equal(await skillDigest(jobConfig.agents[0].skills[0]), await skillDigest(skill));
      destinations.add(path.join(jobConfig.jobs_dir, jobConfig.job_name));
    }
    assert.equal(destinations.size, 2);
    const lock = JSON.parse(await fs.readFile(path.join(output, "resume-lock.json"), "utf8"));
    assert.equal(lock.attempts.length, 2);
    assert.ok(lock.attempts.every((attempt) => attempt.status === "completed"));
    const merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    assert.equal(merged.summary.selectedRetry, 2);
    assert.equal(merged.summary.effectiveJobs, 1);

    const existingHashes = new Map();
    for (const destination of destinations) {
      existingHashes.set(destination, await fileHash(path.join(destination, "result.json")));
    }
    const secondLog = path.join(root, "fake-log-second.json");
    const second = await runWithFakeHarbor(root, config, retryTemplate, secondLog);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(await fs.readFile(secondLog, "utf8")).configs.length, 0);
    const stopped = runResume(config, "--dry-run");
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(JSON.parse(stopped.stdout).summary.eligibleTrials, 0);
    assert.ok(
      JSON.parse(stopped.stdout).trials
        .filter((row) => row.classification === "external")
        .every((row) => /first-evaluable/.test(row.reason)),
    );
    for (const [destination, digest] of existingHashes) {
      assert.equal(await fileHash(path.join(destination, "result.json")), digest);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("default mode creates no retry job for semantic outcomes and never overwrites its effective job", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-default-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-semantic",
      skill,
      task,
      outcomes: [{ reward: 0.4, diagnostics: { status: "scored-response" } }],
    });
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeConfig(config, { sourceJobs: [source], output });
    const audit = runResume(config, "--analyze-only");
    assert.equal(audit.status, 0, audit.stderr);
    assert.equal(JSON.parse(audit.stdout).importedRetryJobs, 0);
    const auditPlan = JSON.parse(await fs.readFile(path.join(output, "resume-plan.json"), "utf8"));
    assert.equal(auditPlan.mode, "analyze-only");
    assert.equal(auditPlan.summary.importedRetryJobs, 0);
    const report = await fs.readFile(path.join(output, "report.md"), "utf8");
    assert.match(report, /Selected original results: 1/);
    assert.match(report, /Complete effective jobs: 1/);
    const stableArtifacts = [
      "resume-plan.json",
      "resume-lock.json",
      "merged-result.json",
      "report.md",
    ];
    const stableHashes = new Map(
      await Promise.all(stableArtifacts.map(async (name) => [name, await fileHash(path.join(output, name))])),
    );
    const noop = runResume(config, "--analyze-only");
    assert.equal(noop.status, 0, noop.stderr);
    assert.equal(JSON.parse(noop.stdout).byteIdempotentNoop, true);
    for (const [name, digest] of stableHashes) {
      assert.equal(await fileHash(path.join(output, name)), digest, `${name} must be byte-idempotent`);
    }
    const first = runResume(config);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).createdRetryJobs, 0);
    const merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    const effective = merged.effectiveJobs[0].jobDirectory;
    const manifest = path.join(effective, "resume-manifest.json");
    const before = await fileHash(manifest);
    const second = runResume(config);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).createdRetryJobs, 0);
    assert.equal(await fileHash(manifest), before);
    await assert.rejects(fs.stat(path.join(output, "retries")), /ENOENT/);

    const sealedManifest = JSON.parse(await fs.readFile(manifest, "utf8"));
    sealedManifest.lineage[0].selected.jobDirectory = root;
    await writeJson(manifest, sealedManifest);
    const tamperedManifestHash = await fileHash(manifest);
    const tampered = runResume(config, "--analyze-only");
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /lineage differs|lineage job path drifted/i);
    assert.equal(
      await fileHash(manifest),
      tamperedManifestHash,
      "failed verification must not overwrite a tampered effective manifest",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("remediation evidence, required paths, and attestation digests are verified and sealed", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-remediation-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-environment-remediation",
      skill,
      task,
      outcomes: [{ diagnostics: { failure_domain: "environment", error_code: "docker-unavailable" } }],
    });
    const evidence = path.join(root, "remediation-evidence.json");
    await fs.writeFile(evidence, '{"ticket":"local-change-17","action":"daemon-restart"}\n', "utf8");
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeJson(config, {
      schemaVersion: 1,
      sourceJobs: [source],
      outputDirectory: output,
      rewardKey: "reward",
      requiredEnv: [],
      requiredPaths: [task],
      policy: { maxExternalRetriesPerTrial: 1 },
      remediation: {
        environment: {
          attested: true,
          remediationType: "docker-daemon-restart",
          evidencePath: evidence,
          remediationEvidenceSha256: `sha256:${await fileHash(evidence)}`,
          preflightCommand: [process.execPath, "-e", "process.exit(0)"],
        },
      },
      retryJobs: [],
    });
    const doctor = runResume(config, "--doctor");
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorPayload = JSON.parse(doctor.stdout);
    assert.deepEqual(doctorPayload.requiredPaths, [task]);
    assert.deepEqual(doctorPayload.missingRequiredPaths, []);
    assert.equal(doctorPayload.readyForLive, false, "doctor does not execute the required preflight");

    const analyzed = runResume(config, "--analyze-only");
    assert.equal(analyzed.status, 0, analyzed.stderr);
    const lockText = await fs.readFile(path.join(output, "resume-lock.json"), "utf8");
    const lock = JSON.parse(lockText);
    const attestation = lock.contract.remediation.environment;
    assert.match(attestation.remediationAttestationDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(attestation.remediationEvidenceSha256, `sha256:${await fileHash(evidence)}`);
    assert.equal(lockText.includes("daemon-restart"), true, "type/path may be audited");
    assert.equal(lockText.includes("local-change-17"), false, "evidence contents must not be copied");

    await fs.appendFile(evidence, "drift\n", "utf8");
    const drifted = runResume(config, "--doctor");
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /evidence digest drift/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("source task checksum and complete executed profiles fail closed on drift", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-source-drift-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const makeCase = async (name) => createJob(root, {
      name,
      skill,
      task,
      outcomes: [{ reward: 0.4, diagnostics: { status: "scored-response" } }],
    });

    const checksumSource = await makeCase("source-checksum-drift");
    const checksumTrial = (await fs.readdir(checksumSource, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const checksumResultPath = path.join(checksumSource, checksumTrial, "result.json");
    const checksumResult = JSON.parse(await fs.readFile(checksumResultPath, "utf8"));
    checksumResult.task_checksum = "0".repeat(64);
    await writeJson(checksumResultPath, checksumResult);
    const checksumConfig = path.join(root, "checksum.json");
    await writeConfig(checksumConfig, {
      sourceJobs: [checksumSource],
      output: path.join(root, "checksum-output"),
    });
    const checksumRejected = runResume(checksumConfig, "--dry-run");
    assert.notEqual(checksumRejected.status, 0);
    assert.match(checksumRejected.stderr, /task checksum/i);

    const profileSource = await makeCase("source-profile-drift");
    const profileTrial = (await fs.readdir(profileSource, { withFileTypes: true }))
      .find((entry) => entry.isDirectory()).name;
    const sideConfigPath = path.join(profileSource, profileTrial, "config.json");
    const resultPath = path.join(profileSource, profileTrial, "result.json");
    const sideConfig = JSON.parse(await fs.readFile(sideConfigPath, "utf8"));
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    sideConfig.agent.extra_allowed_hosts = ["unexpected.example"];
    result.config = structuredClone(sideConfig);
    await writeJson(sideConfigPath, sideConfig);
    await writeJson(resultPath, result);
    const profileConfig = path.join(root, "profile.json");
    await writeConfig(profileConfig, {
      sourceJobs: [profileSource],
      output: path.join(root, "profile-output"),
    });
    const profileRejected = runResume(profileConfig, "--dry-run");
    assert.notEqual(profileRejected.status, 0);
    assert.match(profileRejected.stderr, /agent profile drift/i);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("exclusive lock and durable pre-file reservation fail closed after concurrency or setup interruption", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-transaction-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-transaction",
      skill,
      task,
      outcomes: [{ diagnostics: { failure_domain: "provider", error_code: "rate-limit-exceeded" } }],
    });
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeConfig(config, { sourceJobs: [source], output });

    const operationLock = path.join(root, ".output.resume-operation.lock");
    await fs.writeFile(operationLock, "active-or-stale\n", "utf8");
    const contended = runResume(config, "--analyze-only");
    assert.notEqual(contended.status, 0);
    assert.match(contended.stderr, /active or stale|operation lock/i);
    await assert.rejects(fs.stat(output), /ENOENT/);
    await fs.rm(operationLock);

    const interrupted = await runWithModulePatch(
      root,
      config,
      'def fail_copy(*args, **kwargs):\n    raise RuntimeError("injected-setup-interruption")\nMODULE.copy_canonical_skill = fail_copy',
    );
    assert.notEqual(interrupted.status, 0);
    const lock = JSON.parse(await fs.readFile(path.join(output, "resume-lock.json"), "utf8"));
    assert.equal(lock.attempts.length, 1);
    assert.equal(lock.attempts[0].status, "failed-setup");
    assert.equal(lock.attempts[0].lifecycle[0].phase, "durable-before-files");
    assert.match(lock.attempts[0].attemptRecordDigest, /^sha256:[0-9a-f]{64}$/);
    const resumed = runResume(config);
    assert.equal(resumed.status, 0, resumed.stderr);
    const after = JSON.parse(await fs.readFile(path.join(output, "resume-lock.json"), "utf8"));
    assert.equal(after.attempts.length, 1, "interrupted reservation consumes the immutable cap");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("effective jobs publish atomically and remove failed private builds", {
  skip: !uvAvailable,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-effective-atomic-"));
  try {
    const skill = await createSkill(root);
    const task = await createTask(root);
    const source = await createJob(root, {
      name: "source-effective-atomic",
      skill,
      task,
      outcomes: [{ reward: 0.5, diagnostics: { status: "scored-response" } }],
    });
    const output = path.join(root, "output");
    const config = path.join(root, "config.json");
    await writeConfig(config, { sourceJobs: [source], output });
    const failed = await runWithModulePatch(
      root,
      config,
      'def fail_build(destination, *args, **kwargs):\n    (destination / "partial-marker").write_text("partial")\n    raise RuntimeError("injected-effective-build-failure")\nMODULE.build_effective_job_at = fail_build',
      "--analyze-only",
    );
    assert.notEqual(failed.status, 0);
    const effectiveRoot = path.join(output, "effective-jobs");
    const entries = [];
    async function visit(directory) {
      try {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const absolute = path.join(directory, entry.name);
          entries.push(absolute);
          if (entry.isDirectory()) await visit(absolute);
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await visit(effectiveRoot);
    assert.equal(entries.some((entry) => path.basename(entry) === "effective-job"), false);
    assert.equal(entries.some((entry) => path.basename(entry).includes(".build-")), false);
    const clean = runResume(config, "--analyze-only");
    assert.equal(clean.status, 0, clean.stderr);
    const merged = JSON.parse(await fs.readFile(path.join(output, "merged-result.json"), "utf8"));
    assert.equal(merged.summary.effectiveJobs, 1);

    const atomicOutput = path.join(root, "atomic-output");
    const escapeTarget = path.join(root, "atomic-escape-target");
    await fs.mkdir(atomicOutput);
    await fs.mkdir(escapeTarget);
    const sentinel = path.join(escapeTarget, "sentinel.txt");
    await fs.writeFile(sentinel, "unchanged", "utf8");
    const maliciousTemporary = path.join(atomicOutput, ".resume-lock.json.fixed.tmp");
    let junctionSupported = true;
    try {
      await fs.symlink(escapeTarget, maliciousTemporary, "junction");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) junctionSupported = false;
      else throw error;
    }
    if (junctionSupported) {
      const atomicConfig = path.join(root, "atomic-config.json");
      await writeConfig(atomicConfig, { sourceJobs: [source], output: atomicOutput });
      const attacked = await runWithModulePatch(
        root,
        atomicConfig,
        'MODULE.secrets.token_hex = lambda _size: "fixed"',
        "--analyze-only",
      );
      assert.notEqual(attacked.status, 0);
      assert.match(attacked.stderr, /temporary|reparse|refusing|exist/i);
      assert.equal(await fs.readFile(sentinel, "utf8"), "unchanged");
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("raw q003 qualification artifacts dry-run to zero retries with the expected semantic and context denials", {
  skip: !uvAvailable,
}, async (t) => {
  const evidencePath = path.resolve(
    "evaluations",
    "knowledge-consult-evolution",
    "results",
    "q003-evidence.lock.json",
  );
  try {
    await fs.access(evidencePath);
  } catch {
    t.skip("q003 raw evidence is not present in this checkout");
    return;
  }
  const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  const sourceJobs = evidence.candidates.map((candidate) =>
    path.resolve(candidate.artifactLocks.jobRoot),
  );
  for (const source of sourceJobs) {
    try {
      await fs.access(source);
    } catch {
      t.skip("q003 native job roots are not present in this checkout");
      return;
    }
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harbor-resume-q003-"));
  try {
    const output = path.join(root, "must-not-exist");
    const config = path.join(root, "q003-dry-run.json");
    await writeConfig(config, {
      sourceJobs: sourceJobs.map((jobDirectory, index) => ({
        jobDirectory,
        candidateId: evidence.candidates[index].id,
        label: evidence.candidates[index].id,
      })),
      output,
    });
    const completed = runResume(config, "--dry-run");
    assert.equal(completed.status, 0, completed.stderr);
    const plan = JSON.parse(completed.stdout);
    assert.equal(plan.summary.sourceTrials, 8);
    assert.equal(plan.summary.eligibleTrials, 0);
    assert.equal(plan.summary.resumeNeeded, false);
    assert.ok(plan.summary.provenanceExcluded > 0);
    assert.ok(plan.summary.semanticButUntrusted > 0);
    assert.deepEqual(plan.trials.map((row) => row.sourceJobIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(
      plan.trials.map((row) => row.candidateId),
      evidence.candidates.map((candidate) => candidate.id),
    );
    assert.ok(plan.trials.every((row) => row.sourceJobName && row.sourceJobLabel));
    assert.ok(plan.trials.every((row) => row.trialId && row.trialName && row.taskId));
    assert.equal(plan.trials.filter((row) => row.classification === "semantic").length, 4);
    assert.equal(plan.trials.filter((row) => row.classification === "denied").length, 4);
    assert.equal(
      plan.trials.filter((row) => /context/.test(row.reason)).length,
      4,
    );
    assert.equal(
      plan.trials.filter((row) => /agent-timeout/.test(row.reason)).length,
      1,
    );
    const contextRows = plan.trials.filter((row) => /context/.test(row.reason));
    assert.equal(contextRows.filter((row) => !/agent-timeout/.test(row.reason)).length, 3);
    assert.equal(contextRows.filter((row) => /agent-timeout/.test(row.reason)).length, 1);
    assert.ok(contextRows.every((row) => row.failureDomain === null));
    assert.ok(contextRows.every((row) => row.observedExternalDomains.includes("provider")));
    assert.equal(plan.writes, 0);
    assert.equal(plan.externalCalls, 0);
    await assert.rejects(fs.stat(output), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
