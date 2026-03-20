import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

function isYamlExtension(extension) {
  return extension === ".yaml" || extension === ".yml";
}

export async function parseConfigFile(configFilePath) {
  const extension = path.extname(configFilePath).toLowerCase();
  const contents = await fs.readFile(configFilePath, "utf8");

  try {
    if (isYamlExtension(extension)) {
      return YAML.parse(contents);
    }

    return JSON.parse(contents);
  } catch (error) {
    const parsedType = isYamlExtension(extension) ? "YAML" : "JSON";
    throw new Error(
      `Failed to parse config "${configFilePath}". Expected valid ${parsedType}. ${error.message}`,
    );
  }
}

export function detectConfigKind(parsedConfig, configPath) {
  if (!parsedConfig || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) {
    throw new Error(`Invalid config format in "${configPath}".`);
  }

  const hasComparison = parsedConfig?.comparison
    && typeof parsedConfig.comparison === "object"
    && "variants" in parsedConfig.comparison
    && ("skillModes" in parsedConfig.comparison || "profiles" in parsedConfig.comparison);
  const hasScenarios = Array.isArray(parsedConfig.scenarios);

  if (hasComparison) {
    return "compare";
  }

  if (hasScenarios) {
    return "manifest";
  }

  throw new Error(
    `Unable to detect config type for "${configPath}". Expected either a manifest (` +
      "`scenarios`) or a compare config (`comparison`).",
  );
}
