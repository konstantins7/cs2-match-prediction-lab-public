import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local AI API contract", () => {
  it("keeps apply-local on the existing analyst-sheet Apply path", () => {
    const applyRoute = readFileSync("src/app/api/ai/apply-local/route.ts", "utf8");
    expect(applyRoute).toContain("applyAnalystSheetImport");
    expect(applyRoute).toContain("refreshForecastabilityCache");
    expect(applyRoute).toContain("ENABLE_LOCAL_AI");
    expect(applyRoute).not.toContain("applyManualEnrichment(");
  });

  it("keeps extract-local gated by local AI env", () => {
    const extractRoute = readFileSync("src/app/api/ai/extract-local/route.ts", "utf8");
    expect(extractRoute).toContain("isLocalAIEnabled");
    expect(extractRoute).toContain("inputText");
  });
});
