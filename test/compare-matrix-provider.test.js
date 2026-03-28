import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import CompareMatrixProvider from "../src/providers/compare-matrix-provider.js";

test("compare matrix provider returns route errors when a variant is missing", async () => {
  const provider = new CompareMatrixProvider({
    id: "matrix-provider",
    config: {
      skill_mode_id: "skill",
      routes: {},
    },
  });

  const result = await provider.callApi("Return HELLO.", {
    vars: {
      variantId: "variant-a",
    },
  });

  assert.equal(result.error, 'No compare route configured for variant "variant-a".');
  assert.equal(result.metadata.skillModeId, "skill");
});

test("compare matrix provider loads and caches routed provider instances", async () => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "skill-arena-compare-provider-"));
  const providerPath = path.join(tempDirectory, "temp-provider.js");
  const workspaceDirectory = path.join(tempDirectory, "workspace");
  const rustCodeAnalysisStubPath = path.join(tempDirectory, "rust-code-analysis-stub.js");

  await fs.mkdir(workspaceDirectory, { recursive: true });
  await fs.writeFile(path.join(workspaceDirectory, "tracked.js"), "const value = 1;\n", "utf8");

  await fs.writeFile(
    providerPath,
    [
      "let instanceCount = 0;",
      "import fs from \"node:fs/promises\";",
      "import path from \"node:path\";",
      "export default class TempProvider {",
      "  constructor(options = {}) {",
      "    this.config = options.config ?? {};",
      "    instanceCount += 1;",
      "  }",
      "  async callApi(prompt, context) {",
      "    const variantId = context.vars?.variantId ?? context.test?.vars?.variantId ?? 'missing';",
      "    const trackedFile = path.join(this.config.working_dir, 'tracked.js');",
      "    await fs.writeFile(trackedFile, `const value = ${instanceCount + 1};\\nconst variant = '${variantId}';\\n`, 'utf8');",
      "    return {",
      "      output: `${prompt}:${variantId}` ,",
      "      metadata: {",
      "        instanceCount,",
      "        providerValue: this.config.value ?? null,",
      "      },",
      "    };",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    rustCodeAnalysisStubPath,
    [
      "import fs from \"node:fs\";",
      "const args = process.argv.slice(2);",
      "const pathIndex = args.indexOf(\"-p\");",
      "const filePath = pathIndex >= 0 ? args[pathIndex + 1] : null;",
      "const text = filePath ? fs.readFileSync(filePath, \"utf8\") : \"\";",
      "const lineCount = text.trim() ? text.trim().split(/\\r?\\n/).length : 0;",
      "const digitCount = (text.match(/\\d/g) ?? []).length;",
      "process.stdout.write(JSON.stringify({ metrics: { loc: { sloc: lineCount }, lexical: { digits: digitCount } } }));",
    ].join("\n"),
    "utf8",
  );
  const originalAnalyzerPath = process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN;
  process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN = rustCodeAnalysisStubPath;

  try {
    const provider = new CompareMatrixProvider({
      config: {
        skill_mode_id: "skill",
        routes: {
          "variant-a": {
            scenarioId: "scenario-a",
            provider: {
              id: providerPath,
              config: {
                scenario_description: "Scenario A",
                value: "provider-config",
                working_dir: workspaceDirectory,
              },
            },
          },
        },
      },
    });

    const firstResult = await provider.callApi("PROMPT", {
      vars: {
        variantId: "variant-a",
        variantDisplayName: "Variant A",
      },
    });
    const secondResult = await provider.callApi("PROMPT", {
      test: {
        vars: {
          variantId: "variant-a",
        },
        metadata: {
          variantDisplayName: "Variant A fallback",
        },
      },
    });

    assert.equal(firstResult.output, "PROMPT:variant-a");
    assert.equal(firstResult.metadata.scenarioId, "scenario-a");
    assert.equal(firstResult.metadata.scenarioDescription, "Scenario A");
    assert.equal(firstResult.metadata.workspaceDirectory, workspaceDirectory);
    assert.equal(firstResult.metadata.workingDirectory, workspaceDirectory);
    assert.equal(firstResult.metadata.variantDisplayName, "Variant A");
    assert.equal(firstResult.metadata.instanceCount, 1);
    assert.equal(firstResult.metadata.providerValue, "provider-config");
    assert.equal(firstResult.metadata.codeMetricsDelta.metrics["lexical.digits"], undefined);
    assert.equal(firstResult.metadata.codeMetricsDelta.metrics["loc.sloc"].avg, 1);
    assert.equal(secondResult.metadata.instanceCount, 1);
    assert.equal(secondResult.metadata.variantDisplayName, "Variant A fallback");
  } finally {
    if (originalAnalyzerPath == null) {
      delete process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN;
    } else {
      process.env.SKILL_ARENA_RUST_CODE_ANALYSIS_BIN = originalAnalyzerPath;
    }
  }
});

test("compare matrix provider requires a variant id in the context", async () => {
  const provider = new CompareMatrixProvider({
    config: {
      routes: {},
    },
  });

  await assert.rejects(
    () => provider.callApi("PROMPT", {}),
    /Compare matrix provider expected test metadata vars\.variantId\./,
  );
});
