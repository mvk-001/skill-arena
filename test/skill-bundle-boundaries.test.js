import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  checkSkillBundles,
  EXPECTED_SKILLS,
} from "../scripts/check-skill-bundles.js";

test("the repository contains exactly the eleven maintained atomic Harbor skills", () => {
  const result = checkSkillBundles({ skillsRoot: path.resolve("skills") });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checkedBundles, [...EXPECTED_SKILLS]);
});

test("every evolution bundle declares the independent validation boundary", () => {
  const evolutionSkills = [
    "harbor-evolve-skill",
    "harbor-operator-coevolution",
    "harbor-population-search",
    "harbor-reflective-pareto-search",
    "harbor-trace-distillation",
  ];

  for (const skill of evolutionSkills) {
    const markdown = fs.readFileSync(
      path.resolve("skills", skill, "SKILL.md"),
      "utf8",
    );
    assert.match(markdown, /^## Evolution\/validation boundary$/m, skill);
    assert.match(markdown, /optimizer-(?:invisible|visible)/i, skill);
    assert.match(markdown, /before .*evolution|before .*generation|before .*distillation/i, skill);
    assert.match(markdown, /fresh\s+validation/i, skill);
  }
});

test("the bundle check rejects name drift and escaping or missing resources", () => {
  const fixture = createFixture();
  const skillRoot = writeSkill(fixture.skillsRoot, "broken-skill", [
    "---",
    "name: wrong-name",
    "description: Invalid fixture.",
    "---",
    "",
    "[Outside](../../outside.md)",
    "[Missing](references/missing.md)",
  ].join("\n"));
  fs.writeFileSync(path.join(fixture.root, "outside.md"), "outside", "utf8");

  const result = checkSkillBundles({
    skillsRoot: fixture.skillsRoot,
    expectedSkills: null,
    verifySyntax: false,
  });

  assert.ok(result.errors.some((error) => error.includes("does not match directory")));
  assert.ok(result.errors.some((error) => error.includes("escapes the bundle")));
  assert.ok(result.errors.some((error) => error.includes("points to missing path")));
  assert.ok(skillRoot);
});

test("the bundle check validates Python syntax without writing bytecode", () => {
  const fixture = createFixture();
  const skillRoot = writeSkill(fixture.skillsRoot, "python-skill", [
    "---",
    "name: python-skill",
    "description: Invalid Python fixture.",
    "---",
  ].join("\n"));
  fs.mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "scripts", "broken.py"), "def broken(:\n", "utf8");

  const result = checkSkillBundles({
    skillsRoot: fixture.skillsRoot,
    expectedSkills: null,
  });

  assert.ok(result.errors.some((error) => error.includes("Python syntax check failed")));
  assert.equal(fs.existsSync(path.join(skillRoot, "scripts", "__pycache__")), false);
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-bundle-check-"));
  const skillsRoot = path.join(root, "skills");
  fs.mkdirSync(skillsRoot, { recursive: true });
  return { root, skillsRoot };
}

function writeSkill(skillsRoot, name, markdown) {
  const skillRoot = path.join(skillsRoot, name);
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `${markdown}\n`, "utf8");
  return skillRoot;
}
