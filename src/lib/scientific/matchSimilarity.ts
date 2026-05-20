import { prisma } from "@/lib/prisma";
import { buildPredictionInput } from "@/lib/predictionEngine";
import type { SimilarMatch } from "@/lib/math/types";
import { buildMatchFeatureHistoryData, jaccard } from "./matchFeatureHistory";

type FeatureVector = {
  matchId: string;
  teamAId: string;
  teamBId: string;
  avgTeamARating: number;
  avgTeamBRating: number;
  mapPoolOverlap: number;
  rosterStability: number;
  recentWinRateA: number;
  recentWinRateB: number;
  tournamentTier: number;
  isLan: boolean;
  mapPoolJson: string;
  rosterAJson: string;
  rosterBJson: string;
};

export async function findSimilarMatches(matchId: string, limit = 10): Promise<SimilarMatch[]> {
  const current = await currentVector(matchId);
  const candidates = await prisma.matchFeatureHistory.findMany({
    where: { matchId: { not: matchId } },
    include: {
      match: {
        include: {
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
          winnerTeam: { select: { name: true } },
          maps: { orderBy: { mapOrder: "asc" }, select: { mapName: true, teamAScore: true, teamBScore: true } }
        }
      }
    },
    take: Math.max(50, limit * 6),
    orderBy: { computedAt: "desc" }
  });
  return candidates
    .map((candidate) => toSimilarMatch(current, candidate as unknown as FeatureVector & { match: CandidateMatch }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

async function currentVector(matchId: string): Promise<FeatureVector> {
  const existing = await prisma.matchFeatureHistory.findUnique({ where: { matchId } });
  if (existing) return existing;
  const input = await buildPredictionInput(matchId);
  return buildMatchFeatureHistoryData(input);
}

function toSimilarMatch(current: FeatureVector, candidate: FeatureVector & { match: CandidateMatch }): SimilarMatch {
  const currentMaps = parseList(current.mapPoolJson);
  const candidateMaps = parseList(candidate.mapPoolJson);
  const currentRoster = [...parseList(current.rosterAJson), ...parseList(current.rosterBJson)];
  const candidateRoster = [...parseList(candidate.rosterAJson), ...parseList(candidate.rosterBJson)];
  const pairScore = samePair(current, candidate) ? 1 : sharesOneTeam(current, candidate) ? 0.55 : 0;
  const mapScore = jaccard(currentMaps, candidateMaps);
  const rosterScore = jaccard(currentRoster, candidateRoster);
  const ratingScore = closeness(
    sortedPairAverage(current.avgTeamARating, current.avgTeamBRating),
    sortedPairAverage(candidate.avgTeamARating, candidate.avgTeamBRating),
    0.45
  );
  const formScore = closeness(
    sortedPairAverage(current.recentWinRateA, current.recentWinRateB),
    sortedPairAverage(candidate.recentWinRateA, candidate.recentWinRateB),
    0.35
  );
  const tierScore = 1 - Math.min(1, Math.abs(current.tournamentTier - candidate.tournamentTier) / 4);
  const lanScore = current.isLan === candidate.isLan ? 1 : 0.4;
  const score = round((pairScore * 0.22) + (mapScore * 0.22) + (rosterScore * 0.16) + (ratingScore * 0.16) + (formScore * 0.12) + (tierScore * 0.08) + (lanScore * 0.04));
  return {
    matchId: candidate.matchId,
    eventName: candidate.match.eventName,
    date: candidate.match.startTime instanceof Date ? candidate.match.startTime.toISOString() : String(candidate.match.startTime),
    teamA: candidate.match.teamA.name,
    teamB: candidate.match.teamB.name,
    winner: candidate.match.winnerTeam?.name ?? null,
    score: scoreLine(candidate.match.maps),
    similarityScore: score,
    reasons: reasons({ pairScore, mapScore, rosterScore, ratingScore, formScore, tierScore, lanScore })
  };
}

function reasons(scores: Record<string, number>) {
  const labels: Record<string, string> = {
    pairScore: "same teams or shared team",
    mapScore: "similar map pool",
    rosterScore: "similar roster names",
    ratingScore: "close average ratings",
    formScore: "similar recent form",
    tierScore: "similar tournament tier",
    lanScore: "same LAN/online context"
  };
  return Object.entries(scores)
    .filter(([, value]) => value >= 0.55)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, value]) => `${labels[key]} (${Math.round(value * 100)}%)`);
}

function samePair(a: FeatureVector, b: FeatureVector) {
  return (a.teamAId === b.teamAId && a.teamBId === b.teamBId) || (a.teamAId === b.teamBId && a.teamBId === b.teamAId);
}

function sharesOneTeam(a: FeatureVector, b: FeatureVector) {
  return [a.teamAId, a.teamBId].some((teamId) => teamId === b.teamAId || teamId === b.teamBId);
}

function parseList(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function sortedPairAverage(a: number, b: number) {
  const pair = [a, b].sort((left, right) => left - right);
  return (pair[0] + pair[1]) / 2;
}

function closeness(a: number, b: number, scale: number) {
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function scoreLine(maps: CandidateMatch["maps"]) {
  return maps
    .filter((map) => map.teamAScore !== null && map.teamBScore !== null)
    .map((map) => `${map.mapName} ${map.teamAScore}-${map.teamBScore}`)
    .join(", ") || null;
}

function round(value: number) {
  return Number(Number(value * 100).toFixed(1));
}

type CandidateMatch = {
  eventName: string;
  startTime: Date | string;
  teamA: { name: string };
  teamB: { name: string };
  winnerTeam?: { name: string } | null;
  maps: Array<{ mapName: string; teamAScore: number | null; teamBScore: number | null }>;
};
