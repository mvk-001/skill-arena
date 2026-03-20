function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createDefaultOutput() {
  return {
    tags: [],
    labels: {},
  };
}

function createDefaultIsolation() {
  return {
    inheritSystem: false,
  };
}

function createEmptyCapabilities() {
  return {
    instructions: [],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    extensions: [],
    plugins: [],
  };
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
    output: scenario.output ?? createDefaultOutput(),
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

  const capabilities = createEmptyCapabilities();
  if (skill.install.strategy !== "none") {
    capabilities.skills.push(skill);
  }

  return {
    id: skillMode.id,
    description: skillMode.description,
    isolation: createDefaultIsolation(),
    capabilities,
    skillMode: skillMode.skillMode,
    skill,
    skillSource: deriveSkillSourceLabel(skill),
    output: skillMode.output ?? createDefaultOutput(),
  };
}

function normalizeGenericCapabilityEntry(entry) {
  if (!isObject(entry)) {
    throw new Error("Capability entries must be objects.");
  }

  return { ...entry };
}

function normalizeCapabilities(capabilities = {}) {
  const normalized = createEmptyCapabilities();

  if (Array.isArray(capabilities.instructions)) {
    normalized.instructions = capabilities.instructions.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.skills)) {
    normalized.skills = capabilities.skills.map((skill) => buildNormalizedSkill(skill));
  }

  if (Array.isArray(capabilities.agents)) {
    normalized.agents = capabilities.agents.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.hooks)) {
    normalized.hooks = capabilities.hooks.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.mcp)) {
    normalized.mcp = capabilities.mcp.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.extensions)) {
    normalized.extensions = capabilities.extensions.map(normalizeGenericCapabilityEntry);
  }

  if (Array.isArray(capabilities.plugins)) {
    normalized.plugins = capabilities.plugins.map(normalizeGenericCapabilityEntry);
  }

  return normalized;
}

function deriveCompareProfileSkillMode(capabilities) {
  return capabilities.skills.length > 0 ? "enabled" : "disabled";
}

function deriveCompareProfileSkill(capabilities) {
  if (capabilities.skills.length === 0) {
    return buildNormalizedSkill({
      source: { type: "none" },
      install: { strategy: "none" },
    });
  }

  if (capabilities.skills.length === 1) {
    return capabilities.skills[0];
  }

  return buildNormalizedSkill({
    source: {
      type: "inline-files",
      files: [],
    },
    install: {
      strategy: "workspace-overlay",
    },
  });
}

function deriveProfileSkillSource(capabilities) {
  if (capabilities.skills.length === 0) {
    return "none";
  }

  const strategies = new Set(capabilities.skills.map((skill) => deriveSkillSourceLabel(skill)));
  if (strategies.size === 1) {
    return capabilities.skills.length > 1 && strategies.has("workspace-overlay")
      ? "workspace-overlay"
      : [...strategies][0];
  }

  return "mixed";
}

export function normalizeCompareProfile(profile) {
  const capabilities = normalizeCapabilities(profile.capabilities);
  const skill = profile.skill ?? deriveCompareProfileSkill(capabilities);
  const skillMode = profile.skillMode ?? deriveCompareProfileSkillMode(capabilities);

  return {
    id: profile.id,
    description: profile.description,
    isolation: {
      inheritSystem: profile.isolation?.inheritSystem ?? false,
    },
    capabilities,
    skillMode,
    skill,
    skillSource: profile.skillSource ?? deriveProfileSkillSource(capabilities),
    output: profile.output ?? createDefaultOutput(),
  };
}

function normalizeLegacyCompareSkillModes(compareConfig) {
  if (!compareConfig?.comparison || Array.isArray(compareConfig.comparison.profiles)) {
    return compareConfig;
  }

  return {
    ...compareConfig,
    comparison: {
      ...compareConfig.comparison,
      profiles: (compareConfig.comparison.skillModes ?? []).map((skillMode) =>
        normalizeCompareSkillMode(skillMode, compareConfig.workspace)
      ),
    },
  };
}

export function normalizeCompareConfigShape(compareConfig) {
  const compareConfigWithProfiles = normalizeLegacyCompareSkillModes(compareConfig);
  const workspace = normalizeWorkspace(compareConfig.workspace);

  return {
    schemaVersion: compareConfigWithProfiles.schemaVersion,
    benchmark: compareConfigWithProfiles.benchmark,
    task: normalizeTask(compareConfigWithProfiles.task),
    workspace,
    evaluation: compareConfigWithProfiles.evaluation,
    comparison: {
      profiles: compareConfigWithProfiles.comparison.profiles.map((profile) =>
        "capabilities" in profile
          ? normalizeCompareProfile(profile)
          : normalizeCompareSkillMode(profile, compareConfig.workspace)
      ),
      variants: compareConfigWithProfiles.comparison.variants.map((variant) => ({
        id: variant.id,
        description: variant.description,
        agent: variant.agent,
        output: variant.output ?? createDefaultOutput(),
      })),
    },
  };
}

export function hasLegacyWorkspaceSkillOverlay(workspace) {
  return isObject(workspace) && "skillOverlay" in workspace && workspace.skillOverlay !== undefined;
}
