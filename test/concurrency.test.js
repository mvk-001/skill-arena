import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import {
  getDefaultParallelism,
  mapWithConcurrency,
  resolveEvaluationConcurrency,
} from "../src/concurrency.js";

test("getDefaultParallelism honors SKILL_ARENA_MAX_PARALLELISM when set", async () => {
  const previousValue = process.env.SKILL_ARENA_MAX_PARALLELISM;
  process.env.SKILL_ARENA_MAX_PARALLELISM = "7";

  try {
    const module = await import(`../src/concurrency.js?override=${Date.now()}`);
    assert.equal(module.getDefaultParallelism(), 7);
  } finally {
    if (previousValue === undefined) {
      delete process.env.SKILL_ARENA_MAX_PARALLELISM;
    } else {
      process.env.SKILL_ARENA_MAX_PARALLELISM = previousValue;
    }
  }
});

test("getDefaultParallelism falls back to os.cpus when availableParallelism is unavailable", () => {
  const original = os.availableParallelism;

  try {
    os.availableParallelism = undefined;
    assert.equal(getDefaultParallelism(), Math.max(1, os.cpus().length));
  } finally {
    os.availableParallelism = original;
  }
});

test("resolveEvaluationConcurrency prefers explicit maxConcurrency", () => {
  assert.equal(resolveEvaluationConcurrency({ maxConcurrency: 3 }), 3);
  assert.ok(resolveEvaluationConcurrency({}) >= 1);
});

test("mapWithConcurrency preserves order and respects the concurrency cap", async () => {
  const items = [0, 1, 2, 3, 4];
  let activeWorkers = 0;
  let maxActiveWorkers = 0;

  const results = await mapWithConcurrency(items, 2, async (value) => {
    activeWorkers += 1;
    maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);

    await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 10 : 1));

    activeWorkers -= 1;
    return value * 10;
  });

  assert.deepEqual(results, [0, 10, 20, 30, 40]);
  assert.equal(maxActiveWorkers, 2);
});
