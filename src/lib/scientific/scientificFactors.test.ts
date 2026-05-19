import { describe, expect, it } from "vitest";
import { calculateScientificFactors } from "./scientificFactors";
import type { PrivateAnalysisData } from "@/lib/math/types";

const emptyData: PrivateAnalysisData = {
  roster: [],
  playerStats: [],
  mapStats: [],
  h2h: [],
  parsedDemo: null,
  fingerprint: "empty",
  warnings: []
};

describe("scientific advisory factors", () => {
  it("returns warnings instead of crashing on empty local data", () => {
    const factors = calculateScientificFactors(emptyData, ["A", "B"]);
    expect(factors).toHaveLength(4);
    expect(factors.every((factor) => factor.status === "missing" || factor.status === "partial")).toBe(true);
  });

  it("calculates map-vs-opponent impact from common maps", () => {
    const factors = calculateScientificFactors({
      ...emptyData,
      mapStats: [
        { matchId: "m", teamName: "A", mapName: "Mirage", mapsPlayed: 5, wins: 4, losses: 1, winRate: 80, roundsWon: 80, roundsLost: 50, ctRoundWinRate: 55, tRoundWinRate: 45, pickRate: 20, banRate: 5, deciderRate: 0 },
        { matchId: "m", teamName: "B", mapName: "Mirage", mapsPlayed: 5, wins: 2, losses: 3, winRate: 40, roundsWon: 60, roundsLost: 70, ctRoundWinRate: 45, tRoundWinRate: 40, pickRate: 10, banRate: 10, deciderRate: 0 }
      ]
    }, ["A", "B"]);
    const mapFactor = factors.find((factor) => factor.id === "map_vs_opponent");
    expect(mapFactor?.status).toBe("partial");
    expect(mapFactor?.impact).toBeGreaterThan(0);
  });

  it("surfaces parsed-demo round analytics when present", () => {
    const factors = calculateScientificFactors({ ...emptyData, parsedDemo: { pistolRounds: 4 } }, ["A", "B"]);
    expect(factors.find((factor) => factor.id === "round_analytics")?.status).toBe("available");
  });
});
