export function buildSkillActivationPrompt({ adapter, allowedSkillIds = [], skillStrategy = "none" }) {
  if (skillStrategy === "none") {
    return "";
  }

  const skillIds = normalizeSkillIds(allowedSkillIds);
  const hasNamedSkills = skillIds.length > 0;

  switch (adapter) {
    case "codex":
      return hasNamedSkills
        ? `Skill activation: explicitly invoke and follow these skills before solving the task: ${skillIds.map((skillId) => `$${skillId}`).join(", ")}.`
        : "Skill activation: if a relevant installed skill is available, explicitly invoke and follow it before solving the task.";
    case "pi":
      return hasNamedSkills
        ? `Skill activation: force-load and follow these skills before solving the task: ${skillIds.map((skillId) => `/skill:${skillId}`).join(", ")}.`
        : "Skill activation: if a relevant installed skill is available, explicitly load and follow it before solving the task.";
    case "copilot-cli":
      return hasNamedSkills
        ? `Skill activation: explicitly invoke and follow these skills before solving the task: ${skillIds.map((skillId) => `/${skillId}`).join(", ")}.`
        : "Skill activation: if a relevant repository or installed skill is available, explicitly invoke and follow it before solving the task.";
    case "opencode":
      return hasNamedSkills
        ? `Skill activation: call the native skill loader for these skills before solving the task: ${skillIds.join(", ")}.`
        : "Skill activation: if a relevant skill is available, load and follow it before solving the task.";
    case "claude-code":
      return hasNamedSkills
        ? `Skill activation: explicitly load and follow these skills before solving the task: ${skillIds.join(", ")}.`
        : "Skill activation: if a relevant skill is available, explicitly load and follow it before solving the task.";
    case "gemini-cli":
      return hasNamedSkills
        ? `Skill activation: explicitly activate and follow these skills before solving the task: ${skillIds.join(", ")}. Use the native activate_skill flow when needed.`
        : "Skill activation: if a relevant skill is available, explicitly activate and follow it before solving the task.";
    default:
      return hasNamedSkills
        ? `Skill activation: explicitly load and follow these skills before solving the task: ${skillIds.join(", ")}.`
        : "Skill activation: if a relevant skill is available, explicitly load and follow it before solving the task.";
  }
}

export function prependPromptPreamble(prompt, preamble) {
  const trimmedPreamble = typeof preamble === "string" ? preamble.trim() : "";
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";

  if (!trimmedPreamble) {
    return prompt;
  }

  if (!trimmedPrompt) {
    return trimmedPreamble;
  }

  return `${trimmedPreamble}\n\nTask:\n${trimmedPrompt}`;
}

function normalizeSkillIds(skillIds) {
  if (!Array.isArray(skillIds)) {
    return [];
  }

  return [...new Set(
    skillIds
      .map((skillId) => typeof skillId === "string" ? skillId.trim() : "")
      .filter(Boolean),
  )];
}
