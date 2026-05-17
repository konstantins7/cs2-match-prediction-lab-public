import { buildForecastAutopilotCandidate } from "./autoResearch/candidateSelector";
import { prepareMatchForecast, runForecastAutopilot } from "./autoResearch";
import type { ForecastAutopilotMode, ForecastAutopilotNextAction } from "./autoResearchShared";
import { getBestNextAction } from "./bestNextAction";
import { calculatePrediction, buildPredictionInput } from "./predictionEngine";
import type { CoverageBreakdownItem, ForecastAutopilotProviderContribution } from "./autoResearchShared";
import { resolveMatchDataGaps, type DataGapResolution } from "./dataGapResolver";
import type { ConnectorResult } from "./dataConnectorRegistry";
import { rebuildSnapshots, runPredictionsForUpcomingMatches } from "./sources/sourceScheduler";
import {
  completeAnalysisJob,
  createAnalysisJob,
  failAnalysisJob,
  saveFinalPredictionPickIfAllowed,
  type FullAnalysisLifecycle
} from "./predictionLifecycle";

export type FullMatchAnalysisStepStatus = "success" | "partial" | "missing" | "blocked" | "error";

export type FullMatchAnalysisStep = {
  id: string;
  label: string;
  status: FullMatchAnalysisStepStatus;
  explanation: string;
  sourceUsed?: string;
  recordsFound?: number;
  connectorResults?: ConnectorResult[];
};

export type FullMatchAnalysisResult = {
  ok: boolean;
  mode: ForecastAutopilotMode;
  matchId: string;
  resultState: "ready" | "not_ready" | "blocked";
  message: string;
  progressTimeline: FullMatchAnalysisStep[];
  forecast: {
    teamAName: string;
    teamBName: string;
    teamAProbability: number;
    teamBProbability: number;
    confidenceScore: number;
    riskLevel: string;
    dataQualityScore: number;
    realForecastReady: boolean;
    readinessLevel: string;
    forecastabilityLabel: string;
    coverageScore: number;
    topFactors: Array<{ factorName: string; impact: number; explanation: string }>;
    mapVetoSummary: string;
    warnings: string[];
    previewAllowed: boolean;
  };
  blockers: string[];
  primaryNextAction: ForecastAutopilotNextAction | { label: string; reason: string; target: string; priority: "high" | "medium" | "low" };
  autopilot: {
    selectionReason: string;
    providerContributions: ForecastAutopilotProviderContribution[];
  };
  dataGapResolution: DataGapResolution;
  prepare: {
    basicHistorySnapshots: number;
    predictionAuditId: string;
    before: {
      readiness: string;
      realForecastReady: boolean;
      dataQualityScore: number;
      confidenceScore: number;
    };
    after: {
      readiness: string;
      realForecastReady: boolean;
      dataQualityScore: number;
      confidenceScore: number;
    };
  };
  lifecycle: FullAnalysisLifecycle;
};

export async function runFullMatchAnalysis(
  matchId: string,
  mode: ForecastAutopilotMode = "fast",
  options: { savePrediction?: boolean } = {}
): Promise<FullMatchAnalysisResult> {
  const job = await createAnalysisJob(matchId, mode);
  try {
    await runForecastAutopilot(mode, matchId);
    let candidate = await buildForecastAutopilotCandidate(matchId);
    const dataGapResolution = await resolveMatchDataGaps(matchId, mode, candidate);
    if (dataGapResolution.canRecalculate) {
      await rebuildSnapshots();
      await runPredictionsForUpcomingMatches();
    }
    const prepare = await prepareMatchForecast(matchId);
    const input = await buildPredictionInput(matchId);
    const prediction = calculatePrediction(input);
    candidate = await buildForecastAutopilotCandidate(matchId);
    const fallback = getBestNextAction(prediction).primaryAction;
    const primaryNextAction = dataGapResolution.nextAction ?? candidate.nextDataActions[0] ?? {
      label: fallback.label,
      reason: fallback.reason,
      target: "research_queue",
      priority: "medium" as const
    };
    const blockers = [...new Set([...candidate.blockers, ...prediction.realForecast.reasons, ...prediction.readiness.missingCriticalData])].slice(0, 8);
    const ready = prediction.realForecast.isReady;
    const resultState = ready ? "ready" : candidate.forecastabilityTier === "BLOCKED" ? "blocked" : "not_ready";
    const saveResult = await saveFinalPredictionPickIfAllowed({
      savePrediction: options.savePrediction,
      analysisJobId: job.id,
      input,
      prediction,
      candidate,
      blockers
    });
    const progressTimeline = [
      ...buildProgressTimeline(candidate.coverageBreakdown, candidate.providerContributions, prediction, dataGapResolution),
      predictionPickStep(saveResult.status, saveResult.message)
    ];

    await completeAnalysisJob({
      jobId: job.id,
      resultState,
      blockers,
      timeline: progressTimeline
    });

    return {
      ok: true,
      mode,
      matchId,
      resultState,
      message: ready ? "Прогноз готов" : "Финальный прогноз пока не готов",
      progressTimeline,
      forecast: {
        teamAName: input.teamA.name,
        teamBName: input.teamB.name,
        teamAProbability: prediction.teamAProbability,
        teamBProbability: prediction.teamBProbability,
        confidenceScore: prediction.confidenceScore,
        riskLevel: prediction.riskLevel,
        dataQualityScore: prediction.dataQualityScore,
        realForecastReady: ready,
        readinessLevel: prediction.readiness.level,
        forecastabilityLabel: candidate.forecastabilityLabel,
        coverageScore: candidate.coverageScore,
        topFactors: prediction.factors
          .slice()
          .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
          .slice(0, 5)
          .map((factor) => ({ factorName: factor.factorName, impact: factor.impact, explanation: factor.explanation })),
        mapVetoSummary: prediction.vetoScenarios.length
          ? prediction.vetoScenarios[0].explanation
          : "Map/veto summary недоступен без валидной map/veto истории.",
        warnings: prediction.warnings,
        previewAllowed: true
      },
      blockers,
      primaryNextAction,
      autopilot: {
        selectionReason: candidate.selectionReason,
        providerContributions: candidate.providerContributions
      },
      dataGapResolution,
      prepare: {
        basicHistorySnapshots: prepare.basicHistorySnapshots,
        predictionAuditId: prepare.predictionAuditId,
        before: prepare.before,
        after: prepare.after
      },
      lifecycle: {
        analysisJobId: job.id,
        predictionSaved: saveResult.status === "saved",
        predictionSaveStatus: saveResult.status,
        predictionPickId: saveResult.predictionPickId,
        existingPredictionPickId: saveResult.existingPredictionPickId,
        message: saveResult.message
      }
    };
  } catch (error) {
    await failAnalysisJob(job.id, error instanceof Error ? error.message : "Full match analysis failed.");
    throw error;
  }
}

function buildProgressTimeline(
  breakdown: CoverageBreakdownItem[],
  providers: ForecastAutopilotProviderContribution[],
  prediction: ReturnType<typeof calculatePrediction>,
  dataGapResolution: DataGapResolution
): FullMatchAnalysisStep[] {
  const item = (id: string) => breakdown.find((entry) => entry.id === id);
  const provider = (name: string) => providers.find((entry) => entry.source.toLowerCase().includes(name));
  const providerStep = (id: string, label: string, name: string): FullMatchAnalysisStep => {
    const row = provider(name);
    if (!row) return { id, label, status: "missing", explanation: "Источник не дал usable context для этого матча." };
    return {
      id,
      label,
      status: mapCoverageStatus(row.status === "unavailable" ? "no" : row.status),
      explanation: row.contribution
    };
  };

  const steps: FullMatchAnalysisStep[] = [
    {
      id: "cache",
      label: "Проверяю кэш",
      status: "success",
      explanation: "Полный анализ читает local DB/cache; page-load sync не выполняется.",
      sourceUsed: "local cache",
      recordsFound: 1
    },
    fromBreakdown("schedule", "Проверяю расписание", item("fixture"), "Матч есть в local cache и проверен как candidate."),
    resolverStep("ranking", "Проверяю рейтинг", item("rank_basic"), dataGapResolution, ["rank_basic"]),
    resolverStep("roster", "Проверяю составы", item("roster"), dataGapResolution, ["roster"]),
    resolverStep("player_stats", "Проверяю player stats", item("player_stats"), dataGapResolution, ["player_stats"]),
    resolverStep("maps", "Проверяю карты", item("map_stats"), dataGapResolution, ["map_stats"]),
    resolverStep("veto", "Проверяю veto", item("veto"), dataGapResolution, ["veto"]),
    resolverStep("team_form", "Проверяю team form/recent results", undefined, dataGapResolution, ["team_form"]),
    resolverStep("grid", "Проверяю GRID", undefined, dataGapResolution, ["grid_mapping"], providerStep("grid", "GRID проверен", "grid")),
    resolverStep("faceit_leetify", "Проверяю FACEIT/Leetify", undefined, dataGapResolution, ["roster", "player_stats"], faceitLeetifyStep(providers)),
    resolverStep("private_inbox", "Проверяю private normalized inbox", undefined, dataGapResolution, ["roster", "player_stats", "map_stats", "veto", "team_form", "h2h_news"]),
    resolverStep("h2h_news", "Проверяю H2H/news", item("optional_context"), dataGapResolution, ["h2h_news"], h2hNewsStep(item("optional_context"))),
    {
      id: "prediction",
      label: "Прогноз рассчитан",
      status: prediction.realForecast.isReady ? "success" : "partial",
      explanation: prediction.realForecast.isReady
        ? "Real Forecast Ready gates пройдены."
        : `Расчёт выполнен, но финальный статус заблокирован: ${prediction.realForecast.reasons[0] ?? "недостаточно validated evidence"}.`
    }
  ];
  return steps;
}

function resolverStep(
  id: string,
  label: string,
  entry: CoverageBreakdownItem | undefined,
  resolution: DataGapResolution,
  dataTypes: ConnectorResult["dataTypes"],
  fallback?: FullMatchAnalysisStep
): FullMatchAnalysisStep {
  const connectorResults = resolution.connectorResults.filter((result) => result.dataTypes.some((type) => dataTypes.includes(type)));
  const recordsFound = connectorResults.reduce((sum, result) => sum + result.recordsCreated + result.recordsUpdated, 0);
  const successful = connectorResults.some((result) => result.status === "success");
  const partial = connectorResults.some((result) => result.status === "partial");
  const blocked = connectorResults.some((result) => result.status === "blocked" || result.status === "error");
  const coverageStatus = entry ? mapCoverageStatus(entry.status) : undefined;
  const status: FullMatchAnalysisStepStatus = successful
    ? "success"
    : coverageStatus === "success"
      ? "success"
      : partial || coverageStatus === "partial"
        ? "partial"
        : blocked
          ? "blocked"
          : fallback?.status ?? "missing";
  const connectorSummary = connectorResults.map((result) => `${result.label}: ${result.status}${result.normalizedPayloadSummary ? ` (${result.normalizedPayloadSummary})` : ""}`).join("; ");
  const explanation = [
    entry ? (entry.blocker ? `${entry.explanation} Blocker: ${entry.blocker}.` : entry.explanation) : fallback?.explanation,
    connectorSummary ? `Resolvers: ${connectorSummary}.` : "Resolvers: подходящих usable records не найдено.",
    id === "private_inbox" && !resolution.trustedLocalImportsEnabled ? "Trusted local imports disabled; private inbox работает в preview-only режиме." : ""
  ].filter(Boolean).join(" ");
  return {
    id,
    label,
    status,
    explanation,
    sourceUsed: connectorResults.map((result) => result.connectorId).join(", ") || fallback?.sourceUsed,
    recordsFound,
    connectorResults
  };
}

function faceitLeetifyStep(providers: ForecastAutopilotProviderContribution[]): FullMatchAnalysisStep {
  const faceit = providers.find((entry) => entry.source.toLowerCase().includes("faceit"));
  const leetify = providers.find((entry) => entry.source.toLowerCase().includes("leetify"));
  const status = [faceit?.status, leetify?.status].includes("partial") || [faceit?.status, leetify?.status].includes("yes")
    ? "partial"
    : "missing";
  return {
    id: "faceit_leetify",
    label: "FACEIT/Leetify проверены",
    status,
    explanation: status === "partial"
      ? "Найден optional explicit-ID context. Он не заменяет Real Forecast gates."
      : "Explicit FACEIT/Leetify IDs не найдены, broad crawl/search не выполнялся."
  };
}

function h2hNewsStep(optional?: CoverageBreakdownItem): FullMatchAnalysisStep {
  if (!optional) return { id: "h2h_news", label: "H2H/news проверены", status: "missing", explanation: "Optional context не найден." };
  return {
    id: "h2h_news",
    label: "H2H/news проверены",
    status: optional.status === "yes" ? "success" : optional.status === "partial" ? "partial" : "missing",
    explanation: optional.explanation
  };
}

function fromBreakdown(id: string, label: string, entry?: CoverageBreakdownItem, fallback?: string): FullMatchAnalysisStep {
  if (!entry) return { id, label, status: "missing", explanation: fallback ?? "Данных нет." };
  return {
    id,
    label,
    status: mapCoverageStatus(entry.status),
    explanation: entry.blocker ? `${entry.explanation} Blocker: ${entry.blocker}.` : entry.explanation
  };
}

function mapCoverageStatus(status: "yes" | "partial" | "no"): FullMatchAnalysisStepStatus {
  if (status === "yes") return "success";
  if (status === "partial") return "partial";
  return "missing";
}

function predictionPickStep(status: string, message: string): FullMatchAnalysisStep {
  const ok = status === "saved";
  const neutral = status === "not_requested" || status === "existing_final_pick";
  return {
    id: "pick_saved",
    label: "Предикт сохранён",
    status: ok ? "success" : neutral ? "partial" : "blocked",
    explanation: message
  };
}
