import { prisma } from "@/lib/prisma";
import { buildPredictionInput, type PredictionInput } from "@/lib/predictionEngine";

export async function rebuildMatchFeatureHistory(limit = 250) {
  const matches = await prisma.match.findMany({
    where: { status: "finished", winnerTeamId: { not: null }, sourceMode: { not: "analyst_sample" } },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { id: true }
  });
  let created = 0;
  const errors: Array<{ matchId: string; error: string }> = [];
  for (const match of matches) {
    try {
      await upsertMatchFeatureHistory(match.id);
      created += 1;
    } catch (error) {
      errors.push({ matchId: match.id, error: error instanceof Error ? error.message : "unknown error" });
    }
  }
  return { scanned: matches.length, created, errors };
}

export async function upsertMatchFeatureHistory(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const data = buildMatchFeatureHistoryData(input);
  return prisma.matchFeatureHistory.upsert({
    where: { matchId },
    create: data,
    update: { ...data, computedAt: new Date() }
  });
}

export function buildMatchFeatureHistoryData(input: PredictionInput) {
  const mapsA = mapNames(input.mapStatsA);
  const mapsB = mapNames(input.mapStatsB);
  const mapPool = [...new Set([...mapsA, ...mapsB, ...input.mapStatsA.map((row) => row.mapName), ...input.mapStatsB.map((row) => row.mapName)])].filter(Boolean).sort();
  const rosterA = input.playersA.map((player) => player.nickname).filter(Boolean).sort();
  const rosterB = input.playersB.map((player) => player.nickname).filter(Boolean).sort();
  return {
    matchId: input.match.id,
    teamAId: input.teamA.id,
    teamBId: input.teamB.id,
    avgTeamARating: average(input.playerStatsA.map((row) => row.rating), 1),
    avgTeamBRating: average(input.playerStatsB.map((row) => row.rating), 1),
    mapPoolOverlap: jaccard(mapsA, mapsB),
    rosterStability: average([
      input.rosterVersionA?.coreStabilityScore ?? input.teamFormA?.rosterStabilityScore ?? rosterCompleteness(rosterA),
      input.rosterVersionB?.coreStabilityScore ?? input.teamFormB?.rosterStabilityScore ?? rosterCompleteness(rosterB)
    ], 0.5),
    recentWinRateA: input.basicResultA?.winRate ?? input.teamFormA?.matchWinRate ?? 0.5,
    recentWinRateB: input.basicResultB?.winRate ?? input.teamFormB?.matchWinRate ?? 0.5,
    tournamentTier: tierScore(input.match.eventTier),
    isLan: input.match.isLan,
    mapPoolJson: JSON.stringify(mapPool),
    rosterAJson: JSON.stringify(rosterA),
    rosterBJson: JSON.stringify(rosterB)
  };
}

export function tierScore(tier: string | null | undefined) {
  const normalized = String(tier ?? "").toUpperCase();
  if (/\bS\b|MAJOR|ELITE|TIER[_ -]?1/.test(normalized)) return 1;
  if (/\bA\b|TIER[_ -]?2/.test(normalized)) return 2;
  if (/\bB\b|TIER[_ -]?3/.test(normalized)) return 3;
  if (/C|REGIONAL|QUAL/.test(normalized)) return 4;
  return 3;
}

function mapNames(rows: Array<{ mapName: string }>) {
  return [...new Set(rows.map((row) => row.mapName).filter(Boolean))].sort();
}

function rosterCompleteness(players: string[]) {
  return Math.min(1, players.length / 5);
}

function average(values: number[], fallback: number) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : fallback;
}

export function jaccard(a: string[], b: string[]) {
  const setA = new Set(a.map((item) => item.toLowerCase()));
  const setB = new Set(b.map((item) => item.toLowerCase()));
  const union = new Set([...setA, ...setB]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  return intersection / union.size;
}
