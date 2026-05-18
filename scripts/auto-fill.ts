import { pathToFileURL } from "node:url";
import path from "node:path";
import { runAutoFill, type AutoFillMode } from "../tools/auto-fill";

type CliArgs = Record<string, string | boolean>;

export async function runAutoFillCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const teamA = stringArg(args, "teamA");
  const teamB = stringArg(args, "teamB");
  if (!teamA || !teamB) throw new Error('--teamA and --teamB are required, for example --teamA "Evo Novo" --teamB "WAZABI".');
  const result = await runAutoFill({
    matchId: requiredArg(args, "matchId"),
    teamNames: [teamA, teamB],
    mode: modeArg(stringArg(args, "mode")),
    dryRun: Boolean(args["dry-run"]),
    teamACsstatsMapUrl: stringArg(args, "teamA-map-url"),
    teamACsstatsPlayerUrl: stringArg(args, "teamA-player-url"),
    teamBCsstatsMapUrl: stringArg(args, "teamB-map-url"),
    teamBCsstatsPlayerUrl: stringArg(args, "teamB-player-url"),
    teamACsstatsMapFile: stringArg(args, "teamA-map-file"),
    teamACsstatsPlayerFile: stringArg(args, "teamA-player-file"),
    teamBCsstatsMapFile: stringArg(args, "teamB-map-file"),
    teamBCsstatsPlayerFile: stringArg(args, "teamB-player-file")
  });
  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "dry-run") {
      parsed[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function stringArg(args: CliArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function requiredArg(args: CliArgs, key: string) {
  const value = stringArg(args, key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function modeArg(value: string): AutoFillMode {
  if (value === "deeper" || value === "max") return value;
  return "fast";
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runAutoFillCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
