import path from "node:path";
import { analystSheetTemplates, type AnalystSheetType } from "../../src/lib/analystSheetTemplates";
import { validateNormalizedFile } from "../../src/lib/validation/normalizedFileValidator";
import {
  getISODate,
  mergeSheetRows,
  parseCliArgs,
  stableSlug,
  textAt,
  type CsvMergeResult,
  type FetchLike,
  type FetcherEnv
} from "../data-fetchers/utils";
import { extractH2hRows, extractVetoRows } from "./hltv-match-parser";
import { extractHltvMapStats } from "./hltv-team-stats";
import { extractHltvPlayerStats } from "./hltv-player-stats";
import { hltvSlug, isResearchEnabled, normalizeMapName, parseNumber, researchFetchText, stripTags } from "./hltv-client";
import { checkRobotsAllowed } from "./robots-cache";
import { fetchViaArchiveToday } from "./archive-today-fetcher";
import { fetchViaJinaProxy } from "./jina-proxy-fetcher";
import { fetchViaWayback } from "./wayback-fetcher";

export type DataType = "roster" | "player_stats" | "map_stats" | "veto" | "h2h";

export interface MultiSourceFetchOptions {
  dataType: DataType;
  matchId: string;
  teamName?: string;
  teamId?: string;
  opponentTeamName?: string;
  hltvMatchId?: string;
  csstatsTeamId?: string;
  dryRun?: boolean;
  inboxPath?: string;
  period?: string;
  confidence?: number;
  env?: FetcherEnv;
  fetchImpl?: FetchLike;
  waitImpl?: (ms: number) => Promise<void>;
  cacheDir?: string;
  now?: Date;
  includeH2h?: boolean;
  ids?: Partial<Record<ResearchSourceId, string>>;
}

export interface SourceResult {
  source: string;
  status: "success" | "partial" | "failed" | "skipped";
  rows: Array<Record<string, unknown>>;
  warnings: string[];
  url?: string;
  parserId?: string;
  robotsAllowed?: boolean;
}

export type MultiSourceResult = {
  dataType: DataType;
  sheetType: AnalystSheetType;
  status: "success" | "partial" | "failed" | "skipped";
  rows: Array<Record<string, unknown>>;
  writes: CsvMergeResult[];
  sourceResults: SourceResult[];
  warnings: string[];
};

type ResearchSourceId =
  | "hltvTeam"
  | "hltvMatch"
  | "csstatsTeam"
  | "liquipediaPage"
  | "faceitTeam"
  | "faceitPlayer"
  | "faceitMatch"
  | "eslTeam"
  | "eslMatch"
  | "blastTeam"
  | "blastMatch"
  | "gosuTeam"
  | "gosuPlayer"
  | "gosuMatch"
  | "dust2Team"
  | "dust2Player"
  | "dust2Match"
  | "pleyTeam"
  | "pleyMatch"
  | "steamId"
  | "steamGroup"
  | "playerId"
  | "playerNickname";

type SourceDescriptor = {
  id: string;
  name: string;
  dataType: DataType;
  parserId: string;
  required: ResearchSourceId[];
  sourceFlag?: string;
  allowedHosts: string[];
  allowedPathPatterns: RegExp[];
  expectedRows: number;
  buildUrl: (options: MultiSourceFetchOptions) => string;
  parse: (body: string, context: ParserContext) => Array<Record<string, unknown>>;
  fetchStrategy?: "direct" | "wayback" | "archive-today" | "jina-proxy" | "sitemap-export";
  directSourceFlag?: string;
};

type ParserContext = {
  options: MultiSourceFetchOptions;
  sourceName: string;
  collectedAt: string;
  period: string;
  confidence: number;
};

const sheetByDataType: Record<DataType, AnalystSheetType> = {
  roster: "roster",
  player_stats: "player_stats",
  map_stats: "map_stats",
  veto: "veto_history",
  h2h: "h2h"
};

const uniqueColumnsBySheet: Record<AnalystSheetType, string[]> = {
  roster: ["matchId", "teamName", "nickname", "sourceName"],
  player_stats: ["matchId", "teamName", "nickname", "sourceName", "period"],
  map_stats: ["matchId", "teamName", "mapName", "sourceName", "period"],
  veto_history: ["matchId", "teamName", "mapName", "sourceName", "period"],
  h2h: ["matchId", "date", "teamA", "teamB", "mapName", "sourceName"],
  news_events: ["matchId", "sourceName", "title", "publishedAt"]
};

export async function fetchMultiSourceData(options: MultiSourceFetchOptions): Promise<MultiSourceResult> {
  const sheetType = sheetByDataType[options.dataType];
  const descriptors = sourceDescriptors[options.dataType];
  const sourceResults: SourceResult[] = [];
  const warnings: string[] = [];
  const writes: CsvMergeResult[] = [];
  const env = options.env ?? process.env;

  for (const descriptor of descriptors) {
    const missing = missingIdentifiers(descriptor, options);
    if (missing.length) {
      sourceResults.push({
        source: descriptor.id,
        status: "skipped",
        rows: [],
        warnings: [`missing_identifier: ${missing.join(", ")}`],
        parserId: descriptor.parserId
      });
      continue;
    }
    const url = descriptor.buildUrl(options);
    if (!url) {
      sourceResults.push({ source: descriptor.id, status: "skipped", rows: [], warnings: ["source URL could not be built."], parserId: descriptor.parserId });
      continue;
    }
    const sourceFlag = descriptor.sourceFlag ?? "ENABLE_RESEARCH_SOURCES";
    if (!isResearchEnabled(env, sourceFlag)) {
      sourceResults.push({ source: descriptor.id, status: "skipped", rows: [], warnings: [`Research source is disabled: ${sourceFlag}.`], url, parserId: descriptor.parserId });
      continue;
    }
    const robots = descriptor.fetchStrategy === "wayback" || descriptor.fetchStrategy === "archive-today" || descriptor.fetchStrategy === "jina-proxy"
      ? { allowed: true, warnings: [] as string[] }
      : await checkRobotsAllowed(url, { env, fetchImpl: options.fetchImpl, cacheDir: options.cacheDir, now: options.now });
    if (!robots.allowed) {
      sourceResults.push({ source: descriptor.id, status: "skipped", rows: [], warnings: robots.warnings, url, parserId: descriptor.parserId, robotsAllowed: false });
      continue;
    }
    const response = await fetchDescriptorBody(descriptor, url, options, sourceFlag);
    if (!response.body) {
      sourceResults.push({ source: descriptor.id, status: response.status === "disabled" || response.status === "blocked" ? "skipped" : "failed", rows: [], warnings: response.warnings, url, parserId: descriptor.parserId, robotsAllowed: true });
      continue;
    }
    const context = {
      options,
      sourceName: descriptor.name,
      collectedAt: getISODate(options.now),
      period: options.period ?? descriptor.id,
      confidence: options.confidence ?? defaultConfidence(descriptor)
    };
    const rows = validateRows(sheetType, descriptor.parse(response.body, context), options);
    if (!rows.valid.length) {
      sourceResults.push({ source: descriptor.id, status: "failed", rows: [], warnings: [...response.warnings, ...rows.warnings, "parse_empty"], url, parserId: descriptor.parserId, robotsAllowed: true });
      continue;
    }
    const merge = await mergeSheetRows(sheetType, rows.valid, uniqueColumnsBySheet[sheetType], options);
    writes.push(merge);
    const status = rows.valid.length >= descriptor.expectedRows ? "success" : "partial";
    sourceResults.push({ source: descriptor.id, status, rows: rows.valid, warnings: [...response.warnings, ...rows.warnings], url, parserId: descriptor.parserId, robotsAllowed: true });
    return {
      dataType: options.dataType,
      sheetType,
      status,
      rows: rows.valid,
      writes,
      sourceResults,
      warnings
    };
  }

  warnings.push(`No ${options.dataType} source produced valid rows.`);
  return { dataType: options.dataType, sheetType, status: "failed", rows: [], writes, sourceResults, warnings };
}

async function fetchDescriptorBody(descriptor: SourceDescriptor, url: string, options: MultiSourceFetchOptions, sourceFlag: string) {
  if (descriptor.fetchStrategy === "wayback") {
    return fetchViaWayback(url, {
      env: options.env ?? process.env,
      fetchImpl: options.fetchImpl,
      waitImpl: options.waitImpl,
      cacheDir: options.cacheDir ? path.join(options.cacheDir, "wayback") : undefined,
      rateLimitMs: 2000,
      now: options.now,
      sourceFlag,
      directSourceFlag: descriptor.directSourceFlag,
      allowedHosts: descriptor.allowedHosts,
      allowedPathPatterns: descriptor.allowedPathPatterns,
      originalAllowedHosts: descriptor.allowedHosts,
      originalAllowedPathPatterns: descriptor.allowedPathPatterns,
      cacheNamespace: `multi-source-${descriptor.id}`,
      directFirst: false
    });
  }
  if (descriptor.fetchStrategy === "archive-today") {
    return fetchViaArchiveToday(url, {
      env: options.env ?? process.env,
      fetchImpl: options.fetchImpl,
      cacheDir: options.cacheDir ? path.join(options.cacheDir, "archive-today") : undefined,
      now: options.now,
      sourceFlag
    });
  }
  if (descriptor.fetchStrategy === "jina-proxy") {
    return fetchViaJinaProxy(url, {
      env: options.env ?? process.env,
      fetchImpl: options.fetchImpl,
      cacheDir: options.cacheDir ? path.join(options.cacheDir, "jina") : undefined,
      now: options.now,
      maxBytes: 2_000_000
    });
  }
  if (descriptor.fetchStrategy === "sitemap-export") {
    return fetchFromSitemapExport(descriptor, url, options, sourceFlag);
  }
  return researchFetchText(url, {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl,
    waitImpl: options.waitImpl,
    cacheDir: options.cacheDir,
    rateLimitMs: 5000,
    now: options.now,
    sourceFlag,
    allowedHosts: descriptor.allowedHosts,
    allowedPathPatterns: descriptor.allowedPathPatterns,
    cacheNamespace: `multi-source-${descriptor.id}`,
    robotsCheck: false
  });
}

async function fetchFromSitemapExport(descriptor: SourceDescriptor, sitemapUrl: string, options: MultiSourceFetchOptions, sourceFlag: string) {
  const sitemap = await researchFetchText(sitemapUrl, {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl,
    waitImpl: options.waitImpl,
    cacheDir: options.cacheDir,
    rateLimitMs: 2000,
    now: options.now,
    sourceFlag,
    allowedHosts: descriptor.allowedHosts,
    allowedPathPatterns: descriptor.allowedPathPatterns,
    cacheNamespace: `sitemap-${descriptor.id}`,
    robotsCheck: false
  });
  if (!sitemap.body) return sitemap;
  const candidate = selectSitemapExportUrl(extractSitemapUrls(sitemap.body), descriptor, options);
  if (!candidate) {
    return { status: "failed" as const, url: sitemap.url, body: "", warnings: [...sitemap.warnings, "No allowlisted export URL found in sitemap."] };
  }
  const response = await researchFetchText(candidate, {
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl,
    waitImpl: options.waitImpl,
    cacheDir: options.cacheDir,
    rateLimitMs: 2000,
    now: options.now,
    sourceFlag,
    allowedHosts: descriptor.allowedHosts,
    allowedPathPatterns: descriptor.allowedPathPatterns,
    cacheNamespace: `sitemap-export-${descriptor.id}`,
    robotsCheck: false
  });
  return { ...response, warnings: [...sitemap.warnings, ...response.warnings, `sitemap_export=${candidate}`] };
}

export const sourceDescriptors: Record<DataType, SourceDescriptor[]> = {
  roster: [
    descriptor("liquipedia_roster_api", "Liquipedia MediaWiki API", "roster", [], ["liquipedia.net"], [/\/counterstrike\/api\.php$/], 5, (o) => liquipediaApiUrl("parse", o.ids?.liquipediaPage ?? o.teamName ?? ""), parseGenericRoster),
    descriptor("hltv_team_page", "HLTV research team page", "roster", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/team\/\d+\/[a-z0-9-]+$/], 5, (o) => `https://www.hltv.org/team/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseGenericRoster, "ENABLE_HLTV_AUTOMATION"),
    descriptor("wayback_hltv_team_page", "Wayback HLTV team page", "roster", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/team\/\d+\/[a-z0-9-]+$/], 5, (o) => `https://www.hltv.org/team/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseGenericRoster, "ENABLE_WAYBACK_FALLBACK", "wayback", "ENABLE_HLTV_AUTOMATION"),
    descriptor("archive_today_hltv_team_page", "Archive.today HLTV team page", "roster", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/team\/\d+\/[a-z0-9-]+$/], 5, (o) => `https://www.hltv.org/team/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseGenericRoster, "ENABLE_ARCHIVE_TODAY_FALLBACK", "archive-today", "ENABLE_HLTV_AUTOMATION"),
    descriptor("jina_hltv_team_page", "Jina Reader HLTV team page", "roster", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/team\/\d+\/[a-z0-9-]+$/], 5, (o) => `https://www.hltv.org/team/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseGenericRoster, "ENABLE_JINA_PROXY_FALLBACK", "jina-proxy", "ENABLE_HLTV_AUTOMATION"),
    descriptor("csstats_team_page", "CSStats team page", "roster", ["csstatsTeam"], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/team\/[^/]+$/], 5, (o) => `https://csgostats.gg/team/${id(o, "csstatsTeam", o.csstatsTeamId)}`, parseGenericRoster),
    descriptor("esportis_team_page", "Esport.is team page", "roster", [], ["esport.is"], [/^\/team\/[^/]+$/], 5, (o) => `https://esport.is/team/${encodeURIComponent(o.teamName ?? "")}`, parseGenericRoster),
    descriptor("dust2_team_page", "Dust2.dk team page", "roster", ["dust2Team"], ["dust2.dk", "www.dust2.dk"], [/^\/team\/[^/]+$/], 5, (o) => `https://dust2.dk/team/${id(o, "dust2Team")}`, parseGenericRoster),
    descriptor("faceit_team_roster", "FACEIT team roster", "roster", ["faceitTeam"], ["www.faceit.com", "faceit.com"], [/^\/teams\/[^/]+\/roster$/], 5, (o) => `https://www.faceit.com/teams/${id(o, "faceitTeam")}/roster`, parseGenericRoster),
    descriptor("esl_team_page", "ESL team page", "roster", ["eslTeam"], ["www.esl.com", "esl.com"], [/^\/team\/[^/]+$/], 5, (o) => `https://www.esl.com/team/${id(o, "eslTeam")}`, parseGenericRoster),
    descriptor("blast_team_page", "BLAST team page", "roster", ["blastTeam"], ["blast.tv", "www.blast.tv"], [/^\/team\/[^/]+$/], 5, (o) => `https://blast.tv/team/${id(o, "blastTeam")}`, parseGenericRoster),
    descriptor("gosugamers_team_page", "GosuGamers team page", "roster", ["gosuTeam"], ["www.gosugamers.net", "gosugamers.net"], [/^\/counterstrike\/teams\/[^/]+$/], 5, (o) => `https://www.gosugamers.net/counterstrike/teams/${id(o, "gosuTeam")}`, parseGenericRoster),
    descriptor("pley_team_page", "Pley.gg team page", "roster", [], ["pley.gg", "www.pley.gg"], [/^\/team\/[^/]+$/], 5, (o) => `https://pley.gg/team/${encodeURIComponent(o.teamName ?? "")}`, parseGenericRoster),
    descriptor("steam_group_members", "Steam Community group", "roster", ["steamGroup"], ["steamcommunity.com"], [/^\/groups\/[^/]+\/members$/], 5, (o) => `https://steamcommunity.com/groups/${id(o, "steamGroup")}/members`, parseGenericRoster),
    descriptor("valve_regional_standings_hint", "Valve Regional Standings roster hint", "roster", [], ["liquipedia.net"], [/\/counterstrike\/api\.php$/], 5, (o) => liquipediaApiUrl("query", o.teamName ?? ""), parseGenericRoster)
  ],
  player_stats: [
    descriptor("hltv_player_stats", "HLTV research player stats", "player_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/players$/], 5, (o) => `https://www.hltv.org/stats/players?team=${encodeURIComponent(id(o, "hltvTeam", o.teamId))}`, parseHltvPlayers, "ENABLE_HLTV_AUTOMATION"),
    descriptor("wayback_hltv_player_stats", "Wayback HLTV player stats", "player_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/players$/], 5, (o) => `https://www.hltv.org/stats/players?team=${encodeURIComponent(id(o, "hltvTeam", o.teamId))}`, parseHltvPlayers, "ENABLE_WAYBACK_FALLBACK", "wayback", "ENABLE_HLTV_AUTOMATION"),
    descriptor("archive_today_hltv_player_stats", "Archive.today HLTV player stats", "player_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/players$/], 5, (o) => `https://www.hltv.org/stats/players?team=${encodeURIComponent(id(o, "hltvTeam", o.teamId))}`, parseHltvPlayers, "ENABLE_ARCHIVE_TODAY_FALLBACK", "archive-today", "ENABLE_HLTV_AUTOMATION"),
    descriptor("jina_hltv_player_stats", "Jina Reader HLTV player stats", "player_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/players$/], 5, (o) => `https://www.hltv.org/stats/players?team=${encodeURIComponent(id(o, "hltvTeam", o.teamId))}`, parseGenericPlayerStats, "ENABLE_JINA_PROXY_FALLBACK", "jina-proxy", "ENABLE_HLTV_AUTOMATION"),
    descriptor("csstats_players_csv", "CSStats player CSV", "player_stats", ["csstatsTeam"], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/team\/[^/]+\/export$/], 5, (o) => `https://csgostats.gg/team/${id(o, "csstatsTeam", o.csstatsTeamId)}/export?type=players`, parseGenericPlayerStats),
    descriptor("csstats_sitemap_players_csv", "CSStats sitemap player CSV", "player_stats", [], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/sitemap\.xml$/, /^\/team\/[^/]+\/export$/], 5, () => "https://csgostats.gg/sitemap.xml", parseGenericPlayerStats, "ENABLE_SITEMAP_EXPORT_DISCOVERY", "sitemap-export"),
    descriptor("faceit_player_stats", "FACEIT player stats", "player_stats", ["playerNickname"], ["www.faceit.com", "faceit.com"], [/^\/players\/[^/]+\/stats$/], 1, (o) => `https://www.faceit.com/players/${id(o, "playerNickname")}/stats`, parseGenericPlayerStats),
    descriptor("esportis_player_stats", "Esport.is player stats", "player_stats", ["playerId"], ["esport.is"], [/^\/player\/[^/]+$/], 1, (o) => `https://esport.is/player/${id(o, "playerId")}`, parseGenericPlayerStats),
    descriptor("steam_web_api_player", "Steam Web API player stats", "player_stats", ["steamId"], ["api.steampowered.com"], [/^\/ISteamUserStats\/GetUserStatsForGame\/v2\/$/], 1, (o) => `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=730&steamid=${id(o, "steamId")}&key=${encodeURIComponent(o.env?.STEAM_API_KEY ?? process.env.STEAM_API_KEY ?? "")}`, parseGenericPlayerStats),
    descriptor("leetify_profile_stats", "Leetify public profile", "player_stats", ["steamId"], ["leetify.com", "www.leetify.com"], [/^\/profile\/[^/]+\/stats$/], 1, (o) => `https://leetify.com/profile/${id(o, "steamId")}/stats`, parseGenericPlayerStats),
    descriptor("dust2_player_stats", "Dust2.dk player stats", "player_stats", ["dust2Player"], ["dust2.dk", "www.dust2.dk"], [/^\/player\/[^/]+\/stats$/], 1, (o) => `https://dust2.dk/player/${id(o, "dust2Player")}/stats`, parseGenericPlayerStats),
    descriptor("counterstrikestats_player", "CounterStrikeStats player", "player_stats", ["steamId"], ["counterstrikestats.com", "www.counterstrikestats.com"], [/^\/player\/[^/]+$/], 1, (o) => `https://counterstrikestats.com/player/${id(o, "steamId")}`, parseGenericPlayerStats),
    descriptor("cs2leaderboard_api", "CS2Leaderboard public API", "player_stats", ["steamId"], ["cs2leaderboard.com"], [/^\/api\/player\/[^/]+$/], 1, (o) => `https://cs2leaderboard.com/api/player/${id(o, "steamId")}`, parseGenericPlayerStats),
    descriptor("gosugamers_player_stats", "GosuGamers player stats", "player_stats", ["gosuPlayer"], ["www.gosugamers.net", "gosugamers.net"], [/^\/counterstrike\/players\/[^/]+\/stats$/], 1, (o) => `https://www.gosugamers.net/counterstrike/players/${id(o, "gosuPlayer")}/stats`, parseGenericPlayerStats)
  ],
  map_stats: [
    descriptor("hltv_team_map_stats", "HLTV research team map stats", "map_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/teams\/maps\/\d+\/[a-z0-9-]+$/], 7, (o) => `https://www.hltv.org/stats/teams/maps/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseHltvMaps, "ENABLE_HLTV_AUTOMATION"),
    descriptor("wayback_hltv_team_map_stats", "Wayback HLTV team map stats", "map_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/teams\/maps\/\d+\/[a-z0-9-]+$/], 7, (o) => `https://www.hltv.org/stats/teams/maps/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseHltvMaps, "ENABLE_WAYBACK_FALLBACK", "wayback", "ENABLE_HLTV_AUTOMATION"),
    descriptor("archive_today_hltv_team_map_stats", "Archive.today HLTV team map stats", "map_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/teams\/maps\/\d+\/[a-z0-9-]+$/], 7, (o) => `https://www.hltv.org/stats/teams/maps/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseHltvMaps, "ENABLE_ARCHIVE_TODAY_FALLBACK", "archive-today", "ENABLE_HLTV_AUTOMATION"),
    descriptor("jina_hltv_team_map_stats", "Jina Reader HLTV team map stats", "map_stats", ["hltvTeam"], ["www.hltv.org", "hltv.org"], [/^\/stats\/teams\/maps\/\d+\/[a-z0-9-]+$/], 7, (o) => `https://www.hltv.org/stats/teams/maps/${id(o, "hltvTeam", o.teamId)}/${hltvSlug(o.teamName ?? "")}`, parseGenericMapStats, "ENABLE_JINA_PROXY_FALLBACK", "jina-proxy", "ENABLE_HLTV_AUTOMATION"),
    descriptor("csstats_maps_csv", "CSStats map CSV", "map_stats", ["csstatsTeam"], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/team\/[^/]+\/export$/], 7, (o) => `https://csgostats.gg/team/${id(o, "csstatsTeam", o.csstatsTeamId)}/export?type=maps`, parseGenericMapStats),
    descriptor("csstats_sitemap_maps_csv", "CSStats sitemap map CSV", "map_stats", [], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/sitemap\.xml$/, /^\/team\/[^/]+\/export$/], 7, () => "https://csgostats.gg/sitemap.xml", parseGenericMapStats, "ENABLE_SITEMAP_EXPORT_DISCOVERY", "sitemap-export"),
    descriptor("liquipedia_map_records", "Liquipedia map records", "map_stats", [], ["liquipedia.net"], [/\/counterstrike\/api\.php$/], 7, (o) => liquipediaApiUrl("parse", o.ids?.liquipediaPage ?? o.teamName ?? ""), parseGenericMapStats),
    descriptor("esportis_team_maps", "Esport.is team maps", "map_stats", [], ["esport.is"], [/^\/team\/[^/]+$/], 7, (o) => `https://esport.is/team/${encodeURIComponent(o.teamName ?? "")}`, parseGenericMapStats),
    descriptor("faceit_team_maps", "FACEIT team map stats", "map_stats", ["faceitTeam"], ["www.faceit.com", "faceit.com"], [/^\/teams\/[^/]+\/stats\/maps$/], 7, (o) => `https://www.faceit.com/teams/${id(o, "faceitTeam")}/stats/maps`, parseGenericMapStats),
    descriptor("dust2_team_maps", "Dust2.dk team maps", "map_stats", ["dust2Team"], ["dust2.dk", "www.dust2.dk"], [/^\/team\/[^/]+\/maps$/], 7, (o) => `https://dust2.dk/team/${id(o, "dust2Team")}/maps`, parseGenericMapStats),
    descriptor("esl_team_stats", "ESL team map performance", "map_stats", ["eslTeam"], ["www.esl.com", "esl.com"], [/^\/team\/[^/]+\/stats$/], 7, (o) => `https://www.esl.com/team/${id(o, "eslTeam")}/stats`, parseGenericMapStats),
    descriptor("blast_team_stats", "BLAST team stats", "map_stats", ["blastTeam"], ["blast.tv", "www.blast.tv"], [/^\/team\/[^/]+\/stats$/], 7, (o) => `https://blast.tv/team/${id(o, "blastTeam")}/stats`, parseGenericMapStats),
    descriptor("gosugamers_team_maps", "GosuGamers team maps", "map_stats", ["gosuTeam"], ["www.gosugamers.net", "gosugamers.net"], [/^\/counterstrike\/teams\/[^/]+\/maps$/], 7, (o) => `https://www.gosugamers.net/counterstrike/teams/${id(o, "gosuTeam")}/maps`, parseGenericMapStats),
    descriptor("pley_team_maps", "Pley.gg team maps", "map_stats", [], ["pley.gg", "www.pley.gg"], [/^\/team\/[^/]+$/], 7, (o) => `https://pley.gg/team/${encodeURIComponent(o.teamName ?? "")}`, parseGenericMapStats)
  ],
  veto: [
    descriptor("hltv_match_veto", "HLTV research match page", "veto", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 2, (o) => hltvMatchUrl(o), parseHltvVeto, "ENABLE_HLTV_AUTOMATION"),
    descriptor("wayback_hltv_match_veto", "Wayback HLTV match page", "veto", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 2, (o) => hltvMatchUrl(o), parseHltvVeto, "ENABLE_WAYBACK_FALLBACK", "wayback", "ENABLE_HLTV_AUTOMATION"),
    descriptor("archive_today_hltv_match_veto", "Archive.today HLTV match page", "veto", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 2, (o) => hltvMatchUrl(o), parseHltvVeto, "ENABLE_ARCHIVE_TODAY_FALLBACK", "archive-today", "ENABLE_HLTV_AUTOMATION"),
    descriptor("jina_hltv_match_veto", "Jina Reader HLTV match page", "veto", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 2, (o) => hltvMatchUrl(o), parseGenericVeto, "ENABLE_JINA_PROXY_FALLBACK", "jina-proxy", "ENABLE_HLTV_AUTOMATION"),
    descriptor("faceit_match_veto", "FACEIT match veto", "veto", ["faceitMatch"], ["www.faceit.com", "faceit.com"], [/^\/csgo\/match\/[^/]+$/], 2, (o) => `https://www.faceit.com/csgo/match/${id(o, "faceitMatch")}`, parseGenericVeto),
    descriptor("liquipedia_match_veto", "Liquipedia match veto", "veto", ["liquipediaPage"], ["liquipedia.net"], [/\/counterstrike\/api\.php$/], 2, (o) => liquipediaApiUrl("parse", id(o, "liquipediaPage")), parseGenericVeto),
    descriptor("esl_match_veto", "ESL match veto", "veto", ["eslMatch"], ["www.esl.com", "esl.com"], [/^\/match\/[^/]+$/], 2, (o) => `https://www.esl.com/match/${id(o, "eslMatch")}`, parseGenericVeto),
    descriptor("blast_match_veto", "BLAST match veto", "veto", ["blastMatch"], ["blast.tv", "www.blast.tv"], [/^\/match\/[^/]+$/], 2, (o) => `https://blast.tv/match/${id(o, "blastMatch")}`, parseGenericVeto),
    descriptor("csstats_match_veto", "CSStats match page", "veto", ["csstatsTeam"], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/match\/[^/]+$/], 2, (o) => `https://csgostats.gg/match/${id(o, "csstatsTeam")}`, parseGenericVeto),
    descriptor("esportis_match_veto", "Esport.is match veto", "veto", ["hltvMatch"], ["esport.is"], [/^\/match\/[^/]+$/], 2, (o) => `https://esport.is/match/${id(o, "hltvMatch", o.hltvMatchId)}`, parseGenericVeto),
    descriptor("gosugamers_match_veto", "GosuGamers match veto", "veto", ["gosuMatch"], ["www.gosugamers.net", "gosugamers.net"], [/^\/counterstrike\/matches\/[^/]+$/], 2, (o) => `https://www.gosugamers.net/counterstrike/matches/${id(o, "gosuMatch")}`, parseGenericVeto),
    descriptor("dust2_match_veto", "Dust2.dk match veto", "veto", ["dust2Match"], ["dust2.dk", "www.dust2.dk"], [/^\/match\/[^/]+$/], 2, (o) => `https://dust2.dk/match/${id(o, "dust2Match")}`, parseGenericVeto),
    descriptor("pley_match_veto", "Pley.gg match veto", "veto", ["pleyMatch"], ["pley.gg", "www.pley.gg"], [/^\/match\/[^/]+$/], 2, (o) => `https://pley.gg/match/${id(o, "pleyMatch")}`, parseGenericVeto)
  ],
  h2h: [
    descriptor("hltv_match_h2h", "HLTV research match page", "h2h", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 1, (o) => hltvMatchUrl(o), parseHltvH2h, "ENABLE_HLTV_AUTOMATION"),
    descriptor("wayback_hltv_match_h2h", "Wayback HLTV match page", "h2h", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 1, (o) => hltvMatchUrl(o), parseHltvH2h, "ENABLE_WAYBACK_FALLBACK", "wayback", "ENABLE_HLTV_AUTOMATION"),
    descriptor("archive_today_hltv_match_h2h", "Archive.today HLTV match page", "h2h", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 1, (o) => hltvMatchUrl(o), parseHltvH2h, "ENABLE_ARCHIVE_TODAY_FALLBACK", "archive-today", "ENABLE_HLTV_AUTOMATION"),
    descriptor("jina_hltv_match_h2h", "Jina Reader HLTV match page", "h2h", ["hltvMatch"], ["www.hltv.org", "hltv.org"], [/^\/matches\/\d+\/[a-z0-9-]+$/], 1, (o) => hltvMatchUrl(o), parseGenericH2h, "ENABLE_JINA_PROXY_FALLBACK", "jina-proxy", "ENABLE_HLTV_AUTOMATION"),
    descriptor("hltv_rss_match_metadata", "HLTV RSS match metadata", "h2h", [], ["www.hltv.org", "hltv.org"], [/^\/rss\/matches$/], 1, () => "https://www.hltv.org/rss/matches", parseRssMetadataOnly, "ENABLE_RSS_METADATA_DISCOVERY"),
    descriptor("liquipedia_team_vs_team", "Liquipedia team vs team", "h2h", [], ["liquipedia.net"], [/\/counterstrike\/api\.php$/], 1, (o) => liquipediaApiUrl("parse", `${o.teamName ?? ""}_vs_${o.opponentTeamName ?? ""}`), parseGenericH2h),
    descriptor("esportis_h2h", "Esport.is H2H", "h2h", [], ["esport.is"], [/^\/head-to-head$/], 1, (o) => `https://esport.is/head-to-head?teamA=${encodeURIComponent(o.teamName ?? "")}&teamB=${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("csstats_team_comparison", "CSStats team comparison", "h2h", ["csstatsTeam"], ["csgostats.gg", "www.csgostats.gg", "csstats.gg", "www.csstats.gg"], [/^\/team\/[^/]+\/vs\/[^/]+$/], 1, (o) => `https://csgostats.gg/team/${id(o, "csstatsTeam", o.csstatsTeamId)}/vs/${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("faceit_h2h", "FACEIT H2H", "h2h", ["faceitTeam"], ["www.faceit.com", "faceit.com"], [/^\/teams\/[^/]+\/vs\/[^/]+$/], 1, (o) => `https://www.faceit.com/teams/${id(o, "faceitTeam")}/vs/${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("esl_h2h", "ESL H2H", "h2h", [], ["www.esl.com", "esl.com"], [/^\/h2h$/], 1, (o) => `https://www.esl.com/h2h?team1=${encodeURIComponent(o.teamName ?? "")}&team2=${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("blast_h2h", "BLAST H2H", "h2h", [], ["blast.tv", "www.blast.tv"], [/^\/h2h\/[^/]+\/[^/]+$/], 1, (o) => `https://blast.tv/h2h/${hltvSlug(o.teamName ?? "")}/${hltvSlug(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("gosugamers_h2h", "GosuGamers H2H", "h2h", ["gosuTeam"], ["www.gosugamers.net", "gosugamers.net"], [/^\/counterstrike\/teams\/h2h\/[^/]+\/[^/]+$/], 1, (o) => `https://www.gosugamers.net/counterstrike/teams/h2h/${id(o, "gosuTeam")}/${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("dust2_h2h", "Dust2.dk H2H", "h2h", ["dust2Team"], ["dust2.dk", "www.dust2.dk"], [/^\/h2h\/[^/]+\/[^/]+$/], 1, (o) => `https://dust2.dk/h2h/${id(o, "dust2Team")}/${encodeURIComponent(o.opponentTeamName ?? "")}`, parseGenericH2h),
    descriptor("pley_h2h", "Pley.gg H2H", "h2h", [], ["pley.gg", "www.pley.gg"], [/^\/h2h\/[^/]+\/[^/]+$/], 1, (o) => `https://pley.gg/h2h/${hltvSlug(o.teamName ?? "")}/${hltvSlug(o.opponentTeamName ?? "")}`, parseGenericH2h)
  ]
};

function descriptor(
  idValue: string,
  name: string,
  dataType: DataType,
  required: ResearchSourceId[],
  allowedHosts: string[],
  allowedPathPatterns: RegExp[],
  expectedRows: number,
  buildUrl: SourceDescriptor["buildUrl"],
  parse: SourceDescriptor["parse"],
  sourceFlag = "ENABLE_RESEARCH_SOURCES",
  fetchStrategy: SourceDescriptor["fetchStrategy"] = "direct",
  directSourceFlag?: string
): SourceDescriptor {
  return { id: idValue, name, dataType, required, allowedHosts, allowedPathPatterns, expectedRows, buildUrl, parse, sourceFlag, fetchStrategy, directSourceFlag, parserId: parse.name || "anonymous_parser" };
}

function missingIdentifiers(descriptor: SourceDescriptor, options: MultiSourceFetchOptions) {
  return descriptor.required.filter((key) => !id(options, key, key === "hltvTeam" ? options.teamId : key === "hltvMatch" ? options.hltvMatchId : key === "csstatsTeam" ? options.csstatsTeamId : ""));
}

function id(options: MultiSourceFetchOptions, key: ResearchSourceId, fallback = "") {
  return options.ids?.[key] ?? fallback;
}

function defaultConfidence(descriptor: SourceDescriptor) {
  if (descriptor.id.startsWith("hltv")) return 0.72;
  if (descriptor.id.startsWith("csstats")) return 0.78;
  if (descriptor.id.startsWith("liquipedia")) return 0.66;
  return 0.6;
}

function validateRows(sheetType: AnalystSheetType, rows: Array<Record<string, unknown>>, options: MultiSourceFetchOptions) {
  const warnings: string[] = [];
  const valid = rows.filter((row) => {
    const result = validateNormalizedFile({
      fileName: analystSheetTemplates[sheetType].filename,
      rows: [row],
      expectedMatchId: options.matchId,
      allowedTeamNames: [options.teamName, options.opponentTeamName].filter((value): value is string => Boolean(value))
    });
    if (!result.isValid) warnings.push(...result.errors);
    warnings.push(...result.warnings);
    return result.isValid;
  });
  return { valid, warnings };
}

function parseGenericRoster(body: string, context: ParserContext): Array<Record<string, unknown>> {
  const parsed = parseJsonPayload(body);
  const rows = extractNamesFromJson(parsed).map((nickname) => rosterRow(context, nickname));
  if (rows.length) return rows;
  const structured = extractJsonLd(body).flatMap(extractRosterNamesFromStructuredData);
  if (structured.length) return unique(structured).map((nickname) => rosterRow(context, nickname));
  const blocks = extractJsonLd(body).flatMap(extractNamesFromJson);
  if (blocks.length) return unique(blocks).map((nickname) => rosterRow(context, nickname));
  const htmlNames = extractNamesFromHtml(body).slice(0, 8);
  return unique(htmlNames).map((nickname) => rosterRow(context, nickname));
}

function parseGenericPlayerStats(body: string, context: ParserContext): Array<Record<string, unknown>> {
  const jsonRows = extractObjects(parseJsonPayload(body));
  const jsonPlayerRows = compactRows(jsonRows.map((row) => playerRowFromRecord(row, context)));
  if (jsonPlayerRows.length) return jsonPlayerRows;
  const jsonLdRows = compactRows(extractJsonLd(body).flatMap(extractObjects).map((row) => playerRowFromRecord(row, context)));
  if (jsonLdRows.length) return jsonLdRows;
  const csvRows = compactRows(parseCsvRows(body).map((row) => playerRowFromRecord(row, context)));
  if (csvRows.length) return csvRows;
  return extractHltvPlayerStats(body, baseTeamContext(context)).map((row) => ({ ...row, sourceName: context.sourceName, confidence: context.confidence, period: context.period }));
}

function parseGenericMapStats(body: string, context: ParserContext): Array<Record<string, unknown>> {
  const jsonRows = extractObjects(parseJsonPayload(body));
  const jsonMapRows = compactRows(jsonRows.map((row) => mapRowFromRecord(row, context)));
  if (jsonMapRows.length) return jsonMapRows;
  const jsonLdRows = compactRows(extractJsonLd(body).flatMap(extractObjects).map((row) => mapRowFromRecord(row, context)));
  if (jsonLdRows.length) return jsonLdRows;
  const csvRows = compactRows(parseCsvRows(body).map((row) => mapRowFromRecord(row, context)));
  if (csvRows.length) return csvRows;
  return extractHltvMapStats(body, baseTeamContext(context)).map((row) => ({ ...row, sourceName: context.sourceName, confidence: context.confidence, period: context.period }));
}

function parseGenericVeto(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return extractVetoRows(body, {
    matchId: context.options.matchId,
    teamA: context.options.teamName ?? "",
    teamB: context.options.opponentTeamName ?? "",
    collectedAt: context.collectedAt,
    period: context.period,
    confidence: context.confidence
  }).map((row) => ({ ...row, sourceName: context.sourceName }));
}

function parseGenericH2h(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return extractH2hRows(body, {
    matchId: context.options.matchId,
    teamA: context.options.teamName ?? "",
    teamB: context.options.opponentTeamName ?? "",
    collectedAt: context.collectedAt,
    period: context.period,
    confidence: context.confidence
  }).map((row) => ({ ...row, sourceName: context.sourceName }));
}

function parseHltvPlayers(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return extractHltvPlayerStats(body, baseTeamContext(context));
}

function parseHltvMaps(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return extractHltvMapStats(body, baseTeamContext(context));
}

function parseHltvVeto(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return parseGenericVeto(body, context);
}

function parseHltvH2h(body: string, context: ParserContext): Array<Record<string, unknown>> {
  return parseGenericH2h(body, context);
}

function parseRssMetadataOnly(body: string): Array<Record<string, unknown>> {
  return extractRssItems(body).length ? [] : [];
}

function baseTeamContext(context: ParserContext) {
  return {
    matchId: context.options.matchId,
    teamName: context.options.teamName ?? "",
    collectedAt: context.collectedAt,
    period: context.period,
    confidence: context.confidence
  };
}

function rosterRow(context: ParserContext, nickname: string) {
  return {
    matchId: context.options.matchId,
    teamName: context.options.teamName ?? "",
    nickname,
    role: "unknown",
    country: "",
    sourceName: context.sourceName,
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: 1,
    confidence: context.confidence
  };
}

function playerRowFromRecord(record: Record<string, unknown>, context: ParserContext) {
  const nickname = textAt(record, ["nickname", "player", "playerName", "name"]);
  const maps = numberValue(record, ["maps", "mapsPlayed", "sampleSize", "played"]);
  const rating = numberValue(record, ["rating", "rating2", "rating_2_0", "rating2_0", "statistics.rating", "stats.rating"]);
  if (!nickname || !maps || !rating) return null;
  return {
    matchId: context.options.matchId,
    teamName: context.options.teamName ?? "",
    nickname,
    maps,
    kills: numberValue(record, ["kills", "k", "statistics.kills", "stats.kills"]) ?? 0,
    deaths: numberValue(record, ["deaths", "d", "statistics.deaths", "stats.deaths"]) ?? 0,
    assists: numberValue(record, ["assists", "a", "statistics.assists", "stats.assists"]) ?? 0,
    kd: numberValue(record, ["kd", "kdr", "statistics.kd", "stats.kd"]) ?? 1,
    rating,
    adr: numberValue(record, ["adr", "averageDamage", "statistics.adr", "stats.adr"]) ?? 0,
    kast: numberValue(record, ["kast", "statistics.kast", "stats.kast"]) ?? 0,
    impact: numberValue(record, ["impact", "statistics.impact", "stats.impact"]) ?? 0,
    openingKills: numberValue(record, ["openingKills", "opening_kills"]) ?? 0,
    openingDeaths: numberValue(record, ["openingDeaths", "opening_deaths"]) ?? 0,
    clutchesWon: numberValue(record, ["clutchesWon", "clutches_won"]) ?? 0,
    clutchesAttempted: numberValue(record, ["clutchesAttempted", "clutches_attempted"]) ?? 0,
    sourceName: context.sourceName,
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: maps,
    confidence: context.confidence
  };
}

function mapRowFromRecord(record: Record<string, unknown>, context: ParserContext) {
  const mapName = normalizeMapName(textAt(record, ["mapName", "map", "name", "location.name", "location"]));
  const mapsPlayed = numberValue(record, ["mapsPlayed", "maps", "played", "sampleSize"]) ?? (isSportsEventRecord(record) && mapName ? 1 : null);
  if (!mapName || !mapsPlayed) return null;
  const wins = numberValue(record, ["wins", "w"]) ?? 0;
  const losses = numberValue(record, ["losses", "l"]) ?? Math.max(0, mapsPlayed - wins);
  return {
    matchId: context.options.matchId,
    teamName: context.options.teamName ?? "",
    mapName,
    mapsPlayed,
    wins,
    losses,
    winRate: numberValue(record, ["winRate", "winrate", "winPct", "win%", "statistics.winRate", "stats.winRate"]) ?? (wins / mapsPlayed) * 100,
    roundsWon: numberValue(record, ["roundsWon", "rounds_won"]) ?? 0,
    roundsLost: numberValue(record, ["roundsLost", "rounds_lost"]) ?? 0,
    ctRoundWinRate: numberValue(record, ["ctRoundWinRate", "ctWinRate"]) ?? 0,
    tRoundWinRate: numberValue(record, ["tRoundWinRate", "tWinRate"]) ?? 0,
    pickRate: numberValue(record, ["pickRate"]) ?? 0,
    banRate: numberValue(record, ["banRate"]) ?? 0,
    deciderRate: numberValue(record, ["deciderRate"]) ?? 0,
    sourceName: context.sourceName,
    collectedAt: context.collectedAt,
    period: context.period,
    sampleSize: mapsPlayed,
    confidence: context.confidence
  };
}

export function extractJsonLd(html: string) {
  const payloads: unknown[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const parsed = parseJsonPayload(match[1] ?? "");
    if (parsed) payloads.push(parsed);
  }
  return payloads;
}

export function extractRosterNamesFromStructuredData(payload: unknown) {
  const names: string[] = [];
  for (const record of extractObjects(payload)) {
    const type = jsonLdTypes(record);
    if (!type.some((value) => ["sportsteam", "organization", "sportsorganization"].includes(value))) continue;
    for (const key of ["member", "members", "athlete", "athletes", "employee", "players"]) {
      const value = record[key];
      for (const nested of extractObjects(value)) {
        const nestedType = jsonLdTypes(nested);
        const name = textAt(nested, ["alternateName", "nickname", "name", "identifier", "url", "sameAs"]);
        if (name && (!nestedType.length || nestedType.includes("person"))) names.push(cleanStructuredName(name));
      }
      if (typeof value === "string") names.push(cleanStructuredName(value));
    }
  }
  return names.filter(isLikelyNickname);
}

export function extractRssItems(xml: string) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => ({
    title: stripTags(match[1]?.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    link: stripTags(match[1]?.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? ""),
    pubDate: stripTags(match[1]?.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "")
  })).filter((item) => item.title || item.link);
}

export function extractSitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) => stripTags(match[1] ?? "")).filter(Boolean);
}

export function selectSitemapExportUrl(urls: string[], descriptor: Pick<SourceDescriptor, "allowedHosts" | "allowedPathPatterns" | "dataType">, options: MultiSourceFetchOptions) {
  const expectedTokens = descriptor.dataType === "player_stats" ? ["players", "player_stats", "stats"] : descriptor.dataType === "map_stats" ? ["maps", "map_stats"] : [descriptor.dataType];
  const teamTokens = [options.teamName, options.csstatsTeamId, options.teamId].filter(Boolean).map((value) => hltvSlug(String(value)));
  const candidates = urls
    .map((raw) => safeUrl(raw))
    .filter((url): url is URL => Boolean(url))
    .filter((url) => descriptor.allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase()))
    .filter((url) => descriptor.allowedPathPatterns.some((pattern) => pattern.test(url.pathname)))
    .filter((url) => isExportLikeUrl(url));
  const scored = candidates.map((url) => {
    const haystack = `${url.pathname} ${url.search}`.toLowerCase();
    const expectedScore = expectedTokens.some((token) => haystack.includes(token)) ? 5 : 0;
    const teamScore = teamTokens.some((token) => token && haystack.includes(token)) ? 2 : 0;
    return { url, score: expectedScore + teamScore };
  }).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.url.toString().localeCompare(b.url.toString()));
  return scored[0]?.url.toString() ?? "";
}

function extractNamesFromJson(payload: unknown): string[] {
  return extractObjects(payload)
    .flatMap((record) => [textAt(record, ["nickname", "nick", "player", "playerName", "name"])])
    .filter(isLikelyNickname);
}

function jsonLdTypes(record: Record<string, unknown>) {
  const raw = record["@type"];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map((value) => String(value ?? "").toLowerCase()).filter(Boolean);
}

function cleanStructuredName(value: string) {
  const lastUrlSegment = value.includes("/") ? value.split(/[/?#]/).filter(Boolean).pop() ?? value : value;
  return stripTags(lastUrlSegment).replace(/[_-]+/g, " ").trim();
}

function isSportsEventRecord(record: Record<string, unknown>) {
  const types = jsonLdTypes(record);
  return types.includes("event") || types.includes("sportsevent");
}

function extractNamesFromHtml(html: string) {
  const names = [
    ...[...html.matchAll(/<(?:a|span|div)\b[^>]*(?:class|data-testid)=["'][^"']*(?:player|member|roster|nickname)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span|div)>/gi)].map((match) => stripTags(match[1] ?? "")),
    ...[...html.matchAll(/data-player=["']([^"']+)["']/gi)].map((match) => match[1] ?? "")
  ];
  return names.filter(isLikelyNickname);
}

function parseJsonPayload(text: string) {
  const trimmed = text.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function extractObjects(payload: unknown): Array<Record<string, unknown>> {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.flatMap(extractObjects);
  if (typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const self = Object.keys(record).length ? [record] : [];
  const children = Object.values(record).flatMap(extractObjects);
  return [...self, ...children];
}

function parseCsvRows(content: string) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0]?.includes(",")) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, splitCsvLine(line)[index] ?? ""])));
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

function numberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = textAt(record, [key]) || record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const parsed = typeof raw === "number" ? raw : parseNumber(String(raw));
    if (parsed !== null && Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function safeUrl(raw: string) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isExportLikeUrl(url: URL) {
  const combined = `${url.pathname} ${url.search}`.toLowerCase();
  if (/[?&]page=|\/page\//.test(combined)) return false;
  return combined.includes("/export") || combined.endsWith(".csv") || combined.endsWith(".json") || combined.includes("type=maps") || combined.includes("type=players");
}

function hltvMatchUrl(options: MultiSourceFetchOptions) {
  const matchId = id(options, "hltvMatch", options.hltvMatchId);
  return `https://www.hltv.org/matches/${matchId}/${hltvSlug(options.teamName ?? "")}-vs-${hltvSlug(options.opponentTeamName ?? "")}`;
}

function liquipediaApiUrl(action: "parse" | "query", value: string) {
  const url = new URL("https://liquipedia.net/counterstrike/api.php");
  if (action === "parse") {
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", value);
    url.searchParams.set("prop", "text");
  } else {
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", value);
  }
  url.searchParams.set("format", "json");
  return url.toString();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = stableSlug(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyNickname(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 32) return false;
  if (/^(player|players|roster|team|stats|maps|rating|country|role|member)$/i.test(clean)) return false;
  return /[a-z0-9]/i.test(clean);
}

function compactRows(rows: Array<Record<string, unknown> | null | undefined>): Array<Record<string, unknown>> {
  return rows.filter((row): row is Record<string, unknown> => Boolean(row));
}

export async function runMultiSourceCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const dataType = String(args.type ?? args.dataType ?? "roster") as DataType;
  const result = await fetchMultiSourceData({
    dataType,
    matchId: String(args.matchId ?? ""),
    teamName: String(args.team ?? args.teamName ?? ""),
    opponentTeamName: String(args.opponent ?? args.opponentTeamName ?? ""),
    teamId: String(args.teamId ?? ""),
    hltvMatchId: String(args.hltvMatchId ?? args["hltv-match-id"] ?? ""),
    csstatsTeamId: String(args.csstatsTeamId ?? args["csstats-team-id"] ?? ""),
    dryRun: Boolean(args["dry-run"])
  });
  console.log(JSON.stringify(result, null, 2));
}
