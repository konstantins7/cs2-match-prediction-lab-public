import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function formatFactor(input: PredictionInput): PredictionFactorOutput {
  const depthA = (input.teamFormA?.rosterStabilityScore ?? 0.5) * 0.35 + (input.teamFormA?.mapWinRate ?? 0.5) * 0.35 + (input.chemistryA?.adaptationScore ?? 0.5) * 0.3;
  const depthB = (input.teamFormB?.rosterStabilityScore ?? 0.5) * 0.35 + (input.teamFormB?.mapWinRate ?? 0.5) * 0.35 + (input.chemistryB?.adaptationScore ?? 0.5) * 0.3;
  const multiplier = input.match.format === "BO1" ? 0.65 : input.match.format === "BO5" ? 1.15 : 1;

  return makeFactor({
    factorName: "Format Factor",
    factorGroup: "context",
    weight: input.modelWeights.format,
    teamAValue: depthA * multiplier,
    teamBValue: depthB * multiplier,
    scale: 0.26,
    confidence: input.match.format === "BO1" ? 0.48 : 0.72,
    explanation: "BO1 добавляет случайность; BO3/BO5 лучше раскрывают map pool, адаптацию и глубину состава.",
    evidence: [
      makeEvidence("match format", input.match.format, 1, input.match.format, input.match.format, "BO1 снижает confidence, BO3/BO5 повышают роль глубины.")
    ],
    warnings: input.match.format === "BO1" ? ["BO1 повышает variance и ограничивает confidence."] : []
  });
}
