import { fromPackageRoot } from "./project-paths.js";

export const LOCAL_JUDGE_PROVIDER_PREFIX = "skill-arena:judge:";
export const LOCAL_JUDGE_ADAPTERS = new Set(["codex", "copilot-cli", "pi"]);

export function isLocalJudgeProviderId(providerId) {
  return typeof providerId === "string"
    && providerId.startsWith(LOCAL_JUDGE_PROVIDER_PREFIX)
    && LOCAL_JUDGE_ADAPTERS.has(providerId.slice(LOCAL_JUDGE_PROVIDER_PREFIX.length));
}

export function getLocalJudgeAdapter(providerId) {
  if (!isLocalJudgeProviderId(providerId)) {
    throw new Error(`Unsupported local judge provider id "${String(providerId)}".`);
  }

  return providerId.slice(LOCAL_JUDGE_PROVIDER_PREFIX.length);
}

export function toPromptfooGraderProvider(provider, workspaceDirectory) {
  const normalizedProvider = normalizeJudgeProvider(provider);

  if (!normalizedProvider) {
    return provider;
  }

  return {
    id: fromPackageRoot("src", "providers", "local-judge-provider.js"),
    config: {
      provider_id: normalizedProvider.id,
      adapter: getLocalJudgeAdapter(normalizedProvider.id),
      working_directory: workspaceDirectory,
      ...normalizedProvider.config,
    },
  };
}

function normalizeJudgeProvider(provider) {
  if (typeof provider === "string") {
    if (!isLocalJudgeProviderId(provider)) {
      return null;
    }

    return {
      id: provider,
      config: {},
    };
  }

  if (!provider || typeof provider !== "object" || typeof provider.id !== "string") {
    return null;
  }

  if (!isLocalJudgeProviderId(provider.id)) {
    return null;
  }

  return {
    id: provider.id,
    config: provider.config ?? {},
  };
}
