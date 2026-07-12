import test from "node:test";
import assert from "node:assert/strict";

import {
  assertHostEnvironmentVariables,
  mergeEnvironmentPassthrough,
  resolveHostEnvironmentVariables,
} from "../src/environment.js";
import { buildIsolatedProviderEnvironment } from "../src/providers/provider-environment.js";

test("environment passthrough merges stable allowlists without duplicates", () => {
  assert.deepEqual(
    mergeEnvironmentPassthrough(["OPENAI_API_KEY"], ["GITHUB_TOKEN", "OPENAI_API_KEY"]),
    ["OPENAI_API_KEY", "GITHUB_TOKEN"],
  );
});

test("environment passthrough rejects non-portable names", () => {
  assert.throws(
    () => mergeEnvironmentPassthrough(["INVALID-NAME"]),
    /Invalid environment variable name/,
  );
});

test("environment passthrough reports all missing required host variables", () => {
  assert.throws(
    () => assertHostEnvironmentVariables(["MISSING_ONE", "MISSING_TWO"], {}),
    /Required host environment variables not set: MISSING_ONE, MISSING_TWO/,
  );
});

test("environment passthrough resolves values only at provider execution time", () => {
  const hostEnvironment = {
    API_TOKEN: "host-secret",
  };

  assert.deepEqual(
    resolveHostEnvironmentVariables(["API_TOKEN"], hostEnvironment),
    { API_TOKEN: "host-secret" },
  );

  const previous = process.env.API_TOKEN;
  process.env.API_TOKEN = hostEnvironment.API_TOKEN;
  try {
    const environment = buildIsolatedProviderEnvironment(
      { API_TOKEN: "explicit-value", HOME: "C:/isolated/home" },
      ["API_TOKEN"],
    );
    assert.equal(environment.API_TOKEN, "explicit-value");
    assert.equal(environment.HOME, "C:/isolated/home");
  } finally {
    if (previous === undefined) {
      delete process.env.API_TOKEN;
    } else {
      process.env.API_TOKEN = previous;
    }
  }
});
