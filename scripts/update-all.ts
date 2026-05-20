import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const steps = [
  ["git", ["pull", "--ff-only"]],
  ["pnpm", ["install"]],
  ["pnpm", ["prisma", "migrate", "deploy"]],
  ["pnpm", ["prisma:generate"]],
  ["pnpm", ["build"]]
] as const;

async function main() {
  const results = [];
  for (const [command, commandArgs] of steps) {
    if (dryRun) {
      results.push({ command: `${command} ${commandArgs.join(" ")}`, status: "skipped" });
      continue;
    }
    const result = await execFileAsync(command, [...commandArgs], { timeout: 10 * 60_000, windowsHide: true, shell: process.platform === "win32" });
    results.push({ command: `${command} ${commandArgs.join(" ")}`, status: "success", output: (result.stdout || result.stderr).slice(-1000) });
  }
  if (args.has("--restart-server")) {
    results.push({ command: "restart-server", status: "skipped", output: "Use your local process manager or rerun pnpm start; v1.7 does not kill arbitrary processes." });
  }
  console.log(JSON.stringify({ ok: true, dryRun, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
