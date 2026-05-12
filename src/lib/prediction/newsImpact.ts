import type { NewsEntity, PredictionFactorOutput, PredictionInput } from "./types";
import { clamp } from "./normalization";
import { makeEvidence, makeFactor } from "./utils";

export function newsClamp(news: Pick<NewsEntity, "reliability" | "impactScore" | "isRumor" | "isOfficial" | "maxAllowedImpact">) {
  const reliability = news.reliability.toLowerCase();
  const max =
    news.isOfficial || reliability.includes("official")
      ? 12
      : reliability.includes("confirmed")
        ? 8
        : reliability.includes("reliable")
          ? 5
          : news.isRumor || reliability.includes("rumor")
            ? 3
            : Math.min(news.maxAllowedImpact || 3, 3);
  return clamp(news.impactScore, -max, max);
}

export function newsImpactFactor(input: PredictionInput): PredictionFactorOutput {
  const teamANews = input.news.filter((item) => item.teamId === input.teamA.id);
  const teamBNews = input.news.filter((item) => item.teamId === input.teamB.id);
  const aImpact = clamp(teamANews.reduce((sum, item) => sum + newsClamp(item), 0), -12, 12);
  const bImpact = clamp(teamBNews.reduce((sum, item) => sum + newsClamp(item), 0), -12, 12);
  const rumorCount = input.news.filter((item) => item.isRumor).length;

  return makeFactor({
    factorName: "News Impact",
    factorGroup: "news",
    weight: input.modelWeights.newsImpact,
    teamAValue: aImpact,
    teamBValue: bImpact,
    scale: 12,
    confidence: rumorCount > 0 ? 0.48 : 0.72,
    explanation: "Новости ограничены clamps; спорные слухи больше повышают risk, чем меняют победителя.",
    evidence: [
      makeEvidence("clamped news impact", "last_7_days", teamANews.length + teamBNews.length, aImpact, bImpact, "Total news impact clamp: ±12%."),
      makeEvidence("rumor count", "last_7_days", rumorCount, rumorCount, rumorCount, "Слухи имеют отдельные clamps и снижают confidence.")
    ],
    warnings: rumorCount > 0 ? ["Есть rumor/news uncertainty: risk повышен, probability movement ограничен."] : []
  });
}
