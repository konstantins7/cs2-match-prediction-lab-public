import { buildForecastAutopilotCandidate } from "./autoResearch/candidateSelector";
import { prepareMatchForecast, runForecastAutopilot } from "./autoResearch";
import type { ForecastAutopilotMode, ForecastAutopilotNextAction } from "./autoResearchShared";
import { getBestNextAction } from "./bestNextAction";
import { calculatePrediction, buildPredictionInput } from "./predictionEngine";
import type { CoverageBreakdownItem, ForecastAutopilotProviderContribution } from "./autoResearchShared";
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
    const prepare = await prepareMatchForecast(matchId);
    const input = await buildPredictionInput(matchId);
    const prediction = calculatePrediction(input);
    const candidate = await buildForecastAutopilotCandidate(matchId);
    const fallback = getBestNextAction(prediction).primaryAction;
    const primaryNextAction = candidate.nextDataActions[0] ?? {
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
      ...buildProgressTimeline(candidate.coverageBreakdown, candidate.providerContributions, prediction),
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
  prediction: ReturnType<typeof calculatePrediction>
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
    fromBreakdown("match", "Матч найден", item("fixture"), "Матч есть в local cache и проверен как candidate."),
    fromBreakdown("ranking", "Рейтинг проверен", item("rank_basic")),
    fromBreakdown("roster", "Составы проверены", item("roster")),
    fromBreakdown("player_stats", "Статистика игроков проверена", item("player_stats")),
    fromBreakdown("maps", "Карты проверены", item("map_stats")),
    fromBreakdown("veto", "Veto проверено", item("veto")),
    providerStep("grid", "GRID проверен", "grid"),
    faceitLeetifyStep(providers),
    h2hNewsStep(item("optional_context")),
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
