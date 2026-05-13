import { prisma } from "./prisma";
import { getDashboardDataStatus } from "./data/dataCoverage";
import { getReadinessDistribution } from "./data/readinessDistribution";
import { calculatePrediction } from "./prediction/calculatePrediction";
import { buildPredictionInput } from "./prediction/buildPredictionInput";
import { refreshResearchPack, getResearchQueueRows } from "./researchQueue";
import type { AutoResearchMetrics, OneClickResult } from "./autoResearchShared";
import { runOneClickGlobalRefreshWithDeps, type AutoResearchDeps } from "./autoResearchCore";
import {
  rebuildSnapshots,
  runPredictionsForUpcomingMatches,
  savePredictionAudit,
  syncGameMetaUpdates,
  syncPandaScoreFreeFixtures,
  syncValveRankings
} from "./sources/sourceScheduler";
import { getEffectiveRank } from "./proFocus";

export async function getAutoResearchMetrics(): Promise<AutoResearchMetrics> {
  const [status, distribution, researchRows] = await Promise.all([
    getDashboardDataStatus(),
    getReadinessDistribution(),
    getResearchQueueRows(160)
  ]);
  return {
    matches: status.realMatchesCount,
    readyForecasts: distribution.realActionable,
    basicPreview: distribution.real.L1_BASIC_CONTEXT + distribution.real.L2_BASIC_PREDICTION,
    needsManualData: researchRows.length,
    teamsWithRank: status.teamsWithRank
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
  syncPandaScore: syncPandaScoreFreeFixtures,
  syncValveRankings,
  syncCsUpdates: syncGameMetaUpdates,
  rebuildSnapshots,
  recalculatePredictions: runPredictionsForUpcomingMatches,
  refreshResearchQueue: refreshResearchQueuePacks
};

export async function runOneClickGlobalRefresh(deps: AutoResearchDeps = defaultAutoResearchDeps): Promise<OneClickResult> {
  return runOneClickGlobalRefreshWithDeps(deps);
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
