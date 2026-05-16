import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, disabledResult, envFlag, envPresent, failedResult, SOURCE_PRIORITY } from "./types";
import { GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS } from "../gridOpenAccess";

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
      message: configured
        ? "GRID Open Access key configured. Central Data / Series State are available only through explicit probe/sync actions; unsupported products are not called."
        : "Not configured: set GRID_API_KEY and ENABLE_GRID_SYNC=true.",
      endpointsAvailable: configured ? ["Central Data API", "Series State API requires known series id"] : [],
      endpointsBlocked: GRID_UNSUPPORTED_OPEN_ACCESS_PRODUCTS.map((name) => `${name} unavailable on Open Access`)
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
      notes: "Use explicit GRID Open Access actions: capability probe, Central Data sync, or selected-match Series State enrichment."
    });
  }
};

