import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { safeHarvest, summarizeSafeHarvest, type SafeHarvestMode, type SafeHarvestResult } from "../tools/data-harvesters/safe-orchestrator";
import { validateNormalizedFile } from "../src/lib/validation/normalizedFileValidator";

export type RealityCheckOptions = {
  matchId: string;
  teamNames: string[];
  mode: SafeHarvestMode;
  inboxPath?: string;
  env?: Record<string, string | undefined>;
  safeHarvestImpl?: typeof safeHarvest;
};

const acceptedFiles = ["roster.csv", "player_stats.csv", "map_stats.csv", "veto_history.csv", "h2h.csv", "news_events.csv", "manual_real_pack.json", "parsed_demo_export.json"];
const requiredForRealForecast = ["map_stats.csv", "player_stats.csv", "veto_history.csv"];

export async function runRealityCheck(options: RealityCheckOptions) {
  const env = options.env ?? process.env;
  const inboxPath = path.resolve(process.cwd(), options.inboxPath ?? env.PRIVATE_INBOX_PATH ?? path.join("data", "private-inbox"));
  const harvest = await (options.safeHarvestImpl ?? safeHarvest)({
    matchId: options.matchId,
    teamNames: options.teamNames,
    mode: options.mode,
    dryRun: true,
    inboxPath,
    env
  });
  const privateInbox = await scanInbox(inboxPath, options.matchId, options.teamNames);
  const missing = requiredForRealForecast.filter((fileName) => !privateInbox.files.some((file) => file.fileName === fileName && file.exists));
  return {
    ok: true,
    dryRun: true,
    matchId: options.matchId,
    teams: options.teamNames,
    env: {
      GRID_API_KEY: present(env.GRID_API_KEY),
      ENABLE_GRID_SYNC: enabled(env.ENABLE_GRID_SYNC),
      PANDASCORE_API_KEY: present(env.PANDASCORE_API_KEY),
      ENABLE_PANDASCORE_SYNC: enabled(env.ENABLE_PANDASCORE_SYNC),
      ENABLE_SAFE_HARVESTER: enabled(env.ENABLE_SAFE_HARVESTER),
      LIQUIPEDIA_API_KEY: "not_required_mediawiki_api"
    },
    harvest: summarizeSafeHarvest(harvest as SafeHarvestResult),
    privateInbox,
    nextAction: missing.length
      ? `Generate and fill real data for: ${missing.join(", ")}. Start with map_stats.csv for Evo Novo active-pool maps.`
      : "Private inbox contains core files. Validate in /admin/imports, apply trusted real data, then run data:pipeline."
  };
}

export async function runRealityCheckCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const matchId = requiredArg(args, "matchId");
  const teamNames = listArg(args, "teams");
  if (teamNames.length < 2) throw new Error('--teams must include two teams, for example "Evo Novo,WAZABI".');
  const result = await runRealityCheck({
    matchId,
    teamNames,
    mode: modeArg(stringArg(args, "mode")),
    inboxPath: stringArg(args, "inboxPath") || undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

async function scanInbox(inboxPath: string, matchId: string, teamNames: string[]) {
  let names: string[] = [];
  try {
    names = await readdir(inboxPath);
  } catch {
    names = [];
  }
  const files = [];
  for (const fileName of acceptedFiles) {
    const exists = names.includes(fileName);
    if (!exists) {
      files.push({ fileName, exists, status: "missing", rowsParsed: 0, warnings: [], errors: [] });
      continue;
    }
    const content = await readFile(path.join(inboxPath, fileName), "utf8");
    if (fileName.endsWith(".csv")) {
      const validation = validateNormalizedFile({ fileName, content, expectedMatchId: matchId, allowedTeamNames: teamNames });
      files.push({
        fileName,
        exists,
        status: validation.isValid ? "valid" : "invalid",
        rowsParsed: validation.rowsParsed,
        warnings: validation.warnings,
        errors: validation.errors
      });
      continue;
    }
    const parsed = safeParseJson(content);
    files.push({
      fileName,
      exists,
      status: parsed ? "present_json" : "invalid_json",
      rowsParsed: parsed ? countJsonRows(parsed) : 0,
      warnings: [],
      errors: parsed ? [] : ["JSON parse failed."]
    });
  }
  return {
    inboxPath,
    files: files.filter((file) => file.exists || requiredForRealForecast.includes(file.fileName) || file.fileName === "roster.csv")
  };
}

function present(value: string | undefined) {
  return value && value.trim() ? "configured" : "not_configured";
}

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase()) ? "enabled" : "disabled";
}

function safeParseJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function countJsonRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + (Array.isArray(item) ? item.length : 0), 0);
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string | boolean> = {};
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

function stringArg(args: Record<string, string | boolean>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function requiredArg(args: Record<string, string | boolean>, key: string) {
  const value = stringArg(args, key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function listArg(args: Record<string, string | boolean>, key: string) {
  return stringArg(args, key).split(",").map((value) => value.trim()).filter(Boolean);
}

function modeArg(value: string): SafeHarvestMode {
  return value === "deeper" || value === "max" ? value : "fast";
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runRealityCheckCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
