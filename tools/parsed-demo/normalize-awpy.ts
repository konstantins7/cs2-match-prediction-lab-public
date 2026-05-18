import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type AwpyNormalizeOptions = {
  input: unknown;
  matchId: string;
  teamNames: string[];
  sourceName: string;
  collectedAt: string;
  period: string;
  confidence: number;
};

const activeMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

export function normalizeAwpyJson(options: AwpyNormalizeOptions) {
  validateOptions(options);
  const playerRows = normalizePlayerRows(options);
  const mapRows = normalizeMapRows(options);
  if (!playerRows.length && !mapRows.length) throw new Error("AWPy JSON contains no useful player or map stats.");
  const sampleSize = Math.max(
    1,
    ...playerRows.map((row) => Number(row.maps || row.rounds || 0)),
    ...mapRows.map((row) => Number(row.mapsPlayed || 0)),
    rowsAt(options.input, ["rounds", "gameRounds"]).length
  );
  return {
    type: "parsed_demo_export",
    sourceTool: "awpy",
    matchId: options.matchId,
    dataRole: "historical_team_form",
    sourceName: options.sourceName,
    collectedAt: options.collectedAt,
    sourceDate: options.collectedAt,
    period: options.period,
    sampleSize,
    confidence: options.confidence,
    teams: options.teamNames.map((teamName) => ({ teamName })),
    players: playerRows,
    maps: mapRows,
    teamForms: normalizeTeamForms(options, sampleSize),
    rounds: []
  };
}

export async function runNormalizeAwpyCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const inputPath = requiredArg(args, "input");
  const outputPath = requiredArg(args, "out");
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const exportJson = normalizeAwpyJson({
    input: payload,
    matchId: requiredArg(args, "matchId"),
    teamNames: listArg(args, "teams"),
    sourceName: requiredArg(args, "sourceName"),
    collectedAt: requiredArg(args, "collectedAt"),
    period: requiredArg(args, "period"),
    confidence: numberArg(args, "confidence")
  });
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(exportJson, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    file: outputPath,
    players: exportJson.players.length,
    maps: exportJson.maps.length,
    sampleSize: exportJson.sampleSize,
    note: "File written only; validate/preview/apply through /admin/imports."
  }, null, 2));
}

function normalizePlayerRows(options: AwpyNormalizeOptions) {
  const direct = rowsAt(options.input, ["playerStats", "player_stats", "players"]).map((row) => {
    const nickname = text(row, ["nickname", "playerName", "name", "steamName"]);
    const teamName = resolveTeamName(options.teamNames, text(row, ["teamName", "team", "team_name"]));
    if (!nickname || !teamName) return null;
    return {
      teamName,
      nickname,
      maps: positiveOrDefault(row, ["maps", "mapsPlayed", "matches"], 1),
      rounds: numberValue(row, ["rounds", "roundsPlayed"]),
      kills: numberValue(row, ["kills", "k"]),
      deaths: numberValue(row, ["deaths", "d"]),
      assists: numberValue(row, ["assists", "a"]),
      kd: numberValue(row, ["kd", "kdr"]),
      rating: numberValue(row, ["rating", "rating2", "rating_2_0"]),
      adr: numberValue(row, ["adr", "averageDamage"]),
      kast: numberValue(row, ["kast"]),
      impact: numberValue(row, ["impact"]),
      role: text(row, ["role", "position"]) || "unknown"
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row && hasUsefulPlayerStats(row)));
  if (direct.length) return direct;
  return normalizePlayersFromRounds(options);
}

function normalizePlayersFromRounds(options: AwpyNormalizeOptions) {
  const playerTeams = playerTeamMap(options);
  const stats = new Map<string, { teamName: string; nickname: string; kills: number; deaths: number; assists: number; rounds: number }>();
  const rounds = rowsAt(options.input, ["rounds", "gameRounds"]);
  for (const round of rounds) {
    for (const kill of rowsAt(round, ["kills"])) {
      const attacker = text(kill, ["attackerName", "attacker", "attackerSteamName"]);
      const victim = text(kill, ["victimName", "victim", "victimSteamName"]);
      const assister = text(kill, ["assisterName", "assister", "assistantName"]);
      const attackerTeam = resolveTeamName(options.teamNames, text(kill, ["attackerTeamName", "attackerTeam"])) ?? playerTeams.get(slug(attacker));
      const victimTeam = resolveTeamName(options.teamNames, text(kill, ["victimTeamName", "victimTeam"])) ?? playerTeams.get(slug(victim));
      if (attacker && attackerTeam) addPlayerStat(stats, attackerTeam, attacker, "kills", rounds.length);
      if (victim && victimTeam) addPlayerStat(stats, victimTeam, victim, "deaths", rounds.length);
      const assisterTeam = assister ? playerTeams.get(slug(assister)) ?? attackerTeam : "";
      if (assister && assisterTeam) addPlayerStat(stats, assisterTeam, assister, "assists", rounds.length);
    }
  }
  return [...stats.values()].map((row) => ({
    teamName: row.teamName,
    nickname: row.nickname,
    maps: 1,
    rounds: row.rounds,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    kd: row.deaths > 0 ? Number((row.kills / row.deaths).toFixed(3)) : row.kills,
    rating: "",
    adr: "",
    kast: "",
    impact: "",
    role: "unknown"
  })).filter(hasUsefulPlayerStats);
}

function normalizeMapRows(options: AwpyNormalizeOptions) {
  return rowsAt(options.input, ["mapStats", "map_stats", "maps"]).map((row) => {
    const teamName = resolveTeamName(options.teamNames, text(row, ["teamName", "team", "team_name"]));
    const mapName = normalizeMap(text(row, ["mapName", "map", "name"]));
    if (!teamName || !mapName) return null;
    return {
      teamName,
      mapName,
      mapsPlayed: positiveOrDefault(row, ["mapsPlayed", "maps", "played"], 1),
      wins: numberValue(row, ["wins", "w"]),
      losses: numberValue(row, ["losses", "l"]),
      winRate: numberValue(row, ["winRate", "winrate", "winPct"]),
      roundsWon: numberValue(row, ["roundsWon", "rounds_won"]),
      roundsLost: numberValue(row, ["roundsLost", "rounds_lost"]),
      ctRoundWinRate: numberValue(row, ["ctRoundWinRate", "ctWinRate"]),
      tRoundWinRate: numberValue(row, ["tRoundWinRate", "tWinRate"]),
      pickRate: numberValue(row, ["pickRate"]),
      banRate: numberValue(row, ["banRate"]),
      pistolWinRate: numberValue(row, ["pistolWinRate"]),
      forceBuyWinRate: numberValue(row, ["forceBuyWinRate"])
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function normalizeTeamForms(options: AwpyNormalizeOptions, sampleSize: number) {
  return options.teamNames.map((teamName) => ({
    teamName,
    mapsPlayed: sampleSize,
    source: "awpy"
  }));
}

function validateOptions(options: AwpyNormalizeOptions) {
  if (!options.matchId.trim()) throw new Error("--matchId is required.");
  if (options.teamNames.length < 2) throw new Error("--teams must include two teams.");
  if (!options.sourceName.trim() || isPlaceholder(options.sourceName)) throw new Error("--sourceName is required and cannot be placeholder text.");
  if (!options.collectedAt.trim() || Number.isNaN(Date.parse(options.collectedAt))) throw new Error("--collectedAt must be an ISO date.");
  if (!options.period.trim() || isPlaceholder(options.period)) throw new Error("--period is required.");
  if (!Number.isFinite(options.confidence) || options.confidence <= 0) throw new Error("--confidence must be greater than 0.");
}

function addPlayerStat(stats: Map<string, { teamName: string; nickname: string; kills: number; deaths: number; assists: number; rounds: number }>, teamName: string, nickname: string, field: "kills" | "deaths" | "assists", rounds: number) {
  const key = `${slug(teamName)}:${slug(nickname)}`;
  const current = stats.get(key) ?? { teamName, nickname, kills: 0, deaths: 0, assists: 0, rounds };
  current[field] += 1;
  current.rounds = Math.max(current.rounds, rounds);
  stats.set(key, current);
}

function playerTeamMap(options: AwpyNormalizeOptions) {
  const map = new Map<string, string>();
  for (const row of rowsAt(options.input, ["players", "playerStats", "player_stats"])) {
    const nickname = text(row, ["nickname", "playerName", "name", "steamName"]);
    const teamName = resolveTeamName(options.teamNames, text(row, ["teamName", "team", "team_name"]));
    if (nickname && teamName) map.set(slug(nickname), teamName);
  }
  return map;
}

function rowsAt(value: unknown, keys: string[]): Record<string, unknown>[] {
  const direct = record(value);
  for (const key of keys) {
    const candidate = direct[key];
    if (Array.isArray(candidate)) return candidate.map(record);
  }
  return [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const parsed = parseNumber(row[key]);
    if (parsed !== null) return parsed;
  }
  return "";
}

function positiveOrDefault(row: Record<string, unknown>, keys: string[], fallback: number) {
  const parsed = numberValue(row, keys);
  return typeof parsed === "number" && parsed > 0 ? parsed : fallback;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTeamName(teamNames: string[], value: string) {
  const normalized = slug(value);
  return teamNames.find((teamName) => slug(teamName) === normalized) ?? "";
}

function normalizeMap(value: string) {
  const normalized = slug(value);
  return activeMaps.find((mapName) => slug(mapName) === normalized) ?? "";
}

function hasUsefulPlayerStats(row: { kills?: unknown; deaths?: unknown; assists?: unknown; kd?: unknown; rating?: unknown; adr?: unknown; kast?: unknown; impact?: unknown }) {
  return [row.kills, row.deaths, row.assists, row.kd, row.rating, row.adr, row.kast, row.impact].some((value) => value !== "" && value !== undefined && value !== null);
}

function isPlaceholder(value: string) {
  return ["source", "source name", "example", "placeholder", "template"].includes(value.trim().toLowerCase());
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/^de[_-]?/, "").replace(/[^a-z0-9]+/g, "");
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

function listArg(args: Record<string, string | boolean>, key: string) {
  return requiredArg(args, key).split(",").map((value) => value.trim()).filter(Boolean);
}

function numberArg(args: Record<string, string | boolean>, key: string) {
  const parsed = Number(requiredArg(args, key));
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be numeric.`);
  return parsed;
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runNormalizeAwpyCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
