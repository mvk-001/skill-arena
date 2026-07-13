#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

export const DEFAULT_POLICY = Object.freeze({
  minimumPrompts: 4,
  minimumTaskFamilies: 3,
  minimumNaturalisticCases: 2,
  requiredCaseKinds: ["naturalistic-forward", "generalization"],
  minimalityCaseKinds: [
    "naturalistic-forward",
    "generalization",
    "boundary-recovery",
    "routing-control",
  ],
  maximumPromptWords: 80,
  maximumPairwiseJaccard: 0.55,
  maximumSingleFamilyShare: 0.5,
  forbiddenPromptPatterns: [
    {
      pattern: "schemaVersion|task\\.prompts|comparison\\.(?:profiles|variants|skillModes)|capabilities\\.(?:skills|agents|hooks)|sandboxMode|skillPath|install\\.strategy",
      flags: "i",
      reason: "task prompts must not reproduce the compare schema or evaluator implementation",
    },
    {
      pattern: "(?:first action|run exactly|after the commands finish|read .*references? needed)",
      flags: "i",
      reason: "naturalistic prompts must not prescribe the skill workflow",
    },
    {
      pattern: "```",
      reason: "naturalistic prompts must not embed command recipes",
    },
  ],
});

export function extractPromptRows(yamlText) {
  const lines = String(yamlText).replace(/\r\n/g, "\n").split("\n");
  const taskIndex = lines.findIndex((line) => line === "task:");
  if (taskIndex === -1) {
    return [];
  }

  const promptsIndex = lines.findIndex(
    (line, index) => index > taskIndex && line === "  prompts:",
  );
  if (promptsIndex === -1) {
    return [];
  }

  const rows = [];
  let current = null;
  for (let index = promptsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*$/.test(line)) {
      break;
    }

    const rowMatch = line.match(/^    - id:\s*(.+?)\s*$/);
    if (rowMatch) {
      if (current) {
        rows.push(current);
      }
      current = { id: parseScalar(rowMatch[1]), description: "", prompt: "" };
      continue;
    }

    if (!current) {
      continue;
    }

    const fieldMatch = line.match(/^      (description|prompt):\s*(.*?)\s*$/);
    if (!fieldMatch) {
      continue;
    }

    const [, field, rawValue] = fieldMatch;
    if (/^[>|][+-]?$/.test(rawValue)) {
      const blockLines = [];
      while (index + 1 < lines.length && /^        (?:\S|\s*$)/.test(lines[index + 1])) {
        index += 1;
        blockLines.push(lines[index].slice(8));
      }
      current[field] = rawValue.startsWith(">")
        ? blockLines.join(" ").replace(/\s+/g, " ").trim()
        : blockLines.join("\n").trim();
    } else {
      current[field] = parseScalar(rawValue);
    }
  }

  if (current) {
    rows.push(current);
  }
  return rows;
}

export function validateEvaluationDesign({ evaluationText, coverage }) {
  const prompts = extractPromptRows(evaluationText);
  const policy = mergePolicy(coverage?.policy);
  const cases = Array.isArray(coverage?.cases) ? coverage.cases : [];
  const errors = [];

  if (prompts.length < policy.minimumPrompts) {
    errors.push(
      `Expected at least ${policy.minimumPrompts} prompts, found ${prompts.length}.`,
    );
  }

  const promptIds = prompts.map((prompt) => prompt.id);
  const caseIds = cases.map((entry) => entry.promptId);
  const missingCases = promptIds.filter((id) => !caseIds.includes(id));
  const unknownCases = caseIds.filter((id) => !promptIds.includes(id));
  if (missingCases.length > 0) {
    errors.push(`Coverage is missing prompt ids: ${missingCases.join(", ")}.`);
  }
  if (unknownCases.length > 0) {
    errors.push(`Coverage references unknown prompt ids: ${unknownCases.join(", ")}.`);
  }

  const families = cases.map((entry) => entry.taskFamily).filter(Boolean);
  const uniqueFamilies = new Set(families);
  if (uniqueFamilies.size < policy.minimumTaskFamilies) {
    errors.push(
      `Expected at least ${policy.minimumTaskFamilies} task families, found ${uniqueFamilies.size}.`,
    );
  }

  for (const requiredKind of policy.requiredCaseKinds) {
    if (!cases.some((entry) => entry.caseKind === requiredKind)) {
      errors.push(`Coverage is missing required case kind: ${requiredKind}.`);
    }
  }

  const naturalisticCount = cases.filter(
    (entry) => entry.caseKind === "naturalistic-forward",
  ).length;
  if (naturalisticCount < policy.minimumNaturalisticCases) {
    errors.push(
      `Expected at least ${policy.minimumNaturalisticCases} naturalistic-forward cases, found ${naturalisticCount}.`,
    );
  }

  if (families.length > 0) {
    const familyCounts = countValues(families);
    const [largestFamily, largestCount] = [...familyCounts.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];
    const share = largestCount / families.length;
    if (share > policy.maximumSingleFamilyShare) {
      errors.push(
        `Task family ${largestFamily} occupies ${(share * 100).toFixed(1)}% of cases; maximum is ${(policy.maximumSingleFamilyShare * 100).toFixed(1)}%.`,
      );
    }
  }

  const casesByPromptId = new Map(cases.map((entry) => [entry.promptId, entry]));
  const minimalityKinds = new Set(policy.minimalityCaseKinds);
  for (const prompt of prompts) {
    const coverageCase = casesByPromptId.get(prompt.id);
    if (!coverageCase || !minimalityKinds.has(coverageCase.caseKind)) {
      continue;
    }

    const wordCount = countWords(prompt.prompt);
    if (wordCount > policy.maximumPromptWords) {
      errors.push(
        `Prompt ${prompt.id} has ${wordCount} words; maximum is ${policy.maximumPromptWords}.`,
      );
    }

    for (const rule of policy.forbiddenPromptPatterns) {
      const expression = new RegExp(rule.pattern, rule.flags ?? "");
      if (expression.test(prompt.prompt)) {
        errors.push(`Prompt ${prompt.id}: ${rule.reason ?? `forbidden pattern ${rule.pattern}`}.`);
      }
    }
  }

  for (let leftIndex = 0; leftIndex < prompts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < prompts.length; rightIndex += 1) {
      const similarity = jaccard(prompts[leftIndex].prompt, prompts[rightIndex].prompt);
      if (similarity > policy.maximumPairwiseJaccard) {
        errors.push(
          `Prompts ${prompts[leftIndex].id} and ${prompts[rightIndex].id} have Jaccard similarity ${similarity.toFixed(3)}; maximum is ${policy.maximumPairwiseJaccard}.`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      promptCount: prompts.length,
      taskFamilyCount: uniqueFamilies.size,
      caseKinds: [...new Set(cases.map((entry) => entry.caseKind).filter(Boolean))].sort(),
      maximumPromptWords: Math.max(0, ...prompts.map((prompt) => countWords(prompt.prompt))),
      maximumPairwiseJaccard: maximumPairwiseJaccard(prompts),
    },
  };
}

function mergePolicy(policy = {}) {
  return {
    ...DEFAULT_POLICY,
    ...policy,
    requiredCaseKinds: policy.requiredCaseKinds ?? DEFAULT_POLICY.requiredCaseKinds,
    minimalityCaseKinds: policy.minimalityCaseKinds ?? DEFAULT_POLICY.minimalityCaseKinds,
    forbiddenPromptPatterns:
      policy.forbiddenPromptPatterns ?? DEFAULT_POLICY.forbiddenPromptPatterns,
  };
}

function parseScalar(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    if (trimmed.startsWith("'")) {
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function countWords(value) {
  return String(value).trim().split(/\s+/).filter(Boolean).length;
}

function normalizedTokens(value) {
  return new Set(
    (String(value).toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? [])
      .filter((token) => token.length >= 4),
  );
}

function jaccard(left, right) {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

function maximumPairwiseJaccard(prompts) {
  let maximum = 0;
  for (let leftIndex = 0; leftIndex < prompts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < prompts.length; rightIndex += 1) {
      maximum = Math.max(maximum, jaccard(prompts[leftIndex].prompt, prompts[rightIndex].prompt));
    }
  }
  return Number(maximum.toFixed(3));
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function runCli() {
  const [evaluationPath, ...args] = process.argv.slice(2);
  const coverageIndex = args.indexOf("--coverage");
  const coveragePath = coverageIndex === -1 ? null : args[coverageIndex + 1];
  if (!evaluationPath || !coveragePath) {
    console.error(
      "Usage: node scripts/validate-evaluation-design.js <evaluation.yaml> --coverage <prompt-coverage.json>",
    );
    process.exit(1);
  }

  const result = validateEvaluationDesign({
    evaluationText: fs.readFileSync(evaluationPath, "utf8"),
    coverage: JSON.parse(fs.readFileSync(coveragePath, "utf8")),
  });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }
  console.log(JSON.stringify(result.summary, null, 2));
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  runCli();
}
