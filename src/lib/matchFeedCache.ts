import type { SourceJobType, SourceName, SourceSyncResult } from "./sources/types";
import { prisma } from "./prisma";
import { syncLiveMatches, syncUpcomingMatches } from "./sources/sourceScheduler";

export type MatchFeedSnapshotRow = {
  key: string;
  id: string;
  source: string;
  sourceMatchId: string | null;
  eventName: string;
  status: string;
  startTime: string;
  format: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  updatedAt: string;
  fingerprint: string;
};

export type MatchFeedDeltaItem = Pick<MatchFeedSnapshotRow, "key" | "id" | "eventName" | "status" | "startTime" | "format" | "teamAName" | "teamBName"> & {
  reason?: string;
};

export type MatchFeedDelta = {
  new: MatchFeedDeltaItem[];
  updated: MatchFeedDeltaItem[];
  unchanged: MatchFeedDeltaItem[];
  stale: MatchFeedDeltaItem[];
  counts: {
    new: number;
    updated: number;
    unchanged: number;
    stale: number;
  };
};

export type MatchFeedStatus = {
  liveCount: number;
  upcomingCount: number;
  cachedCount: number;
  lastUpdated: string | null;
  isStale: boolean;
  staleAfterMinutes: number;
};

export type MatchFeedSyncSummary = {
  source: SourceName;
  jobType: SourceJobType;
  status: SourceSyncResult["status"];
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  needsReviewCount: number;
  lastSyncedAt: string | null;
  endpoint?: string | null;
  notes?: string | null;
};

export type MatchFeedRefreshResult = {
  startedAt: string;
  finishedAt: string;
  before: MatchFeedStatus;
  after: MatchFeedStatus;
  delta: MatchFeedDelta;
  syncSummary: MatchFeedSyncSummary[];
  notes: string[];
};

const FEED_STATUSES = ["live", "upcoming"];
const STALE_AFTER_MINUTES = 20;

function rowKey(row: { source: string; sourceMatchId: string | null; id: string }) {
  return row.sourceMatchId ? `${row.source}:${row.sourceMatchId}` : `local:${row.id}`;
}

export function buildMatchFeedFingerprint(row: {
  eventName: string;
  status: string;
  startTime: string;
  format: string;
  teamAId: string;
  teamBId: string;
}) {
  return JSON.stringify({
    eventName: row.eventName,
    status: row.status,
    startTime: row.startTime,
    format: row.format,
    teamAId: row.teamAId,
    teamBId: row.teamBId
  });
}

export function computeMatchFeedDelta(before: MatchFeedSnapshotRow[], after: MatchFeedSnapshotRow[], providerKeys?: Set<string>) {
  const beforeByKey = new Map(before.map((row) => [row.key, row]));
  const afterByKey = new Map(after.map((row) => [row.key, row]));
  const newRows: MatchFeedDeltaItem[] = [];
  const updated: MatchFeedDeltaItem[] = [];
  const unchanged: MatchFeedDeltaItem[] = [];
  const stale: MatchFeedDeltaItem[] = [];

  for (const row of after) {
    if (providerKeys && !providerKeys.has(row.key)) continue;
    const previous = beforeByKey.get(row.key);
    if (!previous) {
      newRows.push(toDeltaItem(row, "new provider match"));
    } else if (previous.fingerprint !== row.fingerprint) {
      updated.push(toDeltaItem(row, "status, start time, teams, format or event changed"));
    } else {
      unchanged.push(toDeltaItem(row, "same match feed fingerprint"));
    }
  }

  for (const row of before) {
    if (providerKeys ? !providerKeys.has(row.key) : !afterByKey.has(row.key)) {
      stale.push(toDeltaItem(row, "not present in latest live/upcoming provider response"));
    }
  }

  return {
    new: newRows,
    updated,
    unchanged,
    stale,
    counts: {
      new: newRows.length,
      updated: updated.length,
      unchanged: unchanged.length,
      stale: stale.length
    }
  };
}

export async function getMatchFeedSnapshot(): Promise<MatchFeedSnapshotRow[]> {
  const rows = await prisma.match.findMany({
    where: { status: { in: FEED_STATUSES } },
    include: { teamA: { select: { name: true } }, teamB: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { startTime: "asc" }]
  });
  return rows.map((row) => {
    const startTime = row.startTime.toISOString();
    const base = {
      key: rowKey(row),
      id: row.id,
      source: row.source,
      sourceMatchId: row.sourceMatchId,
      eventName: row.eventName,
      status: row.status,
      startTime,
      format: row.format,
      teamAId: row.teamAId,
      teamBId: row.teamBId,
      teamAName: row.teamA.name,
      teamBName: row.teamB.name,
      updatedAt: row.updatedAt.toISOString()
    };
    return {
      ...base,
      fingerprint: buildMatchFeedFingerprint(base)
    };
  });
}

export async function getMatchFeedStatus(now = new Date()): Promise<MatchFeedStatus> {
  const [liveCount, upcomingCount, latestJob] = await Promise.all([
    prisma.match.count({ where: { status: "live" } }),
    prisma.match.count({ where: { status: "upcoming" } }),
    prisma.dataSyncJob.findFirst({
      where: { source: "pandascore", jobType: { in: ["live_matches", "upcoming_matches"] } },
      orderBy: { startedAt: "desc" }
    })
  ]);
  const lastUpdated = latestJob?.lastSyncedAt ?? latestJob?.finishedAt ?? null;
  const ageMinutes = lastUpdated ? (now.getTime() - lastUpdated.getTime()) / 60000 : Number.POSITIVE_INFINITY;
  return {
    liveCount,
    upcomingCount,
    cachedCount: liveCount + upcomingCount,
    lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
    isStale: ageMinutes > STALE_AFTER_MINUTES,
    staleAfterMinutes: STALE_AFTER_MINUTES
  };
}

export async function refreshMatchFeed(): Promise<MatchFeedRefreshResult> {
  const startedAt = new Date();
  const beforeRows = await getMatchFeedSnapshot();
  const before = await getMatchFeedStatus(startedAt);
  const results = [await syncLiveMatches("pandascore"), await syncUpcomingMatches("pandascore")];
  const finishedAt = new Date();
  const afterRows = await getMatchFeedSnapshot();
  const after = await getMatchFeedStatus(finishedAt);
  const providerKeys = new Set(
    results.flatMap((result) =>
      result.records
        .filter((record) => record.entityType === "match")
        .map((record) => `${record.source}:${record.externalId}`)
    )
  );
  const delta = computeMatchFeedDelta(beforeRows, afterRows, providerKeys.size > 0 ? providerKeys : undefined);
  const syncSummary = await Promise.all(results.map((result) => latestSyncSummary(result, startedAt)));
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    before,
    after,
    delta,
    syncSummary,
    notes: [
      "Page-load sync remains disabled; this refresh only runs after the user clicks the button.",
      "Stale/removed matches are reported in the delta and are not deleted automatically."
    ]
  };
}

async function latestSyncSummary(result: SourceSyncResult, startedAt: Date): Promise<MatchFeedSyncSummary> {
  const job = await prisma.dataSyncJob.findFirst({
    where: { source: result.source, jobType: result.jobType, startedAt: { gte: startedAt } },
    orderBy: { startedAt: "desc" }
  });
  return {
    source: result.source,
    jobType: result.jobType,
    status: result.status,
    recordsFetched: result.recordsFetched,
    recordsCreated: job?.recordsCreated ?? 0,
    recordsUpdated: job?.recordsUpdated ?? 0,
    recordsSkipped: job?.recordsSkipped ?? result.recordsSkipped ?? 0,
    needsReviewCount: job?.needsReviewCount ?? 0,
    lastSyncedAt: job?.lastSyncedAt ? job.lastSyncedAt.toISOString() : null,
    endpoint: result.endpoint,
    notes: result.notes
  };
}

function toDeltaItem(row: MatchFeedSnapshotRow, reason?: string): MatchFeedDeltaItem {
  return {
    key: row.key,
    id: row.id,
    eventName: row.eventName,
    status: row.status,
    startTime: row.startTime,
    format: row.format,
    teamAName: row.teamAName,
    teamBName: row.teamBName,
    reason
  };
}
