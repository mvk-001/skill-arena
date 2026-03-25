/**
 * Model alias resolution.
 *
 * Supports environment-variable-based model aliasing so benchmark
 * configs can reference a stable alias (e.g. `codex-small`) while
 * operators control the concrete model externally.
 *
 * Resolution order:
 *   1. Environment variable `SKILL_ARENA_MODEL_<UPPER_SLUG>` where
 *      the slug is the original model value uppercased with hyphens
 *      and dots replaced by underscores.
 *   2. The original model value as-is.
 *
 * Example:
 *   SKILL_ARENA_MODEL_CODEX_SMALL=gpt-5.1-codex-mini
 *   model: codex-small  →  resolves to gpt-5.1-codex-mini
 */

export function resolveModelAlias(model) {
  if (!model || typeof model !== "string") {
    return model;
  }

  const envKey = `SKILL_ARENA_MODEL_${model.toUpperCase().replace(/[-. ]/g, "_")}`;
  return process.env[envKey] || model;
}
