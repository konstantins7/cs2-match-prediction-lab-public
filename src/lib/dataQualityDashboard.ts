import { prisma } from "./prisma";
import { scanPrivateNormalizedInbox, type PrivateInboxScanResult } from "./privateNormalizedInbox";

export type DataQualitySourceCount = {
  dataType: "roster" | "player_stats" | "map_stats" | "veto";
  source: string;
  sourceMode: string;
  count: number;
};

export type DataQualityDashboardSummary = {
  generatedAt: string;
  sourceCounts: DataQualitySourceCount[];
  predictionPicks: {
    totalFinal: number;
    realForecastReady: number;
    notReady: number;
    byStatus: Array<{ status: string; count: number }>;
    bySourceBucket: Array<{ sourceBucket: string; count: number }>;
  };
  topBlockers: Array<{ blocker: string; count: number }>;
  privateInbox: Pick<PrivateInboxScanResult, "inboxPath" | "filesFound" | "acceptedFiles" | "validationPassed" | "validationFailed" | "recordsCreated" | "recordsUpdated" | "warnings">;
};

type SourceGroup = {
  source?: string | null;
  sourceMode?: string | null;
  _count: { _all: number };
};

type PickForBucket = {
  sourceSummaryJson: string;
};

type BlockerJob = {
  blockersJson: string;
};

type BlockerStep = {
  blockerCode: string | null;
  stepKey: string;
  status: string;
};

export async function buildDataQualityDashboardSummary(): Promise<DataQualityDashboardSummary> {
  const [
    rosterGroups,
    playerGroups,
    mapGroups,
    vetoGroups,
    finalPicks,
    statusGroups,
    jobs,
    steps,
    privateInbox
  ] = await Promise.all([
    prisma.player.groupBy({ by: ["sourceMode"], _count: { _all: true } }),
    prisma.playerStatSnapshot.groupBy({ by: ["source", "sourceMode"], _count: { _all: true } }),
    prisma.teamMapStat.groupBy({ by: ["source", "sourceMode"], _count: { _all: true } }),
    prisma.vetoPattern.groupBy({ by: ["source", "sourceMode"], _count: { _all: true } }),
    prisma.predictionPick.findMany({
      where: { pickType: "final" },
      select: { realForecastReady: true, sourceSummaryJson: true }
    }),
    prisma.predictionPick.groupBy({
      by: ["status"],
      where: { pickType: "final" },
      _count: { _all: true }
    }),
    prisma.analysisJob.findMany({
      orderBy: { startedAt: "desc" },
      take: 200,
      select: { blockersJson: true }
    }),
    prisma.analysisJobStep.findMany({
      where: { status: { in: ["missing", "blocked", "error"] } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { blockerCode: true, stepKey: true, status: true }
    }),
    scanPrivateNormalizedInbox(undefined, { trustedLocalImports: false })
  ]);

  return {
    generatedAt: new Date().toISOString(),
    sourceCounts: [
      ...sourceCounts("roster", rosterGroups),
      ...sourceCounts("player_stats", playerGroups),
      ...sourceCounts("map_stats", mapGroups),
      ...sourceCounts("veto", vetoGroups)
    ],
    predictionPicks: {
      totalFinal: finalPicks.length,
      realForecastReady: finalPicks.filter((pick) => pick.realForecastReady).length,
      notReady: finalPicks.filter((pick) => !pick.realForecastReady).length,
      byStatus: statusGroups.map((group) => ({ status: group.status, count: group._count._all })),
      bySourceBucket: bucketCounts(finalPicks)
    },
    topBlockers: blockerFrequency(jobs, steps).slice(0, 12),
    privateInbox: {
      inboxPath: privateInbox.inboxPath,
      filesFound: privateInbox.filesFound,
      acceptedFiles: privateInbox.acceptedFiles,
      validationPassed: privateInbox.validationPassed,
      validationFailed: privateInbox.validationFailed,
      recordsCreated: privateInbox.recordsCreated,
      recordsUpdated: privateInbox.recordsUpdated,
      warnings: privateInbox.warnings
    }
  };
}

export function sourceCounts(dataType: DataQualitySourceCount["dataType"], groups: SourceGroup[]): DataQualitySourceCount[] {
  return groups.map((group) => ({
    dataType,
    source: group.source ?? group.sourceMode ?? "unknown",
    sourceMode: group.sourceMode ?? group.source ?? "unknown",
    count: group._count._all
  })).sort((a, b) => b.count - a.count);
}

export function classifyPickSourceBucket(pick: PickForBucket) {
  const raw = safeParseArray(pick.sourceSummaryJson);
  const joined = raw.map((item) => `${String(item.source ?? "")} ${String(item.status ?? "")}`).join(" ").toLowerCase();
  if (joined.includes("parsed_demo")) return "parsed_demo";
  if (joined.includes("manual") && joined.includes("yes")) return "manual_real";
  if (joined.includes("grid") && joined.includes("yes")) return "grid";
  if (joined.includes("pandascore")) return "pandascore_basic";
  return "unknown_or_mixed";
}

export function bucketCounts(picks: PickForBucket[]) {
  const counts = new Map<string, number>();
  for (const pick of picks) counts.set(classifyPickSourceBucket(pick), (counts.get(classifyPickSourceBucket(pick)) ?? 0) + 1);
  return [...counts.entries()].map(([sourceBucket, count]) => ({ sourceBucket, count })).sort((a, b) => b.count - a.count);
}

export function blockerFrequency(jobs: BlockerJob[], steps: BlockerStep[]) {
  const counts = new Map<string, number>();
  const add = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };
  for (const job of jobs) {
    for (const blocker of safeParseStringArray(job.blockersJson)) add(blocker);
  }
  for (const step of steps) add(step.blockerCode ?? `${step.stepKey}:${step.status}`);
  return [...counts.entries()].map(([blocker, count]) => ({ blocker, count })).sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker));
}

function safeParseArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function safeParseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
