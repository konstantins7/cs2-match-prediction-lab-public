import { prisma } from "../prisma";
import { FEATURE_SCHEMA_VERSION, FEATURE_MODEL_VERSION } from "../features/matchFeatureSnapshot";

export const TRAINING_DATASET_COLUMNS = [
  "matchId",
  "winnerTeamId",
  "readinessLevel",
  "featureCutoffTime",
  "modelVersion",
  "featureSchemaVersion",
  "dataLeakageCheckPassed",
  "sourceMode",
  "dataQualityScore",
  "teamA_avgPlayerRating",
  "teamB_avgPlayerRating",
  "teamA_totalMapsPlayed",
  "teamB_totalMapsPlayed",
  "valveRankDiff",
  "hltvManualRankDiff",
  "internalEloDiff",
  "recentWinRateDiff",
  "avgPlayerRatingDiff",
  "mapPoolAdvantage",
  "vetoAdvantage",
  "pistolAdvantage",
  "forceBuyAdvantage",
  "newsImpactDiff",
  "sampleSizeScore",
  "sourceConfidence"
];

function csvEscape(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportTrainingDatasetCsv() {
  const snapshots = await prisma.matchFeatureSnapshot.findMany({
    where: { dataLeakageCheckPassed: true },
    orderBy: { createdAt: "desc" },
    include: { match: true },
    take: 1000
  });
  const seen = new Set<string>();
  const rows = snapshots.filter((snapshot) => {
    if (seen.has(snapshot.matchId)) return false;
    seen.add(snapshot.matchId);
    return snapshot.match.status === "finished" &&
      Boolean(snapshot.match.winnerTeamId) &&
      snapshot.match.sourceMode !== "analyst_sample" &&
      snapshot.sourceMode !== "analyst_sample";
  });
  const lines = [
    TRAINING_DATASET_COLUMNS.join(","),
    ...rows.map((row) =>
      [
        row.matchId,
        row.match.winnerTeamId,
        row.readinessLevel,
        row.featureCutoffTime,
        row.modelVersion || FEATURE_MODEL_VERSION,
        row.featureSchemaVersion || FEATURE_SCHEMA_VERSION,
        row.dataLeakageCheckPassed,
        row.sourceMode,
        row.dataQualityScore,
        row.teamAAvgPlayerRating,
        row.teamBAvgPlayerRating,
        row.teamATotalMapsPlayed,
        row.teamBTotalMapsPlayed,
        row.valveRankDiff,
        row.hltvManualRankDiff,
        row.internalEloDiff,
        row.recentWinRateDiff,
        row.avgPlayerRatingDiff,
        row.mapPoolAdvantage,
        row.vetoAdvantage,
        row.pistolAdvantage,
        row.forceBuyAdvantage,
        row.newsImpactDiff,
        row.sampleSizeScore,
        row.sourceConfidence
      ].map(csvEscape).join(",")
    )
  ];
  return {
    csv: `${lines.join("\n")}\n`,
    rows: rows.length,
    columns: TRAINING_DATASET_COLUMNS
  };
}
