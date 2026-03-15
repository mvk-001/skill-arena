import { pathToFileURL } from "node:url";

export default class CompareMatrixProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.providerInstances = new Map();
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "compare-matrix-provider";
  }

  async callApi(prompt, context, callOptions) {
    const variantId = resolveVariantId(context);
    const route = this.config.routes?.[variantId];

    if (!route) {
      return {
        error: `No compare route configured for variant "${variantId}".`,
        metadata: {
          variantId,
          skillModeId: this.config.skill_mode_id ?? this.id(),
        },
      };
    }

    const provider = await this.getProviderInstance(route);
    const result = await provider.callApi(prompt, context, callOptions);

    return {
      ...result,
      metadata: {
        ...(result.metadata ?? {}),
        scenarioId: route.scenarioId,
        scenarioDescription: route.provider?.config?.scenario_description ?? null,
        variantId,
        variantDisplayName: context?.vars?.variantDisplayName
          ?? context?.test?.metadata?.variantDisplayName
          ?? variantId,
        skillModeId: this.config.skill_mode_id ?? this.id(),
      },
    };
  }

  async getProviderInstance(route) {
    if (!this.providerInstances.has(route.scenarioId)) {
      const providerModule = await import(pathToFileURL(route.provider.id).href);
      const ProviderClass = providerModule.default;
      this.providerInstances.set(route.scenarioId, new ProviderClass({
        config: route.provider.config,
      }));
    }

    return this.providerInstances.get(route.scenarioId);
  }
}

function resolveVariantId(context) {
  const variantId = context?.vars?.variantId ?? context?.test?.vars?.variantId
    ?? context?.test?.metadata?.variantId;

  if (!variantId) {
    throw new Error("Compare matrix provider expected test metadata vars.variantId.");
  }

  return variantId;
}
