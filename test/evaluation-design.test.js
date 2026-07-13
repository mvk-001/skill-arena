import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { fromProjectRoot } from "../src/project-paths.js";
import {
  extractPromptRows,
  validateEvaluationDesign,
} from "../skills/skill-arena-config-author/scripts/validate-evaluation-design.js";

const execFileAsync = promisify(execFile);

function evaluationYaml(prompts) {
  return [
    "schemaVersion: 1",
    "task:",
    "  prompts:",
    ...prompts.flatMap(({ id, prompt }) => [
      `    - id: ${id}`,
      "      prompt: >-",
      `        ${prompt}`,
    ]),
    "workspace:",
    "  sources: []",
  ].join("\n");
}

function coverage(cases, policy = {}) {
  return {
    schemaVersion: 1,
    policy: {
      minimumPrompts: 4,
      minimumTaskFamilies: 3,
      minimumNaturalisticCases: 2,
      maximumPromptWords: 40,
      maximumPairwiseJaccard: 0.55,
      maximumSingleFamilyShare: 0.5,
      ...policy,
    },
    cases,
  };
}

const passingPrompts = [
  { id: "summary", prompt: "Summarize the repository architecture in output/summary.md." },
  { id: "extract", prompt: "Extract invoice totals from documents/invoice.html as JSON." },
  { id: "repair", prompt: "Repair the invalid links in docs/index.md and preserve headings." },
  { id: "boundary", prompt: "Report unreadable image inputs without creating fabricated results." },
];

const passingCases = [
  { promptId: "summary", caseKind: "naturalistic-forward", taskFamily: "summarization" },
  { promptId: "extract", caseKind: "naturalistic-forward", taskFamily: "extraction" },
  { promptId: "repair", caseKind: "generalization", taskFamily: "documentation" },
  { promptId: "boundary", caseKind: "boundary-recovery", taskFamily: "extraction" },
];

test("evaluation design parser extracts folded prompt rows without reading assertions", () => {
  const rows = extractPromptRows(evaluationYaml(passingPrompts));
  assert.deepEqual(rows.map((row) => row.id), passingPrompts.map((prompt) => prompt.id));
  assert.equal(rows[0].prompt, passingPrompts[0].prompt);
});

test("evaluation design parser handles missing sections and quoted or literal scalars", () => {
  assert.deepEqual(extractPromptRows("schemaVersion: 1\nworkspace:\n"), []);
  assert.deepEqual(extractPromptRows("task:\n  prompt: One task.\nworkspace:\n"), []);

  const rows = extractPromptRows([
    "task:",
    "  prompts:",
    "    # prompt rows follow",
    "    - id: 'quoted-id'",
    "      description: \"Quoted description\"",
    "      prompt: |",
    "        First line.",
    "        Second line.",
    "    - id: plain-id",
    "      prompt: \"bad\\q\"",
    "workspace:",
  ].join("\n"));
  assert.equal(rows[0].id, "quoted-id");
  assert.equal(rows[0].description, "Quoted description");
  assert.equal(rows[0].prompt, "First line.\nSecond line.");
  assert.equal(rows[1].prompt, "bad\\q");
});

test("evaluation design audit accepts a minimal and varied prompt corpus", () => {
  const result = validateEvaluationDesign({
    evaluationText: evaluationYaml(passingPrompts),
    coverage: coverage(passingCases),
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.promptCount, 4);
  assert.equal(result.summary.taskFamilyCount, 3);
});

test("evaluation design CLI validates files and prints a compact summary", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-evaluation-design-"));
  const evaluationPath = path.join(tempDirectory, "evaluation.yaml");
  const coveragePath = path.join(tempDirectory, "prompt-coverage.json");
  fs.writeFileSync(evaluationPath, evaluationYaml(passingPrompts), "utf8");
  fs.writeFileSync(coveragePath, JSON.stringify(coverage(passingCases)), "utf8");

  const scriptPath = fromProjectRoot(
    "skills",
    "skill-arena-config-author",
    "scripts",
    "validate-evaluation-design.js",
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [scriptPath, evaluationPath, "--coverage", coveragePath],
  );
  const summary = JSON.parse(stdout);
  assert.equal(summary.promptCount, 4);
  assert.equal(summary.taskFamilyCount, 3);
});

test("evaluation design audit rejects evaluator and workflow leakage in naturalistic prompts", () => {
  const leakingPrompts = passingPrompts.map((prompt) => ({ ...prompt }));
  leakingPrompts[0].prompt =
    "First action: read the skill references needed, then set comparison.profiles and sandboxMode exactly.";
  const result = validateEvaluationDesign({
    evaluationText: evaluationYaml(leakingPrompts),
    coverage: coverage(passingCases),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /must not reproduce the compare schema/i.test(error)));
  assert.ok(result.errors.some((error) => /must not prescribe the skill workflow/i.test(error)));
});

test("evaluation design audit rejects narrow and repetitive coverage", () => {
  const repetitivePrompts = [
    { id: "one", prompt: "Summarize the same repository architecture as Markdown." },
    { id: "two", prompt: "Summarize the same repository architecture as JSON." },
    { id: "three", prompt: "Summarize the same repository architecture as plain text." },
    { id: "four", prompt: "Summarize the same repository architecture as a table." },
  ];
  const repetitiveCases = repetitivePrompts.map((prompt, index) => ({
    promptId: prompt.id,
    caseKind: index < 2 ? "naturalistic-forward" : index === 2 ? "generalization" : "boundary-recovery",
    taskFamily: "summarization",
  }));
  const result = validateEvaluationDesign({
    evaluationText: evaluationYaml(repetitivePrompts),
    coverage: coverage(repetitiveCases),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /task families/i.test(error)));
  assert.ok(result.errors.some((error) => /Jaccard similarity/i.test(error)));
});

test("evaluation design audit reports incomplete coverage and policy violations together", () => {
  const prompts = [
    { id: "one", prompt: "Set schemaVersion and comparison.profiles exactly for this excessively long evaluator recipe." },
    { id: "two", prompt: "" },
  ];
  const result = validateEvaluationDesign({
    evaluationText: evaluationYaml(prompts),
    coverage: coverage([
      { promptId: "one", caseKind: "naturalistic-forward", taskFamily: "authoring" },
      { promptId: "unknown", caseKind: "contract-smoke", taskFamily: "authoring" },
    ], {
      maximumPromptWords: 4,
      maximumSingleFamilyShare: 0.4,
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /at least 4 prompts/i.test(error)));
  assert.ok(result.errors.some((error) => /missing prompt ids: two/i.test(error)));
  assert.ok(result.errors.some((error) => /unknown prompt ids: unknown/i.test(error)));
  assert.ok(result.errors.some((error) => /required case kind: generalization/i.test(error)));
  assert.ok(result.errors.some((error) => /at least 2 naturalistic-forward/i.test(error)));
  assert.ok(result.errors.some((error) => /maximum is 4/i.test(error)));
  assert.ok(result.errors.some((error) => /occupies 100\.0%/i.test(error)));
  assert.equal(result.summary.maximumPairwiseJaccard, 0);
});

test("evaluation design CLI exits non-zero for a leaking corpus", async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-evaluation-design-fail-"));
  const evaluationPath = path.join(tempDirectory, "evaluation.yaml");
  const coveragePath = path.join(tempDirectory, "prompt-coverage.json");
  const leakingPrompts = passingPrompts.map((prompt) => ({ ...prompt }));
  leakingPrompts[0].prompt = "Run exactly the validator command before doing the task.";
  fs.writeFileSync(evaluationPath, evaluationYaml(leakingPrompts), "utf8");
  fs.writeFileSync(coveragePath, JSON.stringify(coverage(passingCases)), "utf8");
  const scriptPath = fromProjectRoot(
    "skills",
    "skill-arena-config-author",
    "scripts",
    "validate-evaluation-design.js",
  );
  await assert.rejects(
    () => execFileAsync(process.execPath, [scriptPath, evaluationPath, "--coverage", coveragePath]),
    /must not prescribe the skill workflow/i,
  );
});

test("maintained config-author evaluation passes its prompt coverage policy", () => {
  const evaluationPath = fromProjectRoot(
    "evaluations",
    "skill-arena-config-author",
    "evaluation.yaml",
  );
  const coveragePath = path.join(path.dirname(evaluationPath), "prompt-coverage.json");
  const result = validateEvaluationDesign({
    evaluationText: fs.readFileSync(evaluationPath, "utf8"),
    coverage: JSON.parse(fs.readFileSync(coveragePath, "utf8")),
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.promptCount, 8);
  assert.equal(result.summary.taskFamilyCount, 8);
});

test("config-author bundle and base workspace do not embed a benchmark answer", () => {
  const roots = [
    fromProjectRoot("skills", "skill-arena-config-author"),
    fromProjectRoot("evaluations", "skill-arena-config-author", "fixtures", "workspaces", "base"),
  ];
  const forbidden = /gws-calendar-agenda|today-json|week-markdown|benchmark-specific offline recipe/i;
  const offendingFiles = [];

  for (const root of roots) {
    for (const filePath of listFiles(root)) {
      if (forbidden.test(fs.readFileSync(filePath, "utf8"))) {
        offendingFiles.push(path.relative(fromProjectRoot(), filePath));
      }
    }
  }

  assert.deepEqual(offendingFiles, []);
});

function listFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}
