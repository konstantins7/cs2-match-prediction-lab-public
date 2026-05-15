import { describe, expect, it } from "vitest";
import { manualEnrichmentTemplates } from "./manualEnrichmentTemplates";

describe("manual enrichment templates", () => {
  it("provides all analyst workflow JSON templates", () => {
    expect(Object.keys(manualEnrichmentTemplates)).toEqual([
      "manual_real_pack",
      "roster",
      "player_stats",
      "map_stats",
      "veto_history",
      "h2h",
      "news",
      "parsed_demo",
      "analyst_pack"
    ]);
    for (const template of Object.values(manualEnrichmentTemplates)) {
      expect(template.matchId).toBeTruthy();
      expect(template.type).toBeTruthy();
      expect(() => JSON.stringify(template)).not.toThrow();
    }
  });

  it("keeps manual_real_pack as an empty real-data template, not applied evidence", () => {
    expect(manualEnrichmentTemplates.manual_real_pack).toMatchObject({
      type: "manual_real_pack",
      matchId: "pandascore_match_1474573",
      sourceName: "",
      collectedAt: "",
      period: "",
      sampleSize: 0,
      confidence: 0,
      rosters: {},
      playerStats: [],
      mapStats: [],
      vetoHistory: [],
      h2h: [],
      news: []
    });
    expect("metadata" in manualEnrichmentTemplates.manual_real_pack).toBe(false);
  });
});
