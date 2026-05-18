import { buildPredictionInput } from "./predictionEngine";
import { getGridOpenAccessMatchStatus } from "./gridOpenAccess";
import { prisma } from "./prisma";
import { scanPrivateNormalizedInbox } from "./privateNormalizedInbox";
import type { ForecastAutopilotCandidate, ForecastAutopilotMode } from "./autoResearchShared";
import { safeHarvest, summarizeSafeHarvest } from "../../tools/data-harvesters/safe-orchestrator";

export type DataGapBlock =
  | "rank_basic"
  | "roster"
  | "player_stats"
  | "map_stats"
  | "veto"
  | "team_form"
  | "h2h_news"
  | "grid_mapping"
  | "source_confidence";

export type ConnectorDataType = DataGapBlock;

export type ConnectorResultStatus = "success" | "partial" | "missing" | "blocked" | "error";

export type ConnectorResult = {
  connectorId: string;
  label: string;
  dataTypes: ConnectorDataType[];
  status: ConnectorResultStatus;
  recordsCreated: number;
  recordsUpdated: number;
  confidence: number;
  sourceName: string;
  sourceUrl?: string | null;
  warnings: string[];
  blockers: string[];
  normalizedPayloadSummary?: string;
};

export type ConnectorMode =
  | "official_api"
  | "approved_api"
  | "local_cache"
  | "normalized_import"
  | "manual_reference"
  | "disabled"
  | "private_extractor_output";

export type ConnectorLegalStatus = "allowed" | "user_provided" | "needs_key" | "forbidden" | "future";

export type DataConnector = {
  id: string;
  label: string;
  dataTypes: ConnectorDataType[];
  mode: ConnectorMode;
  legalStatus: ConnectorLegalStatus;
  canAutoRun: boolean;
  autoRunFlag?: string;
  requiresKey: string[];
  rateLimit: string;
  confidence: number;
  limitations: string[];
  run: (context: ConnectorRunContext) => Promise<ConnectorResult>;
};

export type ConnectorRunContext = {
  matchId: string;
  mode: ForecastAutopilotMode;
  candidate: ForecastAutopilotCandidate;
  missingBlocks: DataGapBlock[];
  trustedLocalImportsEnabled: boolean;
};

function hasEnv(key: string) {
  return Boolean(String(process.env[key] ?? "").trim());
}

function flag(key: string) {
  return String(process.env[key] ?? "false").toLowerCase() === "true";
}

function makeResult(connector: Pick<DataConnector, "id" | "label" | "dataTypes" | "confidence">, patch: Partial<ConnectorResult>): ConnectorResult {
  return {
    connectorId: connector.id,
    label: connector.label,
    dataTypes: connector.dataTypes,
    status: "missing",
    recordsCreated: 0,
    recordsUpdated: 0,
    confidence: connector.confidence,
    sourceName: connector.label,
    sourceUrl: null,
    warnings: [],
    blockers: [],
    ...patch
  };
}

const sourceUrlWarning = "sourceUrl missing lowers source confidence but is not a hard blocker.";

async function localRecordsResult(context: ConnectorRunContext, connector: DataConnector) {
  const input = await buildPredictionInput(context.matchId);
  const counts = {
    roster: input.playersA.length + input.playersB.length,
    playerStats: input.playerStatsA.length + input.playerStatsB.length,
    mapStats: input.mapStatsA.reduce((sum, row) => sum + row.mapsPlayed, 0) + input.mapStatsB.reduce((sum, row) => sum + row.mapsPlayed, 0),
    veto: input.vetoPatternsA.length + input.vetoPatternsB.length,
    teamForm: Number(Boolean(input.teamFormA)) + Number(Boolean(input.teamFormB)),
    h2hNews: input.h2h.length + input.news.length,
    basic: Number(Boolean(input.basicResultA || (input.teamA.rankSnapshots ?? []).length)) + Number(Boolean(input.basicResultB || (input.teamB.rankSnapshots ?? []).length))
  };
  const found = Object.values(counts).some((count) => count > 0);
  return makeResult(connector, {
    status: found ? "partial" : "missing",
    confidence: found ? 0.78 : 0.25,
    sourceName: "local existing records",
    warnings: found ? [sourceUrlWarning] : [],
    blockers: found ? [] : ["No existing manual_real / parsed_demo / provider records found for missing blocks."],
    normalizedPayloadSummary: `roster=${counts.roster}, playerStats=${counts.playerStats}, mapSample=${counts.mapStats}, veto=${counts.veto}, teamForm=${counts.teamForm}, h2hNews=${counts.h2hNews}, rankBasic=${counts.basic}`
  });
}

async function privateInboxResult(context: ConnectorRunContext, connector: DataConnector) {
  const scan = await scanPrivateNormalizedInbox(context.matchId, { trustedLocalImports: context.trustedLocalImportsEnabled });
  if (!scan.filesFound) {
    return makeResult(connector, {
      status: "missing",
      sourceName: "private normalized inbox",
      blockers: [`No normalized files found in ${scan.inboxPath}.`],
      warnings: scan.warnings,
      normalizedPayloadSummary: "private inbox empty"
    });
  }
  return makeResult(connector, {
    status: scan.recordsCreated + scan.recordsUpdated > 0 ? "success" : scan.validationPassed > 0 ? "partial" : "blocked",
    recordsCreated: scan.recordsCreated,
    recordsUpdated: scan.recordsUpdated,
    confidence: scan.validationPassed > 0 ? 0.82 : 0.35,
    sourceName: "private normalized inbox",
    warnings: [
      ...scan.warnings,
      ...(scan.trustedLocalImportsEnabled ? [] : ["Trusted local imports disabled; validated files stay preview-only."])
    ],
    blockers: scan.validationFailed > 0 ? ["One or more private inbox files failed validation."] : [],
    normalizedPayloadSummary: `${scan.acceptedFiles}/${scan.filesFound} accepted files, validation passed=${scan.validationPassed}, failed=${scan.validationFailed}`
  });
}

async function gridResult(context: ConnectorRunContext, connector: DataConnector) {
  const status = await getGridOpenAccessMatchStatus(context.matchId);
  if (!status.configured || !status.enabled) {
    return makeResult(connector, {
      status: "blocked",
      sourceName: "GRID Open Access",
      blockers: ["GRID_API_KEY / ENABLE_GRID_SYNC not configured."],
      normalizedPayloadSummary: "GRID not configured"
    });
  }
  if (!status.matched || !status.gridSeriesId) {
    return makeResult(connector, {
      status: "missing",
      sourceName: "GRID Open Access",
      blockers: ["No known gridSeriesId mapping for this match."],
      normalizedPayloadSummary: "GRID mapping missing"
    });
  }
  return makeResult(connector, {
    status: status.seriesStateAvailable === true ? "partial" : "missing",
    sourceName: "GRID Open Access",
    sourceUrl: `grid:series:${status.gridSeriesId}`,
    warnings: status.seriesStateAvailable === true ? [] : ["Series State not fetched yet; unsupported GRID APIs remain disabled."],
    blockers: status.seriesStateAvailable === true ? [] : ["GRID Series State pending for mapped series."],
    normalizedPayloadSummary: `gridSeriesId=${status.gridSeriesId}, dataTypes=${status.availableDataTypes.join(", ") || "none"}`
  });
}

async function safeHarvesterResult(context: ConnectorRunContext, connector: DataConnector) {
  if (!flag("ENABLE_SAFE_HARVESTER")) {
    return makeResult(connector, {
      status: "blocked",
      sourceName: "Safe harvester",
      blockers: ["ENABLE_SAFE_HARVESTER=false."],
      normalizedPayloadSummary: "safe harvester disabled"
    });
  }
  const result = await safeHarvest({
    matchId: context.matchId,
    teamNames: [context.candidate.teamAName, context.candidate.teamBName],
    matchDate: context.candidate.startTime ? new Date(context.candidate.startTime) : undefined,
    mode: context.mode,
    dryRun: false
  });
  const summary = summarizeSafeHarvest(result);
  return makeResult(connector, {
    status: result.status === "failed" ? "error" : result.status === "skipped" ? "missing" : result.recordsCreated + result.recordsUpdated > 0 ? "success" : "partial",
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    confidence: result.recordsCreated + result.recordsUpdated > 0 ? 0.74 : 0.42,
    sourceName: "Safe harvester",
    warnings: result.warnings,
    blockers: result.errors,
    normalizedPayloadSummary: JSON.stringify(summary)
  });
}

function envBackedResult(connector: DataConnector, envKey: string, enableKey: string, availableMessage: string) {
  const configured = hasEnv(envKey);
  const enabled = configured && flag(enableKey);
  return makeResult(connector, {
    status: enabled ? "partial" : configured ? "blocked" : "missing",
    sourceName: connector.label,
    warnings: enabled ? [availableMessage] : [],
    blockers: enabled ? [] : [configured ? `${enableKey}=false.` : `${envKey} is not configured.`],
    normalizedPayloadSummary: enabled ? "connector configured; selected-match data depends on explicit IDs/mappings and current plan" : "connector unavailable"
  });
}

export const dataConnectors: DataConnector[] = [
  {
    id: "safe_harvester",
    label: "Safe API harvester",
    dataTypes: ["rank_basic", "roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news", "grid_mapping"],
    mode: "official_api",
    legalStatus: "allowed",
    canAutoRun: false,
    autoRunFlag: "ENABLE_SAFE_HARVESTER",
    requiresKey: ["ENABLE_SAFE_HARVESTER"],
    rateLimit: "per-source API guards",
    confidence: 0.74,
    limitations: ["Only allowed API-style fetchers; writes normalized private inbox CSV; no DB writes or Apply calls."],
    run: (context) => safeHarvesterResult(context, dataConnectorsById.safe_harvester)
  },
  {
    id: "local_existing_records",
    label: "Local existing records",
    dataTypes: ["rank_basic", "roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news", "source_confidence"],
    mode: "local_cache",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: [],
    rateLimit: "none",
    confidence: 0.78,
    limitations: ["Only records already in DB/cache."],
    run: (context) => localRecordsResult(context, dataConnectorsById.local_existing_records)
  },
  {
    id: "pandascore_free",
    label: "PandaScore Free",
    dataTypes: ["rank_basic", "roster", "team_form"],
    mode: "official_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["PANDASCORE_API_KEY", "ENABLE_PANDASCORE_SYNC"],
    rateLimit: "existing source scheduler limits",
    confidence: 0.62,
    limitations: ["Fixture/basic/team context only; no deep player/map/veto stats on free path."],
    run: async () => envBackedResult(dataConnectorsById.pandascore_free, "PANDASCORE_API_KEY", "ENABLE_PANDASCORE_SYNC", "PandaScore Free can provide schedule/basic team context through existing sync paths.")
  },
  {
    id: "valve_rankings",
    label: "Valve Rankings",
    dataTypes: ["rank_basic"],
    mode: "official_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["ENABLE_VALVE_RANKINGS_SYNC"],
    rateLimit: "public rankings fetch cadence",
    confidence: 0.72,
    limitations: ["Ranking/basic strength only."],
    run: async () => makeResult(dataConnectorsById.valve_rankings, {
      status: flag("ENABLE_VALVE_RANKINGS_SYNC") ? "partial" : "missing",
      sourceName: "Valve Rankings",
      blockers: flag("ENABLE_VALVE_RANKINGS_SYNC") ? [] : ["ENABLE_VALVE_RANKINGS_SYNC=false."],
      normalizedPayloadSummary: "ranking/basic connector"
    })
  },
  {
    id: "steam_cs_updates",
    label: "Steam CS Updates",
    dataTypes: ["source_confidence"],
    mode: "official_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["ENABLE_CS_UPDATES_SYNC"],
    rateLimit: "existing source scheduler limits",
    confidence: 0.45,
    limitations: ["Meta/patch context only; never unlocks Real Forecast Ready alone."],
    run: async () => makeResult(dataConnectorsById.steam_cs_updates, {
      status: flag("ENABLE_CS_UPDATES_SYNC") ? "partial" : "missing",
      sourceName: "Steam CS Updates",
      blockers: flag("ENABLE_CS_UPDATES_SYNC") ? [] : ["ENABLE_CS_UPDATES_SYNC=false."],
      normalizedPayloadSummary: "patch/meta context connector"
    })
  },
  {
    id: "grid_series_state",
    label: "GRID Series State",
    dataTypes: ["map_stats", "team_form", "grid_mapping"],
    mode: "official_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["GRID_API_KEY", "ENABLE_GRID_SYNC"],
    rateLimit: "GRID Open Access limits",
    confidence: 0.8,
    limitations: ["Series State only if gridSeriesId is already known; unsupported GRID APIs are never called."],
    run: (context) => gridResult(context, dataConnectorsById.grid_series_state)
  },
  {
    id: "faceit_explicit_ids",
    label: "FACEIT explicit IDs",
    dataTypes: ["roster", "player_stats"],
    mode: "approved_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["FACEIT_API_KEY", "ENABLE_FACEIT_SYNC"],
    rateLimit: "FACEIT API limits",
    confidence: 0.48,
    limitations: ["Explicit IDs only; no nickname search or broad crawl."],
    run: async () => envBackedResult(dataConnectorsById.faceit_explicit_ids, "FACEIT_API_KEY", "ENABLE_FACEIT_SYNC", "FACEIT explicit-ID context may help selected records.")
  },
  {
    id: "leetify_explicit_ids",
    label: "Leetify explicit IDs",
    dataTypes: ["player_stats"],
    mode: "approved_api",
    legalStatus: "allowed",
    canAutoRun: true,
    requiresKey: ["LEETIFY_API_KEY", "ENABLE_LEETIFY_SYNC"],
    rateLimit: "Leetify API limits",
    confidence: 0.42,
    limitations: ["Explicit Steam64/Leetify IDs only; optional context only."],
    run: async () => envBackedResult(dataConnectorsById.leetify_explicit_ids, "LEETIFY_API_KEY", "ENABLE_LEETIFY_SYNC", "Leetify explicit-ID context may help player profile records.")
  },
  {
    id: "liquipedia_db",
    label: "LiquipediaDB",
    dataTypes: ["roster", "team_form"],
    mode: "approved_api",
    legalStatus: "needs_key",
    canAutoRun: true,
    requiresKey: ["LIQUIPEDIA_API_KEY", "ENABLE_LIQUIPEDIA_SYNC"],
    rateLimit: "60 requests/hour guard",
    confidence: 0.68,
    limitations: ["Only configured API access; no Liquipedia HTML scraping."],
    run: async () => envBackedResult(dataConnectorsById.liquipedia_db, "LIQUIPEDIA_API_KEY", "ENABLE_LIQUIPEDIA_SYNC", "LiquipediaDB can help roster/history once configured.")
  },
  {
    id: "private_normalized_inbox",
    label: "Private normalized inbox",
    dataTypes: ["roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news"],
    mode: "private_extractor_output",
    legalStatus: "user_provided",
    canAutoRun: true,
    requiresKey: ["ENABLE_TRUSTED_LOCAL_IMPORTS"],
    rateLimit: "local filesystem only",
    confidence: 0.82,
    limitations: ["Only normalized CSV/JSON files; validation required; trusted auto-apply disabled by default."],
    run: (context) => privateInboxResult(context, dataConnectorsById.private_normalized_inbox)
  },
  {
    id: "esic_future",
    label: "ESIC API",
    dataTypes: ["roster", "player_stats", "map_stats", "team_form"],
    mode: "disabled",
    legalStatus: "future",
    canAutoRun: false,
    requiresKey: ["ESIC_API_KEY"],
    rateLimit: "disabled until official docs/schema are verified",
    confidence: 0,
    limitations: ["Future metadata only; no network calls until official API documentation and response schema are provided."],
    run: async () => makeResult(dataConnectorsById.esic_future, {
      status: "blocked",
      sourceName: "ESIC API",
      blockers: ["ESIC API is disabled until official docs/schema are verified."],
      normalizedPayloadSummary: "future connector metadata"
    })
  },
  {
    id: "generic_website_table_adapter",
    label: "Generic website table adapter",
    dataTypes: ["roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news"],
    mode: "disabled",
    legalStatus: "future",
    canAutoRun: false,
    requiresKey: [],
    rateLimit: "disabled",
    confidence: 0,
    limitations: ["Disabled metadata only; no domain selectors, no browser automation, no crawler code."],
    run: async () => makeResult(dataConnectorsById.generic_website_table_adapter, {
      status: "blocked",
      sourceName: "Generic website table adapter",
      blockers: ["Adapter is disabled by default and never auto-runs in full analysis."],
      normalizedPayloadSummary: "future draft normalized CSV adapter metadata"
    })
  },
  ...["hltv_automatic_scraper", "apify", "browser_crawler", "telegram_scraping", "unsupported_grid_apis", "fake_imputed_data"].map((id) => ({
    id,
    label: id.replace(/_/g, " "),
    dataTypes: ["roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news"] as ConnectorDataType[],
    mode: "disabled" as const,
    legalStatus: "forbidden" as const,
    canAutoRun: false,
    requiresKey: [],
    rateLimit: "forbidden",
    confidence: 0,
    limitations: ["Forbidden by core source policy."],
    run: async () => makeResult(dataConnectorsById[id], {
      status: "blocked",
      sourceName: id,
      blockers: ["Forbidden connector cannot auto-run."],
      normalizedPayloadSummary: "forbidden policy entry"
    })
  }))
];

export const dataConnectorsById = Object.fromEntries(dataConnectors.map((connector) => [connector.id, connector])) as Record<string, DataConnector>;

export function connectorsForMissingBlocks(blocks: DataGapBlock[]) {
  const set = new Set(blocks);
  return dataConnectors.filter((connector) => connectorCanAutoRun(connector) && connector.dataTypes.some((type) => set.has(type)));
}

function connectorCanAutoRun(connector: DataConnector) {
  return connector.canAutoRun || Boolean(connector.autoRunFlag && flag(connector.autoRunFlag));
}

export async function countManualOrParsedRecords(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { exists: false, manualRealRecords: 0, parsedDemoRecords: 0 };
  const [manualRealRecords, parsedDemoRecords] = await Promise.all([
    prisma.externalSourceRecord.count({ where: { entityId: matchId, entityType: { startsWith: "manual_real_" } } }),
    prisma.externalSourceRecord.count({ where: { entityId: matchId, entityType: { startsWith: "parsed_demo" } } })
  ]);
  return { exists: true, manualRealRecords, parsedDemoRecords };
}
