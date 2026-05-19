import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hltvSlug, isAllowedHltvUrl, isResearchEnabled, researchFetchText, type ResearchFetchOptions } from "../tools/research/hltv-client";
import { redactUrl, type FetchLike, type FetcherEnv } from "../tools/data-fetchers/utils";

type CliArgs = Record<string, string | boolean>;

export type HltvDiagnosticTarget = {
  id: "search" | "match_page" | "team_a_maps" | "team_b_maps" | "team_a_players" | "team_b_players";
  label: string;
  url: string;
};

export type HltvDiagnosticEntry = {
  id: HltvDiagnosticTarget["id"];
  label: string;
  url: string;
  allowed: boolean;
  status: "disabled" | "dry_run" | "success" | "cached" | "blocked" | "failed";
  elapsedMs: number;
  bytes: number;
  warnings: string[];
};

export type HltvDiagnosticsReport = {
  generatedAt: string;
  dryRun: boolean;
  researchEnabled: boolean;
  targets: HltvDiagnosticEntry[];
  outputPath?: string;
  summary: {
    checked: number;
    success: number;
    cached: number;
    blocked: number;
    failed: number;
    disabled: number;
  };
};

export type HltvDiagnosticsOptions = ResearchFetchOptions & {
  teamA: string;
  teamB: string;
  hltvMatchId?: string;
  teamAHltvId?: string;
  teamBHltvId?: string;
  dryRun?: boolean;
  out?: string;
};

export async function runHltvDiagnostics(options: HltvDiagnosticsOptions): Promise<HltvDiagnosticsReport> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const targets = buildHltvDiagnosticTargets(options);
  const researchEnabled = isResearchEnabled(env, "ENABLE_HLTV_AUTOMATION");
  const entries: HltvDiagnosticEntry[] = [];

  for (const target of targets) {
    const started = Date.now();
    const allowed = isAllowedHltvUrl(target.url);
    if (!researchEnabled) {
      entries.push(toEntry(target, allowed, "disabled", started, 0, ["ENABLE_RESEARCH_SOURCES/ENABLE_HLTV_AUTOMATION are not both true."]));
      continue;
    }
    if (options.dryRun) {
      entries.push(toEntry(target, allowed, "dry_run", started, 0, ["Dry run: URL was checked but no request was made."]));
      continue;
    }
    if (!allowed) {
      entries.push(toEntry(target, allowed, "blocked", started, 0, ["URL is outside the HLTV research allowlist."]));
      continue;
    }
    const result = await researchFetchText(target.url, {
      env,
      fetchImpl: options.fetchImpl,
      waitImpl: options.waitImpl,
      cacheDir: options.cacheDir,
      rateLimitMs: options.rateLimitMs,
      now
    });
    entries.push(toEntry(target, allowed, result.status, started, result.body.length, result.warnings));
  }

  const report: HltvDiagnosticsReport = {
    generatedAt: now.toISOString(),
    dryRun: Boolean(options.dryRun),
    researchEnabled,
    targets: entries,
    summary: summarize(entries)
  };
  if (!options.dryRun) {
    report.outputPath = path.resolve(options.out ?? path.join("data", "research-cache", "diagnostics.json"));
    await mkdir(path.dirname(report.outputPath), { recursive: true });
    await writeFile(report.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

export function buildHltvDiagnosticTargets(options: Pick<HltvDiagnosticsOptions, "teamA" | "teamB" | "hltvMatchId" | "teamAHltvId" | "teamBHltvId">): HltvDiagnosticTarget[] {
  const targets: HltvDiagnosticTarget[] = [
    {
      id: "search",
      label: "HLTV search",
      url: `https://www.hltv.org/search?query=${encodeURIComponent(`${options.teamA} ${options.teamB}`)}`
    }
  ];
  if (options.hltvMatchId) {
    targets.push({
      id: "match_page",
      label: "HLTV match page",
      url: `https://www.hltv.org/matches/${options.hltvMatchId}/${hltvSlug(options.teamA)}-vs-${hltvSlug(options.teamB)}`
    });
  }
  if (options.teamAHltvId) {
    targets.push(...teamTargets("team_a", options.teamA, options.teamAHltvId));
  }
  if (options.teamBHltvId) {
    targets.push(...teamTargets("team_b", options.teamB, options.teamBHltvId));
  }
  return targets;
}

export async function runHltvDiagnosticsCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await runHltvDiagnostics({
    teamA: requiredArg(args, "teamA"),
    teamB: requiredArg(args, "teamB"),
    hltvMatchId: stringArg(args, "hltvMatchId") || stringArg(args, "hltv-match-id"),
    teamAHltvId: stringArg(args, "teamAHltvId") || stringArg(args, "teamA-hltv-id"),
    teamBHltvId: stringArg(args, "teamBHltvId") || stringArg(args, "teamB-hltv-id"),
    dryRun: Boolean(args["dry-run"]),
    out: stringArg(args, "out") || undefined
  });
  console.log(JSON.stringify(report, null, 2));
}

function teamTargets(prefix: "team_a" | "team_b", teamName: string, teamId: string): HltvDiagnosticTarget[] {
  const safePrefix = prefix === "team_a" ? "team_a" : "team_b";
  return [
    {
      id: `${safePrefix}_maps` as HltvDiagnosticTarget["id"],
      label: `${teamName} map stats`,
      url: `https://www.hltv.org/stats/teams/maps/${teamId}/${hltvSlug(teamName)}`
    },
    {
      id: `${safePrefix}_players` as HltvDiagnosticTarget["id"],
      label: `${teamName} player stats`,
      url: `https://www.hltv.org/stats/players?team=${encodeURIComponent(teamId)}`
    }
  ];
}

function toEntry(target: HltvDiagnosticTarget, allowed: boolean, status: HltvDiagnosticEntry["status"], started: number, bytes: number, warnings: string[]): HltvDiagnosticEntry {
  return {
    id: target.id,
    label: target.label,
    url: redactUrl(target.url),
    allowed,
    status,
    elapsedMs: Math.max(0, Date.now() - started),
    bytes,
    warnings: warnings.map(redactDiagnosticText)
  };
}

function summarize(entries: HltvDiagnosticEntry[]): HltvDiagnosticsReport["summary"] {
  return {
    checked: entries.length,
    success: entries.filter((entry) => entry.status === "success").length,
    cached: entries.filter((entry) => entry.status === "cached").length,
    blocked: entries.filter((entry) => entry.status === "blocked").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    disabled: entries.filter((entry) => entry.status === "disabled").length
  };
}

function redactDiagnosticText(value: string) {
  return value
    .replace(/([?&](?:token|key|api_key|authorization)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]");
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

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runHltvDiagnosticsCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export type { FetchLike, FetcherEnv };
