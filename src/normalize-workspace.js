/**
 * Workspace source normalization utilities.
 *
 * Extracted from normalize.js to keep each normalization concern
 * in a focused module.
 */

import { includeOptionalStringProperty, normalizeInlineFiles } from "./normalize-helpers.js";

export function normalizeWorkspace(workspace) {
  const sources = [];

  if (Array.isArray(workspace.sources)) {
    for (const source of workspace.sources) {
      sources.push(normalizeWorkspaceSource(source));
    }
  } else if (workspace.fixture) {
    sources.push({
      id: "base",
      type: "local-path",
      path: workspace.fixture,
      target: "/",
    });
  }

  return {
    sources,
    setup: {
      initializeGit: workspace.setup?.initializeGit ?? workspace.initializeGit ?? true,
      env: workspace.setup?.env ?? {},
    },
  };
}

export function normalizeWorkspaceSource(source) {
  const normalizedSource = {
    ...includeOptionalStringProperty("id", source.id),
    type: source.type,
    target: source.target,
  };

  switch (source.type) {
    case "local-path":
      return {
        ...normalizedSource,
        path: source.path,
      };
    case "git":
      return {
        ...normalizedSource,
        repo: source.repo,
        ...includeOptionalStringProperty("ref", source.ref),
        ...includeOptionalStringProperty("subpath", source.subpath),
      };
    case "inline-files":
      return {
        ...normalizedSource,
        files: normalizeInlineFiles(source.files),
      };
    case "empty":
      return normalizedSource;
    default:
      throw new Error(`Unsupported workspace source type "${source.type}".`);
  }
}
