import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";
import {
  buildBlockedFirstRealForecastSessionView,
  buildFirstRealForecastSessionView,
  firstRealForecastTarget,
  type FirstRealForecastCandidate
} from "@/lib/firstRealForecastSheetSession";

export async function getNearestFutureForecastMatches(now = new Date(), limit = 3): Promise<FirstRealForecastCandidate[]> {
  const matches = await prisma.match.findMany({
    where: {
      status: "upcoming",
      isOfficial: true,
      startTime: { gt: now },
      sourceMode: { notIn: ["demo", "analyst_sample"] }
    },
    include: { teamA: true, teamB: true },
    orderBy: { startTime: "asc" },
    take: limit
  });
  return matches.map((match) => ({
    matchId: match.id,
    teams: `${match.teamA.name} vs ${match.teamB.name}`,
    startTime: match.startTime.toISOString(),
    format: match.format,
    eventName: match.eventName,
    sourceMode: match.sourceMode
  }));
}

export async function getFirstRealForecastTargetSession(now = new Date()) {
  const nearestFutureMatches = await getNearestFutureForecastMatches(now, 3);
  try {
    const input = await buildPredictionInput(firstRealForecastTarget.matchId);
    const prediction = calculatePrediction(input);
    return buildFirstRealForecastSessionView({ input, prediction, now, nearestFutureMatches });
  } catch {
    return buildBlockedFirstRealForecastSessionView([`Target match not found: ${firstRealForecastTarget.matchId}`], nearestFutureMatches);
  }
}
