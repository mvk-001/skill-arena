import { test } from "node:test";
import assert from "node:assert/strict";

import { assertRequiredConfig } from "../src/providers/provider-validation.js";

test("assertRequiredConfig passes when all keys are present", () => {
  const config = { working_dir: "/tmp/test", model: "gpt-5" };
  assert.doesNotThrow(() => assertRequiredConfig(config, "codex", ["working_dir", "model"]));
});

test("assertRequiredConfig throws on missing key", () => {
  const config = { model: "gpt-5" };
  assert.throws(
    () => assertRequiredConfig(config, "codex", ["working_dir"]),
    /codex provider: missing required config field "working_dir"/,
  );
});

test("assertRequiredConfig throws on empty string value", () => {
  const config = { working_dir: "" };
  assert.throws(
    () => assertRequiredConfig(config, "pi", ["working_dir"]),
    /pi provider: missing required config field "working_dir"/,
  );
});

test("assertRequiredConfig throws on null value", () => {
  const config = { working_dir: null };
  assert.throws(
    () => assertRequiredConfig(config, "copilot-cli", ["working_dir"]),
    /copilot-cli provider: missing required config field "working_dir"/,
  );
});
