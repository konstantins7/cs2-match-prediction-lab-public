import type { PredictionInput, PredictionOutput } from "./types";

export function generateExplanation(input: PredictionInput, partial: Pick<PredictionOutput, "teamAProbability" | "teamBProbability" | "factors" | "confidenceScore" | "riskLevel">) {
  const topForA = partial.factors
    .filter((factor) => factor.impact > 0.75)
    .sort((a, b) => Math.abs(b.impact * b.weight * b.confidence) - Math.abs(a.impact * a.weight * a.confidence))
    .slice(0, 3);
  const topForB = partial.factors
    .filter((factor) => factor.impact < -0.75)
    .sort((a, b) => Math.abs(b.impact * b.weight * b.confidence) - Math.abs(a.impact * a.weight * a.confidence))
    .slice(0, 3);
  const winner = partial.teamAProbability >= partial.teamBProbability ? input.teamA.name : input.teamB.name;
  const probability = partial.teamAProbability >= partial.teamBProbability ? partial.teamAProbability : partial.teamBProbability;
  const riskNotes = partial.factors.flatMap((factor) => factor.warnings).slice(0, 3);

  return [
    `Модель склоняется к ${winner}: ${probability}% вероятности, confidence ${partial.confidenceScore}/100, risk ${partial.riskLevel}.`,
    topForA.length > 0 ? `Плюсы ${input.teamA.name}: ${topForA.map((factor) => factor.factorName).join(", ")}.` : "",
    topForB.length > 0 ? `Плюсы ${input.teamB.name}: ${topForB.map((factor) => factor.factorName).join(", ")}.` : "",
    riskNotes.length > 0 ? `Ключевые риски: ${riskNotes.join(" ")}` : "Крупных warning-сигналов мало, но прогноз остаётся вероятностным.",
    "Это исследовательская аналитика, а не гарантия результата."
  ]
    .filter(Boolean)
    .join(" ");
}
