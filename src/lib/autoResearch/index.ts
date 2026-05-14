import { prisma } from "../prisma";
import { getDashboardDataStatus } from "../data/dataCoverage";
import { getReadinessDistribution } from "../data/readinessDistribution";
import { calculatePrediction } from "../prediction/calculatePrediction";
import { buildPredictionInput } from "../prediction/buildPredictionInput";
import { refreshResearchPack, getResearchQueueRows } from "../researchQueue";
import type { AutoResearchMetrics, ForecastAutopilotMode, ForecastAutopilotResult, ForecastAutopilotState, OneClickResult } from "../autoResearchShared";
import { runOneClickGlobalRefreshWithDeps, type AutoResearchDeps } from "../autoResearchCore";
import {
  rebuildSnapshots,
  runPredictionsForUpcomingMatches,
  savePredictionAudit
} from "../sources/sourceScheduler";
import { getEffectiveRank } from "../proFocus";
import { runAutoResearchOrchestrator } from "./orchestrator";
import { getBestNextAction } from "../bestNextAction";
import { getPlaybookEntriesForMissing } from "../dataAcquisitionPlaybook";
import { probeProviderCapabilities } from "../providerCapabilityProbe";

export async function getAutoResearchMetrics(): Promise<AutoResearchMetrics> {
  const [status, distribution, researchRows, mapStatRows, vetoRows] = await Promise.all([
    getDashboardDataStatus(),
    getReadinessDistribution(),
    getResearchQueueRows(160),
    prisma.teamMapStat.findMany({
      where: { isActive: true, matchId: { not: null }, source: { not: "analyst_sample" } },
      select: { matchId: true },
      distinct: ["matchId"]
    }),
    prisma.vetoPattern.findMany({
      where: { isActive: true, matchId: { not: null }, source: { not: "analyst_sample" } },
      select: { matchId: true },
      distinct: ["matchId"]
    })
  ]);
  const mapVetoMatches = new Set([...mapStatRows, ...vetoRows].map((row) => row.matchId).filter(Boolean)).size;
  const optionalSources = await Promise.all([
    prisma.sourceHealth.findUnique({ where: { source: "grid" } }),
    prisma.sourceHealth.findUnique({ where: { source: "liquipedia" } }),
    prisma.sourceHealth.findUnique({ where: { source: "faceit" } })
  ]);
  const sourceSetupNeeded = optionalSources.filter((source) => !source || source.status === "disabled").length;
  return {
    matches: status.realMatchesCount,
    readyForecasts: distribution.realActionable,
    basicPreview: distribution.real.L1_BASIC_CONTEXT + distribution.real.L2_BASIC_PREDICTION,
    needsManualData: researchRows.length,
    teamsWithRank: status.teamsWithRank,
    L0_FIXTURE_ONLY: distribution.real.L0_FIXTURE_ONLY,
    L1_BASIC_CONTEXT: distribution.real.L1_BASIC_CONTEXT,
    L2_BASIC_PREDICTION: distribution.real.L2_BASIC_PREDICTION,
    L3_ANALYTICAL: distribution.real.L3_ANALYTICAL,
    L4_DEEP: distribution.real.L4_DEEP,
    teamsWithRoster: status.teamsWithPlayerRoster,
    matchesWithMapVeto: mapVetoMatches,
    researchTasks: researchRows.length,
    sourceSetupNeeded
  };
}

export async function refreshResearchQueuePacks(limit = 120) {
  const rows = await prisma.match.findMany({
    where: { status: "upcoming", isOfficial: true, sourceMode: { notIn: ["demo", "analyst_sample"] } },
    select: { id: true },
    orderBy: { startTime: "asc" },
    take: limit
  });
  for (const row of rows) {
    await refreshResearchPack(row.id);
  }
  return rows.length;
}

export const defaultAutoResearchDeps: AutoResearchDeps = {
  getMetrics: getAutoResearchMetrics,
  runOrchestrator: runAutoResearchOrchestrator,
  rebuildSnapshots,
  recalculatePredictions: runPredictionsForUpcomingMatches,
  refreshResearchQueue: refreshResearchQueuePacks
};

export async function runOneClickGlobalRefresh(deps: AutoResearchDeps = defaultAutoResearchDeps): Promise<OneClickResult> {
  return runOneClickGlobalRefreshWithDeps(deps);
}

function stateFromReadiness(realReady: boolean, readinessLevel?: string): ForecastAutopilotState {
  if (realReady) return "ready";
  if (readinessLevel === "L1_BASIC_CONTEXT" || readinessLevel === "L2_BASIC_PREDICTION") return "basic";
  return "missing";
}

function messageForState(state: ForecastAutopilotState) {
  if (state === "ready") return "Реальный прогноз готов.";
  if (state === "basic") return "Есть basic preview, но для аналитического прогноза нужны дополнительные данные.";
  return "Прогноз пока не готов: нужно одно главное действие с данными.";
}

export async function runForecastAutopilot(mode: ForecastAutopilotMode = "fast", matchId?: string): Promise<ForecastAutopilotResult> {
  const oneClick = await runOneClickGlobalRefreshWithDeps({
    ...defaultAutoResearchDeps,
    runOrchestrator: () => runAutoResearchOrchestrator(new Date(), mode === "fast" ? "fast" : "deeper")
  });
  const probe = mode === "fast" ? null : await probeProviderCapabilities();

  if (matchId) {
    const input = await buildPredictionInput(matchId);
    const prediction = calculatePrediction(input);
    const pack = await refreshResearchPack(matchId);
    const tasks = JSON.parse(pack.checklistJson) as Array<{ task: string; status: string; id?: string; priority?: string; reason?: string; expectedImpact?: string; sourceSuggestion?: string; actionType?: string; actionState?: string; createdAt?: string; completedAt?: string | null }>;
    const best = getBestNextAction(prediction, tasks as never);
    const state = stateFromReadiness(prediction.realForecast.isReady, prediction.readiness.level);
    const suggestions = getPlaybookEntriesForMissing(prediction.readiness.missingCriticalData);
    return {
      ok: oneClick.ok,
      mode,
      state,
      message: messageForState(state),
      matchId,
      readinessLevel: prediction.readiness.level,
      realForecastReady: prediction.realForecast.isReady,
      primaryAction: best.primaryAction,
      secondaryActions: best.secondaryActions.slice(0, 2),
      succeeded: oneClick.summary.succeeded,
      unavailable: oneClick.summary.unavailable,
      sourceSuggestions: suggestions.map((entry) => ({ label: entry.label, sources: entry.sources, actionLabel: entry.actionLabel, href: entry.href })),
      oneClick
    };
  }

  const metrics = oneClick.summary.after;
  const state = metrics.readyForecasts > 0 ? "ready" : metrics.basicPreview > 0 ? "basic" : "missing";
  const primaryAction =
    state === "ready"
      ? { label: "Показать готовые прогнозы", href: "/predictions?forecast=ready", reason: "Есть матчи, которые уже можно анализировать." }
      : mode === "max"
        ? { label: "Создать data pack", href: "/admin/research-queue", reason: "Manual data pack или parsed demo сильнее всего поднимут readiness." }
        : { label: "Загрузить parsed demo", href: "/admin/research-queue?template=parsed_demo", reason: "Самый сильный бесплатный способ улучшить прогноз — загрузить parsed demo." };
  const providerAction = probe?.providers.some((provider) => provider.source === "grid" && provider.configured)
    ? { label: "Открыть источники", href: "/admin/sources", reason: "GRID настроен; проверьте unlocked capabilities." }
    : { label: "Подключить источники", href: "/admin/sources#source-playbook", reason: "GRID/Liquipedia/FACEIT могут дать deep context." };
  return {
    ok: oneClick.ok,
    mode,
    state,
    message: messageForState(state),
    realForecastReady: state === "ready",
    primaryAction,
    secondaryActions: [providerAction, { label: "Показать матчи без данных", href: "/matches?focus=needs_data", reason: "Выберите матч, где одно действие даст максимальный прирост." }].slice(0, 2),
    succeeded: oneClick.summary.succeeded,
    unavailable: oneClick.summary.unavailable,
    sourceSuggestions: getPlaybookEntriesForMissing(["roster", "player stats", "map/veto", "round/economy"]).map((entry) => ({ label: entry.label, sources: entry.sources, actionLabel: entry.actionLabel, href: entry.href })),
    oneClick
  };
}

async function refreshBasicHistoryForMatchTeams(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { teamAId: true, teamBId: true } });
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const teamIds = [match.teamAId, match.teamBId];
  const finished = await prisma.match.findMany({
    where: {
      status: "finished",
      winnerTeamId: { not: null },
      OR: [
        { teamAId: { in: teamIds } },
        { teamBId: { in: teamIds } }
      ]
    },
    include: {
      teamA: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } },
      teamB: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }
    },
    orderBy: { startTime: "desc" }
  });
  let updated = 0;
  for (const teamId of teamIds) {
    const rows = finished.filter((row) => row.teamAId === teamId || row.teamBId === teamId);
    if (rows.length === 0) continue;
    let wins = 0;
    let rankedWins = 0;
    let rankedLosses = 0;
    const opponentRanks: number[] = [];
    for (const row of rows) {
      const opponent = row.teamAId === teamId ? row.teamB : row.teamA;
      const rank = getEffectiveRank(opponent).rank;
      const won = row.winnerTeamId === teamId;
      wins += won ? 1 : 0;
      if (rank && rank <= 100) {
        opponentRanks.push(rank);
        rankedWins += won ? 1 : 0;
        rankedLosses += won ? 0 : 1;
      }
    }
    await prisma.teamBasicResultSnapshot.upsert({
      where: { teamId_period_source: { teamId, period: "basic_recent", source: "pandascore_free" } },
      create: {
        teamId,
        period: "basic_recent",
        matchesPlayed: rows.length,
        wins,
        losses: rows.length - wins,
        winRate: wins / rows.length,
        vsRankedWins: rankedWins,
        vsRankedLosses: rankedLosses,
        averageOpponentRank: opponentRanks.length ? opponentRanks.reduce((sum, rank) => sum + rank, 0) / opponentRanks.length : null,
        lastMatchAt: rows[0]?.startTime ?? null,
        source: "pandascore_free",
        dataQuality: Math.min(0.7, 0.25 + Math.min(rows.length, 20) / 50)
      },
      update: {
        matchesPlayed: rows.length,
        wins,
        losses: rows.length - wins,
        winRate: wins / rows.length,
        vsRankedWins: rankedWins,
        vsRankedLosses: rankedLosses,
        averageOpponentRank: opponentRanks.length ? opponentRanks.reduce((sum, rank) => sum + rank, 0) / opponentRanks.length : null,
        lastMatchAt: rows[0]?.startTime ?? null,
        dataQuality: Math.min(0.7, 0.25 + Math.min(rows.length, 20) / 50)
      }
    });
    updated += 1;
  }
  return updated;
}

export async function prepareMatchForecast(matchId: string) {
  const beforeInput = await buildPredictionInput(matchId);
  const beforePrediction = calculatePrediction(beforeInput);
  const basicHistorySnapshots = await refreshBasicHistoryForMatchTeams(matchId);
  const audit = await savePredictionAudit(matchId);
  const pack = await refreshResearchPack(matchId);
  const afterInput = await buildPredictionInput(matchId);
  const afterPrediction = calculatePrediction(afterInput);
  const tasks = JSON.parse(pack.checklistJson) as Array<{ task: string; status: string }>;
  return {
    ok: true,
    matchId,
    basicHistorySnapshots,
    predictionAuditId: audit.id,
    before: {
      readiness: beforePrediction.readiness.level,
      realForecastReady: beforePrediction.realForecast.isReady,
      dataQualityScore: beforePrediction.dataQualityScore,
      confidenceScore: beforePrediction.confidenceScore
    },
    after: {
      readiness: afterPrediction.readiness.level,
      realForecastReady: afterPrediction.realForecast.isReady,
      dataQualityScore: afterPrediction.dataQualityScore,
      confidenceScore: afterPrediction.confidenceScore
    },
    message: afterPrediction.realForecast.isReady
      ? "Прогноз готов к анализу"
      : "Автоматически получены только базовые данные. Для полноценного прогноза нужно добавить состав, статистику игроков, карты и veto.",
    nextActions: tasks.filter((task) => task.status !== "done").slice(0, 3).map((task) => task.task)
  };
}
