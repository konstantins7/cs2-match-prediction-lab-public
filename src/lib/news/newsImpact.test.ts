import { describe, expect, it } from "vitest";
import { calculateNewsImpactForTeamIds, evaluateNewsItem, groupNewsForUi } from "./newsImpact";
import { buildNewsItemPreview, sourceTypeDefaults } from "./manualNews";
import { sourceAdapters } from "../sources";
import { telegramNewsAdapter } from "../sources/telegramNewsAdapter";
import type { NewsEntity } from "../prediction/types";

function news(overrides: Partial<NewsEntity>): NewsEntity {
  return {
    id: `news-${overrides.title ?? "item"}`,
    teamId: "team_a",
    title: "News item",
    summary: "Summary",
    source: "manual_reference",
    publishedAt: "2026-05-13T00:00:00.000Z",
    reliability: "70",
    eventType: "unknown",
    sentiment: "neutral",
    impactScore: 0,
    maxAllowedImpact: 12,
    isRumor: false,
    isOfficial: false,
    isConfirmed: false,
    sourceMode: "manual_reference",
    isActive: true,
    ...overrides
  };
}

describe("news intelligence impact clamps", () => {
  it("clamps official, media/reference, insider, rumor and unknown tiers", () => {
    expect(evaluateNewsItem(news({ isOfficial: true, sourceTier: "official", impactScore: 30 })).clampedImpact).toBe(12);
    expect(evaluateNewsItem(news({ sourceTier: "media_reference", impactScore: 30 })).clampedImpact).toBe(8);
    expect(evaluateNewsItem(news({ sourceTier: "insider", impactScore: 30 })).clampedImpact).toBe(5);
    expect(evaluateNewsItem(news({ isRumor: true, sourceTier: "rumor", impactScore: 30 })).clampedImpact).toBe(3);
    expect(evaluateNewsItem(news({ source: "unknown", sourceMode: "partial", sourceTier: "unknown", impactScore: 30 })).clampedImpact).toBe(2);
  });

  it("rumor increases risk more than probability movement", () => {
    const usage = evaluateNewsItem(news({ isRumor: true, sourceTier: "rumor", impactScore: -9, riskScore: 4, reliability: "35" }));
    expect(Math.abs(usage.clampedImpact)).toBeLessThanOrEqual(3);
    expect(usage.risk).toBeGreaterThan(Math.abs(usage.clampedImpact));
  });

  it("expired news is ignored for probability", () => {
    const usage = evaluateNewsItem(news({ expiresAt: "2026-05-01T00:00:00.000Z", impactScore: 8 }), new Date("2026-05-13T00:00:00.000Z"));
    expect(usage.usedInPrediction).toBe(false);
    expect(usage.reasonIfNotUsed).toBe("expired");
    expect(usage.clampedImpact).toBe(0);
  });

  it("low reliability lowers confidence", () => {
    const usage = evaluateNewsItem(news({ reliability: "15", confidence: 0.15, impactScore: 2 }));
    expect(usage.confidence).toBeLessThan(0.2);
    expect(usage.usedInPrediction).toBe(false);
  });

  it("total NewsImpactSnapshot-style team impact clamps to +/-12", () => {
    const items = Array.from({ length: 5 }, (_, index) => news({ id: `official-${index}`, isOfficial: true, sourceTier: "official", impactScore: 12 }));
    const summary = calculateNewsImpactForTeamIds("team_a", "team_b", items);
    expect(summary.teamA.totalImpact).toBe(12);
  });

  it("groups news tab sections into official/media/insider/rumor/expired", () => {
    const groups = groupNewsForUi([
      news({ id: "official", isOfficial: true, sourceTier: "official" }),
      news({ id: "media", sourceTier: "media_reference" }),
      news({ id: "insider", sourceTier: "insider" }),
      news({ id: "rumor", isRumor: true, sourceTier: "rumor" }),
      news({ id: "expired", expiresAt: "2026-05-01T00:00:00.000Z" })
    ], new Date("2026-05-13T00:00:00.000Z"));
    expect(groups.official).toHaveLength(1);
    expect(groups.media).toHaveLength(1);
    expect(groups.insider).toHaveLength(1);
    expect(groups.rumor).toHaveLength(1);
    expect(groups.expired).toHaveLength(1);
  });
});

describe("manual news source safety", () => {
  it("HLTV manual reference normalizes as media/reference and does not imply scraping", () => {
    const defaults = sourceTypeDefaults("hltv_manual_reference");
    const preview = buildNewsItemPreview({
      sourceName: "HLTV manual reference",
      sourceType: "hltv_manual_reference",
      title: "Manual reference",
      summary: "No scraping",
      publishedAt: "2026-05-13T00:00:00.000Z",
      reliabilityScore: 0.78,
      impactScore: -2
    });
    expect(preview.sourceTier).toBe("media_reference");
    expect(defaults.scrapingAllowed).toBe(false);
    expect(defaults.isManualOnly).toBe(true);
  });

  it("Telegram insider manual normalizes as insider tier", () => {
    const preview = buildNewsItemPreview({
      sourceName: "OverDrive",
      sourceType: "telegram_insider_manual",
      title: "Manual insider",
      summary: "No Telegram scraping",
      publishedAt: "2026-05-13T00:00:00.000Z",
      reliabilityScore: 0.55,
      impactScore: -2
    });
    expect(preview.sourceTier).toBe("insider");
    expect(preview.maxAllowedImpact).toBe(5);
  });

  it("Telegram sync is disabled by default", async () => {
    const previous = process.env.ENABLE_TELEGRAM_NEWS_SYNC;
    delete process.env.ENABLE_TELEGRAM_NEWS_SYNC;
    expect(telegramNewsAdapter.status().enabled).toBe(false);
    const result = await telegramNewsAdapter.sync({ jobType: "manual_news_import" });
    expect(result.status).toBe("disabled");
    process.env.ENABLE_TELEGRAM_NEWS_SYNC = previous;
  });

  it("does not register an HLTV scraping adapter", () => {
    expect(sourceAdapters.some((adapter) => adapter.name.includes("hltv"))).toBe(false);
  });
});
