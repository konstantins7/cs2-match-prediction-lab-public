import { startAutomationLoop } from "@/lib/automation/runner";

const args = new Set(process.argv.slice(2));
const interval = Number(readArg("--interval-ms") ?? 60_000);

startAutomationLoop({
  once: args.has("--once"),
  dryRun: args.has("--dry-run"),
  intervalMs: Number.isFinite(interval) ? interval : 60_000
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
