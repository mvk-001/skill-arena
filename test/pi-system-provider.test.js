import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import PiSystemProvider from "../src/providers/pi-system-provider.js";

test("pi provider forwards isolated home variables into the CLI environment", async () => {
  const isolatedHome = path.join(os.tmpdir(), "skill-arena-pi-home");
  const provider = new PiSystemProvider({
    config: {
      command_path: "pi",
      working_dir: "C:/temp/workspace",
      cli_env: {
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
        XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
      },
    },
    spawnProcess: async (options) => {
      assert.equal(options.env.HOME, isolatedHome);
      assert.equal(options.env.USERPROFILE, isolatedHome);
      assert.equal(options.env.XDG_CONFIG_HOME, path.join(isolatedHome, ".config"));
      return {
        stdout: "ALPHA-42\n",
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const response = await provider.callApi("Return the marker.");
  assert.equal(response.output, "ALPHA-42");
});
