import type { PredictionFactorOutput, PredictionInput } from "./types";
import { sampleSizeConfidence } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function teamStrengthFactor(input: PredictionInput): PredictionFactorOutput {
  const rankA = input.teamA.valveRank ?? input.teamA.hltvRank ?? 100;
  const rankB = input.teamB.valveRank ?? input.teamB.hltvRank ?? 100;
  const formA = input.teamFormA?.opponentStrengthAdjustedForm ?? 0.5;
  const formB = input.teamFormB?.opponentStrengthAdjustedForm ?? 0.5;
  const scoreA = input.teamA.internalElo / 2000 + (101 - rankA) / 220 + formA * 0.25;
  const scoreB = input.teamB.internalElo / 2000 + (101 - rankB) / 220 + formB * 0.25;
  const sample = (input.teamFormA?.matchesPlayed ?? 0) + (input.teamFormB?.matchesPlayed ?? 0);

  return makeFactor({
    factorName: "Team Strength",
    factorGroup: "strength",
    weight: input.modelWeights.teamStrength,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.35,
    confidence: sampleSizeConfidence(sample, 36),
    explanation: "Сравнение internal Elo, reference rank и формы с поправкой на силу соперников.",
    evidence: [
      makeEvidence("internalElo", "current", sample, input.teamA.internalElo, input.teamB.internalElo, "Elo выше даёт базовый плюс."),
      makeEvidence("opponentStrengthAdjustedForm", "last_30_days", sample, formA, formB, "Победы над сильными соперниками весят больше.")
    ]
  });
}
