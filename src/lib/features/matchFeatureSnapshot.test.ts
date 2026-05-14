import { describe, expect, it } from "vitest";
import { buildMatchFeatureSnapshotData, FEATURE_SCHEMA_VERSION } from "./matchFeatureSnapshot";
import { createPredictionFixture } from "../prediction/testFixtures";

describe("MatchFeatureSnapshot builder", () => {
  it("builds persistent feature data with lineage, cutoff and schema version", () => {
    const input = createPredictionFixture({
      teamA: {
        ...createPredictionFixture().teamA,
        rankSnapshots: [
          { source: "valve_rankings", rank: 12, points: 1800, region: "global", rankingDate: "2026-05-01T00:00:00.000Z", rankCategory: "top_20", confidence: 0.9 }
        ]
      },
      teamB: {
        ...createPredictionFixture().teamB,
        rankSnapshots: [
          { source: "valve_rankings", rank: 30, points: 1200, region: "global", rankingDate: "2026-05-01T00:00:00.000Z", rankCategory: "top_50", confidence: 0.9 }
        ]
      }
    });
    const snapshot = buildMatchFeatureSnapshotData(input);
    const lineage = JSON.parse(snapshot.featureSourcesJson) as Record<string, unknown>;

    expect(snapshot.featureSchemaVersion).toBe(FEATURE_SCHEMA_VERSION);
    expect(snapshot.featureCutoffTime.toISOString()).toBe(new Date(input.match.startTime).toISOString());
    expect(snapshot.dataLeakageCheckPassed).toBe(true);
    expect(snapshot.valveRankDiff).toBeGreaterThan(0);
    expect(lineage.ranking).toBeTruthy();
    expect(snapshot.missingCriticalDataJson).toContain("[");
  });

  it("flags post-cutoff records for backtesting leakage protection", () => {
    const base = createPredictionFixture();
    const input = createPredictionFixture({
      match: { ...base.match, status: "finished", startTime: "2026-05-01T08:00:00.000Z", winnerTeamId: base.teamA.id },
      playerStatsA: base.playerStatsA.map((stat) => ({ ...stat, createdAt: "2026-05-02T08:00:00.000Z" }))
    });
    const snapshot = buildMatchFeatureSnapshotData(input);

    expect(snapshot.dataLeakageCheckPassed).toBe(false);
    expect(snapshot.featureSourcesJson).toContain("ignoredPostCutoffRecords");
  });
});
