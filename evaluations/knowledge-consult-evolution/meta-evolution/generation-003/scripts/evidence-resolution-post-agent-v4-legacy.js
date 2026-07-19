import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  resolveContrastEffectiveEvidence,
} from "./evidence-resolution.js";
import { treeDigest } from "../../scripts/prepare-meta-evolution.js";

const CONTRAST_ID = "contrast-matrix-one-shot-answer";
const SOURCE_FAILURE_CONTRACT = "harbor-0.18.0.sigterm-during-agent-setup.pre-agent-execution.v1";
const RECOVERY_CONTRACT = "harbor-0.18.0.oserror-eio-during-artifact-collection.post-agent.pre-verifier.v1";
const RECOVERY_LOCK_KIND = "harbor-post-agent-verifier-recovery-lock";
const RECOVERY_RESULT_KIND = "harbor-post-agent-verifier-recovery-result";
const CALL_JOURNAL_KIND = "harbor-verifier-only-call-journal";
const COMPLETION_MODE = "verifier-only-recovery";
const SELECTION_POLICY = "first-evaluable-retry-never-best-of";
const RECOVERY_RELATIVE = "verifier-recovery/attempt-001";

class PythonJsonNumber {
  constructor(source) {
    this.source = source;
  }
}

function normalizePythonNumberSource(source) {
  if (/^-?(?:0|[1-9]\d*)$/.test(source)) return source === "-0" ? "0" : source;
  const exponent = /[eE]([+-]?\d+)$/.exec(source);
  if (exponent && Number(exponent[1]) !== 0) {
    throw new Error(`unsupported Python float exponent in ${source}`);
  }
  const number = Number(source);
  if (!Number.isFinite(number)) throw new Error(`non-finite JSON number ${source}`);
  const magnitude = Math.abs(number);
  if (magnitude > 1 || (magnitude !== 0 && magnitude < 1e-4)) {
    throw new Error(`Python float ${source} is outside the recovery score subset`);
  }
  if (Object.is(number, -0)) return "-0.0";
  const shortest = number.toString();
  if (/[eE]/.test(shortest)) throw new Error(`unsupported Python float spelling ${source}`);
  return Number.isInteger(number) ? `${shortest}.0` : shortest;
}

function comparePythonStrings(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function pythonCanonicalJson(value) {
  if (value instanceof PythonJsonNumber) return value.source;
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON forbids non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => pythonCanonicalJson(item)).join(",")}]`;
  if (!value || typeof value !== "object") {
    throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
  }
  const keys = Object.keys(value).sort(comparePythonStrings);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${pythonCanonicalJson(value[key])}`).join(",")}}`;
}

function pythonDigest(value) {
  return `sha256:${createHash("sha256").update(pythonCanonicalJson(value), "utf8").digest("hex")}`;
}

function parsePythonJson(text, label) {
  try {
    return JSON.parse(text, (_key, value, context) => (
      typeof value === "number" ? new PythonJsonNumber(normalizePythonNumberSource(context.source)) : value
    ));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function plainNumber(value, label, { integer = false, minimum = null } = {}) {
  const raw = value instanceof PythonJsonNumber ? value.source : value;
  const number = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  if (integer && (!Number.isInteger(number) || (typeof raw === "string" && /[.eE]/.test(raw)))) {
    throw new Error(`${label} must be an integer`);
  }
  if (minimum !== null && number < minimum) throw new Error(`${label} must be at least ${minimum}`);
  return number;
}

function clonePythonJson(value) {
  if (value instanceof PythonJsonNumber) return new PythonJsonNumber(value.source);
  if (Array.isArray(value)) return value.map(clonePythonJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clonePythonJson(item)]));
  }
  return value;
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof PythonJsonNumber) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be sha256:<lowercase-hex>`);
  }
  return value;
}

function requireNumber(value, label, { integer = false, minimum = null } = {}) {
  return plainNumber(value, label, { integer, minimum });
}

function assertValue(actual, expected, label) {
  const observed = actual instanceof PythonJsonNumber ? plainNumber(actual, label) : actual;
  const wanted = expected instanceof PythonJsonNumber ? plainNumber(expected, label) : expected;
  if (observed !== wanted) throw new Error(`${label} drift: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(observed)}`);
}

function assertKeys(value, required, optional, label) {
  const keys = Object.keys(requireObject(value, label)).sort();
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${label} lacks ${key}`);
  for (const key of keys) if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${key}`);
}

function cloneWithout(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

function hostPath(value) {
  const text = requireString(value, "stored path");
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(text);
  if (!match) return text;
  return `${match[1].toUpperCase()}:/${match[2] ?? ""}`;
}

function harborPath(value) {
  const text = requireString(value, "stored path").replaceAll("\\", "/");
  const match = /^([a-zA-Z]):\/(.*)$/.exec(text);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : text.replace(/\/$/, "");
}

function safeRelativePath(value, label) {
  const text = requireString(value, label).replaceAll("\\", "/");
  if (text.startsWith("/") || /^[a-zA-Z]:\//.test(text) || text.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return text;
}

function assertInside(root, candidate, label, { allowRoot = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if ((!allowRoot && relative === "") || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its declared root`);
  }
  return resolved;
}

async function assertNoLinkChain(root, target, label, expectedType) {
  const safeRoot = path.resolve(root);
  const resolved = assertInside(safeRoot, target, label, { allowRoot: true });
  const relative = path.relative(safeRoot, resolved);
  let current = safeRoot;
  const roots = [safeRoot];
  if (relative) {
    for (const component of relative.split(path.sep)) {
      current = path.join(current, component);
      roots.push(current);
    }
  }
  for (const node of roots) {
    const stat = await fs.lstat(node);
    if (stat.isSymbolicLink()) throw new Error(`${label} cannot contain symbolic links`);
  }
  const final = await fs.lstat(resolved);
  if (expectedType === "file" && !final.isFile()) throw new Error(`${label} must be a regular file`);
  if (expectedType === "file" && final.nlink !== 1) throw new Error(`${label} must not be hard linked`);
  if (expectedType === "directory" && !final.isDirectory()) throw new Error(`${label} must be a directory`);
  const [realRoot, realTarget] = await Promise.all([fs.realpath(safeRoot), fs.realpath(resolved)]);
  assertInside(realRoot, realTarget, label, { allowRoot: true });
  return resolved;
}

async function assertAbsoluteNoLink(target, label, expectedType) {
  const resolved = path.resolve(target);
  return assertNoLinkChain(path.parse(resolved).root, resolved, label, expectedType);
}

async function readJson(root, file, label) {
  const safe = await assertNoLinkChain(root, file, label, "file");
  const value = parsePythonJson(await fs.readFile(safe, "utf8"), label);
  return requireObject(value, label);
}

// Native Harbor artifacts are already byte-bound by nativeRetryJobArtifactManifest.
// They are ordinary JSON, not recovery records with Python self-digests, so parse
// their complete numeric domain without applying the deliberately narrow [0, 1]
// score-spelling adapter used by recovery locks, rewards, journals, and manifests.
async function readHarborJson(root, file, label) {
  const safe = await assertNoLinkChain(root, file, label, "file");
  try {
    const value = requireObject(JSON.parse(await fs.readFile(safe, "utf8")), label);
    const pending = [[value, label]];
    while (pending.length > 0) {
      const [current, currentLabel] = pending.pop();
      if (typeof current === "number") {
        if (!Number.isFinite(current) || Math.abs(current) > Number.MAX_SAFE_INTEGER) {
          throw new Error(`${currentLabel} contains a non-finite or unsafe JSON number`);
        }
      } else if (Array.isArray(current)) {
        current.forEach((item, index) => pending.push([item, `${currentLabel}[${index}]`]));
      } else if (current && typeof current === "object") {
        Object.entries(current).forEach(([key, item]) => pending.push([item, `${currentLabel}.${key}`]));
      }
    }
    return value;
  } catch (error) {
    throw new Error(`${label} is not valid ordinary Harbor JSON: ${error.message}`, { cause: error });
  }
}

async function sha256File(file) {
  return `sha256:${createHash("sha256").update(await fs.readFile(file)).digest("hex")}`;
}

async function storedPathEquals({ runtime, base, stored, expected, label, type = "directory" }) {
  const translated = hostPath(requireString(stored, label));
  const native = path.isAbsolute(translated)
    ? path.resolve(translated)
    : path.resolve(base ?? runtime, translated);
  const safe = await assertNoLinkChain(runtime, native, label, type);
  const wanted = await assertNoLinkChain(runtime, expected, `${label} expected`, type);
  const [left, right] = await Promise.all([fs.realpath(safe), fs.realpath(wanted)]);
  if (path.resolve(left) !== path.resolve(right)) throw new Error(`${label} differs from its fixed path`);
  if (base !== undefined) assertInside(base, safe, label, { allowRoot: true });
  return safe;
}

async function walkFiles(root, { omit = new Set() } = {}) {
  const safeRoot = await assertAbsoluteNoLink(root, "artifact tree", "directory");
  const rows = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`artifact tree contains link ${relative}`);
      if (entry.isDirectory()) {
        await assertNoLinkChain(safeRoot, absolute, `artifact directory ${relative}`, "directory");
        await walk(absolute);
      } else if (entry.isFile()) {
        if (omit.has(relative)) continue;
        const safe = await assertNoLinkChain(safeRoot, absolute, `artifact file ${relative}`, "file");
        const stat = await fs.stat(safe);
        if (stat.nlink !== 1) throw new Error(`artifact tree contains hard-linked file ${relative}`);
        rows.push({ path: relative, sha256: await sha256File(safe) });
      } else {
        throw new Error(`artifact tree contains unsupported node ${relative}`);
      }
    }
  }
  await walk(safeRoot);
  return rows;
}

async function walkDirectories(root, label) {
  const safeRoot = await assertAbsoluteNoLink(root, label, "directory");
  const rows = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePythonStrings(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(safeRoot, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error(`${label} contains link ${relative}`);
      if (entry.isDirectory()) {
        await assertNoLinkChain(safeRoot, absolute, `${label} directory ${relative}`, "directory");
        rows.push(relative);
        await walk(absolute);
      } else if (!entry.isFile()) {
        throw new Error(`${label} contains unsupported node ${relative}`);
      }
    }
  }
  await walk(safeRoot);
  return rows.sort(comparePythonStrings);
}

async function assertDirectChildren(root, { directories = [], files = [] }, label) {
  const safeRoot = await assertAbsoluteNoLink(root, label, "directory");
  const expected = new Map([
    ...directories.map((name) => [name, "directory"]),
    ...files.map((name) => [name, "file"]),
  ]);
  if (expected.size !== directories.length + files.length) throw new Error(`${label} has duplicate expected children`);
  const entries = await fs.readdir(safeRoot, { withFileTypes: true });
  const observedNames = entries.map((entry) => entry.name).sort(comparePythonStrings);
  const expectedNames = [...expected.keys()].sort(comparePythonStrings);
  if (pythonDigest(observedNames) !== pythonDigest(expectedNames)) {
    throw new Error(`${label} direct children differ from the exact recovery topology`);
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`${label} contains a symbolic link: ${entry.name}`);
    const expectedType = expected.get(entry.name);
    if ((expectedType === "directory" && !entry.isDirectory()) || (expectedType === "file" && !entry.isFile())) {
      throw new Error(`${label} child has the wrong type: ${entry.name}`);
    }
    await assertNoLinkChain(safeRoot, path.join(safeRoot, entry.name), `${label} child ${entry.name}`, expectedType);
  }
  return safeRoot;
}

function manifestDirectoryRows(rows) {
  const directories = new Set();
  for (const row of rows) {
    const parts = row.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }
  return [...directories].sort(comparePythonStrings);
}

async function verifyManifestDirectoryTopology(root, rows, label) {
  const observed = await walkDirectories(root, label);
  const expected = manifestDirectoryRows(rows);
  if (pythonDigest(observed) !== pythonDigest(expected)) {
    throw new Error(`${label} directories differ from its file manifest`);
  }
}

function normalizeDirectoryManifest(value, label) {
  const rows = requireArray(value, label).map((item, index) => (
    safeRelativePath(item, `${label}[${index}]`)
  ));
  if (new Set(rows).size !== rows.length) throw new Error(`${label} contains duplicate paths`);
  const sorted = [...rows].sort(comparePythonStrings);
  if (rows.some((item, index) => item !== sorted[index])) throw new Error(`${label} must be path-sorted`);
  return rows;
}

async function verifyDirectoryTopology(root, storedRows, expectedRows, label, emptyRows) {
  const stored = normalizeDirectoryManifest(storedRows, `${label} directory manifest`);
  if (pythonDigest(stored) !== pythonDigest(expectedRows)) {
    throw new Error(`${label} directory manifest differs from the exact recovery topology`);
  }
  const observed = await walkDirectories(root, `${label} directory topology`);
  if (pythonDigest(observed) !== pythonDigest(stored)) {
    throw new Error(`${label} directory topology differs from its manifest`);
  }
  for (const relative of emptyRows) {
    const directory = await assertNoLinkChain(
      root,
      path.join(root, ...relative.split("/")),
      `${label} expected empty directory ${relative}`,
      "directory",
    );
    if ((await fs.readdir(directory)).length !== 0) {
      throw new Error(`${label} expected empty directory is not empty: ${relative}`);
    }
  }
  return stored;
}

function normalizeManifestRows(value, label) {
  const rows = requireArray(value, label).map((raw, index) => {
    const row = requireObject(raw, `${label}[${index}]`);
    assertKeys(row, ["path", "sha256"], [], `${label}[${index}]`);
    return {
      path: safeRelativePath(row.path, `${label}[${index}].path`),
      sha256: requireDigest(row.sha256, `${label}[${index}].sha256`),
    };
  });
  const paths = rows.map((row) => row.path);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains duplicate paths`);
  if (paths.join("\n") !== [...paths].sort(comparePythonStrings).join("\n")) throw new Error(`${label} must be path-sorted`);
  return rows;
}

async function verifyManifest(root, storedRows, expectedDigest, label, { omit = new Set() } = {}) {
  const rows = normalizeManifestRows(storedRows, `${label} manifest`);
  assertValue(pythonDigest(rows), requireDigest(expectedDigest, `${label} digest`), `${label} manifest digest`);
  const actual = await walkFiles(root, { omit });
  if (pythonDigest(actual) !== pythonDigest(rows)) throw new Error(`${label} artifact manifest drift`);
  return { rows, digest: expectedDigest };
}

function assertPythonEqual(actual, expected, label) {
  if (pythonDigest(actual) !== pythonDigest(expected)) throw new Error(`${label} differs`);
}

function parseTerminalTrace(raw, expectedEvents) {
  const events = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`agent trace line ${index + 1} is invalid JSON`, { cause: error });
    }
    events.push(requireObject(value, `agent trace event ${index + 1}`));
  }
  assertValue(events.length, expectedEvents, "agent trace parsed event count");
  const assistantMessages = events.filter((event) => (
    event.type === "message_end"
    && event.message && typeof event.message === "object"
    && event.message.role === "assistant"
  ));
  if (assistantMessages.length === 0) throw new Error("agent trace lacks assistant completion");
  const final = requireObject(assistantMessages.at(-1).message, "terminal assistant message");
  assertValue(final.stopReason, "stop", "terminal assistant stop reason");
  if (final.errorMessage !== undefined && final.errorMessage !== null) throw new Error("terminal assistant message contains an error");
  const blocks = requireArray(final.content, "terminal assistant content");
  const text = blocks.filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text).join("").trim();
  if (!text) throw new Error("terminal assistant output is empty");
  let terminal;
  try {
    terminal = JSON.parse(text);
  } catch (error) {
    throw new Error("terminal assistant output is not JSON", { cause: error });
  }
  if (pythonDigest(Object.keys(requireObject(terminal, "terminal assistant JSON")).sort(comparePythonStrings)) !== pythonDigest(["answer", "evidence", "question_id"])) {
    throw new Error("terminal assistant JSON does not expose the closed q003 contract");
  }
  assertValue(terminal.question_id, "q003", "terminal assistant question id");
  requireArray(terminal.evidence, "terminal assistant evidence");
  const last = events.at(-1);
  assertValue(last.type, "agent_end", "agent trace terminal event");
  const tokens = { input: 0, cache: 0, output: 0 };
  for (const [index, event] of assistantMessages.entries()) {
    const usage = requireObject(event.message.usage, `assistant message ${index + 1} usage`);
    const rawInput = requireNumber(usage.input, `assistant message ${index + 1} input tokens`, { integer: true, minimum: 0 });
    const cache = requireNumber(usage.cacheRead, `assistant message ${index + 1} cache tokens`, { integer: true, minimum: 0 });
    tokens.input += rawInput + cache;
    tokens.cache += cache;
    tokens.output += requireNumber(usage.output, `assistant message ${index + 1} output tokens`, { integer: true, minimum: 0 });
  }
  return { events, text, tokens, sha256: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}` };
}

function validateNativeFailure(jobResult, trial, exceptionText, attempt, trace, agentTrace) {
  assertValue(jobResult.finished_at, null, "native retry root finished_at");
  assertValue(jobResult.n_total_trials, 1, "native retry trial count");
  for (const [field, expected] of Object.entries({
    n_completed_trials: 1,
    n_errored_trials: 1,
    n_running_trials: 0,
    n_pending_trials: 0,
    n_cancelled_trials: 0,
    n_retries: 0,
  })) assertValue(jobResult.stats?.[field], expected, `native retry ${field}`);
  assertValue(trial.exception_info?.exception_type, "OSError", "native retry exception type");
  if (!/^\[Errno 5\] Input\/output error: /.test(trial.exception_info?.exception_message ?? "")) {
    throw new Error("native retry exception is not exact Errno 5 artifact I/O failure");
  }
  const exactArtifactPath = `${harborPath(attempt.jobDirectory)}/${trial.trial_name}/artifacts/logs/artifacts`;
  if (!trial.exception_info.exception_message.includes(exactArtifactPath)) {
    throw new Error("native retry exception does not bind the exact artifact-collection path");
  }
  for (const marker of [
    "single_step.py\", line 45, in _run",
    "trial.py\", line 944, in _collect_artifacts_phased",
    "artifact_handler.py\", line 179, in download_artifacts",
    "artifact_handler.py\", line 297, in _download_artifact",
    "artifact_handler.py\", line 366, in _record_mounted_artifacts_dir",
    "has_contents = target.exists() and any(target.iterdir())",
  ]) {
    if (!exceptionText.includes(marker) || !trial.exception_info.exception_traceback.includes(marker)) {
      throw new Error(`native retry exception lacks required marker ${marker}`);
    }
  }
  for (const marker of ["_run_verifier", "AgentFactory", "agent.run", "provider"]) {
    if (exceptionText.toLowerCase().includes(marker.toLowerCase()) || trial.exception_info.exception_traceback.toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`native retry traceback crosses forbidden phase ${marker}`);
    }
  }
  if (exceptionText !== trial.exception_info.exception_traceback) throw new Error("native retry exception artifact differs from TrialResult traceback bytes");
  if (trial.agent_execution?.started_at === undefined || trial.agent_execution?.finished_at === undefined) {
    throw new Error("native retry lacks completed agent execution timing");
  }
  const agentResult = requireObject(trial.agent_result, "native retry agent_result");
  assertValue(trial.verifier, null, "native retry verifier timing");
  assertValue(trial.verifier_result, null, "native retry verifier result");
  assertValue(trial.step_results, null, "native retry step results");
  const tokens = requireObject(agentTrace.tokens, "recovery agent trace tokens");
  for (const [key, stored, observed] of [
    ["input", tokens.input, agentResult.n_input_tokens],
    ["cache", tokens.cache, agentResult.n_cache_tokens],
    ["output", tokens.output, agentResult.n_output_tokens],
  ]) {
    requireNumber(stored, "recovery token count", { integer: true, minimum: 0 });
    assertValue(stored, observed, "native retry token binding");
    assertValue(stored, trace.tokens[key], "native trace reconstructed token binding");
  }
  assertValue(jobResult.stats.n_input_tokens, tokens.input, "native retry root input tokens");
  assertValue(jobResult.stats.n_cache_tokens, tokens.cache, "native retry root cache tokens");
  assertValue(jobResult.stats.n_output_tokens, tokens.output, "native retry root output tokens");
  assertValue(agentTrace.parsedEvents, trace.events.length, "native trace event binding");
  assertValue(agentTrace.parsedEvents, 27, "q003 native trace event count");
  assertValue(agentTrace.terminal, "stop+agent_end", "native trace terminal classification");
  assertValue(agentTrace.terminalOutputSha256, trace.sha256, "native terminal output digest");
  assertValue(attempt.failureType, "ExceptionGroup", "resume engine failure type");
  assertValue(attempt.failureDomain, null, "resume engine outer failure domain");
}

async function verifyRun({ attemptRoot, run, index, protocol }) {
  assertKeys(run, [
    "run", "directory", "rewardPath", "rewardSha256", "diagnosticsPath", "diagnosticsSha256",
    "stdoutPath", "stdoutSha256", "exitCode", "startedAt", "finishedAt",
  ], [], `verifier run ${index}`);
  assertValue(run.run, index, `verifier run ${index} number`);
  assertValue(run.exitCode, 0, `verifier run ${index} exit code`);
  requireString(run.startedAt, `verifier run ${index} start time`);
  requireString(run.finishedAt, `verifier run ${index} finish time`);
  const expectedDirectory = path.join(attemptRoot, "verifier-runs", `run-${String(index).padStart(3, "0")}`);
  const directory = await storedPathEquals({ runtime: attemptRoot, base: attemptRoot, stored: run.directory, expected: expectedDirectory, label: `verifier run ${index} directory` });
  await assertDirectChildren(directory, {
    files: ["reward.json", "diagnostics.json", "test-stdout.txt"],
  }, `verifier run ${index}`);
  const files = {};
  for (const [field, expectedName, hashField] of [
    ["rewardPath", "reward.json", "rewardSha256"],
    ["diagnosticsPath", "diagnostics.json", "diagnosticsSha256"],
    ["stdoutPath", "test-stdout.txt", "stdoutSha256"],
  ]) {
    const expected = path.join(directory, expectedName);
    const file = await storedPathEquals({ runtime: attemptRoot, base: attemptRoot, stored: run[field], expected, label: `verifier run ${index} ${expectedName}`, type: "file" });
    assertValue(await sha256File(file), requireDigest(run[hashField], `verifier run ${index} ${hashField}`), `verifier run ${index} ${expectedName} digest`);
    files[field] = file;
  }
  const reward = await readJson(directory, files.rewardPath, `verifier run ${index} reward`);
  const diagnostics = await readJson(directory, files.diagnosticsPath, `verifier run ${index} diagnostics`);
  requireNumber(reward[protocol.frozenEvaluationProfile.rewardKey], `verifier run ${index} primary reward`, { minimum: 0 });
  assertValue(diagnostics.status, "scored-response", `verifier run ${index} status`);
  assertValue(diagnostics.terminal_outcome, "answer-emitted", `verifier run ${index} terminal outcome`);
  assertValue(diagnostics.failure_domain, null, `verifier run ${index} failure domain`);
  assertValue(diagnostics.question_id, "q003", `verifier run ${index} question`);
  return { reward, diagnostics };
}

function requireTimestamp(value, label) {
  const text = requireString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO-8601 timestamp`);
  return { text, timestamp };
}

async function verifyCallJournal({
  resumeOutput,
  attemptRoot,
  binding: rawBinding,
  recoveryLock,
  native,
  agentTrace,
  task,
  runs,
}) {
  const binding = requireObject(rawBinding, "recovery call journal binding");
  assertKeys(binding, ["path", "sha256", "journalRecordDigest"], [], "recovery call journal binding");
  const storedJournalPath = requireString(binding.path, "recovery call journal path");
  if (!path.isAbsolute(hostPath(storedJournalPath))) throw new Error("recovery call journal path must be absolute");
  const expectedJournalPath = path.join(path.dirname(attemptRoot), "attempt-001-verifier-call-journal.json");
  const journalPath = await storedPathEquals({
    runtime: resumeOutput,
    stored: storedJournalPath,
    expected: expectedJournalPath,
    label: "recovery call journal",
    type: "file",
  });
  const journalFileSha256 = requireDigest(binding.sha256, "recovery call journal file digest");
  assertValue(await sha256File(journalPath), journalFileSha256, "recovery call journal file digest");
  const journal = await readJson(resumeOutput, journalPath, "recovery call journal");
  assertKeys(journal, [
    "schemaVersion", "kind", "caseId", "recoveryContract", "sourceTrialKey", "attempt", "status",
    "native", "inputSnapshot", "runs", "lifecycle", "execution", "journalRecordDigest",
  ], [], "recovery call journal");
  assertValue(journal.schemaVersion, 1, "recovery call journal schema");
  assertValue(journal.kind, CALL_JOURNAL_KIND, "recovery call journal kind");
  assertValue(journal.caseId, recoveryLock.caseId, "recovery call journal case ID");
  assertValue(journal.recoveryContract, RECOVERY_CONTRACT, "recovery call journal contract");
  assertValue(journal.sourceTrialKey, recoveryLock.sourceTrialKey, "recovery call journal source trial key");
  assertValue(journal.attempt, 1, "recovery call journal attempt");
  assertValue(journal.status, "completed", "recovery call journal status");
  const journalRecordDigest = requireDigest(journal.journalRecordDigest, "recovery call journal record digest");
  assertValue(binding.journalRecordDigest, journalRecordDigest, "recovery call journal binding record digest");
  assertValue(pythonDigest(cloneWithout(journal, "journalRecordDigest")), journalRecordDigest, "recovery call journal seal");

  const journalNative = requireObject(journal.native, "recovery call journal native binding");
  assertKeys(journalNative, ["resumeLockSha256", "nativeRetryJobArtifactDigest"], [], "recovery call journal native binding");
  assertValue(journalNative.resumeLockSha256, native.resumeLockSha256, "recovery call journal resume lock binding");
  assertValue(
    journalNative.nativeRetryJobArtifactDigest,
    native.nativeRetryJobArtifactDigest,
    "recovery call journal native retry binding",
  );

  const inputSnapshot = requireObject(journal.inputSnapshot, "recovery call journal input snapshot");
  assertKeys(inputSnapshot, [
    "agentArtifactDigest", "agentArtifactManifest", "testsArtifactDigest", "testsArtifactManifest",
  ], [], "recovery call journal input snapshot");
  const agentManifest = normalizeManifestRows(inputSnapshot.agentArtifactManifest, "call journal agent artifact manifest");
  assertPythonEqual(agentManifest, [{ path: "pi.txt", sha256: agentTrace.sha256 }], "call journal agent input manifest");
  assertValue(
    inputSnapshot.agentArtifactDigest,
    pythonDigest(agentManifest),
    "call journal agent input digest",
  );
  const testsManifest = normalizeManifestRows(inputSnapshot.testsArtifactManifest, "call journal tests artifact manifest");
  assertPythonEqual(testsManifest, task.taskTestsArtifactManifest, "call journal tests input manifest");
  assertValue(inputSnapshot.testsArtifactDigest, task.taskTestsArtifactDigest, "call journal tests input digest");
  assertValue(pythonDigest(testsManifest), task.taskTestsArtifactDigest, "call journal tests manifest digest");
  const inputSnapshotRoot = await assertNoLinkChain(
    attemptRoot,
    path.join(attemptRoot, "input-snapshot"),
    "recovery input snapshot",
    "directory",
  );
  await assertDirectChildren(inputSnapshotRoot, {
    directories: ["agent", "tests"],
  }, "recovery input snapshot");
  const agentSnapshotRoot = await assertNoLinkChain(
    inputSnapshotRoot,
    path.join(inputSnapshotRoot, "agent"),
    "recovery agent input snapshot",
    "directory",
  );
  const testsSnapshotRoot = await assertNoLinkChain(
    inputSnapshotRoot,
    path.join(inputSnapshotRoot, "tests"),
    "recovery tests input snapshot",
    "directory",
  );
  await verifyManifest(
    agentSnapshotRoot,
    agentManifest,
    inputSnapshot.agentArtifactDigest,
    "recovery agent input snapshot",
  );
  await verifyManifestDirectoryTopology(agentSnapshotRoot, agentManifest, "recovery agent input snapshot topology");
  await verifyManifest(
    testsSnapshotRoot,
    testsManifest,
    inputSnapshot.testsArtifactDigest,
    "recovery tests input snapshot",
  );
  await verifyManifestDirectoryTopology(testsSnapshotRoot, testsManifest, "recovery tests input snapshot topology");

  const journalRuns = requireArray(journal.runs, "recovery call journal runs");
  if (journalRuns.length !== 2) throw new Error("recovery call journal must contain exactly two completed calls");
  const containerNames = [];
  const times = [];
  for (const [index, rawRun] of journalRuns.entries()) {
    const runNumber = index + 1;
    const journalRun = requireObject(rawRun, `recovery call journal run ${runNumber}`);
    assertKeys(journalRun, [
      "run", "status", "containerName", "directory", "rewardPath", "rewardSha256", "diagnosticsPath",
      "diagnosticsSha256", "stdoutPath", "stdoutSha256", "exitCode", "startedAt", "finishedAt",
    ], [], `recovery call journal run ${runNumber}`);
    assertValue(journalRun.run, runNumber, `recovery call journal run ${runNumber} number`);
    assertValue(journalRun.status, "completed", `recovery call journal run ${runNumber} status`);
    assertValue(journalRun.exitCode, 0, `recovery call journal run ${runNumber} exit code`);
    const containerName = requireString(journalRun.containerName, `recovery call journal run ${runNumber} container`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) throw new Error(`recovery call journal run ${runNumber} container name is invalid`);
    containerNames.push(containerName);
    const started = requireTimestamp(journalRun.startedAt, `recovery call journal run ${runNumber} start`);
    const finished = requireTimestamp(journalRun.finishedAt, `recovery call journal run ${runNumber} finish`);
    if (finished.timestamp < started.timestamp) throw new Error(`recovery call journal run ${runNumber} finishes before it starts`);
    times.push({ started, finished });
    const lockRun = requireObject(runs[index], `recovery lock run ${runNumber}`);
    for (const field of [
      "directory", "rewardPath", "rewardSha256", "diagnosticsPath", "diagnosticsSha256", "stdoutPath",
      "stdoutSha256", "exitCode", "startedAt", "finishedAt",
    ]) {
      assertValue(journalRun[field], lockRun[field], `recovery call journal run ${runNumber} ${field}`);
    }
    const directory = path.join(attemptRoot, "verifier-runs", `run-${String(runNumber).padStart(3, "0")}`);
    for (const [field, file] of [
      ["rewardSha256", "reward.json"],
      ["diagnosticsSha256", "diagnostics.json"],
      ["stdoutSha256", "test-stdout.txt"],
    ]) {
      assertValue(
        journalRun[field],
        await sha256File(path.join(directory, file)),
        `recovery call journal run ${runNumber} ${file} digest`,
      );
    }
  }
  if (new Set(containerNames).size !== containerNames.length) throw new Error("recovery call journal container names must be unique");
  if (times[1].started.timestamp < times[0].finished.timestamp) throw new Error("recovery call journal runs overlap");
  for (const field of ["rewardSha256", "diagnosticsSha256", "stdoutSha256"]) {
    assertValue(journalRuns[0][field], journalRuns[1][field], `recovery call journal deterministic ${field}`);
  }

  const lifecycle = requireArray(journal.lifecycle, "recovery call journal lifecycle");
  const expectedLifecyclePhases = [
    "durable-before-verifier-runs",
    "input-snapshot-sealed",
    "run-001-starting",
    "run-001-completed",
    "run-002-starting",
    "verifier-runs-sealed",
  ];
  if (lifecycle.length !== expectedLifecyclePhases.length) throw new Error("recovery call journal lifecycle is incomplete");
  const lifecycleEvents = lifecycle.map((rawEvent, index) => {
    const event = requireObject(rawEvent, `recovery call journal lifecycle ${index}`);
    assertKeys(event, ["status", "phase", "at"], [], `recovery call journal lifecycle ${index}`);
    const at = requireTimestamp(event.at, `recovery call journal lifecycle ${index} time`);
    return { ...event, timestamp: at.timestamp };
  });
  assertValue(lifecycleEvents[0].status, "reserved", "recovery call journal initial lifecycle status");
  assertValue(lifecycleEvents[0].phase, "durable-before-verifier-runs", "recovery call journal initial lifecycle phase");
  assertValue(lifecycleEvents.at(-1).status, "completed", "recovery call journal terminal lifecycle status");
  assertPythonEqual(lifecycleEvents.map((event) => event.phase), expectedLifecyclePhases, "recovery call journal lifecycle phases");
  assertPythonEqual(
    lifecycleEvents.map((event) => event.status),
    ["reserved", "reserved", "running", "running", "running", "completed"],
    "recovery call journal lifecycle statuses",
  );
  assertValue(lifecycleEvents[0].at, recoveryLock.lifecycle[0].at, "recovery lock/journal durable reservation time");
  assertValue(lifecycleEvents[2].at, journalRuns[0].startedAt, "recovery call journal run 1 start lifecycle binding");
  assertValue(lifecycleEvents[3].at, journalRuns[0].finishedAt, "recovery call journal run 1 finish lifecycle binding");
  assertValue(lifecycleEvents[4].at, journalRuns[1].startedAt, "recovery call journal run 2 start lifecycle binding");
  if (lifecycleEvents[0].timestamp > times[0].started.timestamp) throw new Error("recovery call journal was not durable before verifier calls");
  if (lifecycleEvents.at(-1).timestamp < times[1].finished.timestamp) throw new Error("recovery call journal completed before verifier calls");
  for (let index = 1; index < lifecycleEvents.length; index += 1) {
    if (lifecycleEvents[index].timestamp < lifecycleEvents[index - 1].timestamp) throw new Error("recovery call journal lifecycle is not chronological");
  }

  const execution = requireObject(journal.execution, "recovery call journal execution accounting");
  assertKeys(execution, ["harborCalls", "modelCalls", "verifierCalls"], [], "recovery call journal execution accounting");
  assertValue(execution.harborCalls, 0, "recovery call journal Harbor calls");
  assertValue(execution.modelCalls, 0, "recovery call journal model calls");
  assertValue(execution.verifierCalls, 2, "recovery call journal verifier calls");
  assertPythonEqual(execution, recoveryLock.execution, "recovery lock/journal execution accounting");
  return { journalPath, journalFileSha256, journalRecordDigest };
}

async function discoverEffectiveJob(resumeOutput, expectedSourceKey) {
  const root = await assertNoLinkChain(resumeOutput, path.join(resumeOutput, "effective-jobs"), "effective jobs root", "directory");
  const entries = await fs.readdir(root, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory() || entries[0].isSymbolicLink() || entries[0].name !== expectedSourceKey) {
    throw new Error("effective jobs root does not contain only the source-bound recovery");
  }
  const sourceRoot = await assertNoLinkChain(root, path.join(root, expectedSourceKey), "effective source root", "directory");
  const children = await fs.readdir(sourceRoot, { withFileTypes: true });
  if (children.length !== 1 || children[0].name !== "effective-job" || !children[0].isDirectory() || children[0].isSymbolicLink()) {
    throw new Error("effective source root must contain only effective-job");
  }
  return assertNoLinkChain(sourceRoot, path.join(sourceRoot, "effective-job"), "effective recovery job", "directory");
}

function validateProtocol(protocol) {
  const frozen = requireObject(protocol, "generation-003 protocol");
  assertValue(frozen.schemaVersion, 2, "generation-003 protocol schema");
  assertValue(frozen.generationId, "generation-003", "generation id");
  const declaration = requireObject(frozen.effectiveEvidence?.[CONTRAST_ID], "contrast effective evidence declaration");
  assertValue(declaration.mode, "manifested-first-evaluable-retry-effective-job", "contrast evidence mode");
  assertValue(declaration.originalJobImmutable, true, "contrast source immutability");
  assertValue(declaration.selectionPolicy, SELECTION_POLICY, "contrast selection policy");
  assertValue(declaration.maximumExternalRetries, 1, "contrast retry cap");
  assertValue(declaration.requiredSelectedLineage, "retry", "contrast selected lineage");
  assertValue(declaration.requiredAttempt, 1, "contrast selected attempt");
  assertValue(declaration.requiredManifest, "resume-manifest.json", "contrast manifest name");
  return { frozen, declaration };
}

/**
 * Resolve generation-003 contrast evidence while preserving the frozen v3 resolver.
 * Completed generic retries delegate byte-for-byte to that resolver; the additive
 * branch accepts only the exact post-agent/pre-verifier EIO recovery contract.
 */
export async function resolveContrastPostAgentEffectiveEvidence({
  protocol,
  runtimeRoot,
  resumeOutputDirectory,
  originalJobDirectory,
} = {}) {
  const { frozen, declaration } = validateProtocol(protocol);
  const runtime = await assertAbsoluteNoLink(path.resolve(runtimeRoot), "generation-003 runtime", "directory");
  const declaredResume = assertInside(
    runtime,
    path.join(runtime, ...safeRelativePath(declaration.resumeOutputDirectory, "resume output declaration").split("/")),
    "contrast resume output",
  );
  if (resumeOutputDirectory !== undefined && path.resolve(resumeOutputDirectory) !== declaredResume) {
    throw new Error("resume output override differs from frozen protocol");
  }
  const resumeOutput = await assertNoLinkChain(runtime, declaredResume, "contrast resume output", "directory");
  const lockPath = path.join(resumeOutput, "resume-lock.json");
  const resumeLock = await readJson(resumeOutput, lockPath, "resume-lock.json");
  const attempts = requireArray(resumeLock.attempts, "resume attempts");
  if (attempts.length !== 1) throw new Error("post-agent recovery requires exactly retry attempt 1");
  if (attempts[0].status === "completed") {
    const native = await resolveContrastEffectiveEvidence({ protocol, runtimeRoot, resumeOutputDirectory, originalJobDirectory });
    return {
      ...native,
      selection: { ...native.selection, completionMode: "native-completed-retry" },
      provenance: {
        ...native.provenance,
        completionMode: "native-completed-retry",
        recoveryContract: null,
        recoveryLockSha256: null,
        recoveryResultSha256: null,
        callJournalSha256: null,
        callJournalRecordDigest: null,
        recoveredJobArtifactDigest: null,
        recoveryCalls: { harbor: 0, model: 0, verifier: 0 },
      },
    };
  }

  const expectedOriginal = path.join(runtime, "jobs", "q003", CONTRAST_ID, `${frozen.harbor.jobNamePrefix}-q003-${CONTRAST_ID}`);
  if (originalJobDirectory !== undefined && path.resolve(originalJobDirectory) !== path.resolve(expectedOriginal)) {
    throw new Error("original contrast job override differs from frozen protocol");
  }
  const originalJob = await assertNoLinkChain(runtime, expectedOriginal, "original contrast job", "directory");
  assertValue(resumeLock.schemaVersion, 1, "resume lock schema");
  const policyDigest = requireDigest(resumeLock.policyDigest, "resume policy digest");
  const contractDigest = requireDigest(resumeLock.contractDigest, "resume contract digest");
  const contract = requireObject(resumeLock.contract, "resume source contract");
  assertValue(pythonDigest({ source: contract, policyDigest }), contractDigest, "resume source contract digest");
  assertValue(contract.harborVersion, frozen.frozenEvaluationProfile.harborVersion, "resume Harbor version");
  assertValue(contract.rewardKey, frozen.frozenEvaluationProfile.rewardKey, "resume reward key");
  const sourceJobs = requireArray(contract.sourceJobs, "resume source jobs");
  if (sourceJobs.length !== 1) throw new Error("resume source contract must bind only contrast");
  const sourceJob = requireObject(sourceJobs[0], "contrast source job");
  assertValue(sourceJob.candidateId, CONTRAST_ID, "resume source candidate");
  await storedPathEquals({ runtime, stored: sourceJob.directory, expected: originalJob, label: "resume source job" });
  const sourceDigest = requireDigest(sourceJob.artifactDigest, "source job artifact digest");
  const sourceArtifacts = await verifyManifest(originalJob, sourceJob.artifactManifest, sourceDigest, "source contrast job");

  const sourceTrials = requireArray(resumeLock.sourceTrials, "resume source trials");
  if (sourceTrials.length !== 1) throw new Error("resume lock must bind one contrast source trial");
  const sourceTrial = requireObject(sourceTrials[0], "contrast source trial");
  const sourceTrialKey = requireDigest(sourceTrial.sourceTrialKey, "source trial key");
  assertValue(sourceTrial.candidateId, CONTRAST_ID, "source trial candidate");
  assertValue(sourceTrial.classification, "external", "source trial classification");
  assertValue(sourceTrial.failureContract, SOURCE_FAILURE_CONTRACT, "source trial failure contract");
  assertValue(sourceTrial.originalJobDigest, sourceDigest, "source trial original digest");
  assertValue(sourceTrial.artifactDigest, sourceDigest, "source trial artifact digest");
  await storedPathEquals({ runtime, stored: sourceTrial.sourceJob, expected: originalJob, label: "source trial job" });
  requireString(sourceTrial.trialId, "source trial ID");
  requireString(sourceTrial.sourceTrial, "source trial name");
  const remediationAttestationDigest = requireDigest(sourceTrial.remediationAttestationDigest, "source remediation attestation digest");

  const attempt = requireObject(attempts[0], "resume attempt 1");
  const attemptRecordDigest = requireDigest(attempt.attemptRecordDigest, "resume attempt record digest");
  assertValue(pythonDigest(cloneWithout(attempt, "attemptRecordDigest")), attemptRecordDigest, "resume attempt record seal");
  assertValue(attempt.sourceTrialKey, sourceTrialKey, "resume attempt source key");
  assertValue(attempt.attempt, 1, "resume attempt number");
  assertValue(attempt.status, "failed-execution", "resume attempt terminal status");
  assertValue(attempt.evaluable, false, "resume failed attempt evaluability");
  assertValue(attempt.reward, null, "resume failed attempt reward");
  assertValue(attempt.mode, "live", "resume attempt mode");
  assertValue(attempt.failureContract, SOURCE_FAILURE_CONTRACT, "resume attempt source failure contract");
  for (const field of ["taskChecksum", "candidateSkillDigest", "evaluationProfileDigest"]) {
    assertValue(attempt[field], sourceTrial[field], `resume attempt ${field}`);
  }
  await storedPathEquals({ runtime, stored: attempt.parentJobDirectory, expected: originalJob, label: "resume attempt parent job" });
  assertValue(attempt.parentJobArtifactDigest, sourceDigest, "resume attempt parent digest");
  assertValue(attempt.parentTrialId, sourceTrial.trialId, "resume attempt parent trial ID");
  assertValue(attempt.parentTrialName, sourceTrial.sourceTrial, "resume attempt parent trial name");
  assertValue(attempt.remediationAttestationDigest, remediationAttestationDigest, "resume attempt remediation attestation");
  const parentTrialResultSha256 = requireDigest(attempt.parentTrialResultSha256, "resume attempt parent result digest");
  if (!sourceArtifacts.rows.some((row) => row.path.endsWith("/result.json") && row.sha256 === parentTrialResultSha256)) {
    throw new Error("resume attempt parent result does not bind one source artifact");
  }
  const lifecycle = requireArray(attempt.lifecycle, "resume attempt lifecycle");
  const expectedLifecycle = [
    ["reserved", "durable-before-files"],
    ["reserved", "configured-before-harbor-call"],
    ["reserved", "harbor-call-starting"],
    ["failed-execution", undefined],
  ];
  if (lifecycle.length !== expectedLifecycle.length) throw new Error("resume attempt lifecycle must contain exactly four events");
  for (const [index, [status, phase]] of expectedLifecycle.entries()) {
    const event = requireObject(lifecycle[index], `resume lifecycle ${index}`);
    assertValue(event.status, status, `resume lifecycle ${index} status`);
    assertValue(event.phase, phase, `resume lifecycle ${index} phase`);
    requireString(event.at, `resume lifecycle ${index} time`);
  }

  const attemptRoot = await assertNoLinkChain(resumeOutput, path.join(resumeOutput, ...RECOVERY_RELATIVE.split("/")), "verifier recovery attempt root", "directory");
  await assertDirectChildren(attemptRoot, {
    directories: ["input-snapshot", "verifier-runs", "recovered-job"],
    files: ["recovery-lock.json", "recovery-result.json"],
  }, "verifier recovery attempt root");
  const recoveryLockPath = path.join(attemptRoot, "recovery-lock.json");
  const recoveryResultPath = path.join(attemptRoot, "recovery-result.json");
  const [recoveryLock, recoveryResult] = await Promise.all([
    readJson(attemptRoot, recoveryLockPath, "recovery-lock.json"),
    readJson(attemptRoot, recoveryResultPath, "recovery-result.json"),
  ]);
  assertKeys(recoveryLock, [
    "schemaVersion", "kind", "caseId", "recoveryContract", "sourceTrialKey", "attempt", "status", "native",
    "agentTrace", "task", "verifier", "execution", "runs", "callJournal", "recoveredJob", "lifecycle",
    "recoveryRecordDigest",
  ], [], "recovery lock");
  assertValue(recoveryLock.schemaVersion, 1, "recovery lock schema");
  assertValue(recoveryLock.kind, RECOVERY_LOCK_KIND, "recovery lock kind");
  requireString(recoveryLock.caseId, "recovery case ID");
  assertValue(recoveryLock.recoveryContract, RECOVERY_CONTRACT, "recovery contract");
  assertValue(recoveryLock.sourceTrialKey, sourceTrialKey, "recovery source trial key");
  assertValue(recoveryLock.attempt, 1, "recovery attempt");
  assertValue(recoveryLock.status, "completed", "recovery status");
  const recoveryRecordDigest = requireDigest(recoveryLock.recoveryRecordDigest, "recovery lock record digest");
  assertValue(pythonDigest(cloneWithout(recoveryLock, "recoveryRecordDigest")), recoveryRecordDigest, "recovery lock seal");

  const native = requireObject(recoveryLock.native, "recovery native evidence");
  assertKeys(native, [
    "resumeLockSha256", "sourceAttemptRecordDigest", "retryJobDirectory", "nativeRetryJobArtifactDigest",
    "nativeRetryJobArtifactManifest", "nativeRetryJobDirectoryManifest", "trialId", "trialName",
    "trialResultSha256", "exceptionSha256",
  ], [], "recovery native evidence");
  assertValue(native.resumeLockSha256, await sha256File(lockPath), "recovery native resume lock digest");
  assertValue(native.sourceAttemptRecordDigest, attemptRecordDigest, "recovery native attempt seal");
  const retryJob = await storedPathEquals({ runtime, base: resumeOutput, stored: native.retryJobDirectory, expected: path.resolve(hostPath(attempt.jobDirectory)), label: "native retry job" });
  const nativeRetryJobArtifactDigest = requireDigest(native.nativeRetryJobArtifactDigest, "native retry artifact digest");
  await verifyManifest(retryJob, native.nativeRetryJobArtifactManifest, nativeRetryJobArtifactDigest, "native retry job");
  const nativeTrialName = safeRelativePath(native.trialName, "native retry trial name");
  if (nativeTrialName.includes("/")) throw new Error("native retry trial name must contain one path segment");
  const nativeDirectoryManifest = [
    nativeTrialName,
    `${nativeTrialName}/agent`,
    `${nativeTrialName}/agent/setup`,
    `${nativeTrialName}/artifacts`,
    `${nativeTrialName}/artifacts/logs`,
    `${nativeTrialName}/artifacts/logs/artifacts`,
    `${nativeTrialName}/verifier`,
  ];
  await verifyDirectoryTopology(
    retryJob,
    native.nativeRetryJobDirectoryManifest,
    nativeDirectoryManifest,
    "native retry job",
    [
      `${nativeTrialName}/agent/setup`,
      `${nativeTrialName}/artifacts/logs/artifacts`,
      `${nativeTrialName}/verifier`,
    ],
  );
  const jobResult = await readHarborJson(retryJob, path.join(retryJob, "result.json"), "native retry JobResult");
  const trialDirectories = (await fs.readdir(retryJob, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (trialDirectories.length !== 1 || trialDirectories[0].isSymbolicLink()) throw new Error("native retry job must contain one trial directory");
  const retryTrialDirectory = await assertNoLinkChain(retryJob, path.join(retryJob, trialDirectories[0].name), "native retry trial", "directory");
  const trialResultPath = path.join(retryTrialDirectory, "result.json");
  const exceptionPath = path.join(retryTrialDirectory, "exception.txt");
  const trial = await readHarborJson(retryTrialDirectory, trialResultPath, "native retry TrialResult");
  assertValue(native.trialId, trial.id, "native retry trial id");
  assertValue(nativeTrialName, trial.trial_name, "native retry trial name");
  assertValue(native.trialResultSha256, await sha256File(trialResultPath), "native retry trial result digest");
  assertValue(native.exceptionSha256, await sha256File(exceptionPath), "native retry exception digest");
  const retryLock = await readHarborJson(retryJob, path.join(retryJob, "lock.json"), "native retry lock");
  assertValue(retryLock.harbor?.version, frozen.frozenEvaluationProfile.harborVersion, "native retry Harbor version");
  const lockedTrials = requireArray(retryLock.trials, "native retry locked trials");
  if (lockedTrials.length !== 1) throw new Error("native retry lock must contain one trial");
  const lockedTrial = requireObject(lockedTrials[0], "native retry locked trial");
  assertValue(lockedTrial.task?.name, "q003", "native retry locked task");
  const lockedSkills = requireArray(lockedTrial.skills, "native retry locked skills");
  if (lockedSkills.length !== 1) throw new Error("native retry lock must contain one skill");
  assertValue(lockedSkills[0].name, frozen.target.logicalName, "native retry locked skill name");
  assertValue(lockedSkills[0].digest, sourceTrial.candidateSkillDigest, "native retry locked skill digest");
  const expectedAgent = frozen.frozenEvaluationProfile.agent;
  for (const [agent, label] of [
    [lockedTrial.agent, "native retry locked agent"],
    [trial.config?.agent, "native retry trial agent"],
  ]) {
    const value = requireObject(agent, label);
    assertValue(value.name, expectedAgent.name, `${label} name`);
    assertValue(value.model_name, expectedAgent.model, `${label} model`);
    assertValue(value.n_concurrent ?? 1, 1, `${label} concurrency`);
    assertValue(value.kwargs?.version, expectedAgent.version, `${label} version`);
    assertValue(value.kwargs?.thinking, expectedAgent.thinking, `${label} thinking`);
    assertPythonEqual(value.skills, [lockedSkills[0].source], `${label} skill source`);
  }
  const observedEnvironment = clonePythonJson(requireObject(trial.config?.environment, "native retry trial environment"));
  for (const field of ["import_path", "override_cpus", "override_memory_mb", "override_storage_mb", "override_gpus", "override_tpu"]) {
    if (observedEnvironment[field] === null) delete observedEnvironment[field];
  }
  assertPythonEqual(observedEnvironment, lockedTrial.environment, "native retry trial/lock environment");
  const observedVerifier = clonePythonJson(requireObject(trial.config?.verifier, "native retry trial verifier"));
  for (const field of ["override_timeout_sec", "max_timeout_sec"]) if (observedVerifier[field] === null) delete observedVerifier[field];
  assertPythonEqual(observedVerifier, lockedTrial.verifier, "native retry trial/lock verifier");
  assertValue(trial.agent_info?.name, expectedAgent.name, "native retry observed agent");
  assertValue(trial.agent_info?.version, expectedAgent.version, "native retry observed agent version");
  const [expectedProvider, ...expectedModelParts] = expectedAgent.model.split("/");
  assertValue(trial.agent_info?.model_info?.provider, expectedProvider, "native retry observed model provider");
  assertValue(trial.agent_info?.model_info?.name, expectedModelParts.join("/"), "native retry observed model name");

  const agentTrace = requireObject(recoveryLock.agentTrace, "recovery agent trace");
  assertKeys(agentTrace, ["path", "sha256", "size", "parsedEvents", "terminal", "terminalOutputSha256", "tokens"], [], "recovery agent trace");
  const tracePath = await storedPathEquals({ runtime: retryJob, base: retryTrialDirectory, stored: agentTrace.path, expected: path.join(retryTrialDirectory, "agent", "pi.txt"), label: "native retry agent trace", type: "file" });
  assertValue(agentTrace.sha256, await sha256File(tracePath), "native agent trace digest");
  assertValue(agentTrace.size, (await fs.stat(tracePath)).size, "native agent trace size");
  const trace = parseTerminalTrace(await fs.readFile(tracePath, "utf8"), requireNumber(agentTrace.parsedEvents, "trace parsed events", { integer: true, minimum: 1 }));
  validateNativeFailure(jobResult, trial, await fs.readFile(exceptionPath, "utf8"), attempt, trace, agentTrace);

  const task = requireObject(recoveryLock.task, "recovery task evidence");
  assertKeys(task, ["checksum", "treeSha256", "packagerDigest", "taskTestsArtifactDigest", "taskTestsArtifactManifest"], [], "recovery task evidence");
  assertValue(task.checksum, attempt.taskChecksum, "recovery task checksum");
  assertValue(task.treeSha256, frozen.preparationTask.expectedTreeSha256, "recovery task frozen tree digest");
  assertValue(requireDigest(task.packagerDigest, "recovery task packager digest"), requireDigest(lockedTrial.task?.digest, "native retry locked task digest"), "recovery task packager binding");
  const originalConfig = await readHarborJson(originalJob, path.join(originalJob, "config.json"), "source contrast config");
  const datasets = requireArray(originalConfig.datasets, "source contrast datasets");
  if (datasets.length !== 1) throw new Error("source contrast config must bind one dataset");
  const expectedTaskRoot = path.resolve(hostPath(requireString(datasets[0].path, "source contrast dataset path")), "q003");
  assertValue(path.resolve(hostPath(trial.task_id?.path)), expectedTaskRoot, "native retry task path");
  assertValue(path.resolve(hostPath(trial.config?.task?.path)), expectedTaskRoot, "native retry trial config task path");
  if (lockedTrial.task?.path !== undefined) {
    assertValue(path.resolve(hostPath(lockedTrial.task.path)), expectedTaskRoot, "native retry locked task path");
  }
  const taskRoot = await assertAbsoluteNoLink(expectedTaskRoot, "q003 task root", "directory");
  assertValue((await treeDigest(taskRoot)).sha256, frozen.preparationTask.expectedTreeSha256, "q003 task tree digest");
  const testsRoot = await assertNoLinkChain(taskRoot, path.join(taskRoot, "tests"), "q003 tests root", "directory");
  await verifyManifest(testsRoot, task.taskTestsArtifactManifest, task.taskTestsArtifactDigest, "q003 task tests");

  const verifier = requireObject(recoveryLock.verifier, "recovery verifier execution");
  assertKeys(verifier, ["image", "imageId", "command", "network", "authMounted", "knowledgeMounted"], [], "recovery verifier execution");
  assertValue(verifier.image, frozen.harbor.containerPreflight.image, "recovery verifier image");
  assertValue(verifier.imageId, frozen.harbor.containerPreflight.imageId, "recovery verifier image ID");
  const command = requireArray(verifier.command, "recovery verifier command").map((item, index) => requireString(item, `recovery verifier command ${index}`));
  assertPythonEqual(command, ["/tests/test.sh"], "recovery verifier command");
  assertValue(verifier.network, "none", "recovery verifier network");
  assertValue(verifier.authMounted, false, "recovery verifier auth mount");
  assertValue(verifier.knowledgeMounted, false, "recovery verifier knowledge mount");
  const execution = requireObject(recoveryLock.execution, "recovery execution accounting");
  assertKeys(execution, ["modelCalls", "harborCalls", "verifierCalls"], [], "recovery execution accounting");
  assertValue(execution.modelCalls, 0, "recovery model calls");
  assertValue(execution.harborCalls, 0, "recovery Harbor calls");
  assertValue(execution.verifierCalls, 2, "recovery verifier calls");

  const verifierRunsRoot = await assertNoLinkChain(
    attemptRoot,
    path.join(attemptRoot, "verifier-runs"),
    "recovery verifier runs",
    "directory",
  );
  await assertDirectChildren(verifierRunsRoot, {
    directories: ["run-001", "run-002"],
  }, "recovery verifier runs");
  const runs = requireArray(recoveryLock.runs, "recovery verifier runs");
  if (runs.length !== 2) throw new Error("recovery requires exactly two deterministic verifier runs");
  const observedRuns = [
    await verifyRun({ attemptRoot, run: requireObject(runs[0], "recovery run 1"), index: 1, protocol: frozen }),
    await verifyRun({ attemptRoot, run: requireObject(runs[1], "recovery run 2"), index: 2, protocol: frozen }),
  ];
  assertPythonEqual(observedRuns[0].reward, observedRuns[1].reward, "deterministic verifier rewards");
  assertPythonEqual(observedRuns[0].diagnostics, observedRuns[1].diagnostics, "deterministic verifier diagnostics");
  assertValue(runs[0].stdoutSha256, runs[1].stdoutSha256, "deterministic verifier stdout");
  const callJournal = await verifyCallJournal({
    resumeOutput,
    attemptRoot,
    binding: recoveryLock.callJournal,
    recoveryLock,
    native,
    agentTrace,
    task,
    runs,
  });

  const recoveredBinding = requireObject(recoveryLock.recoveredJob, "recovery lock recovered job");
  assertKeys(recoveredBinding, ["directory", "artifactDigest", "artifactManifest", "directoryManifest"], [], "recovery lock recovered job");
  const recoveredJobExpected = path.join(attemptRoot, "recovered-job");
  const recoveredJob = await storedPathEquals({
    runtime: attemptRoot,
    base: attemptRoot,
    stored: recoveredBinding.directory,
    expected: recoveredJobExpected,
    label: "recovered Harbor job",
  });
  const recoveredJobArtifactDigest = requireDigest(recoveredBinding.artifactDigest, "recovered Harbor job artifact digest");
  await verifyManifest(
    recoveredJob,
    recoveredBinding.artifactManifest,
    recoveredJobArtifactDigest,
    "recovered Harbor job",
  );
  const recoveredDirectoryManifest = [
    nativeTrialName,
    `${nativeTrialName}/agent`,
    `${nativeTrialName}/artifacts`,
    `${nativeTrialName}/artifacts/logs`,
    `${nativeTrialName}/artifacts/logs/artifacts`,
    `${nativeTrialName}/verifier`,
  ];
  await verifyDirectoryTopology(
    recoveredJob,
    recoveredBinding.directoryManifest,
    recoveredDirectoryManifest,
    "recovered Harbor job",
    [`${nativeTrialName}/artifacts/logs/artifacts`],
  );
  const recoveryLifecycle = requireArray(recoveryLock.lifecycle, "recovery lifecycle");
  const expectedRecoveryLifecycle = [
    ["reserved", "durable-before-verifier-runs"],
    ["running", "verifier-runs-starting"],
    ["completed", "recovered-job-sealed"],
  ];
  if (recoveryLifecycle.length !== expectedRecoveryLifecycle.length) throw new Error("recovery lifecycle must contain exactly three events");
  for (const [index, [status, phase]] of expectedRecoveryLifecycle.entries()) {
    const event = requireObject(recoveryLifecycle[index], `recovery lifecycle ${index}`);
    assertValue(event.status, status, `recovery lifecycle ${index} status`);
    assertValue(event.phase, phase, `recovery lifecycle ${index} phase`);
    requireString(event.at, `recovery lifecycle ${index} time`);
  }

  assertKeys(recoveryResult, [
    "schemaVersion", "kind", "caseId", "recoveryContract", "sourceTrialKey", "attempt", "status", "classification",
    "completionMode", "selectionPolicy", "rewardKey", "reward", "rewards", "recoveryRecordDigest",
    "recoveredJobDirectory", "recoveredJobArtifactDigest", "recoveredTrialResultSha256", "recoveredJobResultSha256",
    "effectiveJobDirectory", "effectiveJobDigest", "resumeManifestSha256", "modelCalls", "harborCalls",
    "verifierCalls", "recoveryResultDigest",
  ], [], "recovery result");
  assertValue(recoveryResult.schemaVersion, 1, "recovery result schema");
  assertValue(recoveryResult.kind, RECOVERY_RESULT_KIND, "recovery result kind");
  assertValue(recoveryResult.caseId, recoveryLock.caseId, "recovery result case ID");
  assertValue(recoveryResult.recoveryContract, RECOVERY_CONTRACT, "recovery result contract");
  assertValue(recoveryResult.sourceTrialKey, sourceTrialKey, "recovery result source key");
  assertValue(recoveryResult.attempt, 1, "recovery result attempt");
  assertValue(recoveryResult.status, "evaluable", "recovery result status");
  assertValue(recoveryResult.classification, "semantic", "recovery result classification");
  assertValue(recoveryResult.completionMode, COMPLETION_MODE, "recovery result completion mode");
  assertValue(recoveryResult.selectionPolicy, SELECTION_POLICY, "recovery result selection policy");
  assertValue(recoveryResult.rewardKey, frozen.frozenEvaluationProfile.rewardKey, "recovery result reward key");
  assertPythonEqual(recoveryResult.rewards, observedRuns[0].reward, "recovery result rewards");
  assertValue(recoveryResult.reward, observedRuns[0].reward[recoveryResult.rewardKey], "recovery result primary reward");
  assertValue(recoveryResult.modelCalls, 0, "recovery result model calls");
  assertValue(recoveryResult.harborCalls, 0, "recovery result Harbor calls");
  assertValue(recoveryResult.verifierCalls, 2, "recovery result verifier calls");
  assertValue(recoveryResult.recoveryRecordDigest, recoveryRecordDigest, "recovery result lock binding");
  const recoveryResultDigest = requireDigest(recoveryResult.recoveryResultDigest, "recovery result record digest");
  assertValue(pythonDigest(cloneWithout(recoveryResult, "recoveryResultDigest")), recoveryResultDigest, "recovery result seal");

  await storedPathEquals({ runtime: attemptRoot, base: attemptRoot, stored: recoveryResult.recoveredJobDirectory, expected: recoveredJobExpected, label: "recovery result recovered Harbor job" });
  assertValue(recoveryResult.recoveredJobArtifactDigest, recoveredJobArtifactDigest, "recovery result recovered job digest");
  assertValue(recoveryResult.recoveredJobResultSha256, await sha256File(path.join(recoveredJob, "result.json")), "recovered JobResult digest");
  const recoveredTrialDirectories = (await fs.readdir(recoveredJob, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (recoveredTrialDirectories.length !== 1 || recoveredTrialDirectories[0].isSymbolicLink()) throw new Error("recovered job must contain one trial directory");
  assertValue(
    recoveryResult.recoveredTrialResultSha256,
    await sha256File(path.join(recoveredJob, recoveredTrialDirectories[0].name, "result.json")),
    "recovered TrialResult digest",
  );

  const expectedSourceKey = pythonDigest({ directory: sourceJob.directory, artifactDigest: sourceDigest }).slice("sha256:".length);
  const effectiveJob = await discoverEffectiveJob(resumeOutput, expectedSourceKey);
  await storedPathEquals({ runtime, base: resumeOutput, stored: recoveryResult.effectiveJobDirectory, expected: effectiveJob, label: "recovery result effective job" });
  const manifestPath = path.join(effectiveJob, declaration.requiredManifest);
  const manifest = await readJson(effectiveJob, manifestPath, "effective resume-manifest.json");
  assertValue(manifest.schemaVersion, 2, "effective resume manifest schema");
  assertValue(manifest.completionMode, COMPLETION_MODE, "effective resume completion mode");
  assertValue(manifest.recoveryContract, RECOVERY_CONTRACT, "effective resume recovery contract");
  assertValue(manifest.selectionPolicy, SELECTION_POLICY, "effective resume selection policy");
  assertValue(manifest.sourceJobArtifactDigest, sourceDigest, "effective resume source digest");
  await storedPathEquals({ runtime, stored: manifest.sourceJob, expected: originalJob, label: "effective resume source job" });
  assertValue(manifest.recoveryRecordDigest, recoveryRecordDigest, "effective resume recovery lock seal");
  const recoveryBinding = requireObject(manifest.recovery, "effective resume recovery binding");
  assertKeys(recoveryBinding, [
    "completionMode", "recoveryContract", "recoveryRecordDigest", "nativeRetryJobArtifactDigest",
    "recoveredJobArtifactDigest",
  ], [], "effective resume recovery binding");
  assertValue(recoveryBinding.completionMode, COMPLETION_MODE, "effective recovery completion mode");
  assertValue(recoveryBinding.recoveryContract, RECOVERY_CONTRACT, "effective recovery contract binding");
  assertValue(recoveryBinding.recoveryRecordDigest, recoveryRecordDigest, "effective recovery lock binding");
  assertValue(recoveryBinding.nativeRetryJobArtifactDigest, nativeRetryJobArtifactDigest, "effective native retry binding");
  assertValue(recoveryBinding.recoveredJobArtifactDigest, recoveryResult.recoveredJobArtifactDigest, "effective recovered job binding");
  const lineage = requireArray(manifest.lineage, "effective resume lineage");
  if (lineage.length !== 1) throw new Error("effective resume manifest must bind one lineage row");
  const lineageRow = requireObject(lineage[0], "effective resume lineage row");
  assertValue(lineageRow.sourceTrialKey, sourceTrialKey, "effective lineage source key");
  const selected = requireObject(lineageRow.selected, "effective selected lineage");
  assertValue(selected.lineage, "retry", "effective selected lineage");
  assertValue(selected.attempt, 1, "effective selected attempt");
  assertValue(selected.completionMode, COMPLETION_MODE, "effective selected completion mode");
  assertValue(selected.nativeRetryJobArtifactDigest, nativeRetryJobArtifactDigest, "effective selected native retry digest");
  assertValue(selected.recoveredJobArtifactDigest, recoveryResult.recoveredJobArtifactDigest, "effective selected recovered job digest");
  assertValue(selected.recoveryRecordDigest, recoveryRecordDigest, "effective selected recovery lock seal");
  const effectiveFiles = normalizeManifestRows(manifest.files, "effective resume file manifest");
  const effectiveJobDigest = requireDigest(manifest.effectiveJobDigest, "effective job digest");
  assertValue(pythonDigest(effectiveFiles), effectiveJobDigest, "effective job aggregate digest");
  await verifyManifest(effectiveJob, effectiveFiles, effectiveJobDigest, "effective job", { omit: new Set([declaration.requiredManifest]) });
  assertValue(recoveryResult.effectiveJobDigest, effectiveJobDigest, "recovery result effective digest");
  assertValue(recoveryResult.resumeManifestSha256, await sha256File(manifestPath), "recovery result resume manifest digest");
  for (const name of ["config.json", "lock.json"]) {
    const [sourceBytes, effectiveBytes] = await Promise.all([
      fs.readFile(path.join(originalJob, name)),
      fs.readFile(path.join(effectiveJob, name)),
    ]);
    if (!sourceBytes.equals(effectiveBytes)) throw new Error(`effective ${name} is not byte-identical to original contrast`);
  }

  return {
    candidateId: CONTRAST_ID,
    mode: declaration.mode,
    jobDirectory: effectiveJob,
    originalJobDirectory: originalJob,
    selection: {
      policy: SELECTION_POLICY,
      lineage: "retry",
      attempt: 1,
      completionMode: COMPLETION_MODE,
    },
    provenance: {
      completionMode: COMPLETION_MODE,
      resumeLockSha256: await sha256File(lockPath),
      mergedResultSha256: null,
      recoveryLockSha256: await sha256File(recoveryLockPath),
      recoveryResultSha256: await sha256File(recoveryResultPath),
      callJournalSha256: callJournal.journalFileSha256,
      callJournalRecordDigest: callJournal.journalRecordDigest,
      resumeManifestSha256: await sha256File(manifestPath),
      policyDigest,
      contractDigest,
      sourceTrialKey,
      sourceJobArtifactDigest: sourceDigest,
      nativeRetryJobArtifactDigest,
      recoveredJobArtifactDigest: recoveryResult.recoveredJobArtifactDigest,
      attemptRecordDigest,
      recoveryRecordDigest,
      recoveryResultDigest,
      effectiveJobDigest,
      failureContract: SOURCE_FAILURE_CONTRACT,
      recoveryContract: RECOVERY_CONTRACT,
      remediationAttestationDigest: requireDigest(sourceTrial.remediationAttestationDigest, "source remediation attestation digest"),
      recoveryCalls: { harbor: 0, model: 0, verifier: 2 },
    },
  };
}

export const POST_AGENT_RECOVERY_CONTRACT = RECOVERY_CONTRACT;
export const POST_AGENT_COMPLETION_MODE = COMPLETION_MODE;
export const POST_AGENT_HARBOR_JSON_BOUNDARY = "native-manifest-bound-ordinary-json+python-codepoint-order/recovery-python-score-json-v4";
