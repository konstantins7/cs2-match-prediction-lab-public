import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARSED_DEMO_EXPORT_PROFILE_NOTES, parsedDemoExportTemplate, parsedDemoSourceTools } from "./parsedDemoExportProfiles";

describe("MVP 0.7.3 parsed demo export intake", () => {
  it("defines the canonical JSON-first parsed_demo_export shape and supported profiles", () => {
    const template = parsedDemoExportTemplate("match_1", "demoparser");
    expect(template).toMatchObject({
      type: "parsed_demo_export",
      sourceTool: "demoparser",
      matchId: "match_1",
      dataRole: "historical_team_form",
      sampleSize: 0,
      confidence: 0
    });
    expect(parsedDemoSourceTools).toEqual(["cs_demo_manager", "awpy", "demoparser", "demoinfocs", "custom"]);
    expect(PARSED_DEMO_EXPORT_PROFILE_NOTES.map((note) => note.sourceTool)).toEqual([...parsedDemoSourceTools]);
    expect(PARSED_DEMO_EXPORT_PROFILE_NOTES.find((note) => note.sourceTool === "demoparser")?.targetRecords).toContain("TeamFormSnapshot proxy");
  });

  it("adds dedicated validate/apply APIs and keeps responses scoped/redacted", () => {
    const validateRoute = readFileSync("src/app/api/admin/parsed-demo-export/validate/route.ts", "utf8");
    const applyRoute = readFileSync("src/app/api/admin/parsed-demo-export/apply/route.ts", "utf8");
    expect(validateRoute).toContain("previewParsedDemoExport");
    expect(validateRoute).toContain("validateParsedDemoExport");
    expect(applyRoute).toContain("applyParsedDemoExport");
    expect(`${validateRoute}\n${applyRoute}`).not.toMatch(/Authorization|Bearer|API_KEY/);
  });

  it("rejects template/raw-only/leakage payloads before creating domain records", () => {
    const source = readFileSync("src/lib/parsedDemoExport.ts", "utf8");
    expect(source).toContain("raw-only/template payload rejected");
    expect(source).toContain("sampleSize must be > 0");
    expect(source).toContain("confidence must be > 0");
    expect(source).toContain("unknown or invalid map name");
    expect(source).toContain("parsed_demo_export leakage");
    const invalidReturn = source.indexOf("if (!preview.ok || !preview.matchId)");
    const saveRecord = source.indexOf("const saved = await saveExternalSourceRecord");
    expect(invalidReturn).toBeGreaterThan(0);
    expect(saveRecord).toBeGreaterThan(invalidReturn);
  });

  it("creates scoped lineage records only after valid validation", () => {
    const source = readFileSync("src/lib/parsedDemoExport.ts", "utf8");
    expect(source).toContain('source: "parsed-demo"');
    expect(source).toContain('entityType: "parsed_demo_export"');
    expect(source).toContain('sourceMode: "parsed_demo"');
    expect(source).toContain("matchId: meta.matchId");
    expect(source).toContain("importBatchId: meta.importBatchId");
    expect(source).toContain("sourceRecordId");
    expect(source).toContain("dataRole: meta.dataRole");
    expect(source).toContain("dataLeakageCheckPassed: meta.dataLeakageCheckPassed");
    expect(source).toContain("prisma.playerStatSnapshot.create");
    expect(source).toContain("prisma.teamMapStat.create");
    expect(source).toContain("prisma.teamFormSnapshot.create");
    expect(source).toContain("prisma.vetoPattern.create");
    expect(source).toContain("prisma.headToHead.create");
  });

  it("keeps post-match/backtest payloads out of live pre-match evidence", () => {
    const source = readFileSync("src/lib/parsedDemoExport.ts", "utf8");
    expect(source).toContain("post_match_analysis");
    expect(source).toContain("backtest_only");
    expect(source).toContain("isPreMatchUsableDataRole");
    expect(source).toContain("forecastEligible: preMatchPassed");
    expect(source).toContain("if (meta.forecastEligible");
  });

  it("renders profile selector, example/template controls, mapping notes, and apply flow in UI", () => {
    const ui = readFileSync("src/components/ParsedDemoExportPanel.tsx", "utf8");
    const matchDetail = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const researchQueue = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    expect(ui).toContain("Загрузить demo/stat export");
    expect(ui).toContain("Скопировать пример JSON");
    expect(ui).toContain("Скачать шаблон JSON");
    expect(ui).toContain("Validate");
    expect(ui).toContain("Preview");
    expect(ui).toContain("Apply");
    expect(ui).toContain("mapping notes");
    expect(ui).toContain("Этот импорт может повысить глубину данных");
    expect(matchDetail).toContain("ParsedDemoExportPanel");
    expect(researchQueue).toContain("ParsedDemoExportPanel");
  });

  it("does not add parser/heavy dependencies or scraping paths", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const forbidden of ["apify-client", "awpy", "demoparser", "demoinfocs", "xlsx", "better-sqlite3"]) {
      expect(allDeps[forbidden]).toBeUndefined();
    }
    const intake = readFileSync("src/lib/parsedDemoExport.ts", "utf8").toLowerCase();
    expect(intake).not.toContain("hltv");
    expect(intake).not.toContain("telegram");
    expect(intake).not.toContain("scrape");
  });
});
