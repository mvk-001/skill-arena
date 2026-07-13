import fs from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";
import { ZodError } from "zod";

function isYamlExtension(extension) {
  return extension === ".yaml" || extension === ".yml";
}

export async function parseConfigFile(configFilePath) {
  const extension = path.extname(configFilePath).toLowerCase();
  const contents = await fs.readFile(configFilePath, "utf8");

  try {
    return isYamlExtension(extension) ? YAML.parse(contents) : JSON.parse(contents);
  } catch (error) {
    const parsedType = isYamlExtension(extension) ? "YAML" : "JSON";
    throw new Error(
      `Failed to parse config "${configFilePath}". Expected valid ${parsedType}. ${error.message}`,
    );
  }
}

export async function loadValidatedConfig(configFilePath, schema, options = {}) {
  const absoluteConfigPath = path.resolve(options.cwd ?? process.cwd(), configFilePath);
  const parsedConfig = await parseConfigFile(absoluteConfigPath);

  try {
    return {
      config: schema.parse(parsedConfig),
      configPath: absoluteConfigPath,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatSchemaErrors(error));
    }

    throw error;
  }
}

export function detectConfigKind(parsedConfig, configPath) {
  if (!parsedConfig || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) {
    throw new Error(`Invalid config format in "${configPath}".`);
  }

  const hasComparison = parsedConfig.comparison
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
    `Unable to detect config type for "${configPath}". Expected either a manifest (`
      + "`scenarios`) or a compare config (`comparison`).",
  );
}

function formatSchemaErrors(error) {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("\n");
}
