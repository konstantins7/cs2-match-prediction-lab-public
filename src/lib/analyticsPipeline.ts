import { randomUUID } from "node:crypto";
import { buildForecastAutopilotCandidate } from "./autoResearch/candidateSelector";
import type { ForecastAutopilotCandidate, ForecastAutopilotMode, ForecastAutopilotNextAction } from "./autoResearchShared";
import { runFullMatchAnalysis, type FullMatchAnalysisResult } from "./fullMatchAnalysis";
import { saveMatchFeatureSnapshot } from "./features/matchFeatureSnapshot";
import { exportTrainingDatasetCsv } from "./modelLab/trainingDataset";
import { isTrustedLocalImportEnabled, scanPrivateNormalizedInbox, type PrivateInboxScanResult } from "./privateNormalizedInbox";
import { prisma } from "./prisma";
import { parserAdapterPolicySummary, type ParserAdapterPolicy } from "./parserAdapterRegistry";
import { runAllFetchers, type RunAllFetchersOptions } from "../../tools/run-all-fetchers";
import type { FetcherReport } from "../../tools/data-fetchers/utils";
import { runAutoFill, type AutoFillResult } from "../../tools/auto-fill";

export type AnalyticsPipelineStepStatus = "success" | "partial" | "skipped" | "blocked" | "error";

export type AnalyticsPipelineStep = {
  id: string;
  label: string;
  status: AnalyticsPipelineStepStatus;
  explanation: string;
  recordsFound?: number;
  sourceUsed?: string;
};

export type AnalyticsCoverageSummary = {
  forecastabilityTier: string;
  forecastabilityLabel: string;
  coverageScore: number;
  realForecastReady: boolean;
  realDataDepth: number;
  readinessLevel: string;
  blockers: string[];
  nextAction?: ForecastAutopilotNextAction;
};

export type AnalyticsPrivateInboxSummary = {
  inboxPath: string;
  trustedLocalImportsEnabled: boolean;
  filesFound: number;
  acceptedFiles: number;
  validationPassed: number;
  validationFailed: number;
  recordsCreated: number;
  recordsUpdated: number;
  warnings: string[];
};

export type AnalyticsPipelineResult = {
  ok: boolean;
  pipelineRunId: string;
  dryRun: boolean;
  matchId: string;
  mode: ForecastAutopilotMode;
  steps: AnalyticsPipelineStep[];
  fetcherReports: FetcherReport[];
  privateInboxSummary: AnalyticsPrivateInboxSummary;
  autoFillResult?: AutoFillResult;
  coverageBefore: AnalyticsCoverageSummary | null;
  coverageAfter: AnalyticsCoverageSummary | null;
  analysisJobId?: string;
  predictionPickId?: string;
  modelDatasetStatus: {
    rows: number;
    columns: string[];
    exportReady: boolean;
    note: string;
  };
  nextAction?: ForecastAutopilotNextAction | FullMatchAnalysisResult["primaryNextAction"];
  parserPolicy: Array<Pick<ParserAdapterPolicy, "id" | "label" | "mode" | "legalStatus" | "canAutoRun" | "output" | "limitations">>;
};

export type AnalyticsPipelineOptions = {
  mode?: ForecastAutopilotMode;
  dryRun?: boolean;
  force?: boolean;
  savePrediction?: boolean;
  autoFill?: boolean;
};

type MatchContext = {
  matchId: string;
  teamNames: string[];
};

export type AnalyticsPipelineDeps = {
  getMatchContext: (matchId: string) => Promise<MatchContext | null>;
  getCoverage: (matchId: string) => Promise<AnalyticsCoverageSummary>;
  runFetchers: (options: RunAllFetchersOptions) => Promise<{ status: string; reports: FetcherReport[]; createdOrInsertedRows: number; skippedRows: number }>;
  runAutoFill: typeof runAutoFill;
  scanInbox: typeof scanPrivateNormalizedInbox;
  runAnalysis: typeof runFullMatchAnalysis;
  saveFeatureSnapshot: typeof saveMatchFeatureSnapshot;
  exportDataset: typeof exportTrainingDatasetCsv;
  parserPolicySummary: typeof parserAdapterPolicySummary;
};

const defaultDeps: AnalyticsPipelineDeps = {
  getMatchContext: async (matchId) => {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { teamA: true, teamB: true }
    });
    if (!match) return null;
    return { matchId, teamNames: [match.teamA.name, match.teamB.name] };
  },
  getCoverage: async (matchId) => summarizeCoverage(await buildForecastAutopilotCandidate(matchId)),
  runFetchers: runAllFetchers,
  runAutoFill,
  scanInbox: scanPrivateNormalizedInbox,
  runAnalysis: runFullMatchAnalysis,
  saveFeatureSnapshot: saveMatchFeatureSnapshot,
  exportDataset: exportTrainingDatasetCsv,
  parserPolicySummary: parserAdapterPolicySummary
};

export async function runAnalyticsPipeline(
  matchId: string,
  options: AnalyticsPipelineOptions = {},
  deps: AnalyticsPipelineDeps = defaultDeps
): Promise<AnalyticsPipelineResult> {
  const mode = options.mode ?? "fast";
  const dryRun = options.dryRun === true;
  const pipelineRunId = `pipeline_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const steps: AnalyticsPipelineStep[] = [];
  const parserPolicy = deps.parserPolicySummary();
  let fetcherReports: FetcherReport[] = [];
  let autoFillResult: AutoFillResult | undefined;
  let coverageBefore: AnalyticsCoverageSummary | null = null;
  let coverageAfter: AnalyticsCoverageSummary | null = null;
  let privateInboxSummary: AnalyticsPrivateInboxSummary = emptyInboxSummary();
  let analysis: FullMatchAnalysisResult | null = null;
  let dataset = { rows: 0, columns: [] as string[] };

  const context = await deps.getMatchContext(matchId);
  if (!context) {
    steps.push({
      id: "match_context",
      label: "Match context",
      status: "blocked",
      explanation: `Match ${matchId} was not found in local DB/cache.`
    });
    return {
      ok: false,
      pipelineRunId,
      dryRun,
      matchId,
      mode,
      steps,
      fetcherReports,
      privateInboxSummary,
      coverageBefore,
      coverageAfter,
      modelDatasetStatus: datasetStatus(dataset.rows, dataset.columns),
      parserPolicy
    };
  }
  steps.push({
    id: "match_context",
    label: "Match context",
    status: "success",
    explanation: `Target locked to ${context.matchId}; pipeline will not switch matches.`,
    recordsFound: 1,
    sourceUsed: "local DB/cache"
  });

  coverageBefore = await stepResult(steps, "coverage_before", "Coverage before", async () => deps.getCoverage(matchId), (coverage) => ({
    status: coverage.realForecastReady ? "success" : coverage.coverageScore >= 70 ? "partial" : "blocked",
    explanation: `${coverage.forecastabilityLabel}: ${coverage.coverageScore}/100.`
  }));

  if (options.autoFill) {
    autoFillResult = await stepResult(
      steps,
      "auto_fill",
      "Safe auto-fill",
      async () => deps.runAutoFill({ matchId, teamNames: [context.teamNames[0] ?? "", context.teamNames[1] ?? ""], mode, dryRun }),
      (result) => ({
        status: result.stillMissing.length ? "partial" : "success",
        explanation: `${result.writes.reduce((sum, write) => sum + write.rows, 0)} row(s) prepared; stillMissing=${result.stillMissing.join(", ") || "none"}.`,
        recordsFound: result.writes.reduce((sum, write) => sum + write.rows, 0),
        sourceUsed: "tools/auto-fill"
      })
    ) ?? undefined;
  } else {
    const fetcherRun = await stepResult(
      steps,
      "safe_fetchers",
      "Safe DAL fetchers",
      async () => deps.runFetchers({ matchId, teamNames: context.teamNames, dryRun, force: options.force }),
      (result) => {
        fetcherReports = result.reports;
        const enabled = result.reports.filter((report) => report.status !== "skipped").length;
        const failed = result.reports.filter((report) => report.status === "failed").length;
        return {
          status: failed ? "partial" : enabled ? "success" : "skipped",
          explanation: `${enabled} enabled fetcher(s), ${result.reports.length - enabled} skipped; inserted=${result.createdOrInsertedRows}, skippedRows=${result.skippedRows}.`,
          recordsFound: result.createdOrInsertedRows,
          sourceUsed: "tools/data-fetchers"
        };
      }
    );
    if (fetcherRun) fetcherReports = fetcherRun.reports;
  }

  const inboxScan = await stepResult(
    steps,
    "private_inbox",
    "Private inbox validation",
    async () => deps.scanInbox(matchId, { trustedLocalImports: dryRun ? false : isTrustedLocalImportEnabled() }),
    (scan) => {
      privateInboxSummary = summarizeInbox(scan);
      return {
        status: scan.validationFailed ? "partial" : scan.acceptedFiles ? "success" : "skipped",
        explanation: `${scan.acceptedFiles}/${scan.filesFound} accepted file(s); passed=${scan.validationPassed}, failed=${scan.validationFailed}, created=${scan.recordsCreated}, updated=${scan.recordsUpdated}.`,
        recordsFound: scan.recordsCreated + scan.recordsUpdated,
        sourceUsed: "data/private-inbox"
      };
    }
  );
  if (inboxScan) privateInboxSummary = summarizeInbox(inboxScan);

  if (dryRun) {
    steps.push({
      id: "full_match_analysis",
      label: "Full match analysis",
      status: "skipped",
      explanation: "Dry run: no AnalysisJob, PredictionPick, or feature snapshot was created."
    });
  } else {
    analysis = await stepResult(
      steps,
      "full_match_analysis",
      "Full match analysis",
      async () => deps.runAnalysis(matchId, mode, { savePrediction: options.savePrediction === true }),
      (result) => ({
        status: result.resultState === "ready" ? "success" : result.resultState === "not_ready" ? "partial" : "blocked",
        explanation: `${result.message}; timeline=${result.progressTimeline.length}, predictionSave=${result.lifecycle.predictionSaveStatus}.`,
        recordsFound: result.progressTimeline.length,
        sourceUsed: "full_match_analysis"
      })
    );
  }

  if (dryRun) {
    steps.push({
      id: "feature_snapshot",
      label: "Feature snapshot",
      status: "skipped",
      explanation: "Dry run: feature snapshot export check only, no DB write."
    });
  } else {
    await stepResult(
      steps,
      "feature_snapshot",
      "Feature snapshot",
      async () => deps.saveFeatureSnapshot(matchId),
      () => ({
        status: "success",
        explanation: "Feature snapshot generated with existing cutoff/leakage rules.",
        recordsFound: 1,
        sourceUsed: "MatchFeatureSnapshot"
      })
    );
  }

  dataset = await stepResult(
    steps,
    "model_dataset",
    "Model dataset export",
    async () => deps.exportDataset(),
    (result) => ({
      status: result.rows ? "success" : "partial",
      explanation: result.rows
        ? `Read-only dataset export ready: ${result.rows} row(s), ${result.columns.length} columns.`
        : "Read-only dataset export has no eligible finished non-sample rows yet.",
      recordsFound: result.rows,
      sourceUsed: "MatchFeatureSnapshot"
    })
  ) ?? dataset;

  steps.push({
    id: "parser_policy",
    label: "Parser adapter policy",
    status: parserPolicy.some((adapter) => adapter.legalStatus === "forbidden" && adapter.canAutoRun) ? "error" : "success",
    explanation: "Network/table parser adapters are metadata-only and cannot auto-run; forbidden adapters stay disabled.",
    recordsFound: parserPolicy.length,
    sourceUsed: "parserAdapterRegistry"
  });

  coverageAfter = dryRun ? coverageBefore : await stepResult(steps, "coverage_after", "Coverage after", async () => deps.getCoverage(matchId), (coverage) => ({
    status: coverage.realForecastReady ? "success" : coverage.coverageScore >= (coverageBefore?.coverageScore ?? 0) ? "partial" : "blocked",
    explanation: `${coverage.forecastabilityLabel}: ${coverage.coverageScore}/100 after pipeline.`
  }));

  const nextAction = analysis?.primaryNextAction ?? coverageAfter?.nextAction ?? coverageBefore?.nextAction;
  return {
    ok: !steps.some((step) => step.status === "error"),
    pipelineRunId,
    dryRun,
    matchId,
    mode,
    steps,
    fetcherReports,
    autoFillResult,
    privateInboxSummary,
    coverageBefore,
    coverageAfter,
    analysisJobId: analysis?.lifecycle.analysisJobId,
    predictionPickId: analysis?.lifecycle.predictionPickId,
    modelDatasetStatus: datasetStatus(dataset.rows, dataset.columns),
    nextAction,
    parserPolicy
  };
}

function summarizeCoverage(candidate: ForecastAutopilotCandidate): AnalyticsCoverageSummary {
  return {
    forecastabilityTier: candidate.forecastabilityTier,
    forecastabilityLabel: candidate.forecastabilityLabel,
    coverageScore: candidate.coverageScore,
    realForecastReady: candidate.realForecastReady,
    realDataDepth: candidate.realDataDepth,
    readinessLevel: candidate.readinessLevel,
    blockers: candidate.blockers,
    nextAction: candidate.nextDataActions[0]
  };
}

function summarizeInbox(scan: PrivateInboxScanResult): AnalyticsPrivateInboxSummary {
  return {
    inboxPath: scan.inboxPath,
    trustedLocalImportsEnabled: scan.trustedLocalImportsEnabled,
    filesFound: scan.filesFound,
    acceptedFiles: scan.acceptedFiles,
    validationPassed: scan.validationPassed,
    validationFailed: scan.validationFailed,
    recordsCreated: scan.recordsCreated,
    recordsUpdated: scan.recordsUpdated,
    warnings: scan.warnings
  };
}

function emptyInboxSummary(): AnalyticsPrivateInboxSummary {
  return {
    inboxPath: "",
    trustedLocalImportsEnabled: false,
    filesFound: 0,
    acceptedFiles: 0,
    validationPassed: 0,
    validationFailed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    warnings: []
  };
}

function datasetStatus(rows: number, columns: string[]) {
  return {
    rows,
    columns,
    exportReady: rows > 0,
    note: rows > 0
      ? "Model-ready CSV export is available for local experiments only; production forecast math is unchanged."
      : "No eligible finished non-sample rows yet; export remains read-only scaffolding."
  };
}

async function stepResult<T>(
  steps: AnalyticsPipelineStep[],
  id: string,
  label: string,
  task: () => Promise<T>,
  describe: (result: T) => Omit<AnalyticsPipelineStep, "id" | "label">
) {
  try {
    const result = await task();
    const step = describe(result);
    steps.push({ id, label, ...step });
    return result;
  } catch (error) {
    steps.push({
      id,
      label,
      status: "error",
      explanation: error instanceof Error ? error.message : "Pipeline step failed."
    });
    return null;
  }
}
