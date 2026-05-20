import type { BacktestResult } from "@/components/BacktestSummary";
import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";
import { calculateMatchPriority, isDefaultProFocus, type MatchPriorityLike } from "@/lib/proFocus";

export type BacktestScope = "all" | "pro_focus" | "demo" | "pandascore_fixtures" | "sample_dev_only";
export type BacktestModel = "rule_based" | "elo" | "bayesian_map" | "weighted" | "ensemble";

const buckets = [
  { label: "50-55", min: 50, max: 55 },
  { label: "55-60", min: 55, max: 60 },
  { label: "60-65", min: 60, max: 65 },
  { label: "65-70", min: 65, max: 70 },
  { label: "70+", min: 70, max: 100 }
];

export async function runMockBacktest(scope: BacktestScope = "all", model: BacktestModel = "rule_based"): Promise<BacktestResult> {
  const matches = await prisma.match.findMany({
    where: { status: "finished", winnerTeamId: { not: null } },
    include: {
      teamA: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } },
      teamB: { include: { rankSnapshots: { orderBy: { rankingDate: "desc" }, take: 3 } } }
    },
    orderBy: { startTime: "desc" }
  });
  const scoped = matches.filter((match) => {
    if (scope === "demo") return match.sourceMode === "demo";
    if (scope === "pandascore_fixtures") return match.sourceMode === "pandascore_free";
    if (scope === "sample_dev_only") return match.sourceMode === "analyst_sample";
    if (scope === "pro_focus") {
      const priority = calculateMatchPriority(match as unknown as MatchPriorityLike);
      return match.sourceMode !== "demo" && match.sourceMode !== "analyst_sample" && isDefaultProFocus(priority, match.isPinned);
    }
    return match.sourceMode !== "analyst_sample";
  });
  const rows = await Promise.all(
    scoped.map(async (match) => {
      const input = await buildPredictionInput(match.id);
      const prediction = calculatePrediction(input);
      const advisoryTeamAProbability = model === "rule_based" ? prediction.teamAProbability : advisoryProbability(input, model);
      const advisoryTeamBProbability = 100 - advisoryTeamAProbability;
      const predictedWinnerId = advisoryTeamAProbability >= advisoryTeamBProbability ? input.teamA.id : input.teamB.id;
      const winnerProbability = match.winnerTeamId === input.teamA.id ? advisoryTeamAProbability / 100 : advisoryTeamBProbability / 100;
      const predictedProbability = Math.max(advisoryTeamAProbability, advisoryTeamBProbability);
      const correct = predictedWinnerId === match.winnerTeamId;
      return { match, input, prediction, winnerProbability, predictedProbability, correct };
    })
  );

  const testedMatches = rows.length;
  const correctPredictions = rows.filter((row) => row.correct).length;
  const brierScore = rows.reduce((sum, row) => sum + (1 - row.winnerProbability) ** 2, 0) / Math.max(rows.length, 1);
  const logLoss = rows.reduce((sum, row) => sum - Math.log(Math.max(0.001, Math.min(0.999, row.winnerProbability))), 0) / Math.max(rows.length, 1);
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
    scope,
    model,
    testedMatches,
    correctPredictions,
    accuracy: testedMatches ? correctPredictions / testedMatches : 0,
    brierScore,
    logLoss,
    averageConfidence: rows.reduce((sum, row) => sum + row.prediction.confidenceScore, 0) / Math.max(rows.length, 1),
    calibrationBuckets,
    errorBreakdown
  };
}

function advisoryProbability(input: Awaited<ReturnType<typeof buildPredictionInput>>, model: BacktestModel) {
  const elo = logistic((input.teamA.internalElo - input.teamB.internalElo) / 400) * 100;
  const maps = mapProbability(input);
  const weighted = (elo * 0.4) + (maps * 0.45) + (rosterScore(input) * 0.15);
  if (model === "elo") return clamp(elo);
  if (model === "bayesian_map") return clamp(maps);
  if (model === "weighted") return clamp(weighted);
  if (model === "ensemble") return clamp((elo + maps + weighted) / 3);
  return 50;
}

function mapProbability(input: Awaited<ReturnType<typeof buildPredictionInput>>) {
  const avgA = average(input.mapStatsA.map((row) => row.winRate * 100));
  const avgB = average(input.mapStatsB.map((row) => row.winRate * 100));
  if (!Number.isFinite(avgA) || !Number.isFinite(avgB) || avgA + avgB === 0) return 50;
  return (avgA / (avgA + avgB)) * 100;
}

function rosterScore(input: Awaited<ReturnType<typeof buildPredictionInput>>) {
  const a = input.rosterVersionA?.coreStabilityScore ?? input.teamFormA?.rosterStabilityScore ?? Math.min(1, input.playersA.length / 5);
  const b = input.rosterVersionB?.coreStabilityScore ?? input.teamFormB?.rosterStabilityScore ?? Math.min(1, input.playersB.length / 5);
  return logistic((a - b) * 2) * 100;
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : Number.NaN;
}

function clamp(value: number) {
  return Math.max(1, Math.min(99, Number(value.toFixed(2))));
}
