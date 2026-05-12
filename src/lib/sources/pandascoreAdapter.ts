import type { SourceAdapter } from "./types";
import { realImportsEnabled } from "./types";

export const pandascoreAdapter: SourceAdapter = {
  name: "pandascore",
  status() {
    const configured = Boolean(process.env.PANDASCORE_API_KEY);
    return {
      source: "pandascore",
      enabled: realImportsEnabled() && configured,
      configured,
      message: configured ? "PandaScore key present, enable real imports to use it." : "Not configured: PANDASCORE_API_KEY is empty."
    };
  },
  async fetchUpcomingMatches() {
    if (!realImportsEnabled() || !process.env.PANDASCORE_API_KEY) {
      throw new Error("PandaScore adapter not configured");
    }
    return { message: "PandaScore integration placeholder.", records: [] };
  }
};
