import os from "node:os";

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

export function buildIsolatedProviderEnvironment(cliEnv = {}) {
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

  return {
    ...environment,
    ...cliEnv,
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
