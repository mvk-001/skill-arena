/**
 * Shared helper utilities for normalization modules.
 *
 * These small functions are used by normalize-task, normalize-workspace,
 * normalize-skill, and normalize-compare to avoid circular dependencies.
 */

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function includeOptionalProperty(key, value) {
  return value !== undefined ? { [key]: value } : {};
}

export function includeOptionalStringProperty(key, value) {
  return value ? { [key]: value } : {};
}

export function normalizeInlineFiles(files = []) {
  return files.map((file) => ({
    path: file.path,
    ...includeOptionalProperty("content", file.content),
  }));
}

export function createDefaultOutput() {
  return {
    tags: [],
    labels: {},
  };
}

export function createDefaultIsolation() {
  return {
    inheritSystem: false,
  };
}

export function createEmptyCapabilities() {
  return {
    instructions: [],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    extensions: [],
    plugins: [],
  };
}
