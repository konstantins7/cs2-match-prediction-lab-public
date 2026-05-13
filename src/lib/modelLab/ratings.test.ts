import { describe, expect, it } from "vitest";
import { calculateGlickoStyleUncertainty, calculateTrueSkillStylePlaceholder, expectedEloScore, updateEloPair } from "./ratings";

describe("model lab rating layer", () => {
  it("updates Internal Elo after a finished match result", () => {
    const beforeExpected = expectedEloScore(1500, 1500);
    const next = updateEloPair(1500, 1500, 1, 28);

    expect(beforeExpected).toBeCloseTo(0.5, 3);
    expect(next.ratingA).toBeGreaterThan(1500);
    expect(next.ratingB).toBeLessThan(1500);
  });

  it("Glicko-style uncertainty is higher for low sample or new roster", () => {
    const low = calculateGlickoStyleUncertainty({ matchesPlayed: 2, rosterStability: 0.3, isNewRoster: true });
    const stable = calculateGlickoStyleUncertainty({ matchesPlayed: 40, rosterStability: 0.85 });

    expect(low.ratingDeviation).toBeGreaterThan(stable.ratingDeviation);
    expect(low.volatility).toBeGreaterThan(stable.volatility);
    expect(low.label).toContain("heuristic");
  });

  it("TrueSkill-style placeholder returns structured skill and uncertainty only", () => {
    const placeholder = calculateTrueSkillStylePlaceholder({ playerRatings: [{ rating: 1500, uncertainty: 90 }, { rating: 1600, uncertainty: 70 }] });

    expect(placeholder.teamSkill).toBe(1550);
    expect(placeholder.uncertainty).toBe(80);
    expect(placeholder.label).toContain("placeholder");
  });
});
