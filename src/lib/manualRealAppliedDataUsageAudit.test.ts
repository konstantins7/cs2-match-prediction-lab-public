import { describe, expect, it } from "vitest";
import { auditForecastRecordInclusion } from "./manualRealAppliedDataUsageAudit";
import { MANUAL_REAL_MAP_SAMPLE_THRESHOLD, manualRealMapSampleWarning } from "./manualRealReadinessRules";

const context = {
  matchId: "pandascore_match_1488973",
  matchTeamIds: ["team-a", "team-b"],
  cutoff: new Date("2026-05-21T18:00:00.000Z")
};

describe("manual real applied data usage audit", () => {
  it("marks clean manual_real rows as included", () => {
    const result = auditForecastRecordInclusion({
      matchId: context.matchId,
      teamId: "team-a",
      source: "manual_enrichment",
      sourceMode: "manual_real",
      dataRole: "pre_match_evidence",
      isActive: true,
      sourceRecordId: "source-record",
      importBatchId: "import-batch",
      dataLeakageCheckPassed: true,
      sourceDate: "2026-05-16T00:00:00.000Z"
    }, context);

    expect(result.included).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("reports exact exclusion and trust reasons", () => {
    const result = auditForecastRecordInclusion({
      matchId: "other-match",
      teamId: "other-team",
      source: "manual_enrichment",
      sourceMode: "manual_real",
      dataRole: "post_match_analysis",
      isActive: false,
      dataLeakageCheckPassed: false,
      sourceDate: "2026-05-22T00:00:00.000Z",
      needsReview: true
    }, context);

    expect(result.included).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "wrong matchId",
      "wrong teamId",
      "inactive",
      "dataRole not allowed for pre-match evidence",
      "leakage failed",
      "after cutoff",
      "missing sourceRecordId",
      "missing importBatchId",
      "needs_review"
    ]));
  });

  it("documents the final readiness map sample threshold", () => {
    expect(MANUAL_REAL_MAP_SAMPLE_THRESHOLD).toBe(7);
    expect(manualRealMapSampleWarning("Evo Novo", 4)).toBe("Evo Novo map sample is 4/7; final readiness remains blocked until more real map stats are provided.");
  });
});
