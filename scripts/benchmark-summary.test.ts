import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AutoAllBenchmarkResult } from "./benchmark-auto-all";
import { generateBenchmarkSummaryMarkdown, runBenchmarkSummaryCli } from "./benchmark-summary";

const report: AutoAllBenchmarkResult = {
  generatedAt: "2026-05-18T00:00:00.000Z",
  dryRun: true,
  mode: "deeper",
  limit: 2,
  summary: {
    totalMatches: 2,
    realForecastReadyBefore: 1,
    nearlyReadyBefore: 1,
    manualFallbackRequired: 1,
    averageElapsedMs: 234,
    topBlockers: [
      { blocker: "map stats sample below gate", count: 2 },
      { blocker: "missing veto history", count: 1 },
      { blocker: "GRID seriesId not found", count: 1 }
    ],
    sourceHitRates: [
      { source: "grid-enhanced", success: 1, partial: 0, skipped: 1, failed: 0 },
      { source: "csstats-auto-lookup", success: 0, partial: 0, skipped: 2, failed: 0 }
    ]
  },
  matches: [],
  outputPath: "data/reports/benchmark_2026-05-18.json"
};

describe("data:benchmark-summary", () => {
  it("generates deterministic markdown with counts and rates", () => {
    const markdown = generateBenchmarkSummaryMarkdown(report);
    expect(markdown).toContain("# Benchmark Baseline for MVP 1.0.0");
    expect(markdown).toContain("| Real Forecast Ready | 1 | 50% |");
    expect(markdown).toContain("| Nearly Ready | 1 | 50% |");
    expect(markdown).toContain("| Manual Fallback Required | 1 | 50% |");
    expect(markdown).toContain("1. map stats sample below gate (2 matches)");
    expect(markdown).toContain("| grid-enhanced | 1 (50%) | 0 (0%) | 1 (50%) | 0 (0%) |");
  });

  it("handles an empty report without throwing", () => {
    const markdown = generateBenchmarkSummaryMarkdown({
      ...report,
      summary: {
        totalMatches: 0,
        realForecastReadyBefore: 0,
        nearlyReadyBefore: 0,
        manualFallbackRequired: 0,
        averageElapsedMs: 0,
        topBlockers: [],
        sourceHitRates: []
      }
    });
    expect(markdown).toContain("**Matches analyzed:** 0");
    expect(markdown).toContain("| Real Forecast Ready | 0 | 0% |");
    expect(markdown).toContain("No blockers recorded.");
    expect(markdown).toContain("| No source attempts recorded | 0 | 0 | 0 | 0 |");
  });

  it("redacts secret-like values from generated markdown", () => {
    const fakeKey = ["PANDASCORE", "API", "KEY"].join("_");
    const fakeBearer = ["Bearer", "abcdefghijklmnopqrstuvwxyz"].join(" ");
    const markdown = generateBenchmarkSummaryMarkdown({
      ...report,
      summary: {
        ...report.summary,
        topBlockers: [{ blocker: `${fakeKey}=super-secret-token`, count: 1 }],
        sourceHitRates: [{ source: fakeBearer, success: 1, partial: 0, skipped: 0, failed: 0 }]
      }
    });
    expect(markdown).not.toContain("super-secret-token");
    expect(markdown).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(markdown).toContain("[redacted]");
  });

  it("writes markdown through the CLI", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "benchmark-summary-"));
    try {
      const reportPath = path.join(temp, "benchmark.json");
      const out = path.join(temp, "baseline.md");
      await writeFile(reportPath, JSON.stringify(report), "utf8");
      await runBenchmarkSummaryCli(["--report", reportPath, "--out", out]);
      const markdown = await readFile(out, "utf8");
      expect(markdown).toContain("**Date:** 2026-05-18");
      expect(markdown).toContain("## Product Conclusion for 1.0.0");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
