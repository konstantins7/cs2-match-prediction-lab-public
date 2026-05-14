import type { PredictionFactorOutput, PredictionInput } from "./types";
import { clamp, recencyScore, sampleSizeConfidence } from "./normalization";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function calculateDataRelevanceScore(params: {
  statDate: Date | string;
  latestMajorPatchDate?: Date | string | null;
  latestMapVersionDate?: Date | string | null;
  rosterSimilarity: number;
  roleSimilarity: number;
  positionSimilarity: number;
  sampleSize: number;
}) {
  const recency = recencyScore(params.statDate);
  const patchRelevance = params.latestMajorPatchDate && new Date(params.statDate) < new Date(params.latestMajorPatchDate) ? 0.58 : 1;
  const mapVersionRelevance = params.latestMapVersionDate && new Date(params.statDate) < new Date(params.latestMapVersionDate) ? 0.62 : 1;
  const sample = sampleSizeConfidence(params.sampleSize, 28);
  return clamp(
    recency *
      patchRelevance *
      mapVersionRelevance *
      clamp(params.rosterSimilarity, 0.15, 1) *
      clamp(params.roleSimilarity, 0.15, 1) *
      clamp(params.positionSimilarity, 0.15, 1) *
      sample,
    0,
    1
  );
}

export function dataRelevanceFactor(input: PredictionInput): PredictionFactorOutput {
  const latestMajorPatch = input.gameMetaVersions
    .filter((meta) => meta.patchType.toLowerCase().includes("major"))
    .sort((a, b) => new Date(b.patchDate).getTime() - new Date(a.patchDate).getTime())[0];
  const latestMapVersion = input.mapVersions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  const rosterA = input.rosterVersionA?.coreStabilityScore ?? 0.5;
  const rosterB = input.rosterVersionB?.coreStabilityScore ?? 0.5;
  const roleA = averageBy(input.roleSnapshotsA, (snapshot) => (input.playersA.some((player) => player.id === snapshot.playerId && player.role === snapshot.role) ? 1 : 0.62));
  const roleB = averageBy(input.roleSnapshotsB, (snapshot) => (input.playersB.some((player) => player.id === snapshot.playerId && player.role === snapshot.role) ? 1 : 0.62));
  const scoreA = calculateDataRelevanceScore({
    statDate: input.teamFormA?.createdAt ?? input.match.startTime,
    latestMajorPatchDate: latestMajorPatch?.patchDate,
    latestMapVersionDate: latestMapVersion?.startedAt,
    rosterSimilarity: rosterA,
    roleSimilarity: roleA || 0.7,
    positionSimilarity: input.chemistryA?.roleFitScore ?? 0.6,
    sampleSize: (input.teamFormA?.mapsPlayed ?? 0) + input.playerStatsA.reduce((sum, stat) => sum + stat.maps, 0)
  });
  const scoreB = calculateDataRelevanceScore({
    statDate: input.teamFormB?.createdAt ?? input.match.startTime,
    latestMajorPatchDate: latestMajorPatch?.patchDate,
    latestMapVersionDate: latestMapVersion?.startedAt,
    rosterSimilarity: rosterB,
    roleSimilarity: roleB || 0.7,
    positionSimilarity: input.chemistryB?.roleFitScore ?? 0.6,
    sampleSize: (input.teamFormB?.mapsPlayed ?? 0) + input.playerStatsB.reduce((sum, stat) => sum + stat.maps, 0)
  });
  const windowsA = input.dataWindows.filter((window) => window.teamId === input.teamA.id);
  const windowsB = input.dataWindows.filter((window) => window.teamId === input.teamB.id);
  const windowScoreA = windowsA.length ? averageBy(windowsA, (window) => window.relevanceScore) : scoreA;
  const windowScoreB = windowsB.length ? averageBy(windowsB, (window) => window.relevanceScore) : scoreB;
  const finalScoreA = scoreA * 0.72 + windowScoreA * 0.28;
  const finalScoreB = scoreB * 0.72 + windowScoreB * 0.28;

  return makeFactor({
    factorName: "Data Relevance Decay",
    factorGroup: "meta",
    weight: input.modelWeights.dataRelevance,
    teamAValue: finalScoreA,
    teamBValue: finalScoreB,
    scale: 0.28,
    confidence: Math.min(finalScoreA, finalScoreB),
    explanation: "DataRelevanceScore = recency * patch relevance * map version relevance * roster/role/position similarity * sample confidence.",
    evidence: [
      makeEvidence("latest major patch", "meta", 1, latestMajorPatch?.patchName ?? "none", latestMajorPatch?.patchName ?? "none", "Данные до major patch теряют вес."),
      makeEvidence("data relevance score", "computed", 1, finalScoreA.toFixed(3), finalScoreB.toFixed(3), "Старые/нерелевантные данные снижают confidence."),
      makeEvidence("prediction data windows", "MVP 0.3", input.dataWindows.length, windowsA.length, windowsB.length, "Current roster/post-patch windows получают больший вес, чем старые baseline окна.")
    ],
    warnings: [
      ...(finalScoreA < 0.45 || finalScoreB < 0.45 ? ["Есть сильный decay старых данных из-за patch/map/roster/role/position changes."] : []),
      ...(input.dataWindows.length ? [] : ["Нет PredictionDataWindow; relevance рассчитан только из snapshots."])
    ]
  });
}
