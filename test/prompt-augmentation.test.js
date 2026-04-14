import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSkillActivationPrompt,
  prependPromptPreamble,
} from "../src/prompt-augmentation.js";

test("buildSkillActivationPrompt returns adapter-specific explicit activation text", () => {
  assert.match(
    buildSkillActivationPrompt({
      adapter: "codex",
      allowedSkillIds: ["marker-guide"],
      skillStrategy: "workspace-overlay",
    }),
    /\$marker-guide/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "pi",
      allowedSkillIds: ["marker-guide"],
      skillStrategy: "workspace-overlay",
    }),
    /\/skill:marker-guide/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "copilot-cli",
      allowedSkillIds: ["marker-guide"],
      skillStrategy: "workspace-overlay",
    }),
    /\/marker-guide/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "gemini-cli",
      allowedSkillIds: ["marker-guide"],
      skillStrategy: "workspace-overlay",
    }),
    /activate_skill/,
  );
});

test("buildSkillActivationPrompt returns empty text when skills are disabled", () => {
  assert.equal(
    buildSkillActivationPrompt({
      adapter: "codex",
      allowedSkillIds: ["marker-guide"],
      skillStrategy: "none",
    }),
    "",
  );
});

test("buildSkillActivationPrompt handles unknown adapters and unnamed skill strategies", () => {
  assert.match(
    buildSkillActivationPrompt({
      adapter: "unknown-agent",
      allowedSkillIds: [" marker-guide ", "", 4],
      skillStrategy: "system-installed",
    }),
    /marker-guide/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "unknown-agent",
      allowedSkillIds: null,
      skillStrategy: "system-installed",
    }),
    /relevant skill is available/,
  );
});

test("buildSkillActivationPrompt covers unnamed branches for the remaining adapters", () => {
  assert.match(
    buildSkillActivationPrompt({
      adapter: "pi",
      allowedSkillIds: [],
      skillStrategy: "system-installed",
    }),
    /installed skill is available/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "copilot-cli",
      allowedSkillIds: [],
      skillStrategy: "system-installed",
    }),
    /repository or installed skill/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "opencode",
      allowedSkillIds: [],
      skillStrategy: "system-installed",
    }),
    /relevant skill is available/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "claude-code",
      allowedSkillIds: [],
      skillStrategy: "system-installed",
    }),
    /relevant skill is available/,
  );

  assert.match(
    buildSkillActivationPrompt({
      adapter: "gemini-cli",
      allowedSkillIds: [],
      skillStrategy: "system-installed",
    }),
    /explicitly activate/,
  );
});

test("prependPromptPreamble keeps the task prompt unchanged when no preamble exists", () => {
  assert.equal(prependPromptPreamble("Return HELLO.", ""), "Return HELLO.");
});

test("prependPromptPreamble prefixes the original task under a Task header", () => {
  assert.equal(
    prependPromptPreamble("Return HELLO.", "Skill activation: use $marker-guide."),
    "Skill activation: use $marker-guide.\n\nTask:\nReturn HELLO.",
  );
});

test("prependPromptPreamble returns the preamble alone when the task is empty", () => {
  assert.equal(
    prependPromptPreamble("   ", "Skill activation: use $marker-guide."),
    "Skill activation: use $marker-guide.",
  );
});

test("prependPromptPreamble tolerates non-string prompts", () => {
  assert.equal(
    prependPromptPreamble(null, "Skill activation: use $marker-guide."),
    "Skill activation: use $marker-guide.",
  );
});
