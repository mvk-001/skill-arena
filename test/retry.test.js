import { test } from "node:test";
import assert from "node:assert/strict";

import { withRetry, isRetryableResult } from "../src/providers/retry.js";

test("isRetryableResult returns false for exit code 0", () => {
  assert.equal(isRetryableResult({ exitCode: 0, stdout: "", stderr: "" }), false);
});

test("isRetryableResult returns true for timeout exit code 124", () => {
  assert.equal(isRetryableResult({ exitCode: 124, stdout: "", stderr: "" }), true);
});

test("isRetryableResult returns true for rate limit in stderr", () => {
  assert.equal(
    isRetryableResult({ exitCode: 1, stdout: "", stderr: "Error: rate limit exceeded" }),
    true,
  );
});

test("isRetryableResult returns true for 429 in stdout", () => {
  assert.equal(
    isRetryableResult({ exitCode: 1, stdout: "HTTP 429 Too Many Requests", stderr: "" }),
    true,
  );
});

test("isRetryableResult returns false for generic exit code 1", () => {
  assert.equal(
    isRetryableResult({ exitCode: 1, stdout: "some error", stderr: "" }),
    false,
  );
});

test("withRetry returns result immediately when no retries configured", async () => {
  let callCount = 0;
  const result = await withRetry(
    async () => {
      callCount++;
      return { exitCode: 1, stdout: "error", stderr: "" };
    },
    { retries: 0 },
  );
  assert.equal(callCount, 1);
  assert.equal(result.exitCode, 1);
});

test("withRetry retries on retryable failure", async () => {
  let callCount = 0;
  const result = await withRetry(
    async () => {
      callCount++;
      if (callCount < 3) {
        return { exitCode: 124, stdout: "", stderr: "timeout" };
      }
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
    { retries: 3, retryDelayMs: 10 },
  );
  assert.equal(callCount, 3);
  assert.equal(result.exitCode, 0);
});

test("withRetry stops after max retries", async () => {
  let callCount = 0;
  const result = await withRetry(
    async () => {
      callCount++;
      return { exitCode: 124, stdout: "", stderr: "timeout" };
    },
    { retries: 2, retryDelayMs: 10 },
  );
  assert.equal(callCount, 3); // initial + 2 retries
  assert.equal(result.exitCode, 124);
});

test("withRetry does not retry non-retryable failures", async () => {
  let callCount = 0;
  const result = await withRetry(
    async () => {
      callCount++;
      return { exitCode: 1, stdout: "bad input", stderr: "" };
    },
    { retries: 3, retryDelayMs: 10 },
  );
  assert.equal(callCount, 1);
  assert.equal(result.exitCode, 1);
});

test("withRetry does not retry successful results", async () => {
  let callCount = 0;
  const result = await withRetry(
    async () => {
      callCount++;
      return { exitCode: 0, stdout: "done", stderr: "" };
    },
    { retries: 3, retryDelayMs: 10 },
  );
  assert.equal(callCount, 1);
  assert.equal(result.exitCode, 0);
});
