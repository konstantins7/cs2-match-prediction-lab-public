import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { createPredictionFixture } from "./prediction/testFixtures";
import {
  buildFirstRealForecastSessionView,
  evaluateFirstRealForecastTarget,
  firstRealForecastTarget
} from "./firstRealForecastSheetSession";

describe("MVP 0.7.5 first real forecast from analyst sheets", () => {
  it("accepts the confirmed Evo Novo vs WAZABI future/upcoming target", () => {
    const result = evaluateFirstRealForecastTarget({
      id: firstRealForecastTarget.matchId,
      startTime: firstRealForecastTarget.startTime,
      status: "upcoming",
      format: "BO3",
      eventName: "Group Stage",
      sourceMode: "pandascore_free",
      teamA: { name: "Evo Novo" },
      teamB: { name: "WAZABI" }
    }, new Date("2026-05-15T11:50:12.000Z"));

    expect(result.targetValid).toBe(true);
    expect(result.isFuture).toBe(true);
    expect(result.isUpcoming).toBe(true);
    expect(result.canonicalTeamsOk).toBe(true);
  });

  it("blocks stale or wrong target matches as live forecast targets", () => {
    const result = evaluateFirstRealForecastTarget({
      id: "pandascore_match_1474573",
      startTime: "2026-05-01T18:00:00.000Z",
      status: "upcoming",
      format: "BO3",
      eventName: "Group Stage",
      sourceMode: "pandascore_free",
      teamA: { name: "Evo Novo" },
      teamB: { name: "Wrong Team" }
    }, new Date("2026-05-15T11:50:12.000Z"));

    expect(result.targetValid).toBe(false);
    expect(result.blockers.join(" ")).toContain("Открыт не default target");
    expect(result.blockers.join(" ")).toContain("уже не future");
    expect(result.blockers.join(" ")).toContain("WAZABI");
  });

  it("shows blockers and keeps Real Forecast Ready false without real sheets", () => {
    const base = createPredictionFixture({
      match: {
        ...createPredictionFixture().match,
        id: firstRealForecastTarget.matchId,
        startTime: firstRealForecastTarget.startTime,
        status: "upcoming",
        format: "BO3",
        sourceMode: "pandascore_free"
      },
      teamA: { ...createPredictionFixture().teamA, name: "Evo Novo" },
      teamB: { ...createPredictionFixture().teamB, name: "WAZABI" },
      playersA: [],
      playersB: [],
      playerStatsA: [],
      playerStatsB: [],
      mapStatsA: [],
      mapStatsB: [],
      vetoPatternsA: [],
      vetoPatternsB: []
    });
    const prediction = calculatePrediction(base);
    const view = buildFirstRealForecastSessionView({ input: base, prediction, now: new Date("2026-05-15T11:50:12.000Z") });

    expect(view.workflowReady).toBe(true);
    expect(view.realForecastReadyBefore).toBe(false);
    expect(view.realCsvLoaded).toBe(false);
    expect(view.dataQualityBefore).toBeGreaterThanOrEqual(0);
    expect(view.confidenceBefore).toBeGreaterThanOrEqual(0);
    expect(view.missingBlocks).toEqual(expect.arrayContaining(["player roster", "player stats", "map stats", "veto history"]));
    expect(view.emptySessionBlockers.join(" ")).toContain("roster.csv");
    expect(view.emptySessionBlockers.join(" ")).toContain("confidence=0");
    expect(view.warnings.join(" ")).toContain("Без реальных CSV/TSV данных");
  });

  it("renders first real forecast sheet UI and reuses analyst-sheet APIs", () => {
    const panel = readFileSync("src/components/FirstRealForecastSheetSessionPanel.tsx", "utf8");
    const matchPage = readFileSync("src/app/match/[id]/page.tsx", "utf8");
    const queuePage = readFileSync("src/app/admin/research-queue/page.tsx", "utf8");
    const analystPanel = readFileSync("src/components/AnalystSheetImportPanel.tsx", "utf8");

    expect(panel).toContain("Собрать первый реальный прогноз из analyst sheets");
    expect(panel).toContain("WAZABI");
    expect(panel).toContain("initialContent=\"empty\"");
    expect(panel).toContain("templateContext");
    expect(panel).toContain("Data quality before");
    expect(panel).toContain("Manual Real Applied Data Usage Audit");
    expect(panel).toContain("map sample");
    expect(matchPage).toContain("firstRealForecastSession");
    expect(queuePage).toContain("FirstRealForecastSheetSessionPanel");
    expect(analystPanel).toContain("/api/admin/analyst-sheet/apply");
    expect(analystPanel).toContain("Нет реальных CSV/TSV данных для Apply");
  });

  it("does not introduce fake data, scraping, parser dependencies or page-load sync", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const forbidden of ["xlsx", "papaparse", "csv-parse", "awpy", "demoparser", "demoinfocs"]) {
      expect(deps[forbidden]).toBeUndefined();
    }
    const source = [
      readFileSync("src/lib/firstRealForecastSheetSession.ts", "utf8"),
      readFileSync("src/components/FirstRealForecastSheetSessionPanel.tsx", "utf8")
    ].join("\n").toLowerCase();
    expect(source).not.toContain("scrape");
    expect(source).not.toContain("hltv");
    expect(source).not.toContain("telegram");
    expect(source).not.toContain("faker");
    expect(source).not.toContain("seed");
  });
});
