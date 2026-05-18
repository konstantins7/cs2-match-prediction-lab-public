import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ForecastAutopilotCandidate } from "../src/lib/autoResearchShared";
import { runAutoAllBenchmark } from "./benchmark-auto-all";

const baseCandidate: ForecastAutopilotCandidate = {
  matchId: "match_1",
  href: "/match/match_1",
  eventName: "Test Cup",
  startTime: "2026-05-21T12:00:00.000Z",
  status: "upcoming",
  format: "BO3",
  teamAName: "Evo Novo",
  teamBName: "WAZABI",
  coverageScore: 74,
  maxCoverageScore: 100,
  coverageBreakdown: [],
  forecastabilityTier: "NEARLY_READY",
  forecastabilityLabel: "Почти готов",
  readinessLevel: "L3_ANALYTICAL",
  readinessRank: 3,
  realForecastReady: false,
  previewDataDepth: 3,
  realDataDepth: 2,
  dataQualityScore: 70,
  confidenceScore: 61,
  priorityScore: 80,
  priorityLabel: "high",
  selectionReason: "test",
  blockers: ["map stats sample below gate"],
  missingBlocks: ["map stats sample below gate"],
  providerContributions: [],
  nextDataActions: []
};

describe("data:benchmark-auto-all", () => {
  it("runs auto-fill in dry-run mode and writes aggregate report", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "benchmark-auto-all-"));
    try {
      const out = path.join(temp, "benchmark.json");
      const result = await runAutoAllBenchmark({
        limit: 1,
        mode: "fast",
        dryRun: true,
        out,
        now: new Date("2026-05-18T00:00:00.000Z"),
        getCandidatesImpl: async () => [baseCandidate],
        runAutoFillImpl: async (options) => {
          expect(options.dryRun).toBe(true);
          expect(options.matchId).toBe("match_1");
          return {
            dryRun: true,
            filesBefore: [],
            writes: [{ file: "map_stats.csv", source: "CSStats auto CSV", rows: 7 }],
            filesAfter: [],
            stillMissing: ["player_stats.csv", "veto_history.csv"],
            templateCommands: [],
            nextAction: "Still missing player_stats.csv, veto_history.csv.",
            sourceReports: [
              { source: "csstats-auto-map_stats", status: "success", message: "7 row(s)." },
              { source: "pandascore-enhanced", status: "skipped", message: "missing key" }
            ]
          };
        }
      });
      expect(result.summary.totalMatches).toBe(1);
      expect(result.summary.nearlyReadyBefore).toBe(1);
      expect(result.summary.manualFallbackRequired).toBe(1);
      expect(result.summary.topBlockers[0]).toEqual({ blocker: "map stats sample below gate", count: 1 });
      expect(result.summary.sourceHitRates).toContainEqual({
        source: "csstats-auto-map_stats",
        success: 1,
        partial: 0,
        skipped: 0,
        failed: 0
      });
      const saved = JSON.parse(await readFile(out, "utf8")) as typeof result;
      expect(saved.matches[0]?.coverageAfterProjection.dryRun).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("does not contain DB mutation or apply calls in benchmark source", async () => {
    const source = await readFile(path.join(process.cwd(), "scripts", "benchmark-auto-all.ts"), "utf8");
    expect(source).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(source).not.toMatch(/applyAnalyst|validateAndApply|trusted import/i);
  });
});
