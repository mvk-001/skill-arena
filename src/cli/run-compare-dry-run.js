import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const childProcess = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("./run-compare.js", import.meta.url)),
    ...process.argv.slice(2),
    "--dry-run",
  ],
  {
    stdio: "inherit",
    windowsHide: true,
  },
);

childProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

childProcess.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
