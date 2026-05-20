import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const action = process.argv.includes("uninstall") || process.argv.includes("--uninstall") ? "uninstall" : "install";
const write = process.argv.includes("--write");
const root = process.cwd();
const command = `cd /d "${root}" && pnpm automation:start`;
const taskName = "CS2MatchPredictionLabAutomation";

async function main() {
  const instructions = platformInstructions();
  if (!write) {
    console.log(JSON.stringify({ ok: true, dryRun: true, action, instructions }, null, 2));
    return;
  }
  if (process.platform === "win32") {
    const args = action === "install"
      ? ["/Create", "/TN", taskName, "/SC", "HOURLY", "/MO", "1", "/TR", command, "/F"]
      : ["/Delete", "/TN", taskName, "/F"];
    const result = await execFileAsync("schtasks", args, { windowsHide: true, shell: process.platform === "win32" });
    console.log(JSON.stringify({ ok: true, action, output: result.stdout || result.stderr }, null, 2));
    return;
  }
  console.log(JSON.stringify({ ok: false, action, message: "Automatic scheduler installation is guided-only on this platform in v1.7.0.", instructions }, null, 2));
}

function platformInstructions() {
  if (process.platform === "win32") {
    return [
      `schtasks /Create /TN ${taskName} /SC HOURLY /MO 1 /TR ${JSON.stringify(command)} /F`,
      `schtasks /Delete /TN ${taskName} /F`
    ];
  }
  if (process.platform === "darwin") {
    return [`Create a launchd plist that runs: ${path.join(root, "node_modules", ".bin", "pnpm")} automation:start`];
  }
  return [`Create a systemd timer or cron entry that runs: cd ${root} && pnpm automation:start`];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
