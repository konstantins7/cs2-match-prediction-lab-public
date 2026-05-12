import type { SourceAdapter } from "./types";
import { realImportsEnabled } from "./types";

export const liquipediaAdapter: SourceAdapter = {
  name: "liquipedia",
  status() {
    const configured = Boolean(process.env.LIQUIPEDIA_API_KEY);
    return {
      source: "liquipedia",
      enabled: realImportsEnabled() && configured,
      configured,
      message: configured ? "Liquipedia key present, enable real imports to use it." : "Not configured: LIQUIPEDIA_API_KEY is empty."
    };
  },
  async fetchUpcomingMatches() {
    if (!realImportsEnabled() || !process.env.LIQUIPEDIA_API_KEY) {
      throw new Error("Liquipedia adapter not configured");
    }
    return { message: "Liquipedia integration placeholder.", records: [] };
  }
};
