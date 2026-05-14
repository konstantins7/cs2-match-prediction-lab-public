import { prisma } from "@/lib/prisma";
import { maxImpactForTier, normalizeNewsTier, type NewsTier } from "./newsImpact";
import type { NewsEntity } from "@/lib/prediction/types";

export type ManualNewsSourceType =
  | "official_team"
  | "official_player"
  | "official_tournament"
  | "official_valve"
  | "media_reference"
  | "hltv_manual_reference"
  | "telegram_insider_manual"
  | "telegram_channel_manual"
  | "x_twitter_manual"
  | "community_rumor"
  | "manual_note";

type SaveManualNewsParams = {
  raw: Record<string, unknown>;
  teamId?: string | null;
  playerId?: string | null;
  matchId?: string | null;
  sourceRecordId?: string | null;
  importBatchId?: string | null;
  recordSource?: string;
  sourceMode?: "manual_real" | "manual_reference" | "analyst_sample";
  isActive?: boolean;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "1"].includes(value.toLowerCase());
  return fallback;
}

function asDate(value: unknown, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function detectManualNewsPlaceholder(raw: Record<string, unknown>) {
  const values = [
    raw.title,
    raw.summary,
    raw.sourceName,
    raw.affectedTeam,
    raw.affectedPlayer,
    raw.sourceUrl,
    raw.url,
    raw.hltvUrl,
    raw.telegramPostUrl
  ].filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase());
  const placeholders = ["roster update", "short official note", "official team site", "team name", "example"];
  const reasons: string[] = [];
  for (const placeholder of placeholders) {
    if (values.some((value) => value === placeholder || value.includes(placeholder))) reasons.push(`placeholder news value: ${placeholder}`);
  }
  if (!asString(raw.sourceName)) reasons.push("sourceName is empty.");
  if (!asString(raw.summary)) reasons.push("summary is empty.");
  if (values.some((value) => value === "https://www.hltv.org/news/..." || value === "https://t.me/..." || value.endsWith("/..."))) reasons.push("template URL detected.");
  return {
    isPlaceholder: reasons.length > 0,
    reasons: [...new Set(reasons)]
  };
}

export function tierFromSourceType(sourceType: string, sourceTier?: string) {
  const explicit = asString(sourceTier).toLowerCase();
  if (explicit.includes("official")) return "official";
  if (explicit.includes("insider")) return "insider";
  if (explicit.includes("rumor") || explicit.includes("social")) return "rumor";
  if (explicit.includes("media") || explicit.includes("reference")) return "media_reference";
  const normalized = sourceType.toLowerCase();
  if (normalized.startsWith("official_")) return "official";
  if (normalized === "hltv_manual_reference" || normalized === "media_reference") return "media_reference";
  if (normalized.includes("telegram") && normalized.includes("insider")) return "insider";
  if (normalized.includes("rumor")) return "rumor";
  return "unknown";
}

export function sourceTypeDefaults(sourceType: string) {
  const tier = tierFromSourceType(sourceType);
  return {
    tier,
    reliabilityBase: tier === "official" ? 0.95 : tier === "media_reference" ? 0.78 : tier === "insider" ? 0.55 : tier === "rumor" ? 0.28 : 0.5,
    isOfficial: tier === "official",
    isInsider: tier === "insider",
    isManualOnly: true,
    scrapingAllowed: false,
    apiAllowed: false
  };
}

export function buildNewsItemPreview(raw: Record<string, unknown>, params: SaveManualNewsParams = { raw }) {
  const sourceType = asString(raw.sourceType, "manual_note");
  const sourceTier = tierFromSourceType(sourceType, asString(raw.sourceTier));
  const isOfficial = asBoolean(raw.isOfficial, sourceTier === "official");
  const isRumor = asBoolean(raw.isRumor, sourceTier === "rumor");
  const isConfirmed = asBoolean(raw.isConfirmed, isOfficial || sourceTier === "media_reference");
  const reliabilityScore = asNumber(raw.reliabilityScore ?? raw.confidence, sourceTypeDefaults(sourceType).reliabilityBase);
  const confidence = reliabilityScore > 1 ? reliabilityScore / 100 : reliabilityScore;
  const impactDirection = asString(raw.impactDirection, asNumber(raw.impactScore, 0) > 0 ? "positive" : asNumber(raw.impactScore, 0) < 0 ? "negative" : "neutral");
  const newsLike = {
    reliability: asString(raw.reliability, String(Math.round(confidence * 100))),
    sourceTier,
    isOfficial,
    isRumor,
    source: params.recordSource ?? asString(raw.sourceName, "manual_news"),
    sourceMode: params.sourceMode ?? (sourceType === "hltv_manual_reference" || sourceType.includes("telegram") ? "manual_reference" : "manual_real"),
    impactScore: asNumber(raw.impactScore, 0),
    maxAllowedImpact: maxImpactForTier(sourceTier as NewsTier)
  } as NewsEntity;
  const normalizedTier = normalizeNewsTier(newsLike);
  const maxAllowedImpact = maxImpactForTier(normalizedTier);
  return {
    sourceType,
    sourceTier: normalizedTier,
    isOfficial,
    isRumor,
    isConfirmed,
    confidence: Math.max(0, Math.min(1, confidence)),
    impactDirection,
    maxAllowedImpact
  };
}

export async function upsertNewsSource(raw: Record<string, unknown>) {
  const sourceType = asString(raw.sourceType, "manual_note");
  const sourceName = asString(raw.sourceName, sourceType);
  const defaults = sourceTypeDefaults(sourceType);
  const sourceTier = tierFromSourceType(sourceType, asString(raw.sourceTier));
  const existing = await prisma.newsSource.findFirst({
    where: {
      name: sourceName,
      sourceType,
      handle: asString(raw.handle) || null
    }
  });
  const data = {
    name: sourceName,
    sourceType,
    sourceTier,
    url: asString(raw.sourceUrl ?? raw.url) || null,
    handle: asString(raw.handle) || null,
    platform: asString(raw.platform, sourceType.includes("telegram") ? "telegram" : sourceType.includes("x_twitter") ? "x/twitter" : "manual"),
    reliabilityBase: asNumber(raw.reliabilityScore ?? raw.confidence, defaults.reliabilityBase),
    isOfficial: asBoolean(raw.isOfficial, defaults.isOfficial),
    isInsider: asBoolean(raw.isInsider, defaults.isInsider),
    isManualOnly: true,
    scrapingAllowed: false,
    apiAllowed: asBoolean(raw.apiAllowed, false),
    notes: asString(raw.notes) || null
  };
  if (existing) return prisma.newsSource.update({ where: { id: existing.id }, data });
  return prisma.newsSource.create({ data });
}

export async function saveManualNewsItem(params: SaveManualNewsParams) {
  if (params.sourceMode !== "analyst_sample") {
    const placeholder = detectManualNewsPlaceholder(params.raw);
    if (placeholder.isPlaceholder) {
      throw new Error(`Похоже, что это шаблон, а не реальные новости. ${placeholder.reasons.join(" ")}`);
    }
  }
  const source = await upsertNewsSource(params.raw);
  const preview = buildNewsItemPreview(params.raw, params);
  const sourceMode = params.sourceMode ?? (preview.sourceType === "hltv_manual_reference" || preview.sourceType.includes("telegram") ? "manual_reference" : "manual_real");
  const impactScore = asNumber(params.raw.impactScore, 0);
  return prisma.newsItem.create({
    data: {
      sourceId: source.id,
      teamId: params.teamId ?? null,
      playerId: params.playerId ?? null,
      title: asString(params.raw.title, "Manual news note"),
      summary: asString(params.raw.summary),
      source: params.recordSource ?? sourceMode,
      url: asString(params.raw.sourceUrl ?? params.raw.url ?? params.raw.hltvUrl ?? params.raw.telegramPostUrl) || null,
      publishedAt: asDate(params.raw.publishedAt),
      collectedAt: asDate(params.raw.collectedAt, new Date()),
      reliability: asString(params.raw.reliability, String(Math.round(preview.confidence * 100))),
      eventType: asString(params.raw.eventType, "unknown"),
      sourceTier: preview.sourceTier,
      sentiment: impactScore > 0 ? "positive" : impactScore < 0 ? "negative" : "neutral",
      impactDirection: preview.impactDirection,
      impactScore,
      maxAllowedImpact: preview.maxAllowedImpact,
      riskScore: asNumber(params.raw.riskScore, Math.abs(impactScore) * (preview.isRumor ? 1.5 : 0.5)),
      confidence: preview.confidence,
      isRumor: preview.isRumor,
      isOfficial: preview.isOfficial,
      isConfirmed: preview.isConfirmed,
      expiresAt: params.raw.expiresAt ? asDate(params.raw.expiresAt) : null,
      sourceMode,
      rawJson: JSON.stringify(params.raw),
      matchId: params.matchId ?? (typeof params.raw.matchId === "string" ? params.raw.matchId : null),
      importBatchId: params.importBatchId ?? null,
      sourceRecordId: params.sourceRecordId ?? null,
      isActive: params.isActive ?? true,
      updatedAt: new Date()
    }
  });
}
