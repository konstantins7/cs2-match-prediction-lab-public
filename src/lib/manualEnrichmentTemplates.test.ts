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
});
