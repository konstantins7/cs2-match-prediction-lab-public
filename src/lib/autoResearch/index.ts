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
import { enrichFaceitContextForMatch } from "../faceitContext";
import { enrichGridOpenAccessMatch, getGridOpenAccessMatchStatus, syncGridCentralData } from "../gridOpenAccess";
import { buildForecastAutopilotCandidate, getForecastAutopilotCandidates, rankForecastAutopilotCandidates } from "./candidateSelector";

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

function safeAutopilotOrchestrator(mode: ForecastAutopilotMode) {
  return async () => {
    if (mode === "fast") {
      return {
        results: [],
        reports: [
          {
            source: "autopilot",
            dataType: "sync",
            status: "skipped" as const,
            message: "Быстрый режим использует сохранённые данные и lightweight rebuild; broad provider refresh не запускается."
          }
        ]
      };
    }
    return runAutoResearchOrchestrator(new Date(), "fast");
  };
}

async function runAutopilotRefresh(mode: ForecastAutopilotMode) {
  const oneClick = await runOneClickGlobalRefreshWithDeps({
    ...defaultAutoResearchDeps,
    runOrchestrator: safeAutopilotOrchestrator(mode)
  });
  if (mode === "fast") {
    oneClick.summary.succeeded = ["использовать сохранённые данные", "пересчитать прогнозы", "обновить задачи"];
  }
  if (mode === "deeper" || mode === "max") {
    const grid = await syncGridCentralData();
    oneClick.summary.sourceReports.push({
      source: "grid",
      dataType: "series",
      status: grid.ok ? "success" : grid.enabled ? "partial" : "skipped",
      message: grid.notes[0] ?? "GRID Central Data checked. Unsupported OA APIs were not called."
    });
    if (grid.recordsFetched > 0 || grid.recordsCreated > 0 || grid.recordsUpdated > 0) {
      await rebuildSnapshots();
      oneClick.summary.predictionsRecalculated += await runPredictionsForUpcomingMatches();
      await refreshResearchQueuePacks();
    }
  }
  return oneClick;
}

async function enrichMappedGridForMode(mode: ForecastAutopilotMode, matchId?: string) {
  if (mode !== "max" || !matchId) return null;
  const status = await getGridOpenAccessMatchStatus(matchId);
  if (!status.gridSeriesId) return null;
  const result = await enrichGridOpenAccessMatch(matchId);
  if (result.recordsCreated > 0 || result.recordsUpdated > 0) {
    await rebuildSnapshots();
    await runPredictionsForUpcomingMatches();
    await refreshResearchQueuePacks();
  }
  return result;
}

async function hasCompleteFaceitAliases(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { include: { players: { where: { isActive: true }, select: { id: true } } } },
      teamB: { include: { players: { where: { isActive: true }, select: { id: true } } } }
    }
  });
  if (!match) return false;
  const teamIds = [match.teamAId, match.teamBId];
  const playerIds = [...match.teamA.players, ...match.teamB.players].map((player) => player.id);
  if (playerIds.length === 0) return false;
  const [teamAliases, playerAliases] = await Promise.all([
    prisma.entityAlias.findMany({ where: { source: "faceit", entityType: "team", entityId: { in: teamIds } }, select: { entityId: true } }),
    prisma.entityAlias.findMany({ where: { source: "faceit", entityType: "player", entityId: { in: playerIds } }, select: { entityId: true } })
  ]);
  const teamAliasIds = new Set(teamAliases.map((alias) => alias.entityId));
  const playerAliasIds = new Set(playerAliases.map((alias) => alias.entityId));
  return teamIds.every((id) => teamAliasIds.has(id)) && playerIds.every((id) => playerAliasIds.has(id));
}

async function enrichMappedFaceitForMode(mode: ForecastAutopilotMode, matchId?: string) {
  if (mode !== "max" || !matchId) return null;
  if (!(await hasCompleteFaceitAliases(matchId))) return null;
  const result = await enrichFaceitContextForMatch(matchId);
  if (result.recordsCreated > 0 || result.recordsUpdated > 0) {
    await rebuildSnapshots();
    await runPredictionsForUpcomingMatches();
    await refreshResearchQueuePacks();
  }
  return result;
}

export async function runForecastAutopilot(mode: ForecastAutopilotMode = "fast", matchId?: string): Promise<ForecastAutopilotResult> {
  const oneClick = await runAutopilotRefresh(mode);
  const probe = mode === "max" ? await probeProviderCapabilities() : null;
  let topCandidates = await getForecastAutopilotCandidates();
  const initialBest = topCandidates[0] ?? null;
  const gridTarget = matchId ?? initialBest?.matchId;
  const gridEnrichment = await enrichMappedGridForMode(mode, gridTarget);
  const faceitEnrichment = await enrichMappedFaceitForMode(mode, gridTarget);
  if (gridEnrichment) {
    topCandidates = await getForecastAutopilotCandidates();
    oneClick.summary.sourceReports.push({
      source: "grid",
      dataType: "series state",
      status: gridEnrichment.errors.length ? "partial" : "success",
      message: gridEnrichment.notes[0] ?? "Mapped GRID Series State checked for selected autopilot candidate."
    });
  }
  if (faceitEnrichment) {
    topCandidates = await getForecastAutopilotCandidates();
    oneClick.summary.sourceReports.push({
      source: "faceit",
      dataType: "explicit context",
      status: faceitEnrichment.errors.length ? "partial" : "success",
      message: faceitEnrichment.notes[0] ?? "Mapped FACEIT context checked with explicit IDs only."
    });
  }
  const bestCandidate = topCandidates[0] ?? null;

  if (matchId) {
    const input = await buildPredictionInput(matchId);
    const prediction = calculatePrediction(input);
    const currentCandidate = buildForecastAutopilotCandidate(matchId).then((candidate) => rankForecastAutopilotCandidates([candidate, ...topCandidates.filter((item) => item.matchId !== matchId)]).find((item) => item.matchId === matchId) ?? candidate);
    const pack = await refreshResearchPack(matchId);
    const tasks = JSON.parse(pack.checklistJson) as Array<{ task: string; status: string; id?: string; priority?: string; reason?: string; expectedImpact?: string; sourceSuggestion?: string; actionType?: string; actionState?: string; createdAt?: string; completedAt?: string | null }>;
    const best = getBestNextAction(prediction, tasks as never);
    const state = stateFromReadiness(prediction.realForecast.isReady, prediction.readiness.level);
    const suggestions = getPlaybookEntriesForMissing(prediction.readiness.missingCriticalData);
    const resolvedCurrentCandidate = await currentCandidate;
    const whyNotSelected = bestCandidate && bestCandidate.matchId !== matchId
      ? `Текущий матч имеет ${resolvedCurrentCandidate.coverageScore}/100 (${resolvedCurrentCandidate.forecastabilityLabel}), лучший доступный матч — ${bestCandidate.coverageScore}/100 (${bestCandidate.forecastabilityLabel}). ${resolvedCurrentCandidate.blockers[0] ?? resolvedCurrentCandidate.missingBlocks[0] ?? "У лучшего кандидата больше usable coverage."}`
      : resolvedCurrentCandidate.selectionReason;
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
      oneClick,
      bestCandidate,
      currentCandidate: resolvedCurrentCandidate,
      topCandidates: topCandidates.slice(0, 5),
      coverageScore: resolvedCurrentCandidate.coverageScore,
      coverageBreakdown: resolvedCurrentCandidate.coverageBreakdown,
      forecastabilityTier: resolvedCurrentCandidate.forecastabilityTier,
      selectionReason: resolvedCurrentCandidate.selectionReason,
      whyNotSelected,
      blockers: resolvedCurrentCandidate.blockers,
      providerContributions: resolvedCurrentCandidate.providerContributions,
      syncSummary: oneClick.summary
    };
  }

  const state = bestCandidate?.realForecastReady ? "ready" : bestCandidate?.forecastabilityTier === "BASIC_ONLY" || bestCandidate?.forecastabilityTier === "NEARLY_READY" ? "basic" : "missing";
  const primaryAction =
    bestCandidate
      ? { label: "Открыть лучший матч", href: bestCandidate.href, reason: bestCandidate.selectionReason }
      : mode === "max"
        ? { label: "Создать data pack", href: "/admin/research-queue", reason: "Нет готового кандидата; manual data pack или parsed demo сильнее всего поднимут readiness." }
        : { label: "Показать матчи", href: "/matches?status=upcoming&focus=all_real&sort=forecastable", reason: "Автопилот не нашёл готовый матч, но можно посмотреть top candidates и blockers." };
  const providerAction = probe?.providers.some((provider) => provider.source === "grid" && provider.configured)
    ? { label: "Открыть источники", href: "/admin/sources", reason: "GRID настроен; проверьте unlocked capabilities." }
    : { label: "Подключить источники", href: "/admin/sources#source-playbook", reason: "GRID/Liquipedia/FACEIT могут дать deep context." };
  return {
    ok: oneClick.ok,
    mode,
    state,
    message: bestCandidate ? `${bestCandidate.teamAName} vs ${bestCandidate.teamBName}: ${bestCandidate.forecastabilityLabel}.` : messageForState(state),
    matchId: bestCandidate?.matchId,
    readinessLevel: bestCandidate?.readinessLevel,
    realForecastReady: bestCandidate?.realForecastReady ?? false,
    primaryAction,
    secondaryActions: [providerAction, { label: "Топ кандидатов", href: "/matches?status=upcoming&focus=all_real&sort=forecastable", reason: "Показать матчи, отсортированные по coverage score." }].slice(0, 2),
    succeeded: oneClick.summary.succeeded,
    unavailable: oneClick.summary.unavailable,
    sourceSuggestions: getPlaybookEntriesForMissing(["roster", "player stats", "map/veto", "round/economy"]).map((entry) => ({ label: entry.label, sources: entry.sources, actionLabel: entry.actionLabel, href: entry.href })),
    oneClick,
    bestCandidate,
    topCandidates: topCandidates.slice(0, 5),
    coverageScore: bestCandidate?.coverageScore,
    coverageBreakdown: bestCandidate?.coverageBreakdown,
    forecastabilityTier: bestCandidate?.forecastabilityTier,
    selectionReason: bestCandidate?.selectionReason,
    blockers: bestCandidate?.blockers ?? [],
    providerContributions: bestCandidate?.providerContributions ?? [],
    syncSummary: oneClick.summary
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
