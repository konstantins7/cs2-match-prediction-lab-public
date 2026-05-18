import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("match features panel", () => {
  it("exposes raw ML fields through API-backed Advanced UI", () => {
    const panel = readFileSync("src/components/MatchFeaturesPanel.tsx", "utf8");
    const tabs = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const route = readFileSync("src/app/api/match-features/[matchId]/route.ts", "utf8");

    expect(panel).toContain("/api/match-features/");
    expect(panel).toContain("teamAAvgPlayerRating");
    expect(panel).toContain("teamBAvgPlayerRating");
    expect(panel).toContain("teamATotalMapsPlayed");
    expect(panel).toContain("teamBTotalMapsPlayed");
    expect(panel).toContain("featureSourcesJson");
    expect(tabs).toContain("MatchFeaturesPanel");
    expect(route).toContain("getLatestFeatureSnapshot");
  });
});
