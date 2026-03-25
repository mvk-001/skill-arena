/**
 * Task and prompt normalization utilities.
 *
 * Extracted from normalize.js to keep each normalization concern
 * in a focused module.
 */

export function normalizeTask(task) {
  if ("prompts" in task) {
    return {
      prompts: task.prompts.map((prompt, index) => ({
        id: prompt.id ?? `prompt-${index + 1}`,
        prompt: prompt.prompt,
        ...(prompt.description ? { description: prompt.description } : {}),
        ...(prompt.evaluation ? { evaluation: prompt.evaluation } : {}),
      })),
    };
  }

  return {
    prompts: [
      {
        id: "default",
        prompt: task.prompt,
      },
    ],
  };
}
