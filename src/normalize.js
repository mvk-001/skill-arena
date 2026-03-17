function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

export function normalizeWorkspace(workspace) {
  const sources = [];

  if (Array.isArray(workspace.sources)) {
    for (const source of workspace.sources) {
      sources.push(normalizeWorkspaceSource(source));
    }
  } else if (workspace.fixture) {
    sources.push({
      id: "base",
      type: "local-path",
      path: workspace.fixture,
      target: "/",
    });
  }

  return {
    sources,
    setup: {
      initializeGit: workspace.setup?.initializeGit ?? workspace.initializeGit ?? true,
      env: workspace.setup?.env ?? {},
    },
  };
}

export function normalizeWorkspaceSource(source) {
  switch (source.type) {
    case "local-path":
      return {
        ...(source.id ? { id: source.id } : {}),
        type: "local-path",
        path: source.path,
        target: source.target,
      };
    case "git":
      return {
        ...(source.id ? { id: source.id } : {}),
        type: "git",
        repo: source.repo,
        ...(source.ref ? { ref: source.ref } : {}),
        ...(source.subpath ? { subpath: source.subpath } : {}),
        target: source.target,
      };
    case "inline-files":
      return {
        ...(source.id ? { id: source.id } : {}),
        type: "inline-files",
        target: source.target,
        files: source.files.map((file) => ({
          path: file.path,
          ...(file.content !== undefined ? { content: file.content } : {}),
        })),
      };
    case "empty":
      return {
        ...(source.id ? { id: source.id } : {}),
        type: "empty",
        target: source.target,
      };
    default:
      throw new Error(`Unsupported workspace source type "${source.type}".`);
  }
}

export function normalizeSkill(sourceSkill, { skillMode, legacySkillOverlay, legacySkillSource }) {
  if (skillMode === "disabled") {
    return buildNormalizedSkill({
      source: {
        type: "none",
      },
      install: {
        strategy: "none",
      },
    });
  }

  if (sourceSkill) {
    return buildNormalizedSkill(sourceSkill);
  }

  if (legacySkillSource === "system-installed") {
    return buildNormalizedSkill({
      source: {
        type: "system-installed",
      },
      install: {
        strategy: "system-installed",
      },
    });
  }

  if (legacySkillSource === "workspace-overlay") {
    return buildNormalizedSkill({
      source: normalizeLegacySkillOverlay(legacySkillOverlay),
      install: {
        strategy: "workspace-overlay",
      },
    });
  }

  if (legacySkillOverlay) {
    return buildNormalizedSkill({
      source: normalizeLegacySkillOverlay(legacySkillOverlay),
      install: {
        strategy: "workspace-overlay",
      },
    });
  }

  return buildNormalizedSkill({
    source: {
      type: "system-installed",
    },
    install: {
      strategy: "system-installed",
    },
  });
}

function normalizeLegacySkillOverlay(skillOverlay) {
  if (!skillOverlay) {
    return {
      type: "none",
    };
  }

  if (typeof skillOverlay === "string") {
    return {
      type: "local-path",
      path: skillOverlay,
    };
  }

  if ("path" in skillOverlay) {
    return {
      type: "local-path",
      path: skillOverlay.path,
    };
  }

  if ("git" in skillOverlay) {
    return {
      type: "git",
      repo: skillOverlay.git.repo,
      ...(skillOverlay.git.ref ? { ref: skillOverlay.git.ref } : {}),
      ...(skillOverlay.git.subpath ? { subpath: skillOverlay.git.subpath } : {}),
    };
  }

  throw new Error("Unsupported legacy workspace.skillOverlay configuration.");
}

function buildNormalizedSkill(skill) {
  return {
    source: normalizeSkillSource(skill.source),
    install: {
      strategy: skill.install?.strategy
        ?? inferInstallStrategy(skill.source),
    },
  };
}

function inferInstallStrategy(source) {
  if (!source || source.type === "none") {
    return "none";
  }

  if (source.type === "system-installed") {
    return "system-installed";
  }

  return "workspace-overlay";
}

function normalizeSkillSource(source) {
  switch (source.type) {
    case "none":
      return { type: "none" };
    case "system-installed":
      return { type: "system-installed" };
    case "local-path":
      return {
        type: "local-path",
        path: source.path,
        ...(source.skillId ? { skillId: source.skillId } : {}),
      };
    case "git":
      return {
        type: "git",
        repo: source.repo,
        ...(source.ref ? { ref: source.ref } : {}),
        ...(source.subpath ? { subpath: source.subpath } : {}),
        ...(source.skillPath ? { skillPath: source.skillPath } : {}),
        ...(source.skillId ? { skillId: source.skillId } : {}),
      };
    case "inline":
      return {
        type: "inline",
        skillId: source.skillId,
        ...(source.content !== undefined ? { content: source.content } : {}),
        ...(source.files ? {
          files: source.files.map((file) => ({
            path: file.path,
            ...(file.content !== undefined ? { content: file.content } : {}),
          })),
        } : {}),
      };
    case "inline-files":
      return {
        type: "inline-files",
        files: source.files.map((file) => ({
          path: file.path,
          ...(file.content !== undefined ? { content: file.content } : {}),
        })),
      };
    default:
      throw new Error(`Unsupported skill source type "${source.type}".`);
  }
}

export function deriveSkillSourceLabel(skill) {
  switch (skill.install.strategy) {
    case "none":
      return "none";
    case "system-installed":
      return "system-installed";
    case "workspace-overlay":
      return "workspace-overlay";
    default:
      throw new Error(`Unsupported skill install strategy "${skill.install.strategy}".`);
  }
}

export function normalizeScenario(scenario, workspace) {
  const skill = normalizeSkill(scenario.skill, {
    skillMode: scenario.skillMode,
    legacySkillOverlay: workspace.skillOverlay,
    legacySkillSource: scenario.skillSource,
  });
  const skillSource = deriveSkillSourceLabel(skill);

  return {
    id: scenario.id,
    description: scenario.description,
    skillMode: scenario.skillMode,
    skill,
    skillSource,
    agent: scenario.agent,
    evaluation: scenario.evaluation,
    output: scenario.output ?? {
      tags: [],
      labels: {},
    },
  };
}

export function normalizeManifestShape(manifest) {
  const workspace = normalizeWorkspace(manifest.workspace);

  return {
    schemaVersion: manifest.schemaVersion,
    benchmark: manifest.benchmark,
    task: normalizeTask(manifest.task),
    workspace,
    scenarios: manifest.scenarios.map((scenario) => normalizeScenario(scenario, manifest.workspace)),
  };
}

export function normalizeCompareSkillMode(skillMode, workspace) {
  const skill = skillMode.skillMode === "enabled" && !skillMode.skill
    ? buildNormalizedSkill({
      source: {
        type: "none",
      },
      install: {
        strategy: "none",
      },
    })
    : normalizeSkill(skillMode.skill, {
      skillMode: skillMode.skillMode,
      legacySkillOverlay: workspace.skillOverlay,
      legacySkillSource: skillMode.skillSource,
    });

  return {
    id: skillMode.id,
    description: skillMode.description,
    skillMode: skillMode.skillMode,
    skill,
    skillSource: deriveSkillSourceLabel(skill),
    output: skillMode.output ?? {
      tags: [],
      labels: {},
    },
  };
}

export function normalizeCompareConfigShape(compareConfig) {
  const workspace = normalizeWorkspace(compareConfig.workspace);

  return {
    schemaVersion: compareConfig.schemaVersion,
    benchmark: compareConfig.benchmark,
    task: normalizeTask(compareConfig.task),
    workspace,
    evaluation: compareConfig.evaluation,
    comparison: {
      skillModes: compareConfig.comparison.skillModes.map((skillMode) =>
        normalizeCompareSkillMode(skillMode, compareConfig.workspace)
      ),
      variants: compareConfig.comparison.variants.map((variant) => ({
        id: variant.id,
        description: variant.description,
        agent: variant.agent,
        output: variant.output ?? {
          tags: [],
          labels: {},
        },
      })),
    },
  };
}

export function hasLegacyWorkspaceSkillOverlay(workspace) {
  return isObject(workspace) && "skillOverlay" in workspace && workspace.skillOverlay !== undefined;
}
