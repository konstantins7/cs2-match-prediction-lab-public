import {
  fetchJson,
  getISODate,
  isDirectRun,
  listArg,
  makeReport,
  mergeSheetRows,
  numberAt,
  parseCliArgs,
  printReport,
  rowsFromPayload,
  shouldRun,
  stringArg,
  textAt,
  type CsvMergeResult,
  type FetcherReport,
  type FetcherRunOptions
} from "./utils";

const source = "grid";
const gridCentralDataUrl = "https://api-op.grid.gg/central-data/graphql";

export type GridOptions = FetcherRunOptions & {
  matchId?: string;
  teamNames?: string[];
  daysBack?: number;
  daysForward?: number;
  targetDate?: Date;
};

const seriesWindowQuery = `
  query SafeSeriesWindow($from: DateTime!, $to: DateTime!) {
    allSeries(take: 50, filter: { game: CS2, startTime_gte: $from, startTime_lte: $to }) {
      id
      title
      name
      startTime
      teams { id name }
      maps { id name mapName winnerTeamName winner { name } teams { name } }
      vetoEvents { mapName teamName action side }
    }
  }
`;

export async function runGridFetcher(options: GridOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  const apiKey = env.GRID_API_KEY;
  if (!shouldRun(env, "ENABLE_GRID_SYNC", options.force)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_GRID_SYNC=false. GRID Open Access fetch skipped."]
    });
  }
  if (!apiKey) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["GRID_API_KEY is not configured."]
    });
  }

  const now = options.now ?? new Date();
  const targetDate = options.targetDate ?? now;
  const from = new Date(targetDate.getTime() - (options.daysBack ?? 7) * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(targetDate.getTime() + (options.daysForward ?? 7) * 24 * 60 * 60 * 1000).toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];
  const writes: CsvMergeResult[] = [];
  const fetched: Record<string, number> = {};

  try {
    const payload = await fetchJson(gridCentralDataUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ query: seriesWindowQuery, variables: { from, to } })
    }, options.fetchImpl);
    const series = rowsFromPayload((payload as Record<string, unknown>).data ?? payload, ["allSeries", "series", "data"]);
    fetched.series = series.length;
    if (!options.matchId || !options.teamNames?.length) {
      warnings.push("GRID series fetched but not written: provide --matchId and --teams to create exact private inbox map/veto rows.");
    } else {
      const matched = findGridSeriesId(series, options.teamNames, targetDate);
      if (!matched.seriesId) {
        warnings.push("GRID returned no confident team/date series match for target match context.");
      }
      const context = { matchId: options.matchId, teamNames: options.teamNames, collectedAt: getISODate(now) };
      const targetSeries = matched.seriesId ? [matched.series] : [];
      const mapRows = normalizeGridMapRows(targetSeries, context);
      const vetoRows = normalizeGridVetoRows(targetSeries, context);
      if (mapRows.length) writes.push(await mergeSheetRows("map_stats", mapRows, ["matchId", "teamName", "mapName", "sourceName", "collectedAt"], options));
      else warnings.push("GRID returned no cutoff-safe completed map rows with winner/team context.");
      if (vetoRows.length) writes.push(await mergeSheetRows("veto_history", vetoRows, ["matchId", "teamName", "mapName", "sourceName", "collectedAt"], options));
      else warnings.push("GRID returned no usable veto rows for target teams.");
      if (matched.seriesId) fetched.matchedSeries = 1;
    }
    return makeReport(source, { fetched, writes, warnings, errors });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "GRID fetch failed.");
    return makeReport(source, { status: "failed", fetched: {}, writes, warnings, errors });
  }
}

export function findGridSeriesId(series: unknown[], teamNames: string[], targetDate: Date, windowDays = 7) {
  const candidates = series
    .map((item) => {
      const seriesTeams = rowsFromPayload(valueOrEmpty(item, "teams"), ["teams"]).map((team) => textAt(team, ["name"])).filter(Boolean);
      const startTimeRaw = textAt(item, ["startTime", "startDate", "beginAt"]);
      const startTime = startTimeRaw ? new Date(startTimeRaw) : null;
      const dateScore = startTime && Number.isFinite(startTime.getTime())
        ? Math.max(0, 1 - Math.abs(startTime.getTime() - targetDate.getTime()) / (windowDays * 24 * 60 * 60 * 1000))
        : 0.25;
      const teamScore = teamNames.reduce((sum, teamName) => sum + bestTeamScore(teamName, seriesTeams), 0) / Math.max(teamNames.length, 1);
      return {
        series: item,
        seriesId: textAt(item, ["id", "seriesId"]),
        score: Number((teamScore * 0.8 + dateScore * 0.2).toFixed(3)),
        teamScore
      };
    })
    .filter((candidate) => candidate.seriesId && candidate.teamScore >= 0.72)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.68) return { seriesId: "", series: null, score: 0 };
  return best;
}

export function normalizeGridMapRows(series: unknown[], context: { matchId: string; teamNames: string[]; collectedAt: string }) {
  const rows: Array<Record<string, unknown>> = [];
  for (const item of series) {
    const maps = rowsFromPayload(valueOrEmpty(item, "maps"), ["maps"]);
    for (const map of maps) {
      const mapName = textAt(map, ["mapName", "name"]);
      const winner = textAt(map, ["winnerTeamName", "winner.name", "winner.team.name"]);
      if (!mapName || !winner) continue;
      for (const teamName of context.teamNames) {
        const isWinner = teamName.toLowerCase() === winner.toLowerCase();
        rows.push({
          matchId: context.matchId,
          teamName,
          mapName,
          mapsPlayed: "1",
          wins: isWinner ? "1" : "0",
          losses: isWinner ? "0" : "1",
          winRate: isWinner ? "1" : "0",
          roundsWon: numberAt(map, [`scores.${teamName}.roundsWon`, "roundsWon"]) ?? "",
          roundsLost: numberAt(map, [`scores.${teamName}.roundsLost`, "roundsLost"]) ?? "",
          ctRoundWinRate: "",
          tRoundWinRate: "",
          pickRate: "",
          banRate: "",
          deciderRate: "",
          sourceName: "GRID Open Access",
          collectedAt: context.collectedAt,
          period: "grid_series_window",
          sampleSize: "1",
          confidence: "0.8"
        });
      }
    }
  }
  return rows;
}

export function normalizeGridVetoRows(series: unknown[], context: { matchId: string; teamNames: string[]; collectedAt: string }) {
  const rows: Array<Record<string, unknown>> = [];
  for (const item of series) {
    const vetoEvents = rowsFromPayload(valueOrEmpty(item, "vetoEvents"), ["vetoEvents"]);
    for (const event of vetoEvents) {
      const mapName = textAt(event, ["mapName", "map.name", "name"]);
      const teamName = matchingTeam(context.teamNames, textAt(event, ["teamName", "team.name"]));
      const action = textAt(event, ["action", "side", "type"]).toLowerCase();
      if (!mapName || !teamName || !action) continue;
      rows.push({
        matchId: context.matchId,
        teamName,
        mapName,
        sampleSize: "1",
        pickRate: action.includes("pick") ? "1" : "0",
        banRate: action.includes("ban") ? "1" : "0",
        deciderRate: action.includes("decider") ? "1" : "0",
        sourceName: "GRID Open Access",
        collectedAt: context.collectedAt,
        period: "grid_series_window",
        confidence: "0.78"
      });
    }
  }
  return rows;
}

export async function runGridCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runGridFetcher({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"]),
    matchId: stringArg(args, "matchId"),
    teamNames: listArg(args, "teams")
  });
  printReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

function valueOrEmpty(record: unknown, key: string) {
  if (!record || typeof record !== "object") return [];
  return (record as Record<string, unknown>)[key] ?? [];
}

function matchingTeam(teamNames: string[], raw: string) {
  return teamNames.find((teamName) => fuzzyScore(teamName, raw) >= 0.72) ?? "";
}

function bestTeamScore(teamName: string, seriesTeams: string[]) {
  return Math.max(0, ...seriesTeams.map((seriesTeam) => fuzzyScore(teamName, seriesTeam)));
}

function fuzzyScore(left: string, right: string) {
  const a = stableName(left);
  const b = stableName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aTokens = new Set(a.split("_").filter(Boolean));
  const bTokens = new Set(b.split("_").filter(Boolean));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  return shared / Math.max(aTokens.size, bTokens.size, 1);
}

function stableName(value: string) {
  return value.toLowerCase().replace(/^team\s+/i, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

if (isDirectRun(import.meta.url)) {
  runGridCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
