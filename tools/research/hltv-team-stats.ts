import { getISODate, mergeSheetRows, type CsvMergeResult } from "../data-fetchers/utils";
import { hltvSlug, normalizeMapName, parseNumber, researchFetchText, stripTags, type ResearchFetchOptions } from "./hltv-client";

export type HltvTeamStatsOptions = ResearchFetchOptions & {
  matchId: string;
  teamName: string;
  teamId: string;
  dryRun?: boolean;
  inboxPath?: string;
  period?: string;
  confidence?: number;
};

export async function fetchHltvTeamMapStats(options: HltvTeamStatsOptions) {
  const warnings: string[] = [];
  const writes: CsvMergeResult[] = [];
  if (!/^\d+$/.test(options.teamId)) return { rows: [], writes, warnings: ["HLTV team id is required for map stats."] };
  const urls = [
    `https://www.hltv.org/stats/teams/maps/${options.teamId}/${hltvSlug(options.teamName)}`,
    `https://www.hltv.org/stats/teams/mapstats/${options.teamId}/${hltvSlug(options.teamName)}`
  ];
  let rows: Array<Record<string, unknown>> = [];
  for (const url of urls) {
    const response = await researchFetchText(url, options);
    warnings.push(...response.warnings);
    if (!response.body) continue;
    rows = extractHltvMapStats(response.body, {
      matchId: options.matchId,
      teamName: options.teamName,
      collectedAt: getISODate(options.now),
      period: options.period ?? (url.includes("/mapstats/") ? "hltv_team_mapstats" : "hltv_team_maps"),
      confidence: options.confidence ?? 72
    });
    if (rows.length) break;
  }
  if (rows.length) writes.push(await mergeSheetRows("map_stats", rows, ["matchId", "teamName", "mapName", "sourceName", "period"], options));
  else warnings.push("HLTV team map stats page had no parseable rows.");
  return { rows, writes, warnings };
}

export function extractHltvMapStats(html: string, context: { matchId: string; teamName: string; collectedAt: string; period: string; confidence: number }) {
  const rows: Array<Record<string, unknown>> = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const cells = [...(match[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1] ?? ""));
    const row = mapStatsFromCells(cells, context);
    if (row) rows.push(row);
  }
  if (rows.length) return rows;
  const fallback: Array<Record<string, unknown>> = [];
  for (const line of html.split(/\r?\n/)) {
    const row = mapStatsFromCells(line.trim().split(/\s{2,}|\t+/), context);
    if (row) fallback.push(row);
  }
  return fallback;
}

function mapStatsFromCells(cells: string[], context: { matchId: string; teamName: string; collectedAt: string; period: string; confidence: number }) {
  const mapIndex = cells.findIndex((cell) => normalizeMapName(cell));
  if (mapIndex < 0) return null;
  const mapName = normalizeMapName(cells[mapIndex] ?? "");
  const numbers = cells.slice(mapIndex + 1).map(parseNumber).filter((value): value is number => value !== null);
  const mapsPlayed = numbers[0] ?? 0;
  if (mapsPlayed <= 0) return null;
  const wins = numbers[1] ?? "";
  const losses = numbers[2] ?? (typeof wins === "number" ? Math.max(0, mapsPlayed - wins) : "");
  const winRate = numbers.find((value) => value >= 0 && value <= 100 && value !== mapsPlayed && value !== wins && value !== losses) ?? "";
  return {
    matchId: context.matchId,
    teamName: context.teamName,
    mapName,
    mapsPlayed,
    wins,
    losses,
    winRate,
    roundsWon: "",
    roundsLost: "",
    ctRoundWinRate: "",
    tRoundWinRate: "",
    pickRate: "",
    banRate: "",
    deciderRate: "",
    sourceName: "HLTV research team map stats",
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: mapsPlayed,
    confidence: context.confidence
  };
}
