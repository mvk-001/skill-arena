import os from "node:os";

const envParallelism = Number.parseInt(process.env.SKILL_ARENA_MAX_PARALLELISM ?? "", 10);

export function getDefaultParallelism() {
  if (Number.isInteger(envParallelism) && envParallelism > 0) {
    return envParallelism;
  }

  if (typeof os.availableParallelism === "function") {
    return Math.max(1, os.availableParallelism());
  }

  return Math.max(1, os.cpus().length);
}

export function resolveEvaluationConcurrency(evaluation) {
  return evaluation.maxConcurrency ?? getDefaultParallelism();
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const resolvedConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: resolvedConcurrency }, () => worker()),
  );

  return results;
}
