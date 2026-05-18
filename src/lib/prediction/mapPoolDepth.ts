import { isPreMatchUsableDataRole, parseEvidenceDate } from "../realData/dataRole";
import { clamp, round } from "./normalization";
import type { PredictionFactorOutput, PredictionInput, TeamMapStatEntity } from "./types";
import { makeEvidence } from "./utils";

function evidenceDate(stat: TeamMapStatEntity) {
  return parseEvidenceDate(stat.sourceDate) ?? parseEvidenceDate(stat.collectedAt) ?? parseEvidenceDate(stat.createdAt);
}

function cutoffSafe(stats: TeamMapStatEntity[], cutoff: Date) {
  return stats.filter((stat) => {
    if (stat.dataLeakageCheckPassed === false) return false;
    if (stat.dataRole && !isPreMatchUsableDataRole(stat.dataRole)) return false;
    const date = evidenceDate(stat);
    return !date || date.getTime() <= cutoff.getTime();
  });
}

function totalMaps(stats: TeamMapStatEntity[]) {
  return stats.reduce((sum, stat) => sum + stat.mapsPlayed, 0);
}

function depthScore(totalMapsPlayed: number) {
  return clamp((totalMapsPlayed / 50) * 5, 0, 5);
}

export function mapPoolDepthFactor(input: PredictionInput): PredictionFactorOutput {
  const cutoff = new Date(input.match.startTime);
  const mapsA = totalMaps(cutoffSafe(input.mapStatsA, cutoff));
  const mapsB = totalMaps(cutoffSafe(input.mapStatsB, cutoff));
  const teamAValue = depthScore(mapsA);
  const teamBValue = depthScore(mapsB);
  const rawDifference = teamAValue - teamBValue;
  const impact = clamp(rawDifference, -5, 5);
  const confidence = clamp(Math.min(mapsA, mapsB) / 50, 0.25, 0.92);

  return {
    factorName: "Map Pool Depth",
    factorGroup: "maps",
    teamAValue: round(teamAValue, 3),
    teamBValue: round(teamBValue, 3),
    rawDifference: round(rawDifference, 3),
    normalizedDifference: round(clamp(rawDifference / 5, -1, 1), 3),
    weight: input.modelWeights.mapPoolDepth,
    impact: round(impact, 3),
    confidence: round(confidence, 3),
    explanation: "Больше cutoff-safe сыгранных карт повышает доверие к map-pool сигналам, но это небольшой confidence-style фактор.",
    evidence: [
      makeEvidence("totalMapsPlayed", "cutoff_safe", mapsA + mapsB, mapsA, mapsB, "Сумма сыгранных карт по доступным pre-match map stats.", "feature_snapshot_raw")
    ],
    warnings: mapsA === 0 || mapsB === 0 ? ["Map pool depth limited: одна из команд не имеет cutoff-safe map stats."] : []
  };
}
