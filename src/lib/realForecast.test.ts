import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDataSourceRows } from "./data/sourceComparison";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { createPredictionFixture } from "./prediction/testFixtures";

const validRawRecord = {
  id: "manual_valid",
  source: "manual",
  entityType: "manual_real_manual_real_pack",
  entityId: "match_test",
  rawJson: JSON.stringify({
    type: "manual_real_pack",
    source: "manual_real",
    metadata: {
      sourceName: "Verified analyst sheet",
      sourceUrl: "https://example.test/source",
      collectedAt: "2026-05-13T00:00:00Z",
      period: "last_90_days",
      sampleSize: 24,
      confidence: 0.84,
      notes: "isolated unit fixture"
    }
  }),
  fetchedAt: "2026-05-13T00:00:00Z",
  sourceConfidence: 0.84
};

function manualRealFixture() {
  const base = createPredictionFixture();
  return createPredictionFixture({
    match: { ...base.match, sourceMode: "manual_real", dataQualityScore: 82 },
    playersA: base.playersA.map((player) => ({ ...player, sourceMode: "manual_real", matchId: base.match.id, sourceRecordId: validRawRecord.id, sourceConfidence: 0.84 })),
    playersB: base.playersB.map((player) => ({ ...player, sourceMode: "manual_real", matchId: base.match.id, sourceRecordId: validRawRecord.id, sourceConfidence: 0.84 })),
    playerStatsA: base.playerStatsA.map((stat) => ({ ...stat, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    playerStatsB: base.playerStatsB.map((stat) => ({ ...stat, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    mapStatsA: base.mapStatsA.map((stat) => ({ ...stat, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    mapStatsB: base.mapStatsB.map((stat) => ({ ...stat, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    vetoPatternsA: base.vetoPatternsA.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    vetoPatternsB: base.vetoPatternsB.map((row) => ({ ...row, source: "manual_enrichment", matchId: base.match.id, sourceRecordId: validRawRecord.id })),
    manualSourceRecords: [validRawRecord]
  });
}

function parsedDemoFixture(overrides: Record<string, unknown> = {}) {
  const base = createPredictionFixture();
  const lineage = {
    source: "parsed_demo",
    sourceMode: "parsed_demo",
    matchId: base.match.id,
    sourceRecordId: "parsed_demo_raw",
    importBatchId: "parsed_demo_batch",
    isActive: true,
    collectedAt: "2026-05-01T00:00:00Z",
    sourceDate: "2026-05-01T00:00:00Z",
    dataRole: "historical_team_form",
    dataLeakageCheckPassed: true,
    ...overrides
  };
  return createPredictionFixture({
    match: { ...base.match, sourceMode: "parsed_demo", dataQualityScore: 86 },
    playersA: base.playersA.map((player) => ({ ...player, sourceMode: "parsed_demo", matchId: base.match.id, sourceRecordId: "parsed_demo_raw" })),
    playersB: base.playersB.map((player) => ({ ...player, sourceMode: "parsed_demo", matchId: base.match.id, sourceRecordId: "parsed_demo_raw" })),
    playerStatsA: base.playerStatsA.map((stat) => ({ ...stat, ...lineage })),
    playerStatsB: base.playerStatsB.map((stat) => ({ ...stat, ...lineage })),
    mapStatsA: base.mapStatsA.map((stat) => ({ ...stat, ...lineage })),
    mapStatsB: base.mapStatsB.map((stat) => ({ ...stat, ...lineage })),
    vetoPatternsA: base.vetoPatternsA.map((row) => ({ ...row, ...lineage })),
    vetoPatternsB: base.vetoPatternsB.map((row) => ({ ...row, ...lineage }))
  });
}

describe("real forecast readiness", () => {
it("keeps package version at 0.9.0", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  expect(pkg.version).toBe("0.9.0");
});

  it("does not promote sample-only L3 to a real forecast", () => {
    const base = createPredictionFixture();
    const sample = calculatePrediction(createPredictionFixture({
      match: { ...base.match, sourceMode: "analyst_sample" },
      playersA: base.playersA.map((player) => ({ ...player, sourceMode: "analyst_sample", matchId: base.match.id })),
      playersB: base.playersB.map((player) => ({ ...player, sourceMode: "analyst_sample", matchId: base.match.id })),
      playerStatsA: base.playerStatsA.map((stat) => ({ ...stat, source: "analyst_sample", matchId: base.match.id })),
      playerStatsB: base.playerStatsB.map((stat) => ({ ...stat, source: "analyst_sample", matchId: base.match.id })),
      mapStatsA: base.mapStatsA.map((stat) => ({ ...stat, source: "analyst_sample", matchId: base.match.id })),
      mapStatsB: base.mapStatsB.map((stat) => ({ ...stat, source: "analyst_sample", matchId: base.match.id })),
      vetoPatternsA: base.vetoPatternsA.map((row) => ({ ...row, source: "analyst_sample", matchId: base.match.id })),
      vetoPatternsB: base.vetoPatternsB.map((row) => ({ ...row, source: "analyst_sample", matchId: base.match.id }))
    }));
    expect(sample.readiness.level).toBe("L3_ANALYTICAL");
    expect(sample.realForecast.isReady).toBe(false);
    expect(sample.sourceLevel).toBe("Sample only");
    expect(sample.realForecast.sampleOnlyWarning).toContain("SAMPLE DATA");
  });

  it("does not claim a first real forecast without validated non-sample evidence", () => {
    const prediction = calculatePrediction(createPredictionFixture());
    expect(prediction.readiness.level).toBe("L3_ANALYTICAL");
    expect(prediction.realForecast.isReady).toBe(false);
    expect(prediction.realForecast.reasons).toContain("Нет validated manual_real / parsed_demo / GRID analytical source.");
  });

  it("does not let FACEIT optional context become Real Forecast Ready by itself", () => {
    const base = createPredictionFixture();
    const prediction = calculatePrediction(createPredictionFixture({
      faceitContextRecords: [{
        id: "faceit_context",
        source: "faceit",
        entityType: "faceit_player_context",
        entityId: "teamA_p1",
        rawJson: JSON.stringify({ sourceMode: "faceit_optional", matchId: base.match.id, payload: { nickname: "A1" } }),
        fetchedAt: "2026-05-01T00:00:00Z",
        sourceConfidence: 0.5
      }]
    }));
    expect(prediction.realForecast.isReady).toBe(false);
    expect(prediction.realForecast.reasons).toContain("Нет validated manual_real / parsed_demo / GRID analytical source.");
    expect(prediction.riskBreakdown.confidenceDrivers.join(" ")).toContain("FACEIT optional context");
  });

  it("allows validated manual_real L3 to become Real Forecast Ready", () => {
    const prediction = calculatePrediction(manualRealFixture());
    expect(prediction.readiness.level).toBe("L3_ANALYTICAL");
    expect(prediction.manualRealPackQuality.score).toBeGreaterThanOrEqual(65);
    expect(prediction.realForecast.isReady).toBe(true);
    expect(prediction.sourceLevel).toBe("Manual real analytical");
  });

  it("allows valid scoped parsed_demo evidence to become a real forecast", () => {
    const prediction = calculatePrediction(parsedDemoFixture());
    expect(prediction.realForecast.isReady).toBe(true);
    expect(prediction.sourceLevel).toBe("Deep data");
  });

  it("excludes parsed_demo evidence that fails leakage checks", () => {
    const prediction = calculatePrediction(parsedDemoFixture({
      sourceDate: "2026-05-12T09:00:00Z",
      dataRole: "post_match_analysis",
      dataLeakageCheckPassed: false
    }));
    expect(prediction.realForecast.isReady).toBe(false);
    expect(prediction.realForecast.reasons).toContain("Data leakage / cutoff check failed.");
  });

  it("prioritizes manual_real over analyst_sample in real forecast mode", () => {
    const input = manualRealFixture();
    const withSampleAlsoPresent = createPredictionFixture({
      ...input,
      playerStatsA: [...input.playerStatsA, ...input.playerStatsA.map((stat) => ({ ...stat, source: "analyst_sample" }))],
      mapStatsA: [...input.mapStatsA, ...input.mapStatsA.map((stat) => ({ ...stat, source: "analyst_sample" }))],
      vetoPatternsA: [...input.vetoPatternsA, ...input.vetoPatternsA.map((row) => ({ ...row, source: "analyst_sample" }))]
    });
    const prediction = calculatePrediction(withSampleAlsoPresent);
    expect(prediction.sourceLevel).toBe("Manual real analytical");
    expect(prediction.realForecast.isReady).toBe(true);
  });

  it("groups source comparison rows as missing, used, and ignored", () => {
    const base = createPredictionFixture();
    const rows = buildDataSourceRows(createPredictionFixture({
      ...manualRealFixture(),
      news: base.news,
      h2h: base.h2h,
      manualSourceRecords: [validRawRecord, {
        ...validRawRecord,
        id: "sample_raw",
        source: "analyst-sample",
        entityType: "analyst_sample_analyst_pack",
        sourceConfidence: 0.66
      }]
    }));
    expect(rows.some((row) => row.group === "Roster source" && row.status === "used")).toBe(true);
    expect(rows.some((row) => row.group === "News source" && row.status === "missing")).toBe(true);
    expect(rows.some((row) => row.group === "Sample/dev source" && row.status === "ignored")).toBe(true);
  });
});

