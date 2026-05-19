import { getISODate, mergeSheetRows, type CsvMergeResult } from "../data-fetchers/utils";
import { parseNumber, researchFetchText, stripTags, type ResearchFetchOptions } from "./hltv-client";

export type HltvPlayerStatsOptions = ResearchFetchOptions & {
  matchId: string;
  teamName: string;
  teamId: string;
  dryRun?: boolean;
  inboxPath?: string;
  period?: string;
  confidence?: number;
};

export async function fetchHltvPlayerStats(options: HltvPlayerStatsOptions) {
  const warnings: string[] = [];
  const writes: CsvMergeResult[] = [];
  if (!/^\d+$/.test(options.teamId)) return { rows: [], writes, warnings: ["HLTV team id is required for player stats."] };
  const rows: Array<Record<string, unknown>> = [];
  const allWarnings: string[] = [];
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://www.hltv.org/stats/players");
    url.searchParams.set("team", options.teamId);
    if (page > 0) url.searchParams.set("offset", String(page * 50));
    const response = await researchFetchText(url.toString(), options);
    allWarnings.push(...response.warnings);
    if (!response.body) break;
    const pageRows = extractHltvPlayerStats(response.body, {
      matchId: options.matchId,
      teamName: options.teamName,
      collectedAt: getISODate(options.now),
      period: options.period ?? "hltv_player_stats",
      confidence: options.confidence ?? 72
    });
    const before = rows.length;
    for (const row of pageRows) {
      const key = `${row.teamName}|${row.nickname}|${row.period}`;
      if (!rows.some((existing) => `${existing.teamName}|${existing.nickname}|${existing.period}` === key)) rows.push(row);
    }
    if (pageRows.length < 50 || rows.length === before) break;
  }
  if (!rows.length) {
    warnings.push("HLTV player stats page had no parseable rows.");
    return { rows, writes, warnings: [...allWarnings, ...warnings] };
  }
  writes.push(await mergeSheetRows("player_stats", rows, ["matchId", "teamName", "nickname", "sourceName", "period"], options));
  return { rows, writes, warnings: [...allWarnings, ...warnings] };
}

export function extractHltvPlayerStats(html: string, context: { matchId: string; teamName: string; collectedAt: string; period: string; confidence: number }) {
  const rows: Array<Record<string, unknown>> = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const cells = [...(match[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1] ?? ""));
    const row = playerStatsFromCells(cells, context);
    if (row) rows.push(row);
  }
  if (rows.length) return rows;
  const fallback: Array<Record<string, unknown>> = [];
  for (const line of html.split(/\r?\n/)) {
    const row = playerStatsFromCells(line.trim().split(/\s{2,}|\t+/), context);
    if (row) fallback.push(row);
  }
  return fallback;
}

function playerStatsFromCells(cells: string[], context: { matchId: string; teamName: string; collectedAt: string; period: string; confidence: number }) {
  const nickname = cells.find((cell) => /^[A-Za-z0-9_.-]{2,24}$/.test(cell) && !/^(player|maps|rating|kast|adr|impact)$/i.test(cell)) ?? "";
  if (!nickname) return null;
  const numbers = cells.slice(cells.indexOf(nickname) + 1).map(parseNumber).filter((value): value is number => value !== null);
  const maps = numbers[0] ?? 0;
  if (maps <= 0) return null;
  const kills = numbers.find((value) => value > 20 && Number.isInteger(value)) ?? "";
  const deaths = numbers.find((value, index) => index > 0 && value > 20 && Number.isInteger(value) && value !== kills) ?? "";
  const rating = numbers.find((value) => value > 0.4 && value < 2.5) ?? "";
  const adr = numbers.find((value) => value > 30 && value < 150 && value !== kills && value !== deaths) ?? "";
  const kast = numbers.find((value) => value > 30 && value <= 100) ?? "";
  const impact = numbers.find((value) => value > 0.4 && value < 2.5 && value !== rating) ?? "";
  if (rating === "" && adr === "" && kast === "" && kills === "") return null;
  return {
    matchId: context.matchId,
    teamName: context.teamName,
    nickname,
    maps,
    kills,
    deaths,
    assists: "",
    kd: typeof kills === "number" && typeof deaths === "number" && deaths > 0 ? Number((kills / deaths).toFixed(3)) : "",
    rating,
    adr,
    kast,
    impact,
    openingKills: "",
    openingDeaths: "",
    clutchesWon: "",
    clutchesAttempted: "",
    sourceName: "HLTV research player stats",
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: maps,
    confidence: context.confidence
  };
}
