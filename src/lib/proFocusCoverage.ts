import { prisma } from "@/lib/prisma";
import { calculateMatchPriority, getEffectiveRank, isDefaultProFocus, type MatchPriorityLike } from "@/lib/proFocus";

function isRealSource(sourceMode: string) {
  return sourceMode !== "demo" && sourceMode !== "analyst_sample";
}

async function priorityRows() {
  const matches = await prisma.match.findMany({
    include: {
      teamA: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } },
      teamB: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }
    }
  });
  return matches.map((match) => ({
    match,
    priority: calculateMatchPriority(match as unknown as MatchPriorityLike)
  }));
}

export async function getProFocusCoverage() {
  const [rows, teams, valveRanked, hltvRanked] = await Promise.all([
    priorityRows(),
    prisma.team.findMany({ include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }),
    prisma.teamRankSnapshot.findMany({ where: { source: "valve_rankings" }, distinct: ["teamId"], select: { teamId: true } }),
    prisma.teamRankSnapshot.findMany({ where: { source: "hltv_manual_reference" }, distinct: ["teamId"], select: { teamId: true } })
  ]);
  const realRows = rows.filter(({ match }) => isRealSource(match.sourceMode));
  const proRows = realRows.filter(({ match, priority }) => isDefaultProFocus(priority, match.isPinned));
  const allTeamRanks = teams.map((team) => getEffectiveRank(team));
  const hiddenLowerTier = realRows.filter(({ priority }) => priority.visibilityTier === "lower_tier" || priority.visibilityTier === "academy").length;
  const separateCircuit = realRows.filter(({ priority }) => priority.visibilityTier === "separate_circuit").length;

  return {
    realMatchesTotal: realRows.length,
    proFocusMatches: proRows.length,
    top50Matches: realRows.filter(({ priority }) => (priority.teamAEffectiveRank ?? 999) <= 50 || (priority.teamBEffectiveRank ?? 999) <= 50).length,
    top100Matches: realRows.filter(({ priority }) => (priority.teamAEffectiveRank ?? 999) <= 100 || (priority.teamBEffectiveRank ?? 999) <= 100).length,
    watchlistMatches: realRows.filter(({ priority }) => priority.hasWatchlistTeam).length,
    knownTournamentMatches: realRows.filter(({ priority }) => priority.isKnownTournament).length,
    hiddenLowerTier,
    academyDetected: teams.filter((team) => team.isAcademyTeam || team.visibilityTier === "academy").length,
    separateCircuit,
    unrankedTeams: allTeamRanks.filter((rank) => !rank.rank || rank.rank > 100).length,
    staleRankings: allTeamRanks.filter((rank) => rank.stale).length,
    needsReview: realRows.filter(({ match, priority }) => match.needsReview || priority.visibilityTier === "needs_review").length,
    valveMatchedTeams: valveRanked.length,
    hltvManualMatchedTeams: hltvRanked.length
  };
}

export async function getHiddenProFocusReasons(limit = 24) {
  const rows = await priorityRows();
  return rows
    .filter(({ match, priority }) => isRealSource(match.sourceMode) && !isDefaultProFocus(priority, match.isPinned))
    .sort((a, b) => b.priority.priorityScore - a.priority.priorityScore)
    .slice(0, limit)
    .map(({ match, priority }) => ({
      id: match.id,
      label: `${match.teamA.name} vs ${match.teamB.name}`,
      eventName: match.eventName,
      sourceMode: match.sourceMode,
      priorityScore: priority.priorityScore,
      visibilityTier: priority.visibilityTier,
      hiddenReasons: priority.hiddenReasons
    }));
}
