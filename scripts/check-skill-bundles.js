#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { builtinModules } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSkillsRoot = path.join(projectRoot, "skills");
const builtinModuleNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export function checkSkillBundles({ skillsRoot = defaultSkillsRoot, verifySyntax = true } = {}) {
  const absoluteSkillsRoot = path.resolve(skillsRoot);
  const errors = [];
  const warnings = [];
  const checkedBundles = [];
  const skippedScaffolds = [];

  if (!fs.existsSync(absoluteSkillsRoot)) {
    return {
      errors: [`Skills root does not exist: ${absoluteSkillsRoot}`],
      warnings,
      checkedBundles,
      skippedScaffolds,
    };
  }

  const candidates = fs.readdirSync(absoluteSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      root: path.join(absoluteSkillsRoot, entry.name),
    }))
    .filter(({ root }) => listEntries(root).length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));

  const knownSkillNames = new Set(
    candidates
      .filter(({ root }) => fs.existsSync(path.join(root, "SKILL.md")))
      .map(({ name }) => name),
  );

  for (const candidate of candidates) {
    const skillPath = path.join(candidate.root, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      errors.push(`${candidate.name}: non-empty skill directory is missing SKILL.md`);
      continue;
    }

    const skillMarkdown = fs.readFileSync(skillPath, "utf8");
    if (isScaffold(skillMarkdown)) {
      skippedScaffolds.push(candidate.name);
      warnings.push(`${candidate.name}: skipped unfinished TODO scaffold`);
      continue;
    }

    checkedBundles.push(candidate.name);
    validateBundle(candidate, skillMarkdown, knownSkillNames, errors, verifySyntax);
  }

  return { errors, warnings, checkedBundles, skippedScaffolds };
}

function validateBundle(candidate, skillMarkdown, knownSkillNames, errors, verifySyntax) {
  validateFrontmatter(candidate, skillMarkdown, errors);

  const entries = listEntries(candidate.root);
  const files = entries.filter((entry) => entry.kind === "file");

  for (const entry of entries) {
    if (entry.kind === "symlink") {
      errors.push(`${formatLocation(candidate, entry.path)} is a symbolic link; bundles must contain their files directly`);
    }
  }

  const packageJson = readPackageJson(candidate, files, errors);
  const dependencyContract = readDependencyContract(candidate, errors);

  for (const file of files) {
    const extension = path.extname(file.path).toLowerCase();
    if (extension === ".md") {
      validateMarkdown(candidate, file.path, knownSkillNames, dependencyContract, errors);
    }
    if ([".js", ".mjs", ".cjs"].includes(extension)) {
      validateJavaScript(candidate, file.path, packageJson, dependencyContract, errors);
    }
  }

  if (verifySyntax) {
    validateCopiedSyntax(candidate, files, errors);
  }
}

function readDependencyContract(candidate, errors) {
  const contractPath = path.join(candidate.root, "skill-dependencies.json");
  if (!fs.existsSync(contractPath)) {
    return {
      classification: "atomic",
      packages: new Set(),
      repositoryModules: new Set(),
      siblingSkills: new Set(),
      repositoryRoot: false,
    };
  }

  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    if (!["composite", "orchestrator"].includes(contract.classification)) {
      errors.push(`${candidate.name}/skill-dependencies.json: classification must be composite or orchestrator`);
    }
    return {
      classification: contract.classification,
      packages: new Set(contract.packages ?? []),
      repositoryModules: new Set(contract.repositoryModules ?? []),
      siblingSkills: new Set(contract.siblingSkills ?? []),
      repositoryRoot: contract.repositoryRoot === true,
    };
  } catch (error) {
    errors.push(`${candidate.name}/skill-dependencies.json: invalid JSON (${error.message})`);
    return {
      classification: "invalid",
      packages: new Set(),
      repositoryModules: new Set(),
      siblingSkills: new Set(),
      repositoryRoot: false,
    };
  }
}

function validateFrontmatter(candidate, markdown, errors) {
  const match = markdown.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    errors.push(`${candidate.name}/SKILL.md: missing YAML frontmatter`);
    return;
  }

  const nameMatch = match.groups.frontmatter.match(/^name:\s*(?<name>[^\r\n]+)\s*$/m);
  if (!nameMatch) {
    errors.push(`${candidate.name}/SKILL.md: frontmatter is missing name`);
    return;
  }

  const declaredName = nameMatch.groups.name.trim().replace(/^['"]|['"]$/g, "");
  if (declaredName !== candidate.name) {
    errors.push(`${candidate.name}/SKILL.md: frontmatter name ${declaredName} does not match directory name`);
  }
}

function readPackageJson(candidate, files, errors) {
  const javascriptFiles = files.filter((file) => [".js", ".mjs", ".cjs"].includes(path.extname(file.path).toLowerCase()));
  if (javascriptFiles.length === 0) {
    return {};
  }

  const packagePath = path.join(candidate.root, "package.json");
  if (!fs.existsSync(packagePath)) {
    errors.push(`${candidate.name}: scripted skill is missing package.json runtime metadata`);
    return {};
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (javascriptFiles.some((file) => path.extname(file.path).toLowerCase() === ".js") && packageJson.type !== "module") {
      errors.push(`${candidate.name}/package.json: scripted .js skill must declare type=module`);
    }
    if (!String(packageJson.engines?.node ?? "").includes("24")) {
      errors.push(`${candidate.name}/package.json: scripted skill must declare its Node.js 24 runtime`);
    }
    return packageJson;
  } catch (error) {
    errors.push(`${candidate.name}/package.json: invalid JSON (${error.message})`);
    return {};
  }
}

function validateMarkdown(candidate, filePath, knownSkillNames, dependencyContract, errors) {
  const markdown = fs.readFileSync(filePath, "utf8");

  for (const link of [...extractMarkdownLinks(markdown), ...extractHtmlLinks(markdown)]) {
    if (isExternalLink(link.target)) {
      continue;
    }
    validateLocalTarget(candidate, filePath, link, errors);
  }

  for (const skillName of knownSkillNames) {
    const repositoryPathPattern = new RegExp(`(?:^|[^A-Za-z0-9_-])skills[\\\\/]${escapeRegExp(skillName)}(?:[\\\\/]|(?=$))`, "gm");
    const repositoryPathAllowed = dependencyContract.repositoryRoot
      && (skillName === candidate.name || dependencyContract.siblingSkills.has(skillName));
    if (repositoryPathPattern.test(markdown) && !repositoryPathAllowed) {
      errors.push(`${formatLocation(candidate, filePath)} contains repository-root path skills/${skillName}`);
    }

    if (skillName !== candidate.name) {
      const siblingInvocationPattern = new RegExp(`\\$${escapeRegExp(skillName)}\\b`);
      if (siblingInvocationPattern.test(markdown) && !dependencyContract.siblingSkills.has(skillName)) {
        errors.push(`${formatLocation(candidate, filePath)} invokes sibling skill $${skillName}`);
      }
    }
  }
}

function validateLocalTarget(candidate, sourcePath, { target, line }, errors) {
  const rawPath = target.split("#", 1)[0].split("?", 1)[0];
  if (!rawPath) {
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    errors.push(`${formatLocation(candidate, sourcePath, line)} contains an invalid encoded target ${target}`);
    return;
  }

  const targetPath = path.resolve(path.dirname(sourcePath), decodedPath);
  if (!isInside(candidate.root, targetPath)) {
    errors.push(`${formatLocation(candidate, sourcePath, line)} escapes the skill bundle through ${target}`);
    return;
  }
  if (!fs.existsSync(targetPath)) {
    errors.push(`${formatLocation(candidate, sourcePath, line)} points to missing path ${target}`);
  }
}

function validateJavaScript(candidate, filePath, packageJson, dependencyContract, errors) {
  const source = fs.readFileSync(filePath, "utf8");
  const specifiers = extractJavaScriptSpecifiers(source);
  const declaredPackages = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...dependencyContract.packages,
  ]);

  for (const specifier of specifiers) {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      const targetPath = path.resolve(path.dirname(filePath), specifier);
      if (!isInside(candidate.root, targetPath)) {
        const repositoryRoot = path.dirname(path.dirname(candidate.root));
        const repositoryRelativePath = toPosix(path.relative(repositoryRoot, targetPath));
        if (!dependencyContract.repositoryModules.has(repositoryRelativePath)) {
          errors.push(`${formatLocation(candidate, filePath)} imports undeclared repository module ${repositoryRelativePath}`);
        } else if (!fs.existsSync(targetPath)) {
          errors.push(`${formatLocation(candidate, filePath)} declares missing repository module ${repositoryRelativePath}`);
        }
        continue;
      }
      if (!fs.existsSync(targetPath)) {
        errors.push(`${formatLocation(candidate, filePath)} imports missing module ${specifier}`);
      }
      continue;
    }

    if (builtinModuleNames.has(specifier)) {
      continue;
    }

    const packageName = getPackageName(specifier);
    if (!declaredPackages.has(packageName)) {
      errors.push(`${formatLocation(candidate, filePath)} imports undeclared package ${packageName}`);
    }
  }
}

function validateCopiedSyntax(candidate, files, errors) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-skill-check-"));
  const copiedRoot = path.join(tempRoot, candidate.name);

  try {
    fs.cpSync(candidate.root, copiedRoot, { recursive: true, dereference: false });
    for (const file of files) {
      if (![".js", ".mjs", ".cjs"].includes(path.extname(file.path).toLowerCase())) {
        continue;
      }
      const relativePath = path.relative(candidate.root, file.path);
      const copiedPath = path.join(copiedRoot, relativePath);
      const result = spawnSync(process.execPath, ["--check", copiedPath], {
        encoding: "utf8",
        windowsHide: true,
      });
      if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || "syntax check failed").trim().split(/\r?\n/)[0];
        errors.push(`${candidate.name}/${toPosix(relativePath)} failed isolated syntax check: ${detail}`);
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function listEntries(root) {
  const entries = [];

  function visit(directoryPath) {
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isSymbolicLink()) {
        entries.push({ kind: "symlink", path: entryPath });
      } else if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        entries.push({ kind: "file", path: entryPath });
      }
    }
  }

  visit(root);
  return entries;
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]*\]\((?<target><[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    links.push({
      target: match.groups.target.replace(/^<|>$/g, ""),
      line: lineAt(markdown, match.index),
    });
  }
  return links;
}

function extractHtmlLinks(markdown) {
  const links = [];
  const pattern = /\b(?:href|src)=["'](?<target>[^"']+)["']/gi;
  for (const match of markdown.matchAll(pattern)) {
    links.push({ target: match.groups.target, line: lineAt(markdown, match.index) });
  }
  return links;
}

function extractJavaScriptSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'](?<specifier>[^"']+)["']/g,
    /\bimport\(\s*["'](?<specifier>[^"']+)["']\s*\)/g,
    /\brequire\(\s*["'](?<specifier>[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match.groups.specifier);
    }
  }
  return [...specifiers];
}

function isScaffold(markdown) {
  const frontmatter = markdown.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---/)?.groups.frontmatter ?? "";
  return /\[TODO:|\bTODO\b/i.test(frontmatter);
}

function isExternalLink(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function getPackageName(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/", 1)[0];
}

function formatLocation(candidate, filePath, line) {
  const relativePath = toPosix(path.relative(candidate.root, filePath));
  return `${candidate.name}/${relativePath}${line ? `:${line}` : ""}`;
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (result.errors.length > 0) {
    console.error("Skill bundle independence check failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    return 1;
  }

  const skipped = result.skippedScaffolds.length > 0
    ? `, ${result.skippedScaffolds.length} unfinished scaffold(s) skipped`
    : "";
  console.log(`Skill bundle independence check passed (${result.checkedBundles.length} bundles${skipped}).`);
  return 0;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const skillsRootIndex = process.argv.indexOf("--skills-root");
  const skillsRoot = skillsRootIndex >= 0 ? process.argv[skillsRootIndex + 1] : defaultSkillsRoot;
  if (skillsRootIndex >= 0 && !skillsRoot) {
    console.error("Missing value for --skills-root");
    process.exit(1);
  }
  process.exit(printResult(checkSkillBundles({ skillsRoot })));
}
