import { isDirectRun, listArg, parseCliArgs, stringArg } from "../data-fetchers/utils";
import { safeHarvest } from "./safe-orchestrator";

export async function runSafeHarvestCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const matchId = stringArg(args, "matchId");
  const teamNames = listArg(args, "teams");
  if (!matchId || teamNames.length < 2) {
    console.error('Usage: npm run harvest -- --matchId <id> --teams "Team A,Team B" [--mode fast|deeper|max] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const dateRaw = stringArg(args, "date");
  const result = await safeHarvest({
    matchId,
    teamNames,
    mode: normalizeMode(stringArg(args, "mode")),
    dryRun: Boolean(args["dry-run"]),
    matchDate: dateRaw ? new Date(dateRaw) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

function normalizeMode(value: string) {
  if (value === "deeper" || value === "max") return value;
  return "fast";
}

if (isDirectRun(import.meta.url)) {
  runSafeHarvestCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
