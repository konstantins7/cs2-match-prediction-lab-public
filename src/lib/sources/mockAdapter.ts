import type { SourceAdapter } from "./types";

export const mockAdapter: SourceAdapter = {
  name: "mock",
  status() {
    return {
      source: "mock",
      enabled: process.env.ENABLE_MOCK_DATA !== "false",
      configured: true,
      message: "Mock seed data is available for MVP 0.2."
    };
  },
  async fetchUpcomingMatches() {
    return { message: "Mock data is loaded through Prisma seed.", records: [] };
  }
};
