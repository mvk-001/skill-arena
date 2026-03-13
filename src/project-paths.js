import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

export const PROJECT_ROOT = path.resolve(SOURCE_DIRECTORY, "..");

export function fromProjectRoot(...segments) {
  return path.join(PROJECT_ROOT, ...segments);
}
