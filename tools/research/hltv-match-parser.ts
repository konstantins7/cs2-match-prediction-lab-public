import { getISODate, mergeSheetRows, stableSlug, type CsvMergeResult } from "../data-fetchers/utils";
import { decodeHtml, hltvSlug, normalizeMapName, parseNumber, researchFetchText, stripTags, type ResearchFetchOptions } from "./hltv-client";

export type HltvMatchParseOptions = ResearchFetchOptions & {
  matchId: string;
  teamA: string;
  teamB: string;
  hltvMatchId?: string;
  matchUrl?: string;
  dryRun?: boolean;
  inboxPath?: string;
  period?: string;
  confidence?: number;
};

export type HltvMatchParseResult = {
  vetoRows: Array<Record<string, unknown>>;
  h2hRows: Array<Record<string, unknown>>;
  teamIds: Record<string, string>;
  writes: CsvMergeResult[];
  warnings: string[];
};

export async function parseHltvMatchPage(options: HltvMatchParseOptions): Promise<HltvMatchParseResult> {
  const warnings: string[] = [];
  const writes: CsvMergeResult[] = [];
  const url = options.matchUrl ?? buildHltvMatchUrl(options.hltvMatchId ?? "", options.teamA, options.teamB);
  if (!url) return { vetoRows: [], h2hRows: [], teamIds: {}, writes, warnings: ["HLTV match id or matchUrl is required."] };
  const response = await researchFetchText(url, options);
  if (!response.body) return { vetoRows: [], h2hRows: [], teamIds: {}, writes, warnings: response.warnings };

  const collectedAt = getISODate(options.now);
  const context = {
    matchId: options.matchId,
    teamA: options.teamA,
    teamB: options.teamB,
    collectedAt,
    period: options.period ?? "hltv_match_page",
    confidence: options.confidence ?? 62
  };
  const vetoRows = extractVetoRows(response.body, context);
  const h2hRows = extractH2hRows(response.body, context);
  const teamIds = extractTeamIds(response.body, [options.teamA, options.teamB]);
  if (vetoRows.length) writes.push(await mergeSheetRows("veto_history", vetoRows, ["matchId", "teamName", "mapName", "sourceName", "period"], options));
  else warnings.push("HLTV match page had no parseable veto rows.");
  if (h2hRows.length) writes.push(await mergeSheetRows("h2h", h2hRows, ["matchId", "date", "teamA", "teamB", "mapName", "sourceName"], options));
  else warnings.push("HLTV match page had no parseable H2H rows.");
  return { vetoRows, h2hRows, teamIds, writes, warnings: [...response.warnings, ...warnings] };
}

export function buildHltvMatchUrl(hltvMatchId: string, teamA: string, teamB: string) {
  if (!/^\d+$/.test(hltvMatchId)) return "";
  return `https://www.hltv.org/matches/${hltvMatchId}/${hltvSlug(teamA)}-vs-${hltvSlug(teamB)}`;
}

export function extractVetoRows(html: string, context: { matchId: string; teamA: string; teamB: string; collectedAt: string; period: string; confidence: number }) {
  const rows: Array<Record<string, unknown>> = [];
  const text = normalizeText(html);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const teamNames = [context.teamA, context.teamB];
  for (const line of lines) {
    const leftOver = line.match(/^(?:\d+\.\s*)?([A-Za-z0-9_ -]+)\s+(?:was\s+)?left over$/i);
    if (leftOver) {
      const mapName = normalizeMapName(leftOver[1] ?? "");
      if (mapName) for (const team of teamNames) rows.push(vetoRow(context, team, mapName, 0, 0, 100));
      continue;
    }
    const veto = line.match(/^(?:\d+\.\s*)?(.+?)\s+(removed|banned|picked|left over|decider)\s+([A-Za-z0-9_ -]+)$/i);
    if (!veto) continue;
    const rawTeam = veto[1]?.trim() ?? "";
    const action = (veto[2] ?? "").toLowerCase();
    const mapName = normalizeMapName(veto[3] ?? "");
    const teamName = resolveTeam(rawTeam, teamNames);
    if (!mapName) continue;
    if (action.includes("left") || action.includes("decider")) {
      for (const team of teamNames) rows.push(vetoRow(context, team, mapName, 0, 0, 100));
      continue;
    }
    if (!teamName) continue;
    rows.push(vetoRow(context, teamName, mapName, action.includes("pick") ? 100 : 0, action.includes("pick") ? 0 : 100, 0));
  }
  const seenDeciders = new Set(rows.filter((row) => row.deciderRate === 100).map((row) => String(row.mapName)));
  const deciderPattern = /\b(Mirage|Inferno|Nuke|Ancient|Anubis|Dust2|Train)\b\s+(?:was\s+)?left over/gi;
  let decider: RegExpExecArray | null;
  while ((decider = deciderPattern.exec(text)) !== null) {
    const mapName = normalizeMapName(decider[1] ?? "");
    if (!mapName || seenDeciders.has(mapName)) continue;
    seenDeciders.add(mapName);
    for (const team of teamNames) rows.push(vetoRow(context, team, mapName, 0, 0, 100));
  }
  return rows;
}

export function extractH2hRows(html: string, context: { matchId: string; teamA: string; teamB: string; collectedAt: string; period: string; confidence: number }) {
  const rows: Array<Record<string, unknown>> = [];
  const text = normalizeText(html);
  const h2hPattern = /(\d{4}[-/.]\d{2}[-/.]\d{2}).{0,80}?([A-Za-z0-9_ .-]+)\s+(\d{1,2})\s*[-:]\s*(\d{1,2})\s+([A-Za-z0-9_ .-]+)(?:\s+([A-Za-z0-9 ]+))?/gi;
  let match: RegExpExecArray | null;
  while ((match = h2hPattern.exec(text)) !== null && rows.length < 5) {
    const left = resolveTeam(match[2] ?? "", [context.teamA, context.teamB]);
    const right = resolveTeam(match[5] ?? "", [context.teamA, context.teamB]);
    const mapName = normalizeMapName(match[6] ?? "") || findMapInText(match[0] ?? "") || "unknown";
    const scoreA = parseNumber(match[3] ?? "") ?? 0;
    const scoreB = parseNumber(match[4] ?? "") ?? 0;
    if (!left || !right || scoreA === scoreB) continue;
    rows.push({
      matchId: context.matchId,
      date: normalizeDate(match[1] ?? ""),
      teamA: left,
      teamB: right,
      winner: scoreA > scoreB ? left : right,
      format: "BO3",
      mapName,
      scoreA,
      scoreB,
      rosterSimilarity: "",
      sourceName: "HLTV research match page",
      collectedAt: context.collectedAt,
      period: context.period,
      sampleSize: 1,
      confidence: context.confidence
    });
  }
  return rows;
}

function findMapInText(value: string) {
  for (const mapName of ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"]) {
    if (new RegExp(`\\b${mapName}\\b`, "i").test(value)) return mapName;
  }
  return "";
}

export function extractTeamIds(html: string, teamNames: string[]) {
  const ids: Record<string, string> = {};
  const pattern = /<a\b[^>]*href=["']\/team\/(\d+)\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const id = match[1] ?? "";
    const label = `${match[2] ?? ""} ${stripTags(match[3] ?? "")}`;
    const team = resolveTeam(label, teamNames);
    if (team && id) ids[team] = id;
  }
  return ids;
}

function vetoRow(context: { matchId: string; collectedAt: string; period: string; confidence: number }, teamName: string, mapName: string, pickRate: number, banRate: number, deciderRate: number) {
  return {
    matchId: context.matchId,
    teamName,
    mapName,
    sampleSize: 1,
    pickRate,
    banRate,
    deciderRate,
    sourceName: "HLTV research match page",
    collectedAt: context.collectedAt,
    period: context.period,
    confidence: context.confidence
  };
}

function normalizeText(html: string) {
  return decodeHtml(html)
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<tr\b[^>]*>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n");
}

function resolveTeam(value: string, teamNames: string[]) {
  const normalized = stableSlug(value);
  return teamNames.find((team) => normalized.includes(stableSlug(team)) || stableSlug(team).includes(normalized)) ?? "";
}

function normalizeDate(value: string) {
  const date = new Date(value.replace(/\./g, "-").replace(/\//g, "-"));
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
