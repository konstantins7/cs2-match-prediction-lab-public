import type { PredictionFactorOutput, PredictionInput } from "./types";
import { daysBetween } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function honeymoonFactor(input: PredictionInput): PredictionFactorOutput {
  const ageA = input.rosterVersionA ? daysBetween(input.rosterVersionA.startedAt, "2026-05-12T08:00:00.000Z") : 999;
  const ageB = input.rosterVersionB ? daysBetween(input.rosterVersionB.startedAt, "2026-05-12T08:00:00.000Z") : 999;
  const boostA = ageA < 45 && (input.teamFormA?.formScore ?? 0.5) > 0.55 ? 0.08 : 0;
  const boostB = ageB < 45 && (input.teamFormB?.formScore ?? 0.5) > 0.55 ? 0.08 : 0;

  return makeFactor({
    factorName: "Honeymoon Period",
    factorGroup: "roster",
    weight: input.modelWeights.honeymoon,
    teamAValue: (input.teamFormA?.formScore ?? 0.5) + boostA,
    teamBValue: (input.teamFormB?.formScore ?? 0.5) + boostB,
    scale: 0.22,
    confidence: boostA || boostB ? 0.44 : 0.58,
    explanation: "Новый состав может получить небольшой honeymoon boost, но это обязательно повышает risk.",
    evidence: [
      makeEvidence("roster age days", "current roster", 1, Math.round(ageA), Math.round(ageB), "Новые составы с резкой формой получают небольшой boost и risk.")
    ],
    warnings: boostA || boostB ? ["Honeymoon boost detected: probability слегка меняется, risk повышен."] : []
  });
}
