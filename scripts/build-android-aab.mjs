import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const command = platform() === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(command, ["bundleRelease"], {
  cwd: "android",
  shell: platform() === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
