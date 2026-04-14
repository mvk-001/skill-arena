import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_PATH = "compare.generated.yaml";
const SUPPORTED_ASSERTION_TYPES = [
  "equals",
  "contains",
  "icontains",
  "regex",
  "is-json",
  "javascript",
  "file-contains",
  "llm-rubric",
];
const SUPPORTED_SKILL_TYPES = new Set([
  "git",
  "local-path",
  "system-installed",
  "inline-files",
]);
const OPTION_DEFAULTS = {
  help: false,
  outputPath: DEFAULT_OUTPUT_PATH,
  benchmarkId: null,
  benchmarkDescription: null,
  tags: [],
  prompts: [],
  promptDescriptions: [],
  evaluationTypes: [],
  evaluationValues: [],
  evaluationProvider: null,
  requests: null,
  timeoutMs: null,
  maxConcurrency: null,
  noCache: null,
  tracing: null,
  workspaceSourceType: "local-path",
  workspacePath: null,
  workspaceTarget: "/",
  workspaceRepo: null,
  workspaceRef: null,
  workspaceSubpath: null,
  initializeGit: null,
  skillType: "local-path",
  skillPath: null,
  skillId: null,
  skillRepo: null,
  skillRef: null,
  skillSubpath: null,
  skillPathInRepo: null,
  variantId: null,
  variantDescription: null,
  variantDisplayName: null,
  adapter: null,
  model: null,
  executionMethod: null,
  commandPath: null,
  sandboxMode: null,
  approvalPolicy: null,
  webSearchEnabled: null,
  networkAccessEnabled: null,
  reasoningEffort: null,
};
const OPTION_HANDLERS = {
  "--output": (options, value) => {
    options.outputPath = value;
  },
  "--benchmark-id": (options, value) => {
    options.benchmarkId = value;
  },
  "--description": (options, value) => {
    options.benchmarkDescription = value;
  },
  "--benchmark-description": (options, value) => {
    options.benchmarkDescription = value;
  },
  "--tag": (options, value) => {
    options.tags.push(value);
  },
  "--prompt": (options, value) => {
    options.prompts.push(value);
  },
  "--prompt-description": (options, value) => {
    options.promptDescriptions.push(value);
  },
  "--evaluation-type": (options, value) => {
    options.evaluationTypes.push(value);
  },
  "--evaluation-value": (options, value) => {
    options.evaluationValues.push(value);
  },
  "--evaluation-provider": (options, value) => {
    options.evaluationProvider = value;
  },
  "--requests": (options, value, flagName) => {
    options.requests = parseIntegerOption(flagName, value);
  },
  "--timeout-ms": (options, value, flagName) => {
    options.timeoutMs = parseIntegerOption(flagName, value);
  },
  "--max-concurrency": (options, value, flagName) => {
    options.maxConcurrency = parseIntegerOption(flagName, value);
  },
  "--maxConcurrency": (options, value, flagName) => {
    options.maxConcurrency = parseIntegerOption(flagName, value);
  },
  "--no-cache": (options, value, flagName) => {
    options.noCache = parseBooleanOption(flagName, value);
  },
  "--tracing": (options, value, flagName) => {
    options.tracing = parseBooleanOption(flagName, value);
  },
  "--workspace-source-type": (options, value) => {
    options.workspaceSourceType = value;
  },
  "--workspace-path": (options, value) => {
    options.workspacePath = value;
  },
  "--workspace-target": (options, value) => {
    options.workspaceTarget = value;
  },
  "--workspace-repo": (options, value) => {
    options.workspaceRepo = value;
  },
  "--workspace-ref": (options, value) => {
    options.workspaceRef = value;
  },
  "--workspace-subpath": (options, value) => {
    options.workspaceSubpath = value;
  },
  "--initialize-git": (options, value, flagName) => {
    options.initializeGit = parseBooleanOption(flagName, value);
  },
  "--skill-type": (options, value) => {
    options.skillType = value;
  },
  "--skill-path": (options, value) => {
    options.skillPath = value;
  },
  "--skill-id": (options, value) => {
    options.skillId = value;
  },
  "--skill-repo": (options, value) => {
    options.skillRepo = value;
  },
  "--skill-ref": (options, value) => {
    options.skillRef = value;
  },
  "--skill-subpath": (options, value) => {
    options.skillSubpath = value;
  },
  "--skill-path-in-repo": (options, value) => {
    options.skillPathInRepo = value;
  },
  "--variant-id": (options, value) => {
    options.variantId = value;
  },
  "--variant-description": (options, value) => {
    options.variantDescription = value;
  },
  "--variant-display-name": (options, value) => {
    options.variantDisplayName = value;
  },
  "--adapter": (options, value) => {
    options.adapter = value;
  },
  "--model": (options, value) => {
    options.model = value;
  },
  "--execution-method": (options, value) => {
    options.executionMethod = value;
  },
  "--command-path": (options, value) => {
    options.commandPath = value;
  },
  "--sandbox-mode": (options, value) => {
    options.sandboxMode = value;
  },
  "--approval-policy": (options, value) => {
    options.approvalPolicy = value;
  },
  "--web-search-enabled": (options, value, flagName) => {
    options.webSearchEnabled = parseBooleanOption(flagName, value);
  },
  "--network-access-enabled": (options, value, flagName) => {
    options.networkAccessEnabled = parseBooleanOption(flagName, value);
  },
  "--reasoning-effort": (options, value) => {
    options.reasoningEffort = value;
  },
};

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const outputPath = path.resolve(process.cwd(), options.outputPath);
  const outputDirectory = path.dirname(outputPath);
  const yaml = renderCompareTemplate(options);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, yaml, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        benchmarkId: resolveBenchmarkId(options),
        promptCount: resolvePrompts(options).length,
        assertionCount: resolveAssertions(options).length,
        skillType: options.skillType,
      },
      null,
      2,
    ),
  );
}

function parseArguments(argv) {
  const options = {
    ...OPTION_DEFAULTS,
    tags: [],
    prompts: [],
    promptDescriptions: [],
    evaluationTypes: [],
    evaluationValues: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (!argument.startsWith("--")) {
      throw new Error(`Unknown positional argument "${argument}". Use --help for usage.`);
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for "${argument}".`);
      }
      index += 1;
      return value;
    };

    const handler = OPTION_HANDLERS[argument];
    if (!handler) {
      throw new Error(`Unknown option "${argument}". Use --help for usage.`);
    }

    handler(options, nextValue(), argument);
  }

  if (!SUPPORTED_SKILL_TYPES.has(options.skillType)) {
    throw new Error(
      `Unsupported --skill-type "${options.skillType}". Use one of: git, local-path, system-installed, inline-files.`,
    );
  }

  return options;
}

function parseIntegerOption(flagName, rawValue) {
  const numericValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`"${flagName}" expects a positive integer.`);
  }
  return numericValue;
}

function parseBooleanOption(flagName, rawValue) {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  throw new Error(`"${flagName}" expects "true" or "false".`);
}

function resolveBenchmarkId(options) {
  if (options.benchmarkId) {
    return options.benchmarkId;
  }

  const firstPrompt = options.prompts[0] ?? "compare-benchmark";
  const slug = slugify(firstPrompt).slice(0, 48);
  return `${slug || "compare-benchmark"}-compare`;
}

function resolveBenchmarkDescription(options) {
  return options.benchmarkDescription
    ?? "TODO: replace with a short description of what this compare benchmark measures.";
}

function resolveTags(options) {
  if (options.tags.length > 0) {
    return options.tags;
  }
  return ["compare"];
}

function resolvePrompts(options) {
  if (options.prompts.length === 0) {
    return [
      {
        id: "prompt-1",
        description: "TODO: describe what this prompt is checking.",
        prompt: "TODO: replace with the exact task prompt sent to the agent.",
      },
    ];
  }

  return options.prompts.map((prompt, index) => ({
    id: `prompt-${index + 1}`,
    description:
      options.promptDescriptions[index]
      ?? `TODO: describe why prompt ${index + 1} exists and how it differs from the others.`,
    prompt,
  }));
}

function resolveAssertions(options) {
  if (options.evaluationTypes.length === 0 && options.evaluationValues.length === 0) {
    return [
      {
        type: "equals",
        value: "TODO: exact expected output example",
      },
      {
        type: "contains",
        value: "TODO: required substring example",
      },
      {
        type: "icontains",
        value: "TODO: required case-insensitive substring example",
      },
      {
        type: "regex",
        value: "TODO: ^expected-pattern$",
      },
      {
        type: "is-json",
        value: "TODO: replace or remove; this type usually checks JSON output shape",
      },
      {
        type: "javascript",
        value: "TODO: return { pass: true } from a custom JS assertion or reference a script input",
      },
      {
        type: "file-contains",
        value: "TODO: use with a file path assertion when the benchmark expects a workspace file to be written",
      },
      {
        type: "llm-rubric",
        value: "TODO: Score 1.0 only if the answer satisfies the benchmark rubric.",
      },
    ];
  }

  const total = Math.max(options.evaluationTypes.length, options.evaluationValues.length, 1);
  const assertions = [];

  for (let index = 0; index < total; index += 1) {
    assertions.push({
      type: options.evaluationTypes[index] ?? "llm-rubric",
      value: options.evaluationValues[index]
        ?? "TODO: replace with the assertion body, expected value, or rubric.",
    });
  }

  return assertions;
}

function resolveVariant(options) {
  const adapter = options.adapter ?? "codex";
  const variantId = options.variantId ?? defaultVariantIdForAdapter(adapter);
  const variantDisplayName = options.variantDisplayName ?? variantId.replaceAll("-", " ");
  const config = adapter === "copilot-cli" ? { noCustomInstructions: true } : {};

  return {
    id: variantId,
    description:
      options.variantDescription
      ?? "TODO: explain why this variant exists and what it should be compared against.",
    adapter,
    model: options.model ?? defaultModelForAdapter(adapter),
    executionMethod: options.executionMethod ?? "command",
    commandPath: options.commandPath ?? defaultCommandPathForAdapter(adapter),
    sandboxMode: options.sandboxMode ?? "read-only",
    approvalPolicy: options.approvalPolicy ?? "never",
    webSearchEnabled: options.webSearchEnabled ?? false,
    networkAccessEnabled: options.networkAccessEnabled ?? false,
    reasoningEffort: options.reasoningEffort ?? "low",
    config,
    variantDisplayName,
  };
}

function defaultVariantIdForAdapter(adapter) {
  if (adapter === "copilot-cli") {
    return "copilot-gpt5";
  }
  if (adapter === "pi") {
    return "pi-gpt5mini";
  }
  if (adapter === "claude-code") {
    return "claude-code-sonnet";
  }
  if (adapter === "gemini-cli") {
    return "gemini-pro";
  }
  return "codex-mini";
}

function defaultModelForAdapter(adapter) {
  if (adapter === "copilot-cli") {
    return "gpt-5";
  }
  if (adapter === "pi") {
    return "github-copilot/gpt-5-mini";
  }
  if (adapter === "claude-code") {
    return "claude-sonnet-4-20250514";
  }
  if (adapter === "gemini-cli") {
    return "gemini-2.5-pro";
  }
  return "gpt-5.1-codex-mini";
}

function defaultCommandPathForAdapter(adapter) {
  if (adapter === "copilot-cli") {
    return "copilot";
  }
  if (adapter === "pi") {
    return "pi";
  }
  if (adapter === "claude-code") {
    return "claude";
  }
  if (adapter === "gemini-cli") {
    return "gemini";
  }
  return "codex";
}

function renderCompareTemplate(options) {
  const benchmarkId = resolveBenchmarkId(options);
  const benchmarkDescription = resolveBenchmarkDescription(options);
  const tags = resolveTags(options);
  const prompts = resolvePrompts(options);
  const assertions = resolveAssertions(options);
  const variant = resolveVariant(options);

  const lines = [
    "# Generated by `skill-arena gen-conf`.",
    "# TODO: review every TODO before running `skill-arena evaluate`.",
    "schemaVersion: 1",
    "benchmark:",
    `  id: ${yamlString(benchmarkId)}`,
    "  # TODO: benchmark.id should be a stable slug-like identifier. Choose something short, lowercase, and durable because it becomes part of results/ paths and report labels.",
    `  description: ${yamlString(benchmarkDescription)}`,
    "  # TODO: benchmark.description should say what is being compared and under which task conditions. Keep it human-readable because it appears in reports.",
    "  tags:",
    "    # TODO: benchmark.tags is an open list. Use tags for search and grouping in reports, for example: compare, codex, copilot, pi, gws, repo-summary, smoke.",
    ...tags.map((tag) => `    - ${yamlString(tag)}`),
    "task:",
    "  prompts:",
    "    # TODO: add one prompt entry per row you want in the compare matrix. Split prompts only when you want separate row-level reporting or prompt-specific assertions.",
  ];
  lines.push(...renderPromptBlocks(prompts));
  lines.push(...renderWorkspaceSection(options));
  lines.push(...renderEvaluationSection(options, assertions));
  lines.push(...renderComparisonSection(options, variant));

  return `${lines.join("\n")}\n`;
}

function renderPromptBlocks(prompts) {
  return prompts.flatMap((prompt) => [
    `    - id: ${yamlString(prompt.id)}`,
    "      # TODO: task.prompts[*].id should be a slug-like row identifier. Use a stable id so report rows stay readable across benchmark revisions.",
    `      description: ${yamlString(prompt.description)}`,
    "      # TODO: description is free text. Explain what this row is checking and how it differs from the other prompts.",
    `      prompt: ${yamlString(prompt.prompt)}`,
    "      # TODO: prompt is the exact task sent to the agent. Keep it benchmark-specific. Add output-format constraints only when the benchmark truly depends on them.",
    "      # TODO: if this row needs checks that differ from the shared evaluation.assertions, add task.prompts[*].evaluation.assertions under this prompt.",
  ]);
}

function renderWorkspaceSection(options) {
  const lines = [
    "workspace:",
    "  sources:",
    "    # TODO: keep source inputs immutable; the runner copies them into fresh workspaces.",
    "    # TODO: choose the workspace source type by provenance: local-path for files already on disk, git for pinned external inputs, inline-files for tiny synthetic fixtures, empty for intentionally blank workspaces.",
    ...renderWorkspaceSource(options),
  ];

  if (!options.workspacePath && !options.workspaceRepo) {
    lines.push(...renderAdditionalWorkspaceSourceExamples());
  }

  lines.push(
    "  setup:",
    `    initializeGit: ${yamlBoolean(options.initializeGit ?? true)}`,
    "    # TODO: initializeGit is a closed choice: true or false. Use true when the agent or benchmark expects a Git repo; use false only when Git state would be irrelevant or misleading.",
    "    # TODO: add workspace.setup.env only when the benchmark truly depends on run-specific environment variables.",
    "    env: {}",
    "    # TODO: workspace.setup.env is an open mapping of NAME: value. Put only reproducible runtime dependencies here, not secrets or machine-specific paths.",
  );

  return lines;
}

function renderAdditionalWorkspaceSourceExamples() {
  return [
    "    # TODO: additional workspace.sources entries can coexist and are applied in order. Add multiple entries when you want a base layer plus overlays or helper files.",
    "    # TODO: example additional local-path source:",
    "    # - id: docs",
    "    #   type: local-path",
    "    #   path: ./fixtures/TODO/docs",
    "    #   target: /docs",
    "    # TODO: example additional git source:",
    "    # - id: external-assets",
    "    #   type: git",
    "    #   repo: https://github.com/example/repo.git",
    "    #   ref: main",
    "    #   subpath: path/in/repo",
    "    #   target: /vendor",
    "    # TODO: example additional inline-files source:",
    "    # - id: generated-notes",
    "    #   type: inline-files",
    "    #   target: /",
    "    #   files:",
    "    #     - path: NOTES.md",
    "    #       content: |",
    "    #         TODO: inline helper notes",
    "    # TODO: example additional empty source:",
    "    # - id: blank-layer",
    "    #   type: empty",
    "    #   target: /tmp",
  ];
}

function renderEvaluationSection(options, assertions) {
  const lines = [
    "evaluation:",
    "  assertions:",
    "    # TODO: shared assertions apply to every compare cell. Put prompt-specific checks under task.prompts[*].evaluation.assertions instead.",
  ];

  if (options.evaluationTypes.length === 0 && options.evaluationValues.length === 0) {
    lines.push(
      "    # TODO: because you did not preselect assertion types, this template includes one example of every supported V1 assertion type below.",
      "    # TODO: keep only the assertions that fit your benchmark; multiple assertion types can coexist in the same list.",
    );
  }

  lines.push(
    ...assertions.flatMap((assertion) => renderAssertionBlock(assertion, options)),
    `  requests: ${options.requests ?? 10}`,
    "  # TODO: requests is a positive integer. Higher values reduce variance but cost more time and tokens. Use 1 for smoke checks, low single digits for iteration, and 10+ for more stable comparisons.",
    `  timeoutMs: ${options.timeoutMs ?? 180000}`,
    "  # TODO: timeoutMs is a positive integer in milliseconds. Set it high enough for the slowest expected cell, especially when prompts require repo analysis or external CLI work.",
    `  tracing: ${yamlBoolean(options.tracing ?? false)}`,
    "  # TODO: tracing is a closed choice: true or false. Enable it when you need extra Promptfoo trace detail; keep it false for normal benchmark runs to reduce noise.",
    ...renderConcurrencyLines(options),
    `  noCache: ${yamlBoolean(options.noCache ?? true)}`,
    "  # TODO: noCache is a closed choice: true or false. Keep true for reproducible repeated evaluations; switch to false only when you intentionally want Promptfoo caching.",
  );

  return lines;
}

function renderAssertionBlock(assertion, options) {
  const lines = [`    - type: ${yamlString(assertion.type)}`];

  if (!SUPPORTED_ASSERTION_TYPES.includes(assertion.type)) {
    lines.push(
      "      # TODO: this assertion type is not part of the Skill Arena V1 supported set.",
      `      # TODO: replace it with one of: ${SUPPORTED_ASSERTION_TYPES.join(", ")}.`,
    );
  } else {
    lines.push(
      `      # TODO: supported assertion types are: ${SUPPORTED_ASSERTION_TYPES.join(", ")}.`,
      "      # TODO: choose equals for exact output, contains/icontains for stable substrings, regex for format patterns, is-json for JSON shape, javascript for custom logic, file-contains for workspace file checks, llm-rubric for judge-based scoring.",
    );
  }

  if (assertion.type === "llm-rubric") {
    lines.push(
      `      provider: ${yamlString(options.evaluationProvider ?? "skill-arena:judge:codex")}`,
      "      # TODO: provider choices are usually skill-arena:judge:codex, skill-arena:judge:copilot-cli, skill-arena:judge:pi, skill-arena:judge:opencode, skill-arena:judge:claude-code, skill-arena:judge:gemini-cli, or a hosted Promptfoo provider such as openai:gpt-5-mini.",
      "      # TODO: choose a local judge when you want the benchmark to stay CLI-local; choose a hosted judge only when you need a specific external grader.",
    );
  }

  lines.push(
    `      value: ${yamlString(assertion.value)}`,
    "      # TODO: value meaning depends on type: expected exact text for equals, required substring for contains/icontains, pattern for regex, rubric text for llm-rubric, or script/logic reference for javascript.",
  );

  return lines;
}

function renderConcurrencyLines(options) {
  if (options.maxConcurrency !== null) {
    return [
      `  maxConcurrency: ${options.maxConcurrency}`,
      "  # TODO: remove maxConcurrency to let the harness use local machine parallelism.",
    ];
  }

  return [
    "  # TODO: uncomment maxConcurrency only when you want a fixed, machine-independent cap.",
    "  # maxConcurrency: 4",
  ];
}

function renderComparisonSection(options, variant) {
  const lines = [
    "comparison:",
    "  profiles:",
    "    # TODO: keep at least one isolated control profile and add as many explicit alternatives as the benchmark needs.",
    "    - id: no-skill",
    "      # TODO: id should be slug-like. Use short ids because they become compare column labels.",
    "      description: Fully isolated control with no declared capabilities.",
    "      # TODO: description is free text. Explain what this control profile represents.",
    "      isolation:",
    "        inheritSystem: false",
    "        # TODO: keep inheritSystem false so compare profiles remain deny-all and explicit.",
    "      capabilities: {}",
    "      # TODO: capabilities is an explicit object. Leave it empty for the control profile.",
    "    - id: skill-alternative-1",
    "      # TODO: add more profiles only when each one encodes a clear benchmark hypothesis.",
    "      description: Declared capability profile with one explicit skill.",
    "      # TODO: description should identify the capability bundle, for example remote git skill, local skill group, or skill plus agent.",
    "      isolation:",
    "        inheritSystem: false",
    "      capabilities:",
    "        skills:",
    "          -",
    ...indentLines(renderSkillSource(options), 12),
    "      # TODO: duplicate this profile block when you want more compare columns such as no-skill, skill-alternative-1, skill-alternative-2, or tool-specific capability bundles.",
    "  variants:",
    "    # TODO: add one variant per adapter/model/runtime configuration you want as separate rows for each prompt.",
    ...renderVariantBlock(variant),
  ];

  if (!options.adapter && !options.model) {
    lines.push(...renderAdditionalVariantExamples());
  }

  return lines;
}

function renderVariantBlock(variant) {
  const configLines = Object.keys(variant.config ?? {}).length === 0
    ? ["        config: {}"]
    : [
      "        config:",
      ...Object.entries(variant.config).map(
        ([key, value]) => `          ${key}: ${yamlValueForMapping(value)}`,
      ),
    ];

  return [
    `    - id: ${yamlString(variant.id)}`,
    "      # TODO: variant id should be slug-like and stable. Include adapter/model hints when it helps row readability.",
    `      description: ${yamlString(variant.description)}`,
    "      # TODO: description is free text. Explain why this runtime configuration is included.",
    "      agent:",
    `        adapter: ${yamlString(variant.adapter)}`,
    "        # TODO: adapter choices are exactly: codex, copilot-cli, pi, opencode, claude-code, gemini-cli.",
    "        # TODO: choose the adapter that matches the local CLI you actually want to benchmark.",
    `        model: ${yamlString(variant.model)}`,
    "        # TODO: model is provider-specific free text. Use the exact model id accepted by the chosen adapter and prefer one that is stable and documented for the benchmark.",
    `        executionMethod: ${yamlString(variant.executionMethod)}`,
    "        # TODO: executionMethod is adapter-dependent. Common choice is command. Codex also supports sdk. Prefer command when you want to mirror the installed CLI behavior.",
    `        commandPath: ${yamlString(variant.commandPath)}`,
    "        # TODO: commandPath is the executable name or path used locally, for example codex, copilot, or pi. Override it only when the binary is not on PATH under the default name.",
    `        sandboxMode: ${yamlString(variant.sandboxMode)}`,
    "        # TODO: sandboxMode is adapter-specific policy text. Common values include read-only, workspace-write, and danger-full-access. Choose the narrowest mode that still allows the task to succeed.",
    `        approvalPolicy: ${yamlString(variant.approvalPolicy)}`,
    "        # TODO: approvalPolicy is adapter-specific policy text. Common values include never and on-request. Prefer never for reproducible unattended benchmarks.",
    `        webSearchEnabled: ${yamlBoolean(variant.webSearchEnabled)}`,
    "        # TODO: webSearchEnabled is a closed choice: true or false. Enable it only when the task explicitly requires live web access.",
    `        networkAccessEnabled: ${yamlBoolean(variant.networkAccessEnabled)}`,
    "        # TODO: networkAccessEnabled is a closed choice: true or false. Enable it only when the task needs networked tools, remote repos, or external services during agent execution.",
    `        reasoningEffort: ${yamlString(variant.reasoningEffort)}`,
    "        # TODO: reasoningEffort is adapter-specific text. Common values are low or medium; choose higher effort only when the task is materially reasoning-bound and you accept extra cost/latency.",
    "        additionalDirectories: []",
    "        # TODO: additionalDirectories is an open list of extra readable paths. Keep it empty unless the benchmark must expose files outside the materialized workspace.",
    "        cliEnv: {}",
    "        # TODO: cliEnv is an open mapping of environment variables passed to the agent CLI. Use it for reproducible CLI tweaks, not for secrets.",
    ...configLines,
    "        # TODO: config is an adapter-specific open mapping for advanced overrides. Leave empty unless the adapter contract requires extra fields for this benchmark.",
    "      output:",
    "        labels:",
    `          variantDisplayName: ${yamlString(variant.variantDisplayName)}`,
    "          # TODO: variantDisplayName is the human label shown in merged reports. Choose something short and readable, for example codex mini or copilot gpt-5.",
    "      # TODO: duplicate this variant block when you want more rows per prompt for other adapters or models.",
  ];
}

function renderAdditionalVariantExamples() {
  return [
    "    # TODO: example additional variant for copilot-cli:",
    "    # - id: copilot-gpt5",
    "    #   description: Compare against GitHub Copilot CLI on GPT-5.",
    "    #   agent:",
    "    #     adapter: copilot-cli",
    "    #     model: gpt-5",
    "    #     executionMethod: command",
    "    #     commandPath: copilot",
    "    #     sandboxMode: read-only",
    "    #     approvalPolicy: never",
    "    #     webSearchEnabled: false",
    "    #     networkAccessEnabled: false",
    "    #     reasoningEffort: low",
    "    #     additionalDirectories: []",
    "    #     cliEnv: {}",
    "    #     config: {}",
    "    #   output:",
    "    #     labels:",
    "    #       variantDisplayName: copilot gpt-5",
    "    # TODO: example additional variant for pi:",
    "    # - id: pi-gpt5mini",
    "    #   description: Compare against PI on GPT-5 mini.",
    "    #   agent:",
    "    #     adapter: pi",
    "    #     model: github-copilot/gpt-5-mini",
    "    #     executionMethod: command",
    "    #     commandPath: pi",
    "    #     sandboxMode: read-only",
    "    #     approvalPolicy: never",
    "    #     webSearchEnabled: false",
    "    #     networkAccessEnabled: false",
    "    #     reasoningEffort: low",
    "    #     additionalDirectories: []",
    "    #     cliEnv: {}",
    "    #     config: {}",
    "    #   output:",
    "    #     labels:",
    "    #       variantDisplayName: pi gpt-5 mini",
  ];
}

function renderWorkspaceSource(options) {
  const sourceType = options.workspaceSourceType;

  if (sourceType === "git") {
    return [
      "    - id: base",
      "      # TODO: source id is a stable label for this input layer. Use short names such as base, overlay, docs, or fixtures.",
      "      type: git",
      "      # TODO: type choices are local-path, git, inline-files, empty. Use git when benchmark inputs must be pinned to an external repository revision.",
      `      repo: ${yamlString(options.workspaceRepo ?? "TODO: replace with the real repository URL.")}`,
      "      # TODO: repo is a clone URL. Prefer a public or stable internal URL that collaborators can resolve reproducibly.",
      `      ref: ${yamlString(options.workspaceRef ?? "main")}`,
      "      # TODO: check whether `main` is the correct ref, tag, or commit SHA.",
      `      subpath: ${yamlString(options.workspaceSubpath ?? ".")}`,
      "      # TODO: subpath selects which folder inside the fetched repo becomes the source root. Use . for the repo root, or a narrower path when only one subtree is relevant.",
      `      target: ${yamlString(options.workspaceTarget)}`,
      "      # TODO: target is the destination inside the materialized run workspace. Use / for repo root or a subfolder like /fixtures or /docs when you want to isolate content.",
      "      # TODO: alternative workspace source types: local-path, inline-files, empty.",
      "      # TODO: local-path example -> type: local-path, path: ./fixtures/example/base, target: /",
      "      # TODO: inline-files example -> type: inline-files, files: [{ path: README.md, content: ... }], target: /",
    ];
  }

  if (sourceType === "inline-files") {
    return [
      "    - id: base",
      "      # TODO: source id is a stable label for this input layer. Use short names such as base, overlay, docs, or fixtures.",
      "      type: inline-files",
      "      # TODO: type choices are local-path, git, inline-files, empty. Use inline-files only for small synthetic fixtures that are easier to keep in one YAML file.",
      `      target: ${yamlString(options.workspaceTarget)}`,
      "      # TODO: target is the destination inside the materialized run workspace. Use / for repo root or a subfolder like /fixtures or /docs when you want to isolate content.",
      "      files:",
      "      # TODO: files is an open list of inline file objects. Add only the minimal files needed for the benchmark to stay readable and maintainable.",
      "        - path: TODO.md",
      "          # TODO: path is the file path inside the selected target. Choose the exact relative path the agent should see in the workspace.",
      "          content: |",
      "            TODO: content is the literal file body. Use inline-files only when the content is short enough to remain readable in compare.yaml.",
      "      # TODO: alternative workspace source types: local-path, git, empty.",
      "      # TODO: use git when benchmark inputs should be pinned to an external repository revision.",
    ];
  }

  if (sourceType === "empty") {
    return [
      "    - id: base",
      "      # TODO: source id is a stable label for this input layer. Use short names such as base, overlay, docs, or fixtures.",
      "      type: empty",
      "      # TODO: type choices are local-path, git, inline-files, empty. Use empty only when the benchmark intentionally starts from a blank workspace.",
      `      target: ${yamlString(options.workspaceTarget)}`,
      "      # TODO: target is the destination inside the materialized run workspace. Use / unless you have a very specific reason to isolate the empty layer under a subfolder.",
      "      # TODO: use empty only when the whole workspace is created by inline-files or by the agent itself.",
      "      # TODO: alternative workspace source types: local-path, git, inline-files.",
    ];
  }

  return [
    "    - id: base",
    "      # TODO: source id is a stable label for this input layer. Use short names such as base, overlay, docs, or fixtures.",
    "      type: local-path",
    "      # TODO: type choices are local-path, git, inline-files, empty. Use local-path when the source files already exist on the local filesystem where compare will run.",
    `      path: ${yamlString(options.workspacePath ?? "./fixtures/TODO/base")}`,
    "      # TODO: path is a runtime-relative or absolute directory path. Choose relative paths when the benchmark should be portable from the working directory; choose absolute paths only when portability is not required.",
    `      target: ${yamlString(options.workspaceTarget)}`,
    "      # TODO: target is the destination inside the materialized run workspace. Use / for repo root or a subfolder like /fixtures or /docs when you want to isolate content.",
    "      # TODO: alternative workspace source types: git, inline-files, empty.",
    "      # TODO: use git when you want the benchmark to pin external inputs by repo + ref.",
  ];
}

function renderSkillSource(options) {
  if (options.skillType === "git") {
    return [
      "        source:",
      "          type: git",
      "          # TODO: source.type choices are usually local-path, git, system-installed, or inline-files for compare authoring. Use git when the skill should be fetched from a pinned repository state.",
      `          repo: ${yamlString(options.skillRepo ?? "TODO: replace with the real Git repository URL.")}`,
      "          # TODO: repo is a clone URL. Prefer a stable URL that collaborators and CI can access.",
      `          ref: ${yamlString(options.skillRef ?? "main")}`,
      "          # TODO: replace `main` with the correct branch, tag, or commit SHA when needed.",
      `          subpath: ${yamlString(options.skillSubpath ?? ".")}`,
      "          # TODO: subpath narrows the fetched repository root before selecting the skill. Use . for the repo root, or a deeper folder when the repo contains multiple projects.",
      `          skillPath: ${yamlString(options.skillPathInRepo ?? "skills/TODO-skill")}`,
      "          # TODO: skillPath is the path to the selected skill directory inside the repo or selected subpath. Omit it when subpath already points at a whole bundle root.",
      `          skillId: ${yamlString(options.skillId ?? "todo-skill")}`,
      "          # TODO: skillId is the installed folder name and user-facing identifier for the skill. Keep it stable and aligned with the skill's actual purpose.",
      "        install:",
      "          strategy: workspace-overlay",
      "          # TODO: install.strategy choices are usually workspace-overlay, system-installed, or none after normalization. Use workspace-overlay when the harness should inject the skill files into the run workspace.",
      "        # TODO: alternative skill source shapes:",
      "        # TODO: local-path -> source.type: local-path, path: ./skills/my-skill, skillId: my-skill",
      "        # TODO: system-installed -> source.type: system-installed, install.strategy: system-installed",
      "        # TODO: inline-files -> source.type: inline-files with files that create AGENTS.md, skills/<skill-id>/SKILL.md, references, scripts, or any other bundle assets",
    ];
  }

  if (options.skillType === "system-installed") {
    return [
      "        source:",
      "          type: system-installed",
      "          # TODO: source.type choices are usually local-path, git, system-installed, or inline-files for compare authoring. Use system-installed only when the skill already exists in the local agent environment outside the benchmark workspace.",
      "        install:",
      "          strategy: system-installed",
      "          # TODO: install.strategy choices are usually workspace-overlay, system-installed, or none after normalization. Use system-installed when the harness must not inject skill files into the workspace.",
      "        # TODO: use system-installed only when the skill is already present in the local agent environment.",
      "        # TODO: alternative skill source shapes: local-path, git, inline-files.",
    ];
  }

  if (options.skillType === "inline-files") {
    return [
      "        source:",
      "          type: inline-files",
      "          # TODO: source.type choices are usually local-path, git, system-installed, or inline-files for compare authoring. Use inline-files when the whole skill can be expressed as a small file set directly in compare.yaml.",
      "          files:",
      "          # TODO: files is an open list of overlay files. Include at minimum skills/<skill-id>/SKILL.md and any extra referenced assets the bundle needs, such as AGENTS.md, references, or scripts.",
      `            - path: ${yamlString(`skills/${options.skillId ?? "todo-skill"}/SKILL.md`)}`,
      "              # TODO: path is the file path inside the workspace overlay. Keep the conventional skills/<skill-id>/SKILL.md shape unless the benchmark intentionally needs extra root files such as AGENTS.md.",
      "              content: |",
      "                ---",
      `                name: ${options.skillId ?? "todo-skill"}`,
      "                # TODO: name is the skill identifier inside SKILL.md. Keep it aligned with skillId unless you have a migration reason.",
      "                description: TODO: replace with a one-line skill description.",
      "                # TODO: description should say what capability the skill adds and when the agent should use it.",
      "                ---",
      "                TODO: replace with the actual skill instructions.",
      "        install:",
      "          strategy: workspace-overlay",
      "          # TODO: install.strategy choices are usually workspace-overlay, system-installed, or none after normalization. Use workspace-overlay when the harness should inject the generated files into the run workspace.",
      "        # TODO: alternative skill source shapes: local-path, git, system-installed.",
      "        # TODO: prefer local-path or git when the skill already exists on disk or in a repository.",
    ];
  }

  return [
    "        source:",
    "          type: local-path",
    "          # TODO: source.type choices are usually local-path, git, system-installed, or inline-files for compare authoring. Use local-path when the skill already exists on the local filesystem.",
    `          path: ${yamlString(options.skillPath ?? "./skills/TODO-skill")}`,
    "          # TODO: path should point to one skill directory or to a workspace-overlay bundle root. Choose a runtime-relative path for portability or an absolute path only when portability is not needed.",
    `          skillId: ${yamlString(options.skillId ?? "todo-skill")}`,
    "          # TODO: skillId is the installed folder name and user-facing identifier for the skill. Keep it aligned with the folder name agents will use.",
    "        install:",
    "          strategy: workspace-overlay",
    "          # TODO: install.strategy choices are usually workspace-overlay, system-installed, or none after normalization. Use workspace-overlay when the harness should inject the skill files into the run workspace.",
    "        # TODO: alternative skill source shapes:",
    "        # TODO: git -> repo/ref/subpath/skillPath/skillId for a remote pinned skill",
    "        # TODO: system-installed -> rely on a skill already installed outside the workspace",
    "        # TODO: inline-files -> define the whole skill overlay directly inside compare.yaml",
  ];
}

function indentLines(lines, spaces) {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => `${prefix}${line.replace(/^ {8}/, "")}`);
}

function yamlString(value) {
  return JSON.stringify(value);
}

function yamlBoolean(value) {
  return value ? "true" : "false";
}

function yamlValueForMapping(value) {
  if (typeof value === "boolean") {
    return yamlBoolean(value);
  }

  if (typeof value === "number" || typeof value === "string") {
    return yamlString(value);
  }

  return JSON.stringify(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function printUsage() {
  console.error("Usage: node ./src/cli/generate-compare-template.js [options]");
  console.error("");
  console.error("Generate a commented compare config template with TODO placeholders.");
  console.error("");
  console.error("Common options:");
  console.error("  --output <path>                 Destination file path");
  console.error("  --prompt <text>                Add one prompt row; repeatable");
  console.error("  --prompt-description <text>    Description for the next prompt row; repeatable");
  console.error("  --benchmark-id <slug>           Override benchmark.id");
  console.error("  --description <text>            Override benchmark.description");
  console.error("  --benchmark-description <text>  Synonym for --description");
  console.error("  --tag <text>                    Add one benchmark tag");
  console.error("  --evaluation-type <type>       Add one shared assertion type; repeatable");
  console.error("  --evaluation-value <value>     Add one shared assertion value; repeatable");
  console.error("  --evaluation-provider <id>     Provider override for llm-rubric assertions");
  console.error("  --skill-type <type>            git | local-path | system-installed | inline-files");
  console.error("  --skill-path <path>             Skill source path (local)");
  console.error("  --skill-id <slug>               Skill identifier");
  console.error("  --skill-repo <url>              Git repository for skills");
  console.error("  --skill-ref <ref>               Git ref for skills");
  console.error("  --skill-subpath <path>          Git repository subpath for skills");
  console.error("  --skill-path-in-repo <path>      Path to skill folder inside git repo");
  console.error("  --requests <n>                 evaluation.requests");
  console.error("  --timeout-ms <n>               evaluation.timeoutMs");
  console.error("  --max-concurrency <n>          evaluation.maxConcurrency");
  console.error("  --maxConcurrency <n>           Alias for --max-concurrency");
  console.error("  --no-cache <true|false>        Set evaluation.noCache");
  console.error("  --tracing <true|false>         Set evaluation.tracing");
  console.error("  --workspace-source-type <type>  local-path | git | inline-files | empty");
  console.error("  --workspace-path <path>         Local workspace source path");
  console.error("  --workspace-target <path>       Workspace source target");
  console.error("  --workspace-repo <url>          Workspace git repository");
  console.error("  --workspace-ref <ref>           Workspace git ref");
  console.error("  --workspace-subpath <path>      Workspace git subpath");
  console.error("  --initialize-git <true|false>   Set workspace.setup.initializeGit");
  console.error("  --variant-id <id>               Variant identifier");
  console.error("  --variant-description <text>    Variant description");
  console.error("  --variant-display-name <text>   Human-readable variant label");
  console.error("  --adapter <id>                 codex | copilot-cli | pi | opencode | claude-code | gemini-cli");
  console.error("  --model <id>                   Variant model");
  console.error("  --execution-method <id>         Variant execution method");
  console.error("  --command-path <path>           Variant executable path");
  console.error("  --sandbox-mode <id>            Variant sandbox mode");
  console.error("  --approval-policy <id>         Variant approval policy");
  console.error("  --web-search-enabled <true|false> Variant web search flag");
  console.error("  --network-access-enabled <true|false> Variant network access flag");
  console.error("  --reasoning-effort <id>         Variant reasoning effort");
  console.error("");
  console.error("Example:");
  console.error(
    "  node ./src/cli/generate-compare-template.js --prompt \"summarize file A\" --evaluation-type javascript --evaluation-value @checks.js --prompt \"create an evaluation script\" --evaluation-type llm-rubric --requests 3 --maxConcurrency 8 --skill-type git",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
