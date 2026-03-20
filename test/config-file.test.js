import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectConfigKind, parseConfigFile } from "../src/cli/config-file.js";

function writeTempFile(filename, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-config-file-"));
  const filePath = path.join(directory, filename);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

test("parseConfigFile parses YAML inputs", async () => {
  const filePath = writeTempFile("compare.yaml", "schemaVersion: 1\ncomparison:\n  variants: []\n  skillModes: []\n");

  const parsed = await parseConfigFile(filePath);

  assert.deepEqual(parsed, {
    schemaVersion: 1,
    comparison: {
      variants: [],
      skillModes: [],
    },
  });
});

test("parseConfigFile reports invalid JSON with file context", async () => {
  const filePath = writeTempFile("broken.json", "{ not-json");

  await assert.rejects(
    () => parseConfigFile(filePath),
    (error) => {
      assert.equal(typeof error?.message, "string");
      assert.equal(error.message.includes(`Failed to parse config "${filePath}"`), true);
      assert.equal(error.message.includes("Expected valid JSON."), true);
      return true;
    },
  );
});

test("detectConfigKind identifies compare configs", () => {
  assert.equal(
    detectConfigKind(
      {
        comparison: {
          variants: [],
          skillModes: [],
        },
      },
      "compare.yaml",
    ),
    "compare",
  );
});

test("detectConfigKind identifies profile-based compare configs", () => {
  assert.equal(
    detectConfigKind(
      {
        comparison: {
          variants: [],
          profiles: [],
        },
      },
      "compare.yaml",
    ),
    "compare",
  );
});

test("detectConfigKind identifies manifest configs", () => {
  assert.equal(detectConfigKind({ scenarios: [] }, "manifest.yaml"), "manifest");
});

test("detectConfigKind rejects unsupported config shapes", () => {
  assert.throws(
    () => detectConfigKind({ benchmark: { id: "missing-shape" } }, "unknown.yaml"),
    /Unable to detect config type/,
  );
});
