import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analystSheetTemplates, quoteCsv, type AnalystSheetType } from "../src/lib/analystSheetTemplates";

type TemplateSheetType = "map_stats" | "player_stats" | "veto_history";

export type TemplateOptions = {
  type: TemplateSheetType;
  matchId: string;
  teamName: string;
  collectedAt?: string;
  period?: string;
};

const activeMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

export function generateAnalystSheetTemplate(options: TemplateOptions) {
  assertTemplateOptions(options);
  const template = analystSheetTemplates[options.type as AnalystSheetType];
  const rows: Array<Record<string, string>> = templateRows(options);
  return `${template.columns.join(",")}\n${rows.map((row) => template.columns.map((column) => quoteCsv(row[column] ?? "")).join(",")).join("\n")}\n`;
}

export async function runTemplateAnalystSheetCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const type = stringArg(args, "type") as TemplateSheetType;
  const outputPath = requiredArg(args, "out");
  const csv = generateAnalystSheetTemplate({
    type,
    matchId: requiredArg(args, "matchId"),
    teamName: requiredArg(args, "team"),
    collectedAt: stringArg(args, "collectedAt") || undefined,
    period: stringArg(args, "period") || undefined
  });
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, csv, "utf8");
  console.log(JSON.stringify({
    ok: true,
    file: outputPath,
    type,
    rows: csv.trim().split(/\r?\n/).length - 1,
    note: "Template rows are intentionally invalid until real sourceName, sampleSize and confidence are filled."
  }, null, 2));
}

function templateRows(options: TemplateOptions) {
  const collectedAt = options.collectedAt ?? new Date().toISOString();
  const sourceName = "source name";
  if (options.type === "player_stats") {
    return Array.from({ length: 5 }, (_, index) => ({
      matchId: options.matchId,
      teamName: options.teamName,
      nickname: `player_name_${index + 1}`,
      maps: "0",
      kills: "0",
      deaths: "0",
      assists: "0",
      kd: "0",
      rating: "0",
      adr: "0",
      kast: "0",
      impact: "0",
      openingKills: "0",
      openingDeaths: "0",
      clutchesWon: "0",
      clutchesAttempted: "0",
      sourceName,
      collectedAt,
      period: options.period ?? "last_30_days",
      sampleSize: "0",
      confidence: "0"
    }));
  }
  if (options.type === "map_stats") {
    return activeMaps.map((mapName) => ({
      matchId: options.matchId,
      teamName: options.teamName,
      mapName,
      mapsPlayed: "0",
      wins: "0",
      losses: "0",
      winRate: "0",
      roundsWon: "0",
      roundsLost: "0",
      ctRoundWinRate: "0",
      tRoundWinRate: "0",
      pickRate: "0",
      banRate: "0",
      deciderRate: "0",
      sourceName,
      collectedAt,
      period: options.period ?? "last_90_days",
      sampleSize: "0",
      confidence: "0"
    }));
  }
  return activeMaps.map((mapName) => ({
    matchId: options.matchId,
    teamName: options.teamName,
    mapName,
    sampleSize: "0",
    pickRate: "0",
    banRate: "0",
    deciderRate: "0",
    sourceName,
    collectedAt,
    period: options.period ?? "last_90_days",
    confidence: "0"
  }));
}

function assertTemplateOptions(options: TemplateOptions) {
  if (!["map_stats", "player_stats", "veto_history"].includes(options.type)) {
    throw new Error("Unsupported --type. Use map_stats, player_stats or veto_history.");
  }
  if (!options.matchId.trim()) throw new Error("--matchId is required.");
  if (!options.teamName.trim()) throw new Error("--team is required.");
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runTemplateAnalystSheetCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
