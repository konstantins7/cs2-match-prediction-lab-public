import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AutoAllBenchmarkMatch, AutoAllBenchmarkResult } from "./benchmark-auto-all";

type CliArgs = Record<string, string | boolean>;

type SourceHitRate = {
  source: string;
  success: number;
  partial: number;
  skipped: number;
  failed: number;
};

type BenchmarkSummaryMetrics = {
  date: string;
  mode: string;
  dryRun: boolean;
  totalMatches: number;
  realForecastReadyBefore: number;
  nearlyReadyBefore: number;
  manualFallbackRequired: number;
  averageElapsedMs: number;
  topBlockers: Array<{ blocker: string; count: number }>;
  sourceHitRates: SourceHitRate[];
};

export async function runBenchmarkSummaryCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const reportPath = requiredArg(args, "report");
  const out = stringArg(args, "out");
  const report = await readBenchmarkReport(reportPath);
  const markdown = generateBenchmarkSummaryMarkdown(report);
  if (out) {
    await writeFile(out, markdown, "utf8");
  } else {
    console.log(markdown);
  }
}

export async function readBenchmarkReport(reportPath: string): Promise<AutoAllBenchmarkResult> {
  const content = await readFile(reportPath, "utf8");
  return JSON.parse(content) as AutoAllBenchmarkResult;
}

export function generateBenchmarkSummaryMarkdown(report: AutoAllBenchmarkResult) {
  const metrics = normalizeMetrics(report);
  const lines = [
    "# Benchmark Baseline for MVP 1.0.0",
    "",
    `**Date:** ${metrics.date}`,
    `**Matches analyzed:** ${metrics.totalMatches}`,
    `**Mode:** ${metrics.mode}, ${metrics.dryRun ? "dry-run" : "write-mode"}`,
    "",
    "## Overall Results",
    "",
    "| Metric | Count | Rate |",
    "|--------|-------|------|",
    `| Real Forecast Ready | ${metrics.realForecastReadyBefore} | ${rate(metrics.realForecastReadyBefore, metrics.totalMatches)} |`,
    `| Nearly Ready | ${metrics.nearlyReadyBefore} | ${rate(metrics.nearlyReadyBefore, metrics.totalMatches)} |`,
    `| Manual Fallback Required | ${metrics.manualFallbackRequired} | ${rate(metrics.manualFallbackRequired, metrics.totalMatches)} |`,
    `| Average time per match | ${metrics.averageElapsedMs} ms | - |`,
    "",
    "## Top Blockers",
    "",
    ...topBlockerLines(metrics.topBlockers),
    "",
    "## Source Hit Rates",
    "",
    "| Source | Success | Partial | Skipped | Failed |",
    "|--------|---------|---------|---------|--------|",
    ...sourceLines(metrics.sourceHitRates),
    "",
    "## Product Conclusion for 1.0.0",
    "",
    ...conclusionLines(metrics),
    ""
  ];
  return redactSecretLikeValues(`${lines.join("\n")}`);
}

function normalizeMetrics(report: AutoAllBenchmarkResult): BenchmarkSummaryMetrics {
  const matches = report.matches ?? [];
  const totalMatches = report.summary?.totalMatches ?? matches.length;
  return {
    date: safeDate(report.generatedAt),
    mode: report.mode ?? "deeper",
    dryRun: report.dryRun !== false,
    totalMatches,
    realForecastReadyBefore: report.summary?.realForecastReadyBefore ?? matches.filter((match) => match.coverageBefore.realForecastReady).length,
    nearlyReadyBefore: report.summary?.nearlyReadyBefore ?? matches.filter((match) => match.forecastabilityTier === "NEARLY_READY").length,
    manualFallbackRequired: report.summary?.manualFallbackRequired ?? matches.filter((match) => match.coverageAfterProjection.stillMissing.length > 0).length,
    averageElapsedMs: report.summary?.averageElapsedMs ?? averageElapsed(matches),
    topBlockers: (report.summary?.topBlockers ?? countTop(matches.flatMap((match) => [...match.coverageBefore.blockers, ...match.coverageAfterProjection.stillMissing]))).slice(0, 5),
    sourceHitRates: (report.summary?.sourceHitRates ?? sourceHitRates(matches)).map((entry) => ({
      source: entry.source,
      success: entry.success,
      partial: entry.partial,
      skipped: entry.skipped,
      failed: entry.failed
    }))
  };
}

function topBlockerLines(blockers: BenchmarkSummaryMetrics["topBlockers"]) {
  if (!blockers.length) return ["No blockers recorded."];
  return blockers.map((entry, index) => `${index + 1}. ${entry.blocker} (${entry.count} ${entry.count === 1 ? "match" : "matches"})`);
}

function sourceLines(sources: SourceHitRate[]) {
  if (!sources.length) return ["| No source attempts recorded | 0 | 0 | 0 | 0 |"];
  return [...sources]
    .sort((a, b) => a.source.localeCompare(b.source))
    .map((entry) => {
      const total = entry.success + entry.partial + entry.skipped + entry.failed;
      return `| ${entry.source} | ${countRate(entry.success, total)} | ${countRate(entry.partial, total)} | ${countRate(entry.skipped, total)} | ${countRate(entry.failed, total)} |`;
    });
}

function conclusionLines(metrics: BenchmarkSummaryMetrics) {
  const readyRate = rate(metrics.realForecastReadyBefore, metrics.totalMatches);
  const fallbackRate = rate(metrics.manualFallbackRequired, metrics.totalMatches);
  const topBlocker = metrics.topBlockers[0]?.blocker ?? "no recurring blocker";
  return [
    `- Auto-All baseline starts from ${readyRate} Real Forecast Ready before auto-fill attempts.`,
    `- Manual fallback remains required for ${fallbackRate} of checked matches in this dry-run benchmark.`,
    `- The most frequent blocker is: ${topBlocker}.`,
    "- MVP 1.0.0 UI should show source progress, confidence, blockers, and manual CSV fallback without promising guaranteed coverage."
  ];
}

function sourceHitRates(matches: AutoAllBenchmarkMatch[]): SourceHitRate[] {
  const counts = new Map<string, SourceHitRate>();
  for (const report of matches.flatMap((match) => match.sourceReports)) {
    const entry = counts.get(report.source) ?? { source: report.source, success: 0, partial: 0, skipped: 0, failed: 0 };
    entry[statusBucket(report.status)] += 1;
    counts.set(report.source, entry);
  }
  return [...counts.values()];
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
    .sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker));
}

function averageElapsed(matches: AutoAllBenchmarkMatch[]) {
  if (!matches.length) return 0;
  return Math.round(matches.reduce((sum, match) => sum + match.elapsedMs, 0) / matches.length);
}

function safeDate(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function rate(count: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function countRate(count: number, total: number) {
  return `${count} (${rate(count, total)})`;
}

function redactSecretLikeValues(value: string) {
  return value
    .replace(/\b(sk|pk)-[A-Za-z0-9_-]{10,}\b/g, "[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*[:=]\s*[^|\n\s]+/gi, "$1=[redacted]");
}

function parseArgs(argv: string[]) {
  const parsed: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
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
  runBenchmarkSummaryCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
