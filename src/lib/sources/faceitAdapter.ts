import { fetchJsonDetailed, resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter, SourceRecord } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, failedResult, SOURCE_PRIORITY } from "./types";

const source = "faceit" as const;
const baseUrl = "https://open.faceit.com/data/v4";
const gameId = "cs2";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.FACEIT_API_KEY ?? ""}`,
    Accept: "application/json",
    "User-Agent": "CS2MatchPredictionLab/0.6.1 local research analytics"
  };
}

export const faceitAdapter: SourceAdapter = {
  name: source,
  label: "FACEIT API Optional",
  priority: SOURCE_PRIORITY[source],
  capabilities: ["matches", "players", "teams", "tournaments", "detailed-stats"],
  requiredEnv: ["FACEIT_API_KEY", "ENABLE_FACEIT_SYNC"],
  status() {
    const configured = envPresent("FACEIT_API_KEY");
    const enabled = envFlag("ENABLE_FACEIT_SYNC") && configured;
    return buildSourceStatus({
      source,
      label: "FACEIT API Optional",
      priority: SOURCE_PRIORITY[source],
      capabilities: ["matches", "players", "teams", "tournaments", "detailed-stats"],
      requiredEnv: ["FACEIT_API_KEY", "ENABLE_FACEIT_SYNC"],
      enabled,
      configured,
      message: enabled
        ? "FACEIT optional Data API is configured for documented v4 routes. Selected-match enrichment uses explicit known IDs only."
        : "Disabled: FACEIT is optional and not a full Tier-1 pro CS2 source.",
      endpointsAvailable: [
        "GET /championships?game=cs2&type=upcoming",
        "GET /championships/{championship_id}",
        "GET /championships/{championship_id}/matches",
        "GET /matches/{match_id}",
        "GET /matches/{match_id}/stats",
        "GET /teams/{team_id}",
        "GET /players/{player_id}"
      ]
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    try {
      const fetchedAt = context.now ?? new Date();
      const records: SourceRecord[] = [];
      if (context.jobType === "tournaments" || context.jobType === "match_history") {
        const endpoint = `${baseUrl}/championships?game=${gameId}&type=upcoming&limit=10`;
        const response = await fetchJsonDetailed(endpoint, { headers: authHeaders() }, context.fetchImpl);
        const items = Array.isArray((response.payload as { items?: unknown[] }).items) ? (response.payload as { items: unknown[] }).items : [];
        for (const item of items) {
          const raw = item as { championship_id?: string; id?: string; name?: string };
          records.push(sourceRecordFromRaw({
            source,
            entityType: "faceit_competition",
            externalId: String(raw.championship_id ?? raw.id ?? raw.name ?? `faceit_competition_${records.length}`),
            raw: item,
            fetchedAt,
            sourceConfidence: 0.55
          }));
        }
        return resultFromRecords({ source, jobType: context.jobType, records, notes: "FACEIT optional championships fetched from Data API v4.", endpoint, method: "GET", rawSample: items[0] ?? null });
      }
      return resultFromRecords({
        source,
        jobType: context.jobType,
        records: [],
        status: "partial",
        notes: `FACEIT job ${context.jobType} requires explicit known IDs and selected-match context; no search or broad sync was run.`
      });
    } catch (error) {
      return failedResult(source, context.jobType, error instanceof Error ? error.message : "FACEIT optional sync failed.");
    }
  }
};

