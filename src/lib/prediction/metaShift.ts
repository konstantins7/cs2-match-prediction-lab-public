import type { PredictionFactorOutput, PredictionInput } from "./types";
import { recencyScore } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function metaShiftFactor(input: PredictionInput): PredictionFactorOutput {
  const economyMeta = input.gameMetaVersions.find((meta) => meta.affectedAreas.toLowerCase().includes("economy"));
  const aAdapt = (input.chemistryA?.adaptationScore ?? 0.5) * 0.5 + (input.teamFormA?.opponentStrengthAdjustedForm ?? 0.5) * 0.5;
  const bAdapt = (input.chemistryB?.adaptationScore ?? 0.5) * 0.5 + (input.teamFormB?.opponentStrengthAdjustedForm ?? 0.5) * 0.5;
  const metaImpact = economyMeta ? economyMeta.impactScore * recencyScore(economyMeta.patchDate) : 0.2;

  return makeFactor({
    factorName: "Meta Shift",
    factorGroup: "meta",
    weight: input.modelWeights.metaShift,
    teamAValue: aAdapt * (1 + metaImpact * 0.1),
    teamBValue: bAdapt * (1 + metaImpact * 0.1),
    scale: 0.22,
    confidence: 0.56 + metaImpact * 0.2,
    explanation: "Оценивает адаптацию к изменениям экономики, оружия и темпа CS2 meta.",
    evidence: [
      makeEvidence("latest relevant patch", "meta", 1, economyMeta?.patchName ?? "none", economyMeta?.patchName ?? "none", "Major meta shift повышает важность adaptation score.")
    ]
  });
}
