import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

export const PROJECT_ROOT = path.resolve(SOURCE_DIRECTORY, "..");
export const PACKAGE_ROOT = PROJECT_ROOT;

export function fromProjectRoot(...segments) {
  return path.join(PROJECT_ROOT, ...segments);
}

export function fromPackageRoot(...segments) {
  return path.join(PACKAGE_ROOT, ...segments);
}

export function resolveFromBaseDirectory(baseDirectory, inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(baseDirectory, inputPath);
}

export function findWorkspaceRoot(startDirectory, fallbackDirectory = startDirectory) {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (
      fs.existsSync(path.join(currentDirectory, ".git"))
      || fs.existsSync(path.join(currentDirectory, "package.json"))
    ) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return path.resolve(fallbackDirectory);
    }

    currentDirectory = parentDirectory;
  }
}
