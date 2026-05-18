import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { getForecastAutopilotCandidates } from "../src/lib/autoResearch/candidateSelector";
import type { ForecastAutopilotCandidate } from "../src/lib/autoResearchShared";
import { prisma } from "../src/lib/prisma";
import { runAutoFill, type AutoFillMode, type AutoFillOptions, type AutoFillResult } from "../tools/auto-fill";

type CliArgs = Record<string, string | boolean>;

export type AutoAllBenchmarkMatch = {
  matchId: string;
  teams: [string, string];
  eventName: string;
  startTime: string;
  forecastabilityTier: string;
  coverageBefore: {
    score: number;
    maxScore: number;
    realForecastReady: boolean;
    blockers: string[];
  };
  coverageAfterProjection: {
    dryRun: boolean;
    projectedWrites: AutoFillResult["writes"];
    stillMissing: string[];
    nextAction: string;
  };
  sourceReports: AutoFillResult["sourceReports"];
  elapsedMs: number;
};

export type AutoAllBenchmarkResult = {
  generatedAt: string;
  dryRun: boolean;
  mode: AutoFillMode;
  limit: number;
  summary: {
    totalMatches: number;
    realForecastReadyBefore: number;
    nearlyReadyBefore: number;
    topBlockers: Array<{ blocker: string; count: number }>;
    sourceHitRates: Array<{ source: string; success: number; partial: number; skipped: number; failed: number }>;
    averageElapsedMs: number;
    manualFallbackRequired: number;
  };
  matches: AutoAllBenchmarkMatch[];
  outputPath?: string;
};

export type AutoAllBenchmarkOptions = {
  limit?: number;
  mode?: AutoFillMode;
  dryRun?: boolean;
  out?: string;
  now?: Date;
  getCandidatesImpl?: (now: Date, limit: number) => Promise<ForecastAutopilotCandidate[]>;
  runAutoFillImpl?: (options: AutoFillOptions) => Promise<AutoFillResult>;
};

export async function runAutoAllBenchmark(options: AutoAllBenchmarkOptions = {}): Promise<AutoAllBenchmarkResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, options.limit ?? 50);
  const mode = options.mode ?? "deeper";
  const dryRun = options.dryRun ?? true;
  const candidates = (await (options.getCandidatesImpl ?? getForecastAutopilotCandidates)(now, limit)).slice(0, limit);
  const matches: AutoAllBenchmarkMatch[] = [];

  for (const candidate of candidates) {
    const started = performance.now();
    const autoFill = await (options.runAutoFillImpl ?? runAutoFill)({
      matchId: candidate.matchId,
      teamNames: [candidate.teamAName, candidate.teamBName],
      mode,
      dryRun,
      targetDate: new Date(candidate.startTime)
    });
    const elapsedMs = Math.round(performance.now() - started);
    matches.push({
      matchId: candidate.matchId,
      teams: [candidate.teamAName, candidate.teamBName],
      eventName: candidate.eventName,
      startTime: candidate.startTime,
      forecastabilityTier: candidate.forecastabilityTier,
      coverageBefore: {
        score: candidate.coverageScore,
        maxScore: candidate.maxCoverageScore,
        realForecastReady: candidate.realForecastReady,
        blockers: candidate.blockers
      },
      coverageAfterProjection: {
        dryRun,
        projectedWrites: autoFill.writes,
        stillMissing: autoFill.stillMissing,
        nextAction: autoFill.nextAction
      },
      sourceReports: autoFill.sourceReports,
      elapsedMs
    });
  }

  const result: AutoAllBenchmarkResult = {
    generatedAt: now.toISOString(),
    dryRun,
    mode,
    limit,
    summary: buildSummary(matches),
    matches
  };
  result.outputPath = path.resolve(options.out ?? defaultReportPath(now));
  await writeJsonReport(result.outputPath, result);
  return result;
}

export async function runAutoAllBenchmarkCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runAutoAllBenchmark({
    limit: numberArg(args, "limit", 50),
    mode: modeArg(stringArg(args, "mode")),
    dryRun: true,
    out: stringArg(args, "out") || undefined
  });
  console.log(JSON.stringify(result, null, 2));
}

function buildSummary(matches: AutoAllBenchmarkMatch[]): AutoAllBenchmarkResult["summary"] {
  const elapsed = matches.reduce((sum, match) => sum + match.elapsedMs, 0);
  return {
    totalMatches: matches.length,
    realForecastReadyBefore: matches.filter((match) => match.coverageBefore.realForecastReady).length,
    nearlyReadyBefore: matches.filter((match) => match.forecastabilityTier === "NEARLY_READY").length,
    topBlockers: countTop(matches.flatMap((match) => [...match.coverageBefore.blockers, ...match.coverageAfterProjection.stillMissing])),
    sourceHitRates: sourceHitRates(matches),
    averageElapsedMs: matches.length ? Math.round(elapsed / matches.length) : 0,
    manualFallbackRequired: matches.filter((match) => match.coverageAfterProjection.stillMissing.length > 0).length
  };
}

function sourceHitRates(matches: AutoAllBenchmarkMatch[]) {
  const counts = new Map<string, { source: string; success: number; partial: number; skipped: number; failed: number }>();
  for (const report of matches.flatMap((match) => match.sourceReports)) {
    const entry = counts.get(report.source) ?? { source: report.source, success: 0, partial: 0, skipped: 0, failed: 0 };
    entry[statusBucket(report.status)] += 1;
    counts.set(report.source, entry);
  }
  return [...counts.values()].sort((a, b) => a.source.localeCompare(b.source));
}

function statusBucket(status: string): "success" | "partial" | "skipped" | "failed" {
  if (status === "success") return "success";
  if (status === "partial" || status === "missing") return "partial";
  if (status === "skipped" || status === "disabled" || status === "blocked") return "skipped";
  return "failed";
}

function countTop(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([blocker, count]) => ({ blocker, count }))
    .sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker))
    .slice(0, 10);
}

function defaultReportPath(now: Date) {
  return path.join("data", "reports", `benchmark_${now.toISOString().slice(0, 10)}.json`);
}

async function writeJsonReport(out: string, result: AutoAllBenchmarkResult) {
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
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

function numberArg(args: CliArgs, key: string, fallback: number) {
  const value = Number(stringArg(args, key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function modeArg(value: string): AutoFillMode {
  if (value === "fast" || value === "max") return value;
  return "deeper";
}

function isDirectRun(metaUrl: string) {
  const entry = process.argv[1];
  return Boolean(entry && metaUrl === pathToFileURL(path.resolve(entry)).href);
}

if (isDirectRun(import.meta.url)) {
  runAutoAllBenchmarkCli()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
