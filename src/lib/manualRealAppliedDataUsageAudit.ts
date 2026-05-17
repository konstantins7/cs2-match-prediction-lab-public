import { getEffectiveRank } from "./proFocus";
import { prisma } from "./prisma";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { calculatePrediction } from "./prediction/calculatePrediction";
import type { PredictionInput } from "./prediction/types";
import { calculateManualRealPackQualityForInput } from "./realForecast";
import { isPreMatchUsableDataRole, parseEvidenceDate } from "./realData/dataRole";
import { MANUAL_REAL_MAP_SAMPLE_THRESHOLD, manualRealMapSampleWarning } from "./manualRealReadinessRules";

type InclusionContext = {
  matchId: string;
  matchTeamIds: string[];
  cutoff: Date;
};

export type ManualRealAuditedRecord = {
  recordType: "Player" | "PlayerStatSnapshot" | "TeamMapStat" | "VetoPattern" | "TeamFormSnapshot" | "HeadToHead" | "NewsItem";
  id: string;
  label: string;
  matchId: string | null;
  teamId: string | null;
  playerId?: string | null;
  source: string | null;
  sourceMode: string | null;
  dataRole: string | null;
  isActive: boolean | null;
  sourceRecordId: string | null;
  importBatchId: string | null;
  dataLeakageCheckPassed: boolean | null;
  sourceDate: string | null;
  collectedAt: string | null;
  sampleSize: number | null;
  confidence: number | null;
  included: boolean;
  reasons: string[];
};

export type ManualRealAppliedDataUsageAudit = {
  matchId: string;
  appliedRecordsVisibleToPredictionBuilder: boolean;
  rootCause: string;
  previewMismatchRootCause: string;
  counts: Record<string, number>;
  teamLinking: {
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    duplicateTeamNames: string[];
    scopedPlayersWrongTeam: number;
  };
  mapSamples: {
    teamA: { teamName: string; mapsPlayed: number; required: number; complete: boolean };
    teamB: { teamName: string; mapsPlayed: number; required: number; complete: boolean };
  };
  readinessGates: {
    fixturePresent: boolean;
    rankPresent: boolean;
    basicHistoryPresent: boolean;
    rosterPresent: boolean;
    playerStatsPresent: boolean;
    mapStatsPresent: boolean;
    vetoPresent: boolean;
    teamFormPresent: boolean;
    h2hPresent: boolean;
    newsPresent: boolean;
    dataQuality: number;
    readiness: string;
    realForecastReady: boolean;
    manualRealPackQuality: number;
    manualRealPackCanReachL3: boolean;
  };
  records: ManualRealAuditedRecord[];
  warnings: string[];
  nextMinimalSafeAction: string;
};

function dateString(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function evidenceAfterCutoff(value: Date | string | null | undefined, cutoff: Date) {
  const parsed = parseEvidenceDate(value ?? null);
  return Boolean(parsed && parsed.getTime() > cutoff.getTime());
}

export function auditForecastRecordInclusion(
  row: {
    matchId?: string | null;
    teamId?: string | null;
    source?: string | null;
    sourceMode?: string | null;
    dataRole?: string | null;
    isActive?: boolean | null;
    sourceRecordId?: string | null;
    importBatchId?: string | null;
    dataLeakageCheckPassed?: boolean | null;
    sourceDate?: Date | string | null;
    collectedAt?: Date | string | null;
    needsReview?: boolean | null;
  },
  context: InclusionContext
) {
  const reasons: string[] = [];
  if (row.matchId && row.matchId !== context.matchId) reasons.push("wrong matchId");
  if (row.teamId && !context.matchTeamIds.includes(row.teamId)) reasons.push("wrong teamId");
  if (row.isActive === false) reasons.push("inactive");
  if (row.source === "analyst_sample" || row.sourceMode === "analyst_sample") reasons.push("sample evidence is not live real evidence");
  if (row.dataRole && !isPreMatchUsableDataRole(row.dataRole)) reasons.push("dataRole not allowed for pre-match evidence");
  if (row.dataLeakageCheckPassed === false) reasons.push("leakage failed");
  if (evidenceAfterCutoff(row.sourceDate ?? row.collectedAt, context.cutoff)) reasons.push("after cutoff");
  if (!row.sourceRecordId) reasons.push("missing sourceRecordId");
  if (!row.importBatchId) reasons.push("missing importBatchId");
  if (row.needsReview) reasons.push("needs_review");
  return { included: reasons.length === 0, reasons };
}

function rankPresent(input: PredictionInput) {
  const rankA = getEffectiveRank(input.teamA).rank;
  const rankB = getEffectiveRank(input.teamB).rank;
  return Boolean((rankA && rankA <= 100) || (rankB && rankB <= 100));
}

function mapSample(rows: PredictionInput["mapStatsA"]) {
  return rows.reduce((sum, row) => sum + row.mapsPlayed, 0);
}

function buildGateSummary(input: PredictionInput) {
  const manualQuality = calculateManualRealPackQualityForInput(input);
  const mapSampleA = mapSample(input.mapStatsA);
  const mapSampleB = mapSample(input.mapStatsB);
  return {
    manualQuality,
    mapSampleA,
    mapSampleB,
    fixturePresent: Boolean(input.match.id && input.teamA.id && input.teamB.id),
    rankPresent: rankPresent(input),
    basicHistoryPresent: Boolean((input.basicResultA?.matchesPlayed ?? 0) > 0 || (input.basicResultB?.matchesPlayed ?? 0) > 0),
    rosterPresent: input.playersA.length >= 5 && input.playersB.length >= 5,
    playerStatsPresent: input.playerStatsA.length >= 5 && input.playerStatsB.length >= 5,
    mapStatsPresent: mapSampleA >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD && mapSampleB >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD,
    vetoPresent: input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0,
    teamFormPresent: Boolean(input.teamFormA || input.teamFormB),
    h2hPresent: input.h2h.length > 0,
    newsPresent: input.news.length > 0 || input.rosterEventsA.length > 0 || input.rosterEventsB.length > 0
  };
}

function firstLowMapSample(teamAName: string, sampleA: number, teamBName: string, sampleB: number) {
  if (sampleA < MANUAL_REAL_MAP_SAMPLE_THRESHOLD) return { teamName: teamAName, sample: sampleA };
  if (sampleB < MANUAL_REAL_MAP_SAMPLE_THRESHOLD) return { teamName: teamBName, sample: sampleB };
  return null;
}

function recordAudit(
  recordType: ManualRealAuditedRecord["recordType"],
  row: {
    id: string;
    label: string;
    matchId?: string | null;
    teamId?: string | null;
    playerId?: string | null;
    source?: string | null;
    sourceMode?: string | null;
    dataRole?: string | null;
    isActive?: boolean | null;
    sourceRecordId?: string | null;
    importBatchId?: string | null;
    dataLeakageCheckPassed?: boolean | null;
    sourceDate?: Date | string | null;
    collectedAt?: Date | string | null;
    sampleSize?: number | null;
    confidence?: number | null;
    needsReview?: boolean | null;
  },
  context: InclusionContext
): ManualRealAuditedRecord {
  const inclusion = auditForecastRecordInclusion(row, context);
  return {
    recordType,
    id: row.id,
    label: row.label,
    matchId: row.matchId ?? null,
    teamId: row.teamId ?? null,
    playerId: row.playerId ?? null,
    source: row.source ?? null,
    sourceMode: row.sourceMode ?? null,
    dataRole: row.dataRole ?? null,
    isActive: row.isActive ?? null,
    sourceRecordId: row.sourceRecordId ?? null,
    importBatchId: row.importBatchId ?? null,
    dataLeakageCheckPassed: row.dataLeakageCheckPassed ?? null,
    sourceDate: dateString(row.sourceDate),
    collectedAt: dateString(row.collectedAt),
    sampleSize: row.sampleSize ?? null,
    confidence: row.confidence ?? null,
    included: inclusion.included,
    reasons: inclusion.reasons
  };
}

export async function buildManualRealAppliedDataUsageAudit(matchId: string): Promise<ManualRealAppliedDataUsageAudit> {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  const context: InclusionContext = {
    matchId,
    matchTeamIds: [input.teamA.id, input.teamB.id],
    cutoff: new Date(input.match.startTime)
  };
  const [externalSourceRecords, players, playerStats, mapStats, vetoPatterns, teamForms, headToHead, newsItems, duplicateTeams] = await Promise.all([
    prisma.externalSourceRecord.findMany({ where: { entityId: matchId } }),
    prisma.player.findMany({ where: { matchId } }),
    prisma.playerStatSnapshot.findMany({ where: { matchId }, include: { player: true } }),
    prisma.teamMapStat.findMany({ where: { matchId } }),
    prisma.vetoPattern.findMany({ where: { matchId } }),
    prisma.teamFormSnapshot.findMany({ where: { matchId } }),
    prisma.headToHead.findMany({ where: { matchId } }),
    prisma.newsItem.findMany({ where: { matchId } }),
    prisma.team.findMany({ where: { name: { in: [input.teamA.name, input.teamB.name] } }, select: { id: true, name: true } })
  ]);
  const gates = buildGateSummary(input);
  const records: ManualRealAuditedRecord[] = [
    ...players.map((row) => recordAudit("Player", {
      id: row.id,
      label: row.nickname,
      matchId: row.matchId,
      teamId: row.teamId,
      sourceMode: row.sourceMode,
      isActive: row.isActive,
      sourceRecordId: row.sourceRecordId,
      importBatchId: row.importBatchId,
      confidence: row.sourceConfidence,
      needsReview: row.needsReview
    }, context)),
    ...playerStats.map((row) => recordAudit("PlayerStatSnapshot", {
      id: row.id,
      label: row.player.nickname,
      matchId: row.matchId,
      teamId: row.teamId,
      playerId: row.playerId,
      source: row.source,
      sourceMode: row.sourceMode,
      dataRole: row.dataRole,
      isActive: row.isActive,
      sourceRecordId: row.sourceRecordId,
      importBatchId: row.importBatchId,
      dataLeakageCheckPassed: row.dataLeakageCheckPassed,
      sourceDate: row.sourceDate,
      collectedAt: row.collectedAt,
      sampleSize: row.maps
    }, context)),
    ...mapStats.map((row) => recordAudit("TeamMapStat", {
      id: row.id,
      label: row.mapName,
      matchId: row.matchId,
      teamId: row.teamId,
      source: row.source,
      sourceMode: row.sourceMode,
      dataRole: row.dataRole,
      isActive: row.isActive,
      sourceRecordId: row.sourceRecordId,
      importBatchId: row.importBatchId,
      dataLeakageCheckPassed: row.dataLeakageCheckPassed,
      sourceDate: row.sourceDate,
      collectedAt: row.collectedAt,
      sampleSize: row.mapsPlayed,
      confidence: row.sampleQuality
    }, context)),
    ...vetoPatterns.map((row) => recordAudit("VetoPattern", {
      id: row.id,
      label: row.mapName,
      matchId: row.matchId,
      teamId: row.teamId,
      source: row.source,
      sourceMode: row.sourceMode,
      dataRole: row.dataRole,
      isActive: row.isActive,
      sourceRecordId: row.sourceRecordId,
      importBatchId: row.importBatchId,
      dataLeakageCheckPassed: row.dataLeakageCheckPassed,
      sourceDate: row.sourceDate,
      collectedAt: row.collectedAt,
      confidence: row.confidenceScore
    }, context)),
    ...teamForms.map((row) => recordAudit("TeamFormSnapshot", {
      id: row.id,
      label: row.period,
      matchId: row.matchId,
      teamId: row.teamId,
      source: row.source,
      sourceMode: row.sourceMode,
      dataRole: row.dataRole,
      isActive: row.isActive,
      sourceRecordId: row.sourceRecordId,
      importBatchId: row.importBatchId,
      dataLeakageCheckPassed: row.dataLeakageCheckPassed,
      sourceDate: row.sourceDate,
      collectedAt: row.collectedAt,
      sampleSize: row.mapsPlayed
    }, context))
  ];
  const duplicateTeamNames = [input.teamA.name, input.teamB.name].filter((name) => duplicateTeams.filter((team) => team.name === name).length > 1);
  const scopedPlayersWrongTeam = players.filter((player) => !player.teamId || !context.matchTeamIds.includes(player.teamId)).length;
  const lowMapSample = firstLowMapSample(input.teamA.name, gates.mapSampleA, input.teamB.name, gates.mapSampleB);
  const warnings = [
    !gates.mapStatsPresent
      ? [
          gates.mapSampleA < MANUAL_REAL_MAP_SAMPLE_THRESHOLD ? manualRealMapSampleWarning(input.teamA.name, gates.mapSampleA) : "",
          gates.mapSampleB < MANUAL_REAL_MAP_SAMPLE_THRESHOLD ? manualRealMapSampleWarning(input.teamB.name, gates.mapSampleB) : ""
        ].filter(Boolean).join(" ")
      : "",
    prediction.readiness.level === "L0_FIXTURE_ONLY" ? "Final readiness remains L0 because final gates require rank/basic context or complete roster/player/map/veto analytical coverage." : ""
  ].filter(Boolean);

  return {
    matchId,
    appliedRecordsVisibleToPredictionBuilder: input.playersA.length + input.playersB.length + input.playerStatsA.length + input.playerStatsB.length + input.mapStatsA.length + input.mapStatsB.length + input.vetoPatternsA.length + input.vetoPatternsB.length > 0,
    rootCause: gates.mapStatsPresent || !lowMapSample
      ? "Applied manual_real records are visible; remaining readiness blockers are outside map sample coverage."
      : `${lowMapSample.teamName} map sample = ${lowMapSample.sample}/${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}, so mapStatsComplete=false.`,
    previewMismatchRootCause: "Preview used block-level validity while final rebuild uses per-team sample gates.",
    counts: {
      ExternalSourceRecord: externalSourceRecords.length,
      Player: players.length,
      PlayerStatSnapshot: playerStats.length,
      TeamMapStat: mapStats.length,
      VetoPattern: vetoPatterns.length,
      TeamFormSnapshot: teamForms.length,
      HeadToHead: headToHead.length,
      NewsItem: newsItems.length
    },
    teamLinking: {
      teamA: { id: input.teamA.id, name: input.teamA.name },
      teamB: { id: input.teamB.id, name: input.teamB.name },
      duplicateTeamNames,
      scopedPlayersWrongTeam
    },
    mapSamples: {
      teamA: { teamName: input.teamA.name, mapsPlayed: gates.mapSampleA, required: MANUAL_REAL_MAP_SAMPLE_THRESHOLD, complete: gates.mapSampleA >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD },
      teamB: { teamName: input.teamB.name, mapsPlayed: gates.mapSampleB, required: MANUAL_REAL_MAP_SAMPLE_THRESHOLD, complete: gates.mapSampleB >= MANUAL_REAL_MAP_SAMPLE_THRESHOLD }
    },
    readinessGates: {
      fixturePresent: gates.fixturePresent,
      rankPresent: gates.rankPresent,
      basicHistoryPresent: gates.basicHistoryPresent,
      rosterPresent: gates.rosterPresent,
      playerStatsPresent: gates.playerStatsPresent,
      mapStatsPresent: gates.mapStatsPresent,
      vetoPresent: gates.vetoPresent,
      teamFormPresent: gates.teamFormPresent,
      h2hPresent: gates.h2hPresent,
      newsPresent: gates.newsPresent,
      dataQuality: prediction.dataQualityScore,
      readiness: prediction.readiness.level,
      realForecastReady: prediction.realForecast.isReady,
      manualRealPackQuality: gates.manualQuality.score,
      manualRealPackCanReachL3: gates.manualQuality.canReachL3
    },
    records,
    warnings,
    nextMinimalSafeAction: `Prepare map_stats.csv v3 only from real source-visible ${lowMapSample?.teamName ?? input.teamA.name} active-pool maps until map sample reaches ${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}/${MANUAL_REAL_MAP_SAMPLE_THRESHOLD}.`
  };
}
