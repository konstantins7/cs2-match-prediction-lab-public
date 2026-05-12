import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function coreStabilityFactor(input: PredictionInput): PredictionFactorOutput {
  const scoreA = (input.rosterVersionA?.coreStabilityScore ?? 0.5) * 0.45 + Math.min((input.rosterVersionA?.mapsPlayedTogether ?? 0) / 65, 1) * 0.25 + (input.chemistryA?.coreStabilityScore ?? 0.5) * 0.3;
  const scoreB = (input.rosterVersionB?.coreStabilityScore ?? 0.5) * 0.45 + Math.min((input.rosterVersionB?.mapsPlayedTogether ?? 0) / 65, 1) * 0.25 + (input.chemistryB?.coreStabilityScore ?? 0.5) * 0.3;

  return makeFactor({
    factorName: "Core Stability",
    factorGroup: "roster",
    weight: input.modelWeights.coreStability,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.24,
    confidence: 0.72,
    explanation: "Stable core повышает confidence и снижает шум старых данных.",
    evidence: [
      makeEvidence("mapsPlayedTogether", "current roster", 1, input.rosterVersionA?.mapsPlayedTogether ?? 0, input.rosterVersionB?.mapsPlayedTogether ?? 0, "Больше карт вместе повышает доверие к stats.")
    ]
  });
}
