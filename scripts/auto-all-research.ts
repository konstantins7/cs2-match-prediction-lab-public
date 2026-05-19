import path from "node:path";
import { pathToFileURL } from "node:url";
import { runAutoFill, type AutoFillMode, type AutoFillResult, type AutoFillWrite } from "../tools/auto-fill";
import { envFlag, privateInboxPath } from "../tools/data-fetchers/utils";
import {
  fetchCsstatsDemo,
  runBo3Cs2ApiFetcher,
  runEsportisResearchFetcher,
  fetchMultiSourceData,
  type MultiSourceResult,
  fetchHltvPlayerStats,
  fetchHltvTeamMapStats,
  parseHltvMatchPage,
  processResearchDemoBatch,
  resolveHltvMatchId
} from "../tools/research";

type CliArgs = Record<string, string | boolean>;

export type ResearchAutoAllResult = {
  safe: AutoFillResult;
  researchEnabled: boolean;
  dryRun: boolean;
  writes: AutoFillWrite[];
  sourceReports: Array<{ source: string; status: string; message: string }>;
  multiSourceResults: MultiSourceResult[];
  nextAction: string;
};

export async function runAutoAllResearchCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runAutoAllResearch({
    matchId: requiredArg(args, "matchId"),
    teamA: requiredArg(args, "teamA"),
    teamB: requiredArg(args, "teamB"),
    mode: modeArg(stringArg(args, "mode")),
    dryRun: Boolean(args["dry-run"]),
    hltvMatchId: stringArg(args, "hltv-match-id"),
    teamAHltvId: stringArg(args, "teamA-hltv-id"),
    teamBHltvId: stringArg(args, "teamB-hltv-id"),
    teamACsstatsId: stringArg(args, "teamA-csstats-id"),
    teamBCsstatsId: stringArg(args, "teamB-csstats-id"),
    includeH2h: Boolean(args["include-h2h"])
  });
  console.log(JSON.stringify(result, null, 2));
}

export async function runAutoAllResearch(options: {
  matchId: string;
  teamA: string;
  teamB: string;
  mode: AutoFillMode;
  dryRun?: boolean;
  hltvMatchId?: string;
  teamAHltvId?: string;
  teamBHltvId?: string;
  teamACsstatsId?: string;
  teamBCsstatsId?: string;
  includeH2h?: boolean;
}): Promise<ResearchAutoAllResult> {
  const safe = await runAutoFill({
    matchId: options.matchId,
    teamNames: [options.teamA, options.teamB],
    mode: options.mode,
    dryRun: options.dryRun,
    autoLookupCsstats: envFlag(process.env, "ENABLE_CSSTATS_AUTO_LOOKUP", false)
  });
  const researchEnabled = envFlag(process.env, "ENABLE_RESEARCH_SOURCES") && envFlag(process.env, "ENABLE_HLTV_AUTOMATION");
  const writes: AutoFillWrite[] = [];
  const sourceReports: ResearchAutoAllResult["sourceReports"] = [];
  const multiSourceResults: MultiSourceResult[] = [];
  if (!researchEnabled) {
    return {
      safe,
      researchEnabled: false,
      dryRun: Boolean(options.dryRun),
      writes,
      sourceReports: [{ source: "hltv-research", status: "skipped", message: "ENABLE_RESEARCH_SOURCES/ENABLE_HLTV_AUTOMATION are not both true." }],
      multiSourceResults,
      nextAction: safe.nextAction
    };
  }

  const shouldResearch = safe.stillMissing.length > 0 || options.mode === "max";
  if (!shouldResearch) {
    return {
      safe,
      researchEnabled: true,
      dryRun: Boolean(options.dryRun),
      writes,
      sourceReports: [{ source: "hltv-research", status: "skipped", message: "Safe sources already covered the required private-inbox files." }],
      multiSourceResults,
      nextAction: safe.nextAction
    };
  }

  const esportis = await runEsportisResearchFetcher({
    matchId: options.matchId,
    teamNames: [options.teamA, options.teamB],
    dryRun: options.dryRun
  });
  writes.push(...esportis.writes.map((write) => ({ file: write.fileName, source: "esport.is research", rows: write.rowsInserted })));
  sourceReports.push({
    source: "esport.is-research",
    status: esportis.status,
    message: [...esportis.warnings, ...esportis.errors].join(" ") || `${Object.values(esportis.fetched).reduce((sum, value) => sum + value, 0)} normalized row(s).`
  });

  const bo3 = await runBo3Cs2ApiFetcher({
    matchId: options.matchId,
    teamNames: [options.teamA, options.teamB],
    dryRun: options.dryRun
  });
  writes.push(...bo3.writes.map((write) => ({ file: write.fileName, source: "BO3.gg cs2api research", rows: write.rowsInserted })));
  sourceReports.push({
    source: "bo3-cs2api-research",
    status: bo3.status,
    message: [...bo3.warnings, ...bo3.errors].join(" ") || `${Object.values(bo3.fetched).reduce((sum, value) => sum + value, 0)} normalized row(s).`
  });

  const resolved = options.hltvMatchId
    ? { matchId: options.hltvMatchId, matchUrl: "", score: 1 }
    : await resolveHltvMatchId({ teamA: options.teamA, teamB: options.teamB });
  if (!resolved?.matchId) {
    sourceReports.push({ source: "hltv-match-id", status: "missing", message: "No confident HLTV match ID resolved." });
  } else {
    sourceReports.push({ source: "hltv-match-id", status: "success", message: `Resolved HLTV match ID ${resolved.matchId}.` });
  }

  const parseResult = resolved?.matchId
    ? await parseHltvMatchPage({
      matchId: options.matchId,
      teamA: options.teamA,
      teamB: options.teamB,
      hltvMatchId: resolved.matchId,
      dryRun: options.dryRun
    })
    : null;
  if (parseResult) {
    writes.push(...parseResult.writes.map((write) => ({ file: write.fileName, source: "hltv-match-page", rows: write.rowsInserted })));
    sourceReports.push({
      source: "hltv-match-page",
      status: parseResult.vetoRows.length || parseResult.h2hRows.length ? "success" : "partial",
      message: `veto=${parseResult.vetoRows.length}, h2h=${parseResult.h2hRows.length}. ${parseResult.warnings.join(" ")}`
    });
  }

  const teamIds = {
    [options.teamA]: options.teamAHltvId || parseResult?.teamIds[options.teamA] || "",
    [options.teamB]: options.teamBHltvId || parseResult?.teamIds[options.teamB] || ""
  };
  for (const teamName of [options.teamA, options.teamB]) {
    const teamId = teamIds[teamName];
    if (!teamId) {
      sourceReports.push({ source: `hltv-team-${teamName}`, status: "missing", message: "No HLTV team ID available for map/player stats." });
      continue;
    }
    const maps = await fetchHltvTeamMapStats({ matchId: options.matchId, teamName, teamId, dryRun: options.dryRun });
    writes.push(...maps.writes.map((write) => ({ file: write.fileName, source: "hltv-team-maps", rows: write.rowsInserted })));
    sourceReports.push({ source: `hltv-team-maps-${teamName}`, status: maps.rows.length ? "success" : "partial", message: `map rows=${maps.rows.length}. ${maps.warnings.join(" ")}` });
    const players = await fetchHltvPlayerStats({ matchId: options.matchId, teamName, teamId, dryRun: options.dryRun });
    writes.push(...players.writes.map((write) => ({ file: write.fileName, source: "hltv-player-stats", rows: write.rowsInserted })));
    sourceReports.push({ source: `hltv-player-stats-${teamName}`, status: players.rows.length ? "success" : "partial", message: `player rows=${players.rows.length}. ${players.warnings.join(" ")}` });
  }

  const missingTypes = missingDataTypes(safe.stillMissing, options.includeH2h || options.mode === "max");
  for (const dataType of missingTypes) {
    if (dataType === "veto" || dataType === "h2h") {
      const result = await fetchMultiSourceData({
        dataType,
        matchId: options.matchId,
        teamName: options.teamA,
        opponentTeamName: options.teamB,
        hltvMatchId: resolved?.matchId,
        dryRun: options.dryRun,
        ids: {
          hltvMatch: resolved?.matchId,
          faceitMatch: "",
          eslMatch: "",
          blastMatch: "",
          gosuMatch: "",
          dust2Match: "",
          pleyMatch: ""
        }
      });
      multiSourceResults.push(result);
      writes.push(...result.writes.map((write) => ({ file: write.fileName, source: `multi-source:${dataType}`, rows: write.rowsInserted })));
      sourceReports.push({ source: `multi-source-${dataType}`, status: result.status, message: multiSourceMessage(result) });
      continue;
    }
    for (const teamName of [options.teamA, options.teamB]) {
      const result = await fetchMultiSourceData({
        dataType,
        matchId: options.matchId,
        teamName,
        opponentTeamName: teamName === options.teamA ? options.teamB : options.teamA,
        teamId: teamIds[teamName],
        hltvMatchId: resolved?.matchId,
        csstatsTeamId: teamName === options.teamA ? options.teamACsstatsId : options.teamBCsstatsId,
        dryRun: options.dryRun,
        ids: {
          hltvTeam: teamIds[teamName],
          hltvMatch: resolved?.matchId,
          csstatsTeam: teamName === options.teamA ? options.teamACsstatsId : options.teamBCsstatsId,
          liquipediaPage: teamName
        }
      });
      multiSourceResults.push(result);
      writes.push(...result.writes.map((write) => ({ file: write.fileName, source: `multi-source:${dataType}`, rows: write.rowsInserted })));
      sourceReports.push({ source: `multi-source-${dataType}-${teamName}`, status: result.status, message: multiSourceMessage(result) });
    }
  }

  if (envFlag(process.env, "ENABLE_CSSTATS_DEMO_FETCH")) {
    for (const teamName of [options.teamA, options.teamB]) {
      const demo = await fetchCsstatsDemo({ matchId: options.matchId, teamName, dryRun: options.dryRun });
      sourceReports.push({ source: `csstats-demo-${teamName}`, status: demo.status, message: demo.demoPath ? `demo=${demo.demoPath}` : demo.warnings.join(" ") });
    }
    const demoBatch = await processResearchDemoBatch({
      matchId: options.matchId,
      teamNames: [options.teamA, options.teamB],
      dryRun: options.dryRun,
      out: path.join(privateInboxPath(), "parsed_demo_export.json")
    });
    sourceReports.push({ source: "research-demo-batch", status: demoBatch.status, message: `players=${demoBatch.players}, maps=${demoBatch.maps}. ${demoBatch.warnings.join(" ")}` });
  }

  return {
    safe,
    researchEnabled: true,
    dryRun: Boolean(options.dryRun),
    writes,
    sourceReports,
    multiSourceResults,
    nextAction: writes.length
      ? "Research sources produced normalized private-inbox files. Validate in /admin/imports before Apply."
      : "Research sources did not produce usable rows; use manual CSV/paste fallback."
  };
}

function missingDataTypes(stillMissing: string[], includeH2h: boolean) {
  const types: Array<"roster" | "player_stats" | "map_stats" | "veto" | "h2h"> = [];
  if (stillMissing.includes("roster.csv")) types.push("roster");
  if (stillMissing.includes("player_stats.csv")) types.push("player_stats");
  if (stillMissing.includes("map_stats.csv")) types.push("map_stats");
  if (stillMissing.includes("veto_history.csv")) types.push("veto");
  if (includeH2h) types.push("h2h");
  return types;
}

function multiSourceMessage(result: MultiSourceResult) {
  const winner = result.sourceResults.find((source) => source.rows.length > 0);
  if (winner) return `${winner.source}: ${winner.rows.length} row(s). ${winner.warnings.join(" ")}`;
  const lastReasons = result.sourceResults.slice(-3).flatMap((source) => source.warnings.map((warning) => `${source.source}: ${warning}`));
  return lastReasons.join(" ") || result.warnings.join(" ") || "No source produced usable rows.";
}

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "dry-run") {
      parsed[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function stringArg(args: CliArgs, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function requiredArg(args: CliArgs, key: string) {
  const value = stringArg(args, key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function modeArg(value: string): AutoFillMode {
  if (value === "deeper" || value === "max") return value;
  return "fast";
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runAutoAllResearchCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
