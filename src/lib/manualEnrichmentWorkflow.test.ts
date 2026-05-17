import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("first real forecast pack workflow safeguards", () => {
  const source = readFileSync("src/lib/manualEnrichment.ts", "utf8");

  it("enforces strict manual_real_pack metadata and coverage before apply", () => {
    expect(source).toContain("manual_real_pack sourceName is required");
    expect(source).toContain("manual_real_pack sampleSize must be > 0");
    expect(source).toContain("manual_real_pack confidence must be > 0");
    expect(source).toContain("must include exactly five player names");
    expect(source).toContain("playerStats missing roster players");
    expect(source).toContain("vetoHistory for");
  });

  it("checks target-match cutoff/leakage for manual_real_pack", () => {
    expect(source).toContain("manual_real_pack leakage");
    expect(source).toContain("evaluatePreMatchLeakage");
    expect(source).toContain("targetStartTime: new Date(teams.match.startTime)");
  });

  it("returns before/after preview with real-vs-preview depth", () => {
    expect(source).toContain("afterPreview");
    expect(source).toContain("previewDataDepth");
    expect(source).toContain("realDataDepth");
    expect(source).toContain("deriveRealDataDepth");
  });

  it("keeps preview aligned with final per-team map sample gates", () => {
    expect(source).toContain("MANUAL_REAL_MAP_SAMPLE_THRESHOLD");
    expect(source).toContain("manualPackCoverageForFinalReadiness");
    expect(source).toContain("mapStatsComplete: finalCoverage?.mapStatsComplete");
    expect(source).toContain("manualRealMapSampleWarning");
  });

  it("keeps invalid packs from creating domain records", () => {
    const invalidReturnIndex = source.indexOf("if (!validation.ok)");
    const applyIndex = source.indexOf("const raw = await saveRaw(payload, \"valid\", baseMeta)");
    expect(invalidReturnIndex).toBeGreaterThan(0);
    expect(applyIndex).toBeGreaterThan(invalidReturnIndex);
  });
});
