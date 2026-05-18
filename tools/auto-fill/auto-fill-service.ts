import { readdir } from "node:fs/promises";
import { runGridFetcher } from "../data-fetchers/fetch-grid";
import { runLiquipediaRosterFetcher } from "../data-fetchers/fetch-liquipedia-rosters";
import { runPandaScoreEnhancedFetcher } from "../data-fetchers/fetch-pandascore-enhanced";
import { getISODate, privateInboxPath, type FetcherReport, type FetcherRunOptions } from "../data-fetchers/utils";
import { importCsstatsCsv, type CsstatsImportResult } from "./csstats-importer";

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
  runPandaScore?: typeof runPandaScoreEnhancedFetcher;
  runGrid?: typeof runGridFetcher;
  runLiquipedia?: typeof runLiquipediaRosterFetcher;
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
  const inboxPath = privateInboxPath(options.env, options.inboxPath);
  const filesBefore = await listPrivateInboxFiles(inboxPath);
  const writes: AutoFillWrite[] = [];
  const sourceReports: AutoFillResult["sourceReports"] = [];

  for (const request of buildCsstatsRequests(options, inboxPath)) {
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
    await (options.runGrid ?? runGridFetcher)({ ...fetcherOptions, targetDate: options.now }),
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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Auto-fill source failed.";
}
