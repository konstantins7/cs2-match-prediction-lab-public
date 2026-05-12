import type { PredictionFactorOutput, PredictionInput } from "./types";
import { sampleSizeConfidence } from "./normalization";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function kdTrendFactor(input: PredictionInput): PredictionFactorOutput {
  const aTrend =
    averageBy(input.playerStatsA, (s) => s.kdTrend) * 0.38 +
    averageBy(input.playerStatsA, (s) => s.ratingTrend) * 0.32 +
    averageBy(input.playerStatsA, (s) => s.adrTrend / 10) * 0.18 +
    averageBy(input.playerStatsA, (s) => s.openingDuelTrend) * 0.12;
  const bTrend =
    averageBy(input.playerStatsB, (s) => s.kdTrend) * 0.38 +
    averageBy(input.playerStatsB, (s) => s.ratingTrend) * 0.32 +
    averageBy(input.playerStatsB, (s) => s.adrTrend / 10) * 0.18 +
    averageBy(input.playerStatsB, (s) => s.openingDuelTrend) * 0.12;
  const volatility = (averageBy(input.playerStatsA, (s) => s.volatilityScore) + averageBy(input.playerStatsB, (s) => s.volatilityScore)) / 2;
  const sample = input.playerStatsA.length + input.playerStatsB.length;

  return makeFactor({
    factorName: "K/D Trend",
    factorGroup: "players",
    weight: input.modelWeights.kdTrend,
    teamAValue: aTrend,
    teamBValue: bTrend,
    scale: 0.18,
    confidence: sampleSizeConfidence(sample, 10) * (1 - volatility * 0.25),
    explanation: "Не абсолютный K/D, а направление KD/rating/ADR/opening trend с штрафом за волатильность.",
    evidence: [
      makeEvidence("avg kdTrend", "last_30_days", sample, averageBy(input.playerStatsA, (s) => s.kdTrend).toFixed(3), averageBy(input.playerStatsB, (s) => s.kdTrend).toFixed(3), "Рост K/D даёт плюс, падение минус."),
      makeEvidence("volatility", "last_30_days", sample, volatility.toFixed(2), volatility.toFixed(2), "Высокая волатильность снижает confidence.")
    ],
    warnings: volatility > 0.55 ? ["Высокая волатильность игроков делает trend менее надёжным."] : []
  });
}
