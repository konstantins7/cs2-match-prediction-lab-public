import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function closingFactor(input: PredictionInput): PredictionFactorOutput {
  const a = input.teamFormA;
  const b = input.teamFormB;
  const scoreA = a ? a.closeOutRate * 0.3 + a.mapPointConversion * 0.25 + a.leadProtectionScore * 0.25 + a.seriesCloseOutRate * 0.2 - a.lostFromWinningPositionRate * 0.2 : 0.5;
  const scoreB = b ? b.closeOutRate * 0.3 + b.mapPointConversion * 0.25 + b.leadProtectionScore * 0.25 + b.seriesCloseOutRate * 0.2 - b.lostFromWinningPositionRate * 0.2 : 0.5;

  return makeFactor({
    factorName: "Closing Ability",
    factorGroup: "pressure",
    weight: input.modelWeights.closing,
    teamAValue: scoreA,
    teamBValue: scoreB,
    scale: 0.24,
    confidence: 0.68,
    explanation: "Показывает, умеет ли команда закрывать карты и серии после преимущества.",
    evidence: [
      makeEvidence("closeOutRate", "last_30_days", (a?.mapsPlayed ?? 0) + (b?.mapsPlayed ?? 0), a?.closeOutRate ?? "missing", b?.closeOutRate ?? "missing", "Закрытие преимущества."),
      makeEvidence("lostFromWinningPositionRate", "last_30_days", (a?.mapsPlayed ?? 0) + (b?.mapsPlayed ?? 0), a?.lostFromWinningPositionRate ?? "missing", b?.lostFromWinningPositionRate ?? "missing", "Частые камбэки соперника снижают фактор.")
    ]
  });
}
