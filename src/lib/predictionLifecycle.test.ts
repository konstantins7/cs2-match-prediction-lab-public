import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPredictionErrorAnalysis } from "./predictionLifecycle";

describe("prediction lifecycle", () => {
  it("adds persistent lifecycle models without changing forecast gates", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("model AnalysisJob");
    expect(schema).toContain("model AnalysisJobStep");
    expect(schema).toContain("model PredictionPick");
    expect(schema).toContain("model PredictionOutcome");
    expect(schema).toContain("model PredictionErrorAnalysis");
    expect(schema).toContain("@@unique([matchId, pickType])");
  });

  it("wires full analysis jobs and explicit final-pick saving", () => {
    const implementation = readFileSync("src/lib/fullMatchAnalysis.ts", "utf8");
    const route = readFileSync("src/app/api/admin/sync/route.ts", "utf8");
    expect(implementation).toContain("createAnalysisJob");
    expect(implementation).toContain("completeAnalysisJob");
    expect(implementation).toContain("saveFinalPredictionPickIfAllowed");
    expect(implementation).toContain("predictionPickStep");
    expect(route).toContain("savePrediction");
    expect(route).toContain("resolve_prediction_results");
    expect(route).toContain("manual_prediction_result");
  });

  it("guards final picks before match start and avoids silent overwrite", () => {
    const lifecycle = readFileSync("src/lib/predictionLifecycle.ts", "utf8");
    expect(lifecycle).toContain("now.getTime() >= new Date(match.startTime).getTime()");
    expect(lifecycle).toContain("existing_final_pick");
    expect(lifecycle).toContain("Final PredictionPick уже сохранён");
    expect(lifecycle).toContain("Real Forecast Ready=false");
  });

  it("resolves won/lost/void/unknown outcomes without betting or odds", () => {
    const lifecycle = readFileSync("src/lib/predictionLifecycle.ts", "utf8");
    expect(lifecycle).toContain("resolvePredictionResults");
    expect(lifecycle).toContain("local_finished_match");
    expect(lifecycle).toContain("won");
    expect(lifecycle).toContain("lost");
    expect(lifecycle).toContain("void");
    expect(lifecycle).not.toMatch(/betting|odds/i);
  });

  it("builds post-match error tags from missing data and risk context", () => {
    const review = buildPredictionErrorAnalysis({
      resultStatus: "lost",
      blockersJson: JSON.stringify(["map stats sample below gate", "missing H2H/news", "no GRID mapping"]),
      missingDataJson: JSON.stringify(["veto missing"]),
      topFactorsJson: "[]",
      warningsJson: JSON.stringify(["BO1 high variance", "source confidence low"]),
      risk: "high",
      dataQuality: 44
    });
    expect(review.suspectedErrorReasons).toContain("low map sample");
    expect(review.suspectedErrorReasons).toContain("missing H2H/news");
    expect(review.suspectedErrorReasons).toContain("no GRID mapping");
    expect(review.suspectedErrorReasons).toContain("dataQuality below threshold");
  });

  it("keeps private extractor as normalized import only with no crawler support", () => {
    const importsPage = readFileSync("src/app/admin/imports/page.tsx", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const combined = `${importsPage}\n${readme}`;
    expect(combined).toContain("player_stats.csv");
    expect(combined).toContain("manual_real_pack.json");
    expect(combined).toContain("existing validation/preview/apply");
    expect(combined).toContain("Core app не содержит HLTV scraper");
    expect(combined).not.toMatch(/puppeteer|playwright|apify_api_/i);
  });
});
