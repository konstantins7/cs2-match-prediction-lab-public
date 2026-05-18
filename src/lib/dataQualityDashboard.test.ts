import { describe, expect, it } from "vitest";
import { blockerFrequency, bucketCounts, classifyPickSourceBucket, problemMatchesFromCandidates, sourceCounts } from "./dataQualityDashboard";

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

  it("returns only non-ready candidates with coverage above 50 as problem matches", () => {
    const rows = problemMatchesFromCandidates([
      {
        matchId: "ready",
        teamAName: "A",
        teamBName: "B",
        eventName: "Event",
        startTime: "2026-05-18T10:00:00.000Z",
        coverageScore: 80,
        forecastabilityTier: "READY",
        realForecastReady: true,
        blockers: [],
        missingBlocks: [],
        href: "/match/ready"
      },
      {
        matchId: "low",
        teamAName: "C",
        teamBName: "D",
        eventName: "Event",
        startTime: "2026-05-18T11:00:00.000Z",
        coverageScore: 50,
        forecastabilityTier: "BASIC_ONLY",
        realForecastReady: false,
        blockers: ["missing roster"],
        missingBlocks: [],
        href: "/match/low"
      },
      {
        matchId: "problem",
        teamAName: "E",
        teamBName: "F",
        eventName: "Event",
        startTime: "2026-05-18T12:00:00.000Z",
        coverageScore: 74,
        forecastabilityTier: "NEARLY_READY",
        realForecastReady: false,
        blockers: ["map stats sample below gate"],
        missingBlocks: ["missing H2H/news"],
        href: "/match/problem"
      }
    ]);

    expect(rows).toEqual([{
      matchId: "problem",
      teams: "E vs F",
      eventName: "Event",
      startTime: "2026-05-18T12:00:00.000Z",
      coverageScore: 74,
      forecastabilityTier: "NEARLY_READY",
      blockers: ["map stats sample below gate", "missing H2H/news"],
      href: "/match/problem"
    }]);
  });
});
