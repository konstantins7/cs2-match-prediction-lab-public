import type { BacktestResult } from "@/components/BacktestSummary";
import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";

const buckets = [
  { label: "50-55", min: 50, max: 55 },
  { label: "55-60", min: 55, max: 60 },
  { label: "60-65", min: 60, max: 65 },
  { label: "65-70", min: 65, max: 70 },
  { label: "70+", min: 70, max: 100 }
];

export async function runMockBacktest(): Promise<BacktestResult> {
  const matches = await prisma.match.findMany({
    where: { status: "finished", winnerTeamId: { not: null } },
    orderBy: { startTime: "desc" }
  });
  const rows = await Promise.all(
    matches.map(async (match) => {
      const input = await buildPredictionInput(match.id);
      const prediction = calculatePrediction(input);
      const winnerProbability = match.winnerTeamId === input.teamA.id ? prediction.teamAProbability / 100 : prediction.teamBProbability / 100;
      const predictedProbability = Math.max(prediction.teamAProbability, prediction.teamBProbability);
      const correct = prediction.predictedWinnerId === match.winnerTeamId;
      return { match, input, prediction, winnerProbability, predictedProbability, correct };
    })
  );

  const testedMatches = rows.length;
  const correctPredictions = rows.filter((row) => row.correct).length;
  const brierScore = rows.reduce((sum, row) => sum + (1 - row.winnerProbability) ** 2, 0) / Math.max(rows.length, 1);
  const calibrationBuckets = buckets.map((bucket) => {
    const inBucket = rows.filter((row) => row.predictedProbability >= bucket.min && row.predictedProbability < bucket.max);
    return {
      bucket: bucket.label,
      matches: inBucket.length,
      accuracy: inBucket.length ? inBucket.filter((row) => row.correct).length / inBucket.length : 0,
      avgConfidence: inBucket.length ? inBucket.reduce((sum, row) => sum + row.prediction.confidenceScore, 0) / inBucket.length : 0
    };
  });

  const wrong = rows.filter((row) => !row.correct);
  const errorBreakdown = [
    {
      label: "BO1 errors",
      count: wrong.filter((row) => row.match.format === "BO1").length,
      note: "Короткий формат чаще ломается через pistol/economy/veto variance."
    },
    {
      label: "New roster errors",
      count: wrong.filter((row) => row.prediction.riskBreakdown.riskReasons.some((reason) => reason.includes("Новый roster"))).length,
      note: "Новые составы снижают relevance старых player/team stats."
    },
    {
      label: "Veto errors",
      count: wrong.filter((row) => row.prediction.factors.find((factor) => factor.factorName === "Pick/Ban/Veto" && factor.confidence < 0.6)).length,
      note: "Низкая veto confidence показывает, где map scenario мог измениться."
    },
    {
      label: "News impact errors",
      count: wrong.filter((row) => row.input.news.length > 0).length,
      note: "Новости ограничены clamps, но повышают risk."
    },
    {
      label: "Favorite bias",
      count: wrong.filter((row) => row.predictedProbability >= 60).length,
      note: "Ошибки фаворитов показывают возможное завышение сильной стороны."
    },
    {
      label: "Underdog bias",
      count: rows.filter((row) => row.correct && row.predictedProbability < 55).length,
      note: "Матчи около 50/50 помогают увидеть недооценённых underdogs."
    }
  ];

  return {
    testedMatches,
    correctPredictions,
    accuracy: testedMatches ? correctPredictions / testedMatches : 0,
    brierScore,
    averageConfidence: rows.reduce((sum, row) => sum + row.prediction.confidenceScore, 0) / Math.max(rows.length, 1),
    calibrationBuckets,
    errorBreakdown
  };
}
