import test from "node:test";
import assert from "node:assert/strict";

import {
  getLocalJudgeAdapter,
  isLocalJudgeProviderId,
  toPromptfooGraderProvider,
} from "../src/judge-provider.js";
import LocalJudgeProvider from "../src/providers/local-judge-provider.js";

test("local judge helpers detect supported shorthand ids", () => {
  assert.equal(isLocalJudgeProviderId("skill-arena:judge:codex"), true);
  assert.equal(isLocalJudgeProviderId("skill-arena:judge:copilot-cli"), true);
  assert.equal(isLocalJudgeProviderId("skill-arena:judge:pi"), true);
  assert.equal(isLocalJudgeProviderId("skill-arena:judge:opencode"), true);
  assert.equal(isLocalJudgeProviderId("openai:gpt-5-mini"), false);
  assert.equal(getLocalJudgeAdapter("skill-arena:judge:copilot-cli"), "copilot-cli");
  assert.equal(getLocalJudgeAdapter("skill-arena:judge:opencode"), "opencode");
});

test("local judge helpers reject unsupported ids and ignore invalid provider shapes", () => {
  assert.throws(
    () => getLocalJudgeAdapter("openai:gpt-5-mini"),
    /Unsupported local judge provider id "openai:gpt-5-mini"\./,
  );
  assert.equal(toPromptfooGraderProvider(null, "C:/temp/workspace"), null);
  assert.deepEqual(toPromptfooGraderProvider({}, "C:/temp/workspace"), {});
});

test("toPromptfooGraderProvider rewrites local judge shorthand and passes through other providers", () => {
  const workspaceDirectory = "C:/temp/workspace";
  const translated = toPromptfooGraderProvider("skill-arena:judge:codex", workspaceDirectory);

  assert.match(translated.id, /local-judge-provider\.js$/);
  assert.equal(translated.config.provider_id, "skill-arena:judge:codex");
  assert.equal(translated.config.adapter, "codex");
  assert.equal(translated.config.working_directory, workspaceDirectory);
  assert.equal(toPromptfooGraderProvider("openai:gpt-5-mini", workspaceDirectory), "openai:gpt-5-mini");
});

test("toPromptfooGraderProvider rewrites object-form local judge providers", () => {
  const translated = toPromptfooGraderProvider({
    id: "skill-arena:judge:copilot-cli",
    config: {
      model: "gpt-5",
      commandPath: "copilot",
    },
  }, "C:/temp/workspace");

  assert.match(translated.id, /local-judge-provider\.js$/);
  assert.equal(translated.config.adapter, "copilot-cli");
  assert.equal(translated.config.model, "gpt-5");
  assert.equal(translated.config.commandPath, "copilot");
});

test("local judge provider delegates to codex-compatible config defaults", async () => {
  const provider = new LocalJudgeProvider({
    config: {
      adapter: "codex",
      provider_id: "skill-arena:judge:codex",
      commandPath: "codex",
      workingDirectory: "C:/temp/workspace",
    },
  });
  const delegate = provider.buildDelegate();

  assert.equal(delegate.config.command_path, "codex");
  assert.equal(delegate.config.execution_method, "command");
  assert.equal(delegate.config.working_dir, "C:/temp/workspace");
  assert.equal(delegate.config.skip_git_repo_check, true);
  assert.equal(delegate.config.approval_policy, "never");
});

test("local judge provider delegates to copilot, pi, and opencode configs", () => {
  const copilotProvider = new LocalJudgeProvider({
    config: {
      adapter: "copilot-cli",
      provider_id: "skill-arena:judge:copilot-cli",
      model: "gpt-5",
    },
  });
  const piProvider = new LocalJudgeProvider({
    config: {
      adapter: "pi",
      provider_id: "skill-arena:judge:pi",
      model: "github-copilot/gpt-5-mini",
    },
  });
  const opencodeProvider = new LocalJudgeProvider({
    config: {
      adapter: "opencode",
      provider_id: "skill-arena:judge:opencode",
      model: "openai/gpt-5",
    },
  });

  assert.equal(copilotProvider.buildDelegate().config.command_path, "copilot");
  assert.equal(copilotProvider.buildDelegate().config.model, "gpt-5");
  assert.equal(piProvider.buildDelegate().config.command_path, "pi");
  assert.equal(piProvider.buildDelegate().config.model, "github-copilot/gpt-5-mini");
  assert.equal(opencodeProvider.buildDelegate().config.command_path, "opencode");
  assert.equal(opencodeProvider.buildDelegate().config.model, "openai/gpt-5");
});

test("local judge provider exposes ids and forwards callApi to the delegate", async () => {
  const provider = new LocalJudgeProvider({
    id: "custom-local-judge",
    config: {
      provider_id: "skill-arena:judge:copilot-cli",
    },
  });

  assert.equal(provider.id(), "skill-arena:judge:copilot-cli");
  assert.equal(new LocalJudgeProvider({ id: "fallback-id" }).id(), "fallback-id");
  assert.equal(new LocalJudgeProvider().id(), "local-judge-provider");

  const abortController = new AbortController();
  provider.buildDelegate = () => ({
    callApi: async (prompt, context, callOptions) => ({
      output: `${prompt}:${context.variantId}:${String(callOptions.abortSignal.aborted)}`,
    }),
  });

  const response = await provider.callApi(
    "grade this",
    { variantId: "baseline" },
    { abortSignal: abortController.signal },
  );

  assert.deepEqual(response, {
    output: "grade this:baseline:false",
  });
});

test("local judge provider rejects unsupported adapters", () => {
  const provider = new LocalJudgeProvider({
    config: {
      adapter: "unsupported",
    },
  });

  assert.throws(() => provider.buildDelegate(), /Unsupported local judge adapter "unsupported"\./);
});
