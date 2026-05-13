export type SourceName =
  | "grid"
  | "pandascore"
  | "liquipedia"
  | "valve-rankings"
  | "cs-updates"
  | "faceit"
  | "parsed-demo"
  | "analyst-sample"
  | "manual"
  | "mock"
  | "official-future";

export type SourceMode =
  | "demo"
  | "valve_rankings"
  | "steam_updates"
  | "pandascore_free"
  | "manual_real"
  | "parsed_demo"
  | "analyst_sample"
  | "mixed"
  | "partial"
  | "needs_review";

export type SourceJobType =
  | "upcoming_matches"
  | "live_matches"
  | "finished_matches"
  | "teams"
  | "players"
  | "series"
  | "tournaments"
  | "rosters"
  | "valve_rankings"
  | "match_history"
  | "map_stats"
  | "player_stats"
  | "roster_events"
  | "game_meta_updates"
  | "manual_import"
  | "hltv_manual_ranking_import"
  | "parsed_demo_import";

export type SourceCapability =
  | "schedule"
  | "matches"
  | "teams"
  | "players"
  | "results"
  | "rosters"
  | "rankings"
  | "meta"
  | "detailed-stats"
  | "series"
  | "tournaments"
  | "parsed-demo"
  | "manual";

export type SourceJobStatus = "success" | "partial" | "failed" | "blocked" | "disabled";

export type SourceStatus = {
  source: SourceName;
  label: string;
  priority: number;
  enabled: boolean;
  configured: boolean;
  status: SourceJobStatus | "idle";
  capabilities: SourceCapability[];
  message: string;
  requiredEnv: string[];
  lastSyncedAt?: string | null;
  nextAllowedSyncAt?: string | null;
  rateLimitRemaining?: number | null;
  failureCount?: number;
  lastEndpoint?: string | null;
  lastMethod?: string | null;
  lastError?: string | null;
  lastRawSampleJson?: string | null;
  rawRecordsCount?: number;
  recordsFetched?: number;
  recordsCreated?: number;
  recordsUpdated?: number;
  recordsSkipped?: number;
  needsReviewCount?: number;
  endpointsAvailable?: string[];
  endpointsBlocked?: string[];
};

export type SourceRecord = {
  source: SourceName;
  externalId: string;
  entityType: string;
  entityId?: string | null;
  raw: unknown;
  fetchedAt: Date;
  sourceConfidence: number;
};

export type SourceSyncContext = {
  jobType: SourceJobType;
  since?: Date | null;
  cursor?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
  payload?: string;
};

export type SourceSyncResult = {
  source: SourceName;
  jobType: SourceJobType;
  status: SourceJobStatus;
  records: SourceRecord[];
  recordsFetched: number;
  errors: string[];
  notes?: string;
  cursor?: string | null;
  since?: Date | null;
  nextAllowedSyncAt?: Date | null;
  rateLimitRemaining?: number | null;
  recordsSkipped?: number;
  endpoint?: string | null;
  method?: string | null;
  lastError?: string | null;
  rawSample?: unknown;
  endpointsAvailable?: string[];
  endpointsBlocked?: string[];
};

export type SourceAdapter = {
  name: SourceName;
  label: string;
  priority: number;
  capabilities: SourceCapability[];
  requiredEnv: string[];
  status(): SourceStatus;
  sync(context: SourceSyncContext): Promise<SourceSyncResult>;
};

export const SOURCE_PRIORITY: Record<SourceName, number> = {
  "valve-rankings": 1,
  "cs-updates": 2,
  pandascore: 3,
  manual: 4,
  "parsed-demo": 5,
  "analyst-sample": 6,
  liquipedia: 7,
  grid: 8,
  faceit: 9,
  mock: 10,
  "official-future": 11
};

export function envFlag(name: string) {
  return process.env[name] === "true";
}

export function envPresent(name: string) {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

export function isoOrNull(value?: Date | string | null) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function disabledResult(source: SourceName, jobType: SourceJobType, reason: string): SourceSyncResult {
  return {
    source,
    jobType,
    status: "disabled",
    records: [],
    recordsFetched: 0,
    errors: [],
    notes: reason
  };
}

export function failedResult(source: SourceName, jobType: SourceJobType, reason: string): SourceSyncResult {
  return {
    source,
    jobType,
    status: "failed",
    records: [],
    recordsFetched: 0,
    errors: [reason],
    notes: reason
  };
}

export function sourceModeForSource(source: SourceName): SourceMode {
  if (source === "pandascore") return "pandascore_free";
  if (source === "valve-rankings") return "valve_rankings";
  if (source === "cs-updates") return "steam_updates";
  if (source === "manual") return "manual_real";
  if (source === "parsed-demo") return "parsed_demo";
  if (source === "analyst-sample") return "analyst_sample";
  if (source === "mock") return "demo";
  return "partial";
}

export function buildSourceStatus(params: {
  source: SourceName;
  label: string;
  priority: number;
  capabilities: SourceCapability[];
  requiredEnv: string[];
  enabled: boolean;
  configured: boolean;
  message: string;
  endpointsAvailable?: string[];
  endpointsBlocked?: string[];
}): SourceStatus {
  return {
    ...params,
    status: params.enabled ? "idle" : "disabled"
  };
}
