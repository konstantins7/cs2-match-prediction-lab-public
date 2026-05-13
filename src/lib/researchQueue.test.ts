import { describe, expect, it } from "vitest";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { createPredictionFixture } from "./prediction/testFixtures";
import { buildResearchQueueForMatch } from "./researchQueueCore";

describe("research queue", () => {
  it("includes missing roster/map/veto tasks for PandaScore fixture-only match", () => {
    const base = createPredictionFixture();
    const input = createPredictionFixture({
      match: { ...base.match, id: "pandascore_fixture", sourceMode: "pandascore_free", dataQualityScore: 35 },
      teamA: { ...base.teamA, valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      teamB: { ...base.teamB, valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: [],
      basicResultA: null,
      basicResultB: null
    });
    const prediction = calculatePrediction(input);
    const tasks = buildResearchQueueForMatch(input, prediction.readiness).map((task) => task.task);
    expect(tasks).toContain("Bind roster");
    expect(tasks).toContain("Import player stats");
    expect(tasks).toContain("Import map stats");
    expect(tasks).toContain("Import veto history");
  });

  it("adds confirm rank mapping for watchlist teams without rank", () => {
    const base = createPredictionFixture();
    const input = createPredictionFixture({
      match: { ...base.match, id: "watchlist_rank_missing", sourceMode: "pandascore_free" },
      teamA: { ...base.teamA, name: "G2", valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      teamB: { ...base.teamB, name: "Unknown Five", valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: [],
      basicResultA: null,
      basicResultB: null
    });
    const prediction = calculatePrediction(input);
    const tasks = buildResearchQueueForMatch(input, prediction.readiness);
    expect(prediction.readiness.level).toBe("L1_BASIC_CONTEXT");
    expect(tasks.some((task) => task.task === "Confirm rank/team match")).toBe(true);
  });

  it("marks needs-review actions as blocked", () => {
    const base = createPredictionFixture();
    const input = createPredictionFixture({
      match: { ...base.match, id: "needs_review", needsReview: true },
      teamA: { ...base.teamA, name: "G2", valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      teamB: { ...base.teamB, name: "Unknown Five", valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    });
    const prediction = calculatePrediction(input);
    const tasks = buildResearchQueueForMatch(input, prediction.readiness);
    const rankTask = tasks.find((task) => task.task === "Confirm rank/team match");
    expect(rankTask?.actionState).toBe("Blocked by needs_review");
    expect(rankTask?.status).toBe("blocked");
  });

  it("marks analyst coverage tasks done when roster/player/map/veto data exists", () => {
    const input = createPredictionFixture();
    const prediction = calculatePrediction(input);
    const tasks = buildResearchQueueForMatch(input, prediction.readiness);
    expect(tasks.find((task) => task.task === "Bind roster")?.status).toBe("done");
    expect(tasks.find((task) => task.task === "Import player stats")?.status).toBe("done");
    expect(tasks.find((task) => task.task === "Import map stats")?.status).toBe("done");
    expect(tasks.find((task) => task.task === "Import veto history")?.status).toBe("done");
  });
});
