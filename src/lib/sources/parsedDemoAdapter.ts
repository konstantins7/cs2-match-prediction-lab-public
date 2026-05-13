import { resultFromRecords, sourceRecordFromRaw } from "./adapterUtils";
import type { SourceAdapter } from "./types";
import { buildSourceStatus, SOURCE_PRIORITY } from "./types";

const source = "parsed-demo" as const;
const capabilities = ["parsed-demo", "detailed-stats", "players", "teams", "results"] as const;

export const parsedDemoAdapter: SourceAdapter = {
  name: source,
  label: "Parsed Demo JSON Import",
  priority: SOURCE_PRIORITY[source],
  capabilities: [...capabilities],
  requiredEnv: [],
  status() {
    return buildSourceStatus({
      source,
      label: "Parsed Demo JSON Import",
      priority: SOURCE_PRIORITY[source],
      capabilities: [...capabilities],
      requiredEnv: [],
      enabled: true,
      configured: true,
      message: "Local parsed-demo JSON import for deeper player/map/form snapshots."
    });
  },
  async sync(context) {
    try {
      const fetchedAt = context.now ?? new Date();
      if (!context.payload?.trim()) {
        return resultFromRecords({
          source,
          jobType: "parsed_demo_import",
          records: [],
          status: "partial",
          notes: "No parsed demo payload supplied."
        });
      }
      const parsed = JSON.parse(context.payload) as unknown;
      const records = [
        sourceRecordFromRaw({
          source,
          entityType: "parsed_demo_stats",
          raw: parsed,
          fetchedAt,
          externalId: `parsed-demo-${fetchedAt.getTime()}`,
          sourceConfidence: 0.82
        })
      ];
      return resultFromRecords({
        source,
        jobType: "parsed_demo_import",
        records,
        notes: "Parsed demo JSON accepted for snapshot import.",
        method: "LOCAL",
        endpoint: "admin-import://parsed-demo-json",
        rawSample: parsed
      });
    } catch (error) {
      return resultFromRecords({
        source,
        jobType: "parsed_demo_import",
        records: [],
        status: "failed",
        errors: [error instanceof Error ? error.message : "Parsed demo import failed."],
        notes: "Parsed demo import failed.",
        method: "LOCAL",
        endpoint: "admin-import://parsed-demo-json"
      });
    }
  }
};
