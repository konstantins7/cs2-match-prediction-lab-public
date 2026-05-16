import { prisma } from "./prisma";
import { evaluatePreMatchLeakage, parseEvidenceDate } from "./realData/dataRole";
import { redactString } from "./security/redaction";
import { resultFromRecords, sourceRecordFromRaw } from "./sources/adapterUtils";
import { scoreNameSimilarity } from "./sources/entityMatcher";
import { buildDataSyncJobData } from "./sources/jobUtils";
import { saveExternalSourceRecord } from "./sources/sourceReconciler";
import { updateSourceHealth } from "./sources/sourceHealth";
import { envFlag, envPresent, type SourceRecord, type SourceSyncResult } from "./sources/types";

export const GRID_CENTRAL_DATA_ENDPOINT = "https://api-op.grid.gg/central-data/graphql";
export const GRID_SERIES_STATE_ENDPOINT = "https://api-op.grid.gg/live-data-feed/series-state/graphql";
export const GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS = ["Series Events API", "File Download API", "Stats Feed"] as const;

const source = "grid" as const;
const sourceMode = "grid_open_access";

export type GridSeriesNode = {
  id: string;
  startTimeScheduled?: string | null;
  teams: { baseInfo?: { id?: string | null; name?: string | null } | null }[];
  tournament?: { id?: string | null; name?: string | null } | null;
};

export type GridCapabilityProbe = {
  configured: boolean;
  enabled: boolean;
  centralDataReachable: boolean;
  seriesStateReachable: boolean | "pending";
  allSeriesFetchedCount: number;
  sampleSeriesId?: string | null;
  errors: string[];
  unsupportedProducts: string[];
};

export type GridCentralDataSyncResult = {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  matchedCount: number;
  needsReviewCount: number;
  errors: string[];
  notes: string[];
};

export type GridManualSeriesMappingResult = {
  ok: boolean;
  matchId?: string;
  gridSeriesId?: string;
  aliasesCreated: number;
  aliasesUpdated: number;
  errors: string[];
};

export type GridMatchStatus = {
  matchId: string;
  configured: boolean;
  enabled: boolean;
  matched: boolean;
  gridSeriesId: string | null;
  centralDataAvailable: boolean;
  seriesStateAvailable: boolean | "pending";
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  needsReviewCount: number;
  availableDataTypes: string[];
  unsupportedProducts: string[];
  lastSync: string | null;
};

export type GridMatchEnrichmentResult = GridMatchStatus & {
  recordsSkipped: number;
  errors: string[];
  notes: string[];
};

function rawRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dateWindow(now = new Date()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 7);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 7);
  return { from, to };
}

function escapeGraphqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function gridHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": process.env.GRID_API_KEY ?? "",
    "User-Agent": "CS2MatchPredictionLab/0.7.4 local research analytics"
  };
}

async function gridGraphqlRequest(endpoint: string, query: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: gridHeaders(),
    body: JSON.stringify({ query })
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(redactString(`GRID Open Access HTTP ${response.status}: ${text.slice(0, 240)}`));
  }
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(redactString(`GRID Open Access GraphQL error: ${JSON.stringify(payload.errors).slice(0, 240)}`));
  }
  return payload;
}

function allSeriesQuery(from: Date, to: Date, after?: string | null) {
  const afterArg = after ? `after: "${escapeGraphqlString(after)}"` : "";
  return `query AllSeries {
  allSeries(
    first: 25
    ${afterArg}
    filter: {
      startTimeScheduled: {
        gte: "${from.toISOString()}"
        lte: "${to.toISOString()}"
      }
    }
    orderBy: StartTimeScheduled
  ) {
    totalCount
    edges {
      node {
        id
        startTimeScheduled
        teams {
          baseInfo {
            id
            name
          }
        }
        tournament {
          name
          id
        }
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`;
}

function seriesStateQuery(seriesId: string) {
  return `query SeriesState {
  seriesState(id: "${escapeGraphqlString(seriesId)}") {
    startedAt
    started
    finished
    teams {
      won
      score
      kills
      deaths
      players {
        kills
        deaths
      }
    }
  }
}`;
}

export async function fetchGridAllSeries(params: {
  from?: Date;
  to?: Date;
  fetchImpl?: typeof fetch;
  maxPages?: number;
}) {
  const window = dateWindow();
  const from = params.from ?? window.from;
  const to = params.to ?? window.to;
  const fetchImpl = params.fetchImpl ?? fetch;
  const maxPages = params.maxPages ?? 3;
  let after: string | null = null;
  let totalCount = 0;
  const nodes: GridSeriesNode[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await gridGraphqlRequest(GRID_CENTRAL_DATA_ENDPOINT, allSeriesQuery(from, to, after), fetchImpl);
    const connection = rawRecord(rawRecord(payload.data).allSeries);
    totalCount = Number(connection.totalCount ?? totalCount);
    const edges = asArray(connection.edges);
    for (const edge of edges) {
      const node = rawRecord(rawRecord(edge).node);
      if (typeof node.id !== "string") continue;
      nodes.push({
        id: node.id,
        startTimeScheduled: typeof node.startTimeScheduled === "string" ? node.startTimeScheduled : null,
        teams: asArray(node.teams).map((team) => rawRecord(team) as GridSeriesNode["teams"][number]),
        tournament: rawRecord(node.tournament) as GridSeriesNode["tournament"]
      });
    }
    const pageInfo = rawRecord(connection.pageInfo);
    if (pageInfo.hasNextPage !== true || typeof pageInfo.endCursor !== "string" || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return { totalCount, nodes, from, to };
}

export async function fetchGridSeriesState(seriesId: string, fetchImpl: typeof fetch = fetch) {
  const payload = await gridGraphqlRequest(GRID_SERIES_STATE_ENDPOINT, seriesStateQuery(seriesId), fetchImpl);
  return rawRecord(rawRecord(payload.data).seriesState);
}

export async function probeGridOpenAccess(fetchImpl: typeof fetch = fetch): Promise<GridCapabilityProbe> {
  const configured = envPresent("GRID_API_KEY");
  const enabled = configured && envFlag("ENABLE_GRID_SYNC");
  const base = {
    configured,
    enabled,
    centralDataReachable: false,
    seriesStateReachable: "pending" as const,
    allSeriesFetchedCount: 0,
    sampleSeriesId: null,
    errors: [],
    unsupportedProducts: [...GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS]
  };
  if (!enabled) {
    return {
      ...base,
      errors: configured ? ["ENABLE_GRID_SYNC=false"] : ["GRID key missing"]
    };
  }
  try {
    const series = await fetchGridAllSeries({ fetchImpl, maxPages: 1 });
    const sampleSeriesId = series.nodes[0]?.id ?? null;
    const output: GridCapabilityProbe = {
      ...base,
      centralDataReachable: true,
      allSeriesFetchedCount: series.nodes.length,
      sampleSeriesId
    };
    if (!sampleSeriesId) return output;
    try {
      await fetchGridSeriesState(sampleSeriesId, fetchImpl);
      output.seriesStateReachable = true;
    } catch (error) {
      output.seriesStateReachable = false;
      output.errors.push(redactString(error instanceof Error ? error.message : "GRID Series State probe failed."));
    }
    return output;
  } catch (error) {
    return {
      ...base,
      errors: [redactString(error instanceof Error ? error.message : "GRID Central Data probe failed.")]
    };
  }
}

function seriesTitle(series: GridSeriesNode) {
  const names = series.teams.map((team) => team.baseInfo?.name).filter(Boolean);
  return names.length >= 2 ? `${names[0]} vs ${names[1]}` : `GRID series ${series.id}`;
}

async function upsertNeedsReviewCandidate(params: {
  entityType: string;
  externalId: string;
  externalName: string;
  matchedEntityId?: string | null;
  confidence: number;
  reason: string;
  raw: unknown;
}) {
  const rawJson = JSON.stringify({
    sourceMode,
    reason: params.reason,
    unsupportedApisCalled: false,
    raw: params.raw
  });
  const existing = await prisma.entityMatchCandidate.findFirst({
    where: { source, entityType: params.entityType, externalId: params.externalId, status: "needs_review" },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    await prisma.entityMatchCandidate.update({
      where: { id: existing.id },
      data: {
        externalName: params.externalName,
        matchedEntityId: params.matchedEntityId ?? existing.matchedEntityId,
        confidence: params.confidence,
        rawJson
      }
    });
    return "updated" as const;
  }
  await prisma.entityMatchCandidate.create({
    data: {
      source,
      entityType: params.entityType,
      externalId: params.externalId,
      externalName: params.externalName,
      matchedEntityId: params.matchedEntityId ?? null,
      confidence: params.confidence,
      status: "needs_review",
      rawJson
    }
  });
  return "created" as const;
}

async function reconcileGridSeriesToMatch(series: GridSeriesNode) {
  const alias = await prisma.entityAlias.findUnique({
    where: { entityType_source_externalId: { entityType: "match", source, externalId: series.id } }
  });
  if (alias) return { matchId: alias.entityId, confidence: alias.confidence, status: "matched" as const, needsReview: 0 };

  const start = series.startTimeScheduled ? new Date(series.startTimeScheduled) : null;
  if (!start || Number.isNaN(start.getTime())) return { matchId: null, confidence: 0, status: "unmatched" as const, needsReview: 0 };
  const from = new Date(start.getTime() - 6 * 60 * 60 * 1000);
  const to = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  const matches = await prisma.match.findMany({
    where: { startTime: { gte: from, lte: to } },
    include: { teamA: true, teamB: true }
  });
  const gridTeamNames = series.teams.map((team) => team.baseInfo?.name ?? "").filter(Boolean);
  const tournamentName = series.tournament?.name ?? "";
  const scored = matches
    .map((match) => {
      const orientationA =
        (scoreNameSimilarity(gridTeamNames[0] ?? "", match.teamA.name) + scoreNameSimilarity(gridTeamNames[1] ?? "", match.teamB.name)) / 2;
      const orientationB =
        (scoreNameSimilarity(gridTeamNames[0] ?? "", match.teamB.name) + scoreNameSimilarity(gridTeamNames[1] ?? "", match.teamA.name)) / 2;
      const teamScore = Math.max(orientationA, orientationB);
      const tournamentScore = tournamentName ? scoreNameSimilarity(tournamentName, match.eventName) : 0.5;
      const deltaMinutes = Math.abs(match.startTime.getTime() - start.getTime()) / 60000;
      const timeScore = deltaMinutes <= 30 ? 1 : deltaMinutes <= 120 ? 0.8 : deltaMinutes <= 360 ? 0.42 : 0;
      const confidence = Number(Math.min(1, teamScore * 0.68 + timeScore * 0.24 + tournamentScore * 0.08).toFixed(3));
      return { match, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  if (!best || best.confidence < 0.45) return { matchId: null, confidence: best?.confidence ?? 0, status: "unmatched" as const, needsReview: 0 };
  if (best.confidence >= 0.86) {
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType: "match", source, externalId: series.id } },
      create: { entityType: "match", entityId: best.match.id, source, externalId: series.id, alias: seriesTitle(series), confidence: best.confidence },
      update: { entityId: best.match.id, alias: seriesTitle(series), confidence: best.confidence }
    });
    return { matchId: best.match.id, confidence: best.confidence, status: "matched" as const, needsReview: 0 };
  }
  await upsertNeedsReviewCandidate({
    entityType: "match",
    externalId: series.id,
    externalName: seriesTitle(series),
    matchedEntityId: best.match.id,
    confidence: best.confidence,
    reason: "grid_series_low_confidence_match",
    raw: { series, candidateMatchId: best.match.id }
  });
  return { matchId: null, confidence: best.confidence, status: "needs_review" as const, needsReview: 1 };
}

function gridSeriesRecord(series: GridSeriesNode, fetchedAt: Date, entityId?: string | null, confidence = 0.5): SourceRecord {
  return sourceRecordFromRaw({
    source,
    entityType: "grid_series",
    externalId: series.id,
    entityId,
    fetchedAt,
    sourceConfidence: confidence,
    raw: {
      sourceMode,
      dataRole: "historical_team_form",
      openAccessEndpoint: "Central Data",
      unsupportedApisCalled: false,
      unsupportedProducts: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS,
      id: series.id,
      startTimeScheduled: series.startTimeScheduled,
      teams: series.teams,
      tournament: series.tournament,
      payload: series
    }
  });
}

async function persistGridResult(result: SourceSyncResult, needsReviewCount: number) {
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  for (const record of result.records) {
    const existing = await prisma.externalSourceRecord.findUnique({
      where: { source_entityType_externalId: { source: record.source, entityType: record.entityType, externalId: record.externalId } }
    });
    const saved = await saveExternalSourceRecord(prisma, record);
    if (!saved.changed) recordsSkipped += 1;
    else if (existing) recordsUpdated += 1;
    else recordsCreated += 1;
  }
  await prisma.dataSyncJob.create({
    data: buildDataSyncJobData(result, new Date(), recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount)
  });
  await updateSourceHealth(result, { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount });
  return { recordsCreated, recordsUpdated, recordsSkipped };
}

export async function syncGridCentralData(params: {
  from?: string;
  to?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<GridCentralDataSyncResult> {
  const configured = envPresent("GRID_API_KEY");
  const enabled = configured && envFlag("ENABLE_GRID_SYNC");
  const notes: string[] = [];
  if (!enabled) {
    const result = resultFromRecords({
      source,
      jobType: "series",
      records: [],
      status: "disabled",
      notes: configured ? "GRID key configured, but ENABLE_GRID_SYNC=false." : "GRID key missing."
    });
    await persistGridResult(result, 0);
    return { ok: false, configured, enabled, recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, matchedCount: 0, needsReviewCount: 0, errors: [], notes: [result.notes ?? ""] };
  }
  const window = dateWindow();
  const from = params.from ? new Date(params.from) : window.from;
  const to = params.to ? new Date(params.to) : window.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, configured, enabled, recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, matchedCount: 0, needsReviewCount: 0, errors: ["Invalid from/to date."], notes };
  }
  try {
    const fetched = await fetchGridAllSeries({ from, to, fetchImpl: params.fetchImpl });
    let needsReviewCount = 0;
    let matchedCount = 0;
    const records: SourceRecord[] = [];
    for (const series of fetched.nodes) {
      const reconciled = await reconcileGridSeriesToMatch(series);
      needsReviewCount += reconciled.needsReview;
      if (reconciled.matchId) matchedCount += 1;
      records.push(gridSeriesRecord(series, new Date(), reconciled.matchId, reconciled.confidence || 0.54));
    }
    const result = resultFromRecords({
      source,
      jobType: "series",
      records,
      status: records.length ? "success" : "partial",
      notes: `GRID Central Data fetched ${records.length} series. Unsupported OA products were not called.`,
      endpoint: GRID_CENTRAL_DATA_ENDPOINT,
      method: "POST",
      rawSample: records[0]?.raw ?? { sourceMode, unsupportedProducts: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS, unsupportedApisCalled: false },
      endpointsAvailable: ["Central Data API"],
      endpointsBlocked: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS.map((name) => `${name} unavailable on Open Access`)
    });
    const persisted = await persistGridResult(result, needsReviewCount);
    return {
      ok: true,
      configured,
      enabled,
      recordsFetched: records.length,
      recordsCreated: persisted.recordsCreated,
      recordsUpdated: persisted.recordsUpdated,
      recordsSkipped: persisted.recordsSkipped,
      matchedCount,
      needsReviewCount,
      errors: [],
      notes: [result.notes ?? ""]
    };
  } catch (error) {
    const message = redactString(error instanceof Error ? error.message : "GRID Central Data sync failed.");
    const result = resultFromRecords({
      source,
      jobType: "series",
      records: [],
      status: "failed",
      notes: "GRID Central Data unavailable or blocked.",
      errors: [message],
      endpoint: GRID_CENTRAL_DATA_ENDPOINT,
      method: "POST",
      lastError: message,
      rawSample: { sourceMode, unsupportedApisCalled: false, unsupportedProducts: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS }
    });
    await persistGridResult(result, 0);
    return { ok: false, configured, enabled, recordsFetched: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, matchedCount: 0, needsReviewCount: 0, errors: [message], notes: [result.notes ?? ""] };
  }
}

export async function importGridManualSeriesMapping(matchId?: string, gridSeriesId?: string): Promise<GridManualSeriesMappingResult> {
  const trimmedMatchId = String(matchId ?? "").trim();
  const trimmedGridSeriesId = String(gridSeriesId ?? "").trim();
  const output: GridManualSeriesMappingResult = { ok: false, aliasesCreated: 0, aliasesUpdated: 0, errors: [] };
  if (!trimmedMatchId || !trimmedGridSeriesId || trimmedGridSeriesId.includes("<")) {
    output.errors.push("matchId and gridSeriesId are required.");
    return output;
  }
  const match = await prisma.match.findUnique({ where: { id: trimmedMatchId }, include: { teamA: true, teamB: true } });
  if (!match) {
    output.errors.push(`Match not found: ${trimmedMatchId}`);
    return output;
  }
  const existing = await prisma.entityAlias.findUnique({
    where: { entityType_source_externalId: { entityType: "match", source, externalId: trimmedGridSeriesId } }
  });
  await prisma.entityAlias.upsert({
    where: { entityType_source_externalId: { entityType: "match", source, externalId: trimmedGridSeriesId } },
    create: {
      entityType: "match",
      entityId: match.id,
      source,
      externalId: trimmedGridSeriesId,
      alias: `${match.teamA.name} vs ${match.teamB.name}`,
      confidence: 0.99
    },
    update: {
      entityId: match.id,
      alias: `${match.teamA.name} vs ${match.teamB.name}`,
      confidence: 0.99
    }
  });
  await prisma.externalSourceRecord.updateMany({
    where: { source, entityType: "grid_series", externalId: trimmedGridSeriesId },
    data: { entityId: match.id }
  });
  return {
    ok: true,
    matchId: match.id,
    gridSeriesId: trimmedGridSeriesId,
    aliasesCreated: existing ? 0 : 1,
    aliasesUpdated: existing ? 1 : 0,
    errors: []
  };
}

async function gridSeriesIdForMatch(matchId: string) {
  const alias = await prisma.entityAlias.findFirst({
    where: { source, entityType: "match", entityId: matchId },
    orderBy: { confidence: "desc" }
  });
  if (alias) return alias.externalId;
  const record = await prisma.externalSourceRecord.findFirst({
    where: { source, entityType: "grid_series", entityId: matchId },
    orderBy: { fetchedAt: "desc" }
  });
  return record?.externalId ?? null;
}

export async function getGridOpenAccessMatchStatus(matchId: string): Promise<GridMatchStatus> {
  const configured = envPresent("GRID_API_KEY");
  const enabled = configured && envFlag("ENABLE_GRID_SYNC");
  const [gridSeriesId, health, records] = await Promise.all([
    gridSeriesIdForMatch(matchId),
    prisma.sourceHealth.findUnique({ where: { source } }),
    prisma.externalSourceRecord.findMany({
      where: {
        source,
        OR: [
          { entityId: matchId },
          { rawJson: { contains: `"matchId":"${matchId}"` } }
        ]
      },
      orderBy: { fetchedAt: "desc" },
      take: 20
    })
  ]);
  const stateRecord = records.find((record) => record.entityType === "grid_series_state");
  const dataTypes = new Set<string>();
  for (const record of records) {
    if (record.entityType === "grid_series") {
      dataTypes.add("series");
      dataTypes.add("teams");
      dataTypes.add("tournament");
    }
    if (record.entityType === "grid_series_state") {
      dataTypes.add("team score");
      dataTypes.add("team kills/deaths");
      if (record.rawJson.includes("\"players\"")) dataTypes.add("player kills/deaths");
    }
  }
  return {
    matchId,
    configured,
    enabled,
    matched: Boolean(gridSeriesId),
    gridSeriesId,
    centralDataAvailable: Boolean(health?.lastRawSampleJson?.includes("Central Data") || records.some((record) => record.entityType === "grid_series")),
    seriesStateAvailable: stateRecord ? true : gridSeriesId ? "pending" : "pending",
    recordsFetched: health?.lastRecordsFetched ?? 0,
    recordsCreated: health?.lastRecordsCreated ?? 0,
    recordsUpdated: health?.lastRecordsUpdated ?? 0,
    needsReviewCount: health?.needsReviewCount ?? 0,
    availableDataTypes: [...dataTypes],
    unsupportedProducts: [...GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS],
    lastSync: health?.lastSyncedAt?.toISOString() ?? null
  };
}

function stateTeams(seriesState: Record<string, unknown>) {
  return asArray(seriesState.teams).map((team) => rawRecord(team));
}

function usefulTeamState(team: Record<string, unknown>) {
  return [team.score, team.kills, team.deaths].some((value) => Number.isFinite(Number(value)) && Number(value) > 0) || team.won === true;
}

function playerIdentity(player: Record<string, unknown>) {
  const baseInfo = rawRecord(player.baseInfo);
  const id = String(player.id ?? baseInfo.id ?? "").trim();
  const name = String(player.nickname ?? player.name ?? baseInfo.name ?? "").trim();
  return { id, name };
}

async function resolveGridPlayer(player: Record<string, unknown>, teamId: string, matchId: string) {
  const identity = playerIdentity(player);
  if (identity.id) {
    const alias = await prisma.entityAlias.findUnique({
      where: { entityType_source_externalId: { entityType: "player", source, externalId: identity.id } }
    });
    if (alias) return { playerId: alias.entityId, needsReview: 0 };
  }
  if (identity.name) {
    const existing = await prisma.player.findFirst({
      where: { teamId, nickname: { equals: identity.name } }
    });
    if (existing) {
      if (identity.id) {
        await prisma.entityAlias.upsert({
          where: { entityType_source_externalId: { entityType: "player", source, externalId: identity.id } },
          create: { entityType: "player", entityId: existing.id, source, externalId: identity.id, alias: identity.name, confidence: 0.92 },
          update: { entityId: existing.id, alias: identity.name, confidence: 0.92 }
        });
      }
      return { playerId: existing.id, needsReview: 0 };
    }
  }
  if (identity.id || identity.name) {
    await upsertNeedsReviewCandidate({
      entityType: "player",
      externalId: identity.id || `grid-player:${matchId}:${teamId}:${identity.name}`,
      externalName: identity.name || identity.id,
      confidence: 0,
      reason: "grid_series_state_player_low_confidence",
      raw: { matchId, teamId, player }
    });
    return { playerId: null, needsReview: 1 };
  }
  return { playerId: null, needsReview: 0 };
}

export function determineGridSeriesStateRole(params: {
  targetStartTime: Date;
  sourceDate: Date;
  started?: boolean;
  finished?: boolean;
}) {
  if (params.started || params.finished || params.sourceDate.getTime() >= params.targetStartTime.getTime()) return "post_match_analysis";
  return "pre_match_evidence";
}

async function mapSeriesStateToScopedRecords(params: {
  matchId: string;
  gridSeriesId: string;
  seriesState: Record<string, unknown>;
  sourceRecordId: string;
}) {
  const match = await prisma.match.findUnique({
    where: { id: params.matchId },
    include: {
      teamA: { include: { players: { where: { isActive: true } } } },
      teamB: { include: { players: { where: { isActive: true } } } }
    }
  });
  if (!match) return { recordsCreated: 0, needsReviewCount: 0, notes: ["Match not found."] };
  const startedAt = parseEvidenceDate(params.seriesState.startedAt);
  const sourceDate = startedAt ?? new Date();
  const dataRole = determineGridSeriesStateRole({
    targetStartTime: match.startTime,
    sourceDate,
    started: params.seriesState.started === true,
    finished: params.seriesState.finished === true
  });
  const leakage = evaluatePreMatchLeakage({
    dataRole,
    sourceDate,
    collectedAt: new Date(),
    sourceMatchId: match.id,
    targetMatchId: match.id,
    targetStartTime: match.startTime
  });
  const lineage = {
    sourceMode,
    matchId: match.id,
    importBatchId: `grid_oa_${match.id}_${params.gridSeriesId}`,
    sourceRecordId: params.sourceRecordId,
    isActive: true,
    collectedAt: new Date(),
    sourceDate,
    dataRole,
    dataLeakageCheckPassed: leakage.passed
  };
  let recordsCreated = 0;
  let needsReviewCount = 0;
  const notes: string[] = [];
  const teams = stateTeams(params.seriesState);
  const sides = [
    { teamId: match.teamAId, state: teams[0] },
    { teamId: match.teamBId, state: teams[1] }
  ];
  for (const side of sides) {
    if (!side.state || !usefulTeamState(side.state)) continue;
    const kills = Number(side.state.kills ?? 0);
    const deaths = Number(side.state.deaths ?? 0);
    const score = Number(side.state.score ?? 0);
    const won = side.state.won === true;
    const roundWinRate = kills + deaths > 0 ? kills / (kills + deaths) : 0.5;
    await prisma.teamFormSnapshot.create({
      data: {
        teamId: side.teamId,
        period: "grid_open_access_series_state",
        matchesPlayed: 1,
        mapsPlayed: Math.max(1, score),
        matchWinRate: won ? 1 : 0,
        mapWinRate: Math.max(0, Math.min(1, score / Math.max(1, teams.reduce((sum, team) => sum + Number(rawRecord(team).score ?? 0), 0)))),
        roundWinRate,
        vsTop10WinRate: 0.5,
        vsTop20WinRate: 0.5,
        vsTop50WinRate: 0.5,
        vsTop100WinRate: 0.5,
        winVsTop10: 0.5,
        winVsTop20: 0.5,
        winVsTop50: 0.5,
        winVsTop100: 0.5,
        lossVsLowerRanked: 0.2,
        opponentStrengthAdjustedForm: Math.max(0, Math.min(1, 0.45 + roundWinRate * 0.1 + (won ? 0.08 : 0))),
        currentStreak: won ? 1 : -1,
        formScore: Math.max(0, Math.min(1, 0.45 + roundWinRate * 0.1 + (won ? 0.08 : 0))),
        volatilityScore: 0.45,
        matchesLast7Days: 1,
        mapsLast7Days: Math.max(1, score),
        travelRiskScore: 0.2,
        timezoneShiftHours: 0,
        fatigueScore: 0.2,
        lanWinRate: 0.5,
        onlineWinRate: 0.5,
        motivationScore: 0.5,
        rosterStabilityScore: 0.5,
        closeOutRate: won ? 0.62 : 0.42,
        mapPointConversion: won ? 0.6 : 0.4,
        leadProtectionScore: won ? 0.6 : 0.4,
        lostFromWinningPositionRate: won ? 0.18 : 0.28,
        deciderCollapseRate: won ? 0.18 : 0.28,
        seriesCloseOutRate: won ? 0.62 : 0.42,
        comebackFrom3RoundDeficit: 0.5,
        comebackFrom5RoundDeficit: 0.3,
        badHalfRecovery: 0.5,
        lostPistolRecovery: 0.4,
        lostOwnPickRecovery: 0.4,
        source,
        ...lineage
      }
    });
    recordsCreated += 1;

    for (const playerRaw of asArray(side.state.players).map(rawRecord)) {
      const resolved = await resolveGridPlayer(playerRaw, side.teamId, match.id);
      needsReviewCount += resolved.needsReview;
      if (!resolved.playerId) continue;
      const kills = Number(playerRaw.kills ?? 0);
      const deaths = Number(playerRaw.deaths ?? 0);
      if (!Number.isFinite(kills) || !Number.isFinite(deaths) || kills + deaths <= 0) continue;
      const kd = deaths > 0 ? kills / deaths : kills;
      await prisma.playerStatSnapshot.create({
        data: {
          playerId: resolved.playerId,
          teamId: side.teamId,
          period: "grid_open_access_series_state",
          maps: Math.max(1, score),
          rounds: Math.max(1, kills + deaths),
          kd,
          kdDiff: Math.round(kills - deaths),
          rating: Math.max(0.4, Math.min(1.8, 1 + (kd - 1) * 0.25)),
          adr: 70,
          kast: 0.7,
          impact: Math.max(0.4, Math.min(1.6, 1 + (kills - deaths) / Math.max(24, kills + deaths))),
          openingKillRating: 1,
          clutchScore: 0.5,
          volatilityScore: 0.5,
          pressureScore: 0.5,
          trendScore: 0,
          ratingTrend: 0,
          kdTrend: 0,
          adrTrend: 0,
          openingDuelTrend: 0,
          clutchTrend: 0,
          pressurePerformance: 0.5,
          mapSpecificPerformance: 0.5,
          roleImpact: 0.5,
          starDependency: 0.5,
          worstPlayerLiability: 0.2,
          lanRating: 1,
          onlineRating: 1,
          source,
          ...lineage
        }
      });
      recordsCreated += 1;
    }
  }
  if (!recordsCreated && teams.length) notes.push("GRID Series State fetched, but returned no safely mappable team/player stat records.");
  if (!leakage.passed) notes.push("Series State is stored as post-match/backtest context and is excluded from live pre-match evidence.");
  return { recordsCreated, needsReviewCount, notes };
}

export async function enrichGridOpenAccessMatch(matchId: string, fetchImpl: typeof fetch = fetch): Promise<GridMatchEnrichmentResult> {
  const status = await getGridOpenAccessMatchStatus(matchId);
  const output: GridMatchEnrichmentResult = { ...status, recordsSkipped: 0, errors: [], notes: [] };
  if (!status.enabled) {
    output.notes.push(status.configured ? "GRID key configured, but ENABLE_GRID_SYNC=false." : "GRID key missing.");
    return output;
  }
  if (!status.gridSeriesId) {
    output.notes.push("Нужно связать GRID series id для выбранного матча.");
    return output;
  }
  try {
    const state = await fetchGridSeriesState(status.gridSeriesId, fetchImpl);
    const fetchedAt = new Date();
    const record = sourceRecordFromRaw({
      source,
      entityType: "grid_series_state",
      externalId: `series-state:${status.gridSeriesId}`,
      entityId: matchId,
      fetchedAt,
      sourceConfidence: 0.76,
      raw: {
        sourceMode,
        matchId,
        gridSeriesId: status.gridSeriesId,
        openAccessEndpoint: "Series State",
        unsupportedApisCalled: false,
        unsupportedProducts: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS,
        payload: state
      }
    });
    const existing = await prisma.externalSourceRecord.findUnique({
      where: { source_entityType_externalId: { source, entityType: record.entityType, externalId: record.externalId } }
    });
    const saved = await saveExternalSourceRecord(prisma, record);
    let recordsCreated = saved.changed && !existing ? 1 : 0;
    const recordsUpdated = saved.changed && existing ? 1 : 0;
    const recordsSkipped = saved.changed ? 0 : 1;
    let needsReviewCount = 0;
    if (saved.changed) {
      const mapped = await mapSeriesStateToScopedRecords({
        matchId,
        gridSeriesId: status.gridSeriesId,
        seriesState: state,
        sourceRecordId: saved.record.id
      });
      recordsCreated += mapped.recordsCreated;
      needsReviewCount += mapped.needsReviewCount;
      output.notes.push(...mapped.notes);
    }
    const result = resultFromRecords({
      source,
      jobType: "match_history",
      records: [record],
      status: "success",
      notes: "GRID Series State fetched for selected match. Open Access does not include Series Events, File Download or Stats Feed.",
      endpoint: GRID_SERIES_STATE_ENDPOINT,
      method: "POST",
      rawSample: record.raw,
      endpointsAvailable: ["Series State API"],
      endpointsBlocked: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS.map((name) => `${name} unavailable on Open Access`)
    });
    await prisma.dataSyncJob.create({
      data: buildDataSyncJobData(result, new Date(), recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount)
    });
    await updateSourceHealth(result, { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount });
    const nextStatus = await getGridOpenAccessMatchStatus(matchId);
    return {
      ...output,
      ...nextStatus,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      recordsFetched: 1,
      needsReviewCount,
      seriesStateAvailable: true,
      availableDataTypes: [...new Set([...nextStatus.availableDataTypes, "series state"])]
    };
  } catch (error) {
    const message = redactString(error instanceof Error ? error.message : "GRID Series State sync failed.");
    output.errors.push(message);
    const result = resultFromRecords({
      source,
      jobType: "match_history",
      records: [],
      status: "partial",
      notes: "GRID Series State не проверен или недоступен для этого series id.",
      errors: [message],
      endpoint: GRID_SERIES_STATE_ENDPOINT,
      method: "POST",
      lastError: message,
      rawSample: { sourceMode, matchId, gridSeriesId: status.gridSeriesId, unsupportedApisCalled: false }
    });
    await prisma.dataSyncJob.create({ data: buildDataSyncJobData(result, new Date(), 0, 0, 0, 0) });
    await updateSourceHealth(result);
    return output;
  }
}
