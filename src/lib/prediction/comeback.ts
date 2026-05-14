import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function comebackFactor(input: PredictionInput): PredictionFactorOutput {
  const a = input.teamFormA;
  const b = input.teamFormB;
  const formatMultiplier = input.match.format === "BO3" ? 1.08 : input.match.format === "BO5" ? 1.15 : 0.88;
  const scoreA = a
    ? (a.comebackFrom3RoundDeficit * 0.24 + a.comebackFrom5RoundDeficit * 0.2 + a.badHalfRecovery * 0.22 + a.lostPistolRecovery * 0.17 + a.lostOwnPickRecovery * 0.17) * formatMultiplier
    : 0.5;
  const scoreB = b
    ? (b.comebackFrom3RoundDeficit * 0.24 + b.comebackFrom5RoundDeficit * 0.2 + b.badHalfRecovery * 0.22 + b.lostPistolRecovery * 0.17 + b.lostOwnPickRecovery * 0.17) * formatMultiplier
    : 0.5;

  return makeFactor({
    factorName: "Comeback Ability",
    factorGroup: "pressure",
    weight: input.modelWeights.comeback,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.24,
    confidence: 0.66,
    explanation: "Камбэки важнее в BO3/BO5, где команда может адаптироваться после плохой карты или половины.",
    evidence: [
      makeEvidence("comebackFrom5RoundDeficit", "last_30_days", (a?.mapsPlayed ?? 0) + (b?.mapsPlayed ?? 0), a?.comebackFrom5RoundDeficit ?? "missing", b?.comebackFrom5RoundDeficit ?? "missing", "Возвраты с глубокого дефицита."),
      makeEvidence("lostOwnPickRecovery", input.match.format, 1, a?.lostOwnPickRecovery ?? "missing", b?.lostOwnPickRecovery ?? "missing", "В BO3 recovery после проигранного pick особенно важен.")
    ]
  });
}
