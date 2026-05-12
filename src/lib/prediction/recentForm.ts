import type { PredictionFactorOutput, PredictionInput } from "./types";
import { sampleSizeConfidence } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function recentFormFactor(input: PredictionInput): PredictionFactorOutput {
  const a = input.teamFormA;
  const b = input.teamFormB;
  const scoreA = a
    ? a.formScore * 0.35 + a.mapWinRate * 0.3 + a.roundWinRate * 0.2 + a.opponentStrengthAdjustedForm * 0.15
    : 0.5;
  const scoreB = b
    ? b.formScore * 0.35 + b.mapWinRate * 0.3 + b.roundWinRate * 0.2 + b.opponentStrengthAdjustedForm * 0.15
    : 0.5;
  const sample = (a?.mapsPlayed ?? 0) + (b?.mapsPlayed ?? 0);
  const warnings = [
    ...(a ? [] : [`Нет свежей формы для ${input.teamA.name}.`]),
    ...(b ? [] : [`Нет свежей формы для ${input.teamB.name}.`])
  ];

  return makeFactor({
    factorName: "Recent Form",
    factorGroup: "form",
    weight: input.modelWeights.recentForm,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.28,
    confidence: sampleSizeConfidence(sample, 60),
    explanation: "Форма учитывает last-30-days formScore, map/round winrate и opponent-adjusted форму.",
    evidence: [
      makeEvidence("formScore", "last_30_days", sample, a?.formScore ?? "missing", b?.formScore ?? "missing", "Свежие карты имеют больший вес."),
      makeEvidence("mapsPlayed", "last_30_days", sample, a?.mapsPlayed ?? 0, b?.mapsPlayed ?? 0, "Малый sample снижает confidence.")
    ],
    warnings
  });
}
