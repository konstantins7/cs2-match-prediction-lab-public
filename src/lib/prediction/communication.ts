import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function communicationFactor(input: PredictionInput): PredictionFactorOutput {
  const scoreA = (input.chemistryA?.languageCompatibilityScore ?? 0.55) - (input.rosterVersionA?.mainLanguage === "mixed" ? 0.08 : 0);
  const scoreB = (input.chemistryB?.languageCompatibilityScore ?? 0.55) - (input.rosterVersionB?.mainLanguage === "mixed" ? 0.08 : 0);

  return makeFactor({
    factorName: "Communication/Language",
    factorGroup: "roster",
    weight: input.modelWeights.communication,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.24,
    confidence: 0.6,
    explanation: "Mixed language или новая коммуникационная структура повышает communication risk.",
    evidence: [
      makeEvidence("mainLanguage", "current roster", 1, input.rosterVersionA?.mainLanguage ?? "unknown", input.rosterVersionB?.mainLanguage ?? "unknown", "Разные языки коммуникации повышают риск ошибок.")
    ],
    warnings: input.rosterVersionA?.mainLanguage === "mixed" || input.rosterVersionB?.mainLanguage === "mixed" ? ["Есть mixed-language communication risk."] : []
  });
}
