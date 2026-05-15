import type { SourceHealth } from "@prisma/client";
import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter, SourceJobType } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, SOURCE_PRIORITY } from "./types";

const source = "liquipedia" as const;
const capabilities = ["rosters", "teams", "players", "results", "tournaments"] as const;
const requiredEnv = ["LIQUIPEDIA_API_KEY", "ENABLE_LIQUIPEDIA_SYNC"];
const hourlyLimit = 60;
export const liquipediaMediaWikiEndpoint = "https://liquipedia.net/counterstrike/api.php";
export const liquipediaMediaWikiUserAgent = "CS2MatchPredictionLab/0.4 (local research analytics; contact: saldinkostya97@gmail.com)";

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
    notes: "Blocked by LiquipediaDB 60 requests/hour guard.",
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
      message: configured
        ? "Configured for LiquipediaDB roster, tournament and historical context sync with 60 requests/hour guard."
        : "LiquipediaDB not configured. MediaWiki API can be used conservatively via api.php only: 1 request / 2 seconds, action=parse 1 / 30 seconds, custom User-Agent, no HTML scraping.",
      endpointsAvailable: [
        `${liquipediaMediaWikiEndpoint} (MediaWiki API, no key, conservative/manual use)`,
        "LiquipediaDB rosters/tournaments/roster changes/event participants when access exists"
      ],
      endpointsBlocked: ["Generated HTML pages are not allowed for automated access"]
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
      notes: "LiquipediaDB access is configured, but MVP 0.7.0 keeps query-specific ingestion conservative to avoid abusive access.",
      rateLimitRemaining: hourlyLimit - 1
    });
  }
};

