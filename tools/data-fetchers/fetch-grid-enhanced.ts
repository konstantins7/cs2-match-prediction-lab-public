import {
  fetchJson,
  getISODate,
  makeReport,
  mergeSheetRows,
  rowsFromPayload,
  stableSlug,
  textAt,
  shouldRun,
  type CsvMergeResult,
  type FetcherReport
} from "./utils";
import { normalizeGridMapRows, normalizeGridVetoRows, type GridOptions } from "./fetch-grid";

const source = "grid-enhanced";
const gridCentralDataUrl = "https://api-op.grid.gg/central-data/graphql";

export type GridEnhancedOptions = GridOptions & {
  teamA?: string;
  teamB?: string;
  tournament?: string;
  date?: Date;
  dateWindowDays?: number;
};

const enhancedSeriesWindowQuery = `
  query SafeEnhancedSeriesWindow($from: DateTime!, $to: DateTime!) {
    allSeries(take: 80, filter: { game: CS2, startTime_gte: $from, startTime_lte: $to }) {
      id
      title
      name
      startTime
      tournament { name }
      league { name }
      teams { id name }
      maps { id name mapName winnerTeamName winner { name } teams { name } }
      vetoEvents { mapName teamName action side }
    }
  }
`;

export async function findGridSeriesIdEnhanced(options: GridEnhancedOptions): Promise<string | null> {
  const match = await fetchGridSeriesMatch(options);
  return match?.seriesId ?? null;
}

export async function runGridEnhancedFetcher(options: GridEnhancedOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  const apiKey = env.GRID_API_KEY;
  if (!shouldRun(env, "ENABLE_GRID_SYNC", options.force)) {
    return makeReport(source, { status: "skipped", warnings: ["ENABLE_GRID_SYNC=false. GRID enhanced lookup skipped."] });
  }
  if (!apiKey) {
    return makeReport(source, { status: "skipped", warnings: ["GRID_API_KEY is not configured."] });
  }
  if (!options.matchId || !options.teamNames?.length) {
    return makeReport(source, { status: "skipped", warnings: ["Provide matchId and teamNames to write GRID enhanced rows."] });
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const writes: CsvMergeResult[] = [];
  const fetched: Record<string, number> = {};
  try {
    const match = await fetchGridSeriesMatch(options);
    fetched.series = match?.totalCandidates ?? 0;
    if (!match?.seriesId || !match.series) {
      warnings.push("GRID enhanced lookup found no confident team/tournament/date series match.");
      return makeReport(source, { status: "partial", fetched, writes, warnings, errors });
    }
    fetched.matchedSeries = 1;
    const context = {
      matchId: options.matchId,
      teamNames: options.teamNames,
      collectedAt: getISODate(options.now)
    };
    const mapRows = normalizeGridMapRows([match.series], context);
    const vetoRows = normalizeGridVetoRows([match.series], context);
    if (mapRows.length) writes.push(await mergeSheetRows("map_stats", mapRows, ["matchId", "teamName", "mapName", "sourceName", "collectedAt"], options));
    else warnings.push("GRID enhanced series had no usable completed map rows.");
    if (vetoRows.length) writes.push(await mergeSheetRows("veto_history", vetoRows, ["matchId", "teamName", "mapName", "sourceName", "collectedAt"], options));
    else warnings.push("GRID enhanced series had no usable veto rows.");
    return makeReport(source, { fetched, writes, warnings, errors });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "GRID enhanced fetch failed.");
    return makeReport(source, { status: "failed", fetched, writes, warnings, errors });
  }
}

export function findGridSeriesIdEnhancedFromSeries(
  series: unknown[],
  options: { teamA: string; teamB: string; tournament?: string; date?: Date; dateWindowDays?: number }
) {
  const dateWindowDays = options.dateWindowDays ?? 7;
  const targetDate = options.date;
  const scored = series.map((item) => {
    const teams = rowsFromPayload(valueOrEmpty(item, "teams")).map((team) => textAt(team, ["name"])).filter(Boolean);
    const teamScore = (bestTeamScore(options.teamA, teams) + bestTeamScore(options.teamB, teams)) / 2;
    const dateScore = scoreDate(textAt(item, ["startTime", "startDate", "beginAt"]), targetDate, dateWindowDays);
    const tournamentScore = scoreTournament(item, options.tournament);
    const score = teamScore * 0.68 + dateScore * 0.2 + tournamentScore * 0.12;
    return {
      series: item,
      seriesId: textAt(item, ["id", "seriesId"]),
      score: Number(score.toFixed(3)),
      teamScore,
      tournamentScore
    };
  }).filter((candidate) => candidate.seriesId && candidate.teamScore >= 0.72)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.68) return null;
  if (second && best.score - second.score < 0.03) return null;
  return best;
}

async function fetchGridSeriesMatch(options: GridEnhancedOptions) {
  const env = options.env ?? process.env;
  const apiKey = env.GRID_API_KEY;
  if (!apiKey) return null;
  const targetDate = options.date ?? options.targetDate ?? options.now ?? new Date();
  const windowDays = options.dateWindowDays ?? 7;
  const from = new Date(targetDate.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(targetDate.getTime() + windowDays * 24 * 60 * 60 * 1000).toISOString();
  const payload = await fetchJson(gridCentralDataUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({ query: enhancedSeriesWindowQuery, variables: { from, to } })
  }, options.fetchImpl);
  const series = rowsFromPayload((payload as Record<string, unknown>).data ?? payload, ["allSeries", "series", "data"]);
  const teamA = options.teamA ?? options.teamNames?.[0] ?? "";
  const teamB = options.teamB ?? options.teamNames?.[1] ?? "";
  const match = findGridSeriesIdEnhancedFromSeries(series, { teamA, teamB, tournament: options.tournament, date: targetDate, dateWindowDays: windowDays });
  return match ? { ...match, totalCandidates: series.length } : { seriesId: "", series: null, score: 0, totalCandidates: series.length };
}

function valueOrEmpty(record: unknown, key: string) {
  if (!record || typeof record !== "object") return [];
  return (record as Record<string, unknown>)[key] ?? [];
}

function bestTeamScore(teamName: string, seriesTeams: string[]) {
  return Math.max(0, ...seriesTeams.map((seriesTeam) => fuzzyScore(teamName, seriesTeam)));
}

function fuzzyScore(left: string, right: string) {
  const a = stableSlug(left.replace(/^team\s+/i, ""));
  const b = stableSlug(right.replace(/^team\s+/i, ""));
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aTokens = new Set(a.split("_").filter(Boolean));
  const bTokens = new Set(b.split("_").filter(Boolean));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  return shared / Math.max(aTokens.size, bTokens.size, 1);
}

function scoreDate(raw: string, targetDate: Date | undefined, windowDays: number) {
  if (!targetDate) return 0.5;
  const date = raw ? new Date(raw) : null;
  if (!date || !Number.isFinite(date.getTime())) return 0.2;
  return Math.max(0, 1 - Math.abs(date.getTime() - targetDate.getTime()) / (windowDays * 24 * 60 * 60 * 1000));
}

function scoreTournament(item: unknown, tournament?: string) {
  if (!tournament) return 0.5;
  const target = stableSlug(tournament);
  const names = [
    textAt(item, ["tournament.name"]),
    textAt(item, ["league.name"]),
    textAt(item, ["title"]),
    textAt(item, ["name"])
  ].filter(Boolean);
  return Math.max(0, ...names.map((name) => fuzzyScore(target, name)));
}
