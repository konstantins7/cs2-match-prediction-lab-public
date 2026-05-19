import {
  fetchJson,
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

const source = "esport.is research";
const defaultBaseUrl = "https://esport.is/api";

export type EsportisResearchOptions = FetcherRunOptions & {
  matchId: string;
  teamNames: [string, string];
  baseUrl?: string;
};

export type EsportisResearchRows = {
  rosterRows: Array<Record<string, unknown>>;
  playerRows: Array<Record<string, unknown>>;
  mapRows: Array<Record<string, unknown>>;
  newsRows: Array<Record<string, unknown>>;
  warnings: string[];
};

export async function runEsportisResearchFetcher(options: EsportisResearchOptions): Promise<FetcherReport> {
  const env = options.env ?? process.env;
  if (!shouldRun(env, "ENABLE_ESPORTIS_SYNC", options.force) || env.ENABLE_RESEARCH_SOURCES !== "true") {
    return makeReport(source, {
      status: "skipped",
      warnings: ["ENABLE_RESEARCH_SOURCES=true and ENABLE_ESPORTIS_SYNC=true are required for esport.is research fetch."]
    });
  }

  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
  const warnings: string[] = [];
  const errors: string[] = [];
  const payloads: Record<string, unknown> = {};
  const endpoints = [
    ["matches", `${baseUrl}/v1/cs2/matches`],
    ["news", `${baseUrl}/v1/cs2/news`],
    ...options.teamNames.map((teamName) => [`team:${teamName}`, `${baseUrl}/v1/cs2/teams?search=${encodeURIComponent(teamName)}`] as const)
  ] as const;

  for (const [key, url] of endpoints) {
    try {
      payloads[key] = await fetchJson(url, { headers: { Accept: "application/json" } }, options.fetchImpl);
    } catch (error) {
      warnings.push(`${key}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  const normalized = normalizeEsportisResearchRows(payloads, {
    matchId: options.matchId,
    teamNames: options.teamNames,
    collectedAt: getISODate(options.now)
  });
  warnings.push(...normalized.warnings);

  const writes = [];
  if (normalized.rosterRows.length) writes.push(await mergeSheetRows("roster", normalized.rosterRows, ["matchId", "teamName", "nickname", "sourceName"], options));
  if (normalized.playerRows.length) writes.push(await mergeSheetRows("player_stats", normalized.playerRows, ["matchId", "teamName", "nickname", "sourceName", "period"], options));
  if (normalized.mapRows.length) writes.push(await mergeSheetRows("map_stats", normalized.mapRows, ["matchId", "teamName", "mapName", "sourceName", "period"], options));
  if (normalized.newsRows.length) writes.push(await mergeSheetRows("news_events", normalized.newsRows, ["matchId", "sourceName", "title", "publishedAt"], options));
  if (!writes.length) warnings.push("No schema-safe esport.is research rows were found.");

  return makeReport(source, {
    status: errors.length ? "failed" : writes.some((write) => write.rowsInserted > 0 || write.dryRun && write.rowsReceived > 0) ? "success" : "partial",
    fetched: {
      roster: normalized.rosterRows.length,
      player_stats: normalized.playerRows.length,
      map_stats: normalized.mapRows.length,
      news_events: normalized.newsRows.length
    },
    writes,
    warnings,
    errors
  });
}

export function normalizeEsportisResearchRows(payloads: Record<string, unknown>, context: { matchId: string; teamNames: [string, string]; collectedAt: string }): EsportisResearchRows {
  const warnings: string[] = [];
  const teamRecords = collectTeamRecords(payloads, context.teamNames);
  const rosterRows: Array<Record<string, unknown>> = [];
  const playerRows: Array<Record<string, unknown>> = [];
  const mapRows: Array<Record<string, unknown>> = [];

  for (const teamName of context.teamNames) {
    const team = teamRecords.find((record) => sameName(extractName(record), teamName));
    if (!team) {
      warnings.push(`${teamName}: no esport.is team payload found.`);
      continue;
    }
    const players = rowsFromPayload(team, ["players", "roster", "members"]);
    for (const player of players) {
      const nickname = textAt(player, ["nickname", "nick", "tag", "name", "playerName"]);
      if (!nickname) continue;
      const maps = positive(numberAt(player, ["maps", "mapsPlayed", "stats.maps", "sampleSize"])) ?? 1;
      const rating = positive(numberAt(player, ["rating", "rating2", "rating2_0", "stats.rating", "stats.rating2"])) ?? 0;
      rosterRows.push({
        matchId: context.matchId,
        teamName,
        nickname,
        role: textAt(player, ["role", "position"]) || "unknown",
        country: textAt(player, ["country", "nationality"]) || "",
        sourceName: "esport.is research API",
        collectedAt: context.collectedAt,
        period: "current_roster",
        sampleSize: maps,
        confidence: 0.64
      });
      if (maps > 0 && rating > 0) {
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
          sourceName: "esport.is research API",
          collectedAt: context.collectedAt,
          period: "esportis_recent",
          sampleSize: maps,
          confidence: 0.64
        });
      }
    }
    for (const map of rowsFromPayload(team, ["maps", "mapStats", "stats.maps", "map_stats"])) {
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
        sourceName: "esport.is research API",
        collectedAt: context.collectedAt,
        period: "esportis_recent",
        sampleSize: mapsPlayed,
        confidence: 0.64
      });
    }
  }

  const newsRows = rowsFromPayload(payloads.news, ["news", "items", "data"]).map((item) => {
    const title = textAt(item, ["title", "headline", "name"]);
    const summary = textAt(item, ["summary", "description", "body", "text"]);
    const publishedAt = textAt(item, ["publishedAt", "published_at", "createdAt", "date"]) || context.collectedAt;
    const affectedTeam = context.teamNames.find((teamName) => `${title} ${summary}`.toLowerCase().includes(teamName.toLowerCase())) ?? "";
    return {
      matchId: context.matchId,
      sourceName: "esport.is research API",
      sourceType: "official_api",
      title,
      summary: summary || title,
      publishedAt,
      affectedTeam,
      affectedPlayer: "",
      eventType: "news",
      reliability: "api_reference",
      impactScore: "0.1",
      confidence: "0.55"
    };
  }).filter((row) => row.title && row.summary);

  return { rosterRows, playerRows, mapRows, newsRows, warnings };
}

function collectTeamRecords(payloads: Record<string, unknown>, teamNames: string[]) {
  const records: unknown[] = [];
  for (const [key, payload] of Object.entries(payloads)) {
    if (key.startsWith("team:")) records.push(...rowsFromPayload(payload, ["teams", "data", "results"]));
    if (key === "matches") {
      for (const match of rowsFromPayload(payload, ["matches", "data", "items"])) {
        records.push(...rowsFromPayload(match, ["teams", "opponents"]));
      }
    }
  }
  return records.filter((record) => teamNames.some((teamName) => sameName(extractName(record), teamName)));
}

function extractName(record: unknown) {
  return textAt(record, ["name", "teamName", "team.name", "opponent.name"]);
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
