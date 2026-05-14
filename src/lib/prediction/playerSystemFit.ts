import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function playerSystemFitFactor(input: PredictionInput): PredictionFactorOutput {
  const scoreA = averageBy(input.playerStatsA, (s) => s.roleImpact * 0.45 + s.mapSpecificPerformance * 0.3 + s.pressurePerformance * 0.15 - s.starDependency * 0.08 - s.worstPlayerLiability * 0.1);
  const scoreB = averageBy(input.playerStatsB, (s) => s.roleImpact * 0.45 + s.mapSpecificPerformance * 0.3 + s.pressurePerformance * 0.15 - s.starDependency * 0.08 - s.worstPlayerLiability * 0.1);

  return makeFactor({
    factorName: "Player-System Fit",
    factorGroup: "players",
    weight: input.modelWeights.playerSystemFit,
    teamAValue: scoreA || 0.5,
    teamBValue: scoreB || 0.5,
    scale: 0.2,
    confidence: 0.64,
    explanation: "Проверяет, насколько игроки подходят текущей системе по roleImpact и map-specific performance.",
    evidence: [
      makeEvidence("avg roleImpact", "last_30_days", input.playerStatsA.length + input.playerStatsB.length, averageBy(input.playerStatsA, (s) => s.roleImpact).toFixed(2), averageBy(input.playerStatsB, (s) => s.roleImpact).toFixed(2), "Role fit важнее сырых K/D.")
    ]
  });
}
