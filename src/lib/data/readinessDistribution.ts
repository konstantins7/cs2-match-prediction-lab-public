import { prisma } from "@/lib/prisma";
import { buildPredictionInput, calculatePrediction } from "@/lib/predictionEngine";
import type { PredictionReadinessLevel } from "@/lib/predictionEngine";

export type ReadinessCounts = Record<PredictionReadinessLevel, number> & {
  actionable: number;
  nonActionable: number;
};

export type ReadinessDistribution = ReadinessCounts & {
  total: ReadinessCounts;
  real: ReadinessCounts;
  sample: ReadinessCounts;
  realActionable: number;
  sampleActionable: number;
  sampleDataCount: number;
};

function emptyCounts(): ReadinessCounts {
  return {
    L0_FIXTURE_ONLY: 0,
    L1_BASIC_CONTEXT: 0,
    L2_BASIC_PREDICTION: 0,
    L3_ANALYTICAL: 0,
    L4_DEEP: 0,
    actionable: 0,
    nonActionable: 0
  };
}

export function emptyReadinessDistribution(): ReadinessDistribution {
  const total = emptyCounts();
  return {
    ...total,
    total,
    real: emptyCounts(),
    sample: emptyCounts(),
    realActionable: 0,
    sampleActionable: 0,
    sampleDataCount: 0
  };
}

function add(counts: ReadinessCounts, level: PredictionReadinessLevel, actionable: boolean) {
  counts[level] += 1;
  if (actionable) counts.actionable += 1;
  else counts.nonActionable += 1;
}

export async function getReadinessDistribution(limit = 120): Promise<ReadinessDistribution> {
  const rows = await prisma.match.findMany({
    where: {
      status: "upcoming",
      isOfficial: true,
      sourceMode: { not: "demo" }
    },
    select: { id: true, sourceMode: true },
    orderBy: { startTime: "asc" },
    take: limit
  });
  const distribution = emptyReadinessDistribution();
  for (const row of rows) {
    const prediction = calculatePrediction(await buildPredictionInput(row.id));
    add(distribution.total, prediction.readiness.level, prediction.readiness.isActionable);
    if (row.sourceMode === "analyst_sample") {
      add(distribution.sample, prediction.readiness.level, prediction.readiness.isActionable);
      distribution.sampleDataCount += 1;
      if (prediction.readiness.isActionable) distribution.sampleActionable += 1;
    } else {
      add(distribution.real, prediction.readiness.level, prediction.realForecast.isReady);
      if (prediction.realForecast.isReady) distribution.realActionable += 1;
    }
  }
  Object.assign(distribution, distribution.total);
  return distribution;
}
