import type { PredictionFactorOutput, PredictionInput } from "./types";
import { averageBy, makeEvidence, makeFactor } from "./utils";

export function overtimeFactor(input: PredictionInput, preOvertimeRawScore = 0): PredictionFactorOutput {
  const closenessMultiplier = Math.max(0.25, 1 - Math.min(Math.abs(preOvertimeRawScore), 22) / 24);
  const scoreA =
    averageBy(input.mapStatsA, (s) => s.overtimeWinRate) * 0.36 +
    averageBy(input.mapStatsA, (s) => s.multipleOvertimeWinRate) * 0.18 +
    averageBy(input.mapStatsA, (s) => s.pressureRoundWinRate) * 0.24 +
    averageBy(input.mapStatsA, (s) => s.clutchInOvertimeScore) * 0.22;
  const scoreB =
    averageBy(input.mapStatsB, (s) => s.overtimeWinRate) * 0.36 +
    averageBy(input.mapStatsB, (s) => s.multipleOvertimeWinRate) * 0.18 +
    averageBy(input.mapStatsB, (s) => s.pressureRoundWinRate) * 0.24 +
    averageBy(input.mapStatsB, (s) => s.clutchInOvertimeScore) * 0.22;

  return makeFactor({
    factorName: "Overtime",
    factorGroup: "pressure",
    weight: input.modelWeights.overtime,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.22 / closenessMultiplier,
    confidence: 0.62 + closenessMultiplier * 0.2,
    explanation: "Overtime сильнее влияет в близких матчах и слабее, когда базовая модель односторонняя.",
    evidence: [
      makeEvidence("overtimeWinRate", "last_90_days", input.mapStatsA.length + input.mapStatsB.length, averageBy(input.mapStatsA, (s) => s.overtimeWinRate).toFixed(2), averageBy(input.mapStatsB, (s) => s.overtimeWinRate).toFixed(2), "OT winrate учитывается через closeness multiplier."),
      makeEvidence("closenessMultiplier", "pre-overtime model", 1, closenessMultiplier.toFixed(2), closenessMultiplier.toFixed(2), "При 50/50 множитель выше, при 70/30 ниже.")
    ]
  });
}
