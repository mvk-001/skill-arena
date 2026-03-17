#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const DEFAULT_BENCHMARK_ID = "example-compare";
const DEFAULT_BENCHMARK_DESCRIPTION = "Short human-readable description.";
const DEFAULT_WORKSPACE_PATH = "fixtures/example/base";
const DEFAULT_SHARED_RUBRIC = "Score 1.0 only if the answer satisfies the benchmark goal.";
const DEFAULT_VARIANT_LABEL = "codex mini";
const DEFAULT_MAX_CONCURRENCY = 1;
const ASSERTION_PACKS = {
  json: [{ type: "is-json" }],
  markdown: [{ type: "regex", value: "(?m)^(#|[-*] )" }],
  "non-empty": [
    {
      type: "llm-rubric",
      provider: "skill-arena:judge:codex",
      value: "Score 1.0 only if output is non-empty.",
    },
  ],
};
const SUPPORTED_ASSERTION_TYPES = [
  "equals",
  "contains",
  "icontains",
  "is-json",
  "regex",
  "javascript",
  "file-contains",
  "llm-rubric",
];
const KNOWN_FLAGS = new Set([
  "--help",
  "-h",
  "--stdout",
  "--validate",
  "--out",
  "--output",
  "--benchmark-id",
  "--description",
  "--tag",
  "--workspace-path",
  "--initialize-git",
  "--requests",
  "--timeout-ms",
  "--max-concurrency",
  "--no-cache",
  "--tracing",
  "--skill-source-type",
  "--skill-source-path",
  "--skill-source-repo",
  "--skill-source-ref",
  "--skill-source-subpath",
  "--skill-source-skill-path",
  "--skill-source-skill-id",
  "--skill-source-install-strategy",
  "--skill-id",
  "--variant-id",
  "--variant-description",
  "--variant-adapter",
  "--variant-model",
  "--variant-execution-method",
  "--variant-command-path",
  "--variant-sandbox-mode",
  "--variant-approval-policy",
  "--variant-web-search",
  "--variant-network",
  "--variant-reasoning-effort",
  "--variant-label",
  "--shared-rubric",
  "--shared-assertion",
  "--prompt",
  "--prompt-json",
]);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const config = parseArgs(args);
validateConfig(config);

const yaml = buildCompareYaml(config);
const shouldWriteStdout = config.stdout;
if (shouldWriteStdout) {
  process.stdout.write(yaml + "\n");
  process.exit(0);
}

const outputPath = path.resolve(process.cwd(), config.outputPath);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml + "\n", "utf8");

if (config.validate) {
  const validatorPath = path.resolve(
    process.cwd(),
    "skills/skill-arena-compare/scripts/validate-compare-output.js",
  );
  const result = spawnSync(process.execPath, [validatorPath, outputPath], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Wrote compare template to ${outputPath}`);
process.exit(0);

function parseArgs(rawArgs) {
  const cfg = {
    outputPath: "deliverables/compare.yaml",
    benchmarkId: DEFAULT_BENCHMARK_ID,
    description: DEFAULT_BENCHMARK_DESCRIPTION,
    tags: ["compare"],
    workspacePath: DEFAULT_WORKSPACE_PATH,
    initializeGit: true,
    requests: 10,
    timeoutMs: 180000,
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    tracing: false,
    noCache: true,
    sharedRubric: DEFAULT_SHARED_RUBRIC,
    sharedAssertions: [],
    prompts: [],
    skillSourceType: "system-installed",
    skillSourcePath: "fixtures/example/skill",
    skillSourceRepo: null,
    skillSourceRef: "main",
    skillSourceSubpath: ".",
    skillSourceSkillPath: "skills/example-skill",
    skillSourceSkillId: "example-skill",
    skillSourceInstallStrategy: null,
    skillId: "example-skill",
    variantId: "codex-mini",
    variantDescription: "Codex mini comparison variant.",
    variantAdapter: "codex",
    variantModel: "gpt-5.1-codex-mini",
    variantExecutionMethod: "command",
    variantCommandPath: "codex",
    variantSandboxMode: "workspace-write",
    variantApprovalPolicy: "never",
    variantWebSearchEnabled: false,
    variantNetworkAccessEnabled: false,
    variantReasoningEffort: "low",
    variantLabel: DEFAULT_VARIANT_LABEL,
    stdout: false,
    validate: false,
  };

  const unknownArgs = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const { name, value } = splitArg(arg);
    if (!name) {
      unknownArgs.push(arg);
      continue;
    }

    if (!KNOWN_FLAGS.has(name) && name !== "--prompt" && name !== "--prompt-json") {
      unknownArgs.push(arg);
      continue;
    }

    switch (name) {
      case "--stdout":
        cfg.stdout = true;
        break;
      case "--validate":
        cfg.validate = true;
        break;
      case "--out":
      case "--output":
        cfg.outputPath = requireValue(name, value, rawArgs, i++);
        break;
      case "--benchmark-id":
        cfg.benchmarkId = requireValue(name, value, rawArgs, i++);
        break;
      case "--description":
        cfg.description = requireValue(name, value, rawArgs, i++);
        break;
      case "--tag": {
        const tag = requireValue(name, value, rawArgs, i++);
        cfg.tags.push(tag);
        break;
      }
      case "--workspace-path":
        cfg.workspacePath = requireValue(name, value, rawArgs, i++);
        break;
      case "--initialize-git":
        cfg.initializeGit = parseBoolean(requireValue(name, value, rawArgs, i++));
        break;
      case "--requests":
        cfg.requests = parseInt(requireValue(name, value, rawArgs, i++), 10);
        break;
      case "--timeout-ms":
        cfg.timeoutMs = parseInt(requireValue(name, value, rawArgs, i++), 10);
        break;
      case "--max-concurrency":
        cfg.maxConcurrency = parseInt(requireValue(name, value, rawArgs, i++), 10);
        break;
      case "--no-cache":
        cfg.noCache = parseBoolean(requireValue(name, value, rawArgs, i++));
        break;
      case "--tracing":
        cfg.tracing = parseBoolean(requireValue(name, value, rawArgs, i++));
        break;
      case "--skill-source-type":
        cfg.skillSourceType = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-path":
        cfg.skillSourcePath = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-repo":
        cfg.skillSourceRepo = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-ref":
        cfg.skillSourceRef = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-subpath":
        cfg.skillSourceSubpath = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-skill-path":
        cfg.skillSourceSkillPath = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-skill-id":
        cfg.skillSourceSkillId = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-source-install-strategy":
        cfg.skillSourceInstallStrategy = requireValue(name, value, rawArgs, i++);
        break;
      case "--skill-id":
        cfg.skillId = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-id":
        cfg.variantId = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-description":
        cfg.variantDescription = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-adapter":
        cfg.variantAdapter = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-model":
        cfg.variantModel = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-execution-method":
        cfg.variantExecutionMethod = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-command-path":
        cfg.variantCommandPath = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-sandbox-mode":
        cfg.variantSandboxMode = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-approval-policy":
        cfg.variantApprovalPolicy = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-web-search":
        cfg.variantWebSearchEnabled = parseBoolean(
          requireValue(name, value, rawArgs, i++),
        );
        break;
      case "--variant-network":
        cfg.variantNetworkAccessEnabled = parseBoolean(
          requireValue(name, value, rawArgs, i++),
        );
        break;
      case "--variant-reasoning-effort":
        cfg.variantReasoningEffort = requireValue(name, value, rawArgs, i++);
        break;
      case "--variant-label":
        cfg.variantLabel = requireValue(name, value, rawArgs, i++);
        break;
      case "--shared-rubric":
        cfg.sharedRubric = requireValue(name, value, rawArgs, i++);
        break;
      case "--shared-assertion":
        cfg.sharedAssertions.push(
          ...parseAssertionToken(requireValue(name, value, rawArgs, i++)),
        );
        break;
      case "--prompt":
        cfg.prompts.push(parsePromptSpec(requireValue(name, value, rawArgs, i++), cfg.prompts.length));
        break;
      case "--prompt-json":
        cfg.prompts.push(parsePromptJson(requireValue(name, value, rawArgs, i++)));
        break;
      default: {
        if (!name.startsWith("-")) {
          unknownArgs.push(arg);
        }
        break;
      }
    }
  }

  if (unknownArgs.length > 0) {
    console.error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
    printHelp();
    process.exit(1);
  }

  cfg.tags = [...new Set(cfg.tags.filter((tag) => tag))];
  return cfg;
}

function splitArg(arg) {
  if (!arg.startsWith("--") && !arg.startsWith("-")) {
    return { name: null, value: null };
  }

  const eqIndex = arg.indexOf("=");
  if (eqIndex === -1) {
    return { name: arg, value: null };
  }

  return {
    name: arg.slice(0, eqIndex),
    value: arg.slice(eqIndex + 1),
  };
}

function requireValue(name, inlineValue, rawArgs, nextIndex) {
  if (inlineValue !== null) return inlineValue;
  const next = rawArgs[nextIndex + 1];
  if (!next || next.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    printHelp();
    process.exit(1);
  }
  rawArgs[nextIndex] = next;
  return next;
}

function parseBoolean(value) {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  console.error(`Invalid boolean: ${value}`);
  printHelp();
  process.exit(1);
}

function parsePromptSpec(spec, promptIndex) {
  if (spec.includes("=")) {
    const fields = parsePromptKeyValues(spec);
    const prompt = fields.prompt ?? fields.text;
    if (!prompt) {
      console.error(`Prompt spec missing prompt text: ${spec}`);
      printHelp();
      process.exit(1);
    }
    const id = fields.id ?? `prompt-${promptIndex + 1}`;
    const assertions = parseAssertionList(fields.assertions ?? fields.evaluation ?? fields.format);
    return {
      id,
      prompt,
      assertions,
      comment: assertions.length === 0 ? true : false,
    };
  }

  if (spec.includes("|")) {
    const pieces = spec.split("|").map((entry) => entry.trim());
    if (pieces.length === 2) {
      const assertionOrId = pieces[0];
      const firstPartAssertions = parseAssertionList(assertionOrId);
      return {
        id: `prompt-${promptIndex + 1}`,
        prompt: pieces[1],
        assertions: firstPartAssertions,
        comment: firstPartAssertions.length === 0,
      };
    }
    if (pieces.length >= 3) {
      const first = pieces[0];
      const second = pieces[1];

      if (isAssertionToken(first)) {
        const remainingPrompt = pieces.slice(1).join("|");
        return {
          id: `prompt-${promptIndex + 1}`,
          prompt: remainingPrompt,
          assertions: parseAssertionList(first),
          comment: parseAssertionList(first).length === 0,
        };
      }

      if (isAssertionToken(second)) {
        return {
          id: first,
          prompt: pieces.slice(2).join("|"),
          assertions: parseAssertionList(second),
          comment: parseAssertionList(second).length === 0,
        };
      }

      return {
        id: first,
        prompt: pieces.slice(1).join("|"),
        assertions: [],
        comment: true,
      };
    }
  }

  return {
    id: `prompt-${promptIndex + 1}`,
    prompt: spec,
    assertions: [],
    comment: true,
  };
}

function parsePromptKeyValues(raw) {
  const fields = {};
  raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) {
        return;
      }
      const key = entry.slice(0, eqIdx).trim();
      const value = entry.slice(eqIdx + 1).trim();
      fields[key] = value;
    });

  if (fields.id && !fields.id.trim()) {
    delete fields.id;
  }
  return fields;
}

function parsePromptJson(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`Invalid JSON for --prompt-json: ${raw}`);
    process.exit(1);
  }

  if (!parsed.prompt || typeof parsed.prompt !== "string") {
    console.error("--prompt-json requires a prompt field");
    process.exit(1);
  }

  return {
    id: parsed.id ?? `prompt-${Date.now()}`,
    prompt: parsed.prompt,
    assertions: normalizeAssertionObjects(parsed.assertions ?? []),
    comment: (parsed.assertions ?? []).length === 0,
  };
}

function parseAssertionList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap(parseAssertionToken);
}

function isAssertionToken(token) {
  if (ASSERTION_PACKS[token]) return true;
  const index = token.indexOf(":");
  if (index === -1) return false;
  const type = token.slice(0, index);
  return SUPPORTED_ASSERTION_TYPES.includes(type);
}

function parseAssertionToken(token) {
  if (ASSERTION_PACKS[token]) {
    return ASSERTION_PACKS[token].map((assertion) => ({ ...assertion }));
  }

  const firstColon = token.indexOf(":");
  if (firstColon === -1) {
    console.error(`Unknown assertion token: ${token}`);
    printHelp();
    process.exit(1);
  }

  const type = token.slice(0, firstColon);
  const value = token.slice(firstColon + 1);
  if (!SUPPORTED_ASSERTION_TYPES.includes(type)) {
    console.error(`Unsupported assertion type: ${type}`);
    printHelp();
    process.exit(1);
  }
  if (!value.trim()) {
    console.error(`Missing assertion value for ${type}`);
    printHelp();
    process.exit(1);
  }

  if (type === "llm-rubric") {
    return [
      {
        type,
        provider: "skill-arena:judge:codex",
        value,
      },
    ];
  }

  return [{ type, value }];
}

function normalizeAssertionObjects(input) {
  if (!Array.isArray(input)) {
    console.error("--prompt-json requires assertions to be an array");
    process.exit(1);
  }

  return input.map((entry, idx) => {
    if (!entry || typeof entry !== "object" || typeof entry.type !== "string") {
      console.error(`Invalid prompt assertion at index ${idx}`);
      process.exit(1);
    }
    if (!SUPPORTED_ASSERTION_TYPES.includes(entry.type)) {
      console.error(`Unsupported assertion type in --prompt-json: ${entry.type}`);
      process.exit(1);
    }
    if (!entry.provider && entry.type === "llm-rubric") {
      return {
        type: "llm-rubric",
        provider: "skill-arena:judge:codex",
        value: entry.value ?? "",
      };
    }
    return { ...entry };
  });
}

function validateConfig(cfg) {
  if (cfg.prompts.length === 0) {
    console.error("At least one --prompt or --prompt-json argument is required.");
    printHelp();
    process.exit(1);
  }

  if (cfg.skillSourceType === "system-installed" && cfg.skillSourceInstallStrategy && cfg.skillSourceInstallStrategy !== "system-installed") {
    console.error("--skill-source-type system-installed requires --skill-source-install-strategy system-installed");
    process.exit(1);
  }

  if (cfg.skillSourceType === "local-path" && !cfg.skillSourcePath) {
    console.error("--skill-source-path is required when --skill-source-type local-path");
    process.exit(1);
  }

  if (cfg.skillSourceType === "git" && !cfg.skillSourceRepo) {
    console.error("--skill-source-repo is required when --skill-source-type git");
    process.exit(1);
  }

  for (const num of [
    cfg.requests,
    cfg.timeoutMs,
    cfg.maxConcurrency,
  ]) {
    if (!Number.isFinite(num) || num <= 0) {
      console.error("Numeric fields requests, timeout-ms, and max-concurrency must be positive integers.");
      printHelp();
      process.exit(1);
    }
  }
}

function buildCompareYaml(cfg) {
  const tagLines = cfg.tags.length > 0 ? cfg.tags.map((tag) => `    - ${tag}`).join("\n") : "    - compare";
  const sharedAssertions = buildSharedAssertions(cfg);
  const promptLines = cfg.prompts.map((prompt) => buildPromptYaml(prompt)).join("\n");
  const skillBlock = buildSkillBlock(cfg);
  return `schemaVersion: 1
# Fill this file with your benchmark-specific details:
# - Keep IDs as short slugs.
# - Replace all placeholder text before first run.
benchmark:
  id: ${quote(cfg.benchmarkId)}
  description: ${quote(cfg.description)}
  tags:
${tagLines}
task:
  prompts:
${promptLines}
workspace:
  sources:
    - type: local-path
      # Replace with your base fixture or local path.
      path: ${quote(cfg.workspacePath)}
      target: /
  setup:
    initializeGit: ${cfg.initializeGit}
evaluation:
${sharedAssertions}
  requests: ${cfg.requests}
  timeoutMs: ${cfg.timeoutMs}
  tracing: ${cfg.tracing}
  maxConcurrency: ${cfg.maxConcurrency}
  noCache: ${cfg.noCache}
comparison:
  skillModes:
    - id: no-skill
      description: Baseline without the skill.
      skillMode: disabled
    - id: skill
      description: Skill-enabled run.
      skillMode: enabled
${skillBlock}
  variants:
    - id: ${cfg.variantId}
      description: ${quote(cfg.variantDescription)}
      agent:
        adapter: ${cfg.variantAdapter}
        model: ${cfg.variantModel}
        # Keep these keys as in V1.
        executionMethod: ${cfg.variantExecutionMethod}
        commandPath: ${cfg.variantCommandPath}
        sandboxMode: ${cfg.variantSandboxMode}
        approvalPolicy: ${cfg.variantApprovalPolicy}
        webSearchEnabled: ${cfg.variantWebSearchEnabled}
        networkAccessEnabled: ${cfg.variantNetworkAccessEnabled}
        reasoningEffort: ${cfg.variantReasoningEffort}
        additionalDirectories: []
        cliEnv: {}
        config: {}
      output:
        labels:
          variantDisplayName: ${cfg.variantLabel}
`;
}

function buildSharedAssertions(cfg) {
  const assertions = [...cfg.sharedAssertions];
  if (!assertions.length) {
    assertions.push({
      type: "llm-rubric",
      provider: "skill-arena:judge:codex",
      value: cfg.sharedRubric,
    });
  }

  return `  assertions:\n${renderAssertions(assertions, "    ", true)}`;
}

function buildPromptYaml(prompt) {
  const assertionText =
    prompt.assertions.length > 0
      ? renderAssertions(prompt.assertions, "")
      : `      # Add prompt-specific assertions here.
      # Example:
      # - type: llm-rubric
      #   provider: skill-arena:judge:codex
      #   value: Score 1.0 only if the prompt output is correct.`;

  return `    - id: ${prompt.id}
      prompt: ${quote(prompt.prompt)}
      evaluation:
        assertions:
${indentBy(assertionText, 10)}`
      .replace(/(\n\s*)$/, "\n");
}

function buildSkillBlock(cfg) {
  if (cfg.skillSourceType === "system-installed") {
    return `      skill:
        source:
          type: system-installed
          # If your skill is local, set --skill-source-type local-path.
          # If it is remote, set --skill-source-type git.
          # Use --skill-id to override the installed id if needed.
        install:
          strategy: system-installed`;
  }

  if (cfg.skillSourceType === "local-path") {
    return `      skill:
        source:
          type: local-path
          path: ${quote(cfg.skillSourcePath)}
          skillId: ${cfg.skillId}
        install:
          strategy: ${cfg.skillSourceInstallStrategy ?? "workspace-overlay"}`;
  }

  return `      skill:
        source:
          type: git
          repo: ${quote(cfg.skillSourceRepo)}
          ref: ${quote(cfg.skillSourceRef)}
          subpath: ${quote(cfg.skillSourceSubpath)}
          skillPath: ${quote(cfg.skillSourceSkillPath)}
          skillId: ${cfg.skillSourceSkillId}
        install:
          strategy: ${cfg.skillSourceInstallStrategy ?? "workspace-overlay"}`;
}

function buildAssertionLine(assertion, indent) {
  const lines = [`${indent}- type: ${assertion.type}`];
  if (assertion.provider) {
    lines.push(`${indent}  provider: ${assertion.provider}`);
  }
  if (assertion.value !== undefined) {
    lines.push(`${indent}  value: ${quote(assertion.value)}`);
  }
  return lines.join("\n");
}

function renderAssertions(assertions, indentBase, includePlaceholder = false) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    if (includePlaceholder) {
      return `${indentBase}# TODO: add one or more assertions`;
    }
    return `${indentBase}- type: llm-rubric\n${indentBase}  provider: skill-arena:judge:codex\n${indentBase}  value: Score 1.0 only if the prompt is satisfied.`;
  }
  return assertions.map((assertion) => buildAssertionLine(assertion, indentBase)).join("\n");
}

function indentBy(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function quote(value) {
  const str = String(value);
  if (str === "") {
    return "''";
  }
  return `'${str.replace(/'/g, "''")}'`;
}

function printHelp() {
  console.log(`Create a low-boilerplate compare.yaml using prompt specs.

Usage:
node skills/skill-arena-compare/scripts/scaffold-compare-from-prompts.js \
  --out deliverables/compare.yaml \
  --benchmark-id my-compare \
  --description "Short human-readable description." \
  --workspace-path fixtures/example/base \
  --prompt "json|Return output in JSON only for prompt one." \
  --prompt "id=prompt-2;prompt=Return markdown list for second prompt;assertions=regex:^(#|[-*] )" \
  --validate

Prompt spec formats:
- --prompt "assertion|Prompt text"  (auto id: prompt-1, prompt-2, ...)
- --prompt "prompt-id|assertion|Prompt text"
- --prompt "id=...;prompt=...;assertions=..."
- --prompt-json '{"id":"prompt-id","prompt":"...","assertions":[{...}]}' for advanced/custom assertions

Assertion formats:
- Preset aliases: json, markdown, non-empty
- Custom: contains:text, icontains:text, equals:text, regex:pattern, javascript:code, file-contains:path:value, llm-rubric:rubric

Notes:
- --validate runs validate-compare-output.js against the generated file.
- Non-system skill source examples:
  - --skill-source-type git --skill-source-repo https://github.com/org/repo.git --skill-source-ref main --skill-source-skill-path skills/example-skill
  - --skill-source-type local-path --skill-source-path fixtures/example-skill`);
}
