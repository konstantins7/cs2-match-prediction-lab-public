import { describe, expect, it } from "vitest";
import { calculateMatchPriority, classifyTeamVisibility, getEffectiveRank, isDefaultProFocus } from "./proFocus";

const baseTeam = {
  id: "team_a",
  name: "Aurora Five",
  valveRank: null,
  hltvRank: null,
  topRankCategory: "unranked",
  sourceConfidence: 0.8,
  needsReview: false,
  isAcademyTeam: false,
  teamPriority: 0,
  visibilityTier: "notable",
  rankSnapshots: []
};

function match(overrides: Partial<Parameters<typeof calculateMatchPriority>[0]> = {}) {
  return {
    id: "match_test",
    eventName: "Unknown Cup",
    eventTier: "imported",
    stage: "Group stage",
    format: "BO3",
    isLan: false,
    sourceMode: "pandascore_free",
    sourceConfidence: 0.75,
    needsReview: false,
    isPinned: false,
    manualPriority: null,
    manualVisibility: null,
    teamA: baseTeam,
    teamB: { ...baseTeam, id: "team_b", name: "Nordic Pulse" },
    ...overrides
  };
}

describe("Pro Focus priority", () => {
  it("gives watchlist teams a priority bonus", () => {
    const result = calculateMatchPriority(match({ teamA: { ...baseTeam, name: "NAVI" }, eventName: "ESL Pro League" }));
    expect(result.hasWatchlistTeam).toBe(true);
    expect(result.priorityScore).toBeGreaterThanOrEqual(70);
  });

  it("does not apply watchlist bonus to academy or lower-tier variants", () => {
    const result = calculateMatchPriority(match({ teamA: { ...baseTeam, name: "G2 Ares" }, eventName: "ESL Pro League" }));
    expect(result.hasWatchlistTeam).toBe(false);
    expect(result.visibilityTier).toBe("lower_tier");
  });

  it("puts top-50 teams into Pro Focus visibility", () => {
    const result = calculateMatchPriority(match({ teamA: { ...baseTeam, valveRank: 25 }, eventName: "ESL Pro League" }));
    expect(result.visibilityTier).toBe("top_50");
    expect(isDefaultProFocus(result)).toBe(true);
  });

  it("hides both-unranked unknown tournament matches from Pro Focus", () => {
    const result = calculateMatchPriority(match());
    expect(result.priorityLabel).toBe("hidden");
    expect(result.hiddenReasons).toContain("both teams unranked");
  });

  it("hides academy teams by default", () => {
    const result = calculateMatchPriority(match({ teamA: { ...baseTeam, name: "NAVI Junior" }, eventName: "ESL Pro League" }));
    expect(result.visibilityTier).toBe("lower_tier");
    expect(isDefaultProFocus(result)).toBe(false);
  });

  it("classifies Female and Fe teams as separate circuit, not lower-tier", () => {
    expect(classifyTeamVisibility("Ninjas in Pyjamas Female")).toBe("separate_circuit");
    expect(classifyTeamVisibility("Imperial Fe")).toBe("separate_circuit");
  });

  it("raises priority for known S-tier tournaments", () => {
    const result = calculateMatchPriority(match({ eventName: "Austin Major 2026", teamA: { ...baseTeam, valveRank: 42 } }));
    expect(result.tournamentTier).toBe("S");
    expect(result.priorityLabel).toMatch(/high|must_watch/);
  });

  it("keeps CCT-style events conditional on ranked participants", () => {
    const unranked = calculateMatchPriority(match({ eventName: "CCT Finals" }));
    const ranked = calculateMatchPriority(match({ eventName: "CCT Finals", teamA: { ...baseTeam, valveRank: 38 } }));
    expect(isDefaultProFocus(unranked)).toBe(false);
    expect(isDefaultProFocus(ranked)).toBe(true);
  });

  it("keeps one top-50 team in an unknown tournament at medium or high priority", () => {
    const result = calculateMatchPriority(match({ teamA: { ...baseTeam, valveRank: 18 } }));
    expect(["medium", "high"]).toContain(result.priorityLabel);
  });

  it("sort signal for both top-50 BO3 beats lower-tier no-name", () => {
    const pro = calculateMatchPriority(match({ teamA: { ...baseTeam, valveRank: 12 }, teamB: { ...baseTeam, id: "team_b", name: "Nordic Pulse", valveRank: 44 } }));
    const lower = calculateMatchPriority(match({ teamA: { ...baseTeam, name: "No Name Academy" }, teamB: { ...baseTeam, id: "team_b", name: "Unknown Mix" } }));
    expect(pro.priorityScore).toBeGreaterThan(lower.priorityScore);
  });

  it("lets pinned matches sort higher without implying prediction confidence", () => {
    const result = calculateMatchPriority(match({ isPinned: true, teamA: { ...baseTeam, name: "Unknown Academy" } }));
    expect(result.priorityScore).toBeGreaterThan(70);
    expect(result.reasons).toContain("Pinned by analyst; priority only, no prediction confidence boost.");
  });

  it("marks stale rankings after 60 days and lowers confidence", () => {
    const fresh = getEffectiveRank({
      ...baseTeam,
      rankSnapshots: [{ source: "valve_rankings", rank: 14, rankingDate: "2026-05-04T00:00:00.000Z", rankCategory: "top_20", confidence: 0.9 }]
    });
    const stale = getEffectiveRank({
      ...baseTeam,
      rankSnapshots: [{ source: "valve_rankings", rank: 14, rankingDate: "2026-02-01T00:00:00.000Z", rankCategory: "top_20", confidence: 0.9 }]
    });
    expect(stale.stale).toBe(true);
    expect(stale.confidence).toBeLessThan(fresh.confidence);
  });
});
