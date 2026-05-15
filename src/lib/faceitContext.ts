import { prisma } from "./prisma";
import { fetchJsonDetailed, resultFromRecords, sourceRecordFromRaw } from "./sources/adapterUtils";
import { buildDataSyncJobData } from "./sources/jobUtils";
import { saveExternalSourceRecord } from "./sources/sourceReconciler";
import { updateSourceHealth } from "./sources/sourceHealth";
import { envFlag, envPresent, type SourceRecord, type SourceSyncResult } from "./sources/types";
import { redactString } from "./security/redaction";

const source = "faceit" as const;
const sourceMode = "faceit_optional";
const baseUrl = "https://open.faceit.com/data/v4";
const gameId = "cs2";

type FaceitEntityType = "team" | "player";

type ParsedFaceitIdRow = {
  entityType: FaceitEntityType;
  name: string;
  faceitId: string;
};

export type FaceitManualIdImportResult = {
  aliasesCreated: number;
  aliasesUpdated: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  errors: string[];
};

export type FaceitMatchEnrichmentResult = {
  matchId: string;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  teamContext: boolean;
  playerContext: boolean;
  stats: boolean;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  candidatesNeedingReview: number;
  errors: string[];
  notes: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvPayload(payload: string) {
  const [headerLine, ...lines] = payload.trim().split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((item) => item.trim());
  return lines.map((line) => {
    const values = line.split(",").map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as Record<string, string>;
  });
}

export function parseFaceitManualIdPayload(payload?: string): ParsedFaceitIdRow[] {
  if (!payload?.trim()) return [];
  const trimmed = payload.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const root = Array.isArray(parsed) ? { rows: parsed } : (parsed as Record<string, unknown>);
    const rows: ParsedFaceitIdRow[] = [];
    if (Array.isArray(root.rows)) {
      for (const item of root.rows) rows.push(normalizeFaceitIdRow(item as Record<string, unknown>));
    }
    if (Array.isArray(root.teams)) {
      for (const item of root.teams) {
        const record = item as Record<string, unknown>;
        rows.push(normalizeFaceitIdRow({ entityType: "team", name: record.teamName, faceitId: record.faceitTeamId }));
      }
    }
    if (Array.isArray(root.players)) {
      for (const item of root.players) {
        const record = item as Record<string, unknown>;
        rows.push(normalizeFaceitIdRow({ entityType: "player", name: record.nickname, faceitId: record.faceitPlayerId }));
      }
    }
    return rows.filter((row) => row.name && row.faceitId);
  }
  return parseCsvPayload(trimmed).map(normalizeFaceitIdRow).filter((row) => row.name && row.faceitId);
}

function normalizeFaceitIdRow(record: Record<string, unknown>): ParsedFaceitIdRow {
  const entityType = String(record.entityType ?? "").toLowerCase() === "player" ? "player" : "team";
  return {
    entityType,
    name: String(record.name ?? record.teamName ?? record.nickname ?? "").trim(),
    faceitId: String(record.faceitId ?? record.faceitTeamId ?? record.faceitPlayerId ?? record.externalId ?? "").trim()
  };
}

async function findInternalEntity(entityType: FaceitEntityType, name: string) {
  const normalized = normalize(name);
  if (!normalized) return null;
  if (entityType === "team") {
    const teams = await prisma.team.findMany({ select: { id: true, name: true, slug: true } });
    const exact = teams.find((team) => normalize(team.name) === normalized || normalize(team.slug) === normalized);
    if (exact) return { id: exact.id, name: exact.name, confidence: 0.96 };
    const partial = teams.find((team) => normalize(team.name).includes(normalized) || normalized.includes(normalize(team.name)));
    return partial ? { id: partial.id, name: partial.name, confidence: 0.72 } : null;
  }
  const players = await prisma.player.findMany({ select: { id: true, nickname: true, realName: true } });
  const exact = players.find((player) => normalize(player.nickname) === normalized || (player.realName ? normalize(player.realName) === normalized : false));
  if (exact) return { id: exact.id, name: exact.nickname, confidence: 0.96 };
  const partial = players.find((player) => normalize(player.nickname).includes(normalized) || normalized.includes(normalize(player.nickname)));
  return partial ? { id: partial.id, name: partial.nickname, confidence: 0.72 } : null;
}

async function upsertNeedsReviewCandidate(params: {
  entityType: FaceitEntityType;
  externalId: string;
  externalName: string;
  matchedEntityId?: string | null;
  confidence: number;
  reason: string;
  matchId?: string;
}) {
  const rawJson = JSON.stringify({
    sourceMode,
    reason: params.reason,
    matchId: params.matchId ?? null,
    automaticSearchUsed: false,
    broadCrawlUsed: false
  });
  const existing = await prisma.entityMatchCandidate.findFirst({
    where: {
      source,
      entityType: params.entityType,
      externalId: params.externalId,
      status: "needs_review"
    },
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

export async function importFaceitManualIds(payload?: string): Promise<FaceitManualIdImportResult> {
  const rows = parseFaceitManualIdPayload(payload);
  const result: FaceitManualIdImportResult = { aliasesCreated: 0, aliasesUpdated: 0, candidatesCreated: 0, candidatesUpdated: 0, errors: [] };
  for (const row of rows) {
    if (!row.faceitId || row.faceitId.includes("<")) {
      result.errors.push(`${row.entityType} ${row.name}: FACEIT ID is missing or still a template value.`);
      continue;
    }
    const matched = await findInternalEntity(row.entityType, row.name);
    if (!matched || matched.confidence < 0.82) {
      const status = await upsertNeedsReviewCandidate({
        entityType: row.entityType,
        externalId: row.faceitId,
        externalName: row.name,
        matchedEntityId: matched?.id ?? null,
        confidence: matched?.confidence ?? 0,
        reason: "manual_faceit_id_low_confidence"
      });
      if (status === "created") result.candidatesCreated += 1;
      else result.candidatesUpdated += 1;
      continue;
    }
    const existing = await prisma.entityAlias.findUnique({
      where: { entityType_source_externalId: { entityType: row.entityType, source, externalId: row.faceitId } }
    });
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType: row.entityType, source, externalId: row.faceitId } },
      create: {
        entityType: row.entityType,
        entityId: matched.id,
        source,
        externalId: row.faceitId,
        alias: row.name,
        confidence: matched.confidence
      },
      update: {
        entityId: matched.id,
        alias: row.name,
        confidence: matched.confidence
      }
    });
    if (existing) result.aliasesUpdated += 1;
    else result.aliasesCreated += 1;
  }
  if (rows.length === 0) result.errors.push("No FACEIT ID rows supplied.");
  return result;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.FACEIT_API_KEY ?? ""}`,
    Accept: "application/json",
    "User-Agent": "CS2MatchPredictionLab/0.6.1 local research analytics"
  };
}

function externalId(matchId: string, type: "team" | "player" | "player_stats" | "competition", id: string) {
  return `match:${matchId}:${type}:${id}`;
}

async function fetchFaceitPayload(endpoint: string, fetchImpl: typeof fetch = fetch) {
  return fetchJsonDetailed(`${baseUrl}${endpoint}`, { headers: authHeaders() }, fetchImpl);
}

async function persistFaceitRecords(result: SourceSyncResult, needsReviewCount: number) {
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  for (const record of result.records) {
    const existing = await prisma.externalSourceRecord.findUnique({
      where: { source_entityType_externalId: { source: record.source, entityType: record.entityType, externalId: record.externalId } }
    });
    const saved = await saveExternalSourceRecord(prisma, record);
    if (!saved.changed) {
      recordsSkipped += 1;
    } else if (existing) {
      recordsUpdated += 1;
    } else {
      recordsCreated += 1;
    }
  }
  await prisma.dataSyncJob.create({
    data: buildDataSyncJobData(result, new Date(), recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount)
  });
  await updateSourceHealth(result, { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount });
  return { recordsCreated, recordsUpdated, recordsSkipped };
}

function makeRecord(params: {
  matchId: string;
  entityId?: string | null;
  entityType: string;
  externalId: string;
  raw: unknown;
  fetchedAt: Date;
  sourceConfidence?: number;
}) {
  return sourceRecordFromRaw({
    source,
    entityType: params.entityType,
    externalId: params.externalId,
    entityId: params.entityId,
    fetchedAt: params.fetchedAt,
    sourceConfidence: params.sourceConfidence ?? 0.48,
    raw: {
      sourceMode,
      matchId: params.matchId,
      dataRole: "pre_match_evidence",
      automaticSearchUsed: false,
      broadCrawlUsed: false,
      payload: params.raw
    }
  });
}

export async function enrichFaceitContextForMatch(matchId: string, fetchImpl: typeof fetch = fetch): Promise<FaceitMatchEnrichmentResult> {
  const configured = envPresent("FACEIT_API_KEY");
  const enabled = configured && envFlag("ENABLE_FACEIT_SYNC");
  const output: FaceitMatchEnrichmentResult = {
    matchId,
    configured,
    enabled,
    reachable: false,
    teamContext: false,
    playerContext: false,
    stats: false,
    recordsFetched: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    candidatesNeedingReview: 0,
    errors: [],
    notes: []
  };

  if (!matchId) {
    output.errors.push("matchId is required for FACEIT selected-match enrichment.");
    return output;
  }
  if (!enabled) {
    output.notes.push(configured ? "FACEIT key configured, but ENABLE_FACEIT_SYNC=false." : "FACEIT key missing.");
    return output;
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { include: { players: { where: { isActive: true } } } },
      teamB: { include: { players: { where: { isActive: true } } } }
    }
  });
  if (!match) {
    output.errors.push(`Match not found: ${matchId}`);
    return output;
  }

  const teams = [match.teamA, match.teamB];
  const players = [...match.teamA.players, ...match.teamB.players];
  const [teamAliases, playerAliases] = await Promise.all([
    prisma.entityAlias.findMany({ where: { source, entityType: "team", entityId: { in: teams.map((team) => team.id) } }, orderBy: { confidence: "desc" } }),
    prisma.entityAlias.findMany({ where: { source, entityType: "player", entityId: { in: players.map((player) => player.id) } }, orderBy: { confidence: "desc" } })
  ]);
  const teamAliasByEntity = new Map(teamAliases.map((alias) => [alias.entityId, alias]));
  const playerAliasByEntity = new Map(playerAliases.map((alias) => [alias.entityId, alias]));

  for (const team of teams) {
    if (teamAliasByEntity.has(team.id)) continue;
    const status = await upsertNeedsReviewCandidate({
      entityType: "team",
      externalId: `missing-faceit-team:${team.id}`,
      externalName: team.name,
      matchedEntityId: team.id,
      confidence: 0,
      reason: "missing_faceit_team_id",
      matchId
    });
    output.candidatesNeedingReview += status === "created" || status === "updated" ? 1 : 0;
  }
  for (const player of players) {
    if (playerAliasByEntity.has(player.id)) continue;
    const status = await upsertNeedsReviewCandidate({
      entityType: "player",
      externalId: `missing-faceit-player:${player.id}`,
      externalName: player.nickname,
      matchedEntityId: player.id,
      confidence: 0,
      reason: "missing_faceit_player_id",
      matchId
    });
    output.candidatesNeedingReview += status === "created" || status === "updated" ? 1 : 0;
  }

  const fetchedAt = new Date();
  const records: SourceRecord[] = [];
  const errors: string[] = [];

  async function guardedFetch(endpoint: string) {
    try {
      const response = await fetchFaceitPayload(endpoint, fetchImpl);
      output.reachable = true;
      return response.payload;
    } catch (error) {
      errors.push(redactString(error instanceof Error ? error.message : "FACEIT request failed."));
      return null;
    }
  }

  for (const team of teams) {
    const alias = teamAliasByEntity.get(team.id);
    if (!alias) continue;
    const payload = await guardedFetch(`/teams/${encodeURIComponent(alias.externalId)}`);
    if (!payload) continue;
    output.teamContext = true;
    records.push(makeRecord({
      matchId,
      entityId: team.id,
      entityType: "faceit_team_context",
      externalId: externalId(matchId, "team", alias.externalId),
      raw: payload,
      fetchedAt,
      sourceConfidence: 0.52
    }));
  }

  for (const player of players) {
    const alias = playerAliasByEntity.get(player.id);
    if (!alias) continue;
    const playerPayload = await guardedFetch(`/players/${encodeURIComponent(alias.externalId)}`);
    if (playerPayload) {
      output.playerContext = true;
      records.push(makeRecord({
        matchId,
        entityId: player.id,
        entityType: "faceit_player_context",
        externalId: externalId(matchId, "player", alias.externalId),
        raw: playerPayload,
        fetchedAt,
        sourceConfidence: 0.5
      }));
    }
    const statsPayload = await guardedFetch(`/players/${encodeURIComponent(alias.externalId)}/stats/${gameId}`);
    if (statsPayload) {
      output.stats = true;
      records.push(makeRecord({
        matchId,
        entityId: player.id,
        entityType: "faceit_player_stats_context",
        externalId: externalId(matchId, "player_stats", alias.externalId),
        raw: statsPayload,
        fetchedAt,
        sourceConfidence: 0.5
      }));
    }
  }

  const competitionPayload = await guardedFetch(`/championships?game=${gameId}&type=upcoming&limit=1`);
  if (competitionPayload) {
    records.push(makeRecord({
      matchId,
      entityType: "faceit_competition_context",
      externalId: externalId(matchId, "competition", "upcoming-limit-1"),
      raw: competitionPayload,
      fetchedAt,
      sourceConfidence: 0.45
    }));
  }

  const result = resultFromRecords({
    source,
    jobType: "faceit_match_enrichment",
    records,
    status: errors.length && records.length === 0 ? "partial" : "success",
    notes: records.length
      ? "FACEIT selected-match context fetched with explicit known IDs only. FACEIT remains optional context and does not unlock Real Forecast Ready."
      : "FACEIT selected-match enrichment found no known IDs to fetch; needs_review candidates were created where mappings are missing.",
    errors,
    endpoint: "selected-match explicit FACEIT ID routes only",
    method: "GET",
    rawSample: records[0]?.raw ?? { matchId, sourceMode, automaticSearchUsed: false, broadCrawlUsed: false }
  });
  const persisted = await persistFaceitRecords(result, output.candidatesNeedingReview);
  output.recordsFetched = records.length;
  output.recordsCreated = persisted.recordsCreated;
  output.recordsUpdated = persisted.recordsUpdated;
  output.recordsSkipped = persisted.recordsSkipped;
  output.errors.push(...errors);
  output.notes.push(result.notes ?? "");
  return output;
}

