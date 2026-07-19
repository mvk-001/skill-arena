import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adapterPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(adapterPath);
const repositoryRoot = path.resolve(scriptDirectory, "../../../../..");
const caseContractPath = path.join(scriptDirectory, "case-contract-v3.json");
const skillScript = path.join(
  repositoryRoot,
  "skills",
  "harbor-resume-external-failures",
  "scripts",
  "resume_external_failures.py",
);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a string`);
  return value.trim();
}

async function readJson(file, label = file) {
  return requireObject(JSON.parse(await fs.readFile(file, "utf8")), label);
}

async function sha256(file) {
  return `sha256:${createHash("sha256").update(await fs.readFile(file)).digest("hex")}`;
}

function wslToHost(value) {
  if (process.platform !== "win32") return value;
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(value);
  if (!match) return value;
  return `${match[1].toUpperCase()}:/${match[2] ?? ""}`;
}

function portableRelative(base, target) {
  const relative = path.relative(base, target).split(path.sep).join("/");
  if (!relative || path.isAbsolute(relative)) throw new Error(`Cannot make portable relative path: ${target}`);
  return relative;
}

function parseLocalEasternTimestamp(value) {
  const text = requireString(value, "original job started_at");
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}-04:00`);
}

function rejectShellPath(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectShellPath(child, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === "shellpath") throw new Error(`auth.json contains forbidden ${location}.${key}`);
    rejectShellPath(child, `${location}.${key}`);
  }
}

function validateAuthPayload(payload) {
  rejectShellPath(payload);
  const provider = requireObject(payload["openai-codex"], "auth.json.openai-codex");
  for (const key of ["type", "access", "refresh", "accountId"]) {
    requireString(provider[key], `auth.json.openai-codex.${key}`);
  }
  if (!Number.isFinite(provider.expires)) {
    throw new Error("auth.json.openai-codex.expires must be finite");
  }
}

async function authMetadata(file) {
  const payload = JSON.parse(await fs.readFile(file, "utf8"));
  validateAuthPayload(payload);
  const stats = await fs.stat(file, { bigint: true });
  if (!stats.isFile()) throw new Error(`auth source is not a regular file: ${file}`);
  return {
    pathWsl: "/mnt/c/Users/villa/.pi/agent/auth.json",
    sha256: await sha256(file),
    size: Number(stats.size),
    mtimeNs: stats.mtimeNs.toString(),
    mtimeUtc: new Date(Number(stats.mtimeNs / 1_000_000n)).toISOString(),
  };
}

async function oneDirectory(parent, label) {
  const entries = (await fs.readdir(parent, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (entries.length !== 1) throw new Error(`${label} must contain exactly one directory`);
  return path.join(parent, entries[0].name);
}

async function evidenceManifest(root, files) {
  const rows = [];
  for (const relative of files) {
    const file = path.join(root, ...relative.split("/"));
    const stats = await fs.stat(file);
    if (!stats.isFile()) throw new Error(`evidence file is not regular: ${file}`);
    rows.push({ path: relative, sha256: await sha256(file), size: stats.size });
  }
  return rows;
}

async function loadCase() {
  const contract = await readJson(caseContractPath, "generation-003 resume case contract");
  if (contract.schemaVersion !== 3) throw new Error("unsupported case-contract schemaVersion");
  const runtimeDirectory = path.resolve(repositoryRoot, contract.paths.resumeRuntime);
  const resumeOutput = path.resolve(repositoryRoot, contract.paths.resumeOutput);
  const jobsRoot = path.resolve(repositoryRoot, contract.paths.jobsRoot);
  const preparedRoot = path.resolve(repositoryRoot, contract.paths.preparedRoot);
  const knowledgeBundle = path.resolve(repositoryRoot, contract.paths.knowledgeBundle);
  const authSource = path.resolve(wslToHost(contract.harbor.authSourceWsl));
  if (runtimeDirectory === resumeOutput || runtimeDirectory.startsWith(`${resumeOutput}${path.sep}`)) {
    throw new Error("private resume preparation and final output must be disjoint");
  }
  return { contract, runtimeDirectory, resumeOutput, jobsRoot, preparedRoot, knowledgeBundle, authSource };
}

async function expectedArtifacts() {
  const context = await loadCase();
  const { contract, runtimeDirectory, jobsRoot, preparedRoot, knowledgeBundle, authSource } = context;
  const settledRoot = path.join(jobsRoot, contract.sourceCandidates.settled);
  const retryRoot = path.join(jobsRoot, contract.sourceCandidates.retryTarget);
  const settledJob = await oneDirectory(settledRoot, "settled candidate job root");
  const retryJob = await oneDirectory(retryRoot, "retry candidate job root");
  const settledTrial = await oneDirectory(settledJob, "settled Harbor job");
  const retryTrial = await oneDirectory(retryJob, "cancelled Harbor job");
  const settledJobResult = await readJson(path.join(settledJob, "result.json"), "settled JobResult");
  const settledTrialResult = await readJson(path.join(settledTrial, "result.json"), "settled TrialResult");
  const retryJobResult = await readJson(path.join(retryJob, "result.json"), "cancelled JobResult");
  const retryTrialResult = await readJson(path.join(retryTrial, "result.json"), "cancelled TrialResult");
  const auth = await authMetadata(authSource);
  const originalStartedMs = parseLocalEasternTimestamp(settledJobResult.started_at);
  const authMtimeMs = Number(BigInt(auth.mtimeNs) / 1_000_000n);
  if (!Number.isFinite(originalStartedMs) || authMtimeMs >= originalStartedMs) {
    throw new Error("sealed host auth mtime must precede the original live extractive job");
  }
  if (settledTrialResult.exception_info !== null || !settledJobResult.finished_at) {
    throw new Error("extractive source is not a settled original result");
  }
  if (retryJobResult.finished_at !== null || retryTrialResult.exception_info?.exception_type !== "CancelledError") {
    throw new Error("contrast source is not the expected cancelled root");
  }
  const criticalFiles = ["config.json", "lock.json", "result.json", "job.log"];
  const criticalTrialFiles = [
    "config.json",
    "lock.json",
    "result.json",
    "exception.txt",
    "trial.log",
    "artifacts/manifest.json",
  ];
  const attestation = {
    schemaVersion: 1,
    caseId: contract.caseId,
    failureContract: contract.failureContract,
    explicitContinuationAuthorized: true,
    authorization: {
      retryOnlyCandidate: contract.sourceCandidates.retryTarget,
      preserveSettledCandidate: contract.sourceCandidates.settled,
      maximumExternalRetries: 1,
      selection: contract.retryPolicy.selection,
    },
    remediation: {
      domain: "infrastructure",
      type: "operator-interruption-cleared-explicit-continuation",
      declaration: "The externally interrupted pre-agent trial may be retried once as a new job.",
    },
    hostAuthentication: {
      ...auth,
      mtimePrecedesOriginalLiveJob: true,
      originalLiveJobStartedAt: settledJobResult.started_at,
    },
    sealedInputs: {
      protocol: await sha256(path.join(path.dirname(scriptDirectory), "protocol.json")),
      preparedReceipt: await sha256(path.join(preparedRoot, "receipt.json")),
      preparedOverlayReceipt: await sha256(path.join(path.dirname(preparedRoot), "prepared-v2", "receipt.json")),
      executableContract: {
        caseContract: await sha256(caseContractPath),
        adapter: await sha256(adapterPath),
        wrapper: await sha256(path.join(scriptDirectory, "run-generation-003-resume.sh")),
        resumeEngine: await sha256(skillScript),
        resumeSkill: await sha256(path.join(path.dirname(path.dirname(skillScript)), "SKILL.md")),
        resumeContract: await sha256(path.join(path.dirname(path.dirname(skillScript)), "references", "contract.md")),
        generationPrepare: await sha256(path.join(path.dirname(scriptDirectory), "scripts", "prepare-generation-003.js")),
        generationEvidenceResolver: await sha256(path.join(path.dirname(scriptDirectory), "scripts", "evidence-resolution.js")),
        generationPublisher: await sha256(path.join(path.dirname(scriptDirectory), "scripts", "publish-generation-003.js"))
      },
      settled: {
        candidateId: contract.sourceCandidates.settled,
        jobDirectory: portableRelative(repositoryRoot, settledJob),
        trialId: settledTrialResult.id,
        trialName: settledTrialResult.trial_name,
        taskChecksum: settledTrialResult.task_checksum,
        artifacts: await evidenceManifest(settledJob, [
          ...criticalFiles,
          ...criticalTrialFiles.map((file) => `${path.basename(settledTrial)}/${file}`).filter(
            (file) => !file.endsWith("/exception.txt"),
          ),
        ]),
      },
      cancelled: {
        candidateId: contract.sourceCandidates.retryTarget,
        jobDirectory: portableRelative(repositoryRoot, retryJob),
        trialId: retryTrialResult.id,
        trialName: retryTrialResult.trial_name,
        taskChecksum: retryTrialResult.task_checksum,
        artifacts: await evidenceManifest(retryJob, [
          ...criticalFiles,
          ...criticalTrialFiles.map((file) => `${path.basename(retryTrial)}/${file}`),
        ]),
      },
    },
    publicationBoundary: {
      evidenceContentsArePrivate: true,
      publishOnlyRemediationEvidenceAndAttestationDigests: true,
    },
    supersedesDiagnosticPreparations: contract.supersedesDiagnosticPreparations,
  };
  const attestationText = `${JSON.stringify(attestation, null, 2)}\n`;
  const attestationDigest = `sha256:${createHash("sha256").update(attestationText).digest("hex")}`;
  const config = {
    schemaVersion: 1,
    sourceJobs: [
      {
        jobDirectory: portableRelative(runtimeDirectory, retryJob),
        candidateId: contract.sourceCandidates.retryTarget,
        label: "external-pre-agent-sigterm",
      },
    ],
    outputDirectory: portableRelative(runtimeDirectory, context.resumeOutput),
    rewardKey: "reward",
    requiredEnv: [],
    requiredPaths: [
      portableRelative(runtimeDirectory, authSource),
      portableRelative(runtimeDirectory, knowledgeBundle),
      portableRelative(runtimeDirectory, preparedRoot),
    ],
    policy: {
      maxExternalRetriesPerTrial: 1,
      optInFailureContracts: [contract.failureContract],
    },
    remediation: {
      infrastructure: {
        attested: true,
        remediationType: "operator-interruption-cleared-explicit-continuation",
        evidencePath: "remediation-attestation.json",
        remediationEvidenceSha256: attestationDigest,
        preflightCommand: [
          "node",
          "evaluations/knowledge-consult-evolution/meta-evolution/generation-003/external-resume/resume-generation-003.mjs",
          "preflight",
        ],
      },
    },
    retryJobs: [],
  };
  return {
    ...context,
    settledJob,
    retryJob,
    attestation,
    attestationText,
    config,
    configText: `${JSON.stringify(config, null, 2)}\n`,
  };
}

async function writeExact(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const existing = await fs.readFile(file, "utf8");
    if (existing !== content) throw new Error(`sealed runtime artifact drift: ${file}`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${file}.${process.pid}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, file);
}

async function prepare() {
  const expected = await expectedArtifacts();
  await writeExact(path.join(expected.runtimeDirectory, "remediation-attestation.json"), expected.attestationText);
  await writeExact(path.join(expected.runtimeDirectory, "resume-config.json"), expected.configText);
  return expected;
}

async function verify() {
  const expected = await expectedArtifacts();
  const attestationPath = path.join(expected.runtimeDirectory, "remediation-attestation.json");
  const configPath = path.join(expected.runtimeDirectory, "resume-config.json");
  if ((await fs.readFile(attestationPath, "utf8")) !== expected.attestationText) {
    throw new Error("private remediation attestation drift");
  }
  if ((await fs.readFile(configPath, "utf8")) !== expected.configText) {
    throw new Error("prepared resume config drift");
  }
  return expected;
}

function run(command, args, options = {}) {
  const completed = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.stdio ?? "pipe",
  });
  if (completed.error) throw completed.error;
  if (completed.status !== 0) {
    throw new Error(`${command} failed (${completed.status}): ${completed.stderr || completed.stdout}`);
  }
  return completed.stdout;
}

async function runCheck(mode) {
  const expected = await verify();
  const configPath = path.join(expected.runtimeDirectory, "resume-config.json");
  const stdout = run("uv", ["run", skillScript, configPath, `--${mode}`]);
  const payload = requireObject(JSON.parse(stdout), `${mode} output`);
  if (payload.externalCalls !== 0 || payload.writes !== 0) {
    throw new Error(`${mode} violated its zero-call/zero-write contract`);
  }
  const eligible = mode === "doctor"
    ? payload.eligibleTrials
    : payload.trials.filter((row) => row.eligible).length;
  if (eligible !== 1) throw new Error(`${mode} must select exactly the cancelled contrast trial`);
  if (mode === "dry-run") {
    const row = payload.trials.find((item) => item.eligible);
    if (row.candidateId !== expected.contract.sourceCandidates.retryTarget) {
      throw new Error("dry-run selected a candidate other than contrast");
    }
    if (payload.trials.some(
      (item) => item.candidateId === expected.contract.sourceCandidates.settled,
    )) {
      throw new Error("settled extractive evidence entered the retry engine");
    }
  }
  await fs.writeFile(
    path.join(expected.runtimeDirectory, `${mode}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return payload;
}

async function verifyAuth(authFile, attestationFile) {
  const attestation = await readJson(attestationFile, "private remediation attestation");
  const expected = requireObject(attestation.hostAuthentication, "attestation.hostAuthentication");
  const observed = await authMetadata(authFile);
  for (const field of ["sha256", "size", "mtimeNs"]) {
    if (String(observed[field]) !== String(expected[field])) {
      throw new Error(`auth.json ${field} drift`);
    }
  }
}

async function preflight() {
  if (process.platform !== "linux") throw new Error("generation-003 live preflight must run inside WSL/Linux");
  const expected = await verify();
  const attestationPath = path.join(expected.runtimeDirectory, "remediation-attestation.json");
  const authMount = expected.contract.harbor.authMountWsl;
  const stagedAuth = path.join(authMount, "auth.json");
  await verifyAuth(expected.authSource, attestationPath);
  await verifyAuth(stagedAuth, attestationPath);
  const entries = await fs.readdir(authMount);
  if (entries.length !== 1 || entries[0] !== "auth.json") {
    throw new Error("isolated Pi directory must contain exactly auth.json");
  }
  const imageId = run("docker", [
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    expected.contract.harbor.image,
  ]).trim();
  if (imageId !== expected.contract.harbor.imageId) throw new Error("q003 runtime image ID drift");
  const contrastSkill = path.join(
    expected.preparedRoot,
    "inputs",
    expected.contract.sourceCandidates.retryTarget,
    "consult-semantic-okf",
  );
  const shell = String.raw`set -euo pipefail
test -x /bin/bash
/bin/bash -lc "command -v python >/dev/null"
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
test -r /candidate/scripts/harbor_answer.py
python -B /candidate/scripts/harbor_answer.py --help >/dev/null
test -d /knowledge
test -r /knowledge/semantic/records.jsonl
test "$(find /root/.pi/agent -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)" = auth.json
test ! -e /root/.pi/agent/settings.json
! grep -R -i -F -q '"shellPath"' /root/.pi/agent
tmp_probe="$(mktemp /tmp/g003-resume-preflight.XXXXXX)"
rm -f "$tmp_probe"
: > /root/.pi/agent/.bind-write-preflight
rm -f /root/.pi/agent/.bind-write-preflight`;
  run("docker", [
    "run",
    "--pull",
    "never",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "/bin/bash",
    "--mount",
    `type=bind,source=${authMount},target=/root/.pi/agent`,
    "--mount",
    `type=bind,source=${contrastSkill},target=/candidate,readonly`,
    "--mount",
    `type=bind,source=${expected.knowledgeBundle},target=/knowledge,readonly`,
    expected.contract.harbor.image,
    "-lc",
    shell,
  ], { timeout: 60_000 });
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
}

async function main() {
  const [command = "verify", ...args] = process.argv.slice(2);
  if (command === "prepare") {
    const expected = await prepare();
    console.log(JSON.stringify({ ok: true, mode: "prepare", runtimeDirectory: expected.runtimeDirectory }));
    return;
  }
  if (command === "verify") {
    const expected = await verify();
    console.log(JSON.stringify({ ok: true, mode: "verify", runtimeDirectory: expected.runtimeDirectory }));
    return;
  }
  if (command === "doctor" || command === "dry-run") {
    const payload = await runCheck(command);
    console.log(JSON.stringify({
      ok: true,
      mode: command,
      externalCalls: payload.externalCalls,
      writes: payload.writes,
    }));
    return;
  }
  if (command === "verify-auth") {
    const expected = await loadCase();
    const auth = path.resolve(option(args, "--auth") ?? expected.authSource);
    const attestation = path.resolve(
      option(args, "--attestation")
        ?? path.join(expected.runtimeDirectory, "remediation-attestation.json"),
    );
    await verifyAuth(auth, attestation);
    console.log(JSON.stringify({ ok: true, mode: "verify-auth" }));
    return;
  }
  if (command === "preflight") {
    await preflight();
    console.log(JSON.stringify({ ok: true, mode: "preflight", externalCalls: 0 }));
    return;
  }
  throw new Error(`unsupported command: ${command}`);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 2;
});
