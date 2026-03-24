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
}).superRefine(validateRawCompareConfig);

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
  .superRefine(validateNormalizedCompareConfig);

function validateRawCompareConfig(config, context) {
  if (!hasCompareProfiles(config) && !hasLegacySkillModes(config)) {
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
}

function validateNormalizedCompareConfig(config, context) {
  reportDuplicateIds(config.comparison.variants, "variant", context);
  reportDuplicateIds(config.comparison.profiles, "profile", context);

  for (const profile of config.comparison.profiles) {
    validateProfileIsolation(profile, context);
    validateProfileSkills(profile, context);
  }
}

function hasCompareProfiles(config) {
  return Array.isArray(config.comparison.profiles);
}

function hasLegacySkillModes(config) {
  return Array.isArray(config.comparison.skillModes);
}

function reportDuplicateIds(entries, kind, context) {
  const ids = new Set();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate comparison ${kind} id "${entry.id}".`,
        path: ["comparison", `${kind}s`],
      });
    }

    ids.add(entry.id);
  }
}

function validateProfileIsolation(profile, context) {
  if (!profile.isolation.inheritSystem) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: "Compare profiles must keep isolation.inheritSystem set to false in V1.",
    path: ["comparison", "profiles"],
  });
}

function validateProfileSkills(profile, context) {
  const visibleSkillCount = profile.capabilities.skills.length;

  if (profile.skillMode === "disabled") {
    if (visibleSkillCount > 0) {
      addProfilesIssue(
        context,
        "Disabled compare profiles must not resolve visible skills.",
      );
    }

    if (profile.skill.install.strategy !== "none") {
      addProfilesIssue(
        context,
        "Disabled compare profiles must resolve to skill.install.strategy \"none\".",
      );
    }

    return;
  }

  if (visibleSkillCount === 0) {
    addProfilesIssue(
      context,
      "Enabled compare profiles must resolve to at least one skill capability.",
    );
  }

  if (profile.skill.source.type === "none") {
    addProfilesIssue(
      context,
      "Enabled compare profiles must resolve to a concrete skill source.",
    );
  }
}

function addProfilesIssue(context, message) {
  context.addIssue({
    code: "custom",
    message,
    path: ["comparison", "profiles"],
  });
}
