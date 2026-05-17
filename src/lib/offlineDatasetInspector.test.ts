import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataSourceRegistry } from "./config/dataSourceRegistry";
import { inspectOfflineDatasetCsv, offlineDatasetProfiles } from "./offlineDatasetInspector";

describe("MVP 0.7.5 Data Onboarding", () => {
  it("inspects results CSV metadata without live forecast semantics", () => {
    const result = inspectOfflineDatasetCsv({
      datasetType: "results",
      content: [
        "date,team_1,team_2,_map,result_1,result_2,match_id,event_id,match_winner",
        "2020-01-01,Evo Novo,WAZABI,Mirage,13,10,m1,e1,Evo Novo",
        "2020-01-02,Evo Novo,WAZABI,Inferno,9,13,m2,e1,WAZABI"
      ].join("\n")
    });
    expect(result.ok).toBe(true);
    expect(result.rows).toBe(2);
    expect(result.columns).toBe(9);
    expect(result.dateRange).toEqual({ from: "2020-01-01", to: "2020-01-02" });
    expect(result.topMaps[0]).toMatchObject({ value: "Inferno", count: 1 });
    expect(result.topTeams.map((item) => item.value)).toEqual(expect.arrayContaining(["Evo Novo", "WAZABI"]));
    expect(result.role).toBe("training/calibration only");
    expect(result.liveForecastSource).toBe(false);
    expect(result.canRaiseRealForecastReady).toBe(false);
    expect(result.licenseCheckRequired).toBe(true);
  });

  it("inspects picks/economy/player fixtures dynamically and handles TSV", () => {
    const picks = inspectOfflineDatasetCsv({
      datasetType: "picks",
      content: [
        "date\tteam_1\tteam_2\tmatch_id\tevent_id\tbest_of\tt1_removed_1\tt2_removed_1\tt1_picked_1\tt2_picked_1\tleft_over",
        "2020-01-01\tA\tB\tm1\te1\t3\tMirage\tInferno\tNuke\tAncient\tAnubis"
      ].join("\n")
    });
    expect(picks.delimiter).toBe("\t");
    expect(picks.topMaps.map((item) => item.value)).toEqual(expect.arrayContaining(["Mirage", "Inferno", "Nuke", "Ancient", "Anubis"]));

    const players = inspectOfflineDatasetCsv({
      datasetType: "players",
      content: "date;player_name;team;opponent;match_id;event_name;kills;deaths;adr;kast;rating\n2020-01-03;p1;A;B;m1;Event;20;12;81,5;72,4;1,12"
    });
    expect(players.delimiter).toBe(";");
    expect(players.topTeams.map((item) => item.value)).toEqual(expect.arrayContaining(["A", "B"]));
    expect(players.dateRange.from).toBe("2020-01-03");
  });

  it("keeps Kaggle/offline profiles training-only and inspect-only", () => {
    const kaggle = dataSourceRegistry.find((source) => source.id === "kaggle_csgo_datasets");
    expect(Object.keys(offlineDatasetProfiles)).toEqual(["results", "players", "picks", "economy"]);
    expect(kaggle?.limitations).toContain("Training/calibration only");
    expect(kaggle?.limitations).toContain("cannot raise Real Forecast Ready");
    expect(kaggle?.forbiddenActions).toEqual(expect.arrayContaining(["live Match/Team/Player records", "Real Forecast Ready impact"]));

    const helper = readFileSync("src/lib/offlineDatasetInspector.ts", "utf8");
    const route = readFileSync("src/app/api/admin/offline-datasets/inspect/route.ts", "utf8");
    expect(helper).not.toContain("prisma");
    expect(route).not.toContain("prisma");
  });

  it("documents Leetify/TheSportsDB/Steam/CS Demo Manager safety without secrets", () => {
    const registry = new Map(dataSourceRegistry.map((source) => [source.id, source]));
    expect(registry.get("leetify")?.setupInstructions).toContain("https://api-public.cs-prod.leetify.com");
    expect(registry.get("leetify")?.userActionRequired).toContain("explicit steam64_id");
    expect(registry.get("leetify")?.limitations).toContain("attribution");
    expect(registry.get("leetify")?.forbiddenActions).toEqual(expect.arrayContaining(["broad crawl", "logging API keys"]));
    expect(registry.get("thesportsdb")?.setupInstructions).toContain("Low-priority metadata fallback");
    expect(registry.get("thesportsdb")?.forbiddenActions).toEqual(expect.arrayContaining(["player stats", "Real Forecast Ready impact"]));
    expect(registry.get("cs_demo_manager")?.setupInstructions).toContain("исторические демки");
    expect(registry.get("cs_demo_manager")?.forbiddenActions).toContain("target post-start demo as pre-match evidence");

    const envExample = readFileSync(".env.example", "utf8");
    expect(envExample).toContain("LEETIFY_API_KEY=\"\"");
    expect(envExample).toContain("THESPORTSDB_API_KEY=\"\"");
    expect(envExample).not.toMatch(/STEAM.*AUTH|CSGO.*AUTH|GAME.*AUTH/i);
  });

  it("renders onboarding guidance in sources, match, research queue, and model lab", () => {
    const sources = readFileSync("src/app/admin/sources/page.tsx", "utf8");
    const match = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const queue = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    const modelLab = readFileSync("src/app/admin/model-lab/page.tsx", "utf8");
    expect(sources).toContain("Data Onboarding");
    expect(sources).toContain("Steam auth code");
    expect(sources).toContain("GRID Mapping");
    expect(match).toContain("Kaggle/offline datasets");
    expect(queue).toContain("personal Steam demos");
    expect(modelLab).toContain("OfflineDatasetInspectorPanel");
    expect(modelLab).toContain("Offline dataset profiles");
  });
});
