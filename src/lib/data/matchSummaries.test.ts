import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lightweight match summaries", () => {
  it("does not call heavyweight prediction math", () => {
    const source = readFileSync("src/lib/data/matchSummaries.ts", "utf8");
    expect(source).not.toContain("calculatePrediction(");
    expect(source).not.toContain("buildPredictionInput(");
  });

  it("keeps page loads read-only for forecastability cache", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    const matches = readFileSync("src/app/matches/page.tsx", "utf8");
    expect(home).not.toContain("refreshForecastabilityCache");
    expect(matches).not.toContain("refreshForecastabilityCache");
  });

  it("exposes paginated lightweight API routes", () => {
    const route = readFileSync("src/app/api/matches/route.ts", "utf8");
    expect(route).toContain("getLightweightMatchSummaries");
    expect(route).toContain("page");
    expect(route).toContain("limit");
  });
});
