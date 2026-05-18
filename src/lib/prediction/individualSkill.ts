import { isPreMatchUsableDataRole, parseEvidenceDate } from "../realData/dataRole";
import { clamp, round } from "./normalization";
import type { PlayerStatEntity, PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence } from "./utils";

function evidenceDate(stat: PlayerStatEntity) {
  return parseEvidenceDate(stat.sourceDate) ?? parseEvidenceDate(stat.collectedAt) ?? parseEvidenceDate(stat.createdAt);
}

function cutoffSafe(stats: PlayerStatEntity[], cutoff: Date) {
  return stats.filter((stat) => {
    if (stat.dataLeakageCheckPassed === false) return false;
    if (stat.dataRole && !isPreMatchUsableDataRole(stat.dataRole)) return false;
    const date = evidenceDate(stat);
    return !date || date.getTime() <= cutoff.getTime();
  });
}

function avgRating(stats: PlayerStatEntity[]) {
  if (!stats.length) return 0;
  return stats.reduce((sum, stat) => sum + stat.rating, 0) / stats.length;
}

export function individualSkillFactor(input: PredictionInput): PredictionFactorOutput {
  const cutoff = new Date(input.match.startTime);
  const playerStatsA = cutoffSafe(input.playerStatsA, cutoff);
  const playerStatsB = cutoffSafe(input.playerStatsB, cutoff);
  const teamAValue = avgRating(playerStatsA);
  const teamBValue = avgRating(playerStatsB);
  const ratingDiff = teamAValue - teamBValue;
  const impact = clamp(ratingDiff * 10, -8, 8);
  const confidence = clamp(Math.min(playerStatsA.length, playerStatsB.length) / 5, 0.22, 0.94);

  return {
    factorName: "Individual Skill",
    factorGroup: "players",
    teamAValue: round(teamAValue, 3),
    teamBValue: round(teamBValue, 3),
    rawDifference: round(ratingDiff, 3),
    normalizedDifference: round(clamp(ratingDiff / 0.8, -1, 1), 3),
    weight: input.modelWeights.individualSkill,
    impact: round(impact, 3),
    confidence: round(confidence, 3),
    explanation: "Средний cutoff-safe player rating даёт прямой сигнал индивидуального скилла состава.",
    evidence: [
      makeEvidence("avgPlayerRating", "cutoff_safe", playerStatsA.length + playerStatsB.length, teamAValue, teamBValue, "Средний рейтинг игроков до старта матча.", "feature_snapshot_raw")
    ],
    warnings: playerStatsA.length < 5 || playerStatsB.length < 5 ? ["Individual skill limited: неполный cutoff-safe player stats sample."] : []
  };
}
