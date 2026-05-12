import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor, mapPoolScore } from "./utils";

export function mapPoolFactor(input: PredictionInput): PredictionFactorOutput {
  const a = mapPoolScore(input.mapStatsA);
  const b = mapPoolScore(input.mapStatsB);
  const smallSamples = [...input.mapStatsA, ...input.mapStatsB].filter((stat) => stat.mapsPlayed < 6).length;

  return makeFactor({
    factorName: "Map Pool",
    factorGroup: "maps",
    weight: input.modelWeights.mapPool,
    teamAValue: a.score,
    teamBValue: b.score,
    scale: 0.18,
    confidence: Math.min(a.confidence, b.confidence),
    explanation: "Map pool сравнивает winrate, CT/T split, pistol, overtime, closing и trend с sample-size confidence.",
    evidence: [
      makeEvidence("weighted map score", "last_90_days", a.sample + b.sample, a.score.toFixed(3), b.score.toFixed(3), "Winrate без sample size не доминирует."),
      makeEvidence("total map sample", "last_90_days", a.sample + b.sample, a.sample, b.sample, "80% на 5 картах менее надёжно, чем 62% на 35.")
    ],
    warnings: smallSamples > 0 ? [`${smallSamples} map samples имеют малый размер и снижены по confidence.`] : []
  });
}
