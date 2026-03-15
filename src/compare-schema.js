import { z } from "zod";

import {
  agentSchema,
  assertionSchema,
  benchmarkMetadataSchema,
  slugSchema,
  taskSchema,
  workspaceSchema,
} from "./manifest-schema.js";

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
  requests: evaluation.requests ?? evaluation.repeat ?? 1,
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

const skillModeVariantSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  skillMode: z.enum(["enabled", "disabled"]),
  skillSource: z.enum(["workspace-overlay", "system-installed", "none"]).optional(),
  output: outputSchema.optional(),
});

const compareVariantSchema = z.object({
  id: slugSchema,
  description: z.string().min(1),
  agent: agentSchema,
  output: outputSchema.optional(),
});

export const compareConfigSchema = z.object({
  schemaVersion: z.literal(1),
  benchmark: benchmarkMetadataSchema,
  task: taskSchema,
  workspace: workspaceSchema,
  evaluation: evaluationSchema,
  comparison: z.object({
    skillModes: z.array(skillModeVariantSchema).min(1),
    variants: z.array(compareVariantSchema).min(1),
  }),
}).superRefine((config, context) => {
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

    if (skillMode.skillMode === "disabled" && skillMode.skillSource === "workspace-overlay") {
      context.addIssue({
        code: "custom",
        message: "Disabled skill variants cannot use skillSource \"workspace-overlay\".",
        path: ["comparison", "skillModes"],
      });
    }
  }

  const requiresSkillOverlay = config.comparison.skillModes.some((skillMode) => {
    const resolvedSkillSource = resolveSkillSource(skillMode, config.workspace.skillOverlay);
    return skillMode.skillMode === "enabled" && resolvedSkillSource === "workspace-overlay";
  });

  if (requiresSkillOverlay && !config.workspace.skillOverlay) {
    context.addIssue({
      code: "custom",
      message:
        "workspace.skillOverlay is required when any comparison skill mode enables a workspace overlay.",
      path: ["workspace", "skillOverlay"],
    });
  }
});

export function resolveSkillSource(skillModeVariant, workspaceSkillOverlay) {
  if (skillModeVariant.skillMode === "disabled") {
    return "none";
  }

  if (skillModeVariant.skillSource) {
    return skillModeVariant.skillSource;
  }

  return workspaceSkillOverlay ? "workspace-overlay" : "system-installed";
}
