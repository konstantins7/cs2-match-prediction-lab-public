import type { SourceAdapter } from "./types";

export const manualImportAdapter: SourceAdapter = {
  name: "manual",
  status() {
    return {
      source: "manual",
      enabled: true,
      configured: true,
      message: "Manual JSON/CSV import layer is reserved for local files in a future task."
    };
  },
  async fetchUpcomingMatches() {
    return { message: "Manual import requires an explicit local JSON/CSV file.", records: [] };
  }
};
