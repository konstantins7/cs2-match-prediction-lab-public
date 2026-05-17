import { prisma } from "./prisma";
import type { FullMatchAnalysisStep } from "./fullMatchAnalysis";
import type { ForecastAutopilotCandidate, ForecastAutopilotMode } from "./autoResearchShared";
import type { PredictionInput, PredictionOutput } from "./predictionEngine";
import { deriveRealDataDepth } from "./ui/forecastUx";

export type PredictionSaveStatus =
  | "saved"
  | "not_requested"
  | "not_ready"
  | "after_start"
  | "existing_final_pick"
  | "match_not_found";

export type PredictionSaveResult = {
  status: PredictionSaveStatus;
  predictionPickId?: string;
  existingPredictionPickId?: string;
  message: string;
};

export type FullAnalysisLifecycle = {
  analysisJobId: string;
  predictionSaved: boolean;
  predictionSaveStatus: PredictionSaveStatus;
  predictionPickId?: string;
  existingPredictionPickId?: string;
  message: string;
};

export async function createAnalysisJob(matchId: string, mode: ForecastAutopilotMode) {
  return prisma.analysisJob.create({
    data: {
      matchId,
      mode,
      status: "running",
      currentStep: "match_found",
      createdBy: "local_user"
    }
  });
}

export async function completeAnalysisJob(params: {
  jobId: string;
  resultState: string;
  blockers: string[];
  timeline: FullMatchAnalysisStep[];
}) {
  await prisma.$transaction([
    prisma.analysisJobStep.createMany({
      data: params.timeline.map((step) => ({
        jobId: params.jobId,
        stepKey: step.id,
        status: step.status,
        explanation: step.explanation,
        recordsFound: step.status === "success" ? 1 : 0,
        blockerCode: step.status === "missing" || step.status === "blocked" ? step.id : null,
        sourceUsed: step.id
      }))
    }),
    prisma.analysisJob.update({
      where: { id: params.jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        currentStep: "done",
        resultState: params.resultState,
        blockersJson: JSON.stringify(params.blockers)
      }
    })
  ]);
}

export async function failAnalysisJob(jobId: string, error: string) {
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      currentStep: "error",
      error
    }
  });
}

export async function saveFinalPredictionPickIfAllowed(params: {
  savePrediction?: boolean;
  analysisJobId: string;
  input: PredictionInput;
  prediction: PredictionOutput;
  candidate: ForecastAutopilotCandidate;
  blockers: string[];
  now?: Date;
}): Promise<PredictionSaveResult> {
  if (!params.savePrediction) {
    return { status: "not_requested", message: "AnalysisJob сохранён; final PredictionPick не запрошен." };
  }
  if (!params.prediction.realForecast.isReady) {
    return { status: "not_ready", message: "Final PredictionPick не сохранён: Real Forecast Ready=false." };
  }

  const now = params.now ?? new Date();
  const match = await prisma.match.findUnique({
    where: { id: params.input.match.id },
    include: {
      predictionPicks: {
        where: { pickType: "final" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!match) return { status: "match_not_found", message: "Final PredictionPick не сохранён: match not found." };
  if (now.getTime() >= new Date(match.startTime).getTime()) {
    return { status: "after_start", message: "Final PredictionPick не сохранён: матч уже начался или завершён." };
  }
  const existing = match.predictionPicks[0];
  if (existing) {
    return {
      status: "existing_final_pick",
      existingPredictionPickId: existing.id,
      message: "Final PredictionPick уже сохранён; новый анализ не перезаписывает исходный pick."
    };
  }

  const realDepth = deriveRealDataDepth(params.input, params.prediction).level;
  const pick = await prisma.predictionPick.create({
    data: {
      matchId: params.input.match.id,
      analysisJobId: params.analysisJobId,
      pickType: "final",
      status: "pending",
      predictedWinnerTeamId: params.prediction.predictedWinnerId,
      teamAProbability: params.prediction.teamAProbability,
      teamBProbability: params.prediction.teamBProbability,
      confidence: params.prediction.confidenceScore,
      risk: params.prediction.riskLevel,
      readiness: params.prediction.readiness.level,
      realForecastReady: params.prediction.realForecast.isReady,
      dataQuality: params.prediction.dataQualityScore,
      coverageScore: params.candidate.coverageScore,
      forecastabilityTier: params.candidate.forecastabilityTier,
      realDataDepth: realDepth,
      topFactorsJson: JSON.stringify(
        params.prediction.factors
          .slice()
          .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
          .slice(0, 5)
      ),
      warningsJson: JSON.stringify(params.prediction.warnings),
      blockersJson: JSON.stringify(params.blockers),
      sourceSummaryJson: JSON.stringify(params.candidate.providerContributions),
      missingDataJson: JSON.stringify({
        readiness: params.prediction.readiness.missingCriticalData,
        realForecast: params.prediction.realForecast.reasons,
        risk: params.prediction.riskBreakdown.missingData
      }),
      matchStartTime: new Date(params.input.match.startTime),
      lockedAt: now
    }
  });
  return {
    status: "saved",
    predictionPickId: pick.id,
    message: "Final PredictionPick сохранён до старта матча."
  };
}

export async function resolvePredictionResults() {
  const picks = await prisma.predictionPick.findMany({
    where: {
      pickType: "final",
      status: { in: ["pending", "needs_result", "unknown"] }
    },
    include: { match: true }
  });

  let resolved = 0;
  let pending = 0;
  let voided = 0;
  const updated: Array<{ predictionPickId: string; status: string; source: string }> = [];

  for (const pick of picks) {
    const status = pick.match.status.toLowerCase();
    if (["cancelled", "canceled", "postponed", "rescheduled"].includes(status)) {
      await writeOutcomeAndReview({
        pickId: pick.id,
        actualWinnerTeamId: null,
        actualScore: null,
        resultSource: "local_match_status",
        status: status === "rescheduled" ? "rescheduled" : "void",
        notes: `Match status is ${pick.match.status}.`
      });
      await prisma.predictionPick.update({ where: { id: pick.id }, data: { status: status === "rescheduled" ? "rescheduled" : "void" } });
      voided += 1;
      updated.push({ predictionPickId: pick.id, status: status === "rescheduled" ? "rescheduled" : "void", source: "local_match_status" });
      continue;
    }
    if (status !== "finished" || !pick.match.winnerTeamId) {
      await prisma.predictionPick.update({ where: { id: pick.id }, data: { status: "needs_result" } });
      pending += 1;
      continue;
    }

    const outcomeStatus = pick.predictedWinnerTeamId === pick.match.winnerTeamId ? "won" : "lost";
    await writeOutcomeAndReview({
      pickId: pick.id,
      actualWinnerTeamId: pick.match.winnerTeamId,
      actualScore: null,
      resultSource: "local_finished_match",
      status: outcomeStatus,
      notes: null
    });
    await prisma.predictionPick.update({ where: { id: pick.id }, data: { status: outcomeStatus } });
    resolved += 1;
    updated.push({ predictionPickId: pick.id, status: outcomeStatus, source: "local_finished_match" });
  }

  return { checked: picks.length, resolved, pending, voided, updated };
}

export async function resolvePredictionResultManually(params: {
  predictionPickId: string;
  actualWinnerTeamId?: string | null;
  actualScore?: string | null;
  resultSource?: string | null;
  notes?: string | null;
}) {
  const pick = await prisma.predictionPick.findUnique({ where: { id: params.predictionPickId } });
  if (!pick) return { ok: false, error: "PredictionPick not found." };
  const status = params.actualWinnerTeamId
    ? pick.predictedWinnerTeamId === params.actualWinnerTeamId ? "won" : "lost"
    : "unknown";
  await writeOutcomeAndReview({
    pickId: pick.id,
    actualWinnerTeamId: params.actualWinnerTeamId ?? null,
    actualScore: params.actualScore ?? null,
    resultSource: params.resultSource ?? "manual_result_entry",
    status,
    notes: params.notes ?? null
  });
  await prisma.predictionPick.update({ where: { id: pick.id }, data: { status } });
  return { ok: true, predictionPickId: pick.id, status };
}

async function writeOutcomeAndReview(params: {
  pickId: string;
  actualWinnerTeamId: string | null;
  actualScore: string | null;
  resultSource: string;
  status: string;
  notes: string | null;
}) {
  await prisma.predictionOutcome.upsert({
    where: { predictionPickId: params.pickId },
    update: {
      actualWinnerTeamId: params.actualWinnerTeamId,
      actualScore: params.actualScore,
      resultSource: params.resultSource,
      status: params.status,
      resolvedAt: new Date(),
      notes: params.notes
    },
    create: {
      predictionPickId: params.pickId,
      actualWinnerTeamId: params.actualWinnerTeamId,
      actualScore: params.actualScore,
      resultSource: params.resultSource,
      status: params.status,
      notes: params.notes
    }
  });

  const pick = await prisma.predictionPick.findUnique({ where: { id: params.pickId } });
  if (!pick) return;
  const review = buildPredictionErrorAnalysis({
    resultStatus: params.status,
    blockersJson: pick.blockersJson,
    missingDataJson: pick.missingDataJson,
    topFactorsJson: pick.topFactorsJson,
    warningsJson: pick.warningsJson,
    risk: pick.risk,
    dataQuality: pick.dataQuality
  });
  await prisma.predictionErrorAnalysis.upsert({
    where: { predictionPickId: params.pickId },
    update: {
      resultStatus: params.status,
      suspectedErrorReasonsJson: JSON.stringify(review.suspectedErrorReasons),
      missingDataAtPredictionJson: pick.missingDataJson,
      mainFactorsJson: pick.topFactorsJson,
      suggestedImprovementsJson: JSON.stringify(review.suggestedImprovements),
      notes: params.notes
    },
    create: {
      predictionPickId: params.pickId,
      resultStatus: params.status,
      suspectedErrorReasonsJson: JSON.stringify(review.suspectedErrorReasons),
      missingDataAtPredictionJson: pick.missingDataJson,
      mainFactorsJson: pick.topFactorsJson,
      suggestedImprovementsJson: JSON.stringify(review.suggestedImprovements),
      notes: params.notes
    }
  });
}

export function buildPredictionErrorAnalysis(params: {
  resultStatus: string;
  blockersJson: string;
  missingDataJson: string;
  topFactorsJson: string;
  warningsJson: string;
  risk: string;
  dataQuality: number;
}) {
  const text = [
    params.blockersJson,
    params.missingDataJson,
    params.warningsJson,
    params.risk,
    String(params.dataQuality)
  ].join(" ").toLowerCase();
  const suspectedErrorReasons = new Set<string>();
  if (params.resultStatus === "won") suspectedErrorReasons.add("factors aligned with result");
  if (text.includes("map") || text.includes("sample")) suspectedErrorReasons.add("low map sample");
  if (text.includes("h2h") || text.includes("news")) suspectedErrorReasons.add("missing H2H/news");
  if (text.includes("stale") || text.includes("freshness")) suspectedErrorReasons.add("stale data");
  if (text.includes("roster")) suspectedErrorReasons.add("roster change or missing roster context");
  if (text.includes("veto")) suspectedErrorReasons.add("veto mismatch or missing veto");
  if (text.includes("grid")) suspectedErrorReasons.add("no GRID mapping");
  if (text.includes("source") || text.includes("confidence")) suspectedErrorReasons.add("low source confidence");
  if (text.includes("bo1") || text.includes("high")) suspectedErrorReasons.add("BO1/high variance");
  if (params.dataQuality < 55) suspectedErrorReasons.add("dataQuality below threshold");
  if (suspectedErrorReasons.size === 0) suspectedErrorReasons.add("underdog upset or unexplained variance");

  const suggestedImprovements = [...suspectedErrorReasons]
    .filter((reason) => reason !== "factors aligned with result")
    .map((reason) => `Improve evidence for: ${reason}`);

  return { suspectedErrorReasons: [...suspectedErrorReasons], suggestedImprovements };
}

export async function getPredictionLifecycleBoard() {
  const picks = await prisma.predictionPick.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      match: { include: { teamA: true, teamB: true } },
      outcome: true,
      errorAnalysis: true
    }
  });
  return {
    active: picks.filter((pick) => pick.status === "pending"),
    awaitingResult: picks.filter((pick) => ["pending", "needs_result", "unknown"].includes(pick.status)),
    successful: picks.filter((pick) => pick.status === "won"),
    missed: picks.filter((pick) => pick.status === "lost"),
    needsReview: picks.filter((pick) => ["needs_result", "unknown", "void", "cancelled", "rescheduled"].includes(pick.status)),
    all: picks
  };
}
