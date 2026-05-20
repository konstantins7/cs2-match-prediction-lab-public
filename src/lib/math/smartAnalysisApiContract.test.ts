import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("v1.6 smart analysis API contract", () => {
  it("keeps deep analysis advisory fields outside production calculatePrediction", () => {
    const analysis = readFileSync("src/lib/math/deepMatchAnalysis.ts", "utf8");
    const prediction = readFileSync("src/lib/prediction/calculatePrediction.ts", "utf8");
    expect(analysis).toContain("similarMatches");
    expect(analysis).toContain("modelPredictions");
    expect(analysis).toContain("dataRecommendations");
    expect(prediction).not.toContain("modelPredictions");
    expect(prediction).not.toContain("findSimilarMatches");
  });

  it("exposes v2 API and similar-match endpoint", () => {
    const route = readFileSync("src/app/api/match-analysis/[matchId]/route.ts", "utf8");
    const similar = readFileSync("src/app/api/match/[matchId]/similar/route.ts", "utf8");
    expect(route).toContain("useCalibratedStyle");
    expect(similar).toContain("findSimilarMatches");
  });
});
