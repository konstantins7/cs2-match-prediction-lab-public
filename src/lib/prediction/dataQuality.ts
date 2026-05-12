import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function dataQualityScore(input: PredictionInput) {
  const playerCoverage = Math.min(input.playerStatsA.length, input.playerStatsB.length) / 5;
  const mapCoverage = Math.min(input.mapStatsA.length, input.mapStatsB.length) / 7;
  const vetoCoverage = Math.min(input.vetoPatternsA.length, input.vetoPatternsB.length) / 7;
  const mapSample = (averageBy(input.mapStatsA, (s) => s.sampleQuality) + averageBy(input.mapStatsB, (s) => s.sampleQuality)) / 2;
  const base = input.match.dataQualityScore / 100;
  return Math.max(0, Math.min(1, base * 0.35 + playerCoverage * 0.18 + mapCoverage * 0.15 + vetoCoverage * 0.12 + mapSample * 0.2));
}

export function dataQualityFactor(input: PredictionInput): PredictionFactorOutput {
  const score = dataQualityScore(input);

  return makeFactor({
    factorName: "Data Quality",
    factorGroup: "quality",
    weight: input.modelWeights.dataQuality,
    teamAValue: score,
    teamBValue: score,
    scale: 1,
    confidence: score,
    explanation: "Оценивает свежесть и полноту данных: players, maps, veto, match data quality и sample size.",
    evidence: [
      makeEvidence("match dataQualityScore", "current", 1, input.match.dataQualityScore, input.match.dataQualityScore, "Низкое качество данных ограничивает confidence."),
      makeEvidence("coverage", "current", input.playerStatsA.length + input.playerStatsB.length, `${input.playerStatsA.length}/5 players`, `${input.playerStatsB.length}/5 players`, "Player coverage влияет на итоговую уверенность.")
    ],
    warnings: score < 0.5 ? ["Data quality ниже 50: итоговый confidence не может быть выше 65."] : []
  });
}
