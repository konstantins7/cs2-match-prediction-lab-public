import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function economyFactor(input: PredictionInput): PredictionFactorOutput {
  const formatBoost = input.match.format === "BO1" ? 1.3 : input.match.format === "BO5" ? 0.88 : 1;
  const scoreA =
    averageBy(input.mapStatsA, (s) => s.pistolWinRate) * 0.2 +
    averageBy(input.mapStatsA, (s) => s.conversionAfterPistolWin) * 0.2 +
    averageBy(input.mapStatsA, (s) => s.forceBuyWinRate) * 0.2 +
    (1 - averageBy(input.mapStatsA, (s) => s.antiEcoLossRate)) * 0.14 +
    averageBy(input.mapStatsA, (s) => s.ecoRecoveryScore) * 0.14 +
    averageBy(input.mapStatsA, (s) => s.resetResistanceScore) * 0.12;
  const scoreB =
    averageBy(input.mapStatsB, (s) => s.pistolWinRate) * 0.2 +
    averageBy(input.mapStatsB, (s) => s.conversionAfterPistolWin) * 0.2 +
    averageBy(input.mapStatsB, (s) => s.forceBuyWinRate) * 0.2 +
    (1 - averageBy(input.mapStatsB, (s) => s.antiEcoLossRate)) * 0.14 +
    averageBy(input.mapStatsB, (s) => s.ecoRecoveryScore) * 0.14 +
    averageBy(input.mapStatsB, (s) => s.resetResistanceScore) * 0.12;

  return makeFactor({
    factorName: "Pistol/Force/Economy",
    factorGroup: "economy",
    weight: input.modelWeights.economy,
    teamAValue: scoreA * formatBoost,
    teamBValue: scoreB * formatBoost,
    scale: 0.22,
    confidence: 0.7,
    explanation: "В BO1 economy и pistol/force-buy имеют больший вес из-за короткого формата.",
    evidence: [
      makeEvidence("pistolWinRate", "last_90_days", input.mapStatsA.length + input.mapStatsB.length, averageBy(input.mapStatsA, (s) => s.pistolWinRate).toFixed(2), averageBy(input.mapStatsB, (s) => s.pistolWinRate).toFixed(2), "Пистолетные раунды особенно важны в BO1."),
      makeEvidence("antiEcoLossRate", "last_90_days", input.mapStatsA.length + input.mapStatsB.length, averageBy(input.mapStatsA, (s) => s.antiEcoLossRate).toFixed(2), averageBy(input.mapStatsB, (s) => s.antiEcoLossRate).toFixed(2), "Anti-eco ошибки снижают экономическую стабильность.")
    ]
  });
}
