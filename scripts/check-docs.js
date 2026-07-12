import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markdownFiles = [
  path.join(projectRoot, "README.md"),
  ...findMarkdownFiles(path.join(projectRoot, "docs")),
];

const errors = [];
let localLinkCount = 0;

for (const filePath of markdownFiles) {
  const markdown = fs.readFileSync(filePath, "utf8");

  for (const link of extractMarkdownLinks(markdown)) {
    if (isExternalLink(link.target)) {
      continue;
    }

    localLinkCount += 1;
    validateLocalLink(filePath, link);
  }

  for (const link of extractHtmlLinks(markdown)) {
    if (isExternalLink(link.target)) {
      continue;
    }

    localLinkCount += 1;
    validateLocalLink(filePath, link);
  }
}

if (errors.length > 0) {
  console.error("Documentation link check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Documentation link check passed (${markdownFiles.length} files, ${localLinkCount} local links).`);

function findMarkdownFiles(directoryPath) {
  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return findMarkdownFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
    });
}

function extractMarkdownLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]*\]\((?<target><[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of markdown.matchAll(pattern)) {
    links.push({
      target: match.groups.target.replace(/^<|>$/g, ""),
      line: markdown.slice(0, match.index).split("\n").length,
    });
  }

  return links;
}

function extractHtmlLinks(markdown) {
  const links = [];
  const pattern = /\b(?:href|src)=["'](?<target>[^"']+)["']/gi;

  for (const match of markdown.matchAll(pattern)) {
    links.push({
      target: match.groups.target,
      line: markdown.slice(0, match.index).split("\n").length,
    });
  }

  return links;
}

function isExternalLink(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function validateLocalLink(sourcePath, { target, line }) {
  const [rawPath, rawFragment = ""] = target.split("#", 2);
  const decodedPath = decodeURIComponent(rawPath);
  const targetPath = decodedPath
    ? path.resolve(path.dirname(sourcePath), decodedPath)
    : sourcePath;
  const location = `${path.relative(projectRoot, sourcePath)}:${line}`;

  if (!fs.existsSync(targetPath)) {
    errors.push(`${location} points to missing path ${target}`);
    return;
  }

  if (!rawFragment || path.extname(targetPath).toLowerCase() !== ".md") {
    return;
  }

  const headings = extractHeadingAnchors(fs.readFileSync(targetPath, "utf8"));
  const fragment = decodeURIComponent(rawFragment).toLowerCase();
  if (!headings.has(fragment)) {
    errors.push(`${location} points to missing heading ${target}`);
  }
}

function extractHeadingAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (!match) {
      continue;
    }

    const base = githubSlug(match[1]);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }

  return anchors;
}

function githubSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
