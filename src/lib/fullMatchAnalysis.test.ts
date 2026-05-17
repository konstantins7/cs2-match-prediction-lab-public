import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("full match analysis UX", () => {
  it("registers full_match_analysis without adding manual CSV apply", () => {
    const route = readFileSync("src/app/api/admin/sync/route.ts", "utf8");
    const implementation = readFileSync("src/lib/fullMatchAnalysis.ts", "utf8");
    expect(route).toContain("full_match_analysis");
    expect(route).toContain("runFullMatchAnalysis");
    expect(implementation).toContain("progressTimeline");
    expect(implementation).toContain("primaryNextAction");
    expect(implementation).not.toContain("applyAnalystSheetImport");
    expect(implementation).not.toContain("manual-enrichment/apply");
  });

  it("keeps current match analysis scoped to the requested match", () => {
    const implementation = readFileSync("src/lib/fullMatchAnalysis.ts", "utf8");
    expect(implementation).toContain("matchId");
    expect(implementation).toContain("buildForecastAutopilotCandidate(matchId)");
    expect(implementation).not.toContain("bestCandidate.matchId");
  });

  it("renders persistent timeline and final/not-ready result UI on the match page", () => {
    const panel = readFileSync("src/components/FullMatchAnalysisPanel.tsx", "utf8");
    const matchTabs = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    expect(panel).toContain("Полный анализ");
    expect(panel).toContain("Progress timeline");
    expect(panel).toContain("Финальный прогноз пока не готов");
    expect(matchTabs).toContain("FullMatchAnalysisPanel");
  });

  it("keeps the home page user mode simple and advanced internals collapsed", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    expect(home).toContain("Матчи сейчас");
    expect(home).toContain("Сегодня");
    expect(home).toContain("Ближайшие");
    expect(home).toContain("Лучшие для прогноза");
    expect(home).toContain("Analyst / Advanced mode");
    expect(home.indexOf("<OneClickResearchButton compact />")).toBeGreaterThan(home.indexOf("Analyst / Advanced mode"));
  });

  it("shows Full Analysis on match cards and does not introduce page-load sync or forbidden source paths", () => {
    const card = readFileSync("src/components/MatchCard.tsx", "utf8");
    const home = readFileSync("src/app/page.tsx", "utf8");
    const all = `${card}\n${home}\n${readFileSync("src/lib/fullMatchAnalysis.ts", "utf8")}`;
    expect(card).toContain("Полный анализ");
    expect(home).not.toContain("refreshMatchFeed(");
    expect(all).not.toMatch(/HLTV scraper|Apify|browser crawler|fake data/i);
  });
});
