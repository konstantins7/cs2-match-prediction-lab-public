import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin health page", () => {
  it("renders automation health sections and never promises automatic Apply", () => {
    const source = readFileSync("src/app/admin/health/page.tsx", "utf8");
    expect(source).toContain("Automation Health");
    expect(source).toContain("Ollama and AI");
    expect(source).toContain("Automation");
    expect(source).not.toContain("auto-apply");
  });

  it("exposes safe automation API routes", () => {
    expect(readFileSync("src/app/api/admin/automation/run-once/route.ts", "utf8")).toContain("dryRun: body.dryRun !== false");
    expect(readFileSync("src/app/api/admin/cleanup/route.ts", "utf8")).toContain("runCleanup");
  });
});
