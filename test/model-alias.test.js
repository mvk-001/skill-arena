import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveModelAlias } from "../src/model-alias.js";

test("resolveModelAlias returns original model when no env var is set", () => {
  const original = process.env.SKILL_ARENA_MODEL_MY_MODEL;
  delete process.env.SKILL_ARENA_MODEL_MY_MODEL;
  try {
    assert.equal(resolveModelAlias("my-model"), "my-model");
  } finally {
    if (original !== undefined) process.env.SKILL_ARENA_MODEL_MY_MODEL = original;
  }
});

test("resolveModelAlias resolves from environment variable", () => {
  const envKey = "SKILL_ARENA_MODEL_CODEX_SMALL";
  const original = process.env[envKey];
  process.env[envKey] = "gpt-5.1-codex-mini";
  try {
    assert.equal(resolveModelAlias("codex-small"), "gpt-5.1-codex-mini");
  } finally {
    if (original !== undefined) {
      process.env[envKey] = original;
    } else {
      delete process.env[envKey];
    }
  }
});

test("resolveModelAlias handles dots in model names", () => {
  const envKey = "SKILL_ARENA_MODEL_GPT_5_1_CODEX_MINI";
  const original = process.env[envKey];
  process.env[envKey] = "gpt-6-codex-mini";
  try {
    assert.equal(resolveModelAlias("gpt-5.1-codex-mini"), "gpt-6-codex-mini");
  } finally {
    if (original !== undefined) {
      process.env[envKey] = original;
    } else {
      delete process.env[envKey];
    }
  }
});

test("resolveModelAlias returns null/undefined as-is", () => {
  assert.equal(resolveModelAlias(null), null);
  assert.equal(resolveModelAlias(undefined), undefined);
  assert.equal(resolveModelAlias(""), "");
});
