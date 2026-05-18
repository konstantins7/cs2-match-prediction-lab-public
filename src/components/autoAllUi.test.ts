import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Auto-All UI phase", () => {
  it("exposes polling API route and source lineage endpoint", () => {
    const route = readFileSync("src/app/api/auto-all/route.ts", "utf8");
    const jobs = readFileSync("src/lib/autoAllJobs.ts", "utf8");
    const lineage = readFileSync("src/lib/autoAllLineage.ts", "utf8");

    expect(route).toContain("startAutoAllJob");
    expect(route).toContain("getAutoAllJob");
    expect(route).toContain("view\") === \"lineage\"");
    expect(jobs).toContain("const ttlMs");
    expect(jobs).toContain("onProgress");
    expect(lineage).toContain("scanPrivateNormalizedInbox");
    expect(lineage).toContain("parseNormalizedCsv");
  });

  it("renders Auto-All button, polling progress, and lineage on match/home surfaces", () => {
    const button = readFileSync("src/components/AutoAllButton.tsx", "utf8");
    const progress = readFileSync("src/components/ProgressPanel.tsx", "utf8");
    const lineage = readFileSync("src/components/SourceLineage.tsx", "utf8");
    const tabs = readFileSync("src/components/MatchDetailTabs.tsx", "utf8");
    const card = readFileSync("src/components/MatchCard.tsx", "utf8");

    expect(button).toContain("/api/auto-all");
    expect(button).toContain("await delay(500)");
    expect(button).toContain("Auto-All timed out after 60 seconds");
    expect(button).toContain("router.refresh()");
    expect(progress).toContain("CSStats");
    expect(progress).toContain("Private inbox");
    expect(lineage).toContain("view=lineage");
    expect(tabs).toContain("AutoAllButton");
    expect(card).toContain("AutoAllButton");
  });

  it("keeps Auto-All UI free of forbidden automation and direct Apply copy", () => {
    const combined = [
      "src/app/api/auto-all/route.ts",
      "src/components/AutoAllButton.tsx",
      "src/components/ProgressPanel.tsx",
      "src/components/SourceLineage.tsx",
      "src/lib/autoAllJobs.ts",
      "src/lib/autoAllLineage.ts"
    ].map((file) => readFileSync(file, "utf8").toLowerCase()).join("\n");
    for (const forbidden of ["hltv.org", "telegram", "apify", "puppeteer", "playwright", "selenium", "cheerio"]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(combined).not.toMatch(/applyanalyst|validateandapply|saveprediction/);
  });
});
