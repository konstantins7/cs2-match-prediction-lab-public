import { readFile } from "node:fs/promises";
import {
  fetchText,
  getISODate,
  mergeSheetRows,
  numberAt,
  stableSlug,
  textAt,
  type FetchLike
} from "../data-fetchers/utils";

export type CsstatsImportType = "map_stats" | "player_stats";

export type CsstatsImportOptions = {
  url?: string;
  filePath?: string;
  matchId: string;
  teamName: string;
  type: CsstatsImportType;
  sourceName: string;
  collectedAt?: string;
  period?: string;
  confidence: number;
  inboxPath: string;
  dryRun?: boolean;
  fetchImpl?: FetchLike;
};

export type CsstatsImportResult = {
  file: string;
  rows: number;
  warnings: string[];
};

const allowedHosts = new Set(["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"]);
const activeMaps = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

export async function importCsstatsCsv(options: CsstatsImportOptions): Promise<CsstatsImportResult> {
  validateImportOptions(options);
  const content = await readCsvInput(options);
  const rows = parseCsv(content);
  if (!rows.length) throw new Error("CSStats CSV contains no data rows.");
  const collectedAt = options.collectedAt ?? getISODate();
  const period = options.period || "csstats_export";
  const normalized = options.type === "map_stats"
    ? normalizeMapRows(rows, options, collectedAt, period)
    : normalizePlayerRows(rows, options, collectedAt, period);
  if (!normalized.length) throw new Error(`CSStats CSV produced no valid ${options.type} rows for ${options.teamName}.`);
  const merge = await mergeSheetRows(
    options.type,
    normalized,
    options.type === "map_stats"
      ? ["matchId", "teamName", "mapName", "sourceName", "period"]
      : ["matchId", "teamName", "nickname", "sourceName", "period"],
    { inboxPath: options.inboxPath, dryRun: options.dryRun }
  );
  return {
    file: merge.fileName,
    rows: merge.rowsInserted,
    warnings: merge.rowsSkipped ? [`Skipped ${merge.rowsSkipped} duplicate ${options.type} row(s).`] : []
  };
}

function validateImportOptions(options: CsstatsImportOptions) {
  if (Boolean(options.url) === Boolean(options.filePath)) throw new Error("Provide exactly one of url or filePath.");
  if (!options.matchId.trim()) throw new Error("matchId is required.");
  if (!options.teamName.trim() || isPlaceholder(options.teamName)) throw new Error("teamName is required.");
  if (!options.sourceName.trim() || isPlaceholder(options.sourceName)) throw new Error("sourceName is required and cannot be placeholder text.");
  if (!Number.isFinite(options.confidence) || options.confidence <= 0) throw new Error("confidence must be greater than 0.");
  if (options.url) {
    const host = new URL(options.url).hostname.toLowerCase();
    if (!allowedHosts.has(host)) throw new Error(`CSStats CSV URL host is not allowed: ${host}.`);
  }
}

async function readCsvInput(options: CsstatsImportOptions) {
  if (options.filePath) return readFile(options.filePath, "utf8");
  return fetchText(options.url ?? "", {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "CS2MatchPredictionLab/0.9.4 safe csv import"
    }
  }, options.fetchImpl);
}

function normalizeMapRows(rows: Array<Record<string, string>>, options: CsstatsImportOptions, collectedAt: string, period: string) {
  return rows.map((row) => {
    assertTeam(row, options.teamName);
    const mapName = normalizeMap(textAt(row, ["mapName", "map", "name"]));
    const mapsPlayed = numberAt(row, ["mapsPlayed", "maps", "played", "sampleSize"]);
    if (!mapName) throw new Error(`Invalid or unsupported mapName in CSStats CSV for ${options.teamName}.`);
    if (!mapsPlayed || mapsPlayed <= 0) throw new Error(`CSStats map row for ${options.teamName}/${mapName} must include mapsPlayed > 0.`);
    return {
      matchId: options.matchId,
      teamName: options.teamName,
      mapName,
      mapsPlayed,
      wins: numberAt(row, ["wins", "w"]) ?? "",
      losses: numberAt(row, ["losses", "l"]) ?? "",
      winRate: numberAt(row, ["winRate", "winrate", "winPct", "win%"]) ?? "",
      roundsWon: numberAt(row, ["roundsWon", "rounds_won"]) ?? "",
      roundsLost: numberAt(row, ["roundsLost", "rounds_lost"]) ?? "",
      ctRoundWinRate: numberAt(row, ["ctRoundWinRate", "ctWinRate"]) ?? "",
      tRoundWinRate: numberAt(row, ["tRoundWinRate", "tWinRate"]) ?? "",
      pickRate: numberAt(row, ["pickRate"]) ?? "",
      banRate: numberAt(row, ["banRate"]) ?? "",
      deciderRate: numberAt(row, ["deciderRate"]) ?? "",
      sourceName: options.sourceName,
      collectedAt,
      period,
      sampleSize: mapsPlayed,
      confidence: options.confidence
    };
  });
}

function normalizePlayerRows(rows: Array<Record<string, string>>, options: CsstatsImportOptions, collectedAt: string, period: string) {
  return rows.map((row) => {
    assertTeam(row, options.teamName);
    const nickname = textAt(row, ["nickname", "player", "playerName", "name"]);
    const maps = numberAt(row, ["maps", "mapsPlayed", "sampleSize"]);
    if (!nickname || isPlaceholder(nickname)) throw new Error(`CSStats player row for ${options.teamName} is missing nickname.`);
    if (!maps || maps <= 0) throw new Error(`CSStats player row for ${options.teamName}/${nickname} must include maps > 0.`);
    const usefulStats = ["kills", "deaths", "assists", "kd", "rating", "adr", "kast", "impact"].some((key) => numberAt(row, [key]) !== null);
    if (!usefulStats) throw new Error(`CSStats player row for ${options.teamName}/${nickname} has no useful player stats.`);
    return {
      matchId: options.matchId,
      teamName: options.teamName,
      nickname,
      maps,
      kills: numberAt(row, ["kills", "k"]) ?? "",
      deaths: numberAt(row, ["deaths", "d"]) ?? "",
      assists: numberAt(row, ["assists", "a"]) ?? "",
      kd: numberAt(row, ["kd", "kdr"]) ?? "",
      rating: numberAt(row, ["rating", "rating2", "rating_2_0"]) ?? "",
      adr: numberAt(row, ["adr", "averageDamage"]) ?? "",
      kast: numberAt(row, ["kast"]) ?? "",
      impact: numberAt(row, ["impact"]) ?? "",
      openingKills: numberAt(row, ["openingKills", "opening_kills"]) ?? "",
      openingDeaths: numberAt(row, ["openingDeaths", "opening_deaths"]) ?? "",
      clutchesWon: numberAt(row, ["clutchesWon", "clutches_won"]) ?? "",
      clutchesAttempted: numberAt(row, ["clutchesAttempted", "clutches_attempted"]) ?? "",
      sourceName: options.sourceName,
      collectedAt,
      period,
      sampleSize: maps,
      confidence: options.confidence
    };
  });
}

function assertTeam(row: Record<string, string>, expectedTeam: string) {
  const rawTeam = textAt(row, ["teamName", "team", "team_name"]);
  if (rawTeam && stableSlug(rawTeam) !== stableSlug(expectedTeam)) {
    throw new Error(`CSStats CSV row team ${rawTeam} does not match expected team ${expectedTeam}.`);
  }
}

function normalizeMap(value: string) {
  const slug = stableSlug(value);
  return activeMaps.find((map) => stableSlug(map) === slug) ?? "";
}

function parseCsv(content: string) {
  const table = parseDelimited(content);
  const headers = table[0]?.map((header) => header.trim()) ?? [];
  if (!headers.length) throw new Error("CSStats CSV header row is missing.");
  return table.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function parseDelimited(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (!quoted && char === "\n") {
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char !== "\r") current += char;
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function isPlaceholder(value: string) {
  return ["source", "source name", "example", "placeholder", "template", "team a", "team b"].includes(value.trim().toLowerCase());
}
