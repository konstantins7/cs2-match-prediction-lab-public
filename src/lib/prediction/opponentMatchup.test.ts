import { describe, expect, it } from "vitest";
import { calculatePrediction } from "./calculatePrediction";
import { dataRelevanceFactor } from "./dataRelevance";
import { opponentMatchupFactor } from "./opponentMatchup";
import { createPredictionFixture } from "./testFixtures";

describe("opponent matchup and data windows", () => {
  it("lowers a favorite when matchup is bad", () => {
    const baseline = calculatePrediction(createPredictionFixture());
    const badMatchupInput = createPredictionFixture({
      opponentMatchupA: { ...createPredictionFixture().opponentMatchupA!, mapWinRate: 0.34, matchWinRate: 0.33, styleAdvantageScore: 0.3, vetoPunishScore: 0.82, confidenceScore: 0.8, mapsPlayed: 26 },
      opponentMatchupB: { ...createPredictionFixture().opponentMatchupB!, mapWinRate: 0.64, matchWinRate: 0.62, styleAdvantageScore: 0.68, vetoPunishScore: 0.2, confidenceScore: 0.8, mapsPlayed: 26 }
    });
    const adjusted = calculatePrediction(badMatchupInput);
    expect(adjusted.teamAProbability).toBeLessThan(baseline.teamAProbability);
  });

  it("low matchup sample lowers factor confidence", () => {
    const highSample = opponentMatchupFactor(createPredictionFixture());
    const lowSample = opponentMatchupFactor(
      createPredictionFixture({
        opponentMatchupA: { ...createPredictionFixture().opponentMatchupA!, mapsPlayed: 2, matchesPlayed: 0 },
        opponentMatchupB: { ...createPredictionFixture().opponentMatchupB!, mapsPlayed: 2, matchesPlayed: 0 }
      })
    );
    expect(lowSample.confidence).toBeLessThan(highSample.confidence);
    expect(lowSample.warnings.join(" ")).toContain("Low direct matchup sample");
  });

  it("current roster and post-patch windows raise relevance versus old windows", () => {
    const base = createPredictionFixture();
    const strongWindows = dataRelevanceFactor(
      createPredictionFixture({
        dataWindows: [
          { ...base.dataWindows[0], teamId: "teamA", windowType: "current_roster_only", relevanceScore: 0.9 },
          { ...base.dataWindows[1], teamId: "teamB", windowType: "current_roster_only", relevanceScore: 0.88 },
          { ...base.dataWindows[0], teamId: "teamA", windowType: "post_last_major_patch", relevanceScore: 0.86 },
          { ...base.dataWindows[1], teamId: "teamB", windowType: "post_last_major_patch", relevanceScore: 0.84 }
        ]
      })
    );
    const oldWindows = dataRelevanceFactor(
      createPredictionFixture({
        dataWindows: [
          { ...base.dataWindows[0], teamId: "teamA", windowType: "last_180_days", relevanceScore: 0.32 },
          { ...base.dataWindows[1], teamId: "teamB", windowType: "last_180_days", relevanceScore: 0.32 }
        ]
      })
    );
    expect(strongWindows.confidence).toBeGreaterThan(oldWindows.confidence);
  });
});
