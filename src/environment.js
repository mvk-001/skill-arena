const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function mergeEnvironmentPassthrough(...collections) {
  const names = [];
  const seen = new Set();

  for (const collection of collections) {
    for (const name of collection ?? []) {
      assertEnvironmentVariableName(name);
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }

  return names;
}

export function assertHostEnvironmentVariables(names, hostEnvironment = process.env) {
  const missing = mergeEnvironmentPassthrough(names)
    .filter((name) => hostEnvironment[name] === undefined);

  if (missing.length > 0) {
    throw new Error(
      `Required host environment variable${missing.length === 1 ? "" : "s"} not set: ${missing.join(", ")}.`,
    );
  }
}

export function resolveHostEnvironmentVariables(names, hostEnvironment = process.env) {
  const normalizedNames = mergeEnvironmentPassthrough(names);
  assertHostEnvironmentVariables(normalizedNames, hostEnvironment);

  return Object.fromEntries(
    normalizedNames.map((name) => [name, hostEnvironment[name]]),
  );
}

export function assertEnvironmentVariableName(name) {
  if (typeof name !== "string" || !ENVIRONMENT_VARIABLE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid environment variable name "${String(name)}". `
      + "Use portable names containing letters, numbers, and underscores, starting with a letter or underscore.",
    );
  }
}

export { ENVIRONMENT_VARIABLE_NAME_PATTERN };
