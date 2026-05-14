import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, failedResult, SOURCE_PRIORITY } from "./types";

const source = "grid" as const;
const capabilities = ["matches", "players", "results", "detailed-stats"] as const;
const requiredEnv = ["GRID_API_KEY", "ENABLE_GRID_SYNC"];

export const gridAdapter: SourceAdapter = {
  name: source,
  label: "GRID Open Access",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv,
  status() {
    const configured = envPresent("GRID_API_KEY");
    const enabled = envFlag("ENABLE_GRID_SYNC") && configured;
    return buildSourceStatus({
      source,
      label: "GRID Open Access",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv,
      enabled,
      configured,
      message: configured ? "GRID key is present. Open Access endpoint mapping is access-dependent; expected for round/player/economy telemetry." : "Not configured: set GRID_API_KEY and ENABLE_GRID_SYNC=true.",
      endpointsAvailable: ["round data", "player data", "economy events", "map stats", "live/historical telemetry"]
    });
  },
  async sync(context) {
    const status = this.status();
    if (!status.enabled) return disabledResult(source, context.jobType, status.message);
    if (!["match_history", "map_stats", "player_stats", "finished_matches", "live_matches"].includes(context.jobType)) {
      return failedResult(source, context.jobType, `GRID is reserved for detailed stats; job ${context.jobType} is not routed to GRID.`);
    }
    return resultFromRecords({
      source,
      jobType: context.jobType,
      records: [],
      status: "partial",
      notes: "GRID adapter is configured but MVP 0.4.6 keeps endpoint-specific detailed ingestion behind confirmed capability/access mapping."
    });
  }
};
