import { arrayFromPayload, fetchJsonDetailed, resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter, SourceJobType } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, failedResult, SOURCE_PRIORITY } from "./types";
import { redactString } from "../security/redaction";

const source = "pandascore" as const;
const baseUrl = "https://api.pandascore.co";
const capabilities = ["schedule", "matches", "teams", "players", "results", "series", "tournaments"] as const;
const requiredEnv = ["PANDASCORE_API_KEY", "ENABLE_PANDASCORE_SYNC"];
export const PANDASCORE_FREE_ENDPOINTS = [
  "/csgo/matches",
  "/csgo/matches/upcoming",
  "/csgo/matches/past",
  "/csgo/series/upcoming",
  "/csgo/tournaments",
  "/csgo/teams",
  "/csgo/players"
];
export const PANDASCORE_BLOCKED_ENDPOINTS = [
  "paid historical match telemetry",
  "post-match detailed player stats",
  "live round telemetry",
  "betting/odds endpoints"
];

function endpointFor(jobType: SourceJobType) {
  switch (jobType) {
    case "upcoming_matches":
      return "/csgo/matches/upcoming";
    case "live_matches":
      return "/csgo/matches";
    case "finished_matches":
      return "/csgo/matches/past";
    case "match_history":
      return "/csgo/matches";
    case "teams":
      return "/csgo/teams";
    case "players":
      return "/csgo/players";
    case "series":
      return "/csgo/series/upcoming";
    case "tournaments":
      return "/csgo/tournaments";
    default:
      return null;
  }
}

function entityTypeFor(jobType: SourceJobType) {
  if (jobType.includes("matches") || jobType === "match_history") return "match";
  if (jobType === "teams") return "team";
  if (jobType === "players") return "player";
  if (jobType === "series") return "series";
  if (jobType === "tournaments") return "tournament";
  return "pandascore_record";
}

export const pandascoreAdapter: SourceAdapter = {
  name: source,
  label: "PandaScore Free Fixtures Mode",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv,
  status() {
    const configured = envPresent("PANDASCORE_API_KEY");
    const enabled = envFlag("ENABLE_PANDASCORE_SYNC") && configured;
    return buildSourceStatus({
      source,
      label: "PandaScore Free Fixtures Mode",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv,
      enabled,
      configured,
      message: configured
        ? "Configured for Free Fixtures Mode: schedule, teams, players, tournaments and basic results only."
        : "Not configured: set PANDASCORE_API_KEY locally and ENABLE_PANDASCORE_SYNC=true.",
      endpointsAvailable: PANDASCORE_FREE_ENDPOINTS,
      endpointsBlocked: PANDASCORE_BLOCKED_ENDPOINTS
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    const endpoint = endpointFor(context.jobType);
    if (!endpoint) return failedResult(source, context.jobType, `PandaScore Free Fixtures Mode does not support job ${context.jobType}.`);

    try {
      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set("per_page", "50");
      if (context.since) url.searchParams.set("range[begin_at]", `${context.since.toISOString()},${new Date().toISOString()}`);
      const response = await fetchJsonDetailed(
        url.toString(),
        { headers: { Authorization: `Bearer ${process.env.PANDASCORE_API_KEY}` } },
        context.fetchImpl
      );
      const fetchedAt = context.now ?? new Date();
      const rawItems = arrayFromPayload(response.payload);
      const records = rawItems.map((raw) =>
        sourceRecordFromRaw({
          source,
          entityType: entityTypeFor(context.jobType),
          raw,
          fetchedAt,
          sourceConfidence: 0.78
        })
      );
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records,
        notes: "PandaScore Free Fixtures sync completed.",
        rateLimitRemaining: response.rateLimitRemaining,
        endpoint,
        method: "GET",
        rawSample: rawItems[0] ?? null,
        endpointsAvailable: PANDASCORE_FREE_ENDPOINTS,
        endpointsBlocked: PANDASCORE_BLOCKED_ENDPOINTS
      });
    } catch (error) {
      const message = redactString(error instanceof Error ? error.message : "PandaScore sync failed.");
      const blocked = /HTTP 403|paid|required|plan|blocked|forbidden/i.test(message);
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records: [],
        status: blocked ? "blocked" : "failed",
        errors: [message],
        notes: blocked ? "PandaScore endpoint blocked by current plan; falling back to free/manual/mock sources." : "PandaScore Free Fixtures sync failed.",
        endpoint,
        method: "GET",
        lastError: message,
        endpointsAvailable: PANDASCORE_FREE_ENDPOINTS,
        endpointsBlocked: PANDASCORE_BLOCKED_ENDPOINTS
      });
    }
  }
};
