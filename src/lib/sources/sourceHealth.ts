import { prisma } from "../prisma";
import { sourceAdapters } from "./index";
import type { SourceName, SourceStatus, SourceSyncResult } from "./types";
import { isoOrNull } from "./types";
import { redactSecrets, safeJson } from "../security/redaction";

export async function updateSourceHealth(result: SourceSyncResult, counts: { recordsCreated?: number; recordsUpdated?: number; recordsSkipped?: number; needsReviewCount?: number } = {}) {
  const now = new Date();
  const failed = result.status === "failed" || result.status === "blocked";
  const existing = await prisma.sourceHealth.findUnique({ where: { source: result.source } });
  const notes = typeof result.notes === "string" ? redactSecrets(result.notes) : result.notes ?? result.errors.join("; ");
  const lastError = result.lastError ?? (result.errors[0] ? String(redactSecrets(result.errors[0])) : null);
  const lastRawSampleJson = result.rawSample === undefined ? existing?.lastRawSampleJson ?? null : safeJson(result.rawSample);
  return prisma.sourceHealth.upsert({
    where: { source: result.source },
    create: {
      source: result.source,
      status: result.status,
      lastSuccessAt: result.status === "success" || result.status === "partial" ? now : null,
      lastFailureAt: failed ? now : null,
      failureCount: failed ? 1 : 0,
      rateLimitRemaining: result.rateLimitRemaining ?? null,
      notes,
      lastEndpoint: result.endpoint ?? null,
      lastMethod: result.method ?? null,
      lastError,
      lastRawSampleJson,
      lastRecordsFetched: result.recordsFetched,
      lastRecordsCreated: counts.recordsCreated ?? 0,
      lastRecordsUpdated: counts.recordsUpdated ?? 0,
      lastRecordsSkipped: counts.recordsSkipped ?? result.recordsSkipped ?? 0,
      needsReviewCount: counts.needsReviewCount ?? 0,
      lastSyncedAt: result.status === "success" || result.status === "partial" ? now : null,
      cursor: result.cursor ?? null,
      since: result.since ?? null,
      nextAllowedSyncAt: result.nextAllowedSyncAt ?? null
    },
    update: {
      status: result.status,
      lastSuccessAt: result.status === "success" || result.status === "partial" ? now : existing?.lastSuccessAt,
      lastFailureAt: failed ? now : existing?.lastFailureAt,
      failureCount: failed ? (existing?.failureCount ?? 0) + 1 : 0,
      rateLimitRemaining: result.rateLimitRemaining ?? existing?.rateLimitRemaining ?? null,
      notes,
      lastEndpoint: result.endpoint ?? existing?.lastEndpoint ?? null,
      lastMethod: result.method ?? existing?.lastMethod ?? null,
      lastError,
      lastRawSampleJson,
      lastRecordsFetched: result.recordsFetched,
      lastRecordsCreated: counts.recordsCreated ?? 0,
      lastRecordsUpdated: counts.recordsUpdated ?? 0,
      lastRecordsSkipped: counts.recordsSkipped ?? result.recordsSkipped ?? 0,
      needsReviewCount: counts.needsReviewCount ?? existing?.needsReviewCount ?? 0,
      lastSyncedAt: result.status === "success" || result.status === "partial" ? now : existing?.lastSyncedAt,
      cursor: result.cursor ?? existing?.cursor ?? null,
      since: result.since ?? existing?.since ?? null,
      nextAllowedSyncAt: result.nextAllowedSyncAt ?? existing?.nextAllowedSyncAt ?? null
    }
  });
}

export async function getSourceStatuses(): Promise<SourceStatus[]> {
  const [health, rawCounts, needsReviewCounts] = await Promise.all([
    prisma.sourceHealth.findMany(),
    prisma.externalSourceRecord.groupBy({ by: ["source"], _count: { source: true } }),
    prisma.entityMatchCandidate.groupBy({ by: ["source"], where: { status: "needs_review" }, _count: { source: true } })
  ]);
  const bySource = new Map(health.map((item) => [item.source, item]));
  const rawBySource = new Map(rawCounts.map((item) => [item.source, item._count.source]));
  const reviewBySource = new Map(needsReviewCounts.map((item) => [item.source, item._count.source]));
  return sourceAdapters.map((adapter) => {
    const status = adapter.status();
    const saved = bySource.get(adapter.name);
    return {
      ...status,
      status: saved?.status ? (saved.status as SourceStatus["status"]) : status.status,
      lastSyncedAt: isoOrNull(saved?.lastSyncedAt),
      nextAllowedSyncAt: isoOrNull(saved?.nextAllowedSyncAt),
      rateLimitRemaining: saved?.rateLimitRemaining ?? status.rateLimitRemaining ?? null,
      failureCount: saved?.failureCount ?? status.failureCount ?? 0,
      message: saved?.notes ?? status.message,
      lastEndpoint: saved?.lastEndpoint ?? null,
      lastMethod: saved?.lastMethod ?? null,
      lastError: saved?.lastError ?? null,
      lastRawSampleJson: saved?.lastRawSampleJson ?? null,
      rawRecordsCount: rawBySource.get(adapter.name) ?? 0,
      recordsFetched: saved?.lastRecordsFetched ?? 0,
      recordsCreated: saved?.lastRecordsCreated ?? 0,
      recordsUpdated: saved?.lastRecordsUpdated ?? 0,
      recordsSkipped: saved?.lastRecordsSkipped ?? 0,
      needsReviewCount: reviewBySource.get(adapter.name) ?? saved?.needsReviewCount ?? 0,
      endpointsAvailable: status.endpointsAvailable,
      endpointsBlocked: status.endpointsBlocked
    };
  });
}

export async function getSourceHealth(source: SourceName) {
  return prisma.sourceHealth.findUnique({ where: { source } });
}
