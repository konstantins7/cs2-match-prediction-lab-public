import type { SourceSyncResult } from "./types";
import { redactSecrets, safeJson } from "../security/redaction";

function json(value: unknown) {
  return safeJson(value);
}

export function buildDataSyncJobData(
  result: SourceSyncResult,
  startedAt: Date,
  recordsCreated: number,
  recordsUpdated: number,
  recordsSkipped = result.recordsSkipped ?? 0,
  needsReviewCount = 0,
  finishedAt = new Date()
) {
  return {
    source: result.source,
    jobType: result.jobType,
    status: result.status,
    startedAt,
    finishedAt,
    recordsFetched: result.recordsFetched,
    recordsCreated,
    recordsUpdated,
    recordsSkipped,
    errorsJson: json(result.errors),
    notes: typeof result.notes === "string" ? redactSecrets(result.notes) : result.notes,
    lastEndpoint: result.endpoint ?? null,
    lastMethod: result.method ?? null,
    lastError: result.lastError ?? (result.errors[0] ? String(redactSecrets(result.errors[0])) : null),
    lastRawSampleJson: result.rawSample === undefined ? null : json(result.rawSample),
    needsReviewCount,
    lastSyncedAt: result.status === "success" || result.status === "partial" ? finishedAt : null,
    cursor: result.cursor ?? null,
    since: result.since ?? null,
    nextAllowedSyncAt: result.nextAllowedSyncAt ?? null,
    rateLimitRemaining: result.rateLimitRemaining ?? null,
    failureCount: result.status === "failed" || result.status === "blocked" ? 1 : 0
  };
}
