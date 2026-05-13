import { calculatePrediction, buildPredictionInput } from "../predictionEngine";
import { prisma } from "../prisma";
import { getSourceAdapter } from "./index";
import { matchEntity, shouldAutoAlias, shouldCreateDomainEntity, type KnownEntityInput } from "./entityMatcher";
import { saveExternalSourceRecord } from "./sourceReconciler";
import { updateSourceHealth, getSourceHealth } from "./sourceHealth";
import { isLiquipediaBlockedByRateLimit, liquipediaRateLimitResult } from "./liquipediaAdapter";
import { buildDataSyncJobData } from "./jobUtils";
import { sourceModeForSource } from "./types";
import type { SourceJobType, SourceMode, SourceName, SourceSyncResult } from "./types";
import { classifyTeamVisibility, classifyTournament, getEffectiveRank } from "../proFocus";
import { aliasesForTeamName } from "../config/teamAliases";
import { rebuildMatchFeatureSnapshots, saveMatchFeatureSnapshot } from "../features/matchFeatureSnapshot";
import { updateInternalEloForFinishedMatches } from "../modelLab/ratings";
import { saveManualNewsItem } from "../news/manualNews";
import { rebuildNewsImpactSnapshots, saveNewsImpactSnapshot } from "../news/newsSnapshots";

const now = () => new Date();

function json(value: unknown) {
  return JSON.stringify(value);
}

function addDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

async function createJob(
  result: SourceSyncResult,
  startedAt: Date,
  recordsCreated: number,
  recordsUpdated: number,
  recordsSkipped: number,
  needsReviewCount: number
) {
  return prisma.dataSyncJob.create({
    data: buildDataSyncJobData(result, startedAt, recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount)
  });
}

async function knownTeams(): Promise<KnownEntityInput[]> {
  const teams = await prisma.team.findMany({ include: { players: { select: { id: true } } } });
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    country: team.country,
    rosterPlayerIds: team.players.map((player) => player.id),
    aliases: [team.slug, team.pandaScoreId, team.gridId, ...aliasesForTeamName(team.name)].filter(Boolean) as string[]
  }));
}

async function knownPlayers(): Promise<KnownEntityInput[]> {
  const players = await prisma.player.findMany();
  return players.map((player) => ({
    id: player.id,
    name: player.nickname,
    country: player.country,
    teamId: player.teamId,
    aliases: [player.realName].filter(Boolean) as string[]
  }));
}

function domainSourceMode(source: SourceName, fallback: SourceMode = "partial") {
  return sourceModeForSource(source) ?? fallback;
}

function teamVisibilityData(name: string) {
  const visibilityTier = classifyTeamVisibility(name);
  return {
    visibilityTier,
    isAcademyTeam: visibilityTier === "academy",
    teamPriority: visibilityTier === "academy" || visibilityTier === "lower_tier" ? -40 : visibilityTier === "separate_circuit" ? -25 : 0
  };
}

function rankCategory(rank: number) {
  if (rank <= 10) return "top_10";
  if (rank <= 20) return "top_20";
  if (rank <= 30) return "top_30";
  if (rank <= 50) return "top_50";
  if (rank <= 100) return "top_100";
  return "unranked";
}

function teamTopRankCategory(rank: number) {
  if (rank <= 10) return "top-10";
  if (rank <= 20) return "top-20";
  if (rank <= 50) return "top-50";
  if (rank <= 100) return "top-100";
  return "unranked";
}

function rankingDateFromRaw(raw: Record<string, unknown>) {
  const explicit = raw.rankingDate ?? raw.date;
  if (explicit) {
    const parsed = new Date(String(explicit));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const sourceText = String(raw.sourceFile ?? raw.sourceUrl ?? "");
  const match = sourceText.match(/(20\d{2})[_-](\d{2})[_-](\d{2})/);
  if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return now();
}

async function saveRankSnapshot(params: {
  teamId: string;
  source: string;
  rank: number;
  points?: number | null;
  region?: string | null;
  rankingDate: Date;
  confidence: number;
  sourceUrl?: string | null;
}) {
  const dateKey = params.rankingDate.toISOString().slice(0, 10);
  const id = `rank_${params.source}_${params.teamId}_${dateKey}_${params.rank}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  return prisma.teamRankSnapshot.upsert({
    where: { id },
    create: {
      id,
      teamId: params.teamId,
      source: params.source,
      rank: params.rank,
      points: params.points ?? null,
      region: params.region ?? null,
      rankingDate: params.rankingDate,
      rankCategory: rankCategory(params.rank),
      confidence: params.confidence,
      sourceUrl: params.sourceUrl ?? null
    },
    update: {
      rank: params.rank,
      points: params.points ?? null,
      region: params.region ?? null,
      confidence: params.confidence,
      sourceUrl: params.sourceUrl ?? null
    }
  });
}

async function reconcileEntityCandidate(recordId: string, source: SourceName, entityType: string, externalId: string, raw: unknown) {
  if (entityType !== "team" && entityType !== "player") return { created: 0, updated: 0, needsReview: 0 };
  const rawRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const externalName = String(rawRecord.name ?? rawRecord.nickname ?? rawRecord.slug ?? externalId);
  const aliases = await prisma.entityAlias.findMany({ where: { entityType } });
  const entities = entityType === "team" ? await knownTeams() : await knownPlayers();
  const candidate = matchEntity({
    external: {
      source,
      entityType,
      externalId,
      externalName,
      country: typeof rawRecord.country === "string" ? rawRecord.country : null,
      teamId: typeof rawRecord.teamId === "string" ? rawRecord.teamId : null,
      rosterPlayerIds: Array.isArray(rawRecord.players) ? rawRecord.players.map((player) => String((player as { id?: unknown }).id ?? player)) : [],
      raw
    },
    aliases,
    entities
  });

  const matchCandidate = await prisma.entityMatchCandidate.create({
    data: {
      source,
      entityType,
      externalId,
      externalName,
      matchedEntityId: candidate.matchedEntityId,
      confidence: candidate.confidence,
      status: candidate.status,
      rawJson: candidate.rawJson
    }
  });
  const needsReview = matchCandidate.status === "needs_review" ? 1 : 0;

  if (shouldAutoAlias(candidate) && candidate.matchedEntityId) {
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType, source, externalId } },
      create: {
        entityType,
        entityId: candidate.matchedEntityId,
        source,
        externalId,
        alias: externalName,
        confidence: candidate.confidence
      },
      update: {
        entityId: candidate.matchedEntityId,
        alias: externalName,
        confidence: candidate.confidence
      }
    });
    await prisma.externalSourceRecord.update({ where: { id: recordId }, data: { entityId: candidate.matchedEntityId } });
    const mode = domainSourceMode(source);
    if (entityType === "team") {
      await prisma.team.update({ where: { id: candidate.matchedEntityId }, data: { sourceMode: mode, sourceConfidence: candidate.confidence, needsReview: false, ...teamVisibilityData(externalName) } }).catch(() => null);
    } else {
      await prisma.player.update({ where: { id: candidate.matchedEntityId }, data: { sourceMode: mode, sourceConfidence: candidate.confidence, needsReview: false } }).catch(() => null);
    }
    return { created: 0, updated: 1, needsReview };
  }

  if (entityType === "team" && shouldCreateDomainEntity(candidate)) {
    const id = `${source}_team_${String(externalId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const slug = `${source}-${String(externalName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${externalId}`;
    const visibility = teamVisibilityData(externalName);
    await prisma.team.upsert({
      where: { id },
      create: {
        id,
        name: externalName,
        slug,
        country: typeof rawRecord.country === "string" ? rawRecord.country : "unknown",
        region: "unknown",
        pandaScoreId: source === "pandascore" ? externalId : null,
        gridId: source === "grid" ? externalId : null,
        internalElo: 1500,
        topRankCategory: "unranked",
        sourceMode: domainSourceMode(source),
        sourceConfidence: 0.62,
        needsReview: false,
        ...visibility,
        isActive: true
      },
      update: {
        name: externalName,
        pandaScoreId: source === "pandascore" ? externalId : undefined,
        gridId: source === "grid" ? externalId : undefined,
        sourceMode: domainSourceMode(source),
        sourceConfidence: 0.62,
        ...visibility
      }
    });
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType, source, externalId } },
      create: { entityType, entityId: id, source, externalId, alias: externalName, confidence: 0.62 },
      update: { entityId: id, alias: externalName, confidence: 0.62 }
    });
    await prisma.externalSourceRecord.update({ where: { id: recordId }, data: { entityId: id } });
    return { created: 1, updated: 0, needsReview };
  }

  if (entityType === "player" && shouldCreateDomainEntity(candidate)) {
    const id = `${source}_player_${String(externalId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const nestedTeamSource = rawRecord.current_team ?? rawRecord.team;
    const nestedTeam = nestedTeamSource && typeof nestedTeamSource === "object" ? (nestedTeamSource as Record<string, unknown>) : {};
    const currentTeamId = rawRecord.current_team_id ?? nestedTeam.id;
    const currentTeamName = typeof nestedTeam.name === "string" ? nestedTeam.name : null;
    const teamId =
      typeof currentTeamId === "number" || typeof currentTeamId === "string"
        ? (await prisma.entityAlias.findUnique({
            where: { entityType_source_externalId: { entityType: "team", source, externalId: String(currentTeamId) } }
          }))?.entityId
        : currentTeamName
          ? (await prisma.team.findFirst({ where: { name: currentTeamName } }))?.id
          : null;
    await prisma.player.upsert({
      where: { id },
      create: {
        id,
        nickname: externalName,
        realName: typeof rawRecord.first_name === "string" || typeof rawRecord.last_name === "string" ? `${rawRecord.first_name ?? ""} ${rawRecord.last_name ?? ""}`.trim() : null,
        teamId,
        role: "unknown",
        country: typeof rawRecord.nationality === "string" ? rawRecord.nationality : typeof rawRecord.country === "string" ? rawRecord.country : "unknown",
        sourceMode: domainSourceMode(source),
        sourceConfidence: 0.6,
        needsReview: false,
        isActive: true
      },
      update: {
        nickname: externalName,
        teamId: teamId ?? undefined,
        sourceMode: domainSourceMode(source),
        sourceConfidence: 0.6
      }
    });
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType, source, externalId } },
      create: { entityType, entityId: id, source, externalId, alias: externalName, confidence: 0.6 },
      update: { entityId: id, alias: externalName, confidence: 0.6 }
    });
    await prisma.externalSourceRecord.update({ where: { id: recordId }, data: { entityId: id } });
    return { created: 1, updated: 0, needsReview };
  }

  return { created: 0, updated: 0, needsReview };
}

function rawRecord(raw: unknown) {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function findTeamByName(name: unknown, matchId?: string | null) {
  if (typeof name !== "string" || !name.trim()) return null;
  const normalized = name.trim().toLowerCase();
  if (matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
    if (match) {
      const teams = [match.teamA, match.teamB];
      const scoped = teams.find((team) => team.name.toLowerCase() === normalized || team.slug === normalized.replace(/[^a-z0-9]+/g, "-"));
      if (scoped) return scoped;
    }
  }
  const teams = await prisma.team.findMany({ take: 500 });
  return teams.find((team) => team.name.toLowerCase() === normalized || team.slug === normalized.replace(/[^a-z0-9]+/g, "-")) ?? null;
}

async function findPlayerByName(name: unknown, teamId?: string | null) {
  if (typeof name !== "string" || !name.trim()) return null;
  const normalized = name.trim().toLowerCase();
  const players = await prisma.player.findMany({ where: teamId ? { teamId } : undefined, take: 500 });
  return players.find((player) => player.nickname.toLowerCase() === normalized || player.realName?.toLowerCase() === normalized) ?? null;
}

async function reconcileManualNewsRecord(raw: unknown, sourceRecordId?: string) {
  const record = rawRecord(raw);
  if (!record.title) return { created: 0, updated: 0, needsReview: 0 };
  const matchId = typeof record.matchId === "string" ? record.matchId : null;
  const team = await findTeamByName(record.affectedTeam ?? record.team, matchId);
  const player = await findPlayerByName(record.affectedPlayer ?? record.player, team?.id);
  const sourceMode = String(record.sourceMode ?? "manual_reference") === "manual_real" ? "manual_real" : "manual_reference";
  await saveManualNewsItem({
    raw: record,
    teamId: team?.id ?? null,
    playerId: player?.id ?? null,
    matchId,
    sourceRecordId,
    importBatchId: typeof record.importBatchId === "string" ? record.importBatchId : null,
    recordSource: sourceMode,
    sourceMode,
    isActive: true
  });
  return { created: 1, updated: 0, needsReview: team || !record.affectedTeam ? 0 : 1 };
}

function nestedName(value: unknown) {
  const record = rawRecord(value);
  return typeof record.name === "string" ? record.name : null;
}

function getExternalOpponent(opponent: unknown) {
  const row = rawRecord(opponent);
  const nested = rawRecord(row.opponent ?? row.team ?? row);
  const id = String(nested.id ?? row.id ?? "");
  const name = String(nested.name ?? nested.acronym ?? row.name ?? "");
  const country = typeof nested.location === "string" ? nested.location : typeof nested.country === "string" ? nested.country : null;
  return id && name ? { externalId: id, name, country, raw: nested } : null;
}

async function resolveExternalTeam(source: SourceName, external: { externalId: string; name: string; country?: string | null; raw: unknown }) {
  const aliases = await prisma.entityAlias.findMany({ where: { entityType: "team" } });
  const entities = await knownTeams();
  const result = matchEntity({
    external: {
      source,
      entityType: "team",
      externalId: external.externalId,
      externalName: external.name,
      country: external.country,
      raw: external.raw
    },
    aliases,
    entities
  });
  await prisma.entityMatchCandidate.create({
    data: {
      source,
      entityType: "team",
      externalId: external.externalId,
      externalName: external.name,
      matchedEntityId: result.matchedEntityId,
      confidence: result.confidence,
      status: result.status,
      rawJson: result.rawJson
    }
  });
  if (result.status === "needs_review") return { teamId: null, blocked: true, needsReview: 1 };
  if (shouldAutoAlias(result) && result.matchedEntityId) {
    await prisma.team.update({ where: { id: result.matchedEntityId }, data: { sourceMode: domainSourceMode(source), sourceConfidence: result.confidence, needsReview: false, ...teamVisibilityData(external.name) } }).catch(() => null);
    return { teamId: result.matchedEntityId, blocked: false, needsReview: 0 };
  }
  if (shouldCreateDomainEntity(result)) {
    const id = `${source}_team_${external.externalId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const slug = `${source}-${external.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${external.externalId}`;
    const visibility = teamVisibilityData(external.name);
    await prisma.team.upsert({
      where: { id },
      create: {
        id,
        name: external.name,
        slug,
        country: external.country ?? "unknown",
        region: "unknown",
        pandaScoreId: source === "pandascore" ? external.externalId : null,
        gridId: source === "grid" ? external.externalId : null,
        internalElo: 1500,
        topRankCategory: "unranked",
        sourceMode: domainSourceMode(source),
        sourceConfidence: 0.62,
        needsReview: false,
        ...visibility,
        isActive: true
      },
      update: { name: external.name, sourceMode: domainSourceMode(source), sourceConfidence: 0.62, ...visibility }
    });
    await prisma.entityAlias.upsert({
      where: { entityType_source_externalId: { entityType: "team", source, externalId: external.externalId } },
      create: { entityType: "team", entityId: id, source, externalId: external.externalId, alias: external.name, confidence: 0.62 },
      update: { entityId: id, alias: external.name, confidence: 0.62 }
    });
    return { teamId: id, blocked: false, needsReview: 0 };
  }
  return { teamId: result.matchedEntityId ?? null, blocked: !result.matchedEntityId, needsReview: 0 };
}

function mapExternalMatchStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  if (["not_started", "not started", "scheduled", "upcoming"].includes(status)) return "upcoming";
  if (["running", "live", "in_progress"].includes(status)) return "live";
  if (["finished", "completed", "canceled"].includes(status)) return status === "canceled" ? "finished" : "finished";
  return "upcoming";
}

function mapExternalFormat(raw: Record<string, unknown>) {
  const games = Number(raw.number_of_games ?? raw.games_count ?? raw.match_type);
  if (games === 1 || String(raw.match_type).toLowerCase().includes("bo1")) return "BO1";
  if (games === 5 || String(raw.match_type).toLowerCase().includes("bo5")) return "BO5";
  return "BO3";
}

async function reconcileMatchRecord(source: SourceName, externalId: string, raw: unknown) {
  if (source !== "pandascore" && source !== "grid" && source !== "manual") return { created: 0, updated: 0, needsReview: 0 };
  const record = rawRecord(raw);
  const opponentsRaw = Array.isArray(record.opponents) ? record.opponents : [];
  if (opponentsRaw.length < 2) return { created: 0, updated: 0, needsReview: 0 };
  const [externalA, externalB] = opponentsRaw.map(getExternalOpponent);
  if (!externalA || !externalB) return { created: 0, updated: 0, needsReview: 0 };
  const [teamA, teamB] = await Promise.all([resolveExternalTeam(source, externalA), resolveExternalTeam(source, externalB)]);
  const needsReview = (teamA.needsReview ?? 0) + (teamB.needsReview ?? 0);
  if (teamA.blocked || teamB.blocked || !teamA.teamId || !teamB.teamId || teamA.teamId === teamB.teamId) return { created: 0, updated: 0, needsReview };
  const existing = await prisma.match.findFirst({ where: { source, sourceMatchId: externalId } });
  const tournament = rawRecord(record.tournament);
  const league = rawRecord(record.league);
  const serie = rawRecord(record.serie);
  const eventName = nestedName(tournament) ?? nestedName(league) ?? "Imported CS2 event";
  const resolvedTeamRows = await prisma.team.findMany({
    where: { id: { in: [teamA.teamId, teamB.teamId] } },
    include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } }
  });
  const rankedParticipants = resolvedTeamRows.some((team) => {
    const rank = getEffectiveRank(team).rank ?? 999;
    return rank <= 50;
  });
  const tournamentClass = classifyTournament(eventName, rankedParticipants);
  const tournamentExternalId = String(tournament.id ?? league.id ?? eventName);
  await prisma.tournamentProfile.upsert({
    where: { source_externalId: { source, externalId: tournamentExternalId } },
    create: {
      source,
      externalId: tournamentExternalId,
      name: eventName,
      organizer: typeof league.name === "string" ? league.name : null,
      tier: tournamentClass.tier,
      importanceScore: tournamentClass.importanceScore,
      isKnownTournament: tournamentClass.isKnownTournament,
      isQualifier: tournamentClass.isQualifier,
      isAcademy: tournamentClass.isAcademy,
      isRegional: tournamentClass.isRegional,
      isSeparateCircuit: tournamentClass.isSeparateCircuit,
      isOnline: false,
      isLan: false,
      confidence: tournamentClass.isKnownTournament ? 0.78 : 0.45,
      notes: tournamentClass.isConditional ? "Conditional tournament tier depends on ranked participants." : null
    },
    update: {
      name: eventName,
      tier: tournamentClass.tier,
      importanceScore: tournamentClass.importanceScore,
      isKnownTournament: tournamentClass.isKnownTournament,
      isQualifier: tournamentClass.isQualifier,
      isAcademy: tournamentClass.isAcademy,
      isRegional: tournamentClass.isRegional,
      isSeparateCircuit: tournamentClass.isSeparateCircuit,
      confidence: tournamentClass.isKnownTournament ? 0.78 : 0.45
    }
  });
  const startTime = new Date(String(record.begin_at ?? record.scheduled_at ?? record.startTime ?? new Date().toISOString()));
  const winnerExternalId = record.winner_id ? String(record.winner_id) : null;
  const winnerTeamId = winnerExternalId === externalA.externalId ? teamA.teamId : winnerExternalId === externalB.externalId ? teamB.teamId : null;
  const data = {
    source,
    sourceMatchId: externalId,
    eventName,
    eventTier: tournamentClass.tier === "unknown" ? "imported" : tournamentClass.tier,
    stage: nestedName(serie) ?? nestedName(tournament) ?? "Imported stage",
    startTime: Number.isNaN(startTime.getTime()) ? new Date() : startTime,
    status: mapExternalMatchStatus(record.status),
    format: mapExternalFormat(record),
    isOfficial: true,
    isLan: false,
    teamAId: teamA.teamId,
    teamBId: teamB.teamId,
    winnerTeamId,
    matchUrl: typeof record.official_stream_url === "string" ? record.official_stream_url : typeof record.url === "string" ? record.url : null,
    dataQualityScore: source === "grid" ? 76 : source === "pandascore" ? 62 : 48,
    sourceMode: domainSourceMode(source),
    sourceConfidence: source === "grid" ? 0.86 : source === "pandascore" ? 0.72 : 0.58,
    needsReview: needsReview > 0
  };
  if (existing) {
    await prisma.match.update({ where: { id: existing.id }, data });
    return { created: 0, updated: 1, needsReview };
  }
  await prisma.match.create({ data: { id: `${source}_match_${externalId.replace(/[^a-zA-Z0-9_-]/g, "_")}`, ...data } });
  return { created: 1, updated: 0, needsReview };
}

async function reconcileValveRankingRecord(source: SourceName, raw: unknown) {
  const record = rawRecord(raw);
  const externalName = String(record.teamName ?? record.name ?? "");
  if (!externalName) return { created: 0, updated: 0, needsReview: 0 };
  const aliases = await prisma.entityAlias.findMany({ where: { entityType: "team" } });
  const result = matchEntity({
    external: {
      source,
      entityType: "team",
      externalId: String(record.externalId ?? record.rank ?? externalName),
      externalName,
      raw
    },
    aliases,
    entities: await knownTeams()
  });

  if (result.status === "needs_review") {
    await prisma.entityMatchCandidate.create({
      data: {
        source,
        entityType: "team",
        externalId: result.externalId,
        externalName,
        matchedEntityId: result.matchedEntityId,
        confidence: result.confidence,
        status: "needs_review",
        rawJson: result.rawJson
      }
    });
    return { created: 0, updated: 0, needsReview: 1 };
  }

  if (!shouldAutoAlias(result) || !result.matchedEntityId) return { created: 0, updated: 0, needsReview: 0 };
  const rank = Number(record.rank);
  const points = Number(record.points);
  const topRankCategory = Number.isFinite(rank)
    ? rank <= 10
      ? "top-10"
      : rank <= 20
        ? "top-20"
        : rank <= 50
          ? "top-50"
          : rank <= 100
            ? "top-100"
            : "unranked"
    : "unranked";
  await prisma.team.update({
    where: { id: result.matchedEntityId },
    data: {
      valveRank: Number.isFinite(rank) ? rank : undefined,
      internalElo: Number.isFinite(points) ? points : undefined,
      topRankCategory,
      sourceMode: "valve_rankings",
      sourceConfidence: result.confidence,
      needsReview: false
    }
  });
  if (Number.isFinite(rank)) {
    await saveRankSnapshot({
      teamId: result.matchedEntityId,
      source: "valve_rankings",
      rank,
      points: Number.isFinite(points) ? points : null,
      region: typeof record.region === "string" ? record.region : null,
      rankingDate: rankingDateFromRaw(record),
      confidence: result.confidence,
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null
    });
  }
  const rosterHint = record.roster ?? record.players ?? record.lineup;
  const hasRosterHint = Array.isArray(rosterHint) ? rosterHint.length > 0 : typeof rosterHint === "string" && rosterHint.trim().length > 0;
  if (hasRosterHint) {
    await prisma.valveRosterHint.create({
      data: {
        teamId: result.matchedEntityId,
        source: "valve_rankings",
        sourceRecordId: String(record.externalId ?? record.rank ?? externalName),
        rankingDate: rankingDateFromRaw(record),
        rosterJson: json(Array.isArray(rosterHint) ? rosterHint : String(rosterHint).split(/,\s*|\s{2,}/).map((player) => player.trim()).filter(Boolean)),
        rosterConfidence: 0.35,
        notes: "Valve standings roster hint only; not treated as confirmed full roster."
      }
    });
  }
  await prisma.entityAlias.upsert({
    where: { entityType_source_externalId: { entityType: "team", source, externalId: result.externalId } },
    create: { entityType: "team", entityId: result.matchedEntityId, source, externalId: result.externalId, alias: externalName, confidence: result.confidence },
    update: { entityId: result.matchedEntityId, alias: externalName, confidence: result.confidence }
  });
  return { created: 0, updated: 1, needsReview: 0 };
}

async function reconcileHltvManualRankingRecord(raw: unknown) {
  const record = rawRecord(raw);
  const externalName = String(record.teamName ?? record.name ?? "");
  const rank = Number(record.rank);
  if (!externalName || !Number.isFinite(rank)) return { created: 0, updated: 0, needsReview: 0 };
  const source: SourceName = "manual";
  const externalId = String(record.hltvReferenceUrl ?? record.externalId ?? `hltv-${rank}-${externalName}`);
  const result = matchEntity({
    external: {
      source,
      entityType: "team",
      externalId,
      externalName,
      raw
    },
    aliases: await prisma.entityAlias.findMany({ where: { entityType: "team" } }),
    entities: await knownTeams()
  });

  if (result.status === "needs_review" || !result.matchedEntityId) {
    await prisma.entityMatchCandidate.create({
      data: {
        source,
        entityType: "team",
        externalId,
        externalName,
        matchedEntityId: result.matchedEntityId,
        confidence: result.confidence,
        status: "needs_review",
        rawJson: result.rawJson
      }
    });
    return { created: 0, updated: 0, needsReview: 1 };
  }
  if (!shouldAutoAlias(result)) return { created: 0, updated: 0, needsReview: 0 };
  const rankingDate = rankingDateFromRaw(record);
  await prisma.team.update({
    where: { id: result.matchedEntityId },
    data: {
      hltvRank: rank,
      hltvReferenceUrl: typeof record.hltvReferenceUrl === "string" ? record.hltvReferenceUrl : undefined,
      topRankCategory: teamTopRankCategory(rank),
      sourceConfidence: Math.max(0.7, result.confidence),
      needsReview: false
    }
  });
  await saveRankSnapshot({
    teamId: result.matchedEntityId,
    source: "hltv_manual_reference",
    rank,
    points: null,
    region: typeof record.region === "string" ? record.region : null,
    rankingDate,
    confidence: result.confidence,
    sourceUrl: typeof record.hltvReferenceUrl === "string" ? record.hltvReferenceUrl : null
  });
  await prisma.entityAlias.upsert({
    where: { entityType_source_externalId: { entityType: "team", source, externalId } },
    create: { entityType: "team", entityId: result.matchedEntityId, source, externalId, alias: externalName, confidence: result.confidence },
    update: { entityId: result.matchedEntityId, alias: externalName, confidence: result.confidence }
  });
  return { created: 1, updated: 1, needsReview: 0 };
}

function classifyPatchType(raw: Record<string, unknown>) {
  const title = String(raw.title ?? raw.rawTitle ?? "");
  const contents = String(raw.contents ?? raw.description ?? "");
  const text = `${title} ${contents}`.toLowerCase();
  const affected = [
    text.includes("map") ? "map" : null,
    text.includes("weapon") ? "weapon" : null,
    text.includes("economy") || text.includes("money") ? "economy" : null,
    text.includes("gameplay") ? "gameplay" : null
  ].filter(Boolean);
  const patchType = text.includes("major") || affected.length >= 3 ? "major" : affected.length > 0 ? "medium" : "minor";
  const impactScore = patchType === "major" ? 0.82 : patchType === "medium" ? 0.58 : 0.28;
  return { patchType, affectedAreas: affected.length ? affected.join(",") : "unknown", impactScore };
}

async function reconcileGameMetaRecord(raw: unknown) {
  const wrapper = rawRecord(raw);
  const record = rawRecord(wrapper.raw ?? raw);
  const quality = String(wrapper.patchDataQuality ?? "partial");
  if (quality !== "complete" && Number(wrapper.sourceConfidence ?? 0) < 0.7) return { created: 0, updated: 0, needsReview: 0 };
  const published = Number(record.date);
  const patchDate = Number.isFinite(published) ? new Date(published * 1000) : new Date();
  const title = String(record.title ?? "Counter-Strike update");
  const classified = classifyPatchType({
    title,
    contents: String(record.contents ?? "")
  });
  await prisma.gameMetaVersion.upsert({
    where: { id: `steam_update_${String(record.gid ?? record.id ?? patchDate.getTime()).replace(/[^a-zA-Z0-9_-]/g, "_")}` },
    create: {
      id: `steam_update_${String(record.gid ?? record.id ?? patchDate.getTime()).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      patchDate,
      patchName: title,
      patchType: classified.patchType,
      affectedAreas: classified.affectedAreas,
      impactScore: classified.impactScore,
      description: String(record.contents ?? "").slice(0, 900),
      sourceUrl: typeof record.url === "string" ? record.url : null
    },
    update: {
      patchDate,
      patchName: title,
      patchType: classified.patchType,
      affectedAreas: classified.affectedAreas,
      impactScore: classified.impactScore,
      description: String(record.contents ?? "").slice(0, 900)
    }
  });
  return { created: 1, updated: 0, needsReview: 0 };
}

async function reconcileParsedDemoRecord(raw: unknown) {
  const record = rawRecord(raw);
  let created = 0;
  const teams = Array.isArray(record.teams) ? record.teams : [];
  const playerStats = Array.isArray(record.playerStats) ? record.playerStats : [];
  const mapStats = Array.isArray(record.mapStats) ? record.mapStats : [];
  const teamForms = Array.isArray(record.teamForms) ? record.teamForms : [];

  for (const team of teams) {
    const teamRecord = rawRecord(team);
    const externalId = String(teamRecord.id ?? teamRecord.name ?? "");
    const name = String(teamRecord.name ?? externalId);
    if (!externalId || !name) continue;
    await resolveExternalTeam("parsed-demo", { externalId, name, country: typeof teamRecord.country === "string" ? teamRecord.country : null, raw: team });
  }

  for (const stat of playerStats) {
    const statRecord = rawRecord(stat);
    const playerId = String(statRecord.playerId ?? "");
    const teamId = String(statRecord.teamId ?? "");
    if (!playerId || !teamId) continue;
    await prisma.playerStatSnapshot.create({
      data: {
        playerId,
        teamId,
        period: String(statRecord.period ?? "parsed_demo"),
        maps: Number(statRecord.maps ?? 1),
        rounds: Number(statRecord.rounds ?? 24),
        kd: Number(statRecord.kd ?? 1),
        kdDiff: Number(statRecord.kdDiff ?? 0),
        rating: Number(statRecord.rating ?? 1),
        adr: Number(statRecord.adr ?? 70),
        kast: Number(statRecord.kast ?? 0.7),
        impact: Number(statRecord.impact ?? 1),
        openingKillRating: Number(statRecord.openingKillRating ?? 1),
        clutchScore: Number(statRecord.clutchScore ?? 0.5),
        volatilityScore: Number(statRecord.volatilityScore ?? 0.5),
        pressureScore: Number(statRecord.pressureScore ?? 0.5),
        trendScore: Number(statRecord.trendScore ?? 0),
        ratingTrend: Number(statRecord.ratingTrend ?? 0),
        kdTrend: Number(statRecord.kdTrend ?? 0),
        adrTrend: Number(statRecord.adrTrend ?? 0),
        openingDuelTrend: Number(statRecord.openingDuelTrend ?? 0),
        clutchTrend: Number(statRecord.clutchTrend ?? 0),
        pressurePerformance: Number(statRecord.pressurePerformance ?? 0.5),
        mapSpecificPerformance: Number(statRecord.mapSpecificPerformance ?? 0.5),
        roleImpact: Number(statRecord.roleImpact ?? 0.5),
        starDependency: Number(statRecord.starDependency ?? 0.5),
        worstPlayerLiability: Number(statRecord.worstPlayerLiability ?? 0.2),
        lanRating: Number(statRecord.lanRating ?? statRecord.rating ?? 1),
        onlineRating: Number(statRecord.onlineRating ?? statRecord.rating ?? 1),
        source: "parsed_demo",
        sourceUrl: typeof statRecord.sourceUrl === "string" ? statRecord.sourceUrl : null
      }
    });
    created += 1;
  }

  for (const stat of mapStats) {
    const statRecord = rawRecord(stat);
    const teamId = String(statRecord.teamId ?? "");
    const mapName = String(statRecord.mapName ?? "");
    if (!teamId || !mapName) continue;
    await prisma.teamMapStat.create({
      data: {
        teamId,
        mapName,
        period: String(statRecord.period ?? "parsed_demo"),
        mapsPlayed: Number(statRecord.mapsPlayed ?? 1),
        winRate: Number(statRecord.winRate ?? 0.5),
        pickRate: Number(statRecord.pickRate ?? 0.1),
        banRate: Number(statRecord.banRate ?? 0.1),
        firstPickRate: Number(statRecord.firstPickRate ?? 0.1),
        deciderRate: Number(statRecord.deciderRate ?? 0.1),
        ctRoundWinRate: Number(statRecord.ctRoundWinRate ?? 0.5),
        tRoundWinRate: Number(statRecord.tRoundWinRate ?? 0.5),
        pistolWinRate: Number(statRecord.pistolWinRate ?? 0.5),
        conversionAfterPistolWin: Number(statRecord.conversionAfterPistolWin ?? 0.5),
        forceBuyWinRate: Number(statRecord.forceBuyWinRate ?? 0.3),
        antiEcoLossRate: Number(statRecord.antiEcoLossRate ?? 0.1),
        overtimeWinRate: Number(statRecord.overtimeWinRate ?? 0.5),
        multipleOvertimeWinRate: Number(statRecord.multipleOvertimeWinRate ?? 0.5),
        overtimeFrequency: Number(statRecord.overtimeFrequency ?? 0.1),
        pressureRoundWinRate: Number(statRecord.pressureRoundWinRate ?? 0.5),
        clutchInOvertimeScore: Number(statRecord.clutchInOvertimeScore ?? 0.5),
        closingScore: Number(statRecord.closingScore ?? 0.5),
        comebackScore: Number(statRecord.comebackScore ?? 0.5),
        ecoRecoveryScore: Number(statRecord.ecoRecoveryScore ?? 0.5),
        resetResistanceScore: Number(statRecord.resetResistanceScore ?? 0.5),
        recentTrend: Number(statRecord.recentTrend ?? 0),
        openingRoundPerformance: Number(statRecord.openingRoundPerformance ?? 0.5),
        sampleQuality: Number(statRecord.sampleQuality ?? 0.5),
        source: "parsed_demo",
        sourceUrl: typeof statRecord.sourceUrl === "string" ? statRecord.sourceUrl : null
      }
    });
    created += 1;
  }

  for (const form of teamForms) {
    const formRecord = rawRecord(form);
    const teamId = String(formRecord.teamId ?? "");
    if (!teamId) continue;
    await prisma.teamFormSnapshot.create({
      data: {
        teamId,
        period: String(formRecord.period ?? "parsed_demo"),
        matchesPlayed: Number(formRecord.matchesPlayed ?? 1),
        mapsPlayed: Number(formRecord.mapsPlayed ?? 1),
        matchWinRate: Number(formRecord.matchWinRate ?? 0.5),
        mapWinRate: Number(formRecord.mapWinRate ?? 0.5),
        roundWinRate: Number(formRecord.roundWinRate ?? 0.5),
        vsTop10WinRate: Number(formRecord.vsTop10WinRate ?? 0.5),
        vsTop20WinRate: Number(formRecord.vsTop20WinRate ?? 0.5),
        vsTop50WinRate: Number(formRecord.vsTop50WinRate ?? 0.5),
        vsTop100WinRate: Number(formRecord.vsTop100WinRate ?? 0.5),
        winVsTop10: Number(formRecord.winVsTop10 ?? 0.5),
        winVsTop20: Number(formRecord.winVsTop20 ?? 0.5),
        winVsTop50: Number(formRecord.winVsTop50 ?? 0.5),
        winVsTop100: Number(formRecord.winVsTop100 ?? 0.5),
        lossVsLowerRanked: Number(formRecord.lossVsLowerRanked ?? 0.2),
        opponentStrengthAdjustedForm: Number(formRecord.opponentStrengthAdjustedForm ?? 0.5),
        currentStreak: Number(formRecord.currentStreak ?? 0),
        formScore: Number(formRecord.formScore ?? 0.5),
        volatilityScore: Number(formRecord.volatilityScore ?? 0.5),
        matchesLast7Days: Number(formRecord.matchesLast7Days ?? 0),
        mapsLast7Days: Number(formRecord.mapsLast7Days ?? 0),
        travelRiskScore: Number(formRecord.travelRiskScore ?? 0.2),
        timezoneShiftHours: Number(formRecord.timezoneShiftHours ?? 0),
        fatigueScore: Number(formRecord.fatigueScore ?? 0.2),
        lanWinRate: Number(formRecord.lanWinRate ?? 0.5),
        onlineWinRate: Number(formRecord.onlineWinRate ?? 0.5),
        motivationScore: Number(formRecord.motivationScore ?? 0.5),
        rosterStabilityScore: Number(formRecord.rosterStabilityScore ?? 0.5),
        closeOutRate: Number(formRecord.closeOutRate ?? 0.5),
        mapPointConversion: Number(formRecord.mapPointConversion ?? 0.5),
        leadProtectionScore: Number(formRecord.leadProtectionScore ?? 0.5),
        lostFromWinningPositionRate: Number(formRecord.lostFromWinningPositionRate ?? 0.2),
        deciderCollapseRate: Number(formRecord.deciderCollapseRate ?? 0.2),
        seriesCloseOutRate: Number(formRecord.seriesCloseOutRate ?? 0.5),
        comebackFrom3RoundDeficit: Number(formRecord.comebackFrom3RoundDeficit ?? 0.5),
        comebackFrom5RoundDeficit: Number(formRecord.comebackFrom5RoundDeficit ?? 0.3),
        badHalfRecovery: Number(formRecord.badHalfRecovery ?? 0.5),
        lostPistolRecovery: Number(formRecord.lostPistolRecovery ?? 0.4),
        lostOwnPickRecovery: Number(formRecord.lostOwnPickRecovery ?? 0.4)
      }
    });
    created += 1;
  }

  return { created, updated: 0, needsReview: 0 };
}

async function persistSourceRecords(result: SourceSyncResult) {
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let recordsSkipped = 0;
  let needsReviewCount = 0;
  for (const record of result.records) {
    const saved = await saveExternalSourceRecord(prisma, record);
    if (!saved.changed) {
      recordsSkipped += 1;
      continue;
    }
    recordsUpdated += 1;
    const reconciled =
      record.entityType === "match"
        ? await reconcileMatchRecord(record.source, record.externalId, record.raw)
        : record.entityType === "valve_ranking"
          ? await reconcileValveRankingRecord(record.source, record.raw)
          : record.entityType === "hltv_manual_ranking"
            ? await reconcileHltvManualRankingRecord(record.raw)
            : record.entityType === "manual_news"
              ? await reconcileManualNewsRecord(record.raw, saved.record.id)
              : record.entityType === "game_meta_update"
                ? await reconcileGameMetaRecord(record.raw)
                : record.entityType === "parsed_demo_stats"
                  ? await reconcileParsedDemoRecord(record.raw)
                  : await reconcileEntityCandidate(saved.record.id, record.source, record.entityType, record.externalId, record.raw);
    recordsCreated += reconciled.created;
    recordsUpdated += reconciled.updated;
    needsReviewCount += reconciled.needsReview ?? 0;
  }
  return { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount };
}

export async function runSourceSync(source: SourceName, jobType: SourceJobType, payload?: string) {
  const adapter = getSourceAdapter(source);
  if (!adapter) throw new Error(`Unknown source adapter: ${source}`);
  const startedAt = now();
  const health = await getSourceHealth(source);
  let result: SourceSyncResult;
  if (source === "liquipedia" && isLiquipediaBlockedByRateLimit(health, startedAt)) {
    result = liquipediaRateLimitResult(jobType, startedAt);
  } else {
    result = await adapter.sync({ jobType, since: health?.since, cursor: health?.cursor, now: startedAt, payload });
  }
  const { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount } = await persistSourceRecords(result);
  await createJob(result, startedAt, recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount);
  await updateSourceHealth(result, { recordsCreated, recordsUpdated, recordsSkipped, needsReviewCount });
  return result;
}

export async function syncUpcomingMatches(source: SourceName = "pandascore") {
  return runSourceSync(source, "upcoming_matches");
}

export async function syncLiveMatches(source: SourceName = "pandascore") {
  return runSourceSync(source, "live_matches");
}

export async function syncFinishedMatches(source: SourceName = "pandascore") {
  return runSourceSync(source, "finished_matches");
}

export async function syncTeams(source: SourceName = "pandascore") {
  return runSourceSync(source, "teams");
}

export async function syncPlayers(source: SourceName = "pandascore") {
  return runSourceSync(source, "players");
}

export async function syncSeries(source: SourceName = "pandascore") {
  return runSourceSync(source, "series");
}

export async function syncTournaments(source: SourceName = "pandascore") {
  return runSourceSync(source, "tournaments");
}

export async function syncRosters(source: SourceName = "liquipedia") {
  return runSourceSync(source, "rosters");
}

export async function syncValveRankings() {
  return runSourceSync("valve-rankings", "valve_rankings");
}

export async function syncMatchHistory(source: SourceName = "grid") {
  return runSourceSync(source, "match_history");
}

export async function syncMapStats(source: SourceName = "grid") {
  return runSourceSync(source, "map_stats");
}

export async function syncPlayerStats(source: SourceName = "grid") {
  return runSourceSync(source, "player_stats");
}

export async function syncRosterEvents(source: SourceName = "liquipedia") {
  return runSourceSync(source, "roster_events");
}

export async function syncGameMetaUpdates() {
  return runSourceSync("cs-updates", "game_meta_updates");
}

export async function syncPandaScoreFreeFixtures() {
  const jobs: SourceJobType[] = ["match_history", "upcoming_matches", "finished_matches", "series", "tournaments", "teams", "players"];
  const results: SourceSyncResult[] = [];
  for (const job of jobs) {
    results.push(await runSourceSync("pandascore", job));
  }
  return results;
}

export async function runAllSync() {
  const results: SourceSyncResult[] = [];
  results.push(await syncValveRankings());
  results.push(await syncGameMetaUpdates());
  results.push(...(await syncPandaScoreFreeFixtures()));
  return results;
}

export async function buildTeamFormSnapshots() {
  return prisma.teamFormSnapshot.count();
}

export async function buildTeamBasicResultSnapshots() {
  const matches = await prisma.match.findMany({
    where: {
      status: "finished",
      winnerTeamId: { not: null },
      sourceMode: { not: "demo" }
    },
    include: {
      teamA: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } },
      teamB: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }
    },
    orderBy: { startTime: "desc" }
  });
  const byTeam = new Map<string, {
    played: number;
    wins: number;
    losses: number;
    rankedWins: number;
    rankedLosses: number;
    opponentRanks: number[];
    lastMatchAt: Date | null;
    sourceQuality: number[];
  }>();

  function row(teamId: string) {
    const existing = byTeam.get(teamId);
    if (existing) return existing;
    const created = { played: 0, wins: 0, losses: 0, rankedWins: 0, rankedLosses: 0, opponentRanks: [], lastMatchAt: null, sourceQuality: [] };
    byTeam.set(teamId, created);
    return created;
  }

  for (const match of matches) {
    const sides = [
      { team: match.teamA, opponent: match.teamB },
      { team: match.teamB, opponent: match.teamA }
    ];
    for (const side of sides) {
      const result = row(side.team.id);
      const opponentRank = getEffectiveRank(side.opponent).rank;
      const won = match.winnerTeamId === side.team.id;
      result.played += 1;
      result.wins += won ? 1 : 0;
      result.losses += won ? 0 : 1;
      if (opponentRank && opponentRank <= 100) {
        result.opponentRanks.push(opponentRank);
        result.rankedWins += won ? 1 : 0;
        result.rankedLosses += won ? 0 : 1;
      }
      result.lastMatchAt = result.lastMatchAt && result.lastMatchAt > match.startTime ? result.lastMatchAt : match.startTime;
      result.sourceQuality.push(Math.max(0.25, Math.min(0.72, match.sourceConfidence)));
    }
  }

  let upserted = 0;
  for (const [teamId, result] of byTeam) {
    if (result.played === 0) continue;
    const averageOpponentRank = result.opponentRanks.length
      ? result.opponentRanks.reduce((sum, rank) => sum + rank, 0) / result.opponentRanks.length
      : null;
    const dataQuality =
      Math.min(0.7, 0.25 + Math.min(result.played, 20) / 50) *
      (result.sourceQuality.length ? result.sourceQuality.reduce((sum, value) => sum + value, 0) / result.sourceQuality.length : 0.5);
    await prisma.teamBasicResultSnapshot.upsert({
      where: { teamId_period_source: { teamId, period: "basic_recent", source: "pandascore_free" } },
      create: {
        teamId,
        period: "basic_recent",
        matchesPlayed: result.played,
        wins: result.wins,
        losses: result.losses,
        winRate: result.wins / result.played,
        vsRankedWins: result.rankedWins,
        vsRankedLosses: result.rankedLosses,
        averageOpponentRank,
        lastMatchAt: result.lastMatchAt,
        source: "pandascore_free",
        dataQuality
      },
      update: {
        matchesPlayed: result.played,
        wins: result.wins,
        losses: result.losses,
        winRate: result.wins / result.played,
        vsRankedWins: result.rankedWins,
        vsRankedLosses: result.rankedLosses,
        averageOpponentRank,
        lastMatchAt: result.lastMatchAt,
        dataQuality
      }
    });
    upserted += 1;
  }
  return upserted;
}

export async function buildPlayerStatSnapshots() {
  return prisma.playerStatSnapshot.count();
}

export async function buildTeamMapStats() {
  return prisma.teamMapStat.count();
}

export async function buildVetoPatterns() {
  return prisma.vetoPattern.count();
}

export async function buildOpponentMatchupProfiles() {
  const matches = await prisma.match.findMany({ include: { teamA: true, teamB: true } });
  let created = 0;
  for (const match of matches) {
    const pairs = [
      [match.teamAId, match.teamBId],
      [match.teamBId, match.teamAId]
    ] as const;
    for (const [teamId, opponentTeamId] of pairs) {
      const teamForm = await prisma.teamFormSnapshot.findFirst({ where: { teamId }, orderBy: { createdAt: "desc" } });
      const opponentForm = await prisma.teamFormSnapshot.findFirst({ where: { teamId: opponentTeamId }, orderBy: { createdAt: "desc" } });
      const maps = await prisma.teamMapStat.findMany({ where: { teamId } });
      const opponentMaps = await prisma.teamMapStat.findMany({ where: { teamId: opponentTeamId } });
      const favoriteMaps = [...maps].sort((a, b) => b.winRate - a.winRate).slice(0, 2).map((map) => map.mapName);
      const weakMaps = [...maps].sort((a, b) => a.winRate - b.winRate).slice(0, 2).map((map) => map.mapName);
      const scoreDelta = (teamForm?.opponentStrengthAdjustedForm ?? 0.5) - (opponentForm?.opponentStrengthAdjustedForm ?? 0.5);
      await prisma.opponentMatchupProfile.upsert({
        where: { id: `matchup_${match.id}_${teamId}` },
        create: {
          id: `matchup_${match.id}_${teamId}`,
          teamId,
          opponentTeamId,
          period: "last_90_days",
          rosterSimilarity: 0.62 + Math.min(0.25, (teamForm?.rosterStabilityScore ?? 0.5) * 0.25),
          matchesPlayed: match.status === "finished" ? 1 : 0,
          mapsPlayed: maps.reduce((sum, map) => sum + map.mapsPlayed, 0),
          matchWinRate: Math.max(0, Math.min(1, (teamForm?.matchWinRate ?? 0.5) + scoreDelta * 0.2)),
          mapWinRate: Math.max(0, Math.min(1, (teamForm?.mapWinRate ?? 0.5) + scoreDelta * 0.15)),
          averageRoundDiff: Math.round(scoreDelta * 20),
          favoriteMapsJson: json(favoriteMaps),
          weakMapsJson: json(weakMaps),
          styleAdvantageScore: Math.max(0, Math.min(1, 0.5 + scoreDelta)),
          awpMatchupScore: Math.max(0, Math.min(1, 0.5 + ((teamForm?.roundWinRate ?? 0.5) - (opponentForm?.roundWinRate ?? 0.5)))),
          entryMatchupScore: Math.max(0, Math.min(1, 0.5 + ((teamForm?.formScore ?? 0.5) - (opponentForm?.formScore ?? 0.5)))),
          vetoPunishScore: Math.max(0, Math.min(1, 0.42 + (opponentMaps.length - maps.length) * 0.03)),
          overtimeMatchupScore: Math.max(0, Math.min(1, 0.5 + ((teamForm?.comebackFrom3RoundDeficit ?? 0.5) - (opponentForm?.comebackFrom3RoundDeficit ?? 0.5)))),
          closingMatchupScore: Math.max(0, Math.min(1, 0.5 + ((teamForm?.closeOutRate ?? 0.5) - (opponentForm?.closeOutRate ?? 0.5)))),
          confidenceScore: Math.max(0.28, Math.min(0.86, maps.length / 9 + (teamForm?.matchesPlayed ?? 0) / 80))
        },
        update: {
          mapsPlayed: maps.reduce((sum, map) => sum + map.mapsPlayed, 0),
          favoriteMapsJson: json(favoriteMaps),
          weakMapsJson: json(weakMaps)
        }
      });
      created += 1;
    }
  }
  return created;
}

export async function buildTeamStyleSnapshots() {
  const teams = await prisma.team.findMany();
  let created = 0;
  for (const team of teams) {
    const form = await prisma.teamFormSnapshot.findFirst({ where: { teamId: team.id }, orderBy: { createdAt: "desc" } });
    const maps = await prisma.teamMapStat.findMany({ where: { teamId: team.id } });
    const mapAverage = (selector: (value: (typeof maps)[number]) => number) =>
      maps.length ? maps.reduce((sum, map) => sum + selector(map), 0) / maps.length : 0.5;
    await prisma.teamStyleSnapshot.upsert({
      where: { id: `style_${team.id}` },
      create: {
        id: `style_${team.id}`,
        teamId: team.id,
        period: "last_90_days",
        aggressionScore: mapAverage((map) => map.openingRoundPerformance),
        defaultHeavyScore: 1 - mapAverage((map) => map.pickRate) * 0.35,
        executeHeavyScore: mapAverage((map) => map.tRoundWinRate),
        awpDependencyScore: 0.48 + ((team.internalElo % 80) / 400),
        entryDependencyScore: mapAverage((map) => map.openingRoundPerformance),
        pistolDependencyScore: mapAverage((map) => map.pistolWinRate),
        forceBuyStrength: mapAverage((map) => map.forceBuyWinRate),
        ctSideStrength: mapAverage((map) => map.ctRoundWinRate),
        tSideStrength: mapAverage((map) => map.tRoundWinRate),
        retakeStrength: mapAverage((map) => map.clutchInOvertimeScore),
        clutchStrength: form?.mapPointConversion ?? 0.5,
        tempoScore: form?.formScore ?? 0.5,
        volatilityScore: form?.volatilityScore ?? 0.5
      },
      update: {
        aggressionScore: mapAverage((map) => map.openingRoundPerformance),
        volatilityScore: form?.volatilityScore ?? 0.5
      }
    });
    created += 1;
  }
  return created;
}

export async function buildPredictionDataWindows() {
  const matches = await prisma.match.findMany();
  const latestMeta = await prisma.gameMetaVersion.findFirst({ orderBy: { patchDate: "desc" } });
  const activePool = await prisma.activeMapPoolVersion.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
  const windowTypes = ["last_30_days", "last_90_days", "post_last_major_patch", "current_roster_only"] as const;
  let created = 0;
  for (const match of matches) {
    for (const teamId of [match.teamAId, match.teamBId]) {
      const roster = await prisma.teamRosterVersion.findFirst({ where: { teamId, endedAt: null }, orderBy: { startedAt: "desc" } });
      for (const windowType of windowTypes) {
        const startedAt =
          windowType === "last_30_days"
            ? addDays(match.startTime, -30)
            : windowType === "last_90_days"
              ? addDays(match.startTime, -90)
              : windowType === "post_last_major_patch"
                ? latestMeta?.patchDate ?? addDays(match.startTime, -60)
                : roster?.startedAt ?? addDays(match.startTime, -45);
        const form = await prisma.teamFormSnapshot.findFirst({ where: { teamId }, orderBy: { createdAt: "desc" } });
        await prisma.predictionDataWindow.upsert({
          where: { id: `window_${match.id}_${teamId}_${windowType}` },
          create: {
            id: `window_${match.id}_${teamId}_${windowType}`,
            matchId: match.id,
            teamId,
            windowType,
            startedAt,
            endedAt: match.startTime,
            rosterVersionId: roster?.id,
            gameMetaVersionId: latestMeta?.id,
            mapPoolVersionId: activePool?.id,
            matchesCount: form?.matchesPlayed ?? 0,
            mapsCount: form?.mapsPlayed ?? 0,
            dataQualityScore: match.dataQualityScore,
            relevanceScore: windowType === "current_roster_only" ? roster?.coreStabilityScore ?? 0.5 : windowType === "post_last_major_patch" ? 0.76 : 0.62,
            summaryJson: json({ windowType, source: "snapshot-builder", note: "Derived MVP 0.3 data window." })
          },
          update: {
            endedAt: match.startTime,
            dataQualityScore: match.dataQualityScore
          }
        });
        created += 1;
      }
    }
  }
  return created;
}

export async function rebuildSnapshots() {
  const [teamForms, basicResults, playerStats, mapStats, vetoPatterns, styles, matchups, windows, elo] = await Promise.all([
    buildTeamFormSnapshots(),
    buildTeamBasicResultSnapshots(),
    buildPlayerStatSnapshots(),
    buildTeamMapStats(),
    buildVetoPatterns(),
    buildTeamStyleSnapshots(),
    buildOpponentMatchupProfiles(),
    buildPredictionDataWindows(),
    updateInternalEloForFinishedMatches()
  ]);
  const newsImpacts = await rebuildNewsImpactSnapshots();
  const featureSnapshots = await rebuildMatchFeatureSnapshots();
  return { teamForms, basicResults, playerStats, mapStats, vetoPatterns, styles, matchups, windows, elo, newsImpacts, featureSnapshots };
}

export async function savePredictionAudit(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const savedPrediction = await prisma.prediction.create({
    data: {
      matchId,
      modelVersion: prediction.modelVersion,
      teamAProbability: prediction.teamAProbability,
      teamBProbability: prediction.teamBProbability,
      predictedWinnerId: prediction.predictedWinnerId,
      confidenceScore: prediction.confidenceScore,
      riskLevel: prediction.riskLevel,
      dataQualityScore: prediction.dataQualityScore,
      explanation: prediction.explanation,
      warningsJson: json(prediction.warnings)
    }
  });
  const audit = await prisma.predictionAudit.create({
    data: {
      predictionId: savedPrediction.id,
      matchId,
      modelVersion: prediction.modelVersion,
      inputSnapshotJson: json(input),
      factorOutputJson: json(prediction.factors),
      finalProbabilityJson: json({
        teamAProbability: prediction.teamAProbability,
        teamBProbability: prediction.teamBProbability,
        confidenceScore: prediction.confidenceScore,
        riskLevel: prediction.riskLevel
      }),
      warningsJson: json(prediction.warnings)
    }
  });
  await saveMatchFeatureSnapshot(matchId);
  await saveNewsImpactSnapshot(matchId);
  return audit;
}

export async function runPredictionsForUpcomingMatches() {
  const matches = await prisma.match.findMany({ where: { status: "upcoming" }, orderBy: { startTime: "asc" } });
  for (const match of matches) {
    await savePredictionAudit(match.id);
  }
  return matches.length;
}
