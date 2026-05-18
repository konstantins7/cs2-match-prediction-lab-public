import { readdir } from "node:fs/promises";
import { runGridEnhancedFetcher } from "../data-fetchers/fetch-grid-enhanced";
import { runLiquipediaRosterFetcher } from "../data-fetchers/fetch-liquipedia-rosters";
import { runPandaScoreEnhancedFetcher } from "../data-fetchers/fetch-pandascore-enhanced";
import { runSteamFetcher } from "../data-fetchers/fetch-steam";
import { envFlag, getISODate, privateInboxPath, type FetcherReport, type FetcherRunOptions } from "../data-fetchers/utils";
import { importCsstatsCsv, type CsstatsImportResult } from "./csstats-importer";
import { buildCsstatsExportUrl, resolveCsstatsTeamId } from "./csstats-resolver";

export type AutoFillMode = "fast" | "deeper" | "max";

export type AutoFillOptions = FetcherRunOptions & {
  matchId: string;
  teamNames: [string, string];
  mode: AutoFillMode;
  csstatsMapCsvUrl?: string;
  csstatsPlayerCsvUrl?: string;
  csstatsMapCsvFile?: string;
  csstatsPlayerCsvFile?: string;
  teamACsstatsMapUrl?: string;
  teamACsstatsPlayerUrl?: string;
  teamBCsstatsMapUrl?: string;
  teamBCsstatsPlayerUrl?: string;
  teamACsstatsMapFile?: string;
  teamACsstatsPlayerFile?: string;
  teamBCsstatsMapFile?: string;
  teamBCsstatsPlayerFile?: string;
  autoLookupCsstats?: boolean;
  csstatsCachePath?: string;
  csstatsRateLimitMs?: number;
  tournament?: string;
  targetDate?: Date;
  runPandaScore?: typeof runPandaScoreEnhancedFetcher;
  runGrid?: typeof runGridEnhancedFetcher;
  runLiquipedia?: typeof runLiquipediaRosterFetcher;
  runSteam?: typeof runSteamFetcher;
  resolveCsstats?: typeof resolveCsstatsTeamId;
};

export type AutoFillWrite = {
  file: string;
  source: string;
  rows: number;
};

export type AutoFillResult = {
  dryRun: boolean;
  filesBefore: string[];
  writes: AutoFillWrite[];
  filesAfter: string[];
  stillMissing: string[];
  templateCommands: string[];
  nextAction: string;
  sourceReports: Array<{ source: string; status: string; message: string }>;
};

const requiredFiles = ["map_stats.csv", "player_stats.csv", "veto_history.csv"];
const watchedFiles = ["roster.csv", ...requiredFiles, "parsed_demo_export.json"];

export async function runAutoFill(options: AutoFillOptions): Promise<AutoFillResult> {
  validateOptions(options);
  const env = options.env ?? process.env;
  const inboxPath = privateInboxPath(options.env, options.inboxPath);
  const filesBefore = await listPrivateInboxFiles(inboxPath);
  const missingBefore = requiredFiles.filter((file) => !filesBefore.includes(file));
  const writes: AutoFillWrite[] = [];
  const sourceReports: AutoFillResult["sourceReports"] = [];

  const directRequests = buildCsstatsRequests(options, inboxPath);
  for (const request of directRequests) {
    try {
      const result = await importCsstatsCsv({
        ...request,
        matchId: options.matchId,
        sourceName: "CSStats user CSV",
        collectedAt: getISODate(options.now),
        period: "csstats_user_csv",
        confidence: 80,
        inboxPath,
        dryRun: options.dryRun,
        fetchImpl: options.fetchImpl
      });
      writes.push(writeFromCsstats(result, "CSStats user CSV"));
      sourceReports.push({ source: `csstats-${request.type}`, status: "success", message: `${result.file}: ${result.rows} row(s).` });
    } catch (error) {
      sourceReports.push({ source: `csstats-${request.type}`, status: "failed", message: errorMessage(error) });
    }
  }

  if (shouldRunCsstatsAutoLookup(options, env)) {
    const autoRequests = await buildAutoCsstatsRequests(options, inboxPath, missingBefore, directRequests);
    for (const request of autoRequests) {
      try {
        const result = await importCsstatsCsv({
          ...request,
          matchId: options.matchId,
          sourceName: "CSStats auto CSV",
          collectedAt: getISODate(options.now),
          period: "csstats_auto_lookup",
          confidence: 78,
          inboxPath,
          dryRun: options.dryRun,
          fetchImpl: options.fetchImpl
        });
        writes.push(writeFromCsstats(result, "CSStats auto CSV"));
        sourceReports.push({ source: `csstats-auto-${request.type}`, status: "success", message: `${request.teamName}: ${result.file}: ${result.rows} row(s).` });
      } catch (error) {
        sourceReports.push({ source: `csstats-auto-${request.type}`, status: "failed", message: `${request.teamName}: ${errorMessage(error)}` });
      }
    }
    if (!autoRequests.length) {
      sourceReports.push({ source: "csstats-auto-lookup", status: "missing", message: "No CSStats team IDs resolved or no missing CSStats-backed files." });
    }
  } else {
    sourceReports.push({ source: "csstats-auto-lookup", status: "skipped", message: "ENABLE_CSSTATS_AUTO_LOOKUP=false. Automatic CSStats team ID lookup skipped." });
  }

  const fetcherOptions = {
    matchId: options.matchId,
    teamNames: options.teamNames,
    dryRun: options.dryRun,
    inboxPath,
    env: options.env,
    fetchImpl: options.fetchImpl,
    now: options.now
  };
  const reports = [
    await (options.runPandaScore ?? runPandaScoreEnhancedFetcher)(fetcherOptions),
    await (options.runGrid ?? runGridEnhancedFetcher)({ ...fetcherOptions, targetDate: options.targetDate ?? options.now, tournament: options.tournament }),
    await (options.runSteam ?? runSteamFetcher)({ ...fetcherOptions, explicitPlayers: [] }),
    ...(options.mode === "fast"
      ? []
      : [await (options.runLiquipedia ?? runLiquipediaRosterFetcher)({ ...fetcherOptions, delayMs: 2000 })])
  ];
  for (const report of reports) {
    writes.push(...writesFromReport(report));
    sourceReports.push(sourceReport(report));
  }

  const filesAfter = await listPrivateInboxFiles(inboxPath);
  const effectiveFiles = options.dryRun ? filesBefore : filesAfter;
  const stillMissing = requiredFiles.filter((file) => !effectiveFiles.includes(file));
  return {
    dryRun: Boolean(options.dryRun),
    filesBefore,
    writes,
    filesAfter,
    stillMissing,
    templateCommands: buildTemplateCommands(options.matchId, options.teamNames, stillMissing),
    nextAction: stillMissing.length
      ? `Still missing ${stillMissing.join(", ")}. Use the generated template commands or provide CSStats CSV URL/file inputs.`
      : "Core private-inbox files are present. Validate in /admin/imports, apply trusted real data, then run data:pipeline.",
    sourceReports
  };
}

async function listPrivateInboxFiles(inboxPath: string) {
  try {
    const names = await readdir(inboxPath);
    return watchedFiles.filter((fileName) => names.includes(fileName));
  } catch {
    return [];
  }
}

function buildCsstatsRequests(options: AutoFillOptions, inboxPath: string) {
  const [teamA, teamB] = options.teamNames;
  const direct = [
    { teamName: teamA, type: "map_stats" as const, url: options.teamACsstatsMapUrl ?? options.csstatsMapCsvUrl, filePath: options.teamACsstatsMapFile ?? options.csstatsMapCsvFile, inboxPath },
    { teamName: teamA, type: "player_stats" as const, url: options.teamACsstatsPlayerUrl ?? options.csstatsPlayerCsvUrl, filePath: options.teamACsstatsPlayerFile ?? options.csstatsPlayerCsvFile, inboxPath },
    { teamName: teamB, type: "map_stats" as const, url: options.teamBCsstatsMapUrl, filePath: options.teamBCsstatsMapFile, inboxPath },
    { teamName: teamB, type: "player_stats" as const, url: options.teamBCsstatsPlayerUrl, filePath: options.teamBCsstatsPlayerFile, inboxPath }
  ];
  return direct.filter((request) => request.url || request.filePath);
}

async function buildAutoCsstatsRequests(
  options: AutoFillOptions,
  inboxPath: string,
  missingBefore: string[],
  directRequests: ReturnType<typeof buildCsstatsRequests>
) {
  const requests: Array<{ teamName: string; type: "map_stats" | "player_stats"; url: string; inboxPath: string }> = [];
  const directKeys = new Set(directRequests.map((request) => `${request.teamName}:${request.type}`));
  const types: Array<"map_stats" | "player_stats"> = [];
  if (missingBefore.includes("map_stats.csv")) types.push("map_stats");
  if (missingBefore.includes("player_stats.csv")) types.push("player_stats");
  if (!types.length) return requests;

  for (const teamName of options.teamNames) {
    const teamId = await (options.resolveCsstats ?? resolveCsstatsTeamId)({
      teamName,
      enabled: true,
      dryRun: options.dryRun,
      cachePath: options.csstatsCachePath,
      rateLimitMs: options.csstatsRateLimitMs,
      fetchImpl: options.fetchImpl
    });
    if (!teamId) continue;
    for (const type of types) {
      if (!directKeys.has(`${teamName}:${type}`)) {
        requests.push({ teamName, type, url: buildCsstatsExportUrl(teamId, type), inboxPath });
      }
    }
  }
  return requests;
}

function buildTemplateCommands(matchId: string, teamNames: [string, string], missing: string[]) {
  const commands: string[] = [];
  for (const team of teamNames) {
    if (missing.includes("map_stats.csv")) commands.push(`npm run template:map-stats -- --matchId ${matchId} --team "${team}" --out ./map_stats_${slug(team)}.csv`);
    if (missing.includes("player_stats.csv")) commands.push(`npm run template:player-stats -- --matchId ${matchId} --team "${team}" --out ./player_stats_${slug(team)}.csv`);
    if (missing.includes("veto_history.csv")) commands.push(`npm run template:veto-history -- --matchId ${matchId} --team "${team}" --out ./veto_history_${slug(team)}.csv`);
  }
  return commands;
}

function writesFromReport(report: FetcherReport): AutoFillWrite[] {
  return report.writes.map((write) => ({ file: write.fileName, source: report.source, rows: write.rowsInserted }));
}

function writeFromCsstats(result: CsstatsImportResult, source: string): AutoFillWrite {
  return { file: result.file, source, rows: result.rows };
}

function sourceReport(report: FetcherReport) {
  const warnings = report.warnings.join("; ");
  const errors = report.errors.join("; ");
  return {
    source: report.source,
    status: report.status,
    message: errors || warnings || `${report.writes.length} write target(s).`
  };
}

function validateOptions(options: AutoFillOptions) {
  if (!options.matchId.trim()) throw new Error("matchId is required.");
  if (options.teamNames.length !== 2 || options.teamNames.some((team) => !team.trim())) throw new Error("teamNames must contain exactly two teams.");
}

function shouldRunCsstatsAutoLookup(options: AutoFillOptions, env: Record<string, string | undefined>) {
  return options.autoLookupCsstats ?? envFlag(env, "ENABLE_CSSTATS_AUTO_LOOKUP", false);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Auto-fill source failed.";
}
