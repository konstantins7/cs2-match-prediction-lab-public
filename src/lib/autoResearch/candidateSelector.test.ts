import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateMatchPriority } from "../proFocus";
import { calculatePrediction } from "../prediction/calculatePrediction";
import { createPredictionFixture } from "../prediction/testFixtures";
import type { PredictionInput } from "../prediction/types";
import { rankForecastAutopilotCandidates, scoreForecastAutopilotCandidate } from "./candidateSelector";
import { summarizeRealDataFoundationCoverage } from "./foundationCoverage";

const now = new Date("2026-05-10T08:00:00.000Z");

function score(input: PredictionInput) {
  const prediction = calculatePrediction(input);
  const priority = calculateMatchPriority({ ...input.match, teamA: input.teamA, teamB: input.teamB }, now);
  return scoreForecastAutopilotCandidate({ input, prediction, priority, now });
}

function manualReadyInput(overrides: Partial<PredictionInput> = {}) {
  const base = createPredictionFixture();
  const sourceRecord = {
    id: "manual_ready",
    source: "manual",
    entityType: "manual_real_manual_real_pack",
    entityId: base.match.id,
    rawJson: JSON.stringify({
      type: "manual_real_pack",
      metadata: {
        sourceName: "Verified analyst sheet",
        sourceUrl: "https://example.test/source",
        collectedAt: "2026-05-09T00:00:00Z",
        period: "last_90_days",
        sampleSize: 24,
        confidence: 0.84
      }
    }),
    fetchedAt: "2026-05-09T00:00:00Z",
    sourceConfidence: 0.84
  };
  return createPredictionFixture({
    match: { ...base.match, sourceMode: "manual_real", dataQualityScore: 82 },
    playersA: base.playersA.map((player) => ({ ...player, sourceMode: "manual_real", matchId: base.match.id, sourceRecordId: sourceRecord.id, sourceConfidence: 0.84 })),
    playersB: base.playersB.map((player) => ({ ...player, sourceMode: "manual_real", matchId: base.match.id, sourceRecordId: sourceRecord.id, sourceConfidence: 0.84 })),
    playerStatsA: base.playerStatsA.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    playerStatsB: base.playerStatsB.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    mapStatsA: base.mapStatsA.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    mapStatsB: base.mapStatsB.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    vetoPatternsA: base.vetoPatternsA.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    vetoPatternsB: base.vetoPatternsB.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: sourceRecord.id })),
    manualSourceRecords: [sourceRecord],
    ...overrides
  });
}

describe("MVP 0.7.6 automated legal data autopilot candidate selector", () => {
  it("scores a ready legal match without changing Real Forecast gates", () => {
    const candidate = score(manualReadyInput());
    expect(candidate.coverageScore).toBeGreaterThanOrEqual(80);
    expect(candidate.forecastabilityTier).toBe("READY");
    expect(candidate.realForecastReady).toBe(true);
    expect(candidate.coverageBreakdown.map((entry) => entry.id)).toEqual([
      "fixture",
      "format",
      "rank_basic",
      "roster",
      "player_stats",
      "map_stats",
      "veto",
      "freshness_safety",
      "optional_context"
    ]);
  });

  it("does not promise readiness when one team is below the map sample gate", () => {
    const input = createPredictionFixture({
      mapStatsA: [{ ...createPredictionFixture().mapStatsA[0], mapsPlayed: 4 }],
      match: { ...createPredictionFixture().match, id: "low_map_sample" }
    });
    const candidate = score(input);
    expect(candidate.realForecastReady).toBe(false);
    expect(candidate.forecastabilityTier).not.toBe("READY");
    expect(candidate.blockers).toContain("map stats sample below gate");
    expect(candidate.coverageBreakdown.find((entry) => entry.id === "map_stats")?.explanation).toContain("4/7");
  });

  it("treats missing sourceUrl as a warning, not a hard blocker", () => {
    const input = manualReadyInput();
    const candidate = score(input);
    const freshness = candidate.coverageBreakdown.find((entry) => entry.id === "freshness_safety");
    expect(candidate.forecastabilityTier).not.toBe("BLOCKED");
    expect(freshness?.explanation).toContain("sourceUrl missing lowers source confidence");
    expect(candidate.blockers).not.toContain("sourceUrl missing");
  });

  it("blocks stale, demo, leakage and needs-review candidates", () => {
    const stale = score(createPredictionFixture({ match: { ...createPredictionFixture().match, id: "stale", startTime: "2026-05-01T08:00:00.000Z" } }));
    const demo = score(createPredictionFixture({ match: { ...createPredictionFixture().match, id: "demo", sourceMode: "demo" } }));
    const leakage = score(createPredictionFixture({
      playerStatsA: createPredictionFixture().playerStatsA.map((row, index) => index === 0 ? { ...row, dataLeakageCheckPassed: false } : row)
    }));
    const needsReview = score(createPredictionFixture({ teamA: { ...createPredictionFixture().teamA, needsReview: true } }));
    expect(stale.forecastabilityTier).toBe("BLOCKED");
    expect(demo.forecastabilityTier).toBe("BLOCKED");
    expect(leakage.forecastabilityTier).toBe("BLOCKED");
    expect(needsReview.forecastabilityTier).toBe("BLOCKED");
  });

  it("selects the best coverage match instead of a fixed target", () => {
    const fixedTarget = score(createPredictionFixture({
      match: { ...createPredictionFixture().match, id: "pandascore_match_1488973" },
      mapStatsA: [{ ...createPredictionFixture().mapStatsA[0], mapsPlayed: 4 }]
    }));
    const better = score(createPredictionFixture({
      match: { ...createPredictionFixture().match, id: "better_match", startTime: "2026-05-11T18:00:00.000Z" }
    }));
    const [selected] = rankForecastAutopilotCandidates([fixedTarget, better]);
    expect(selected.matchId).toBe("better_match");
    expect(selected.matchId).not.toBe("pandascore_match_1488973");
    expect(selected.whySelected).toBeTruthy();
    expect(rankForecastAutopilotCandidates([fixedTarget, better])[1].whyNotSelected).toContain("Не выбран");
  });

  it("ranks high-coverage NEARLY_READY above lower-coverage BASIC_ONLY", () => {
    const nearlyReadyInput = manualReadyInput({ match: { ...createPredictionFixture().match, id: "nearly_ready_high_coverage" } });
    const nearlyReady = score({ ...nearlyReadyInput, mapStatsA: [{ ...nearlyReadyInput.mapStatsA[0], mapsPlayed: 4 }] });
    const basicOnly = score(createPredictionFixture({
      match: { ...createPredictionFixture().match, id: "basic_only_low_coverage", startTime: "2026-05-11T18:00:00.000Z" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    }));
    const [selected] = rankForecastAutopilotCandidates([basicOnly, nearlyReady]);
    expect(nearlyReady.forecastabilityTier).toBe("NEARLY_READY");
    expect(basicOnly.forecastabilityTier).toBe("BASIC_ONLY");
    expect(selected.matchId).toBe("nearly_ready_high_coverage");
    expect(nearlyReady.coverageScore).toBeGreaterThan(basicOnly.coverageScore);
  });

  it("keeps READY above NEARLY_READY and BLOCKED below usable candidates", () => {
    const ready = score(manualReadyInput({ match: { ...createPredictionFixture().match, id: "ready_match" } }));
    const nearlyReadyInput = manualReadyInput({ match: { ...createPredictionFixture().match, id: "nearly_ready_match" } });
    const nearlyReady = score({ ...nearlyReadyInput, mapStatsA: [{ ...nearlyReadyInput.mapStatsA[0], mapsPlayed: 4 }] });
    const blocked = score(createPredictionFixture({
      match: { ...createPredictionFixture().match, id: "blocked_match", startTime: "2026-05-01T08:00:00.000Z" }
    }));
    const ranked = rankForecastAutopilotCandidates([blocked, nearlyReady, ready]);
    expect(ranked[0].matchId).toBe("ready_match");
    expect(ranked[1].matchId).toBe("nearly_ready_match");
    expect(ranked[2].matchId).toBe("blocked_match");
  });

  it("summarizes real-data foundation coverage and next actions", () => {
    const nearlyReadyInput = manualReadyInput({ match: { ...createPredictionFixture().match, id: "evo_like" } });
    const nearlyReady = score({ ...nearlyReadyInput, mapStatsA: [{ ...nearlyReadyInput.mapStatsA[0], mapsPlayed: 4 }] });
    const basicOnly = score(createPredictionFixture({
      match: { ...createPredictionFixture().match, id: "empty_foundation", startTime: "2026-05-11T18:00:00.000Z" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    }));
    const summary = summarizeRealDataFoundationCoverage(rankForecastAutopilotCandidates([basicOnly, nearlyReady]));
    expect(summary.tierCounts.NEARLY_READY).toBe(1);
    expect(summary.tierCounts.BASIC_ONLY).toBe(1);
    expect(summary.coverageCounts.roster).toBe(1);
    expect(summary.coverageCounts.playerStats).toBe(1);
    expect(summary.coverageCounts.mapStats).toBe(0);
    expect(summary.coverageCounts.veto).toBe(1);
    expect(summary.topBlockers).toContain("map stats sample below gate");
    expect(nearlyReady.nextDataActions[0].label).toContain("map_stats.csv");
    expect(nearlyReady.nextDataActions[0].reason).toContain("4/7");
    expect(nearlyReady.nextDataActions.some((action) => action.target === "source_url")).toBe(true);
  });

  it("keeps Leetify optional unless explicit context is already present", () => {
    const withoutLeetify = score(createPredictionFixture());
    const withLeetify = score(createPredictionFixture({
      manualSourceRecords: [{
        id: "leetify_context",
        source: "leetify",
        entityType: "player",
        entityId: "teamA_p1",
        rawJson: "{}",
        fetchedAt: now,
        sourceConfidence: 0.6
      }]
    }));
    expect(withoutLeetify.providerContributions.find((entry) => entry.source === "Leetify")?.status).toBe("unavailable");
    expect(withLeetify.providerContributions.find((entry) => entry.source === "Leetify")?.status).toBe("partial");
  });

  it("does not contain crawler, fake data or unsupported GRID API paths", () => {
    const source = readFileSync("src/lib/autoResearch/candidateSelector.ts", "utf8").toLowerCase();
    expect(source).not.toContain("apify");
    expect(source).not.toContain("puppeteer");
    expect(source).not.toContain("playwright");
    expect(source).not.toContain("series events");
    expect(source).not.toContain("file download");
    expect(source).not.toContain("stats feed");
    expect(source).not.toContain("fake");
  });
});
