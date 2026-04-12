import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createRuntimeIsolation(executionRootDirectory, scenario = null) {
  const homeDirectory = path.join(executionRootDirectory, "home");
  const tempDirectory = path.join(executionRootDirectory, "tmp");
  const userProfileDirectory = path.join(executionRootDirectory, "user-profile");
  const appDataDirectory = path.join(userProfileDirectory, "AppData", "Roaming");
  const localAppDataDirectory = path.join(userProfileDirectory, "AppData", "Local");
  const xdgConfigHome = path.join(homeDirectory, ".config");
  const xdgCacheHome = path.join(homeDirectory, ".cache");
  const xdgDataHome = path.join(homeDirectory, ".local", "share");
  const xdgStateHome = path.join(homeDirectory, ".local", "state");
  const opencodeConfigDirectory = path.join(xdgConfigHome, "opencode");
  const opencodeDataDirectory = path.join(xdgDataHome, "opencode");
  const codexHome = path.join(executionRootDirectory, "codex-home");
  const codexSkillsDirectory = path.join(codexHome, "skills");
  const codexSystemSkillsDirectory = path.join(codexSkillsDirectory, ".system");
  const piHome = path.join(userProfileDirectory, ".pi");
  const piAgentDirectory = path.join(piHome, "agent");
  const claudeDirectory = path.join(homeDirectory, ".claude");
  const claudeJsonPath = path.join(homeDirectory, ".claude.json");
  const gitConfigPath = path.join(executionRootDirectory, "gitconfig");
  const allowedSkills = inferVisibleSkillsForScenario(scenario);
  const skipHomeAgents = scenario?.agent?.adapter === "pi" || scenario?.agent?.adapter === "codex";

  await prepareIsolationFilesystem({
    executionRootDirectory,
    homeDirectory,
    tempDirectory,
    userProfileDirectory,
    appDataDirectory,
    localAppDataDirectory,
    xdgConfigHome,
    xdgCacheHome,
    xdgDataHome,
    xdgStateHome,
    opencodeConfigDirectory,
    opencodeDataDirectory,
    piHome,
    piAgentDirectory,
    claudeDirectory,
    codexSkillsDirectory,
    codexSystemSkillsDirectory,
    gitConfigPath,
  });

  await seedCodexHome({
    destinationCodexHome: codexHome,
    destinationSkillsDirectory: codexSkillsDirectory,
    destinationSystemSkillsDirectory: codexSystemSkillsDirectory,
    copyGlobalAgents: !skipHomeAgents,
  });
  await seedPiHome({
    destinationPiHome: piHome,
    destinationPiAgentDirectory: piAgentDirectory,
  });
  await seedOpenCodeHome({
    destinationConfigDirectory: opencodeConfigDirectory,
    destinationDataDirectory: opencodeDataDirectory,
  });
  await seedClaudeCodeHome({
    destinationClaudeDirectory: claudeDirectory,
    destinationClaudeJsonPath: claudeJsonPath,
  });

  return {
    executionRootDirectory,
    homeDirectory,
    codexHome,
    tempDirectory,
    environment: {
      APPDATA: appDataDirectory,
      CODEX_HOME: codexHome,
      HOME: homeDirectory,
      LOCALAPPDATA: localAppDataDirectory,
      USERPROFILE: userProfileDirectory,
      XDG_CACHE_HOME: xdgCacheHome,
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_DATA_HOME: xdgDataHome,
      XDG_STATE_HOME: xdgStateHome,
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GIT_CONFIG_NOSYSTEM: "1",
      SKILL_ARENA_EXECUTION_ROOT: executionRootDirectory,
      SKILL_ARENA_ISOLATION: "strict",
      SKILL_ARENA_ISOLATED_HOME: homeDirectory,
      SKILL_ARENA_ALLOWED_SKILLS: allowedSkills.join(","),
      TEMP: tempDirectory,
      TMP: tempDirectory,
      TMPDIR: tempDirectory,
    },
  };
}

function inferVisibleSkillsForScenario(scenario) {
  const declaredSkills = scenario?.profile?.capabilities?.skills;

  if (Array.isArray(declaredSkills)) {
    return declaredSkills.flatMap((skill) => inferVisibleSkills(skill.source));
  }

  return scenario?.skillMode === "enabled"
    ? inferVisibleSkills(scenario.skill?.source)
    : [];
}

async function seedCodexHome({
  destinationCodexHome,
  destinationSkillsDirectory,
  destinationSystemSkillsDirectory,
  copyGlobalAgents,
}) {
  const sourceCodexHome = resolveSourceCodexHome();
  if (!sourceCodexHome) {
    return;
  }

  await copyOptionalCodexFiles(sourceCodexHome, destinationCodexHome);
  if (copyGlobalAgents) {
    await copyIfPresent(path.join(sourceCodexHome, "AGENTS.md"), path.join(destinationCodexHome, "AGENTS.md"));
  }
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "skills", ".system"), destinationSystemSkillsDirectory);
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "rules"), path.join(destinationCodexHome, "rules"));
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "vendor_imports"), path.join(destinationCodexHome, "vendor_imports"));
  await fs.mkdir(destinationSkillsDirectory, { recursive: true });
}

async function seedPiHome({
  destinationPiHome,
  destinationPiAgentDirectory,
}) {
  const sourcePiHome = resolveSourcePiHome();
  if (!sourcePiHome) {
    return;
  }

  const sourcePiAgentDirectory = path.join(sourcePiHome, "agent");
  await fs.mkdir(destinationPiHome, { recursive: true });
  await fs.mkdir(destinationPiAgentDirectory, { recursive: true });
  await copyIfPresent(
    path.join(sourcePiAgentDirectory, "auth.json"),
    path.join(destinationPiAgentDirectory, "auth.json"),
  );
  await copyIfPresent(
    path.join(sourcePiAgentDirectory, "settings.json"),
    path.join(destinationPiAgentDirectory, "settings.json"),
  );
  await copyDirectoryIfPresent(
    path.join(sourcePiAgentDirectory, "bin"),
    path.join(destinationPiAgentDirectory, "bin"),
  );
}

async function seedOpenCodeHome({
  destinationConfigDirectory,
  destinationDataDirectory,
}) {
  const sourceConfigDirectory = resolveSourceOpenCodeConfigDirectory();
  const sourceDataDirectory = resolveSourceOpenCodeDataDirectory();

  await fs.mkdir(destinationConfigDirectory, { recursive: true });
  await fs.mkdir(destinationDataDirectory, { recursive: true });

  await Promise.all([
    copyIfPresent(
      path.join(sourceConfigDirectory, "opencode.json"),
      path.join(destinationConfigDirectory, "opencode.json"),
    ),
    copyIfPresent(
      path.join(sourceConfigDirectory, "opencode.jsonc"),
      path.join(destinationConfigDirectory, "opencode.jsonc"),
    ),
    copyIfPresent(
      path.join(sourceConfigDirectory, "tui.json"),
      path.join(destinationConfigDirectory, "tui.json"),
    ),
    copyIfPresent(
      path.join(sourceDataDirectory, "auth.json"),
      path.join(destinationDataDirectory, "auth.json"),
    ),
  ]);
}

async function seedClaudeCodeHome({
  destinationClaudeDirectory,
  destinationClaudeJsonPath,
}) {
  await fs.mkdir(destinationClaudeDirectory, { recursive: true });
  await copyIfPresent(resolveSourceClaudeJsonPath(), destinationClaudeJsonPath);
}

function resolveSourceCodexHome() {
  const configuredCodexHome = process.env.CODEX_HOME;
  if (configuredCodexHome) {
    return configuredCodexHome;
  }

  return path.join(os.homedir(), ".codex");
}

function resolveSourcePiHome() {
  return path.join(os.homedir(), ".pi");
}

function resolveSourceOpenCodeConfigDirectory() {
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : path.join(os.homedir(), ".config", "opencode");
}

function resolveSourceOpenCodeDataDirectory() {
  return process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, "opencode")
    : path.join(os.homedir(), ".local", "share", "opencode");
}

function resolveSourceClaudeJsonPath() {
  return path.join(os.homedir(), ".claude.json");
}

async function copyIfPresent(sourcePath, destinationPath) {
  const sourceStats = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStats?.isFile()) {
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function copyDirectoryIfPresent(sourcePath, destinationPath) {
  const sourceStats = await fs.stat(sourcePath).catch(() => null);
  if (!sourceStats?.isDirectory()) {
    return;
  }

  await fs.rm(destinationPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.cp(sourcePath, destinationPath, { recursive: true });
}

function inferVisibleSkills(skillSource) {
  if (!skillSource || isNonVisibleSkillSource(skillSource)) {
    return [];
  }

  if (skillSource.type === "inline") {
    return [skillSource.skillId];
  }

  if (skillSource.skillId) {
    return [skillSource.skillId];
  }

  if (skillSource.type === "inline-files") {
    return extractVisibleInlineFileSkills(skillSource.files);
  }

  return ["workspace-overlay"];
}

async function prepareIsolationFilesystem(paths) {
  await Promise.all(
    Object.values(paths)
      .filter((targetPath) => targetPath !== paths.gitConfigPath)
      .map((targetPath) => fs.mkdir(targetPath, { recursive: true })),
  );
  await fs.mkdir(path.dirname(paths.gitConfigPath), { recursive: true });
  await fs.writeFile(paths.gitConfigPath, "", "utf8");
}

async function copyOptionalCodexFiles(sourceCodexHome, destinationCodexHome) {
  await Promise.all([
    copyIfPresent(path.join(sourceCodexHome, "auth.json"), path.join(destinationCodexHome, "auth.json")),
    copyIfPresent(path.join(sourceCodexHome, "config.toml"), path.join(destinationCodexHome, "config.toml")),
    copyIfPresent(path.join(sourceCodexHome, "version.json"), path.join(destinationCodexHome, "version.json")),
    copyIfPresent(
      path.join(sourceCodexHome, ".codex-global-state.json"),
      path.join(destinationCodexHome, ".codex-global-state.json"),
    ),
  ]);
}

function isNonVisibleSkillSource(skillSource) {
  return skillSource.type === "none" || skillSource.type === "system-installed";
}

function extractVisibleInlineFileSkills(files = []) {
  return [...new Set(files.map((file) => extractSkillIdFromFilePath(file.path)).filter(Boolean))];
}

function extractSkillIdFromFilePath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments[0] === "skills" && segments.length >= 3 ? segments[1] : null;
}
