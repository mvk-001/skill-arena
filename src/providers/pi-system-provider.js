import path from "node:path";
import { spawn } from "node:child_process";

export default class PiSystemProvider {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? {};
  }

  id() {
    return this.config.provider_id ?? this.options.id ?? "pi-system-provider";
  }

  async callApi(prompt, _context, callOptions) {
    const args = this.buildCommandArguments(prompt);
    const { stdout, stderr, exitCode } = await spawnProcess({
      command: this.config.command_path ?? "pi",
      args,
      cwd: this.config.working_dir,
      env: this.buildEnvironment(),
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

    if (this.config.model) {
      args.push("--model", this.config.model);
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
  abortSignal,
}) {
  return await new Promise((resolve, reject) => {
    const { executable, executableArgs } = buildSpawnCommand(command, args);
    const childProcess = spawn(executable, executableArgs, {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    childProcess.on("error", (error) => {
      cleanupAbortListener();
      reject(error);
    });

    childProcess.on("exit", (exitCode) => {
      cleanupAbortListener();
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    childProcess.stdin.end();

    const abortHandler = () => {
      childProcess.kill("SIGTERM");
    };

    const cleanupAbortListener = () => {
      abortSignal?.removeEventListener("abort", abortHandler);
    };

    abortSignal?.addEventListener("abort", abortHandler, { once: true });
  });
}

function buildSpawnCommand(command, args) {
  if (process.platform !== "win32") {
    return {
      executable: command,
      executableArgs: args,
    };
  }

  return {
    executable: "powershell.exe",
    executableArgs: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      buildPowershellCommand(command, args),
    ],
  };
}

function buildPowershellCommand(command, args) {
  const escapedCommand = escapePowershellArgument(command);
  const escapedArgs = args.map((arg) => escapePowershellArgument(arg)).join(" ");

  return `& ${escapedCommand}${escapedArgs ? ` ${escapedArgs}` : ""}`;
}

function escapePowershellArgument(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
