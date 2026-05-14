import type { SourceJobType, SourceName, SourceRecord, SourceSyncResult } from "./types";
import { redactString } from "../security/redaction";

export type FetchJsonResult = {
  payload: unknown;
  status: number;
  statusText: string;
  rateLimitRemaining?: number | null;
};

function headerNumber(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

export async function fetchJsonDetailed(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<FetchJsonResult> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "CS2-Match-Prediction-Lab/0.3 research-dashboard",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(redactString(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 240)}` : ""}`));
  }
  return {
    payload: (await response.json()) as unknown,
    status: response.status,
    statusText: response.statusText,
    rateLimitRemaining: headerNumber(response.headers, [
      "x-rate-limit-remaining",
      "x-ratelimit-remaining",
      "ratelimit-remaining",
      "x-pandascore-rate-limit-remaining"
    ])
  };
}

export async function fetchJson(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
  return (await fetchJsonDetailed(url, init, fetchImpl)).payload;
}

export function arrayFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["matches", "teams", "players", "newsitems", "items", "data"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    if (record.appnews && typeof record.appnews === "object") {
      const appNews = record.appnews as Record<string, unknown>;
      if (Array.isArray(appNews.newsitems)) return appNews.newsitems;
    }
  }
  return [payload];
}

export function sourceRecordFromRaw(params: {
  source: SourceName;
  entityType: string;
  raw: unknown;
  fetchedAt: Date;
  sourceConfidence: number;
  externalId?: string;
  entityId?: string | null;
}): SourceRecord {
  const rawRecord = params.raw && typeof params.raw === "object" ? (params.raw as Record<string, unknown>) : {};
  const externalId =
    params.externalId ??
    String(rawRecord.id ?? rawRecord.gid ?? rawRecord.slug ?? rawRecord.name ?? `${params.entityType}-${params.fetchedAt.getTime()}`);
  return {
    source: params.source,
    externalId,
    entityType: params.entityType,
    entityId: params.entityId,
    raw: params.raw,
    fetchedAt: params.fetchedAt,
    sourceConfidence: params.sourceConfidence
  };
}

export function resultFromRecords(params: {
  source: SourceName;
  jobType: SourceJobType;
  records: SourceRecord[];
  status?: SourceSyncResult["status"];
  notes?: string;
  errors?: string[];
  rateLimitRemaining?: number | null;
  nextAllowedSyncAt?: Date | null;
  recordsSkipped?: number;
  endpoint?: string | null;
  method?: string | null;
  lastError?: string | null;
  rawSample?: unknown;
  endpointsAvailable?: string[];
  endpointsBlocked?: string[];
}): SourceSyncResult {
  return {
    source: params.source,
    jobType: params.jobType,
    status: params.status ?? "success",
    records: params.records,
    recordsFetched: params.records.length,
    errors: params.errors ?? [],
    notes: params.notes,
    rateLimitRemaining: params.rateLimitRemaining,
    nextAllowedSyncAt: params.nextAllowedSyncAt,
    recordsSkipped: params.recordsSkipped ?? 0,
    endpoint: params.endpoint,
    method: params.method,
    lastError: params.lastError ? redactString(params.lastError) : null,
    rawSample: params.rawSample,
    endpointsAvailable: params.endpointsAvailable,
    endpointsBlocked: params.endpointsBlocked
  };
}
