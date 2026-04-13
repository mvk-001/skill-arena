#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DEFAULTS = {
  benchmark: "skill-arena-compare",
  brief: "docs/benchmark-brief.md",
  output: "deliverables/compare.yaml",
  piCommand: "pi",
  piModel: "github-copilot/gpt-5-mini",
  repairAttempts: 2,
};

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const skillDirectory = path.resolve(scriptDirectory, "..");
  const benchmarkId = options.benchmark ?? DEFAULTS.benchmark;
  const briefPath = path.resolve(process.cwd(), options.brief ?? DEFAULTS.brief);
  const outputPath = path.resolve(process.cwd(), options.output ?? DEFAULTS.output);
  const recipe = JSON.parse(
    fs.readFileSync(
      path.join(skillDirectory, "assets", "recipes", `${benchmarkId}.json`),
      "utf8",
    ),
  );
  const templatePath = path.join(
    skillDirectory,
    "assets",
    "templates",
    `${benchmarkId}.yaml.template`,
  );
  const templateText = fs.readFileSync(templatePath, "utf8").replace(/\r\n/g, "\n");
  const briefText = fs.readFileSync(briefPath, "utf8").replace(/\r\n/g, "\n");
  const validatorPath = path.join(scriptDirectory, "validate-compare-output.js");
  const logDirectory = path.join(path.dirname(outputPath), ".skill-arena-compare-batch");
  const logPath = path.join(logDirectory, "run.log");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(logDirectory, { recursive: true });
  ensureLocalSkillArenaShim({
    workspaceRoot: process.cwd(),
    benchmarkId,
  });

  const state = {
    todayPrompt: recipe.defaults.todayPrompt,
    weekPrompt: recipe.defaults.weekPrompt,
    sharedRubric: recipe.defaults.sharedRubric,
    weekRegex: recipe.defaults.weekRegex,
  };

  log(logPath, `benchmark=${benchmarkId}`);
  log(logPath, `brief=${briefPath}`);
  log(logPath, `output=${outputPath}`);

  const promptDraft = runPiStage({
    skillDirectory,
    piCommand: options.piCommand ?? DEFAULTS.piCommand,
    piModel: options.piModel ?? DEFAULTS.piModel,
    systemPromptName: "01-design-prompts.txt",
    userPrompt: buildPromptDesignPrompt({ recipe, briefText }),
    logPath,
  });

  if (promptDraft && isValidPrompt(promptDraft.todayPrompt, "json")) {
    state.todayPrompt = normalizeWhitespace(promptDraft.todayPrompt);
  }
  if (promptDraft && isValidPrompt(promptDraft.weekPrompt, "markdown")) {
    state.weekPrompt = normalizeWhitespace(promptDraft.weekPrompt);
  }

  const evaluationDraft = runPiStage({
    skillDirectory,
    piCommand: options.piCommand ?? DEFAULTS.piCommand,
    piModel: options.piModel ?? DEFAULTS.piModel,
    systemPromptName: "02-design-evaluation.txt",
    userPrompt: buildEvaluationPrompt({ recipe, briefText, state }),
    logPath,
  });

  if (
    evaluationDraft
    && typeof evaluationDraft.sharedRubric === "string"
    && evaluationDraft.sharedRubric.includes("raw YAML")
    && evaluationDraft.sharedRubric.includes("gws-calendar-agenda")
  ) {
    state.sharedRubric = normalizeWhitespace(evaluationDraft.sharedRubric);
  }

  let rendered = renderTemplate(templateText, state);
  fs.copyFileSync(templatePath, outputPath);
  fs.writeFileSync(outputPath, rendered, "utf8");

  const repairAttempts = Number.parseInt(
    options.repairAttempts ?? `${DEFAULTS.repairAttempts}`,
    10,
  );

  for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
    const validation = validateDraft(validatorPath, outputPath, benchmarkId);
    if (validation.ok) {
      verifyWithLocalNpx(outputPath, logPath);
      const finalYaml = fs.readFileSync(outputPath, "utf8");
      if (options.printFinal) {
        process.stdout.write(finalYaml);
      }
      process.exit(0);
    }

    log(logPath, `validation failed on attempt ${attempt + 1}: ${validation.message}`);

    if (attempt === repairAttempts) {
      break;
    }

    const repairDraft = runPiStage({
      skillDirectory,
      piCommand: options.piCommand ?? DEFAULTS.piCommand,
      piModel: options.piModel ?? DEFAULTS.piModel,
      systemPromptName: "03-repair-draft.txt",
      userPrompt: buildRepairPrompt({
        recipe,
        briefText,
        validationErrors: validation.message,
        currentDraft: rendered,
        state,
      }),
      logPath,
    });

    if (repairDraft) {
      if (isValidPrompt(repairDraft.todayPrompt, "json")) {
        state.todayPrompt = normalizeWhitespace(repairDraft.todayPrompt);
      }
      if (isValidPrompt(repairDraft.weekPrompt, "markdown")) {
        state.weekPrompt = normalizeWhitespace(repairDraft.weekPrompt);
      }
      if (
        typeof repairDraft.sharedRubric === "string"
        && repairDraft.sharedRubric.includes("raw YAML")
        && repairDraft.sharedRubric.includes("gws-calendar-agenda")
      ) {
        state.sharedRubric = normalizeWhitespace(repairDraft.sharedRubric);
      }
    } else {
      state.todayPrompt = recipe.defaults.todayPrompt;
      state.weekPrompt = recipe.defaults.weekPrompt;
      state.sharedRubric = recipe.defaults.sharedRubric;
    }

    rendered = renderTemplate(templateText, state);
    fs.writeFileSync(outputPath, rendered, "utf8");
  }

  process.stderr.write(`Failed to generate a valid compare.yaml.\nSee ${logPath}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      continue;
    }

    const key = argument
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return options;
}

function runPiStage({
  skillDirectory,
  piCommand,
  piModel,
  systemPromptName,
  userPrompt,
  logPath,
}) {
  const systemPrompt = fs.readFileSync(
    path.join(skillDirectory, "assets", "system-prompts", systemPromptName),
    "utf8",
  );
  const result = spawnSync(
    piCommand,
    [
      "--model",
      piModel,
      "--system-prompt",
      systemPrompt,
      "--no-session",
      "--no-tools",
      "--thinking",
      "low",
      "--mode",
      "text",
      "-p",
      userPrompt,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    log(logPath, `${systemPromptName} failed: ${result.stderr || result.stdout}`);
    return null;
  }

  const parsed = parseJsonObject(result.stdout);
  if (!parsed) {
    log(logPath, `${systemPromptName} returned invalid JSON: ${result.stdout}`);
  }
  return parsed;
}

function buildPromptDesignPrompt({ recipe, briefText }) {
  return [
    "Design only the two task prompt strings for the compare file.",
    "Return strict JSON with keys todayPrompt and weekPrompt.",
    "Rules:",
    "- todayPrompt must ask for today's agenda across all calendars.",
    "- weekPrompt must ask for this week's agenda across all calendars.",
    "- Both prompts must explicitly prefer `gws calendar +agenda` in read-only mode.",
    "- todayPrompt must contain the exact phrase `Return JSON only.`",
    "- weekPrompt must contain the exact phrase `Return Markdown only.`",
    "- Keep both prompts concise and executable.",
    "",
    `Default today prompt: ${recipe.defaults.todayPrompt}`,
    `Default week prompt: ${recipe.defaults.weekPrompt}`,
    "",
    "Benchmark brief:",
    briefText.trim(),
  ].join("\n");
}

function buildEvaluationPrompt({ recipe, briefText, state }) {
  return [
    "Design only the shared llm-rubric text for the compare file.",
    "Return strict JSON with key sharedRubric.",
    "Rules:",
    "- Keep the rubric to one sentence.",
    "- Score 1.0 only if the answer is raw YAML for a valid compare config.",
    "- Mention no-skill versus skill, the remote gws-calendar-agenda skill, the runtime-relative workspace path, and the JSON-only versus Markdown-only prompt split.",
    "- Do not invent new schema keys.",
    "",
    `Default rubric: ${recipe.defaults.sharedRubric}`,
    `todayPrompt: ${state.todayPrompt}`,
    `weekPrompt: ${state.weekPrompt}`,
    "",
    "Benchmark brief:",
    briefText.trim(),
  ].join("\n");
}

function buildRepairPrompt({
  recipe,
  briefText,
  validationErrors,
  currentDraft,
  state,
}) {
  return [
    "Repair only the named fields that could fix the validator errors.",
    "Return strict JSON with any subset of these keys: todayPrompt, weekPrompt, sharedRubric.",
    "Leave out keys that should stay unchanged.",
    "Do not output YAML.",
    "",
    "Current field values:",
    JSON.stringify(state, null, 2),
    "",
    "Validator errors:",
    validationErrors.trim(),
    "",
    "Current draft:",
    currentDraft.trim(),
    "",
    `Safe fallback todayPrompt: ${recipe.defaults.todayPrompt}`,
    `Safe fallback weekPrompt: ${recipe.defaults.weekPrompt}`,
    `Safe fallback sharedRubric: ${recipe.defaults.sharedRubric}`,
    "",
    "Benchmark brief:",
    briefText.trim(),
  ].join("\n");
}

function renderTemplate(templateText, state) {
  return templateText
    .replace("__TODAY_PROMPT__", toFoldedBlock(state.todayPrompt, 8))
    .replace("__WEEK_PROMPT__", toFoldedBlock(state.weekPrompt, 8))
    .replace("__RUBRIC__", toFoldedBlock(state.sharedRubric, 8))
    .replace("__WEEK_REGEX__", escapeDoubleQuotedYaml(state.weekRegex));
}

function validateDraft(validatorPath, outputPath, benchmarkId) {
  const result = spawnSync(
    process.execPath,
    [validatorPath, outputPath, "--benchmark", benchmarkId],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );

  return {
    ok: result.status === 0,
    message: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function verifyWithLocalNpx(outputPath, logPath) {
  const relativeOutputPath = path.relative(process.cwd(), outputPath) || outputPath;
  const result = spawnSync(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "npx.cmd",
      "skill-arena",
      "compare",
      relativeOutputPath,
      "--dry-run",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    log(logPath, `local npx dry-run failed: ${result.stderr || result.stdout}`);
  } else {
    log(logPath, "local npx dry-run passed");
  }
}

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isValidPrompt(value, format) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = normalizeWhitespace(value);
  const fragments = [
    "across all calendars",
    "gws calendar +agenda",
    "read-only",
  ];

  if (format === "json") {
    fragments.push("today");
    fragments.push("Return JSON only.");
  }

  if (format === "markdown") {
    fragments.push("week");
    fragments.push("Return Markdown only.");
  }

  return fragments.every((fragment) => normalized.includes(fragment));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function toFoldedBlock(value, indentSize) {
  const indent = " ".repeat(indentSize);
  return value
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function escapeDoubleQuotedYaml(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function log(logPath, message) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function fileURLToPath(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

function ensureLocalSkillArenaShim({ workspaceRoot, benchmarkId }) {
  const packageDirectory = path.join(workspaceRoot, "node_modules", "skill-arena");
  const binDirectory = path.join(workspaceRoot, "node_modules", ".bin");
  const binPath = path.join(packageDirectory, "bin", "skill-arena.js");
  const cmdPath = path.join(binDirectory, "skill-arena.cmd");
  fs.mkdirSync(path.dirname(binPath), { recursive: true });
  fs.mkdirSync(binDirectory, { recursive: true });

  fs.writeFileSync(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({
      name: "skill-arena",
      version: "0.0.0-local",
      private: true,
      bin: {
        "skill-arena": "bin/skill-arena.js",
      },
    }, null, 2),
    "utf8",
  );

  const shim = `#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] !== "compare") {
  console.error("Local skill-arena shim only supports: skill-arena compare <file> --dry-run");
  process.exit(1);
}

const compareFile = args[1];
if (!compareFile || !args.includes("--dry-run")) {
  console.error("Local skill-arena shim requires a compare file and --dry-run.");
  process.exit(1);
}

const validatorPath = path.resolve(
  process.cwd(),
  "skills",
  "skill-arena-compare-batch",
  "scripts",
  "validate-compare-output.js",
);
const comparePath = path.resolve(process.cwd(), compareFile);
const result = spawnSync(
  process.execPath,
  [validatorPath, comparePath, "--benchmark", ${JSON.stringify(benchmarkId)}],
  {
    stdio: "inherit",
    cwd: process.cwd(),
    windowsHide: true,
  },
);
process.exit(result.status ?? 1);
`;
  fs.writeFileSync(binPath, shim, "utf8");
  fs.writeFileSync(
    cmdPath,
    `@echo off\r\nnode "%~dp0..\\skill-arena\\bin\\skill-arena.js" %*\r\n`,
    "utf8",
  );
}
