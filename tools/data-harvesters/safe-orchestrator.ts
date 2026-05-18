import { runGridFetcher } from "../data-fetchers/fetch-grid";
import { runLiquipediaRosterFetcher } from "../data-fetchers/fetch-liquipedia-rosters";
import { runPandaScoreEnhancedFetcher } from "../data-fetchers/fetch-pandascore-enhanced";
import { runValveRankingsFetcher } from "../data-fetchers/fetch-valve-rankings";
import { getISODate, type FetcherReport, type FetcherRunOptions } from "../data-fetchers/utils";

export type SafeHarvestMode = "fast" | "deeper" | "max";

export type SafeHarvestOptions = FetcherRunOptions & {
  matchId: string;
  teamNames: string[];
  matchDate?: Date;
  mode?: SafeHarvestMode;
};

export type SafeHarvestResult = {
  status: "success" | "partial" | "skipped" | "failed";
  matchId: string;
  teamNames: string[];
  mode: SafeHarvestMode;
  startedAt: string;
  reports: FetcherReport[];
  recordsCreated: number;
  recordsUpdated: number;
  warnings: string[];
  errors: string[];
};

export async function safeHarvest(options: SafeHarvestOptions): Promise<SafeHarvestResult> {
  const startedAt = getISODate(options.now);
  const mode = options.mode ?? "fast";
  const common = {
    ...options,
    now: options.now,
    force: true
  };
  const reports: FetcherReport[] = [];

  reports.push(await runLiquipediaRosterFetcher(common));
  reports.push(await runPandaScoreEnhancedFetcher(common));
  reports.push(await runGridFetcher({ ...common, targetDate: options.matchDate }));
  if (mode !== "fast") {
    reports.push(await runValveRankingsFetcher(common));
  }

  const recordsCreated = reports.reduce((sum, report) => sum + report.writes.reduce((inner, write) => inner + write.rowsInserted, 0), 0);
  const recordsUpdated = 0;
  const warnings = reports.flatMap((report) => report.warnings.map((warning) => `${report.source}: ${warning}`));
  const errors = reports.flatMap((report) => report.errors.map((error) => `${report.source}: ${error}`));
  const enabled = reports.filter((report) => report.status !== "skipped");

  return {
    status: errors.length
      ? (recordsCreated ? "partial" : "failed")
      : enabled.length
        ? (warnings.length || recordsCreated + recordsUpdated === 0 ? "partial" : "success")
        : "skipped",
    matchId: options.matchId,
    teamNames: options.teamNames,
    mode,
    startedAt,
    reports,
    recordsCreated,
    recordsUpdated,
    warnings,
    errors
  };
}

export function summarizeSafeHarvest(result: SafeHarvestResult) {
  return {
    status: result.status,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    reports: result.reports.map((report) => ({
      source: report.source,
      status: report.status,
      fetched: report.fetched,
      writes: report.writes.map((write) => ({
        fileName: write.fileName,
        rowsInserted: write.rowsInserted,
        rowsSkipped: write.rowsSkipped,
        dryRun: write.dryRun
      })),
      warnings: report.warnings,
      errors: report.errors
    }))
  };
}
