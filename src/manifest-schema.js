import { z } from "zod";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
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

const assertionSchema = z.discriminatedUnion("type", [
  deterministicAssertionSchema,
  isJsonAssertionSchema,
  javascriptAssertionSchema,
  fileContainsAssertionSchema,
  llmRubricAssertionSchema,
]);

const agentSchema = z.object({
  adapter: z.enum(["codex", "copilot-cli", "pi"]),
  model: z.string().min(1).optional(),
  executionMethod: z.enum(["command", "sdk"]).default("command"),
  commandPath: z.string().min(1).default("codex"),
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

const scenarioSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z
    .enum(["workspace-overlay", "system-installed", "none"])
    .default("none"),
  agent: agentSchema,
  evaluation: z.object({
    assertions: z.array(assertionSchema).min(1),
    repeat: z.number().int().positive().default(1),
    timeoutMs: z.number().int().positive().default(120000),
    tracing: z.boolean().default(false),
    maxConcurrency: z.number().int().positive().default(1),
    noCache: z.boolean().default(true),
  }),
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

const localSkillOverlaySchema = z.object({
  path: z.string().min(1),
});

const gitSkillOverlaySchema = z.object({
  repo: z.string().min(1),
  ref: z.string().min(1).optional(),
  subpath: z.string().min(1).optional(),
});

const skillOverlaySchema = z.union([
  z.string().min(1),
  localSkillOverlaySchema,
  z.object({
    git: gitSkillOverlaySchema,
  }),
]);

const taskPromptDefinitionSchema = z.object({
  id: slugSchema,
  prompt: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const benchmarkManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    benchmark: z.object({
      id: slugSchema,
      description: z.string().min(1),
      tags: z.array(z.string()).default([]),
    }),
    task: z.union([
      z.object({
        prompt: z.string().min(1),
      }),
      z.object({
        prompts: z.array(taskPromptDefinitionSchema).min(1),
      }),
    ]),
    workspace: z.object({
      fixture: z.string().min(1),
      skillOverlay: skillOverlaySchema.optional(),
      initializeGit: z.boolean().default(true),
    }),
    scenarios: z.array(scenarioSchema).min(1),
  })
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
    }

    const requiresSkillOverlay = manifest.scenarios.some(
      (scenario) =>
        scenario.skillMode === "enabled" &&
        scenario.skillSource === "workspace-overlay",
    );

    if (requiresSkillOverlay && !manifest.workspace.skillOverlay) {
      context.addIssue({
        code: "custom",
        message:
          "workspace.skillOverlay is required when any scenario enables skill mode.",
        path: ["workspace", "skillOverlay"],
      });
    }
  });
