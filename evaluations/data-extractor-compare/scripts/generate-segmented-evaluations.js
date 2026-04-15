import fs from "node:fs/promises";
import path from "node:path";

import yaml from "yaml";

const evaluationPath = path.resolve(
  process.cwd(),
  "evaluations",
  "data-extractor-compare",
  "evaluation.yaml",
);
const segmentsDirectory = path.resolve(
  process.cwd(),
  "evaluations",
  "data-extractor-compare",
  "segments",
);

async function main() {
  const sourceText = await fs.readFile(evaluationPath, "utf8");
  const evaluation = yaml.parse(sourceText);

  if (!evaluation?.comparison?.variants || !Array.isArray(evaluation.comparison.variants)) {
    throw new Error("The source evaluation does not define comparison.variants.");
  }

  await fs.mkdir(segmentsDirectory, { recursive: true });

  for (const variant of evaluation.comparison.variants) {
    const segmented = structuredClone(evaluation);
    segmented.benchmark = {
      ...(segmented.benchmark ?? {}),
      id: `${evaluation.benchmark.id}-${variant.id}`,
      description: `${evaluation.benchmark.description} Segmented run for ${variant.output?.labels?.variantDisplayName ?? variant.id}.`,
    };
    segmented.comparison = {
      ...(segmented.comparison ?? {}),
      variants: [variant],
    };

    const outputPath = path.join(segmentsDirectory, `${variant.id}.yaml`);
    await fs.writeFile(outputPath, yaml.stringify(segmented), "utf8");
  }
}

await main();
