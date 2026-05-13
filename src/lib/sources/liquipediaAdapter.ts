import type { SourceHealth } from "@prisma/client";
import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter, SourceJobType } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, SOURCE_PRIORITY } from "./types";

const source = "liquipedia" as const;
const capabilities = ["rosters", "teams", "players", "results"] as const;
const requiredEnv = ["LIQUIPEDIA_API_KEY", "ENABLE_LIQUIPEDIA_SYNC"];
const hourlyLimit = 60;

export function isLiquipediaBlockedByRateLimit(health: Pick<SourceHealth, "nextAllowedSyncAt" | "rateLimitRemaining"> | null, now = new Date()) {
  if (!health?.nextAllowedSyncAt) return false;
  return new Date(health.nextAllowedSyncAt).getTime() > now.getTime();
}

export function liquipediaRateLimitResult(jobType: SourceJobType, now = new Date()) {
  const nextAllowedSyncAt = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    source,
    jobType,
    status: "blocked" as const,
    records: [],
    recordsFetched: 0,
    errors: ["Liquipedia rate limit reached; retry after nextAllowedSyncAt."],
    notes: "Blocked by MVP 0.3 Liquipedia 60 requests/hour guard.",
    nextAllowedSyncAt,
    rateLimitRemaining: 0
  };
}

export const liquipediaAdapter: SourceAdapter = {
  name: source,
  label: "Liquipedia API",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv,
  status() {
    const configured = envPresent("LIQUIPEDIA_API_KEY");
    const enabled = envFlag("ENABLE_LIQUIPEDIA_SYNC") && configured;
    return buildSourceStatus({
      source,
      label: "Liquipedia API",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv,
      enabled,
      configured,
      message: configured ? "Configured for roster, tournament and historical context sync with 60 requests/hour guard." : "Not configured: set LIQUIPEDIA_API_KEY and ENABLE_LIQUIPEDIA_SYNC=true."
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    if (!["rosters", "teams", "players", "roster_events", "match_history", "finished_matches"].includes(context.jobType)) {
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records: [],
        status: "partial",
        notes: `Liquipedia job ${context.jobType} has no MVP route yet; no request made to respect rate limits.`,
        rateLimitRemaining: hourlyLimit
      });
    }
    return resultFromRecords({
      source,
      jobType: context.jobType,
      records: [],
      status: "partial",
      notes: "Liquipedia API access is configured, but MVP 0.3 keeps query-specific ingestion conservative to avoid abusive access.",
      rateLimitRemaining: hourlyLimit - 1
    });
  }
};
