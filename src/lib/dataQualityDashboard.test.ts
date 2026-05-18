import { describe, expect, it } from "vitest";
import { blockerFrequency, bucketCounts, classifyPickSourceBucket, sourceCounts } from "./dataQualityDashboard";

describe("data quality dashboard helpers", () => {
  it("summarizes source mode groups", () => {
    expect(sourceCounts("player_stats", [
      { source: "manual_enrichment", sourceMode: "manual_real", _count: { _all: 3 } },
      { source: "parsed_demo", sourceMode: "parsed_demo", _count: { _all: 5 } }
    ])).toEqual([
      { dataType: "player_stats", source: "parsed_demo", sourceMode: "parsed_demo", count: 5 },
      { dataType: "player_stats", source: "manual_enrichment", sourceMode: "manual_real", count: 3 }
    ]);
  });

  it("classifies prediction pick source buckets", () => {
    expect(classifyPickSourceBucket({ sourceSummaryJson: JSON.stringify([{ source: "Manual/Parsed", status: "yes" }]) })).toBe("manual_real");
    expect(classifyPickSourceBucket({ sourceSummaryJson: JSON.stringify([{ source: "GRID Open Access", status: "yes" }]) })).toBe("grid");
    expect(bucketCounts([
      { sourceSummaryJson: JSON.stringify([{ source: "GRID Open Access", status: "yes" }]) },
      { sourceSummaryJson: JSON.stringify([{ source: "GRID Open Access", status: "yes" }]) },
      { sourceSummaryJson: "[]" }
    ])).toEqual([
      { sourceBucket: "grid", count: 2 },
      { sourceBucket: "unknown_or_mixed", count: 1 }
    ]);
  });

  it("combines blockers from jobs and failed timeline steps", () => {
    const rows = blockerFrequency(
      [{ blockersJson: JSON.stringify(["missing roster", "missing roster", "map stats sample below gate"]) }],
      [
        { blockerCode: "map_stats", stepKey: "maps", status: "missing" },
        { blockerCode: null, stepKey: "grid", status: "blocked" }
      ]
    );

    expect(rows[0]).toEqual({ blocker: "missing roster", count: 2 });
    expect(rows.some((row) => row.blocker === "grid:blocked")).toBe(true);
  });
});
