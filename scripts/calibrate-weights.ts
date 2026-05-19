import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

type FeatureKey =
  | "valveRankDiff"
  | "hltvManualRankDiff"
  | "internalEloDiff"
  | "recentWinRateDiff"
  | "avgPlayerRatingDiff"
  | "mapPoolAdvantage"
  | "vetoAdvantage"
  | "pistolAdvantage"
  | "forceBuyAdvantage"
  | "newsImpactDiff";

const features: FeatureKey[] = [
  "valveRankDiff",
  "hltvManualRankDiff",
  "internalEloDiff",
  "recentWinRateDiff",
  "avgPlayerRatingDiff",
  "mapPoolAdvantage",
  "vetoAdvantage",
  "pistolAdvantage",
  "forceBuyAdvantage",
  "newsImpactDiff"
];

async function main() {
  const out = arg("--out") ?? path.join("data", "model", "calibrated_weights.json");
  const snapshots = await prisma.matchFeatureSnapshot.findMany({
    where: { dataLeakageCheckPassed: true },
    orderBy: { createdAt: "desc" },
    include: { match: { select: { teamAId: true, teamBId: true, winnerTeamId: true, status: true, sourceMode: true } } },
    take: Number(arg("--limit") ?? 1000)
  });
  const seen = new Set<string>();
  const rows = snapshots.filter((snapshot) => {
    if (seen.has(snapshot.matchId)) return false;
    seen.add(snapshot.matchId);
    return snapshot.match.status === "finished" && Boolean(snapshot.match.winnerTeamId) && snapshot.match.sourceMode !== "analyst_sample" && snapshot.sourceMode !== "analyst_sample";
  });
  const weights = Object.fromEntries(features.map((feature) => [feature, featureWeight(rows.map((row) => ({
    x: Number(row[feature] ?? 0),
    y: row.match.winnerTeamId === row.match.teamAId ? 1 : 0
  })))]));
  const predictions = rows.map((row) => {
    const score = features.reduce((sum, feature) => sum + Number(row[feature] ?? 0) * Number(weights[feature] ?? 0), 0);
    const p = sigmoid(score);
    return { p, y: row.match.winnerTeamId === row.match.teamAId ? 1 : 0 };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    mode: "advisory_offline_calibration",
    warning: "These weights improve backtesting on available finished matches only and are off by default.",
    weights,
    metrics: metrics(predictions)
  };
  await mkdir(path.dirname(path.resolve(process.cwd(), out)), { recursive: true });
  await writeFile(path.resolve(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

function featureWeight(rows: Array<{ x: number; y: number }>) {
  if (rows.length < 5) return 0;
  const meanX = average(rows.map((row) => row.x));
  const meanY = average(rows.map((row) => row.y));
  const numerator = rows.reduce((sum, row) => sum + (row.x - meanX) * (row.y - meanY), 0);
  const denominator = rows.reduce((sum, row) => sum + (row.x - meanX) ** 2, 0) || 1;
  return Number((numerator / denominator).toFixed(6));
}

function metrics(rows: Array<{ p: number; y: number }>) {
  if (!rows.length) return { brierScore: null, logLoss: null };
  return {
    brierScore: Number((rows.reduce((sum, row) => sum + (row.p - row.y) ** 2, 0) / rows.length).toFixed(6)),
    logLoss: Number((rows.reduce((sum, row) => sum - (row.y ? Math.log(clamp(row.p)) : Math.log(1 - clamp(row.p))), 0) / rows.length).toFixed(6))
  };
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number) {
  return Math.max(0.01, Math.min(0.99, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
