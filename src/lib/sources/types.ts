export type SourceName = "mock" | "pandascore" | "grid" | "liquipedia" | "manual" | "official-future";

export type SourceStatus = {
  source: SourceName;
  enabled: boolean;
  configured: boolean;
  message: string;
};

export type SourceAdapter = {
  name: SourceName;
  status(): SourceStatus;
  fetchUpcomingMatches(): Promise<{ message: string; records: unknown[] }>;
};

export function realImportsEnabled() {
  return process.env.ENABLE_REAL_IMPORTS === "true";
}
