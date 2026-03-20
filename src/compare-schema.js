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

const genericCapabilityEntrySchema = z.object({
  source: z.object({
    type: z.string().min(1),
  }).passthrough().optional(),
  install: z.object({
    strategy: z.string().min(1),
  }).optional(),
}).passthrough();

const rawSkillModeVariantSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z.enum(["workspace-overlay", "system-installed", "none"]).optional(),
  skill: skillSchema.optional(),
  output: outputSchema.optional(),
});

const rawProfileSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  isolation: z.object({
    inheritSystem: z.boolean().default(false),
  }).optional(),
  capabilities: z.object({
    instructions: z.array(genericCapabilityEntrySchema).optional(),
    skills: z.array(skillSchema).optional(),
    agents: z.array(genericCapabilityEntrySchema).optional(),
    hooks: z.array(genericCapabilityEntrySchema).optional(),
    mcp: z.array(genericCapabilityEntrySchema).optional(),
    extensions: z.array(genericCapabilityEntrySchema).optional(),
    plugins: z.array(genericCapabilityEntrySchema).optional(),
  }).default({}),
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
    profiles: z.array(rawProfileSchema).min(1).optional(),
    skillModes: z.array(rawSkillModeVariantSchema).min(1).optional(),
    variants: z.array(compareVariantSchema).min(1),
  }),
}).superRefine((config, context) => {
  const hasProfiles = Array.isArray(config.comparison.profiles);
  const hasSkillModes = Array.isArray(config.comparison.skillModes);

  if (!hasProfiles && !hasSkillModes) {
    context.addIssue({
      code: "custom",
      message: "Compare configs must define comparison.profiles or legacy comparison.skillModes.",
      path: ["comparison"],
    });
  }

  config.comparison.skillModes?.forEach((skillMode, index) => {
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
    profiles: z.array(z.object({
      id: slugSchema,
      description: z.string().min(1),
      isolation: z.object({
        inheritSystem: z.boolean(),
      }),
      capabilities: z.object({
        instructions: z.array(genericCapabilityEntrySchema),
        skills: z.array(z.object({
          source: z.object({
            type: z.string().min(1),
          }).passthrough(),
          install: z.object({
            strategy: z.enum(["none", "workspace-overlay", "system-installed"]),
          }),
        })),
        agents: z.array(genericCapabilityEntrySchema),
        hooks: z.array(genericCapabilityEntrySchema),
        mcp: z.array(genericCapabilityEntrySchema),
        extensions: z.array(genericCapabilityEntrySchema),
        plugins: z.array(genericCapabilityEntrySchema),
      }),
      skillMode: z.enum(["enabled", "disabled"]),
      skill: z.object({
        source: z.object({
          type: z.string().min(1),
        }).passthrough(),
        install: z.object({
          strategy: z.enum(["none", "workspace-overlay", "system-installed", "mixed"]),
        }),
      }),
      skillSource: z.enum(["workspace-overlay", "system-installed", "none", "mixed"]),
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
    const profileIds = new Set();

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

    for (const profile of config.comparison.profiles) {
      if (profileIds.has(profile.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate comparison profile id "${profile.id}".`,
          path: ["comparison", "profiles"],
        });
      }
      profileIds.add(profile.id);

      if (profile.isolation.inheritSystem) {
        context.addIssue({
          code: "custom",
          message: "Compare profiles must keep isolation.inheritSystem set to false in V1.",
          path: ["comparison", "profiles"],
        });
      }

      if (profile.skillMode === "disabled" && profile.capabilities.skills.length > 0) {
        context.addIssue({
          code: "custom",
          message: "Disabled compare profiles must not resolve visible skills.",
          path: ["comparison", "profiles"],
        });
      }

      if (profile.skillMode === "enabled" && profile.capabilities.skills.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Enabled compare profiles must resolve to at least one skill capability.",
          path: ["comparison", "profiles"],
        });
      }

      if (profile.skillMode === "disabled" && profile.skill.install.strategy !== "none") {
        context.addIssue({
          code: "custom",
          message: "Disabled compare profiles must resolve to skill.install.strategy \"none\".",
          path: ["comparison", "profiles"],
        });
      }

      if (profile.skillMode === "enabled" && profile.skill.source.type === "none") {
        context.addIssue({
          code: "custom",
          message: "Enabled compare profiles must resolve to a concrete skill source.",
          path: ["comparison", "profiles"],
        });
      }
    }
  });
