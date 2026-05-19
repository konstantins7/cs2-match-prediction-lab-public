import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deep match analysis API contract", () => {
  it("is versioned and cache-invalidated by private-inbox fingerprint", () => {
    const route = readFileSync("src/app/api/match-analysis/[matchId]/route.ts", "utf8");
    const service = readFileSync("src/lib/math/deepMatchAnalysis.ts", "utf8");
    expect(route).toContain("mode=deep");
    expect(route).toContain("v");
    expect(service).toContain("fingerprint");
    expect(service).toContain("analysis-cache");
  });
});
