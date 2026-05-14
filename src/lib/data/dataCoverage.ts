import { prisma } from "@/lib/prisma";
import { getEffectiveRank } from "@/lib/proFocus";
import { getProFocusCoverage } from "@/lib/proFocusCoverage";
import type { DataCoverage, DataCoverageStatus, PredictionInput } from "@/lib/prediction/types";

type CoverageMeta = {
  lastPandaScoreSyncAt?: Date | null;
  lastValveSyncAt?: Date | null;
  lastCsUpdatesSyncAt?: Date | null;
  lastPredictionCalculatedAt?: Date | null;
};

function latestDate(...dates: Array<Date | string | null | undefined>) {
  const times = dates
    .filter(Boolean)
    .map((date) => new Date(date as Date | string))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return times[0] ?? null;
}

function freshnessStatus(date?: Date | string | null, now = new Date()): DataCoverageStatus {
  if (!date) return "unknown";
  const ageHours = (now.getTime() - new Date(date).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours)) return "unknown";
  if (ageHours <= 24) return "fresh";
  if (ageHours <= 168) return "aging";
  return "stale";
}

function addKnownMissing(known: string[], missing: string[], label: string, present: boolean) {
  if (present) known.push(label);
  else missing.push(label);
}

export function buildDataCoverage(input: PredictionInput, meta: CoverageMeta = {}): DataCoverage {
  const rankA = getEffectiveRank(input.teamA).rank;
  const rankB = getEffectiveRank(input.teamB).rank;
  const rankData = Boolean((rankA && rankA <= 100) || (rankB && rankB <= 100));
  const recentMatches = Boolean((input.basicResultA?.matchesPlayed ?? 0) > 0 || (input.basicResultB?.matchesPlayed ?? 0) > 0);
  const teamFormSnapshots = Boolean(input.teamFormA || input.teamFormB);
  const playerRoster = input.playersA.length > 0 || input.playersB.length > 0;
  const playerStats = input.playerStatsA.length > 0 || input.playerStatsB.length > 0;
  const mapStats = input.mapStatsA.some((stat) => stat.mapsPlayed > 0) || input.mapStatsB.some((stat) => stat.mapsPlayed > 0);
  const vetoHistory = input.vetoPatternsA.length > 0 && input.vetoPatternsB.length > 0;
  const hasH2h = input.h2h.length > 0;
  const newsOrRosterEvents = input.news.length > 0 || input.rosterEventsA.length > 0 || input.rosterEventsB.length > 0;
  const sourceConflicts = input.sourceConflicts.length > 0;
  const hasDeepStats = teamFormSnapshots || playerStats || mapStats || vetoHistory;
  const fixtureOnly = !rankData && !recentMatches && !hasDeepStats;
  const rankingOnly = rankData && !recentMatches && !hasDeepStats;
  const rankingAndBasicResults = rankData && recentMatches && !hasDeepStats;
  const known: string[] = [];
  const missing: string[] = [];

  addKnownMissing(known, missing, "fixture data", true);
  addKnownMissing(known, missing, "team rank data", rankData);
  addKnownMissing(known, missing, "team recent matches", recentMatches);
  addKnownMissing(known, missing, "team form snapshots", teamFormSnapshots);
  addKnownMissing(known, missing, "player roster", playerRoster);
  addKnownMissing(known, missing, "player stats", playerStats);
  addKnownMissing(known, missing, "map stats", mapStats);
  addKnownMissing(known, missing, "veto history", vetoHistory);
  addKnownMissing(known, missing, "H2H", hasH2h);
  addKnownMissing(known, missing, "news/roster events", newsOrRosterEvents);

  const lastSourceSyncAt = latestDate(meta.lastPandaScoreSyncAt, meta.lastValveSyncAt, meta.lastCsUpdatesSyncAt);

  return {
    fixtureData: true,
    rankData,
    recentMatches,
    teamFormSnapshots,
    playerRoster,
    playerStats,
    mapStats,
    vetoHistory,
    h2h: hasH2h,
    newsOrRosterEvents,
    sourceConflicts,
    fixtureOnly,
    rankingOnly,
    rankingAndBasicResults,
    bothTeamsUnranked: !rankA && !rankB,
    lastPandaScoreSyncAt: meta.lastPandaScoreSyncAt ?? null,
    lastValveSyncAt: meta.lastValveSyncAt ?? null,
    lastCsUpdatesSyncAt: meta.lastCsUpdatesSyncAt ?? null,
    lastSourceSyncAt,
    lastPredictionCalculatedAt: meta.lastPredictionCalculatedAt ?? null,
    freshnessStatus: freshnessStatus(lastSourceSyncAt),
    known,
    missing
  };
}

export async function getCoverageMeta(matchId: string): Promise<CoverageMeta> {
  const [pandascore, valve, updates, prediction] = await Promise.all([
    prisma.sourceHealth.findUnique({ where: { source: "pandascore" } }),
    prisma.sourceHealth.findUnique({ where: { source: "valve-rankings" } }),
    prisma.sourceHealth.findUnique({ where: { source: "cs-updates" } }),
    prisma.predictionAudit.findFirst({ where: { matchId }, orderBy: { createdAt: "desc" } })
  ]);
  return {
    lastPandaScoreSyncAt: pandascore?.lastSyncedAt ?? null,
    lastValveSyncAt: valve?.lastSyncedAt ?? null,
    lastCsUpdatesSyncAt: updates?.lastSyncedAt ?? null,
    lastPredictionCalculatedAt: prediction?.createdAt ?? null
  };
}

export async function getDashboardDataStatus() {
  const [pandascore, valve, updates, lastPrediction, realMatchesCount, fixtureRows, coverage, quality] = await Promise.all([
    prisma.sourceHealth.findUnique({ where: { source: "pandascore" } }),
    prisma.sourceHealth.findUnique({ where: { source: "valve-rankings" } }),
    prisma.sourceHealth.findUnique({ where: { source: "cs-updates" } }),
    prisma.predictionAudit.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.match.count({ where: { sourceMode: { notIn: ["demo", "analyst_sample"] } } }),
    prisma.match.findMany({
      where: { sourceMode: { notIn: ["demo", "analyst_sample"] } },
      select: {
        id: true,
        teamA: { select: { id: true, valveRank: true, hltvRank: true, rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 1 } } },
        teamB: { select: { id: true, valveRank: true, hltvRank: true, rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 1 } } }
      }
    }),
    getProFocusCoverage(),
    prisma.match.aggregate({ where: { sourceMode: { notIn: ["demo", "analyst_sample"] } }, _avg: { dataQualityScore: true } })
  ]);
  const rankedTeamIds = new Set<string>();
  const basicTeamIds = new Set<string>();
  const [rankedTeams, basicResults, rosters] = await Promise.all([
    prisma.teamRankSnapshot.findMany({ select: { teamId: true }, distinct: ["teamId"] }),
    prisma.teamBasicResultSnapshot.findMany({ select: { teamId: true }, distinct: ["teamId"] }),
    prisma.player.groupBy({ by: ["teamId"], where: { teamId: { not: null } }, _count: { teamId: true } })
  ]);
  rankedTeams.forEach((team) => rankedTeamIds.add(team.teamId));
  basicResults.forEach((team) => basicTeamIds.add(team.teamId));
  const rosterTeamIds = new Set(rosters.map((row) => row.teamId).filter(Boolean) as string[]);
  const fixtureOnlyCount = fixtureRows.filter((match) => {
    const rankA = getEffectiveRank({ ...match.teamA, name: "a" }).rank;
    const rankB = getEffectiveRank({ ...match.teamB, name: "b" }).rank;
    const teamAId = match.teamA.id;
    const teamBId = match.teamB.id;
    return !rankA && !rankB && (!teamAId || !basicTeamIds.has(teamAId)) && (!teamBId || !basicTeamIds.has(teamBId));
  }).length;
  const matchesEnoughForBasicPrediction = fixtureRows.filter((match) => {
    const rankA = getEffectiveRank({ ...match.teamA, name: "a" }).rank;
    const rankB = getEffectiveRank({ ...match.teamB, name: "b" }).rank;
    const teamAId = match.teamA.id;
    const teamBId = match.teamB.id;
    return Boolean(rankA || rankB || (teamAId && basicTeamIds.has(teamAId)) || (teamBId && basicTeamIds.has(teamBId)));
  }).length;

  return {
    lastPandaScoreSyncAt: pandascore?.lastSyncedAt ?? null,
    lastValveSyncAt: valve?.lastSyncedAt ?? null,
    lastCsUpdatesSyncAt: updates?.lastSyncedAt ?? null,
    lastPredictionRecalculationAt: lastPrediction?.createdAt ?? null,
    realMatchesCount,
    proFocusCount: coverage.proFocusMatches,
    averageDataQuality: quality._avg.dataQualityScore ?? 0,
    fixtureOnlyCount,
    teamsWithRank: rankedTeamIds.size,
    teamsWithBasicResultHistory: basicTeamIds.size,
    teamsWithPlayerRoster: rosterTeamIds.size,
    matchesEnoughForBasicPrediction
  };
}
