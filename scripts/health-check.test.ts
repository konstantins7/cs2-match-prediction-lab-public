import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("health-check script", () => {
  it("scans for forbidden auto-apply and browser automation dependencies", () => {
    const source = readFileSync("scripts/health-check.ts", "utf8");
    expect(source).toContain("staticSafety");
    expect(source).toContain("--auto-apply");
    expect(source).toContain("puppeteer");
    expect(source).toContain("playwright");
  });
});
