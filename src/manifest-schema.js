import { z } from "zod";

import { deriveSkillSourceLabel, normalizeManifestShape } from "./normalize.js";

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "Expected a lowercase slug using letters, numbers, and hyphens.",
});

const deterministicAssertionSchema = z.object({
  type: z.enum(["equals", "contains", "icontains", "regex"]),
  value: z.string().min(1),
  metric: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

const isJsonAssertionSchema = z.object({
  type: z.literal("is-json"),
  metric: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

const javascriptAssertionSchema = z.object({
  type: z.literal("javascript"),
  value: z.string().min(1),
  metric: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

const fileContainsAssertionSchema = z.object({
  type: z.literal("file-contains"),
  path: z.string().min(1),
  value: z.string().min(1),
  metric: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

const graderProviderSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
]);

const llmRubricAssertionSchema = z.object({
  type: z.literal("llm-rubric"),
  value: z.string().min(1),
  threshold: z.number().min(0).max(1).optional(),
  provider: graderProviderSchema.optional(),
  rubricPrompt: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
  metric: z.string().min(1).optional(),
  weight: z.number().positive().optional(),
});

export const assertionSchema = z.discriminatedUnion("type", [
  deterministicAssertionSchema,
  isJsonAssertionSchema,
  javascriptAssertionSchema,
  fileContainsAssertionSchema,
  llmRubricAssertionSchema,
]);

export const promptEvaluationSchema = z.object({
  assertions: z.array(assertionSchema).min(1),
});

const baseAgentSchema = z.object({
  adapter: z.enum(["codex", "copilot-cli", "pi", "opencode", "claude-code"]),
  model: z.string().min(1).optional(),
  executionMethod: z.enum(["command", "sdk"]).default("command"),
  commandPath: z.string().min(1).optional(),
  sandboxMode: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .default("read-only"),
  approvalPolicy: z
    .enum(["never", "on-request", "on-failure", "untrusted"])
    .default("never"),
  webSearchEnabled: z.boolean().default(false),
  networkAccessEnabled: z.boolean().default(false),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
    .default("low"),
  additionalDirectories: z.array(z.string()).default([]),
  cliEnv: z.record(z.string(), z.string()).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const agentSchema = baseAgentSchema
  .superRefine((agent, context) => {
    if (agent.adapter === "copilot-cli" && agent.executionMethod !== "command") {
      context.addIssue({
        code: "custom",
        message: "The copilot-cli adapter only supports executionMethod \"command\" in V1.",
        path: ["executionMethod"],
      });
    }

    if (agent.adapter === "opencode" && agent.executionMethod !== "command") {
      context.addIssue({
        code: "custom",
        message: "The opencode adapter only supports executionMethod \"command\" in V1.",
        path: ["executionMethod"],
      });
    }

    if (agent.adapter === "claude-code" && agent.executionMethod !== "command") {
      context.addIssue({
        code: "custom",
        message: "The claude-code adapter only supports executionMethod \"command\" in V1.",
        path: ["executionMethod"],
      });
    }
  })
  .transform((agent) => ({
    ...agent,
    commandPath: agent.commandPath ?? getDefaultCommandPath(agent.adapter),
  }));

function getDefaultCommandPath(adapter) {
  switch (adapter) {
    case "copilot-cli":
      return "copilot";
    case "pi":
      return "pi";
    case "opencode":
      return "opencode";
    case "claude-code":
      return "claude";
    case "codex":
    default:
      return "codex";
  }
}

const localSkillOverlaySchema = z.object({
  path: z.string().min(1),
});

const gitSkillOverlaySchema = z.object({
  repo: z.string().min(1),
  ref: z.string().min(1).optional(),
  subpath: z.string().min(1).optional(),
});

export const skillOverlaySchema = z.union([
  z.string().min(1),
  localSkillOverlaySchema,
  z.object({
    git: gitSkillOverlaySchema,
  }),
]);

export const taskPromptDefinitionSchema = z.object({
  id: slugSchema.optional(),
  prompt: z.string().min(1),
  description: z.string().min(1).optional(),
  evaluation: promptEvaluationSchema.optional(),
});

export const benchmarkMetadataSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

const legacyTaskSchema = z.union([
  z.object({
    prompt: z.string().min(1),
  }),
  z.object({
    prompts: z.array(taskPromptDefinitionSchema).min(1),
  }),
]);

const localPathSourceSchema = z.object({
  id: slugSchema.optional(),
  type: z.literal("local-path"),
  path: z.string().min(1),
  target: z.string().min(1),
});

const gitSourceSchema = z.object({
  id: slugSchema.optional(),
  type: z.literal("git"),
  repo: z.string().min(1),
  ref: z.string().min(1).optional(),
  subpath: z.string().min(1).optional(),
  target: z.string().min(1),
});

const inlineFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().default(""),
});

const inlineFilesSourceSchema = z.object({
  id: slugSchema.optional(),
  type: z.literal("inline-files"),
  target: z.string().min(1),
  files: z.array(inlineFileSchema).min(1),
});

const emptySourceSchema = z.object({
  id: slugSchema.optional(),
  type: z.literal("empty"),
  target: z.string().min(1),
});

export const workspaceSourceSchema = z.discriminatedUnion("type", [
  localPathSourceSchema,
  gitSourceSchema,
  inlineFilesSourceSchema,
  emptySourceSchema,
]);

const workspaceSetupSchema = z.object({
  initializeGit: z.boolean().default(true),
  env: z.record(z.string(), z.string()).default({}),
});

const declarativeWorkspaceSchema = z.object({
  sources: z.array(workspaceSourceSchema).min(1),
  setup: workspaceSetupSchema.default({
    initializeGit: true,
    env: {},
  }),
});

const legacyWorkspaceSchema = z.object({
  fixture: z.string().min(1),
  skillOverlay: skillOverlaySchema.optional(),
  initializeGit: z.boolean().default(true),
});

export const workspaceSchema = z.union([declarativeWorkspaceSchema, legacyWorkspaceSchema]);

const normalizedSkillSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),
  z.object({
    type: z.literal("system-installed"),
  }),
  z.object({
    type: z.literal("local-path"),
    path: z.string().min(1),
    skillId: slugSchema.optional(),
  }),
  z.object({
    type: z.literal("git"),
    repo: z.string().min(1),
    ref: z.string().min(1).optional(),
    subpath: z.string().min(1).optional(),
    skillPath: z.string().min(1).optional(),
    skillId: slugSchema.optional(),
  }),
  z.object({
    type: z.literal("inline"),
    skillId: slugSchema,
    content: z.string().default(""),
    files: z.array(inlineFileSchema).default([]),
  }),
  z.object({
    type: z.literal("inline-files"),
    files: z.array(inlineFileSchema).min(1),
  }),
]);

export const skillSchema = z.object({
  source: normalizedSkillSourceSchema,
  install: z.object({
    strategy: z.enum(["none", "workspace-overlay", "system-installed"]),
  }).optional(),
});

const rawScenarioSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z
    .enum(["workspace-overlay", "system-installed", "none"])
    .default("none"),
  skill: skillSchema.optional(),
  agent: agentSchema,
  evaluation: z.object({
    assertions: z.array(assertionSchema).min(1),
    requests: z.number().int().positive().optional(),
    repeat: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().default(120000),
    tracing: z.boolean().default(false),
    maxConcurrency: z.number().int().positive().optional(),
    noCache: z.boolean().default(true),
  }).transform((evaluation) => ({
    assertions: evaluation.assertions,
    requests: evaluation.requests ?? evaluation.repeat ?? 1,
    timeoutMs: evaluation.timeoutMs,
    tracing: evaluation.tracing,
    maxConcurrency: evaluation.maxConcurrency,
    noCache: evaluation.noCache,
  })),
  output: z
    .object({
      tags: z.array(z.string()).default([]),
      labels: z.record(z.string(), z.string()).default({}),
    })
    .default({
      tags: [],
      labels: {},
    }),
});

const rawManifestSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: benchmarkMetadataSchema,
  task: legacyTaskSchema,
  workspace: workspaceSchema,
  scenarios: z.array(rawScenarioSchema).min(1),
});

const normalizedScenarioSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z.enum(["workspace-overlay", "system-installed", "none"]),
  skill: z.object({
    source: normalizedSkillSourceSchema,
    install: z.object({
      strategy: z.enum(["none", "workspace-overlay", "system-installed"]),
    }),
  }),
  agent: agentSchema,
  evaluation: z.object({
    assertions: z.array(assertionSchema).min(1),
    requests: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    tracing: z.boolean(),
    maxConcurrency: z.number().int().positive().optional(),
    noCache: z.boolean(),
  }),
  output: z.object({
    tags: z.array(z.string()),
    labels: z.record(z.string(), z.string()),
  }),
});

const normalizedManifestSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: benchmarkMetadataSchema,
  task: z.object({
    prompts: z.array(taskPromptDefinitionSchema).min(1),
  }),
  workspace: z.object({
    sources: z.array(workspaceSourceSchema).min(1),
    setup: workspaceSetupSchema,
  }),
  scenarios: z.array(normalizedScenarioSchema).min(1),
});

export const benchmarkManifestSchema = rawManifestSchema
  .transform((manifest) => normalizeManifestShape(manifest))
  .pipe(normalizedManifestSchema)
  .superRefine((manifest, context) => {
    const scenarioIds = new Set();

    for (const scenario of manifest.scenarios) {
      if (scenarioIds.has(scenario.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scenario id "${scenario.id}".`,
          path: ["scenarios"],
        });
      }
      scenarioIds.add(scenario.id);

      if (scenario.skillMode === "disabled" && scenario.skill.install.strategy !== "none") {
        context.addIssue({
          code: "custom",
          message: "Disabled scenarios must resolve to skill.install.strategy \"none\".",
          path: ["scenarios"],
        });
      }

      if (scenario.skillMode === "enabled" && scenario.skill.source.type === "none") {
        context.addIssue({
          code: "custom",
          message: "Enabled scenarios must resolve to a concrete skill source.",
          path: ["scenarios"],
        });
      }

      if (deriveSkillSourceLabel(scenario.skill) !== scenario.skillSource) {
        context.addIssue({
          code: "custom",
          message: "Scenario skillSource does not match the normalized skill configuration.",
          path: ["scenarios"],
        });
      }
    }
  });
