import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function dataQualityScore(input: PredictionInput) {
  const playerCoverage = Math.min(input.playerStatsA.length, input.playerStatsB.length) / 5;
  const mapCoverage = Math.min(input.mapStatsA.length, input.mapStatsB.length) / 7;
  const vetoCoverage = Math.min(input.vetoPatternsA.length, input.vetoPatternsB.length) / 7;
  const rankCoverage = input.dataCoverage?.rankData ? 1 : 0;
  const basicResultCoverage = input.dataCoverage?.recentMatches ? 1 : 0;
  const mapSample = (averageBy(input.mapStatsA, (s) => s.sampleQuality) + averageBy(input.mapStatsB, (s) => s.sampleQuality)) / 2;
  const matchupCoverage = input.opponentMatchupA && input.opponentMatchupB ? Math.min(input.opponentMatchupA.confidenceScore, input.opponentMatchupB.confidenceScore) : 0.28;
  const dataWindowCoverage = input.dataWindows.length >= 4 ? averageBy(input.dataWindows, (window) => window.relevanceScore) : 0.32;
  const sourceConflictPenalty = Math.min(0.24, input.sourceConflicts.length * 0.08);
  const base = input.match.dataQualityScore / 100;
  return Math.max(
    0,
    Math.min(
      1,
      base * 0.22 +
        rankCoverage * 0.08 +
        basicResultCoverage * 0.08 +
        playerCoverage * 0.15 +
        mapCoverage * 0.12 +
        vetoCoverage * 0.09 +
        mapSample * 0.14 +
        matchupCoverage * 0.07 +
        dataWindowCoverage * 0.05 -
        sourceConflictPenalty
    )
  );
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
      makeEvidence("coverage", "current", input.playerStatsA.length + input.playerStatsB.length, `${input.playerStatsA.length}/5 players`, `${input.playerStatsB.length}/5 players`, "Player coverage влияет на итоговую уверенность."),
      makeEvidence("basic coverage", "current", 1, input.dataCoverage?.known.join(", ") ?? "unknown", input.dataCoverage?.missing.join(", ") ?? "unknown", "Free-source rank/basic snapshots повышают baseline data quality."),
      makeEvidence("data windows", "MVP 0.3", input.dataWindows.length, input.dataWindows.length, input.dataWindows.length, "Data windows повышают confidence, если покрывают roster/meta/map relevance."),
      makeEvidence("source conflicts", "current", input.sourceConflicts.length, input.sourceConflicts.length, input.sourceConflicts.length, "Source conflict снижает data quality и отображается в warnings.")
    ],
    warnings: [
      ...(score < 0.5 ? ["Data quality ниже 50: итоговый confidence не может быть выше 65."] : []),
      ...(input.dataCoverage?.fixtureOnly ? ["Fixture-only data: нет ranking/basic/player/map/veto depth."] : []),
      ...(input.opponentMatchupA && input.opponentMatchupB ? [] : ["Недостаточно opponent matchup data; confidence снижен."]),
      ...(input.dataWindows.length ? [] : ["Prediction data windows отсутствуют; relevance оценивается частично."]),
      ...input.sourceConflicts.map((conflict) => `sourceConflict: ${conflict.source} ${conflict.entityType} ${conflict.externalName} требует review.`)
    ]
  });
}
