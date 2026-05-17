import { runEsportIsFetcher } from "./data-fetchers/fetch-esportis";
import { runGridFetcher } from "./data-fetchers/fetch-grid";
import { runLiquipediaRosterFetcher } from "./data-fetchers/fetch-liquipedia-rosters";
import { runValveRankingsFetcher } from "./data-fetchers/fetch-valve-rankings";
import { isDirectRun, listArg, parseCliArgs, printReport, stringArg, type FetcherReport } from "./data-fetchers/utils";

export type RunAllFetchersOptions = {
  force?: boolean;
  dryRun?: boolean;
  matchId?: string;
  teamNames?: string[];
};

export async function runAllFetchers(options: RunAllFetchersOptions = {}) {
  const reports: FetcherReport[] = [];
  reports.push(await runEsportIsFetcher(options));
  reports.push(await runGridFetcher(options));
  reports.push(await runLiquipediaRosterFetcher(options));
  reports.push(await runValveRankingsFetcher(options));
  return {
    status: reports.some((report) => report.status === "failed") ? "partial" : "completed",
    reports,
    createdOrInsertedRows: reports.reduce((sum, report) => sum + report.writes.reduce((inner, write) => inner + write.rowsInserted, 0), 0),
    skippedRows: reports.reduce((sum, report) => sum + report.writes.reduce((inner, write) => inner + write.rowsSkipped, 0), 0)
  };
}

export async function runAllFetchersCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const result = await runAllFetchers({
    force: Boolean(args.force),
    dryRun: Boolean(args["dry-run"]),
    matchId: stringArg(args, "matchId"),
    teamNames: listArg(args, "teams")
  });
  for (const report of result.reports) printReport(report);
  console.log(`DAL fetch-all ${result.status}: inserted=${result.createdOrInsertedRows}, skipped=${result.skippedRows}`);
  if (result.reports.some((report) => report.status === "failed")) process.exitCode = 1;
}

if (isDirectRun(import.meta.url)) {
  runAllFetchersCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
