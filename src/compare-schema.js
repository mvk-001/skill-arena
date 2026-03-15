import { z } from "zod";

import {
  agentSchema,
  assertionSchema,
  benchmarkMetadataSchema,
  skillSchema,
  slugSchema,
  taskPromptDefinitionSchema,
  workspaceSourceSchema,
  workspaceSchema,
} from "./manifest-schema.js";
import { normalizeCompareConfigShape } from "./normalize.js";

const labelsSchema = z.record(z.string(), z.string()).default({});
const tagsSchema = z.array(z.string()).default([]);

const evaluationSchema = z.object({
  assertions: z.array(assertionSchema).min(1),
  requests: z.number().int().positive().optional(),
  repeat: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(120000),
  tracing: z.boolean().default(false),
  maxConcurrency: z.number().int().positive().optional(),
  noCache: z.boolean().default(true),
}).transform((evaluation) => ({
  assertions: evaluation.assertions,
  requests: evaluation.requests ?? evaluation.repeat ?? 10,
  timeoutMs: evaluation.timeoutMs,
  tracing: evaluation.tracing,
  maxConcurrency: evaluation.maxConcurrency,
  noCache: evaluation.noCache,
}));

const outputSchema = z.object({
  tags: tagsSchema,
  labels: labelsSchema,
}).default({
  tags: [],
  labels: {},
});

const rawSkillModeVariantSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z.enum(["workspace-overlay", "system-installed", "none"]).optional(),
  skill: skillSchema.optional(),
  output: outputSchema.optional(),
});

const compareVariantSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  agent: agentSchema,
  output: outputSchema.optional(),
});

const rawCompareConfigSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: benchmarkMetadataSchema,
  task: z.union([
    z.object({
      prompt: z.string().min(1),
    }),
    z.object({
      prompts: z.array(taskPromptDefinitionSchema).min(1),
    }),
  ]),
  workspace: workspaceSchema,
  evaluation: evaluationSchema,
  comparison: z.object({
    skillModes: z.array(rawSkillModeVariantSchema).min(1),
    variants: z.array(compareVariantSchema).min(1),
  }),
}).superRefine((config, context) => {
  config.comparison.skillModes.forEach((skillMode, index) => {
    if (skillMode.skillMode === "enabled" && !skillMode.skill) {
      context.addIssue({
        code: "custom",
        message: "Enabled compare skill modes must define comparison.skillModes[*].skill explicitly.",
        path: ["comparison", "skillModes", index, "skill"],
      });
    }
  });
});

const normalizedCompareConfigSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: benchmarkMetadataSchema,
  task: z.object({
    prompts: z.array(taskPromptDefinitionSchema).min(1),
  }),
  workspace: z.object({
    sources: z.array(workspaceSourceSchema).min(1),
    setup: z.object({
      initializeGit: z.boolean(),
      env: z.record(z.string(), z.string()),
    }),
  }),
  evaluation: z.object({
    assertions: z.array(assertionSchema).min(1),
    requests: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    tracing: z.boolean(),
    maxConcurrency: z.number().int().positive().optional(),
    noCache: z.boolean(),
  }),
  comparison: z.object({
    skillModes: z.array(z.object({
      id: slugSchema,
      description: z.string().min(1),
      skillMode: z.enum(["enabled", "disabled"]),
      skill: z.object({
        source: z.object({
          type: z.string().min(1),
        }).passthrough(),
        install: z.object({
          strategy: z.enum(["none", "workspace-overlay", "system-installed"]),
        }),
      }),
      skillSource: z.enum(["workspace-overlay", "system-installed", "none"]),
      output: outputSchema,
    })).min(1),
    variants: z.array(compareVariantSchema).min(1),
  }),
});

export const compareConfigSchema = rawCompareConfigSchema
  .transform((config) => normalizeCompareConfigShape(config))
  .pipe(normalizedCompareConfigSchema)
  .superRefine((config, context) => {
    const variantIds = new Set();
    const skillModeIds = new Set();

    for (const variant of config.comparison.variants) {
      if (variantIds.has(variant.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate comparison variant id "${variant.id}".`,
          path: ["comparison", "variants"],
        });
      }
      variantIds.add(variant.id);
    }

    for (const skillMode of config.comparison.skillModes) {
      if (skillModeIds.has(skillMode.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate comparison skill mode id "${skillMode.id}".`,
          path: ["comparison", "skillModes"],
        });
      }
      skillModeIds.add(skillMode.id);

      if (skillMode.skillMode === "disabled" && skillMode.skill.install.strategy !== "none") {
        context.addIssue({
          code: "custom",
          message: "Disabled skill variants must resolve to skill.install.strategy \"none\".",
          path: ["comparison", "skillModes"],
        });
      }

      if (skillMode.skillMode === "enabled" && skillMode.skill.source.type === "none") {
        context.addIssue({
          code: "custom",
          message: "Enabled skill variants must resolve to a concrete skill source.",
          path: ["comparison", "skillModes"],
        });
      }
    }
  });
