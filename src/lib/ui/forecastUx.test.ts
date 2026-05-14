import { describe, expect, it } from "vitest";
import { calculatePrediction } from "@/lib/prediction/calculatePrediction";
import { createPredictionFixture } from "@/lib/prediction/testFixtures";
import { buildConfidenceRiskExplanation, buildForecastStory, deriveDataDepth } from "./forecastUx";

describe("dashboard forecast UX helpers", () => {
  it("maps data depth from fixture to deep evidence without changing readiness gates", () => {
    const base = createPredictionFixture();
    const fixtureOnly = createPredictionFixture({
      teamA: { ...base.teamA, valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      teamB: { ...base.teamB, valveRank: null, hltvRank: null, topRankCategory: "unranked" },
      basicResultA: null,
      basicResultB: null,
      teamFormA: null,
      teamFormB: null,
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    });
    expect(deriveDataDepth(fixtureOnly, calculatePrediction(fixtureOnly)).level).toBe(1);

    const basic = createPredictionFixture({
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    });
    expect(deriveDataDepth(basic, calculatePrediction(basic)).level).toBe(2);

    const rosterStats = createPredictionFixture({ mapStatsA: [], mapStatsB: [], vetoPatternsA: [], vetoPatternsB: [] });
    expect(deriveDataDepth(rosterStats, calculatePrediction(rosterStats)).level).toBe(3);

    const analytical = createPredictionFixture();
    expect(deriveDataDepth(analytical, calculatePrediction(analytical)).level).toBe(4);

    const deepPrediction = { ...calculatePrediction(analytical), sourceLevel: "Deep data" };
    expect(deriveDataDepth(analytical, deepPrediction).level).toBe(5);
  });

  it("builds forecast story and confidence/risk explanations", () => {
    const input = createPredictionFixture({ playerStatsA: [], playerStatsB: [], mapStatsA: [], mapStatsB: [], vetoPatternsA: [], vetoPatternsB: [] });
    const prediction = calculatePrediction(input);
    const story = buildForecastStory(input, prediction);
    const risk = buildConfidenceRiskExplanation(prediction);

    expect(story.known.length).toBeGreaterThan(0);
    expect(story.missing.length).toBeGreaterThan(0);
    expect(story.probability.length).toBeGreaterThan(0);
    expect(story.nextAction.label).toBeTruthy();
    expect(risk.confidenceLabel).toMatch(/Уверенность/);
    expect(risk.reduceRiskWith.length).toBeGreaterThan(0);
  });
});
