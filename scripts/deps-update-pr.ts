import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

async function main() {
  const commands = [
    ["git", ["checkout", "-b", `deps/update-${new Date().toISOString().slice(0, 10)}`]],
    ["pnpm", ["update", "--latest"]],
    ["pnpm", ["health"]],
    ["git", ["add", "package.json", "pnpm-lock.yaml"]],
    ["git", ["commit", "-m", "chore: update dependencies"]]
  ] as const;
  const planned = commands.map(([command, commandArgs]) => `${command} ${commandArgs.join(" ")}`);
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun, planned }, null, 2));
    return;
  }
  const results = [];
  for (const [command, commandArgs] of commands) {
    const result = await execFileAsync(command, [...commandArgs], { timeout: 20 * 60_000, windowsHide: true, shell: process.platform === "win32" });
    results.push({ command: `${command} ${commandArgs.join(" ")}`, output: (result.stdout || result.stderr).slice(-1000) });
  }
  if (args.has("--push")) {
    const push = await execFileAsync("git", ["push", "-u", "public", "HEAD"], { timeout: 120_000, windowsHide: true, shell: process.platform === "win32" });
    results.push({ command: "git push -u public HEAD", output: (push.stdout || push.stderr).slice(-1000) });
  }
  console.log(JSON.stringify({ ok: true, dryRun, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
