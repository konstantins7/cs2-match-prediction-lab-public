import type { SourceAdapter } from "./types";
import { realImportsEnabled } from "./types";

export const gridAdapter: SourceAdapter = {
  name: "grid",
  status() {
    const configured = Boolean(process.env.GRID_API_KEY);
    return {
      source: "grid",
      enabled: realImportsEnabled() && configured,
      configured,
      message: configured ? "GRID key present, enable real imports to use it." : "Not configured: GRID_API_KEY is empty."
    };
  },
  async fetchUpcomingMatches() {
    if (!realImportsEnabled() || !process.env.GRID_API_KEY) {
      throw new Error("GRID adapter not configured");
    }
    return { message: "GRID integration placeholder.", records: [] };
  }
};
