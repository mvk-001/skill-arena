import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveScenarioSupport,
  listUnsupportedCapabilityFamilies,
  validateScenarioCapabilities,
  validateMaterializedCapabilities,
} from "../src/capability-validation.js";

test("listUnsupportedCapabilityFamilies returns empty for supported codex capabilities", () => {
  const result = listUnsupportedCapabilityFamilies("codex", {
    instructions: [{ source: { type: "local-path" } }],
    skills: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, []);
});

test("listUnsupportedCapabilityFamilies returns unsupported for codex hooks", () => {
  const result = listUnsupportedCapabilityFamilies("codex", {
    hooks: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, ["hooks"]);
});

test("listUnsupportedCapabilityFamilies returns all unsupported families for pi", () => {
  const result = listUnsupportedCapabilityFamilies("pi", {
    instructions: [{ source: { type: "local-path" } }],
    agents: [{ agentId: "agent-1" }],
    hooks: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, ["instructions", "agents", "hooks"]);
});

test("listUnsupportedCapabilityFamilies returns unsupported hooks for opencode", () => {
  const result = listUnsupportedCapabilityFamilies("opencode", {
    instructions: [{ source: { type: "local-path" } }],
    agents: [{ agentId: "agent-1" }],
    hooks: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, ["hooks"]);
});

test("listUnsupportedCapabilityFamilies returns unsupported agents and hooks for gemini-cli", () => {
  const result = listUnsupportedCapabilityFamilies("gemini-cli", {
    instructions: [{ source: { type: "local-path" } }],
    skills: [{ source: { type: "local-path" } }],
    agents: [{ agentId: "agent-1" }],
    hooks: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, ["agents", "hooks"]);
});

test("listUnsupportedCapabilityFamilies ignores empty arrays", () => {
  const result = listUnsupportedCapabilityFamilies("codex", {
    hooks: [],
    agents: [],
  });
  assert.deepEqual(result, []);
});

test("listUnsupportedCapabilityFamilies uses defaults for unknown adapter", () => {
  const result = listUnsupportedCapabilityFamilies("unknown-adapter", {
    skills: [{ source: { type: "local-path" } }],
    hooks: [{ source: { type: "local-path" } }],
  });
  assert.deepEqual(result, ["hooks"]);
});

test("resolveScenarioSupport returns supported for codex with skills only", () => {
  const result = resolveScenarioSupport({
    agent: { adapter: "codex" },
    profile: {
      capabilities: {
        skills: [
          { source: { type: "local-path" }, install: { strategy: "workspace-overlay" } },
        ],
      },
    },
  });
  assert.equal(result.supported, true);
});

test("resolveScenarioSupport returns unsupported for codex with hooks", () => {
  const result = resolveScenarioSupport({
    agent: { adapter: "codex" },
    profile: {
      capabilities: {
        hooks: [{ source: { type: "local-path", target: "/" } }],
      },
    },
  });
  assert.equal(result.supported, false);
  assert.ok(result.reason.includes("hooks"));
});

test("resolveScenarioSupport rejects system-installed skills", () => {
  const result = resolveScenarioSupport({
    agent: { adapter: "codex" },
    profile: {
      capabilities: {
        skills: [
          { source: { type: "system-installed" }, install: { strategy: "system-installed" } },
        ],
      },
    },
  });
  assert.equal(result.supported, false);
  assert.ok(result.reason.includes("system-installed"));
});

test("resolveScenarioSupport handles scenario without profile", () => {
  const result = resolveScenarioSupport({
    agent: { adapter: "codex" },
  });
  assert.equal(result.supported, true);
});

test("validateScenarioCapabilities validates copilot agents", () => {
  const noAgent = validateScenarioCapabilities({
    agent: { adapter: "copilot-cli" },
    profile: { capabilities: {} },
  });
  assert.equal(noAgent, null);

  const validAgent = validateScenarioCapabilities({
    agent: { adapter: "copilot-cli" },
    profile: {
      capabilities: {
        agents: [{ agentId: "my-agent", source: { type: "local-path", path: "ag", target: "/" } }],
      },
    },
  });
  assert.equal(validAgent, null);

  const tooManyAgents = validateScenarioCapabilities({
    agent: { adapter: "copilot-cli" },
    profile: {
      capabilities: {
        agents: [
          { agentId: "a1", source: { type: "local-path", path: "a", target: "/" } },
          { agentId: "a2", source: { type: "local-path", path: "b", target: "/" } },
        ],
      },
    },
  });
  assert.ok(tooManyAgents.includes("at most one"));

  const missingAgentId = validateScenarioCapabilities({
    agent: { adapter: "copilot-cli" },
    profile: {
      capabilities: {
        agents: [{ source: { type: "local-path", path: "ag", target: "/" } }],
      },
    },
  });
  assert.ok(missingAgentId.includes("agentId"));
});

test("validateScenarioCapabilities validates opencode agents", () => {
  const validAgent = validateScenarioCapabilities({
    agent: { adapter: "opencode" },
    profile: {
      capabilities: {
        agents: [{ agentId: "reviewer", source: { type: "local-path", path: "ag", target: "/" } }],
      },
    },
  });
  assert.equal(validAgent, null);

  const tooManyAgents = validateScenarioCapabilities({
    agent: { adapter: "opencode" },
    profile: {
      capabilities: {
        agents: [
          { agentId: "a1", source: { type: "local-path", path: "a", target: "/" } },
          { agentId: "a2", source: { type: "local-path", path: "b", target: "/" } },
        ],
      },
    },
  });
  assert.ok(tooManyAgents.includes("at most one"));
});

test("validateMaterializedCapabilities validates source requirements", () => {
  const noSource = validateMaterializedCapabilities(
    { instructions: [{}] },
    ["instructions"],
  );
  assert.ok(noSource.includes("materializable source"));

  const badType = validateMaterializedCapabilities(
    { instructions: [{ source: { type: "" } }] },
    ["instructions"],
  );
  assert.ok(badType.includes("non-empty string"));

  const unsupportedType = validateMaterializedCapabilities(
    { instructions: [{ source: { type: "custom-type" } }] },
    ["instructions"],
  );
  assert.ok(unsupportedType.includes("must be one of"));

  const missingTarget = validateMaterializedCapabilities(
    { instructions: [{ source: { type: "local-path" } }] },
    ["instructions"],
  );
  assert.ok(missingTarget.includes("target"));

  const emptyTypeOk = validateMaterializedCapabilities(
    { instructions: [{ source: { type: "empty" } }] },
    ["instructions"],
  );
  assert.equal(emptyTypeOk, null);

  const validEntry = validateMaterializedCapabilities(
    { instructions: [{ source: { type: "local-path", target: "/" } }] },
    ["instructions"],
  );
  assert.equal(validEntry, null);
});

test("validateScenarioCapabilities validates codex instructions source", () => {
  const result = validateScenarioCapabilities({
    agent: { adapter: "codex" },
    profile: {
      capabilities: {
        instructions: [{ source: { type: "local-path", target: "/" } }],
      },
    },
  });
  assert.equal(result, null);

  const badResult = validateScenarioCapabilities({
    agent: { adapter: "codex" },
    profile: {
      capabilities: {
        instructions: [{}],
      },
    },
  });
  assert.ok(badResult.includes("materializable source"));
});
