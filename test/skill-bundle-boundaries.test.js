import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkSkillBundles } from "../scripts/check-skill-bundles.js";
import { fromProjectRoot } from "../src/project-paths.js";

test("repository skill bundles satisfy independence or declared composition boundaries", () => {
  const result = checkSkillBundles({ skillsRoot: fromProjectRoot("skills") });

  assert.deepEqual(result.errors, []);
  assert.ok(result.checkedBundles.includes("skill-arena-config-author"));
  assert.ok(result.checkedBundles.includes("skill-arena-strategy-evaluator"));
  assert.ok(result.checkedBundles.includes("harbor-runner"));
});

test("skill bundle check rejects escaping and missing Markdown resources", () => {
  const fixture = createFixture();
  writeSkill(fixture.skillsRoot, "escaping-skill", [
    "---",
    "name: escaping-skill",
    "description: Validate an invalid test fixture.",
    "---",
    "",
    "[Outside](../../outside.md)",
    "[Missing](references/missing.md)",
  ].join("\n"));
  fs.writeFileSync(path.join(fixture.root, "outside.md"), "outside", "utf8");

  const result = checkSkillBundles({ skillsRoot: fixture.skillsRoot, verifySyntax: false });

  assert.ok(result.errors.some((error) => error.includes("escapes the skill bundle")));
  assert.ok(result.errors.some((error) => error.includes("points to missing path")));
});

test("skill bundle check rejects mismatched names, repository paths, and undeclared imports", () => {
  const fixture = createFixture();
  const skillRoot = writeSkill(fixture.skillsRoot, "portable-skill", [
    "---",
    "name: wrong-name",
    "description: Validate an invalid scripted fixture.",
    "---",
    "",
    "Run `node skills/portable-skill/scripts/run.js`.",
  ].join("\n"));
  fs.mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, "scripts", "run.js"),
    "import { value } from '../../../src/shared.js';\nimport thing from 'undeclared-package';\nconsole.log(value, thing);\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(skillRoot, "package.json"),
    JSON.stringify({ private: true, type: "module", engines: { node: ">=24.0.0" } }),
    "utf8",
  );
  fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, "src", "shared.js"), "export const value = 1;\n", "utf8");

  const result = checkSkillBundles({ skillsRoot: fixture.skillsRoot, verifySyntax: false });

  assert.ok(result.errors.some((error) => error.includes("does not match directory name")));
  assert.ok(result.errors.some((error) => error.includes("repository-root path")));
  assert.ok(result.errors.some((error) => error.includes("imports undeclared repository module src/shared.js")));
  assert.ok(result.errors.some((error) => error.includes("imports undeclared package undeclared-package")));
});

test("declared orchestrator dependencies are checked without pretending the bundle is atomic", () => {
  const fixture = createFixture();
  const skillRoot = writeSkill(fixture.skillsRoot, "example-orchestrator", [
    "---",
    "name: example-orchestrator",
    "description: Repository-integrated orchestrator for a test fixture.",
    "---",
    "",
    "Run `node skills/example-orchestrator/scripts/run.js`.",
  ].join("\n"));
  fs.mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, "scripts", "run.js"),
    "import { value } from '../../../src/shared.js';\nimport helper from 'declared-package';\nconsole.log(value, helper);\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(skillRoot, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      engines: { node: ">=24.0.0" },
      dependencies: { "declared-package": "1.0.0" },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(skillRoot, "skill-dependencies.json"),
    JSON.stringify({
      classification: "orchestrator",
      repositoryRoot: true,
      repositoryModules: ["src/shared.js"],
      packages: ["declared-package"],
      siblingSkills: [],
    }),
    "utf8",
  );
  fs.mkdirSync(path.join(fixture.root, "src"), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, "src", "shared.js"), "export const value = 1;\n", "utf8");

  const result = checkSkillBundles({ skillsRoot: fixture.skillsRoot, verifySyntax: false });

  assert.deepEqual(result.errors, []);
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-arena-bundle-boundary-"));
  const skillsRoot = path.join(root, "skills");
  fs.mkdirSync(skillsRoot, { recursive: true });
  return { root, skillsRoot };
}

function writeSkill(skillsRoot, name, markdown) {
  const skillRoot = path.join(skillsRoot, name);
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), markdown, "utf8");
  return skillRoot;
}
