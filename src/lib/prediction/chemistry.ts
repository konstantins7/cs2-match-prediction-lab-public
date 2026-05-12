import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function chemistryFactor(input: PredictionInput): PredictionFactorOutput {
  const scoreA = input.chemistryA
    ? input.chemistryA.sharedExperienceScore * 0.25 + input.chemistryA.languageCompatibilityScore * 0.2 + input.chemistryA.roleFitScore * 0.2 + input.chemistryA.coreStabilityScore * 0.2 + input.chemistryA.adaptationScore * 0.15 - input.chemistryA.volatilityScore * 0.12
    : 0.5;
  const scoreB = input.chemistryB
    ? input.chemistryB.sharedExperienceScore * 0.25 + input.chemistryB.languageCompatibilityScore * 0.2 + input.chemistryB.roleFitScore * 0.2 + input.chemistryB.coreStabilityScore * 0.2 + input.chemistryB.adaptationScore * 0.15 - input.chemistryB.volatilityScore * 0.12
    : 0.5;

  return makeFactor({
    factorName: "Team Chemistry",
    factorGroup: "roster",
    weight: input.modelWeights.chemistry,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.26,
    confidence: 0.66,
    explanation: "Chemistry score объединяет shared experience, language, role fit, core stability, adaptation и volatility.",
    evidence: [
      makeEvidence("sharedExperienceScore", "current roster", 1, input.chemistryA?.sharedExperienceScore ?? "missing", input.chemistryB?.sharedExperienceScore ?? "missing", "Общий опыт снижает uncertainty.")
    ]
  });
}
