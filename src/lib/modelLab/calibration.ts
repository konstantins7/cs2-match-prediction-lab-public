import { prisma } from "../prisma";

export type CalibrationBucket = {
  bucket: string;
  sampleSize: number;
  averageConfidence: number;
  observedWinRate: number;
};

export type CalibrationReadinessRow = {
  readinessLevel: string;
  sampleSize: number;
  accuracy: number | null;
  brierScore: number | null;
  logLoss: number | null;
  ece: number | null;
  buckets: CalibrationBucket[];
  message?: string;
};

function clampProbability(value: number) {
  return Math.max(0.01, Math.min(0.99, value));
}

function bucketLabel(probability: number) {
  const lower = Math.floor(probability / 10) * 10;
  const upper = Math.min(100, lower + 10);
  return `${lower}-${upper}`;
}

export function calculateCalibrationRows(rows: Array<{ readinessLevel: string; probabilityForPredictedWinner: number; predictedCorrect: boolean }>): CalibrationReadinessRow[] {
  const levels = ["L0_FIXTURE_ONLY", "L1_BASIC_CONTEXT", "L2_BASIC_PREDICTION", "L3_ANALYTICAL", "L4_DEEP"];
  return levels.map((level) => {
    const levelRows = rows.filter((row) => row.readinessLevel === level);
    if (levelRows.length === 0) {
      return {
        readinessLevel: level,
        sampleSize: 0,
        accuracy: null,
        brierScore: null,
        logLoss: null,
        ece: null,
        buckets: [],
        message: "Недостаточно матчей для оценки"
      };
    }
    const accuracy = levelRows.filter((row) => row.predictedCorrect).length / levelRows.length;
    const brierScore = levelRows.reduce((sum, row) => {
      const p = clampProbability(row.probabilityForPredictedWinner);
      return sum + (row.predictedCorrect ? (1 - p) ** 2 : p ** 2);
    }, 0) / levelRows.length;
    const logLoss = levelRows.reduce((sum, row) => {
      const p = clampProbability(row.probabilityForPredictedWinner);
      return sum - Math.log(row.predictedCorrect ? p : 1 - p);
    }, 0) / levelRows.length;
    const bucketMap = new Map<string, typeof levelRows>();
    for (const row of levelRows) {
      const key = bucketLabel(row.probabilityForPredictedWinner * 100);
      bucketMap.set(key, [...(bucketMap.get(key) ?? []), row]);
    }
    const buckets = [...bucketMap.entries()].map(([bucket, bucketRows]) => {
      const averageConfidence = bucketRows.reduce((sum, row) => sum + row.probabilityForPredictedWinner, 0) / bucketRows.length;
      const observedWinRate = bucketRows.filter((row) => row.predictedCorrect).length / bucketRows.length;
      return { bucket, sampleSize: bucketRows.length, averageConfidence, observedWinRate };
    });
    const ece = buckets.reduce((sum, bucket) => sum + (bucket.sampleSize / levelRows.length) * Math.abs(bucket.averageConfidence - bucket.observedWinRate), 0);
    return {
      readinessLevel: level,
      sampleSize: levelRows.length,
      accuracy,
      brierScore,
      logLoss,
      ece,
      buckets
    };
  });
}

export async function getCalibrationByReadiness() {
  const latestSnapshots = await prisma.matchFeatureSnapshot.findMany({
    where: { dataLeakageCheckPassed: true },
    orderBy: { createdAt: "desc" },
    include: {
      match: {
        include: {
          predictions: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    },
    take: 500
  });
  const seen = new Set<string>();
  const rows = [];
  for (const snapshot of latestSnapshots) {
    if (seen.has(snapshot.matchId)) continue;
    seen.add(snapshot.matchId);
    const prediction = snapshot.match.predictions[0];
    if (!prediction || snapshot.match.status !== "finished" || !snapshot.match.winnerTeamId || snapshot.match.sourceMode === "analyst_sample") continue;
    const predictedCorrect = prediction.predictedWinnerId === snapshot.match.winnerTeamId;
    const favoriteProbability = Math.max(prediction.teamAProbability, prediction.teamBProbability) / 100;
    rows.push({ readinessLevel: snapshot.readinessLevel, probabilityForPredictedWinner: favoriteProbability, predictedCorrect });
  }
  return calculateCalibrationRows(rows);
}
