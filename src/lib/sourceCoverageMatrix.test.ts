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
});
