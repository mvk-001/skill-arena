#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSkillsRoot = path.join(projectRoot, "skills");

export const EXPECTED_SKILLS = Object.freeze([
  "harbor-evolve-skill",
  "harbor-maximize-knowledge-expertise",
  "harbor-metaskill-evolution",
  "harbor-operator-coevolution",
  "harbor-organize-evaluations",
  "harbor-population-search",
  "harbor-realize-skill-candidate",
  "harbor-reflective-pareto-search",
  "harbor-resume-external-failures",
  "harbor-run-results",
  "harbor-trace-distillation",
]);

export function checkSkillBundles({
  skillsRoot = defaultSkillsRoot,
  expectedSkills = EXPECTED_SKILLS,
  verifySyntax = true,
} = {}) {
  const root = path.resolve(skillsRoot);
  const errors = [];
  const checkedBundles = [];

  if (!fs.existsSync(root)) {
    return { errors: [`Skills root does not exist: ${root}`], checkedBundles };
  }

  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && listEntries(path.join(root, entry.name)).length > 0)
    .map((entry) => ({ name: entry.name, root: path.join(root, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (expectedSkills) {
    const observed = new Set(candidates.map(({ name }) => name));
    for (const name of expectedSkills) {
      if (!observed.has(name)) errors.push(`Missing maintained skill: ${name}`);
    }
    for (const name of observed) {
      if (!expectedSkills.includes(name)) errors.push(`Unexpected skill directory: ${name}`);
    }
  }

  const pythonFiles = [];
  for (const candidate of candidates) {
    const skillPath = path.join(candidate.root, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      errors.push(`${candidate.name}: missing SKILL.md`);
      continue;
    }

    checkedBundles.push(candidate.name);
    validateFrontmatter(candidate, fs.readFileSync(skillPath, "utf8"), errors);

    for (const entry of listEntries(candidate.root)) {
      if (entry.kind === "symlink") {
        errors.push(`${candidate.name}/${relative(candidate.root, entry.path)} is a symbolic link`);
        continue;
      }
      if (path.extname(entry.path).toLowerCase() === ".md") {
        validateMarkdown(candidate, entry.path, errors);
      }
      if (path.extname(entry.path).toLowerCase() === ".py") {
        pythonFiles.push(entry.path);
      }
    }
  }

  if (verifySyntax && pythonFiles.length > 0) {
    validatePythonSyntax(pythonFiles, errors);
  }

  return { errors, checkedBundles };
}

function validateFrontmatter(candidate, markdown, errors) {
  const block = markdown.match(/^---\r?\n(?<body>[\s\S]*?)\r?\n---(?:\r?\n|$)/)?.groups.body;
  if (!block) {
    errors.push(`${candidate.name}/SKILL.md: missing YAML frontmatter`);
    return;
  }
  const declared = block.match(/^name:\s*(?<name>[^\r\n]+)\s*$/m)?.groups.name
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  if (declared !== candidate.name) {
    errors.push(`${candidate.name}/SKILL.md: frontmatter name ${declared ?? "<missing>"} does not match directory`);
  }
}

function validateMarkdown(candidate, filePath, errors) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const repositoryPath = /(?:^|[^A-Za-z0-9_-])skills[\\/]harbor-[a-z0-9-]+/m;
  if (repositoryPath.test(markdown)) {
    errors.push(`${candidate.name}/${relative(candidate.root, filePath)} contains a repository-root Harbor skill path`);
  }

  for (const link of [...extractMarkdownLinks(markdown), ...extractHtmlLinks(markdown)]) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link.target)) continue;
    const rawPath = link.target.split("#", 1)[0].split("?", 1)[0];
    if (!rawPath) continue;

    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      errors.push(`${candidate.name}/${relative(candidate.root, filePath)}:${link.line} has an invalid link`);
      continue;
    }

    const target = path.resolve(path.dirname(filePath), decoded);
    if (!isInside(candidate.root, target)) {
      errors.push(`${candidate.name}/${relative(candidate.root, filePath)}:${link.line} escapes the bundle through ${link.target}`);
    } else if (!fs.existsSync(target)) {
      errors.push(`${candidate.name}/${relative(candidate.root, filePath)}:${link.line} points to missing path ${link.target}`);
    }
  }
}

function validatePythonSyntax(files, errors) {
  const code = "from pathlib import Path; import sys; [compile(Path(p).read_bytes(), p, 'exec') for p in sys.argv[1:]]";
  const result = spawnSync(process.env.PYTHON ?? "python", ["-c", code, ...files], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    errors.push(`Python syntax check failed: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
  }
}

function listEntries(root) {
  const entries = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) entries.push({ kind: "symlink", path: entryPath });
    else if (entry.isDirectory()) entries.push(...listEntries(entryPath));
    else if (entry.isFile()) entries.push({ kind: "file", path: entryPath });
  }
  return entries;
}

function extractMarkdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\((?<target><[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)]
    .map((match) => ({
      target: match.groups.target.replace(/^<|>$/g, ""),
      line: lineAt(markdown, match.index),
    }));
}

function extractHtmlLinks(markdown) {
  return [...markdown.matchAll(/\b(?:href|src)=["'](?<target>[^"']+)["']/gi)]
    .map((match) => ({ target: match.groups.target, line: lineAt(markdown, match.index) }));
}

function isInside(root, target) {
  const value = path.relative(path.resolve(root), path.resolve(target));
  return value === "" || (value !== ".." && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value));
}

function relative(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function printResult(result) {
  if (result.errors.length > 0) {
    console.error("Harbor skill bundle check failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`Harbor skill bundle check passed (${result.checkedBundles.length} bundles).`);
  return 0;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const index = process.argv.indexOf("--skills-root");
  const skillsRoot = index >= 0 ? process.argv[index + 1] : defaultSkillsRoot;
  if (!skillsRoot) {
    console.error("Missing value for --skills-root");
    process.exit(1);
  }
  process.exit(printResult(checkSkillBundles({ skillsRoot })));
}
