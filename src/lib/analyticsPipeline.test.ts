import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAnalyticsPipeline, type AnalyticsCoverageSummary, type AnalyticsPipelineDeps } from "./analyticsPipeline";
import { parserAdapterRegistry, validateParserDraftRequest } from "./parserAdapterRegistry";
import type { ForecastAutopilotMode, ForecastAutopilotNextAction } from "./autoResearchShared";
import type { FullMatchAnalysisResult } from "./fullMatchAnalysis";

const matchId = "pandascore_match_1488973";
const primaryNextAction: ForecastAutopilotNextAction = {
  label: "Добавить реальные карты в map_stats.csv",
  reason: "Evo Novo maps 4/7.",
  target: "map_stats",
  priority: "high"
};

function coverage(score: number): AnalyticsCoverageSummary {
  return {
    forecastabilityTier: score >= 70 ? "NEARLY_READY" : "BASIC_ONLY",
    forecastabilityLabel: score >= 70 ? "Почти готов" : "Только базовый прогноз",
    coverageScore: score,
    realForecastReady: false,
    realDataDepth: 4,
    readinessLevel: "L2_BASIC_PREDICTION",
    blockers: ["map stats sample below gate"],
    nextAction: primaryNextAction
  };
}

function fakeAnalysis(mode: ForecastAutopilotMode): FullMatchAnalysisResult {
  return {
    ok: true,
    mode,
    matchId,
    resultState: "not_ready",
    message: "Финальный прогноз пока не готов",
    progressTimeline: Array.from({ length: 14 }, (_, index) => ({
      id: `step_${index}`,
      label: `Step ${index}`,
      status: "partial",
      explanation: "Resolver timeline step."
    })),
    forecast: {
      teamAName: "Evo Novo",
      teamBName: "WAZABI",
      teamAProbability: 44,
      teamBProbability: 56,
      confidenceScore: 52,
      riskLevel: "high",
      dataQualityScore: 66,
      realForecastReady: false,
      readinessLevel: "L2_BASIC_PREDICTION",
      forecastabilityLabel: "Почти готов",
      coverageScore: 74,
      topFactors: [],
      mapVetoSummary: "Map/veto summary unavailable.",
      warnings: [],
      previewAllowed: true
    },
    blockers: ["map stats sample below gate"],
    primaryNextAction,
    autopilot: {
      selectionReason: "Target match remains locked.",
      providerContributions: []
    },
    dataGapResolution: {
      matchId,
      mode,
      missingBlocks: ["map_stats"],
      attemptedResolvers: ["local_existing_records"],
      connectorResults: [],
      recordsCreated: 0,
      recordsUpdated: 0,
      stillMissing: ["map_stats"],
      confidenceWarnings: [],
      nextAction: primaryNextAction,
      canRecalculate: false,
      shouldSavePrediction: false,
      trustedLocalImportsEnabled: false
    },
    prepare: {
      basicHistorySnapshots: 0,
      predictionAuditId: "audit_1",
      before: { readiness: "L2_BASIC_PREDICTION", realForecastReady: false, dataQualityScore: 66, confidenceScore: 52 },
      after: { readiness: "L2_BASIC_PREDICTION", realForecastReady: false, dataQualityScore: 66, confidenceScore: 52 }
    },
    lifecycle: {
      analysisJobId: "job_1",
      predictionSaved: false,
      predictionSaveStatus: "not_ready",
      message: "Real Forecast Ready is false."
    }
  } as FullMatchAnalysisResult;
}

function makeDeps(events: string[] = []): AnalyticsPipelineDeps {
  let coverageCalls = 0;
  return {
    getMatchContext: async (id) => {
      events.push(`context:${id}`);
      return { matchId: id, teamNames: ["Evo Novo", "WAZABI"] };
    },
    getCoverage: async (id) => {
      events.push(`coverage:${id}`);
      coverageCalls += 1;
      return coverage(coverageCalls === 1 ? 68 : 74);
    },
    runFetchers: async (options) => {
      events.push(`fetchers:${options.matchId}:${options.teamNames?.join("|")}:${options.dryRun ? "dry" : "write"}`);
      return {
        status: "completed",
        reports: [{
          source: "esport.is",
          status: "skipped",
          fetched: {},
          writes: [],
          warnings: ["disabled"],
          errors: []
        }],
        createdOrInsertedRows: 0,
        skippedRows: 0
      };
    },
    scanInbox: async (_id, options = {}) => {
      events.push(`inbox:${options.trustedLocalImports ? "trusted" : "preview"}`);
      return {
        inboxPath: "data/private-inbox",
        trustedLocalImportsEnabled: Boolean(options.trustedLocalImports),
        filesFound: 1,
        acceptedFiles: 1,
        validationPassed: 1,
        validationFailed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        reports: [],
        warnings: []
      };
    },
    runAnalysis: async (id, mode = "fast", options = {}) => {
      events.push(`analysis:${id}:${mode}:${options.savePrediction ? "save" : "preview"}`);
      return fakeAnalysis(mode);
    },
    saveFeatureSnapshot: async (id) => {
      events.push(`feature:${id}`);
      return { id: "feature_1" } as Awaited<ReturnType<AnalyticsPipelineDeps["saveFeatureSnapshot"]>>;
    },
    exportDataset: async () => {
      events.push("dataset");
      return { csv: "matchId\nm1\n", rows: 1, columns: ["matchId"] };
    },
    parserPolicySummary: () => parserAdapterRegistry
  };
}

describe("MVP 0.8.7 analytics pipeline", () => {
  it("composes safe fetchers, inbox, full analysis, feature snapshot, and dataset export without switching target", async () => {
    const events: string[] = [];
    const result = await runAnalyticsPipeline(matchId, { mode: "fast", savePrediction: true }, makeDeps(events));

    expect(result.ok).toBe(true);
    expect(result.matchId).toBe(matchId);
    expect(result.analysisJobId).toBe("job_1");
    expect(result.predictionPickId).toBeUndefined();
    expect(result.nextAction?.target).toBe("map_stats");
    expect(result.coverageBefore?.coverageScore).toBe(68);
    expect(result.coverageAfter?.coverageScore).toBe(74);
    expect(result.modelDatasetStatus.exportReady).toBe(true);
    expect(events).toContain(`analysis:${matchId}:fast:save`);
    expect(events).toContain(`feature:${matchId}`);
  });

  it("dry-run reports the pipeline without creating analysis jobs, picks, or feature snapshots", async () => {
    const events: string[] = [];
    const result = await runAnalyticsPipeline(matchId, { mode: "deeper", dryRun: true }, makeDeps(events));

    expect(result.dryRun).toBe(true);
    expect(result.analysisJobId).toBeUndefined();
    expect(result.predictionPickId).toBeUndefined();
    expect(result.steps.find((step) => step.id === "full_match_analysis")?.status).toBe("skipped");
    expect(events.some((event) => event.startsWith("analysis:"))).toBe(false);
    expect(events.some((event) => event.startsWith("feature:"))).toBe(false);
    expect(events).toContain(`fetchers:${matchId}:Evo Novo|WAZABI:dry`);
  });

  it("keeps parser adapter registry disabled and blocks forbidden URLs", () => {
    expect(parserAdapterRegistry.filter((adapter) => adapter.legalStatus === "forbidden").every((adapter) => adapter.canAutoRun === false)).toBe(true);
    expect(validateParserDraftRequest({ adapterId: "generic_public_table_draft", enabled: true, url: "https://example.test/table" }).ok).toBe(false);
    expect(validateParserDraftRequest({ adapterId: "private_normalized_output", enabled: true, url: "https://hltv.example.invalid/table" }).ok).toBe(false);
  });

  it("registers analytics_pipeline API action and data:pipeline CLI script", async () => {
    const [route, pkg] = await Promise.all([
      readFile(path.join(process.cwd(), "src/app/api/admin/sync/route.ts"), "utf8"),
      readFile(path.join(process.cwd(), "package.json"), "utf8")
    ]);
    expect(route).toContain("analytics_pipeline");
    expect(route).toContain("runAnalyticsPipeline");
    expect(JSON.parse(pkg).scripts["data:pipeline"]).toContain("src/scripts/analyticsPipeline.ts");
  });

  it("keeps model dataset export read-only and leakage-filtered", async () => {
    const source = await readFile(path.join(process.cwd(), "src/lib/modelLab/trainingDataset.ts"), "utf8");
    expect(source).toContain("dataLeakageCheckPassed: true");
    expect(source).toContain('sourceMode !== "analyst_sample"');
    expect(source).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("keeps executable pipeline code free of crawler and forbidden-domain dependencies", async () => {
    const files = [
      "src/lib/analyticsPipeline.ts",
      "src/scripts/analyticsPipeline.ts",
      "src/lib/parserAdapterRegistry.ts"
    ];
    const combined = (await Promise.all(files.map((file) => readFile(path.join(process.cwd(), file), "utf8")))).join("\n").toLowerCase();
    expect(combined).not.toContain("puppeteer");
    expect(combined).not.toContain("playwright");
    expect(combined).not.toContain("selenium");
    expect(combined).not.toContain("cheerio");
    expect(combined).not.toContain("hltv.org");
    expect(combined).not.toContain("telegram.org");
    expect(combined).not.toContain("apify.com");
    expect(combined).not.toContain("from \"node:http\"");
    expect(combined).not.toContain("from \"node:https\"");
  });
});
