import { prisma } from "./prisma";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { hashRawRecord, saveExternalSourceRecord } from "./sources/sourceReconciler";
import { rebuildSnapshots, savePredictionAudit } from "./sources/sourceScheduler";
import { refreshResearchPack } from "./researchQueue";
import { sourceModeForSource, type SourceName } from "./sources/types";

export { manualEnrichmentTemplates } from "./manualEnrichmentTemplates";

const activeMapsFallback = ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Train"];

type Preview = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  creates: string[];
  updates: string[];
  matchId?: string;
  type?: string;
  sourceMode?: "manual_real" | "analyst_sample";
  importBatchId?: string;
  realActionable?: boolean;
  pipelineProof?: boolean;
};

type EnrichmentMetadata = {
  isSample: boolean;
  source: "manual" | "analyst-sample";
  recordSource: "manual_enrichment" | "analyst_sample";
  playerSourceMode: "manual_real" | "analyst_sample";
  importBatchId: string;
  sourceRecordId: string;
  matchId: string;
};

type MatchTeams = Awaited<ReturnType<typeof matchTeams>>;

function analystSampleEnabled() {
  return process.env.ENABLE_ANALYST_SAMPLE === "true";
}

function isSamplePayload(payload: Record<string, unknown>) {
  return payload.type === "analyst_pack" || payload.source === "analyst_sample" || payload.source === "manual_sample";
}

function record(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value: unknown, fallback = 0.5) {
  const parsed = num(value, fallback);
  return parsed > 1 ? parsed / 100 : parsed;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parsePayload(text: string) {
  if (!text.trim()) throw new Error("JSON payload is empty.");
  return JSON.parse(text) as Record<string, unknown>;
}

function typedSourceMode(source: string) {
  const known: SourceName[] = ["grid", "pandascore", "liquipedia", "valve-rankings", "cs-updates", "faceit", "parsed-demo", "analyst-sample", "manual", "mock", "official-future"];
  return known.includes(source as SourceName) ? sourceModeForSource(source as SourceName) : "partial";
}

function sourceScope(meta: EnrichmentMetadata) {
  return meta.isSample
    ? {
        source: meta.recordSource,
        matchId: meta.matchId,
        importBatchId: meta.importBatchId,
        sourceRecordId: meta.sourceRecordId,
        isActive: true
      }
    : {
        source: meta.recordSource,
        matchId: null,
        importBatchId: meta.importBatchId,
        sourceRecordId: meta.sourceRecordId,
        isActive: true
      };
}

async function activeMaps() {
  const pool = await prisma.activeMapPoolVersion.findFirst({ where: { endedAt: null }, orderBy: { startedAt: "desc" } });
  if (!pool) return activeMapsFallback;
  try {
    const parsed = JSON.parse(pool.mapsJson);
    return Array.isArray(parsed) ? parsed.map(String) : activeMapsFallback;
  } catch {
    return activeMapsFallback;
  }
}

async function matchTeams(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { teamA: true, teamB: true } });
  if (!match) return null;
  return {
    match,
    teams: [match.teamA, match.teamB],
    byName: new Map([match.teamA, match.teamB].map((team) => [team.name.toLowerCase(), team]))
  };
}

function resolveTeamName(teams: MatchTeams, teamName: unknown) {
  if (!teams || typeof teamName !== "string") return null;
  const normalized = teamName.toLowerCase();
  return teams.byName.get(normalized) ?? teams.teams.find((team) => team.slug === slug(teamName)) ?? null;
}

function analystPackSections(payload: Record<string, unknown>) {
  return {
    rosters: record(payload.rosters),
    playerStats: rows(payload.playerStats),
    mapStats: rows(payload.mapStats),
    vetoHistory: rows(payload.vetoHistory),
    h2h: rows(payload.h2h),
    news: rows(payload.news)
  };
}

export async function validateManualEnrichment(text: string): Promise<Preview> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const creates: string[] = [];
  const updates: string[] = [];
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(text);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "Invalid JSON."], warnings, creates, updates };
  }

  const matchId = typeof payload.matchId === "string" ? payload.matchId : "";
  const type = typeof payload.type === "string" ? payload.type : "";
  const sample = isSamplePayload(payload);
  const sourceMode = sample ? "analyst_sample" : "manual_real";
  const importBatchId = sample ? `sample_${matchId || "unknown"}_${hashRawRecord(payload).slice(0, 12)}` : `manual_${matchId || "unknown"}_${hashRawRecord(payload).slice(0, 12)}`;

  if (sample && !analystSampleEnabled()) errors.push("ENABLE_ANALYST_SAMPLE=false: sample analyst pack is disabled.");
  if (!matchId) errors.push("matchId is required.");
  if (!type) errors.push("type is required.");
  const teams = matchId ? await matchTeams(matchId) : null;
  if (!teams) errors.push(`Match not found: ${matchId}`);
  const maps = await activeMaps();

  if (type === "analyst_pack") {
    const sections = analystPackSections(payload);
    if (!Object.keys(sections.rosters).length) errors.push("analyst_pack.rosters is required.");
    if (sections.playerStats.length < 10) errors.push("analyst_pack.playerStats should include both five-player rosters.");
    if (sections.mapStats.length < 2) errors.push("analyst_pack.mapStats is required for both teams.");
    if (sections.vetoHistory.length < 2) errors.push("analyst_pack.vetoHistory is required for both teams.");
    for (const [teamName, players] of Object.entries(sections.rosters)) {
      if (!resolveTeamName(teams, teamName)) warnings.push(`Team ${teamName} is not matched for this match; needs_review candidate required.`);
      if (!Array.isArray(players) || players.length < 5) errors.push(`Roster for ${teamName} must include five player names.`);
      else creates.push(`${players.length} analyst_sample roster/player links for ${teamName}`);
    }
    for (const player of sections.playerStats) {
      if (!resolveTeamName(teams, player.team)) warnings.push(`Team ${String(player.team)} is not matched for this match.`);
      for (const field of ["kd", "rating", "adr", "kast", "impact", "maps"]) {
        if (!Number.isFinite(Number(player[field]))) errors.push(`analyst_pack playerStats ${field} must be numeric.`);
      }
    }
    for (const row of [...sections.mapStats, ...sections.vetoHistory]) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
    }
    creates.push(`${sections.playerStats.length} analyst_sample PlayerStatSnapshot records scoped to ${matchId}`);
    creates.push(`${sections.mapStats.length} analyst_sample TeamMapStat records scoped to ${matchId}`);
    creates.push(`${sections.vetoHistory.length} analyst_sample VetoPattern records scoped to ${matchId}`);
    creates.push(`${sections.h2h.length} analyst_sample HeadToHead records scoped to ${matchId}`);
    creates.push(`${sections.news.length} analyst_sample NewsItem records scoped to ${matchId}`);
  } else if (type === "roster") {
    for (const [teamName, players] of Object.entries(record(payload.teams))) {
      if (!resolveTeamName(teams, teamName)) warnings.push(`Team ${teamName} is not matched for this match; needs_review candidate required.`);
      if (!Array.isArray(players) || players.some((player) => typeof player !== "string" || !player.trim())) errors.push(`Roster for ${teamName} must be non-empty player names.`);
      else creates.push(`${players.length} manual_real roster/player links for ${teamName}`);
    }
  } else if (type === "player_stats") {
    const players = rows(payload.players);
    if (!players.length) errors.push("players[] is required for player_stats.");
    for (const player of players) {
      if (!resolveTeamName(teams, player.team)) warnings.push(`Team ${String(player.team)} is not matched for this match.`);
      if (!player.nickname) errors.push("player_stats nickname is required.");
      for (const field of ["kd", "rating", "adr", "kast", "impact", "maps"]) {
        if (!Number.isFinite(Number(player[field]))) errors.push(`player_stats ${field} must be numeric.`);
      }
      creates.push(`PlayerStatSnapshot for ${String(player.nickname)}`);
    }
  } else if (type === "map_stats") {
    const entries = rows(payload.teams);
    if (!entries.length) errors.push("teams[] is required for map_stats.");
    for (const row of entries) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
      for (const field of ["mapsPlayed", "winRate", "pickRate", "banRate", "ctRoundWinRate", "tRoundWinRate"]) {
        if (!Number.isFinite(Number(row[field]))) errors.push(`map_stats ${field} must be numeric.`);
      }
      creates.push(`TeamMapStat ${String(row.team)} ${String(row.mapName)}`);
    }
  } else if (type === "veto_history") {
    const entries = rows(payload.teams);
    if (!entries.length) errors.push("teams[] is required for veto_history.");
    for (const row of entries) {
      if (!resolveTeamName(teams, row.team)) warnings.push(`Team ${String(row.team)} is not matched for this match.`);
      if (!maps.includes(String(row.mapName))) errors.push(`mapName ${String(row.mapName)} is not in active map pool.`);
      creates.push(`VetoPattern ${String(row.team)} ${String(row.mapName)}`);
    }
  } else if (type === "h2h") {
    const entries = rows(payload.entries);
    if (!entries.length) errors.push("entries[] is required for h2h.");
    creates.push(`${entries.length} HeadToHead entries`);
  } else if (type === "news") {
    const entries = rows(payload.items);
    if (!entries.length) errors.push("items[] is required for news.");
    creates.push(`${entries.length} NewsItem records`);
  } else if (type === "parsed_demo") {
    creates.push("Parsed demo raw record plus any included player/map/form snapshots");
  } else {
    errors.push(`Unsupported enrichment type: ${type}`);
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    creates,
    updates,
    matchId,
    type,
    sourceMode,
    importBatchId,
    realActionable: !sample,
    pipelineProof: sample
  };
}

async function saveRaw(payload: Record<string, unknown>, status: "valid" | "invalid", meta: Omit<EnrichmentMetadata, "sourceRecordId">) {
  const matchId = meta.matchId;
  const type = String(payload.type ?? "unknown");
  const raw = {
    ...payload,
    importStatus: status,
    importBatchId: meta.importBatchId,
    sourceMode: meta.playerSourceMode,
    importedAt: new Date().toISOString()
  };
  return saveExternalSourceRecord(prisma, {
    source: meta.source,
    entityType: status === "valid" ? `${meta.playerSourceMode}_${type}` : `${meta.playerSourceMode}_invalid`,
    externalId: `${meta.importBatchId}_${hashRawRecord(raw).slice(0, 16)}`,
    entityId: matchId,
    raw,
    fetchedAt: new Date(),
    sourceConfidence: status === "valid" ? (meta.isSample ? 0.66 : 0.72) : 0.2
  });
}

async function findOrCreatePlayer(teamId: string, nickname: string, meta: EnrichmentMetadata) {
  const existing = await prisma.player.findFirst({
    where: meta.isSample
      ? { teamId, nickname, sourceMode: "analyst_sample", matchId: meta.matchId }
      : { teamId, nickname }
  });
  if (existing) {
    if (meta.isSample && !existing.isActive) {
      return prisma.player.update({
        where: { id: existing.id },
        data: { isActive: true, importBatchId: meta.importBatchId, sourceRecordId: meta.sourceRecordId }
      });
    }
    return existing;
  }
  return prisma.player.create({
    data: {
      id: `${meta.isSample ? "sample" : "manual"}_player_${slug(teamId)}_${slug(nickname)}_${hashRawRecord({ teamId, nickname, matchId: meta.isSample ? meta.matchId : "" }).slice(0, 8)}`,
      nickname,
      teamId,
      role: "unknown",
      country: "unknown",
      sourceMode: meta.playerSourceMode,
      sourceConfidence: meta.isSample ? 0.66 : 0.72,
      needsReview: false,
      matchId: meta.isSample ? meta.matchId : null,
      importBatchId: meta.importBatchId,
      sourceRecordId: meta.sourceRecordId,
      isActive: true
    }
  });
}

async function applyRoster(teams: NonNullable<MatchTeams>, teamPlayers: Record<string, unknown>, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const [teamName, players] of Object.entries(teamPlayers)) {
    const team = resolveTeamName(teams, teamName);
    if (!team || !Array.isArray(players)) continue;
    for (const nickname of players.map(String)) await findOrCreatePlayer(team.id, nickname, meta);
    changed.push(`${meta.playerSourceMode} roster imported for ${team.name}`);
  }
  return changed;
}

async function applyPlayerStats(teams: NonNullable<MatchTeams>, playerRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of playerRows) {
    const team = resolveTeamName(teams, row.team);
    if (!team || typeof row.nickname !== "string") continue;
    const player = await findOrCreatePlayer(team.id, row.nickname, meta);
    await prisma.playerStatSnapshot.create({
      data: {
        playerId: player.id,
        teamId: team.id,
        period,
        maps: Math.round(num(row.maps, 1)),
        rounds: Math.round(num(row.rounds, num(row.maps, 1) * 24)),
        kd: num(row.kd, 1),
        kdDiff: Math.round(num(row.kdDiff, 0)),
        rating: num(row.rating, 1),
        adr: num(row.adr, 70),
        kast: pct(row.kast, 0.7),
        impact: num(row.impact, 1),
        openingKillRating: num(row.openingKillRating, 1),
        clutchScore: pct(row.clutch, 0.5),
        volatilityScore: pct(row.volatility, 0.35),
        pressureScore: pct(row.pressurePerformance, 0.5),
        trendScore: num(row.ratingTrend, 0),
        ratingTrend: num(row.ratingTrend, 0),
        kdTrend: num(row.kdTrend, 0),
        adrTrend: num(row.adrTrend, 0),
        openingDuelTrend: num(row.openingDuelTrend, 0),
        clutchTrend: num(row.clutchTrend, 0),
        pressurePerformance: pct(row.pressurePerformance, 0.5),
        mapSpecificPerformance: pct(row.mapSpecificPerformance, 0.5),
        roleImpact: pct(row.roleImpact, 0.5),
        starDependency: pct(row.starDependency, 0.35),
        worstPlayerLiability: pct(row.worstPlayerLiability, 0.15),
        lanRating: num(row.lanRating, num(row.rating, 1)),
        onlineRating: num(row.onlineRating, num(row.rating, 1)),
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} PlayerStatSnapshot created for ${player.nickname}`);
  }
  return changed;
}

async function applyMapStats(teams: NonNullable<MatchTeams>, mapRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of mapRows) {
    const team = resolveTeamName(teams, row.team);
    if (!team) continue;
    await prisma.teamMapStat.create({
      data: {
        teamId: team.id,
        mapName: String(row.mapName),
        period,
        mapsPlayed: Math.round(num(row.mapsPlayed, 1)),
        winRate: pct(row.winRate, 0.5),
        pickRate: pct(row.pickRate, 0.1),
        banRate: pct(row.banRate, 0.1),
        firstPickRate: pct(row.firstPickRate, 0.08),
        deciderRate: pct(row.deciderRate, 0.1),
        ctRoundWinRate: pct(row.ctRoundWinRate, 0.5),
        tRoundWinRate: pct(row.tRoundWinRate, 0.5),
        pistolWinRate: pct(row.pistolWinRate, 0.5),
        conversionAfterPistolWin: pct(row.conversionAfterPistolWin, 0.58),
        forceBuyWinRate: pct(row.forceBuyWinRate, 0.3),
        antiEcoLossRate: pct(row.antiEcoLossRate, 0.08),
        overtimeWinRate: pct(row.overtimeWinRate, 0.5),
        multipleOvertimeWinRate: pct(row.multipleOvertimeWinRate, 0.4),
        overtimeFrequency: pct(row.overtimeFrequency, 0.08),
        pressureRoundWinRate: pct(row.pressureRoundWinRate, 0.5),
        clutchInOvertimeScore: pct(row.clutchInOvertimeScore, 0.5),
        closingScore: pct(row.closingScore, 0.5),
        comebackScore: pct(row.comebackScore, 0.5),
        ecoRecoveryScore: pct(row.ecoRecoveryScore, 0.5),
        resetResistanceScore: pct(row.resetResistanceScore, 0.5),
        recentTrend: num(row.recentTrend, 0),
        openingRoundPerformance: pct(row.openingRoundPerformance, 0.5),
        sampleQuality: Math.min(1, Math.max(0.15, num(row.mapsPlayed, 1) / 20)),
        sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} TeamMapStat created for ${team.name} ${String(row.mapName)}`);
  }
  return changed;
}

async function applyVeto(teams: NonNullable<MatchTeams>, vetoRows: Record<string, unknown>[], period: string, meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of vetoRows) {
    const team = resolveTeamName(teams, row.team);
    if (!team) continue;
    const opponentTeamId = team.id === teams.match.teamAId ? teams.match.teamBId : teams.match.teamAId;
    await prisma.vetoPattern.create({
      data: {
        teamId: team.id,
        opponentTeamId,
        format: teams.match.format,
        period,
        mapName: String(row.mapName),
        pickProbability: pct(row.pickRate, 0.1),
        banProbability: pct(row.banRate, 0.1),
        punishProbability: pct(row.punishProbability, 0.1),
        weaknessScore: pct(row.weaknessScore, 0.35),
        comfortScore: pct(row.comfortScore, 0.55),
        confidenceScore: Math.min(0.86, Math.max(0.25, num(row.sampleSize, 1) / 25)),
        ...sourceScope(meta)
      }
    });
    changed.push(`${meta.recordSource} VetoPattern created for ${team.name} ${String(row.mapName)}`);
  }
  return changed;
}

async function applyH2h(teams: NonNullable<MatchTeams>, h2hRows: Record<string, unknown>[], meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of h2hRows) {
    const winnerName = typeof row.winner === "string" ? row.winner.toLowerCase() : "";
    const winnerTeamId = winnerName === teams.match.teamA.name.toLowerCase() ? teams.match.teamAId : winnerName === teams.match.teamB.name.toLowerCase() ? teams.match.teamBId : null;
    await prisma.headToHead.create({
      data: {
        teamAId: teams.match.teamAId,
        teamBId: teams.match.teamBId,
        matchId: teams.match.id,
        date: row.date ? new Date(String(row.date)) : new Date(),
        format: String(row.format ?? teams.match.format),
        winnerTeamId,
        teamARosterSimilarity: pct(row.teamARosterSimilarity, 0.5),
        teamBRosterSimilarity: pct(row.teamBRosterSimilarity, 0.5),
        relevanceScore: pct(row.relevanceScore, 0.5),
        notes: typeof row.notes === "string" ? row.notes : meta.recordSource,
        source: meta.recordSource,
        importBatchId: meta.importBatchId,
        sourceRecordId: meta.sourceRecordId,
        isActive: true
      }
    });
    changed.push(`${meta.recordSource} HeadToHead entry created`);
  }
  return changed;
}

async function applyNews(teams: NonNullable<MatchTeams>, newsRows: Record<string, unknown>[], meta: EnrichmentMetadata) {
  const changed: string[] = [];
  for (const row of newsRows) {
    const team = resolveTeamName(teams, row.team);
    await prisma.newsItem.create({
      data: {
        teamId: team?.id ?? null,
        title: String(row.title ?? "Manual note"),
        summary: String(row.summary ?? ""),
        source: meta.recordSource,
        url: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
        publishedAt: row.publishedAt ? new Date(String(row.publishedAt)) : new Date(),
        reliability: String(row.reliability ?? "unknown"),
        eventType: String(row.eventType ?? "manual"),
        sentiment: num(row.impactScore, 0) >= 0 ? "positive" : "negative",
        impactScore: num(row.impactScore, 0),
        maxAllowedImpact: Math.min(12, Math.abs(num(row.maxAllowedImpact, 3))),
        isRumor: String(row.reliability ?? "").toLowerCase().includes("rumor"),
        isOfficial: String(row.reliability ?? "").toLowerCase() === "official",
        matchId: meta.matchId,
        importBatchId: meta.importBatchId,
        sourceRecordId: meta.sourceRecordId,
        isActive: true
      }
    });
    changed.push(`${meta.recordSource} NewsItem created for ${team?.name ?? "unknown team"}`);
  }
  return changed;
}

async function applyDomainRecords(payload: Record<string, unknown>, meta: EnrichmentMetadata) {
  const teams = await matchTeams(meta.matchId);
  if (!teams) return [];
  const changed: string[] = [];
  const type = String(payload.type);
  const period = String(payload.period ?? (meta.isSample ? "analyst_sample_pack" : "manual_enrichment"));

  if (type === "analyst_pack") {
    const sections = analystPackSections(payload);
    changed.push(...await applyRoster(teams, sections.rosters, meta));
    changed.push(...await applyPlayerStats(teams, sections.playerStats, "sample_last_30_days", meta));
    changed.push(...await applyMapStats(teams, sections.mapStats, "sample_last_90_days", meta));
    changed.push(...await applyVeto(teams, sections.vetoHistory, "sample_last_90_days", meta));
    changed.push(...await applyH2h(teams, sections.h2h, meta));
    changed.push(...await applyNews(teams, sections.news, meta));
  }
  if (type === "roster") changed.push(...await applyRoster(teams, record(payload.teams), meta));
  if (type === "player_stats") changed.push(...await applyPlayerStats(teams, rows(payload.players), period, meta));
  if (type === "map_stats") changed.push(...await applyMapStats(teams, rows(payload.teams), period, meta));
  if (type === "veto_history") changed.push(...await applyVeto(teams, rows(payload.teams), period, meta));
  if (type === "h2h") changed.push(...await applyH2h(teams, rows(payload.entries), meta));
  if (type === "news") changed.push(...await applyNews(teams, rows(payload.items), meta));
  if (type === "parsed_demo") changed.push("Parsed demo raw accepted; detailed parsed-demo adapter can transform richer payloads.");

  if (meta.isSample && changed.length) {
    await prisma.match.update({
      where: { id: meta.matchId },
      data: { sourceMode: "analyst_sample", sourceConfidence: 0.66 }
    });
    changed.push("Match marked analyst_sample for dev-only pipeline validation.");
  }

  return changed;
}

async function snapshot(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  return {
    readiness: prediction.readiness.level,
    dataQuality: prediction.dataQualityScore,
    confidence: prediction.confidenceScore,
    probability: `${prediction.teamAProbability}/${prediction.teamBProbability}`
  };
}

export async function applyManualEnrichment(text: string) {
  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(text);
  } catch (error) {
    return { ok: false, applied: false, errors: [error instanceof Error ? error.message : "Invalid JSON."], warnings: [], creates: [], updates: [] };
  }

  const validation = await validateManualEnrichment(text);
  const matchId = String(payload.matchId ?? "unknown");
  const isSample = isSamplePayload(payload);
  const baseMeta: Omit<EnrichmentMetadata, "sourceRecordId"> = {
    isSample,
    source: isSample ? "analyst-sample" : "manual",
    recordSource: isSample ? "analyst_sample" : "manual_enrichment",
    playerSourceMode: isSample ? "analyst_sample" : "manual_real",
    importBatchId: validation.importBatchId ?? `${isSample ? "sample" : "manual"}_${matchId}_${hashRawRecord(payload).slice(0, 12)}`,
    matchId
  };

  if (!validation.ok) {
    if (!isSample || analystSampleEnabled()) await saveRaw({ ...payload, validationErrors: validation.errors }, "invalid", baseMeta);
    return { ...validation, applied: false, readinessBefore: null, readinessAfter: null, whatChanged: [] };
  }

  const before = await snapshot(matchId);
  const raw = await saveRaw(payload, "valid", baseMeta);
  const meta: EnrichmentMetadata = { ...baseMeta, sourceRecordId: raw.record.id };
  const whatChanged = await applyDomainRecords(payload, meta);
  await rebuildSnapshots();
  await savePredictionAudit(matchId);
  await refreshResearchPack(matchId);
  const after = await snapshot(matchId);
  return {
    ...validation,
    applied: true,
    sourceRecordId: raw.record.id,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    dataQualityBefore: before.dataQuality,
    dataQualityAfter: after.dataQuality,
    confidenceBefore: before.confidence,
    confidenceAfter: after.confidence,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    sampleData: isSample,
    realActionable: !isSample,
    pipelineProof: isSample,
    whatChanged
  };
}

function restoreSourceMode(source: string) {
  return typedSourceMode(source);
}

export async function resetAnalystSampleForMatch(matchId: string) {
  const before = await snapshot(matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, errors: [`Match not found: ${matchId}`] };

  const [players, playerStats, mapStats, veto, h2h, news] = await prisma.$transaction([
    prisma.player.updateMany({ where: { sourceMode: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.playerStatSnapshot.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.teamMapStat.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.vetoPattern.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.headToHead.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } }),
    prisma.newsItem.updateMany({ where: { source: "analyst_sample", matchId }, data: { isActive: false } })
  ]);

  if (match.sourceMode === "analyst_sample") {
    await prisma.match.update({
      where: { id: matchId },
      data: { sourceMode: restoreSourceMode(match.source), sourceConfidence: Math.max(0.3, Math.min(0.9, match.sourceConfidence)) }
    });
  }

  await rebuildSnapshots();
  await savePredictionAudit(matchId);
  await refreshResearchPack(matchId);
  const after = await snapshot(matchId);

  return {
    ok: true,
    matchId,
    readinessBefore: before.readiness,
    readinessAfter: after.readiness,
    dataQualityBefore: before.dataQuality,
    dataQualityAfter: after.dataQuality,
    confidenceBefore: before.confidence,
    confidenceAfter: after.confidence,
    probabilityBefore: before.probability,
    probabilityAfter: after.probability,
    deactivated: {
      players: players.count,
      playerStats: playerStats.count,
      mapStats: mapStats.count,
      veto: veto.count,
      h2h: h2h.count,
      news: news.count
    },
    whatChanged: ["Only analyst_sample records for the selected match were deactivated.", "Manual real, parsed demo, PandaScore, Valve and other real records were untouched."]
  };
}
