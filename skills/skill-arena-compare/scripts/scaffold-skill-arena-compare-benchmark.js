#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const outputPath = args.find((arg) => !arg.startsWith("--"));
const writeToStdout = args.includes("--stdout");
const shouldValidate = args.includes("--validate");
const defaultOutputPath = "deliverables/compare.yaml";

const yaml = `schemaVersion: 1
benchmark:
  id: gws-calendar-agenda-compare-generated
  description: Compare Codex mini on Google Calendar agenda requests with and without the remote gws-calendar-agenda skill.
  tags:
    - compare
    - calendar
    - gws
    - codex
task:
  prompts:
    - id: today-json
      prompt: Return today's agenda across all calendars. Prefer \`gws calendar +agenda\` in read-only mode. Return JSON only.
      evaluation:
        assertions:
          - type: is-json
    - id: week-markdown
      prompt: Return this week's agenda across all calendars. Prefer \`gws calendar +agenda\` in read-only mode. Return Markdown only.
      evaluation:
        assertions:
          - type: regex
            value: "(?m)^(#|[-*] )"
workspace:
  sources:
    - type: local-path
      path: fixtures/gws-calendar-agenda-compare/base
      target: /
  setup:
    initializeGit: true
evaluation:
  assertions:
    - type: llm-rubric
      provider: skill-arena:judge:codex
      value: Score 1.0 only if the answer is raw YAML for a valid Skill Arena compare config that compares no-skill versus skill for the remote gws-calendar-agenda skill, uses the required runtime-relative workspace path, keeps exactly two prompt rows with JSON-only and Markdown-only contracts, and uses only supported Skill Arena compare schema keys and assertion types.
  requests: 2
  timeoutMs: 1200000
  tracing: false
  maxConcurrency: 1
  noCache: true
comparison:
  skillModes:
    - id: no-skill
      description: Baseline without the skill.
      skillMode: disabled
    - id: skill
      description: Skill-enabled run.
      skillMode: enabled
      skill:
        source:
          type: git
          repo: https://github.com/googleworkspace/cli.git
          ref: main
          subpath: .
          skillPath: skills/gws-calendar-agenda
          skillId: gws-calendar-agenda
        install:
          strategy: workspace-overlay
  variants:
    - id: codex-mini
      description: Codex mini comparison variant.
      agent:
        adapter: codex
        model: gpt-5.1-codex-mini
        executionMethod: command
        commandPath: codex
        sandboxMode: danger-full-access
        approvalPolicy: never
        webSearchEnabled: false
        networkAccessEnabled: true
        reasoningEffort: low
        additionalDirectories: []
        cliEnv: {}
        config: {}
      output:
        labels:
          variantDisplayName: codex mini
`;

if (writeToStdout) {
  process.stdout.write(yaml);
} else {
  const resolvedOutputPath = path.resolve(
    process.cwd(),
    outputPath ?? defaultOutputPath,
  );
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, yaml);
  console.log(`Wrote benchmark compare scaffold to ${resolvedOutputPath}`);
}

if (shouldValidate) {
  const validateTargetPath =
    !writeToStdout
      ? path.resolve(process.cwd(), outputPath ?? defaultOutputPath)
      : createTemporaryFile(yaml);

  const validatorPath = path.resolve(
    process.cwd(),
    "skills/skill-arena-compare/scripts/validate-compare-output.js",
  );
  const result = spawnSync(
    process.execPath,
    [validatorPath, validateTargetPath, "--benchmark", "skill-arena-compare"],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function createTemporaryFile(content) {
  const tempDir = path.resolve(
    process.cwd(),
    "skills/skill-arena-compare/.tmp",
  );
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, "gws-calendar-agenda-compare.generated.yaml");
  fs.writeFileSync(tempPath, content);
  return tempPath;
}
