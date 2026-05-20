import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { H2hRow, MapStatsRow, NewsEventRow, ParsedDemoSummary, PlayerStatsRow, PrivateAnalysisData, RosterRow, VetoHistoryRow } from "./types";

const inboxDir = path.join(process.cwd(), "data", "private-inbox");

export async function loadPrivateAnalysisData(matchId: string): Promise<PrivateAnalysisData> {
  const warnings: string[] = [];
  const files = await readInboxFiles();
  if (!files.size) warnings.push("Private inbox is empty or unavailable.");
  const roster = parseCsvRows(files.get("roster.csv") ?? "").filter((row) => row.matchId === matchId).map(rosterRow);
  const playerStats = parseCsvRows(files.get("player_stats.csv") ?? "").filter((row) => row.matchId === matchId).map(playerStatsRow);
  const mapStats = parseCsvRows(files.get("map_stats.csv") ?? "").filter((row) => row.matchId === matchId).map(mapStatsRow);
  const vetoHistory = parseCsvRows(files.get("veto_history.csv") ?? "").filter((row) => row.matchId === matchId).map(vetoHistoryRow);
  const h2h = parseCsvRows(files.get("h2h.csv") ?? "").filter((row) => row.matchId === matchId).map(h2hRow);
  const newsEvents = parseCsvRows(files.get("news_events.csv") ?? "").filter((row) => row.matchId === matchId).map(newsEventRow);
  const parsedDemo = parseDemo(files.get("parsed_demo_export.json") ?? "", warnings);
  return {
    roster,
    playerStats,
    mapStats,
    vetoHistory,
    h2h,
    newsEvents,
    parsedDemo,
    fingerprint: await inboxFingerprint(),
    warnings
  };
}

async function readInboxFiles() {
  const files = new Map<string, string>();
  try {
    const entries = await readdir(inboxDir);
    for (const fileName of entries) {
      if (!["roster.csv", "player_stats.csv", "map_stats.csv", "veto_history.csv", "h2h.csv", "news_events.csv", "parsed_demo_export.json"].includes(fileName)) continue;
      files.set(fileName, await readFile(path.join(inboxDir, fileName), "utf8"));
    }
  } catch {
    // Empty inbox is an expected state.
  }
  return files;
}

export async function inboxFingerprint() {
  const hash = createHash("sha256");
  try {
    const entries = await readdir(inboxDir);
    for (const fileName of entries.sort()) {
      if (!/\.(csv|json)$/i.test(fileName)) continue;
      const fullPath = path.join(inboxDir, fileName);
      const info = await stat(fullPath);
      hash.update(`${fileName}:${info.size}:${info.mtimeMs};`);
    }
  } catch {
    hash.update("missing-inbox");
  }
  return hash.digest("hex");
}

export function parseCsvRows(content: string) {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [] as Record<string, string>[];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
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
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function rosterRow(row: Record<string, string>): RosterRow {
  return {
    matchId: row.matchId,
    teamName: row.teamName,
    nickname: row.nickname,
    role: row.role,
    country: row.country,
    collectedAt: row.collectedAt,
    period: row.period,
    sampleSize: num(row.sampleSize),
    confidence: num(row.confidence)
  };
}

function playerStatsRow(row: Record<string, string>): PlayerStatsRow {
  return {
    matchId: row.matchId,
    teamName: row.teamName,
    nickname: row.nickname,
    mapName: row.mapName,
    maps: num(row.maps),
    kills: num(row.kills),
    deaths: num(row.deaths),
    assists: num(row.assists),
    kd: num(row.kd),
    rating: num(row.rating),
    adr: num(row.adr),
    kast: num(row.kast),
    impact: num(row.impact),
    collectedAt: row.collectedAt,
    period: row.period,
    sampleSize: num(row.sampleSize),
    confidence: num(row.confidence)
  };
}

function mapStatsRow(row: Record<string, string>): MapStatsRow {
  return {
    matchId: row.matchId,
    teamName: row.teamName,
    mapName: row.mapName,
    mapsPlayed: num(row.mapsPlayed),
    wins: num(row.wins),
    losses: num(row.losses),
    winRate: num(row.winRate),
    roundsWon: num(row.roundsWon),
    roundsLost: num(row.roundsLost),
    ctRoundWinRate: num(row.ctRoundWinRate),
    tRoundWinRate: num(row.tRoundWinRate),
    pickRate: num(row.pickRate),
    banRate: num(row.banRate),
    deciderRate: num(row.deciderRate),
    collectedAt: row.collectedAt,
    period: row.period,
    sampleSize: num(row.sampleSize),
    confidence: num(row.confidence)
  };
}

function h2hRow(row: Record<string, string>): H2hRow {
  return {
    matchId: row.matchId,
    date: row.date,
    teamA: row.teamA,
    teamB: row.teamB,
    winner: row.winner,
    mapName: row.mapName,
    scoreA: num(row.scoreA),
    scoreB: num(row.scoreB),
    sampleSize: num(row.sampleSize),
    confidence: num(row.confidence)
  };
}

function vetoHistoryRow(row: Record<string, string>): VetoHistoryRow {
  return {
    matchId: row.matchId,
    teamName: row.teamName,
    mapName: row.mapName,
    sampleSize: num(row.sampleSize),
    pickRate: num(row.pickRate),
    banRate: num(row.banRate),
    deciderRate: num(row.deciderRate),
    confidence: num(row.confidence)
  };
}

function newsEventRow(row: Record<string, string>): NewsEventRow {
  return {
    matchId: row.matchId,
    sourceName: row.sourceName,
    title: row.title,
    affectedTeam: row.affectedTeam,
    affectedPlayer: row.affectedPlayer,
    eventType: row.eventType,
    impactScore: num(row.impactScore),
    confidence: num(row.confidence)
  };
}

function parseDemo(content: string, warnings: string[]): ParsedDemoSummary | null {
  if (!content.trim()) return null;
  try {
    const payload = JSON.parse(content) as Record<string, unknown>;
    const rounds = Array.isArray(payload.rounds) ? payload.rounds as Array<Record<string, unknown>> : [];
    const pistolRounds = rounds.filter((round) => Number(round.roundNumber) === 1 || Number(round.roundNumber) === 16);
    return { pistolRounds: pistolRounds.length };
  } catch {
    warnings.push("parsed_demo_export.json could not be parsed for deep analysis.");
    return null;
  }
}

function num(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
