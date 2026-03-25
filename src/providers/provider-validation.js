/**
 * Shared validation for Promptfoo custom provider configs.
 *
 * Each provider should call `assertRequiredConfig` at the top of
 * `callApi` to surface missing fields early with a clear message.
 */

export function assertRequiredConfig(config, adapterName, requiredKeys) {
  for (const key of requiredKeys) {
    if (config[key] === undefined || config[key] === null || config[key] === "") {
      throw new Error(
        `${adapterName} provider: missing required config field "${key}".`,
      );
    }
  }
}
