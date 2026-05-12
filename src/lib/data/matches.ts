import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";
import type { PredictionOutput } from "@/lib/predictionEngine";

export type CalculatedMatch = {
  match: Awaited<ReturnType<typeof prisma.match.findMany>>[number] & {
    teamA: { id: string; name: string; slug: string; valveRank: number | null; hltvRank: number | null };
    teamB: { id: string; name: string; slug: string; valveRank: number | null; hltvRank: number | null };
  };
  prediction: PredictionOutput;
};

export async function getCalculatedMatches(options: {
  status?: string;
  limit?: number;
  format?: string;
  top?: number;
  highConfidence?: boolean;
} = {}): Promise<CalculatedMatch[]> {
  const matches = await prisma.match.findMany({
    where: {
      status: options.status,
      format: options.format,
      isOfficial: true
    },
    include: {
      teamA: { select: { id: true, name: true, slug: true, valveRank: true, hltvRank: true } },
      teamB: { select: { id: true, name: true, slug: true, valveRank: true, hltvRank: true } }
    },
    orderBy: [{ startTime: options.status === "finished" ? "desc" : "asc" }],
    take: options.limit
  });

  const filtered = matches.filter((match) => {
    if (!options.top) return true;
    const rankA = match.teamA.valveRank ?? match.teamA.hltvRank ?? 999;
    const rankB = match.teamB.valveRank ?? match.teamB.hltvRank ?? 999;
    return rankA <= options.top || rankB <= options.top;
  });

  const calculated = await Promise.all(
    filtered.map(async (match) => ({
      match,
      prediction: calculatePrediction(await buildPredictionInput(match.id))
    }))
  );

  if (options.highConfidence) {
    return calculated.filter((row) => row.prediction.confidenceScore >= 68);
  }
  return calculated;
}

export async function getCalculatedMatch(matchId: string) {
  const input = await buildPredictionInput(matchId);
  const prediction = calculatePrediction(input);
  return { input, prediction };
}
