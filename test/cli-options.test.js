import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureKnownLongOptions,
  parsePositiveIntegerOption,
} from "../src/cli/cli-options.js";

test("parsePositiveIntegerOption returns null when the option is absent", () => {
  assert.equal(parsePositiveIntegerOption(["node", "cli"], "--requests"), null);
});

test("parsePositiveIntegerOption parses a positive integer and rejects invalid values", () => {
  assert.equal(
    parsePositiveIntegerOption(["node", "cli", "--requests", "3"], "--requests"),
    3,
  );
  assert.throws(
    () => parsePositiveIntegerOption(["node", "cli", "--requests"], "--requests"),
    /Missing value for option "--requests"\./,
  );
  assert.throws(
    () => parsePositiveIntegerOption(["node", "cli", "--requests", "0"], "--requests"),
    /requires a positive integer/,
  );
});

test("ensureKnownLongOptions accepts declared flags and value options", () => {
  assert.doesNotThrow(() => ensureKnownLongOptions(
    ["node", "cli", "evaluate", "--dry-run", "--max-concurrency", "8"],
    {
      "--dry-run": false,
      "--max-concurrency": true,
    },
  ));
});

test("ensureKnownLongOptions rejects unknown options and missing values", () => {
  assert.throws(
    () => ensureKnownLongOptions(
      ["node", "cli", "evaluate", "--unknown"],
      {
        "--dry-run": false,
      },
    ),
    /Unknown option "--unknown"\./,
  );

  assert.throws(
    () => ensureKnownLongOptions(
      ["node", "cli", "evaluate", "--max-concurrency"],
      {
        "--max-concurrency": true,
      },
    ),
    /Missing value for option "--max-concurrency"\./,
  );
});
