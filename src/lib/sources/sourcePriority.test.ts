import { describe, expect, it } from "vitest";
import { pickPreferredSourceForDataType, priorityIndexForSource, sourcePriorityByDataType } from "./sourcePriority";
import { faceitAdapter } from "./faceitAdapter";
import { gridAdapter } from "./gridAdapter";
import { liquipediaAdapter, liquipediaMediaWikiEndpoint, liquipediaMediaWikiUserAgent } from "./liquipediaAdapter";

describe("source priority and expanded source adapters", () => {
  it("selects expected source priority by data type", () => {
    expect(sourcePriorityByDataType.ranking[0].source).toBe("valve-rankings");
    expect(sourcePriorityByDataType.player_stats[0].source).toBe("grid");
    expect(sourcePriorityByDataType.patch_meta[0].source).toBe("cs-updates");
    expect(pickPreferredSourceForDataType("map_stats", ["manual_real", "pandascore_free"])?.sourceMode).toBe("manual_real");
    expect(priorityIndexForSource("round_economy", "parsed_demo")).toBe(1);
  });

  it("Liquipedia/FACEIT/GRID disabled without key do not crash and expose setup guidance", () => {
    const oldGrid = process.env.GRID_API_KEY;
    const oldFaceit = process.env.FACEIT_API_KEY;
    const oldLiquipedia = process.env.LIQUIPEDIA_API_KEY;
    const oldEnableGrid = process.env.ENABLE_GRID_SYNC;
    const oldEnableFaceit = process.env.ENABLE_FACEIT_SYNC;
    const oldEnableLiquipedia = process.env.ENABLE_LIQUIPEDIA_SYNC;
    delete process.env.GRID_API_KEY;
    delete process.env.FACEIT_API_KEY;
    delete process.env.LIQUIPEDIA_API_KEY;
    process.env.ENABLE_GRID_SYNC = "true";
    process.env.ENABLE_FACEIT_SYNC = "true";
    process.env.ENABLE_LIQUIPEDIA_SYNC = "true";

    expect(gridAdapter.status().enabled).toBe(false);
    expect(faceitAdapter.status().enabled).toBe(false);
    expect(liquipediaAdapter.status().enabled).toBe(false);
    expect(liquipediaAdapter.status().message).toContain("MediaWiki API");
    expect(liquipediaMediaWikiEndpoint).toContain("api.php");
    expect(liquipediaMediaWikiUserAgent).toContain("CS2MatchPredictionLab/0.4");

    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("GRID_API_KEY", oldGrid);
    restore("FACEIT_API_KEY", oldFaceit);
    restore("LIQUIPEDIA_API_KEY", oldLiquipedia);
    restore("ENABLE_GRID_SYNC", oldEnableGrid);
    restore("ENABLE_FACEIT_SYNC", oldEnableFaceit);
    restore("ENABLE_LIQUIPEDIA_SYNC", oldEnableLiquipedia);
  });
});
