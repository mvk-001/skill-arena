/**
 * Capability validation helpers for compare scenarios.
 *
 * Extracted from run-compare.js to reduce file size and
 * cognitive/cyclomatic complexity (rust-code-analysis).
 */

const SUPPORTED_SOURCE_TYPES = new Set(["local-path", "git", "inline-files", "empty"]);

const ADAPTER_CAPABILITY_FAMILIES = {
  "codex": new Set(["instructions", "skills"]),
  "copilot-cli": new Set(["instructions", "skills", "agents", "hooks"]),
  "pi": new Set(["skills"]),
};

const DEFAULT_CAPABILITY_FAMILIES = new Set(["skills"]);

const CAPABILITY_FAMILY_NAMES = [
  "instructions",
  "agents",
  "hooks",
  "mcp",
  "extensions",
  "plugins",
];

export function resolveScenarioSupport(scenario) {
  const capabilities = scenario.profile?.capabilities ?? {};

  const unsupportedFamilies = listUnsupportedCapabilityFamilies(
    scenario.agent.adapter,
    capabilities,
  );
  if (unsupportedFamilies.length > 0) {
    return {
      supported: false,
      reason: `Adapter "${scenario.agent.adapter}" does not yet support compare profile capabilities: ${unsupportedFamilies.join(", ")}.`,
    };
  }

  const capabilityError = validateScenarioCapabilities(scenario);
  if (capabilityError) {
    return { supported: false, reason: capabilityError };
  }

  const systemInstalledSkills = (capabilities.skills ?? []).filter(
    (skill) =>
      skill.install?.strategy === "system-installed" ||
      skill.source?.type === "system-installed",
  );
  if (systemInstalledSkills.length > 0) {
    return {
      supported: false,
      reason:
        "Strict compare isolation does not yet support system-installed skills in comparison profiles.",
    };
  }

  return { supported: true };
}

export function listUnsupportedCapabilityFamilies(adapterId, capabilities) {
  const supported = ADAPTER_CAPABILITY_FAMILIES[adapterId] ?? DEFAULT_CAPABILITY_FAMILIES;

  return CAPABILITY_FAMILY_NAMES.filter(
    (family) =>
      Array.isArray(capabilities[family]) &&
      capabilities[family].length > 0 &&
      !supported.has(family),
  );
}

export function validateScenarioCapabilities(scenario) {
  if (scenario.agent.adapter === "copilot-cli") {
    return validateCopilotCapabilities(scenario.profile?.capabilities ?? {});
  }

  return validateMaterializedCapabilities(
    scenario.profile?.capabilities ?? {},
    ["instructions"],
  );
}

function validateCopilotCapabilities(capabilities) {
  const agentError = validateSingleAgentCapability(capabilities.agents ?? []);
  if (agentError) {
    return agentError;
  }

  return validateMaterializedCapabilities(capabilities, [
    "instructions",
    "agents",
    "hooks",
  ]);
}

function validateSingleAgentCapability(agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return null;
  }

  if (agents.length > 1) {
    return 'Adapter "copilot-cli" supports at most one compare profile agent.';
  }

  const agentId = agents[0]?.agentId;
  if (typeof agentId !== "string" || agentId.trim() === "") {
    return 'Adapter "copilot-cli" requires profile.capabilities.agents[*].agentId.';
  }

  return null;
}

/**
 * Validate that every entry in the given capability families has a
 * well-formed materializable source.
 *
 * The original implementation used deeply nested loops that inflated
 * cognitive complexity. This version delegates per-entry checks to a
 * helper so each branch is shallow.
 */
export function validateMaterializedCapabilities(capabilities, supportedFamilies) {
  for (const family of supportedFamilies) {
    const entries = Array.isArray(capabilities?.[family]) ? capabilities[family] : [];

    for (const [index, entry] of entries.entries()) {
      const error = validateCapabilityEntry(family, index, entry);
      if (error) {
        return error;
      }
    }
  }

  return null;
}

function validateCapabilityEntry(family, index, entry) {
  const prefix = `profile.capabilities.${family}[${index}]`;
  const source = entry?.source;

  if (!source || typeof source !== "object") {
    return `${prefix} must declare a materializable source.`;
  }

  if (typeof source.type !== "string" || source.type.length === 0) {
    return `${prefix}.source.type must be a non-empty string.`;
  }

  if (!SUPPORTED_SOURCE_TYPES.has(source.type)) {
    return `${prefix}.source.type must be one of: ${[...SUPPORTED_SOURCE_TYPES].join(", ")}.`;
  }

  if (source.type !== "empty" && typeof source.target !== "string") {
    return `${prefix}.source.target must be defined.`;
  }

  return null;
}
