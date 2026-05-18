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
  type FetchLike,
  type FetcherReport,
  type FetcherRunOptions
} from "./utils";

const source = "pandascore-free";
const baseUrl = "https://api.pandascore.co";

export type PandaScoreOptions = FetcherRunOptions & {
  matchId?: string;
  teamNames?: string[];
};

export async function runPandaScoreFetcher(options: PandaScoreOptions = {}): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  const apiKey = env.PANDASCORE_API_KEY;
  if (!shouldRun(env, "ENABLE_PANDASCORE_SYNC", options.force)) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_PANDASCORE_SYNC=false. PandaScore Free enrichment skipped."]
    });
  }
  if (!apiKey) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["PANDASCORE_API_KEY is not configured."]
    });
  }
  if (!options.matchId || !options.teamNames?.length) {
    return makeReport(source, {
      status: "skipped",
      warnings: ["Provide --matchId and --teams to create exact roster/player_stats.csv rows."]
    });
  }

  const collectedAt = getISODate(options.now);
  const fetched: Record<string, number> = {};
  const writes: CsvMergeResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const rosterRows: Array<Record<string, unknown>> = [];
  const playerStatRows: Array<Record<string, unknown>> = [];

  for (const teamName of options.teamNames) {
    try {
      const teams = await fetchPandaScoreTeams(teamName, apiKey, options.fetchImpl);
      fetched[`teams:${teamName}`] = teams.length;
      const matchedTeam = teams.find((team) => sameText(textAt(team, ["name", "slug"]), teamName)) ?? teams[0];
      if (!matchedTeam) {
        warnings.push(`PandaScore returned no team for ${teamName}.`);
        continue;
      }
      const players = rowsFromPayload(matchedTeam, ["players", "current_players"]);
      if (!players.length) warnings.push(`PandaScore team ${teamName} has no embedded free-plan player roster.`);
      for (const player of players) {
        const nickname = textAt(player, ["name", "slug", "first_name", "last_name"]);
        if (!nickname) continue;
        rosterRows.push({
          matchId: options.matchId,
          teamName,
          nickname,
          role: textAt(player, ["role", "position"]) || "unknown",
          country: textAt(player, ["nationality", "country", "country.name"]),
          sourceName: "PandaScore Free",
          collectedAt,
          period: "current_roster",
          sampleSize: "1",
          confidence: "0.62"
        });
        const statRow = normalizePandaScorePlayerStat(player, { matchId: options.matchId, teamName, collectedAt });
        if (statRow) playerStatRows.push(statRow);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "PandaScore fetch failed.";
      if (/HTTP 403|paid|required|plan|blocked|forbidden/i.test(message)) warnings.push(`${teamName}: PandaScore endpoint blocked by current plan.`);
      else errors.push(`${teamName}: ${message}`);
    }
  }

  if (rosterRows.length) {
    writes.push(await mergeSheetRows("roster", rosterRows, ["matchId", "teamName", "nickname", "sourceName"], options));
  }
  if (playerStatRows.length) {
    writes.push(await mergeSheetRows("player_stats", playerStatRows, ["matchId", "teamName", "nickname", "sourceName", "period"], options));
  } else {
    warnings.push("PandaScore Free returned no schema-safe player stats rows; no fake player_stats were created.");
  }

  return makeReport(source, {
    status: errors.length ? (writes.length ? "partial" : "failed") : "success",
    fetched,
    writes,
    warnings,
    errors
  });
}

export async function fetchPandaScoreTeams(teamName: string, apiKey: string, fetchImpl?: FetchLike) {
  const url = new URL(`${baseUrl}/csgo/teams`);
  url.searchParams.set("search[name]", teamName);
  url.searchParams.set("per_page", "10");
  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  }, fetchImpl);
  return rowsFromPayload(payload, ["teams", "data"]);
}

export function normalizePandaScorePlayerStat(player: unknown, context: { matchId: string; teamName: string; collectedAt: string }) {
  const maps = numberAt(player, ["maps", "stats.maps", "matches_played", "current_stats.maps"]);
  const rating = numberAt(player, ["rating", "stats.rating", "rating_2_0", "current_stats.rating"]);
  const adr = numberAt(player, ["adr", "stats.adr", "current_stats.adr"]);
  const kills = numberAt(player, ["kills", "stats.kills", "current_stats.kills"]);
  const deaths = numberAt(player, ["deaths", "stats.deaths", "current_stats.deaths"]);
  if (!maps || (!rating && !adr && !kills && !deaths)) return null;
  const nickname = textAt(player, ["name", "slug", "first_name", "last_name"]);
  if (!nickname) return null;
  return {
    matchId: context.matchId,
    teamName: context.teamName,
    nickname,
    maps: maps || "",
    kills: kills ?? "",
    deaths: deaths ?? "",
    assists: numberAt(player, ["assists", "stats.assists", "current_stats.assists"]) ?? "",
    kd: numberAt(player, ["kd", "k_d", "stats.kd", "current_stats.kd"]) ?? "",
    rating: rating ?? "",
    adr: adr ?? "",
    kast: numberAt(player, ["kast", "stats.kast", "current_stats.kast"]) ?? "",
    impact: numberAt(player, ["impact", "stats.impact", "current_stats.impact"]) ?? "",
    openingKills: numberAt(player, ["openingKills", "opening_kills", "stats.openingKills"]) ?? "",
    openingDeaths: numberAt(player, ["openingDeaths", "opening_deaths", "stats.openingDeaths"]) ?? "",
    clutchesWon: numberAt(player, ["clutchesWon", "clutches_won", "stats.clutchesWon"]) ?? "",
    clutchesAttempted: numberAt(player, ["clutchesAttempted", "clutches_attempted", "stats.clutchesAttempted"]) ?? "",
    sourceName: "PandaScore Free",
    collectedAt: context.collectedAt,
    period: "pandascore_free_available",
    sampleSize: maps || "1",
    confidence: "0.58"
  };
}

export async function runPandaScoreCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const report = await runPandaScoreFetcher({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"]),
    matchId: stringArg(args, "matchId"),
    teamNames: listArg(args, "teams")
  });
  printReport(report);
  if (report.status === "failed") process.exitCode = 1;
}

function sameText(a: string, b: string) {
  return normalizeName(a) === normalizeName(b);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

if (isDirectRun(import.meta.url)) {
  runPandaScoreCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
