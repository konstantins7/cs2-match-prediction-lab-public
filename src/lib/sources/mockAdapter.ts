import { resultFromRecords } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, envFlag, SOURCE_PRIORITY } from "./types";

const source = "mock" as const;
const capabilities = ["schedule", "matches", "teams", "players", "results", "rosters", "rankings", "meta", "detailed-stats"] as const;

export const mockAdapter: SourceAdapter = {
  name: source,
  label: "Mock seed",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv: ["ENABLE_MOCK_DATA"],
  status() {
    const enabled = process.env.ENABLE_MOCK_DATA !== "false";
    return buildSourceStatus({
      source,
      label: "Mock seed",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv: ["ENABLE_MOCK_DATA"],
      enabled,
      configured: true,
      message: enabled ? "Mock seed data is available for local demo fallback." : "Mock data disabled by ENABLE_MOCK_DATA=false."
    });
  },
  async sync(context) {
    return resultFromRecords({
      source,
      jobType: context.jobType,
      records: [],
      status: envFlag("ENABLE_MOCK_DATA") || process.env.ENABLE_MOCK_DATA !== "false" ? "success" : "disabled",
      notes: "Mock data is loaded through pnpm prisma db seed; no page-load sync is performed."
    });
  }
};
