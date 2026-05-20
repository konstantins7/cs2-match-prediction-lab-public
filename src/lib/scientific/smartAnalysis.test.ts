import { describe, expect, it } from "vitest";
import { detectPlayerAnomalies, detectVetoAnomalies } from "./anomalyDetection";
import { buildDataRecommendations } from "./dataRecommendations";
import { compareAdvisoryModels } from "./modelComparison";
import { jaccard, tierScore } from "./matchFeatureHistory";
import type { PrivateAnalysisData } from "@/lib/math/types";

describe("v1.6 smart analysis helpers", () => {
  it("scores map overlap and tournament tiers deterministically", () => {
    expect(jaccard(["Mirage", "Nuke"], ["nuke", "Inferno"])).toBeCloseTo(1 / 3);
    expect(tierScore("Tier 1")).toBe(1);
    expect(tierScore("regional qualifier")).toBe(4);
  });

  it("detects player and veto anomalies from local rows", () => {
    const playerRows = [1.2, 1.18, 1.22, 0.5].map((rating, index) => ({
      matchId: "m1",
      teamName: "A",
      nickname: "star",
      maps: 1,
      kills: 0,
      deaths: 0,
      assists: 0,
      kd: 1,
      rating,
      adr: 80 - index,
      kast: 75,
      impact: 1
    }));
    expect(detectPlayerAnomalies(playerRows, 1.2).some((row) => row.metric === "rating")).toBe(true);
    expect(detectVetoAnomalies([{ matchId: "m1", teamName: "A", mapName: "Mirage", mapsPlayed: 8, wins: 6, losses: 2, winRate: 75, roundsWon: 0, roundsLost: 0, ctRoundWinRate: 0, tRoundWinRate: 0, pickRate: 5, banRate: 45, deciderRate: 0 }])).toHaveLength(1);
  });

  it("compares advisory models without external ML dependencies", () => {
    const result = compareAdvisoryModels({
      teamA: "A",
      teamB: "B",
      teamAInternalElo: 1700,
      teamBInternalElo: 1500,
      teamElo: {},
      mapProbabilities: [{ mapName: "Mirage", teamAWinProbability: 60, teamBWinProbability: 40, teamAWinRate: 60, teamBWinRate: 40, teamASample: 10, teamBSample: 10, globalPrior: 50, warnings: [] }],
      synergies: [],
      weights: { elo: 0.34, maps: 0.43, synergy: 0.23 }
    });
    expect(result.elo.teamAProbability).toBeGreaterThan(50);
    expect(Math.round(result.ensemble.teamAProbability + result.ensemble.teamBProbability)).toBe(100);
  });

  it("returns concrete recommendations for missing blocks", () => {
    const empty: PrivateAnalysisData = {
      roster: [],
      playerStats: [],
      mapStats: [],
      vetoHistory: [],
      h2h: [],
      newsEvents: [],
      parsedDemo: null,
      fingerprint: "x",
      warnings: []
    };
    const blocks = buildDataRecommendations(empty, { matchId: "m1", aiConfidence: 50 }).map((row) => row.block);
    expect(blocks).toContain("map_stats");
    expect(blocks).toContain("player_stats");
    expect(blocks).toContain("veto_history");
  });
});
