import type { NewsEntity, PredictionFactorOutput, PredictionInput } from "./types";
import { calculateNewsImpact, evaluateNewsItem } from "@/lib/news/newsImpact";
import { makeEvidence, makeFactor } from "./utils";

export function newsClamp(news: Pick<NewsEntity, "reliability" | "impactScore" | "isRumor" | "isOfficial" | "maxAllowedImpact">) {
  return evaluateNewsItem(news as NewsEntity).clampedImpact;
}

export function newsImpactFactor(input: PredictionInput): PredictionFactorOutput {
  const summary = calculateNewsImpact(input);
  const aImpact = summary.teamA.totalImpact;
  const bImpact = summary.teamB.totalImpact;
  const totalCount = summary.teamA.usages.length + summary.teamB.usages.length;
  const confidence = Math.min(summary.teamA.confidence, summary.teamB.confidence);

  return makeFactor({
    factorName: "News Impact",
    factorGroup: "news",
    weight: input.modelWeights.newsImpact,
    teamAValue: aImpact,
    teamBValue: bImpact,
    scale: 12,
    confidence: summary.rumorCount > 0 ? Math.min(confidence, 0.48) : confidence,
    explanation: "Новости ограничены clamps; спорные слухи больше повышают risk, чем меняют победителя.",
    evidence: [
      makeEvidence("clamped news impact", "active_news", totalCount, aImpact, bImpact, "Total news impact clamp: ±12%."),
      makeEvidence("rumor count", "active_news", summary.rumorCount, summary.rumorCount, summary.rumorCount, "Слухи имеют отдельные clamps и снижают confidence."),
      makeEvidence("news risk", "active_news", totalCount, summary.teamA.totalRisk, summary.teamB.totalRisk, "Rumor/low reliability signals mostly raise risk, not probability.")
    ],
    warnings: summary.warnings
  });
}
