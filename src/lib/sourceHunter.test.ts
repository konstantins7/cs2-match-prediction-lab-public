import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataSourceRegistry } from "./config/dataSourceRegistry";
import { getImportProfiles } from "./importProfiles";
import { getSourceHunterRecommendations } from "./sourceHunter";

describe("MVP 0.7.3 Source Hunter and JSON-first profiles", () => {
  it("registers new free/optional/future sources with legal modes and statuses", () => {
    const byId = new Map(dataSourceRegistry.map((source) => [source.id, source]));
    expect(byId.get("leetify")).toMatchObject({ accessType: "public_api", legalMode: "api_with_attribution", status: "optional" });
    expect(byId.get("cs_demo_manager")).toMatchObject({ accessType: "free_tool", legalMode: "user_export_upload", status: "optional" });
    expect(byId.get("awpy")).toMatchObject({ accessType: "open_source_parser", legalMode: "local_parser", status: "optional" });
    expect(byId.get("demoparser")).toMatchObject({ accessType: "open_source_parser", legalMode: "local_parser", status: "optional" });
    expect(byId.get("demoinfocs")).toMatchObject({ accessType: "open_source_parser", legalMode: "local_parser", status: "optional" });
    expect(byId.get("thesportsdb")).toMatchObject({ accessType: "free_api", legalMode: "api", status: "future" });
    expect(byId.get("bymykel_csgo_api")).toMatchObject({ accessType: "public_static_data", legalMode: "github_raw_json", status: "future" });
    expect(byId.get("cs2leaderboard")).toMatchObject({ accessType: "public_api", legalMode: "api", status: "future" });
    expect(byId.get("kaggle_csgo_datasets")).toMatchObject({ accessType: "offline_dataset", legalMode: "license_check_required", status: "future" });
  });

  it("keeps HLTV and Telegram manual/reference only with no Apify scraping path", () => {
    const hltv = dataSourceRegistry.find((source) => source.id === "hltv_manual_top50");
    const telegram = dataSourceRegistry.find((source) => source.id === "telegram_manual");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const sourceIndex = readFileSync("src/lib/sources/index.ts", "utf8").toLowerCase();
    expect(hltv?.legalMode).toBe("manual_reference");
    expect(hltv?.forbiddenActions).toEqual(expect.arrayContaining(["HLTV scraping", "Apify HLTV actor sync"]));
    expect(telegram?.legalMode).toBe("manual_reference");
    expect(telegram?.forbiddenActions).toContain("Telegram scraping");
    expect(packageJson.dependencies?.["apify-client"]).toBeUndefined();
    expect(packageJson.devDependencies?.["apify-client"]).toBeUndefined();
    expect(sourceIndex).not.toContain("apify");
    expect(sourceIndex).not.toContain("hltv");
  });

  it("marks Leetify as attribution-required explicit-context placeholder", () => {
    const leetify = dataSourceRegistry.find((source) => source.id === "leetify");
    expect(leetify?.limitations).toContain("attribution");
    expect(leetify?.limitations).toContain("privacy");
    expect(leetify?.forbiddenActions).toEqual(expect.arrayContaining(["broad crawl", "automatic sync", "using without attribution"]));
  });

  it("keeps trial and paid providers disabled by default", () => {
    const paid = dataSourceRegistry.filter((source) => ["trial", "paid_future", "trial_or_paid_future"].includes(source.accessType));
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((source) => source.status === "disabled")).toBe(true);
    expect(paid.every((source) => source.forbiddenActions.some((action) => action.includes("auto-run") || action.includes("without")))).toBe(true);
  });

  it("suggests the requested legal data paths by missing data type", () => {
    const byType = new Map(getSourceHunterRecommendations().map((item) => [item.dataType, item]));
    expect(byType.get("roster")?.bestAutomaticSource).toContain("LiquipediaDB");
    expect(byType.get("player_stats")?.bestFreeUploadPath).toContain("Parsed Demo JSON");
    expect(byType.get("player_stats")?.bestFreeUploadPath).toContain("CS Demo Manager");
    expect(byType.get("map_veto")?.bestFreeUploadPath).toContain("Parsed Demo JSON");
    expect(byType.get("round_economy")?.bestFreeUploadPath).toContain("demoinfocs");
    expect(byType.get("ranking")?.bestAutomaticSource).toContain("Valve");
    expect(byType.get("ranking")?.bestFreeUploadPath).toContain("Manual HLTV");
    expect(byType.get("news")?.bestManualSource.toLowerCase()).toContain("official");
  });

  it("defines JSON-first import profiles and marks full parsers future/inactive", () => {
    const profiles = getImportProfiles();
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    for (const id of ["cs_demo_manager_json", "awpy_json", "demoparser_json", "demoinfocs_json"]) {
      expect(byId.get(id)?.expectedFormat.toLowerCase()).toContain("json");
      expect(byId.get(id)?.status).toBe("instruction_only");
      expect(byId.get(id)?.futureParsers?.join(" ").toLowerCase()).toMatch(/parser|sql|xlsx|worker|\.dem/);
    }
    expect(byId.get("manual_real_pack_json")?.status).toBe("active");
    expect(byId.get("parsed_demo_json")?.status).toBe("active");
    expect(byId.get("leetify_placeholder")?.validationChecklist.join(" ")).toContain("attribution required");
    expect(byId.get("hltv_manual_rank")?.validationChecklist.join(" ")).toContain("no scraping");
  });

  it("renders Source Hunter and import profile UI contracts", () => {
    const sourcesPage = readFileSync("src/app/admin/sources/page.tsx", "utf8");
    const sourceHunter = readFileSync("src/components/SourceHunterPanel.tsx", "utf8");
    const importProfiles = readFileSync("src/components/ImportProfilesPanel.tsx", "utf8");
    const researchQueue = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    const matchDetail = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const modelLab = readFileSync("src/app/admin/model-lab/page.tsx", "utf8");
    expect(sourcesPage).toContain("SourceHunterPanel");
    expect(sourcesPage).toContain("ImportProfilesPanel");
    expect(sourceHunter).toContain("Где взять недостающие данные");
    expect(importProfiles).toContain("Expected JSON schema");
    expect(importProfiles).toContain("Future/inactive parsers");
    expect(researchQueue).toContain("SourceHunterPanel compact");
    expect(matchDetail).toContain("DemoStatExportCta");
    expect(modelLab).toContain("Offline research datasets");
    expect(modelLab).toContain("training/calibration only");
    expect(modelLab).toContain("Not live forecast source");
  });
});
