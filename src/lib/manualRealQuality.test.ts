import { describe, expect, it } from "vitest";
import {
  calculateManualBlockQuality,
  calculateManualRealPackQuality,
  detectManualRealPlaceholderPayload,
  manualQualityAllowsReadiness
} from "./manualRealQuality";

describe("manual real block quality", () => {
  it("treats raw-only or missing metadata as not readiness-unlocking", () => {
    const quality = calculateManualBlockQuality("player_stats", {}, true);
    expect(quality.status).not.toBe("valid");
    expect(manualQualityAllowsReadiness(quality)).toBe(false);
  });

  it("accepts missing sourceUrl but lowers confidence through warnings", () => {
    const quality = calculateManualBlockQuality("map_stats", {
      sourceName: "Manual sheet",
      collectedAt: "2026-05-13T00:00:00Z",
      period: "last_90_days",
      sampleSize: 14,
      confidence: 0.72,
      notes: "verified"
    }, true);
    expect(quality.status).toBe("valid");
    expect(quality.warnings.join(" ")).toContain("sourceUrl missing");
  });

  it("keeps low confidence manual data partial", () => {
    const quality = calculateManualBlockQuality("veto_history", {
      sourceName: "Manual sheet",
      collectedAt: "2026-05-13T00:00:00Z",
      period: "last_90_days",
      sampleSize: 20,
      confidence: 0.4,
      notes: "uncertain"
    }, true);
    expect(quality.status).toBe("partial");
    expect(manualQualityAllowsReadiness(quality)).toBe(false);
  });

  it("marks stale and expired manual data", () => {
    const stale = calculateManualBlockQuality("player_stats", {
      sourceName: "Manual sheet",
      collectedAt: "2026-03-01T00:00:00Z",
      period: "last_30_days",
      sampleSize: 10,
      confidence: 0.8
    }, true);
    const expired = calculateManualBlockQuality("player_stats", {
      sourceName: "Manual sheet",
      collectedAt: "2026-01-01T00:00:00Z",
      period: "last_30_days",
      sampleSize: 10,
      confidence: 0.8
    }, true);
    expect(stale.freshness).toBe("stale");
    expect(expired.freshness).toBe("expired");
    expect(manualQualityAllowsReadiness(expired)).toBe(false);
  });

  it("rejects template/default manual_real payloads before apply", () => {
    const detected = detectManualRealPlaceholderPayload({
      type: "manual_real_pack",
      source: "manual_real",
      metadata: { sourceName: "", sampleSize: 0 },
      rosters: { "Team Name": ["player1", "player2", "player3"] },
      playerStats: []
    });
    expect(detected.isPlaceholder).toBe(true);
    expect(detected.reasons.join(" ")).toContain("placeholder");
  });

  it("does not treat optional empty H2H/news arrays as fake when required pack blocks are filled", () => {
    const detected = detectManualRealPlaceholderPayload({
      type: "manual_real_pack",
      sourceName: "Verified analyst sheet",
      collectedAt: "2026-05-12T00:00:00Z",
      period: "last_30_days",
      sampleSize: 20,
      confidence: 0.8,
      rosters: {
        "Team A": ["A1", "A2", "A3", "A4", "A5"],
        "Team B": ["B1", "B2", "B3", "B4", "B5"]
      },
      playerStats: [{ team: "Team A", nickname: "A1", kd: 1.1, rating: 1.05, adr: 76, kast: 72, maps: 10 }],
      mapStats: [{ team: "Team A", mapName: "Mirage", mapsPlayed: 10, winRate: 55, pickRate: 20, banRate: 10 }],
      vetoHistory: [{ team: "Team A", mapName: "Mirage", pickRate: 20, banRate: 10, deciderRate: 15, sampleSize: 10 }],
      h2h: [],
      news: []
    });
    expect(detected.isPlaceholder).toBe(false);
  });

  it("calculates full pack quality thresholds", () => {
    const valid = calculateManualBlockQuality("player_stats", {
      sourceName: "Verified manual source",
      sourceUrl: "https://example.test",
      collectedAt: "2026-05-13T00:00:00Z",
      period: "last_90_days",
      sampleSize: 20,
      confidence: 0.82
    }, true);
    const low = calculateManualBlockQuality("player_stats", {
      sourceName: "Low confidence source",
      collectedAt: "2026-05-13T00:00:00Z",
      period: "last_90_days",
      sampleSize: 1,
      confidence: 0.3
    }, true);
    const full = calculateManualRealPackQuality({
      roster: valid,
      playerStats: valid,
      mapStats: valid,
      veto: valid,
      h2h: valid,
      news: valid,
      rosterComplete: true,
      playerStatsComplete: true,
      mapStatsComplete: true,
      vetoComplete: true,
      h2hPresent: true,
      newsChecked: true
    });
    const weak = calculateManualRealPackQuality({
      roster: low,
      playerStats: low,
      mapStats: low,
      veto: low,
      rosterComplete: true,
      playerStatsComplete: false,
      mapStatsComplete: false,
      vetoComplete: false
    });
    expect(full.score).toBeGreaterThanOrEqual(65);
    expect(full.canReachL3).toBe(true);
    expect(weak.score).toBeLessThan(40);
    expect(weak.canReachL3).toBe(false);
  });
});
