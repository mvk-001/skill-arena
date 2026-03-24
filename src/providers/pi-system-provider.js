import path from "node:path";
import {
  spawnProviderCommand,
  withPromptPlaceholder,
} from "./command-process.js";

const WINDOWS_PROMPT_PLACEHOLDER = "__SKILL_ARENA_PROMPT__";

export default class PiSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
    this.spawnProcess = options.spawnProcess ?? spawnProcess;
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "pi-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    const useWindowsPromptWrapper = process.platform === "win32";
    const args = this.buildCommandArguments(
      useWindowsPromptWrapper ? WINDOWS_PROMPT_PLACEHOLDER : prompt,
    );
    const { stdout, stderr, exitCode } = await this.spawnProcess({
      command: this.config.command_path ?? "pi",
      args,
      cwd: this.config.working_dir,
      env: this.buildEnvironment(),
      promptText: useWindowsPromptWrapper ? prompt : undefined,
      abortSignal: callOptions?.abortSignal,
    });

    if (exitCode !== 0) {
      return {
        error: stderr.trim() || stdout.trim() || `pi exited with code ${exitCode}.`,
      };
    }

    return {
      output: stdout.trim(),
      metadata: {
        backend: "command",
        stderr: stderr.trim() || null,
      },
    };
  }

  buildCommandArguments(prompt) {
    const args = [];
    const workingDirectory = this.config.working_dir ?? process.cwd();
    const allowedSkills = Array.isArray(this.config.allowed_skills)
      ? this.config.allowed_skills
      : [];
    const shouldDisableUndeclaredSkills = this.config.disable_other_skills ?? true;

    if (this.config.model) {
      args.push("--model", this.config.model);
    }

    if (shouldDisableUndeclaredSkills) {
      args.push("--no-skills");
      for (const skill of allowedSkills) {
        const skillPath = path.resolve(workingDirectory, "skills", skill);
        args.push("--skill", skillPath);
      }
    } else if (allowedSkills.length > 0) {
      for (const skill of allowedSkills) {
        const skillPath = path.resolve(workingDirectory, "skills", skill);
        args.push("--skill", skillPath);
      }
    }

    args.push("-p", prompt);
    return args;
  }

  buildEnvironment() {
    return {
      ...process.env,
      ...this.config.cli_env,
    };
  }
}

async function spawnProcess({
  command,
  args,
  cwd,
  env,
  promptText,
  abortSignal,
}) {
  return await spawnProviderCommand({
    command,
    args: withPromptPlaceholder(args, WINDOWS_PROMPT_PLACEHOLDER),
    cwd,
    env,
    promptText,
    promptDirectoryPrefix: "skill-arena-pi-prompt-",
    abortSignal,
  });
}
