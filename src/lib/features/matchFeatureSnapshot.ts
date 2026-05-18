import { prisma } from "../prisma";
import { buildPredictionInput, calculatePrediction, type PredictionInput } from "../predictionEngine";
import { RULE_BASED_MODEL_VERSION } from "../modelVersions";
import { calculateGlickoStyleUncertainty } from "../modelLab/ratings";
import { sourcePriorityByDataType, type SourceDataType } from "../sources/sourcePriority";
import { calculateNewsImpact } from "../news/newsImpact";
import { isPreMatchUsableDataRole } from "../realData/dataRole";

export const FEATURE_SCHEMA_VERSION = "mvp_0_9_0_feature_schema_v2";
export const FEATURE_MODEL_VERSION = RULE_BASED_MODEL_VERSION;

type DatedSource = {
  sourceMode: string;
  sourceRecordId?: string | null;
  sampleSize?: number | null;
  confidence?: number | null;
  date?: Date | string | null;
};

type FeatureLineage = Record<string, DatedSource & { freshnessDays: number | null; dataType: SourceDataType; [key: string]: unknown }>;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function dateOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function beforeOrAt(value: Date | string | null | undefined, cutoff: Date) {
  const parsed = dateOrNull(value);
  return !parsed || parsed.getTime() <= cutoff.getTime();
}

function freshnessDays(value: Date | string | null | undefined, cutoff: Date) {
  const parsed = dateOrNull(value);
  if (!parsed) return null;
  return Math.max(0, Math.round((cutoff.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000)));
}

function avg<T>(items: T[], selector: (item: T) => number, fallback = 0) {
  if (!items.length) return fallback;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function diff(a: number, b: number) {
  return Number((a - b).toFixed(4));
}

function rankScore(rank?: number | null) {
  if (!rank || rank > 200) return 0;
  return Math.max(0, 101 - rank);
}

function sourceModeFromRecord(record: { source?: string | null; sourceMode?: string | null } | undefined | null) {
  const source = record?.sourceMode ?? record?.source ?? "partial";
  if (source === "manual_enrichment") return "manual_real";
  if (source === "parsed_demo") return "parsed_demo";
  if (source === "analyst_sample") return "analyst_sample";
  if (source === "pandascore_free" || source === "pandascore") return "pandascore_free";
  if (source === "valve_rankings") return "valve_rankings";
  return source;
}

function bestRank(team: PredictionInput["teamA"], source: string, cutoff: Date) {
  const snapshots = (team.rankSnapshots ?? [])
    .filter((snapshot) => snapshot.source === source && beforeOrAt(snapshot.rankingDate, cutoff))
    .sort((a, b) => new Date(b.rankingDate).getTime() - new Date(a.rankingDate).getTime());
  return snapshots[0];
}

function makeLineage(dataType: SourceDataType, source: DatedSource, cutoff: Date) {
  return {
    ...source,
    dataType,
    freshnessDays: freshnessDays(source.date, cutoff)
  };
}

function firstSource<T extends DatedSource>(items: T[], cutoff: Date) {
  return items.find((item) => beforeOrAt(item.date, cutoff));
}

function evidenceDate<T extends { sourceDate?: Date | string | null; collectedAt?: Date | string | null; createdAt?: Date | string | null; publishedAt?: Date | string | null; date?: Date | string | null; lastMatchAt?: Date | string | null }>(item: T) {
  return item.sourceDate ?? item.collectedAt ?? item.createdAt ?? item.publishedAt ?? item.date ?? item.lastMatchAt;
}

function passesLeakageRole<T extends { dataLeakageCheckPassed?: boolean | null; dataRole?: string | null }>(item: T) {
  return item.dataLeakageCheckPassed !== false && (!item.dataRole || isPreMatchUsableDataRole(item.dataRole));
}

function filterByCutoff<T extends { sourceDate?: Date | string | null; collectedAt?: Date | string | null; createdAt?: Date | string | null; publishedAt?: Date | string | null; date?: Date | string | null; lastMatchAt?: Date | string | null; dataLeakageCheckPassed?: boolean | null; dataRole?: string | null }>(
  items: T[],
  cutoff: Date
) {
  return items.filter((item) => passesLeakageRole(item) && beforeOrAt(evidenceDate(item), cutoff));
}

function hasAfterCutoff<T extends { sourceDate?: Date | string | null; collectedAt?: Date | string | null; createdAt?: Date | string | null; publishedAt?: Date | string | null; date?: Date | string | null; lastMatchAt?: Date | string | null; dataLeakageCheckPassed?: boolean | null; dataRole?: string | null }>(
  items: T[],
  cutoff: Date
) {
  return items.some((item) => !passesLeakageRole(item) || !beforeOrAt(evidenceDate(item), cutoff));
}

function missingFeatures(input: PredictionInput, filtered: {
  playerStatsA: PredictionInput["playerStatsA"];
  playerStatsB: PredictionInput["playerStatsB"];
  mapStatsA: PredictionInput["mapStatsA"];
  mapStatsB: PredictionInput["mapStatsB"];
  vetoA: PredictionInput["vetoPatternsA"];
  vetoB: PredictionInput["vetoPatternsB"];
  h2h: PredictionInput["h2h"];
  news: PredictionInput["news"];
}) {
  const missing = [...(input.dataCoverage?.missing ?? [])];
  if (!filtered.playerStatsA.length || !filtered.playerStatsB.length) missing.push("player stats feature missing");
  if (!filtered.mapStatsA.length || !filtered.mapStatsB.length) missing.push("map stats feature missing");
  if (!filtered.vetoA.length || !filtered.vetoB.length) missing.push("veto feature missing");
  if (!filtered.h2h.length) missing.push("H2H feature missing");
  if (!filtered.news.length) missing.push("news feature missing");
  return [...new Set(missing)];
}

function sampleScore(input: PredictionInput) {
  const samples =
    (input.basicResultA?.matchesPlayed ?? 0) +
    (input.basicResultB?.matchesPlayed ?? 0) +
    input.playerStatsA.reduce((sum, stat) => sum + stat.maps, 0) +
    input.playerStatsB.reduce((sum, stat) => sum + stat.maps, 0) +
    input.mapStatsA.reduce((sum, stat) => sum + stat.mapsPlayed, 0) +
    input.mapStatsB.reduce((sum, stat) => sum + stat.mapsPlayed, 0) +
    input.vetoPatternsA.reduce((sum, stat) => sum + stat.confidenceScore * 10, 0) +
    input.vetoPatternsB.reduce((sum, stat) => sum + stat.confidenceScore * 10, 0);
  return Number(clamp(samples / 160, 0, 1).toFixed(3));
}

export function buildMatchFeatureSnapshotData(input: PredictionInput) {
  const prediction = calculatePrediction(input);
  const cutoff = new Date(input.match.startTime);
  const valveA = bestRank(input.teamA, "valve_rankings", cutoff);
  const valveB = bestRank(input.teamB, "valve_rankings", cutoff);
  const hltvA = bestRank(input.teamA, "hltv_manual_reference", cutoff);
  const hltvB = bestRank(input.teamB, "hltv_manual_reference", cutoff);
  const playerStatsA = filterByCutoff(input.playerStatsA, cutoff);
  const playerStatsB = filterByCutoff(input.playerStatsB, cutoff);
  const mapStatsA = filterByCutoff(input.mapStatsA, cutoff);
  const mapStatsB = filterByCutoff(input.mapStatsB, cutoff);
  const vetoA = filterByCutoff(input.vetoPatternsA, cutoff);
  const vetoB = filterByCutoff(input.vetoPatternsB, cutoff);
  const h2h = filterByCutoff(input.h2h, cutoff);
  const news = filterByCutoff(input.news, cutoff);
  const newsImpact = calculateNewsImpact({ teamA: input.teamA, teamB: input.teamB, news }, cutoff);
  const meta = input.gameMetaVersions.filter((item) => beforeOrAt(item.patchDate, cutoff));
  const leakageFlagged =
    hasAfterCutoff(input.playerStatsA, cutoff) ||
    hasAfterCutoff(input.playerStatsB, cutoff) ||
    hasAfterCutoff(input.mapStatsA, cutoff) ||
    hasAfterCutoff(input.mapStatsB, cutoff) ||
    hasAfterCutoff(input.vetoPatternsA, cutoff) ||
    hasAfterCutoff(input.vetoPatternsB, cutoff) ||
    hasAfterCutoff(input.h2h, cutoff) ||
    hasAfterCutoff(input.news, cutoff) ||
    input.gameMetaVersions.some((item) => !beforeOrAt(item.patchDate, cutoff));
  const uncertaintyA = calculateGlickoStyleUncertainty({
    matchesPlayed: input.basicResultA?.matchesPlayed ?? input.teamFormA?.matchesPlayed ?? 0,
    rosterStability: input.rosterVersionA?.coreStabilityScore ?? input.teamFormA?.rosterStabilityScore,
    isNewRoster: Boolean(input.rosterVersionA?.startedAt && freshnessDays(input.rosterVersionA.startedAt, cutoff) !== null && freshnessDays(input.rosterVersionA.startedAt, cutoff)! < 45)
  });
  const uncertaintyB = calculateGlickoStyleUncertainty({
    matchesPlayed: input.basicResultB?.matchesPlayed ?? input.teamFormB?.matchesPlayed ?? 0,
    rosterStability: input.rosterVersionB?.coreStabilityScore ?? input.teamFormB?.rosterStabilityScore,
    isNewRoster: Boolean(input.rosterVersionB?.startedAt && freshnessDays(input.rosterVersionB.startedAt, cutoff) !== null && freshnessDays(input.rosterVersionB.startedAt, cutoff)! < 45)
  });
  const rankLineageA = valveA ?? hltvA;
  const playerLineage = firstSource(
    [...playerStatsA, ...playerStatsB].map((stat) => ({
      sourceMode: sourceModeFromRecord(stat),
      sourceRecordId: stat.sourceRecordId,
      sampleSize: stat.maps,
      confidence: stat.source === "manual_enrichment" ? 0.72 : stat.source === "parsed_demo" ? 0.82 : 0.58,
      date: stat.sourceDate ?? stat.collectedAt ?? stat.createdAt
    })),
    cutoff
  );
  const mapLineage = firstSource(
    [...mapStatsA, ...mapStatsB].map((stat) => ({
      sourceMode: sourceModeFromRecord(stat),
      sourceRecordId: stat.sourceRecordId,
      sampleSize: stat.mapsPlayed,
      confidence: stat.sampleQuality,
      date: stat.sourceDate ?? stat.collectedAt ?? stat.createdAt
    })),
    cutoff
  );
  const vetoLineage = firstSource(
    [...vetoA, ...vetoB].map((stat) => ({
      sourceMode: sourceModeFromRecord(stat),
      sourceRecordId: stat.sourceRecordId,
      sampleSize: Math.round(stat.confidenceScore * 20),
      confidence: stat.confidenceScore,
      date: stat.sourceDate ?? stat.collectedAt ?? stat.createdAt
    })),
    cutoff
  );
  const newsLineage = firstSource(
    newsImpact.allUsages.map((usage) => ({
      sourceMode: sourceModeFromRecord(usage.item),
      sourceRecordId: usage.item.sourceRecordId,
      sampleSize: 1,
      confidence: usage.confidence,
      date: usage.item.sourceDate ?? usage.item.collectedAt ?? usage.item.publishedAt,
      itemIds: [usage.item.id].filter(Boolean),
      sourceTier: usage.tier,
      usedInPrediction: usage.usedInPrediction,
      reasonIfNotUsed: usage.reasonIfNotUsed
    })),
    cutoff
  );
  const lineage: FeatureLineage = {
    fixture: makeLineage("fixture", { sourceMode: input.match.sourceMode ?? "partial", sampleSize: 1, confidence: input.match.sourceConfidence ?? 0.5, date: input.match.startTime }, cutoff),
    ranking: makeLineage(
      "ranking",
      {
        sourceMode: rankLineageA?.source === "hltv_manual_reference" ? "manual_real" : rankLineageA?.source === "valve_rankings" ? "valve_rankings" : "partial",
        sourceRecordId: null,
        sampleSize: rankLineageA ? 1 : 0,
        confidence: rankLineageA?.confidence ?? 0.25,
        date: rankLineageA?.rankingDate
      },
      cutoff
    ),
    playerStats: makeLineage("player_stats", playerLineage ?? { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null }, cutoff),
    mapStats: makeLineage("map_stats", mapLineage ?? { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null }, cutoff),
    veto: makeLineage("veto", vetoLineage ?? { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null }, cutoff),
    h2h: makeLineage(
      "h2h",
      h2h[0]
        ? { sourceMode: sourceModeFromRecord(h2h[0]), sourceRecordId: h2h[0].sourceRecordId, sampleSize: h2h.length, confidence: h2h[0].relevanceScore, date: h2h[0].date }
        : { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null },
      cutoff
    ),
    news: {
      ...makeLineage("news", newsLineage ?? { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null }, cutoff),
      itemIds: newsImpact.allUsages.map((usage) => usage.item.id).filter(Boolean),
      usedItemIds: newsImpact.allUsages.filter((usage) => usage.usedInPrediction).map((usage) => usage.item.id).filter(Boolean),
      ignoredItemIds: newsImpact.allUsages.filter((usage) => !usage.usedInPrediction).map((usage) => usage.item.id).filter(Boolean),
      sourceTiers: [...new Set(newsImpact.allUsages.map((usage) => usage.tier))],
      reasonIfNotUsed: newsImpact.allUsages.filter((usage) => !usage.usedInPrediction).map((usage) => usage.reasonIfNotUsed)
    },
    patchMeta: makeLineage(
      "patch_meta",
      meta[0] ? { sourceMode: "steam_updates", sourceRecordId: meta[0].id, sampleSize: 1, confidence: meta[0].impactScore, date: meta[0].patchDate } : { sourceMode: "partial", sampleSize: 0, confidence: 0.1, date: null },
      cutoff
    ),
    sourcePriority: {
      sourceMode: "mixed",
      sourceRecordId: null,
      sampleSize: Object.keys(sourcePriorityByDataType).length,
      confidence: 1,
      date: cutoff,
      freshnessDays: 0,
      dataType: "fixture"
    }
  };
  const confidenceValues = Object.values(lineage).map((item) => item.confidence ?? 0.3);
  const sourceConfidence = Number((confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(confidenceValues.length, 1)).toFixed(3));
  const mapSampleConfidence = avg([...mapStatsA, ...mapStatsB], (stat) => stat.sampleQuality, 0);
  const teamAAvgPlayerRating = Number(avg(playerStatsA, (stat) => stat.rating, 0).toFixed(4));
  const teamBAvgPlayerRating = Number(avg(playerStatsB, (stat) => stat.rating, 0).toFixed(4));
  const teamATotalMapsPlayed = mapStatsA.reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const teamBTotalMapsPlayed = mapStatsB.reduce((sum, stat) => sum + stat.mapsPlayed, 0);
  const mapPoolAdvantage = diff(avg(mapStatsA, (stat) => stat.winRate, 0.5), avg(mapStatsB, (stat) => stat.winRate, 0.5));
  const vetoAdvantage = diff(avg(vetoA, (stat) => stat.comfortScore - stat.weaknessScore, 0), avg(vetoB, (stat) => stat.comfortScore - stat.weaknessScore, 0));
  const newsA = newsImpact.teamA.totalImpact;
  const newsB = newsImpact.teamB.totalImpact;

  return {
    matchId: input.match.id,
    modelVersion: prediction.modelVersion || FEATURE_MODEL_VERSION,
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    readinessLevel: prediction.readiness.level,
    sourceMode: input.match.sourceMode ?? "partial",
    dataQualityScore: prediction.dataQualityScore,
    featureCutoffTime: cutoff,
    dataLeakageCheckPassed: !leakageFlagged,
    featureSourcesJson: JSON.stringify({
      ...lineage,
      ignoredPostCutoffRecords: leakageFlagged,
      priorityByDataType: sourcePriorityByDataType
    }),
    missingCriticalDataJson: JSON.stringify(missingFeatures(input, { playerStatsA, playerStatsB, mapStatsA, mapStatsB, vetoA, vetoB, h2h, news })),
    sourceConfidence,
    sampleSizeScore: sampleScore(input),
    valveRankDiff: diff(rankScore(valveA?.rank ?? input.teamA.valveRank), rankScore(valveB?.rank ?? input.teamB.valveRank)),
    hltvManualRankDiff: diff(rankScore(hltvA?.rank ?? input.teamA.hltvRank), rankScore(hltvB?.rank ?? input.teamB.hltvRank)),
    internalEloDiff: diff(input.teamA.internalElo, input.teamB.internalElo),
    ratingUncertaintyDiff: diff(uncertaintyB.ratingDeviation, uncertaintyA.ratingDeviation),
    recentWinRateDiff: diff(input.basicResultA?.winRate ?? input.teamFormA?.matchWinRate ?? 0.5, input.basicResultB?.winRate ?? input.teamFormB?.matchWinRate ?? 0.5),
    opponentAdjustedFormDiff: diff(input.teamFormA?.opponentStrengthAdjustedForm ?? 0.5, input.teamFormB?.opponentStrengthAdjustedForm ?? 0.5),
    currentRosterFormDiff: diff(input.teamFormA?.rosterStabilityScore ?? 0.5, input.teamFormB?.rosterStabilityScore ?? 0.5),
    teamAAvgPlayerRating,
    teamBAvgPlayerRating,
    teamATotalMapsPlayed,
    teamBTotalMapsPlayed,
    avgPlayerRatingDiff: diff(avg(playerStatsA, (stat) => stat.rating, 1), avg(playerStatsB, (stat) => stat.rating, 1)),
    kdDiff: diff(avg(playerStatsA, (stat) => stat.kd, 1), avg(playerStatsB, (stat) => stat.kd, 1)),
    adrDiff: diff(avg(playerStatsA, (stat) => stat.adr, 70), avg(playerStatsB, (stat) => stat.adr, 70)),
    kastDiff: diff(avg(playerStatsA, (stat) => stat.kast, 70), avg(playerStatsB, (stat) => stat.kast, 70)),
    impactDiff: diff(avg(playerStatsA, (stat) => stat.impact, 1), avg(playerStatsB, (stat) => stat.impact, 1)),
    starPlayerDiff: diff(Math.max(0, ...playerStatsA.map((stat) => stat.rating)), Math.max(0, ...playerStatsB.map((stat) => stat.rating))),
    awpImpactDiff: diff(avg(playerStatsA, (stat) => stat.openingKillRating, 1), avg(playerStatsB, (stat) => stat.openingKillRating, 1)),
    worstPlayerLiabilityDiff: diff(avg(playerStatsB, (stat) => stat.worstPlayerLiability, 0.2), avg(playerStatsA, (stat) => stat.worstPlayerLiability, 0.2)),
    mapPoolAdvantage,
    vetoAdvantage,
    deciderAdvantage: diff(avg(mapStatsA, (stat) => stat.deciderRate * stat.winRate, 0), avg(mapStatsB, (stat) => stat.deciderRate * stat.winRate, 0)),
    mapSampleConfidence: Number(mapSampleConfidence.toFixed(4)),
    punishRisk: diff(avg(vetoB, (stat) => stat.punishProbability, 0), avg(vetoA, (stat) => stat.punishProbability, 0)),
    pistolAdvantage: diff(avg(mapStatsA, (stat) => stat.pistolWinRate, 0.5), avg(mapStatsB, (stat) => stat.pistolWinRate, 0.5)),
    forceBuyAdvantage: diff(avg(mapStatsA, (stat) => stat.forceBuyWinRate, 0.3), avg(mapStatsB, (stat) => stat.forceBuyWinRate, 0.3)),
    economyRecoveryAdvantage: diff(avg(mapStatsA, (stat) => stat.ecoRecoveryScore, 0.5), avg(mapStatsB, (stat) => stat.ecoRecoveryScore, 0.5)),
    closingAdvantage: diff(input.teamFormA?.closeOutRate ?? avg(mapStatsA, (stat) => stat.closingScore, 0.5), input.teamFormB?.closeOutRate ?? avg(mapStatsB, (stat) => stat.closingScore, 0.5)),
    overtimeAdvantage: diff(avg(mapStatsA, (stat) => stat.overtimeWinRate, 0.5), avg(mapStatsB, (stat) => stat.overtimeWinRate, 0.5)),
    rosterStabilityDiff: diff(input.rosterVersionA?.coreStabilityScore ?? input.teamFormA?.rosterStabilityScore ?? 0.5, input.rosterVersionB?.coreStabilityScore ?? input.teamFormB?.rosterStabilityScore ?? 0.5),
    newsImpactDiff: diff(newsA, newsB),
    fatigueDiff: diff(input.teamFormB?.fatigueScore ?? 0.2, input.teamFormA?.fatigueScore ?? 0.2),
    lanOnlineDiff: diff(input.match.isLan ? input.teamFormA?.lanWinRate ?? 0.5 : input.teamFormA?.onlineWinRate ?? 0.5, input.match.isLan ? input.teamFormB?.lanWinRate ?? 0.5 : input.teamFormB?.onlineWinRate ?? 0.5),
    patchRelevance: meta[0]?.impactScore ?? 0
  };
}

export async function saveMatchFeatureSnapshot(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const data = buildMatchFeatureSnapshotData(input);
  return prisma.matchFeatureSnapshot.create({ data });
}

export async function rebuildMatchFeatureSnapshots(limit = 120) {
  const matches = await prisma.match.findMany({
    where: { sourceMode: { not: "analyst_sample" } },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { id: true }
  });
  let created = 0;
  for (const match of matches) {
    await saveMatchFeatureSnapshot(match.id);
    created += 1;
  }
  return created;
}

export async function getLatestFeatureSnapshot(matchId: string) {
  return prisma.matchFeatureSnapshot.findFirst({ where: { matchId }, orderBy: { createdAt: "desc" } });
}
