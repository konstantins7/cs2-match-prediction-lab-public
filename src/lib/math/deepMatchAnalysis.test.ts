import { describe, expect, it } from "vitest";
import { calculateMapProbabilities } from "./mapWinProbability";
import { weightedScientificPrediction } from "./mlPredictor";
import { calculatePlayerMapEfficiency, detectOutliers } from "./playerMapEfficiency";
import { calculateTeamSynergy } from "./teamSynergy";
import type { MapStatsRow, PlayerStatsRow, RosterRow } from "./types";

describe("scientific math analysis", () => {
  it("computes decayed player-map efficiency and trends without crashing on zero-map rows", () => {
    const rows: PlayerStatsRow[] = [
      player("A", "p1", "Mirage", 1.1, "2026-05-01T00:00:00Z"),
      player("A", "p1", "Mirage", 1.3, "2026-05-10T00:00:00Z"),
      player("A", "p2", "", 0, "2026-05-10T00:00:00Z")
    ];
    const result = calculatePlayerMapEfficiency(rows, { decayDays: 14, now: new Date("2026-05-19T00:00:00Z") });
    expect(result.find((row) => row.nickname === "p1" && row.mapName === "Mirage")?.normalizedRating).toBeGreaterThan(0);
    expect(result.find((row) => row.nickname === "p2")?.warnings.join(" ")).toContain("No mapName");
  });

  it("flags rating outliers with z-score above 3", () => {
    const values = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, value: 1 + index * 0.001 }));
    values.push({ id: "spike", value: 3 });
    expect(detectOutliers(values, "rating")).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spike" })]));
  });

  it("uses Bayesian map priors for tiny samples", () => {
    const rows: MapStatsRow[] = [
      map("A", "Mirage", 1, 1),
      map("B", "Mirage", 1, 0)
    ];
    const [mirage] = calculateMapProbabilities(rows, "A", "B");
    expect(mirage.teamAWinProbability).toBeLessThan(80);
    expect(mirage.warnings.join(" ")).toContain("Low map sample");
  });

  it("computes synergy from partial roster/player stats", () => {
    const roster: RosterRow[] = [
      { matchId: "m", teamName: "A", nickname: "p1", role: "awper" },
      { matchId: "m", teamName: "A", nickname: "p2", role: "rifler" }
    ];
    const rows = [player("A", "p1", "Mirage", 1.1), player("A", "p2", "Mirage", 1.0)];
    const [team] = calculateTeamSynergy(roster, rows);
    expect(team.roleDiversity).toBeGreaterThan(0);
  });

  it("keeps the weighted predictor bounded", () => {
    const result = weightedScientificPrediction({
      teamA: "A",
      teamB: "B",
      teamElo: { A: 1600, B: 1400 },
      mapProbabilities: [],
      synergies: [],
      weights: { elo: 100, maps: 0, synergy: 0 }
    });
    expect(result.teamAProbability).toBeGreaterThan(50);
    expect(result.teamAProbability).toBeLessThanOrEqual(99);
  });

  it("processes 500 player rows quickly", () => {
    const rows = Array.from({ length: 500 }, (_, index) => player("A", `p${index % 5}`, "Mirage", 1 + (index % 20) / 100));
    const started = performance.now();
    calculatePlayerMapEfficiency(rows);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

function player(teamName: string, nickname: string, mapName: string, rating: number, collectedAt = "2026-05-01T00:00:00Z"): PlayerStatsRow {
  return {
    matchId: "m",
    teamName,
    nickname,
    mapName,
    maps: 1,
    kills: 0,
    deaths: 0,
    assists: 0,
    kd: 1,
    rating,
    adr: 70,
    kast: 70,
    impact: 1,
    collectedAt,
    sampleSize: 1
  };
}

function map(teamName: string, mapName: string, mapsPlayed: number, wins: number): MapStatsRow {
  return {
    matchId: "m",
    teamName,
    mapName,
    mapsPlayed,
    wins,
    losses: mapsPlayed - wins,
    winRate: (wins / mapsPlayed) * 100,
    roundsWon: 0,
    roundsLost: 0,
    ctRoundWinRate: 0,
    tRoundWinRate: 0,
    pickRate: 0,
    banRate: 0,
    deciderRate: 0
  };
}
