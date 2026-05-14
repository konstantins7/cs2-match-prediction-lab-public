import { describe, expect, it } from "vitest";
import { buildSourceCoverageMatrix } from "./sourceCoverageMatrix";
import { createPredictionFixture } from "./prediction/testFixtures";

describe("SourceCoverageMatrix", () => {
  it("computes coverage cells by data type and source", () => {
    const input = createPredictionFixture({
      match: { ...createPredictionFixture().match, sourceMode: "pandascore_free", sourceConfidence: 0.72 }
    });
    const rows = buildSourceCoverageMatrix(input, []);
    const fixture = rows.find((row) => row.dataType === "fixture");
    const playerStats = rows.find((row) => row.dataType === "player_stats");

    expect(fixture?.cells.find((cell) => cell.source === "PandaScore")?.usedInPrediction).toBe(true);
    expect(playerStats?.cells.some((cell) => cell.status === "available" || cell.status === "partial")).toBe(true);
  });

  it("shows FACEIT selected-match context as weak context coverage", () => {
    const base = createPredictionFixture();
    const input = createPredictionFixture({
      faceitContextRecords: [{
        id: "faceit_context",
        source: "faceit",
        entityType: "faceit_player_stats_context",
        entityId: "teamA_p1",
        rawJson: JSON.stringify({ sourceMode: "faceit_optional", matchId: base.match.id }),
        fetchedAt: "2026-05-01T00:00:00Z",
        sourceConfidence: 0.5
      }]
    });
    const rows = buildSourceCoverageMatrix(input, []);
    const playerStats = rows.find((row) => row.dataType === "player_stats");
    const faceit = playerStats?.cells.find((cell) => cell.source === "FACEIT");
    expect(faceit?.status).toBe("available");
    expect(faceit?.usedInPrediction).toBe(true);
    expect(faceit?.note).toContain("weak confidence evidence");
  });
});
