import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getISODate,
  makeReport,
  mergeSheetRows,
  numberAt,
  rowsFromPayload,
  shouldRun,
  textAt,
  type FetcherReport,
  type FetcherRunOptions
} from "../data-fetchers/utils";

const execFileAsync = promisify(execFile);
const source = "BO3.gg cs2api research";

export type Bo3Cs2ApiOptions = FetcherRunOptions & {
  matchId: string;
  teamNames: [string, string];
  pythonCommand?: string;
  payload?: unknown;
};

export type Bo3NormalizedRows = {
  rosterRows: Array<Record<string, unknown>>;
  playerRows: Array<Record<string, unknown>>;
  mapRows: Array<Record<string, unknown>>;
  warnings: string[];
};

export async function runBo3Cs2ApiFetcher(options: Bo3Cs2ApiOptions): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!shouldRun(env, "ENABLE_BO3_CS2API_SYNC", options.force) || env.ENABLE_RESEARCH_SOURCES !== "true") {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_RESEARCH_SOURCES=true and ENABLE_BO3_CS2API_SYNC=true are required for BO3/cs2api research fetch."]
    });
  }

  const warnings: string[] = [];
  let payload = options.payload;
  if (!payload) {
    const loaded = await loadBo3PayloadViaPython(options.teamNames, options.pythonCommand ?? env.PYTHON ?? "python");
    if (!loaded.ok) {
      return makeReport(source, { status: "skipped", warnings: [loaded.warning] });
    }
    payload = loaded.payload;
  }

  const normalized = normalizeBo3Payload(payload, {
    matchId: options.matchId,
    teamNames: options.teamNames,
    collectedAt: getISODate(options.now)
  });
  warnings.push(...normalized.warnings);

  const writes = [];
  if (normalized.rosterRows.length) writes.push(await mergeSheetRows("roster", normalized.rosterRows, ["matchId", "teamName", "nickname", "sourceName"], options));
  if (normalized.playerRows.length) writes.push(await mergeSheetRows("player_stats", normalized.playerRows, ["matchId", "teamName", "nickname", "sourceName", "period"], options));
  if (normalized.mapRows.length) writes.push(await mergeSheetRows("map_stats", normalized.mapRows, ["matchId", "teamName", "mapName", "sourceName", "period"], options));
  if (!writes.length) warnings.push("No schema-safe BO3/cs2api rows were found.");

  return makeReport(source, {
    status: writes.some((write) => write.rowsInserted > 0 || write.dryRun && write.rowsReceived > 0) ? "success" : "partial",
    fetched: {
      roster: normalized.rosterRows.length,
      player_stats: normalized.playerRows.length,
      map_stats: normalized.mapRows.length
    },
    writes,
    warnings
  });
}

export function normalizeBo3Payload(payload: unknown, context: { matchId: string; teamNames: [string, string]; collectedAt: string }): Bo3NormalizedRows {
  const warnings: string[] = [];
  const teamRecords = collectTeamRecords(payload, context.teamNames);
  const rosterRows: Array<Record<string, unknown>> = [];
  const playerRows: Array<Record<string, unknown>> = [];
  const mapRows: Array<Record<string, unknown>> = [];

  for (const teamName of context.teamNames) {
    const team = teamRecords.find((record) => sameName(teamRecordName(record), teamName));
    if (!team) {
      warnings.push(`${teamName}: no BO3/cs2api team payload found.`);
      continue;
    }
    for (const player of rowsFromPayload(team, ["players", "roster", "data.players", "stats.players"])) {
      const nickname = textAt(player, ["nickname", "nick", "name", "player_name", "slug"]);
      if (!nickname) continue;
      const maps = positive(numberAt(player, ["maps", "mapsPlayed", "matches", "sampleSize", "stats.maps"])) ?? 1;
      const rating = positive(numberAt(player, ["rating", "rating2", "rating2_0", "stats.rating"])) ?? 0;
      rosterRows.push({
        matchId: context.matchId,
        teamName,
        nickname,
        role: textAt(player, ["role", "position"]) || "unknown",
        country: textAt(player, ["country", "nationality"]) || "",
        sourceName: "BO3.gg cs2api research",
        collectedAt: context.collectedAt,
        period: "current_roster",
        sampleSize: maps,
        confidence: 0.68
      });
      if (rating > 0 && maps > 0) {
        playerRows.push({
          matchId: context.matchId,
          teamName,
          nickname,
          maps,
          kills: positive(numberAt(player, ["kills", "stats.kills"])) ?? 0,
          deaths: positive(numberAt(player, ["deaths", "stats.deaths"])) ?? 0,
          assists: positive(numberAt(player, ["assists", "stats.assists"])) ?? 0,
          kd: positive(numberAt(player, ["kd", "kdr", "stats.kd"])) ?? 1,
          rating,
          adr: positive(numberAt(player, ["adr", "stats.adr"])) ?? 0,
          kast: positive(numberAt(player, ["kast", "stats.kast"])) ?? 0,
          impact: positive(numberAt(player, ["impact", "stats.impact"])) ?? 0,
          openingKills: positive(numberAt(player, ["openingKills", "stats.openingKills"])) ?? 0,
          openingDeaths: positive(numberAt(player, ["openingDeaths", "stats.openingDeaths"])) ?? 0,
          clutchesWon: positive(numberAt(player, ["clutchesWon", "stats.clutchesWon"])) ?? 0,
          clutchesAttempted: positive(numberAt(player, ["clutchesAttempted", "stats.clutchesAttempted"])) ?? 0,
          sourceName: "BO3.gg cs2api research",
          collectedAt: context.collectedAt,
          period: "bo3_recent",
          sampleSize: maps,
          confidence: 0.68
        });
      }
    }
    for (const map of rowsFromPayload(team, ["maps", "mapStats", "stats.maps", "data.maps"])) {
      const mapName = textAt(map, ["mapName", "map", "name"]);
      const mapsPlayed = positive(numberAt(map, ["mapsPlayed", "maps", "played", "sampleSize"]));
      if (!mapName || !mapsPlayed) continue;
      const wins = positive(numberAt(map, ["wins", "won"])) ?? 0;
      const losses = positive(numberAt(map, ["losses", "lost"])) ?? Math.max(0, mapsPlayed - wins);
      mapRows.push({
        matchId: context.matchId,
        teamName,
        mapName,
        mapsPlayed,
        wins,
        losses,
        winRate: positive(numberAt(map, ["winRate", "winrate", "win_percent"])) ?? (wins / mapsPlayed) * 100,
        roundsWon: positive(numberAt(map, ["roundsWon"])) ?? 0,
        roundsLost: positive(numberAt(map, ["roundsLost"])) ?? 0,
        ctRoundWinRate: positive(numberAt(map, ["ctRoundWinRate"])) ?? 0,
        tRoundWinRate: positive(numberAt(map, ["tRoundWinRate"])) ?? 0,
        pickRate: positive(numberAt(map, ["pickRate"])) ?? 0,
        banRate: positive(numberAt(map, ["banRate"])) ?? 0,
        deciderRate: positive(numberAt(map, ["deciderRate"])) ?? 0,
        sourceName: "BO3.gg cs2api research",
        collectedAt: context.collectedAt,
        period: "bo3_recent",
        sampleSize: mapsPlayed,
        confidence: 0.68
      });
    }
  }
  return { rosterRows, playerRows, mapRows, warnings };
}

async function loadBo3PayloadViaPython(teamNames: [string, string], pythonCommand: string) {
  const script = `
import asyncio, json, sys
async def main():
    try:
        from cs2api import CS2
    except Exception as exc:
        print(json.dumps({"ok": False, "error": "cs2api unavailable: " + str(exc)}))
        return
    teams = json.loads(sys.argv[1])
    output = {"teams": []}
    async with CS2() as cs2:
        for team in teams:
            entry = {"query": team}
            try:
                search = await cs2.search_teams(team)
                entry["search"] = search
                first = search[0] if isinstance(search, list) and search else search.get("data", [None])[0] if isinstance(search, dict) and isinstance(search.get("data"), list) and search.get("data") else None
                slug = first.get("slug") if isinstance(first, dict) else None
                if slug:
                    entry["data"] = await cs2.get_team_data(slug)
                    entry["stats"] = await cs2.get_team_stats(slug)
            except Exception as exc:
                entry["error"] = str(exc)
            output["teams"].append(entry)
    print(json.dumps({"ok": True, "data": output}, default=str))
asyncio.run(main())
`;
  try {
    const { stdout } = await execFileAsync(pythonCommand, ["-c", script, JSON.stringify(teamNames)], { timeout: 20000, maxBuffer: 1024 * 1024 * 5 });
    const parsed = JSON.parse(stdout.trim() || "{}") as { ok?: boolean; data?: unknown; error?: string };
    if (!parsed.ok) return { ok: false as const, warning: parsed.error || "cs2api bridge returned no data." };
    return { ok: true as const, payload: parsed.data };
  } catch (error) {
    return { ok: false as const, warning: error instanceof Error ? `cs2api bridge unavailable: ${error.message}` : "cs2api bridge unavailable." };
  }
}

function collectTeamRecords(payload: unknown, teamNames: string[]) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const candidates = [
    ...rowsFromPayload(root, ["teams", "data.teams"]),
    ...rowsFromPayload(root.data, ["teams"]),
    ...Object.values(root).flatMap((value) => rowsFromPayload(value, ["teams", "data"]))
  ];
  return candidates.filter((record) => teamNames.some((teamName) => sameName(teamRecordName(record), teamName) || sameName(textAt(record, ["query"]), teamName)));
}

function teamRecordName(record: unknown) {
  return textAt(record, ["name", "teamName", "query", "data.name", "stats.name"]);
}

function sameName(a: string, b: string) {
  return slug(a) === slug(b);
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/^team\s+/i, "").replace(/[^a-z0-9]+/g, "");
}

function positive(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}
