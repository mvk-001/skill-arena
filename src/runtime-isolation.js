import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createRuntimeIsolation(executionRootDirectory, scenario = null) {
  const homeDirectory = path.join(executionRootDirectory, "home");
  const userProfileDirectory = path.join(executionRootDirectory, "user-profile");
  const appDataDirectory = path.join(userProfileDirectory, "AppData", "Roaming");
  const localAppDataDirectory = path.join(userProfileDirectory, "AppData", "Local");
  const xdgConfigHome = path.join(homeDirectory, ".config");
  const xdgCacheHome = path.join(homeDirectory, ".cache");
  const xdgDataHome = path.join(homeDirectory, ".local", "share");
  const xdgStateHome = path.join(homeDirectory, ".local", "state");
  const codexHome = path.join(executionRootDirectory, "codex-home");
  const codexSkillsDirectory = path.join(codexHome, "skills");
  const codexSystemSkillsDirectory = path.join(codexSkillsDirectory, ".system");
  const gitConfigPath = path.join(executionRootDirectory, "gitconfig");
  const allowedSkills = scenario?.skillMode === "enabled"
    ? inferVisibleSkills(scenario.skill?.source)
    : [];
  const skipHomeAgents = scenario?.agent?.adapter === "pi" || scenario?.agent?.adapter === "codex";

  await Promise.all([
    fs.mkdir(executionRootDirectory, { recursive: true }),
    fs.mkdir(homeDirectory, { recursive: true }),
    fs.mkdir(userProfileDirectory, { recursive: true }),
    fs.mkdir(appDataDirectory, { recursive: true }),
    fs.mkdir(localAppDataDirectory, { recursive: true }),
    fs.mkdir(xdgConfigHome, { recursive: true }),
    fs.mkdir(xdgCacheHome, { recursive: true }),
    fs.mkdir(xdgDataHome, { recursive: true }),
    fs.mkdir(xdgStateHome, { recursive: true }),
    fs.mkdir(codexSkillsDirectory, { recursive: true }),
    fs.mkdir(codexSystemSkillsDirectory, { recursive: true }),
    fs.writeFile(gitConfigPath, "", "utf8"),
  ]);

  await seedCodexHome({
    destinationCodexHome: codexHome,
    destinationSkillsDirectory: codexSkillsDirectory,
    destinationSystemSkillsDirectory: codexSystemSkillsDirectory,
    copyGlobalAgents: !skipHomeAgents,
  });

  return {
    executionRootDirectory,
    homeDirectory,
    codexHome,
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
    },
  };
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

  await copyIfPresent(path.join(sourceCodexHome, "auth.json"), path.join(destinationCodexHome, "auth.json"));
  await copyIfPresent(path.join(sourceCodexHome, "config.toml"), path.join(destinationCodexHome, "config.toml"));
  await copyIfPresent(path.join(sourceCodexHome, "version.json"), path.join(destinationCodexHome, "version.json"));
  await copyIfPresent(path.join(sourceCodexHome, ".codex-global-state.json"), path.join(destinationCodexHome, ".codex-global-state.json"));
  if (copyGlobalAgents) {
    await copyIfPresent(path.join(sourceCodexHome, "AGENTS.md"), path.join(destinationCodexHome, "AGENTS.md"));
  }
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "skills", ".system"), destinationSystemSkillsDirectory);
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "rules"), path.join(destinationCodexHome, "rules"));
  await copyDirectoryIfPresent(path.join(sourceCodexHome, "vendor_imports"), path.join(destinationCodexHome, "vendor_imports"));
  await fs.mkdir(destinationSkillsDirectory, { recursive: true });
}

function resolveSourceCodexHome() {
  const configuredCodexHome = process.env.CODEX_HOME;
  if (configuredCodexHome) {
    return configuredCodexHome;
  }

  return path.join(os.homedir(), ".codex");
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
  if (!skillSource || skillSource.type === "none" || skillSource.type === "system-installed") {
    return [];
  }

  if (skillSource.type === "inline") {
    return [skillSource.skillId];
  }

  if (skillSource.skillId) {
    return [skillSource.skillId];
  }

  if (skillSource.type === "inline-files") {
    return [
      ...new Set(
        skillSource.files
          .map((file) => {
            const normalizedPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
            const segments = normalizedPath.split("/").filter(Boolean);
            return segments[0] === "skills" && segments.length >= 3 ? segments[1] : null;
          })
          .filter(Boolean),
      ),
    ];
  }

  return ["workspace-overlay"];
}
