import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analystSheetTemplates, type AnalystSheetType } from "../../src/lib/analystSheetTemplates";
import { validateNormalizedFile } from "../../src/lib/validation/normalizedFileValidator";
import {
  envFlag,
  getISODate,
  mergeSheetRows,
  numberAt,
  stableSlug,
  textAt,
  type CsvMergeResult,
  type FetcherEnv
} from "../data-fetchers/utils";
import { hltvSlug, normalizeMapName } from "./hltv-client";

export type ApifyHltvActorOptions = {
  matchId?: string;
  teamA?: string;
  teamB?: string;
  hltvMatchId?: string;
  hltvTeamId?: string;
  dryRun?: boolean;
  inboxPath?: string;
  period?: string;
  confidence?: number;
  env?: FetcherEnv;
  now?: Date;
  cacheDir?: string;
  apifyClientFactory?: (token: string) => Promise<ApifyClientLike> | ApifyClientLike;
};

export type ApifyHltvActorResult = {
  source: "apify-hltv-actor";
  status: "success" | "partial" | "skipped" | "failed";
  fetched: Record<string, number>;
  writes: CsvMergeResult[];
  warnings: string[];
  errors: string[];
  cacheHit: boolean;
  actorId?: string;
  actorRunId?: string;
  datasetId?: string;
};

type ApifyClientLike = {
  actor: (actorId: string) => {
    call: (input: Record<string, unknown>) => Promise<{ id?: string; defaultDatasetId?: string }>;
  };
  dataset: (datasetId: string) => {
    listItems: (options?: Record<string, unknown>) => Promise<{ items?: unknown[] }>;
  };
};

type ApifyCacheRecord = {
  createdAt: string;
  actorId: string;
  defaultDatasetId: string;
  actorRunId?: string;
};

type NormalizedRows = Record<AnalystSheetType, Array<Record<string, unknown>>>;

const defaultActorId = "lukas-kremser/hltv-scraper";
const defaultApifyCacheDir = path.join("data", "research-cache", "apify");
const defaultSourceName = "Apify HLTV Actor";
const uniqueColumnsBySheet: Record<AnalystSheetType, string[]> = {
  roster: ["matchId", "teamName", "nickname", "sourceName"],
  player_stats: ["matchId", "teamName", "nickname", "sourceName", "period"],
  map_stats: ["matchId", "teamName", "mapName", "sourceName", "period"],
  veto_history: ["matchId", "teamName", "mapName", "sourceName", "period"],
  h2h: ["matchId", "date", "teamA", "teamB", "mapName", "sourceName"],
  news_events: ["matchId", "sourceName", "title", "publishedAt"]
};

export async function fetchHltvViaApify(options: ApifyHltvActorOptions): Promise<ApifyHltvActorResult> {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const errors: string[] = [];
  const writes: CsvMergeResult[] = [];
  const actorId = env.APIFY_HLTV_ACTOR_ID || defaultActorId;
  const token = env.APIFY_TOKEN ?? "";

  if (!envFlag(env, "ENABLE_RESEARCH_SOURCES") || !envFlag(env, "ENABLE_APIFY_HLTV_ACTOR")) {
    return result("skipped", {}, writes, ["ENABLE_RESEARCH_SOURCES=true and ENABLE_APIFY_HLTV_ACTOR=true are required."], errors, false, actorId);
  }
  if (!token) return result("skipped", {}, writes, ["APIFY_TOKEN is not configured."], errors, false, actorId);
  if (!actorId) return result("skipped", {}, writes, ["APIFY_HLTV_ACTOR_ID is not configured."], errors, false);
  if (!options.matchId) return result("skipped", {}, writes, ["Internal matchId is required to produce normalized rows."], errors, false, actorId);

  try {
    const now = options.now ?? new Date();
    const input = buildActorInput(options);
    const cachePath = apifyCachePath(options, actorId);
    const ttlHours = ttlHoursFromEnv(env);
    const cached = await readFreshApifyCache(cachePath, now, ttlHours);
    const client = await loadApifyClient(token, options.apifyClientFactory);
    let cacheHit = false;
    let datasetId = cached?.defaultDatasetId ?? "";
    let actorRunId = cached?.actorRunId;

    if (datasetId) {
      cacheHit = true;
    } else {
      const run = await client.actor(actorId).call(input);
      datasetId = run.defaultDatasetId ?? "";
      actorRunId = run.id;
      if (!datasetId) return result("failed", {}, writes, warnings, ["Apify actor run did not return defaultDatasetId."], false, actorId, actorRunId);
      await writeApifyCache(cachePath, { createdAt: now.toISOString(), actorId, defaultDatasetId: datasetId, actorRunId });
    }

    const listed = await client.dataset(datasetId).listItems({ clean: true });
    const items = Array.isArray(listed.items) ? listed.items : [];
    if (!items.length) return result("partial", {}, writes, ["Apify dataset contained no items."], errors, cacheHit, actorId, actorRunId, datasetId);

    const rows = normalizeApifyItems(items, options, now);
    const validated = validateAllRows(rows, options);
    warnings.push(...validated.warnings);
    for (const [sheetType, sheetRows] of Object.entries(validated.rows) as Array<[AnalystSheetType, Array<Record<string, unknown>>]>) {
      if (!sheetRows.length) continue;
      writes.push(await mergeSheetRows(sheetType, sheetRows, uniqueColumnsBySheet[sheetType], options));
    }

    const fetched = Object.fromEntries((Object.entries(validated.rows) as Array<[AnalystSheetType, Array<Record<string, unknown>>]>)
      .filter(([, sheetRows]) => sheetRows.length)
      .map(([sheetType, sheetRows]) => [analystSheetTemplates[sheetType].filename, sheetRows.length]));
    if (!Object.keys(fetched).length) {
      return result("partial", fetched, writes, ["Apify dataset had no schema-safe normalized rows.", ...warnings], errors, cacheHit, actorId, actorRunId, datasetId);
    }
    return result(warnings.length ? "partial" : "success", fetched, writes, warnings, errors, cacheHit, actorId, actorRunId, datasetId);
  } catch (error) {
    const message = redactApifySecrets(error instanceof Error ? error.message : String(error), env);
    return result("failed", {}, writes, warnings, [message], false, actorId);
  }
}

export function normalizeApifyItems(items: unknown[], options: ApifyHltvActorOptions, now = new Date()): NormalizedRows {
  const context = {
    matchId: options.matchId ?? "",
    teamA: options.teamA ?? "",
    teamB: options.teamB ?? "",
    collectedAt: getISODate(now),
    period: options.period ?? "apify_hltv_actor",
    confidence: options.confidence ?? 0.82
  };
  const rows = emptyRows();
  for (const item of items) {
    collectRosterRows(item, context, rows);
    collectPlayerRows(item, context, rows);
    collectMapRows(item, context, rows);
    collectVetoRows(item, context, rows);
    collectH2hRows(item, context, rows);
  }
  return dedupeRows(rows);
}

function buildActorInput(options: ApifyHltvActorOptions) {
  const proxyConfiguration = { useApifyProxy: true };
  if (options.hltvMatchId) {
    const url = `https://www.hltv.org/matches/${options.hltvMatchId}/${hltvSlug(options.teamA ?? "")}-vs-${hltvSlug(options.teamB ?? "")}`;
    return { matchUrls: [url], startUrls: [{ url }], maxItems: 1, proxyConfiguration };
  }
  if (options.hltvTeamId) {
    const teamName = options.teamA || options.teamB || "team";
    const url = `https://www.hltv.org/team/${options.hltvTeamId}/${hltvSlug(teamName)}`;
    return { teamUrls: [url], startUrls: [{ url }], maxItems: 1, proxyConfiguration };
  }
  return { search: [options.teamA, options.teamB].filter(Boolean).join(" "), maxItems: 1, proxyConfiguration };
}

async function loadApifyClient(token: string, factory?: ApifyHltvActorOptions["apifyClientFactory"]) {
  if (factory) return factory(token);
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ ApifyClient?: new (config: { token: string }) => ApifyClientLike }>;
    const mod = await dynamicImport("apify-client");
    if (!mod.ApifyClient) throw new Error("apify-client did not export ApifyClient.");
    return new mod.ApifyClient({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`apify-client is unavailable. Run pnpm install on this branch before enabling Apify. ${message}`);
  }
}

async function readFreshApifyCache(filePath: string, now: Date, ttlHours: number) {
  try {
    const cached = JSON.parse(await readFile(filePath, "utf8")) as ApifyCacheRecord;
    const timestamp = new Date(cached.createdAt).getTime();
    if (cached.defaultDatasetId && Number.isFinite(timestamp) && now.getTime() - timestamp < ttlHours * 60 * 60 * 1000) return cached;
  } catch {
    // Cache misses are expected.
  }
  return null;
}

async function writeApifyCache(filePath: string, record: ApifyCacheRecord) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function apifyCachePath(options: ApifyHltvActorOptions, actorId: string) {
  const raw = [actorId, options.matchId, options.hltvMatchId, options.hltvTeamId, options.teamA, options.teamB].filter(Boolean).join("|");
  const digest = createHash("sha256").update(raw).digest("hex");
  return path.resolve(process.cwd(), options.cacheDir ?? defaultApifyCacheDir, `${digest}.json`);
}

function ttlHoursFromEnv(env: FetcherEnv) {
  const parsed = Number(env.APIFY_DATASET_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function collectRosterRows(item: unknown, context: NormalizationContext, rows: NormalizedRows) {
  for (const team of teamObjects(item)) {
    const teamName = teamNameFromRecord(team, context);
    const players = arrayAt(team, ["members", "players", "roster", "lineup"]);
    for (const player of players) {
      const nickname = textAt(player, ["nickname", "nick", "name", "playerName", "handle"]);
      if (!nickname || !teamName) continue;
      rows.roster.push({
        matchId: context.matchId,
        teamName,
        nickname,
        role: textAt(player, ["role"]) || "unknown",
        country: textAt(player, ["country", "nationality"]),
        sourceName: defaultSourceName,
        collectedAt: context.collectedAt,
        period: context.period,
        sampleSize: 1,
        confidence: context.confidence
      });
    }
  }
}

function collectPlayerRows(item: unknown, context: NormalizationContext, rows: NormalizedRows) {
  for (const team of teamObjects(item)) {
    const teamName = teamNameFromRecord(team, context);
    for (const player of arrayAt(team, ["players", "members", "roster", "lineup"])) {
      const row = playerStatRow(player, teamName, context);
      if (row) rows.player_stats.push(row);
    }
  }
  const candidates = [...playerObjects(item), ...teamObjects(item).flatMap((team) => arrayAt(team, ["players", "members", "roster"]))];
  for (const player of candidates) {
    const row = playerStatRow(player, teamNameFromRecord(player, context), context);
    if (row) rows.player_stats.push(row);
  }
}

function playerStatRow(player: Record<string, unknown>, teamName: string, context: NormalizationContext) {
  const nickname = textAt(player, ["nickname", "nick", "name", "playerName", "handle"]);
  const maps = positiveNumber(player, ["maps", "mapsPlayed", "sampleSize", "played"]);
  const rating = positiveNumber(player, ["rating", "rating2", "rating2_0", "rating_2_0"]);
  if (!nickname || !teamName || !maps || !rating) return null;
  return {
    matchId: context.matchId,
    teamName,
    nickname,
    maps,
    kills: numberAt(player, ["kills", "k"]) ?? 0,
    deaths: numberAt(player, ["deaths", "d"]) ?? 0,
    assists: numberAt(player, ["assists", "a"]) ?? 0,
    kd: positiveNumber(player, ["kd", "kdr"]) ?? kdFromKillsDeaths(player),
    rating,
    adr: numberAt(player, ["adr", "averageDamage"]) ?? 0,
    kast: numberAt(player, ["kast"]) ?? 0,
    impact: numberAt(player, ["impact"]) ?? 0,
    openingKills: numberAt(player, ["openingKills", "opening_kills"]) ?? 0,
    openingDeaths: numberAt(player, ["openingDeaths", "opening_deaths"]) ?? 0,
    clutchesWon: numberAt(player, ["clutchesWon", "clutches_won"]) ?? 0,
    clutchesAttempted: numberAt(player, ["clutchesAttempted", "clutches_attempted"]) ?? 0,
    sourceName: defaultSourceName,
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: maps,
    confidence: context.confidence
  };
}

function kdFromKillsDeaths(player: Record<string, unknown>) {
  const kills = numberAt(player, ["kills", "k"]) ?? 0;
  const deaths = numberAt(player, ["deaths", "d"]) ?? 0;
  if (kills > 0 && deaths > 0) return Number((kills / deaths).toFixed(3));
  return 1;
}

function collectMapRows(item: unknown, context: NormalizationContext, rows: NormalizedRows) {
  for (const team of teamObjects(item)) {
    const teamName = teamNameFromRecord(team, context);
    for (const map of arrayAt(team, ["maps", "mapStats", "map_stats"])) {
      const row = mapStatRow(map, teamName, context);
      if (row) rows.map_stats.push(row);
    }
  }
  for (const match of matchObjects(item)) {
    for (const map of arrayAt(match, ["maps", "mapStats"])) {
      const mapName = normalizeMapName(textAt(map, ["mapName", "map", "name"]));
      if (!mapName) continue;
      const winner = textAt(map, ["winner", "winnerName", "team"]);
      for (const teamName of [context.teamA, context.teamB].filter(Boolean)) {
        rows.map_stats.push({
          matchId: context.matchId,
          teamName,
          mapName,
          mapsPlayed: 1,
          wins: winner && sameTeam(winner, teamName) ? 1 : 0,
          losses: winner && !sameTeam(winner, teamName) ? 1 : 0,
          winRate: winner ? (sameTeam(winner, teamName) ? 100 : 0) : 0,
          roundsWon: sameTeam(teamName, context.teamA) ? numberAt(map, ["scoreA", "teamAScore", "score1"]) ?? 0 : numberAt(map, ["scoreB", "teamBScore", "score2"]) ?? 0,
          roundsLost: sameTeam(teamName, context.teamA) ? numberAt(map, ["scoreB", "teamBScore", "score2"]) ?? 0 : numberAt(map, ["scoreA", "teamAScore", "score1"]) ?? 0,
          ctRoundWinRate: 0,
          tRoundWinRate: 0,
          pickRate: 0,
          banRate: 0,
          deciderRate: 0,
          sourceName: defaultSourceName,
          collectedAt: context.collectedAt,
          period: context.period,
          sampleSize: 1,
          confidence: context.confidence
        });
      }
    }
  }
}

function collectVetoRows(item: unknown, context: NormalizationContext, rows: NormalizedRows) {
  for (const match of matchObjects(item)) {
    for (const veto of arrayAt(match, ["veto", "vetoes", "mapVeto", "map_veto"])) {
      const mapName = normalizeMapName(textAt(veto, ["mapName", "map", "name"]));
      const teamName = teamNameFromRecord(veto, context);
      const action = textAt(veto, ["action", "type", "vetoType"]).toLowerCase();
      if (!mapName || !teamName) continue;
      rows.veto_history.push({
        matchId: context.matchId,
        teamName,
        mapName,
        sampleSize: positiveNumber(veto, ["sampleSize", "matches", "maps"]) ?? 1,
        pickRate: action.includes("pick") ? 100 : numberAt(veto, ["pickRate"]) ?? 0,
        banRate: action.includes("ban") || action.includes("remove") ? 100 : numberAt(veto, ["banRate"]) ?? 0,
        deciderRate: action.includes("decider") || action.includes("left") ? 100 : numberAt(veto, ["deciderRate"]) ?? 0,
        sourceName: defaultSourceName,
        collectedAt: context.collectedAt,
        period: context.period,
        confidence: context.confidence
      });
    }
  }
}

function collectH2hRows(item: unknown, context: NormalizationContext, rows: NormalizedRows) {
  for (const match of matchObjects(item)) {
    const h2hRows = arrayAt(match, ["h2h", "headToHead", "recentMatches"]);
    for (const h2h of h2hRows) {
      const teamA = textAt(h2h, ["teamA", "team1", "teamA.name"]) || context.teamA;
      const teamB = textAt(h2h, ["teamB", "team2", "teamB.name"]) || context.teamB;
      const mapName = normalizeMapName(textAt(h2h, ["mapName", "map", "name"])) || "Mirage";
      if (!teamA || !teamB) continue;
      rows.h2h.push({
        matchId: context.matchId,
        date: textAt(h2h, ["date", "startTime", "playedAt"]) || context.collectedAt,
        teamA,
        teamB,
        winner: textAt(h2h, ["winner", "winnerName"]) || teamA,
        format: textAt(h2h, ["format", "bo"]) || "BO3",
        mapName,
        scoreA: numberAt(h2h, ["scoreA", "score1", "teamAScore"]) ?? 0,
        scoreB: numberAt(h2h, ["scoreB", "score2", "teamBScore"]) ?? 0,
        rosterSimilarity: numberAt(h2h, ["rosterSimilarity"]) ?? 0,
        sourceName: defaultSourceName,
        collectedAt: context.collectedAt,
        period: context.period,
        sampleSize: 1,
        confidence: context.confidence
      });
    }
  }
}

function mapStatRow(record: Record<string, unknown>, teamName: string, context: NormalizationContext) {
  const mapName = normalizeMapName(textAt(record, ["mapName", "map", "name"]));
  const mapsPlayed = positiveNumber(record, ["mapsPlayed", "maps", "played", "sampleSize"]);
  if (!teamName || !mapName || !mapsPlayed) return null;
  const wins = numberAt(record, ["wins", "w"]) ?? 0;
  const losses = numberAt(record, ["losses", "l"]) ?? Math.max(0, mapsPlayed - wins);
  return {
    matchId: context.matchId,
    teamName,
    mapName,
    mapsPlayed,
    wins,
    losses,
    winRate: numberAt(record, ["winRate", "winrate", "winPct"]) ?? (wins / mapsPlayed) * 100,
    roundsWon: numberAt(record, ["roundsWon", "rounds_won"]) ?? 0,
    roundsLost: numberAt(record, ["roundsLost", "rounds_lost"]) ?? 0,
    ctRoundWinRate: numberAt(record, ["ctRoundWinRate", "ctWinRate"]) ?? 0,
    tRoundWinRate: numberAt(record, ["tRoundWinRate", "tWinRate"]) ?? 0,
    pickRate: numberAt(record, ["pickRate"]) ?? 0,
    banRate: numberAt(record, ["banRate"]) ?? 0,
    deciderRate: numberAt(record, ["deciderRate"]) ?? 0,
    sourceName: defaultSourceName,
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: mapsPlayed,
    confidence: context.confidence
  };
}

function validateAllRows(rows: NormalizedRows, options: ApifyHltvActorOptions) {
  const warnings: string[] = [];
  const validated = emptyRows();
  const teamNames = [options.teamA, options.teamB].filter((team): team is string => Boolean(team));
  for (const [sheetType, sheetRows] of Object.entries(rows) as Array<[AnalystSheetType, Array<Record<string, unknown>>]>) {
    for (const row of sheetRows) {
      const result = validateNormalizedFile({
        fileName: analystSheetTemplates[sheetType].filename,
        rows: [row],
        expectedMatchId: options.matchId,
        allowedTeamNames: teamNames
      });
      if (result.isValid) validated[sheetType].push(row);
      else warnings.push(...result.errors.map((error) => `${sheetType}: ${error}`));
      warnings.push(...result.warnings.map((warning) => `${sheetType}: ${warning}`));
    }
  }
  return { rows: validated, warnings };
}

function teamObjects(item: unknown): Array<Record<string, unknown>> {
  const objects = extractObjects(item);
  return objects.filter((record) => {
    if (Array.isArray(record.players) || Array.isArray(record.members) || Array.isArray(record.roster) || Array.isArray(record.lineup)) return true;
    return ["team", "teams"].includes(textAt(record, ["type"]).toLowerCase());
  });
}

function playerObjects(item: unknown): Array<Record<string, unknown>> {
  return extractObjects(item).filter((record) => textAt(record, ["type"]).toLowerCase() === "player" || Boolean(textAt(record, ["nickname", "nick", "playerName"])) && Boolean(positiveNumber(record, ["rating", "rating2", "rating2_0"])));
}

function matchObjects(item: unknown): Array<Record<string, unknown>> {
  return extractObjects(item).filter((record) => textAt(record, ["type"]).toLowerCase() === "match" || Array.isArray(record.maps) || Array.isArray(record.veto) || Array.isArray(record.h2h) || Array.isArray(record.recentMatches));
}

function extractObjects(payload: unknown): Array<Record<string, unknown>> {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.flatMap(extractObjects);
  if (typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(extractObjects)];
}

function arrayAt(record: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[part];
    }, record);
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function teamNameFromRecord(record: Record<string, unknown>, context: NormalizationContext) {
  const direct = textAt(record, ["teamName", "team", "team.name", "name"]);
  if (direct && (sameTeam(direct, context.teamA) || sameTeam(direct, context.teamB))) return sameTeam(direct, context.teamA) ? context.teamA : context.teamB;
  if (context.teamA && JSON.stringify(record).toLowerCase().includes(context.teamA.toLowerCase())) return context.teamA;
  if (context.teamB && JSON.stringify(record).toLowerCase().includes(context.teamB.toLowerCase())) return context.teamB;
  return direct;
}

function positiveNumber(record: unknown, keys: string[]) {
  const value = numberAt(record, keys);
  return value !== null && value > 0 ? value : null;
}

function sameTeam(a: string, b: string) {
  return Boolean(a && b && stableSlug(a) === stableSlug(b));
}

function emptyRows(): NormalizedRows {
  return {
    roster: [],
    player_stats: [],
    map_stats: [],
    veto_history: [],
    h2h: [],
    news_events: []
  };
}

function dedupeRows(rows: NormalizedRows): NormalizedRows {
  const deduped = emptyRows();
  for (const [sheetType, sheetRows] of Object.entries(rows) as Array<[AnalystSheetType, Array<Record<string, unknown>>]>) {
    const seen = new Set<string>();
    for (const row of sheetRows) {
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped[sheetType].push(row);
    }
  }
  return deduped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function result(
  status: ApifyHltvActorResult["status"],
  fetched: Record<string, number>,
  writes: CsvMergeResult[],
  warnings: string[],
  errors: string[],
  cacheHit: boolean,
  actorId?: string,
  actorRunId?: string,
  datasetId?: string
): ApifyHltvActorResult {
  return {
    source: "apify-hltv-actor",
    status,
    fetched,
    writes,
    warnings,
    errors,
    cacheHit,
    actorId,
    actorRunId,
    datasetId
  };
}

function redactApifySecrets(value: string, env: FetcherEnv) {
  let redacted = value.replace(/apify_api_[A-Za-z0-9]+/g, "apify_api_[redacted]");
  if (env.APIFY_TOKEN) redacted = redacted.split(env.APIFY_TOKEN).join("[redacted]");
  return redacted;
}

type NormalizationContext = {
  matchId: string;
  teamA: string;
  teamB: string;
  collectedAt: string;
  period: string;
  confidence: number;
};
