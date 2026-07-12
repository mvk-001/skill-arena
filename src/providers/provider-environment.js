import os from "node:os";

import { resolveHostEnvironmentVariables } from "../environment.js";

const PASSTHROUGH_ENV_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "ComSpec",
  "COMSPEC",
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "windir",
  "SystemDrive",
  "SYSTEMDRIVE",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "CommonProgramFiles",
  "CommonProgramFiles(x86)",
  "CommonProgramW6432",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
];

export function buildIsolatedProviderEnvironment(cliEnv = {}, envPassthrough = []) {
  const environment = {};

  for (const key of PASSTHROUGH_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      environment[key] = process.env[key];
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("LC_") && value !== undefined) {
      environment[key] = value;
    }
  }

  const resolvedCliEnvironment = {};
  for (const [key, value] of Object.entries(cliEnv)) {
    if (typeof value === "string" && value.startsWith("$HOST_ENV:")) {
      const sourceKey = value.slice("$HOST_ENV:".length);
      if (!sourceKey || sourceKey !== key) {
        throw new Error(`Host environment reference for ${key} must name the same variable.`);
      }
      if (process.env[sourceKey] === undefined) {
        throw new Error(`Required host environment variable ${sourceKey} is not set.`);
      }
      resolvedCliEnvironment[key] = process.env[sourceKey];
      continue;
    }
    resolvedCliEnvironment[key] = value;
  }

  return {
    ...environment,
    ...resolveHostEnvironmentVariables(envPassthrough),
    ...resolvedCliEnvironment,
  };
}

export function resolveProcessTempDirectory(env = {}) {
  return env.TEMP
    ?? env.TMP
    ?? env.TMPDIR
    ?? process.env.TEMP
    ?? process.env.TMP
    ?? process.env.TMPDIR
    ?? os.tmpdir();
}
