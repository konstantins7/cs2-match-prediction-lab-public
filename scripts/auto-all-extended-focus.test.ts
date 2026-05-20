import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("extended auto-all focus support", () => {
  it("threads focus data types from API to runner", () => {
    const route = readFileSync("src/app/api/auto-all-extended/route.ts", "utf8");
    const runner = readFileSync("scripts/auto-all-extended.ts", "utf8");
    expect(route).toContain("focusDataTypes");
    expect(route).toContain("function focus");
    expect(runner).toContain("export type FocusDataType");
    expect(runner).toContain("filterDiagnosticsByFocus");
    expect(runner).toContain("Skipped by focus");
  });
});
