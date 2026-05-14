import type { NewsEntity, PredictionInput } from "@/lib/prediction/types";

export type NewsTier = "official" | "media_reference" | "insider" | "rumor" | "unknown";

export type NewsUsage = {
  item: NewsEntity;
  tier: NewsTier;
  maxImpact: number;
  signedImpact: number;
  clampedImpact: number;
  risk: number;
  confidence: number;
  usedInPrediction: boolean;
  reasonIfNotUsed: string;
  freshnessDays: number | null;
  expired: boolean;
};

export type NewsTeamImpact = {
  teamId: string;
  itemIds: string[];
  totalImpact: number;
  totalRisk: number;
  confirmedImpact: number;
  rumorImpact: number;
  confidence: number;
  warnings: string[];
  usages: NewsUsage[];
};

export type NewsImpactSummary = {
  teamA: NewsTeamImpact;
  teamB: NewsTeamImpact;
  allUsages: NewsUsage[];
  warnings: string[];
  riskSummary: string[];
  expiredIgnored: number;
  rumorCount: number;
};

export const NEWS_EVENT_TYPES = [
  "roster_change",
  "stand_in",
  "player_illness",
  "visa_issue",
  "travel_issue",
  "coach_change",
  "igl_change",
  "role_change",
  "map_pool_change",
  "bootcamp",
  "internal_conflict",
  "motivation_boost",
  "recent_trophy",
  "heavy_loss_tilt",
  "disband_rumor",
  "transfer_rumor",
  "contract_issue",
  "technical_issue",
  "unknown"
] as const;

export const NEWS_SOURCE_TYPES = [
  "official_team",
  "official_player",
  "official_tournament",
  "official_valve",
  "media_reference",
  "hltv_manual_reference",
  "telegram_insider_manual",
  "telegram_channel_manual",
  "x_twitter_manual",
  "community_rumor",
  "manual_note"
] as const;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dateOrNull(value?: Date | string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function normalized(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeNewsTier(item: Pick<NewsEntity, "sourceTier" | "reliability" | "isOfficial" | "isRumor" | "source" | "sourceMode"> & { sourceType?: string | null }): NewsTier {
  const sourceTier = normalized(item.sourceTier);
  const reliability = normalized(item.reliability);
  const source = normalized(item.source);
  const sourceMode = normalized(item.sourceMode);
  const sourceType = normalized(item.sourceType);
  if (item.isOfficial || sourceTier.includes("official") || sourceType.startsWith("official_") || reliability.includes("official")) return "official";
  if (reliability.includes("confirmed")) return "media_reference";
  if (reliability.includes("reliable")) return "insider";
  if (sourceTier.includes("insider") || sourceType.includes("insider") || source.includes("telegram") || reliability.includes("insider")) return "insider";
  if (item.isRumor || sourceTier.includes("rumor") || sourceTier.includes("social") || sourceType.includes("rumor") || reliability.includes("rumor")) return "rumor";
  if (sourceTier.includes("media") || sourceTier.includes("reference") || sourceType.includes("reference") || sourceMode === "manual_reference" || source.includes("hltv")) return "media_reference";
  return "unknown";
}

export function maxImpactForTier(tier: NewsTier) {
  if (tier === "official") return 12;
  if (tier === "media_reference") return 8;
  if (tier === "insider") return 5;
  if (tier === "rumor") return 3;
  return 2;
}

export function maxImpactForNews(item: NewsEntity) {
  const tier = normalizeNewsTier(item);
  return Math.min(maxImpactForTier(tier), Math.max(0, Number(item.maxAllowedImpact || maxImpactForTier(tier))));
}

function reliabilityScore(item: NewsEntity) {
  const explicit = Number(item.confidence ?? item.reliability);
  if (Number.isFinite(explicit)) {
    return explicit > 1 ? clamp(explicit / 100, 0, 1) : clamp(explicit, 0, 1);
  }
  const text = normalized(item.reliability);
  if (item.isOfficial || text.includes("official")) return 0.95;
  if (item.isConfirmed || text.includes("confirmed")) return 0.82;
  if (text.includes("reliable")) return 0.72;
  if (item.isRumor || text.includes("rumor")) return 0.32;
  return 0.5;
}

function signedImpact(item: NewsEntity) {
  const raw = Number(item.impactScore ?? 0);
  const direction = normalized(item.impactDirection);
  if (direction === "positive") return Math.abs(raw);
  if (direction === "negative") return -Math.abs(raw);
  if (direction === "neutral") return raw;
  return raw;
}

export function evaluateNewsItem(item: NewsEntity, now = new Date()): NewsUsage {
  const tier = normalizeNewsTier(item);
  const maxImpact = maxImpactForTier(tier);
  const publishedAt = dateOrNull(item.publishedAt);
  const expiresAt = dateOrNull(item.expiresAt);
  const expired = Boolean(expiresAt && expiresAt.getTime() < now.getTime());
  const confidence = reliabilityScore(item);
  const signed = signedImpact(item);
  const clamped = expired ? 0 : clamp(signed, -maxImpact, maxImpact);
  const rumorMultiplier = item.isRumor || tier === "rumor" ? 1.65 : 1;
  const lowReliabilityPenalty = confidence < 0.45 ? 1.25 : 1;
  const risk = expired ? 0 : clamp(Math.abs(Number(item.riskScore ?? clamped)) * rumorMultiplier * lowReliabilityPenalty, 0, 12);
  const usedInPrediction = Boolean(item.isActive !== false && !expired && confidence >= 0.2);
  const reasonIfNotUsed =
    item.isActive === false
      ? "inactive"
      : expired
        ? "expired"
        : confidence < 0.2
          ? "reliability too low"
          : "";
  return {
    item,
    tier,
    maxImpact,
    signedImpact: signed,
    clampedImpact: usedInPrediction ? clamped : 0,
    risk,
    confidence,
    usedInPrediction,
    reasonIfNotUsed,
    freshnessDays: publishedAt ? daysBetween(publishedAt, now) : null,
    expired
  };
}

function teamImpact(teamId: string, usages: NewsUsage[]) {
  const teamUsages = usages.filter((usage) => usage.item.teamId === teamId);
  const used = teamUsages.filter((usage) => usage.usedInPrediction);
  const totalImpact = clamp(used.reduce((sum, usage) => sum + usage.clampedImpact, 0), -12, 12);
  const totalRisk = clamp(used.reduce((sum, usage) => sum + usage.risk, 0), 0, 12);
  const confirmedImpact = clamp(used.filter((usage) => usage.item.isConfirmed || usage.tier === "official").reduce((sum, usage) => sum + usage.clampedImpact, 0), -12, 12);
  const rumorImpact = clamp(used.filter((usage) => usage.item.isRumor || usage.tier === "rumor").reduce((sum, usage) => sum + usage.clampedImpact, 0), -12, 12);
  const confidence = used.length ? clamp(used.reduce((sum, usage) => sum + usage.confidence, 0) / used.length, 0, 1) : 0.5;
  const warnings = [
    used.some((usage) => usage.tier === "rumor") ? "Есть неподтверждённые rumor/news signals: risk повышен, probability movement ограничен." : null,
    used.some((usage) => usage.confidence < 0.45) ? "Часть news сигналов имеет низкую reliability, confidence снижен." : null
  ].filter(Boolean) as string[];
  return {
    teamId,
    itemIds: teamUsages.map((usage) => usage.item.id ?? `${usage.item.title}-${usage.item.publishedAt}`),
    totalImpact,
    totalRisk,
    confirmedImpact,
    rumorImpact,
    confidence,
    warnings,
    usages: teamUsages
  };
}

export function calculateNewsImpact(input: Pick<PredictionInput, "teamA" | "teamB" | "news">, now = new Date()): NewsImpactSummary {
  return calculateNewsImpactForTeamIds(input.teamA.id, input.teamB.id, input.news, now);
}

export function calculateNewsImpactForTeamIds(teamAId: string, teamBId: string, news: NewsEntity[], now = new Date()): NewsImpactSummary {
  const allUsages = news.map((item) => evaluateNewsItem(item, now));
  const teamA = teamImpact(teamAId, allUsages);
  const teamB = teamImpact(teamBId, allUsages);
  const rumorCount = allUsages.filter((usage) => usage.item.isRumor || usage.tier === "rumor").length;
  const expiredIgnored = allUsages.filter((usage) => usage.expired).length;
  const warnings = [...teamA.warnings, ...teamB.warnings];
  if (expiredIgnored > 0) warnings.push(`${expiredIgnored} expired news item(s) ignored for probability.`);
  if (!allUsages.length) warnings.push("Новостей не найдено.");
  const riskSummary = [
    allUsages.some((usage) => usage.tier === "official" && usage.usedInPrediction) ? "Есть официальная новость, влияющая на риск/уверенность." : null,
    allUsages.some((usage) => usage.tier === "insider" && usage.usedInPrediction && !usage.item.isConfirmed) ? "Есть неподтверждённый инсайд." : null,
    expiredIgnored > 0 ? "Устаревшие новости показаны как ignored и не влияют на probability." : null,
    allUsages.length === 0 ? "Новостей не найдено." : null
  ].filter(Boolean) as string[];
  return { teamA, teamB, allUsages, warnings: [...new Set(warnings)], riskSummary, expiredIgnored, rumorCount };
}

export function groupNewsForUi(news: NewsEntity[], now = new Date()) {
  const usages = news.map((item) => evaluateNewsItem(item, now));
  return {
    official: usages.filter((usage) => usage.tier === "official" && !usage.expired),
    media: usages.filter((usage) => usage.tier === "media_reference" && !usage.expired),
    insider: usages.filter((usage) => usage.tier === "insider" && !usage.expired),
    rumor: usages.filter((usage) => usage.tier === "rumor" && !usage.expired),
    expired: usages.filter((usage) => usage.expired || !usage.usedInPrediction)
  };
}
