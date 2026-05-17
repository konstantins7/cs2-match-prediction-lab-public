import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analystSheetTemplates, buildAnalystSheetTemplate, buildTargetAnalystSheetTemplate } from "./analystSheetTemplates";
import { detectDelimiter, normalizeMapName, parseDelimitedRows } from "./analystSheetImport";

describe("MVP 0.7.5 CSV/TSV analyst sheet import", () => {
  it("parses comma CSV, semicolon CSV, TSV, BOM, quoted values and ignores empty lines", () => {
    const comma = parseDelimitedRows("\uFEFFmatchId,teamName,nickname\nm1,\"Team, A\",player_one\n\n");
    expect(comma.delimiter).toBe(",");
    expect(comma.rows).toHaveLength(1);
    expect(comma.rows[0].values.teamName).toBe("Team, A");

    const semicolon = parseDelimitedRows("matchId;teamName;rating\nm1;Team A;1,12\n");
    expect(semicolon.delimiter).toBe(";");
    expect(semicolon.rows[0].values.rating).toBe("1,12");

    const tsv = parseDelimitedRows("matchId\tteamName\tnickname\nm1\tTeam A\tplayer_one\n");
    expect(tsv.delimiter).toBe("\t");
    expect(tsv.rows[0].values.nickname).toBe("player_one");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("defines exact templates for every analyst sheet", () => {
    expect(analystSheetTemplates.roster.columns).toEqual(["matchId", "teamName", "nickname", "role", "country", "sourceName", "collectedAt", "period", "sampleSize", "confidence"]);
    expect(analystSheetTemplates.player_stats.columns).toContain("openingKills");
    expect(analystSheetTemplates.map_stats.columns).toContain("ctRoundWinRate");
    expect(analystSheetTemplates.veto_history.columns).toContain("deciderRate");
    expect(analystSheetTemplates.h2h.columns).toContain("rosterSimilarity");
    expect(analystSheetTemplates.news_events.columns).toContain("publishedAt");
    expect(buildAnalystSheetTemplate("roster")).toContain("Team A");
    expect(buildAnalystSheetTemplate("roster")).toContain("player_name");
  });

  it("builds target-specific templates that remain invalid until real evidence replaces placeholders", () => {
    const context = { matchId: "pandascore_match_1488973", teamAName: "Evo Novo", teamBName: "WAZABI" };
    const roster = buildTargetAnalystSheetTemplate("roster", context);
    const playerStats = buildTargetAnalystSheetTemplate("player_stats", context);
    const mapStats = buildTargetAnalystSheetTemplate("map_stats", context);
    const veto = buildTargetAnalystSheetTemplate("veto_history", context);

    expect(roster).toContain("pandascore_match_1488973");
    expect(roster).toContain("Evo Novo");
    expect(roster).toContain("WAZABI");
    expect(roster.match(/player_name_1/g)?.length).toBe(2);
    expect(roster.match(/source name/g)?.length).toBe(10);
    expect(roster).toContain("current_roster,0,0");
    expect(playerStats).toContain("last_30_days,0,0");
    expect(mapStats).toContain("Mirage,0,0,0");
    expect(veto).toContain("last_90_days,0");
  });

  it("normalizes common CS2 map names", () => {
    expect(normalizeMapName("mirage")).toBe("Mirage");
    expect(normalizeMapName("MIRAGE")).toBe("Mirage");
    expect(normalizeMapName("de_mirage")).toBe("Mirage");
    expect(normalizeMapName("ancient")).toBe("Ancient");
    expect(normalizeMapName("Mirrage")).toBeNull();
  });

  it("uses existing manual_real validation/apply instead of a parallel write path", () => {
    const source = readFileSync("src/lib/analystSheetImport.ts", "utf8");
    expect(source).toContain("validateManualEnrichment");
    expect(source).toContain("applyManualEnrichment");
    expect(source).toContain("manual_real_pack");
    expect(source).not.toContain("prisma.playerStatSnapshot.create");
    expect(source).not.toContain("prisma.teamMapStat.create");
  });

  it("renders UI controls, combined session actions, XLSX inactive copy and friendly errors", () => {
    const ui = readFileSync("src/components/AnalystSheetImportPanel.tsx", "utf8");
    const server = readFileSync("src/lib/analystSheetImport.ts", "utf8");
    const matchDetail = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const researchQueue = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    expect(ui).toContain("Загрузить analyst sheet");
    expect(ui).toContain("Скачать CSV template");
    expect(ui).toContain("Скопировать CSV template");
    expect(ui).toContain("Validate all");
    expect(ui).toContain("Preview combined pack");
    expect(ui).toContain("Apply combined pack");
    expect(ui).toContain("XLSX parser будет позже");
    expect(server).toContain("Строка ${row.lineNumber}: sampleSize должен быть больше 0.");
    expect(server).toContain("Возможно, вы имели в виду");
    expect(matchDetail).toContain("AnalystSheetImportPanel");
    expect(researchQueue).toContain("FirstRealForecastSheetSessionPanel");
  });

  it("does not add heavy parser dependencies or parser workers", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const forbidden of ["xlsx", "papaparse", "csv-parse", "better-sqlite3", "awpy", "demoparser", "demoinfocs"]) {
      expect(deps[forbidden]).toBeUndefined();
    }
    const source = readFileSync("src/lib/analystSheetImport.ts", "utf8").toLowerCase();
    expect(source).not.toContain("scrape");
    expect(source).not.toContain("hltv");
    expect(source).not.toContain("telegram");
  });
});
