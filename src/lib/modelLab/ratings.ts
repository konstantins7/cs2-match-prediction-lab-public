import { prisma } from "../prisma";

export type EloRating = {
  teamId: string;
  rating: number;
  matchesPlayed?: number;
  rosterStability?: number;
};

export type GlickoStyleUncertaintyInput = {
  matchesPlayed: number;
  rosterStability?: number;
  daysSinceLastMatch?: number;
  isNewRoster?: boolean;
};

export type TrueSkillPlaceholderInput = {
  playerRatings?: Array<{ rating?: number; uncertainty?: number }>;
  fallbackTeamRating?: number;
};

export function expectedEloScore(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateEloPair(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, kFactor = 28) {
  const expectedA = expectedEloScore(ratingA, ratingB);
  const delta = kFactor * (scoreA - expectedA);
  return {
    ratingA: ratingA + delta,
    ratingB: ratingB - delta,
    delta
  };
}

export function calculateGlickoStyleUncertainty(input: GlickoStyleUncertaintyInput) {
  const lowSamplePenalty = Math.max(0, 1 - Math.min(input.matchesPlayed, 30) / 30);
  const rosterPenalty = input.isNewRoster ? 0.22 : Math.max(0, 0.65 - (input.rosterStability ?? 0.55)) * 0.8;
  const inactivityPenalty = Math.min(0.24, Math.max(0, (input.daysSinceLastMatch ?? 0) - 21) / 180);
  const ratingDeviation = Math.round(55 + lowSamplePenalty * 130 + rosterPenalty * 100 + inactivityPenalty * 100);
  const volatility = Number(Math.min(0.95, 0.12 + lowSamplePenalty * 0.42 + rosterPenalty + inactivityPenalty).toFixed(3));
  return {
    ratingDeviation,
    volatility,
    label: "Glicko-style uncertainty heuristic"
  };
}

export function calculateTrueSkillStylePlaceholder(input: TrueSkillPlaceholderInput) {
  const ratings = input.playerRatings?.length ? input.playerRatings : [{ rating: input.fallbackTeamRating ?? 1500, uncertainty: 80 }];
  const teamSkill = ratings.reduce((sum, player) => sum + (player.rating ?? input.fallbackTeamRating ?? 1500), 0) / ratings.length;
  const uncertainty = ratings.reduce((sum, player) => sum + (player.uncertainty ?? 85), 0) / ratings.length;
  return {
    playerSkill: ratings.map((player) => player.rating ?? input.fallbackTeamRating ?? 1500),
    teamSkill: Number(teamSkill.toFixed(2)),
    uncertainty: Number(uncertainty.toFixed(2)),
    label: "TrueSkill-style placeholder structure, not a trained model"
  };
}

export async function updateInternalEloForFinishedMatches() {
  const matches = await prisma.match.findMany({
    where: {
      status: "finished",
      winnerTeamId: { not: null },
      sourceMode: { not: "analyst_sample" }
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      teamAId: true,
      teamBId: true,
      winnerTeamId: true,
      teamA: { select: { internalElo: true, valveRank: true, hltvRank: true } },
      teamB: { select: { internalElo: true, valveRank: true, hltvRank: true } }
    }
  });

  const ratings = new Map<string, number>();
  const baseRating = (team: { internalElo: number; valveRank: number | null; hltvRank: number | null }) => {
    const rank = team.valveRank ?? team.hltvRank;
    return rank && rank <= 100 ? 1825 - rank * 3.2 : 1500;
  };
  let updated = 0;
  for (const match of matches) {
    const ratingA = ratings.get(match.teamAId) ?? baseRating(match.teamA);
    const ratingB = ratings.get(match.teamBId) ?? baseRating(match.teamB);
    const scoreA = match.winnerTeamId === match.teamAId ? 1 : match.winnerTeamId === match.teamBId ? 0 : 0.5;
    const next = updateEloPair(ratingA, ratingB, scoreA as 0 | 0.5 | 1);
    ratings.set(match.teamAId, next.ratingA);
    ratings.set(match.teamBId, next.ratingB);
  }
  for (const [teamId, rating] of ratings) {
    await prisma.team.update({ where: { id: teamId }, data: { internalElo: rating } });
    updated += 1;
  }
  return { matches: matches.length, teamsUpdated: updated };
}
