import type { PlayerStatEntity, PredictionFactorOutput, PredictionInput } from "./types";
import { sampleSizeConfidence, weightedAverage } from "./normalization";
import { averageBy, makeEvidence, makeFactor } from "./utils";

function playerScore(stat: PlayerStatEntity) {
  return (
    stat.rating * 0.28 +
    stat.impact * 0.18 +
    stat.adr / 100 * 0.12 +
    stat.kast * 0.1 +
    stat.openingKillRating * 0.1 +
    stat.clutchScore * 0.08 +
    stat.pressurePerformance * 0.08 +
    stat.roleImpact * 0.06 -
    stat.worstPlayerLiability * 0.08
  );
}

export function playerFormFactor(input: PredictionInput): PredictionFactorOutput {
  const scoreA = weightedAverage(input.playerStatsA.map((stat) => ({ value: playerScore(stat), weight: sampleSizeConfidence(stat.maps, 20) })));
  const scoreB = weightedAverage(input.playerStatsB.map((stat) => ({ value: playerScore(stat), weight: sampleSizeConfidence(stat.maps, 20) })));
  const sample = input.playerStatsA.reduce((sum, stat) => sum + stat.maps, 0) + input.playerStatsB.reduce((sum, stat) => sum + stat.maps, 0);

  return makeFactor({
    factorName: "Player Form",
    factorGroup: "players",
    weight: input.modelWeights.playerForm,
    teamAValue: scoreA || 0.5,
    teamBValue: scoreB || 0.5,
    scale: 0.22,
    confidence: sampleSizeConfidence(sample, 160),
    explanation: "Командная форма игроков агрегирует rating, impact, ADR, KAST, opening, clutch и pressure metrics.",
    evidence: [
      makeEvidence("avg rating", "last_30_days", sample, averageBy(input.playerStatsA, (s) => s.rating).toFixed(2), averageBy(input.playerStatsB, (s) => s.rating).toFixed(2), "Средний rating игроков."),
      makeEvidence("avg pressurePerformance", "last_30_days", sample, averageBy(input.playerStatsA, (s) => s.pressurePerformance).toFixed(2), averageBy(input.playerStatsB, (s) => s.pressurePerformance).toFixed(2), "Игроки под давлением влияют на близкие карты.")
    ],
    warnings: input.playerStatsA.length < 5 || input.playerStatsB.length < 5 ? ["Не полный набор player stat snapshots."] : []
  });
}
