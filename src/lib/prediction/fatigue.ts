import type { PredictionFactorOutput, PredictionInput } from "./types";
import { makeEvidence, makeFactor } from "./utils";

export function fatigueFactor(input: PredictionInput): PredictionFactorOutput {
  const a = input.teamFormA;
  const b = input.teamFormB;
  const fatigueA = a ? a.fatigueScore * 0.45 + a.travelRiskScore * 0.35 + Math.min(a.mapsLast7Days / 16, 1) * 0.2 : 0.5;
  const fatigueB = b ? b.fatigueScore * 0.45 + b.travelRiskScore * 0.35 + Math.min(b.mapsLast7Days / 16, 1) * 0.2 : 0.5;

  return makeFactor({
    factorName: "Schedule Fatigue",
    factorGroup: "schedule",
    weight: input.modelWeights.fatigue,
    teamAValue: 1 - fatigueA,
    teamBValue: 1 - fatigueB,
    scale: 0.32,
    confidence: 0.62,
    explanation: "Плотность календаря, карты за 7 дней, перелёты и часовой пояс уменьшают прогнозную устойчивость.",
    evidence: [
      makeEvidence("mapsLast7Days", "last_7_days", (a?.mapsLast7Days ?? 0) + (b?.mapsLast7Days ?? 0), a?.mapsLast7Days ?? "missing", b?.mapsLast7Days ?? "missing", "Больше карт за неделю повышает fatigue risk."),
      makeEvidence("travelRiskScore", "last_7_days", 1, a?.travelRiskScore ?? "missing", b?.travelRiskScore ?? "missing", "Перелёты и time-zone shift снижают readiness.")
    ]
  });
}
