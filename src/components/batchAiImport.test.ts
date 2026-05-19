import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("BatchAiImport UI", () => {
  it("keeps ZIP parsing client-side and routes through local AI APIs", () => {
    const source = readFileSync("src/components/BatchAiImport.tsx", "utf8");
    expect(source).toContain("await import(\"jszip\")");
    expect(source).toContain("maxFiles = 50");
    expect(source).toContain("maxZipBytes = 50 * 1024 * 1024");
    expect(source).toContain("/api/ai/extract-local");
    expect(source).toContain("/api/ai/apply-local");
    expect(source).toContain("Math.min(3, queue.length)");
  });
});
